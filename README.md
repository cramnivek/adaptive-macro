# adaptive-macros

A local-first nutrition tracker with an **adaptive TDEE engine**: it infers your
actual energy expenditure from your logged intake and your weight trend, then
sets calorie and macro targets from that estimate instead of from a BMR formula.

No subscription, no account, no server. Your data stays on your phone.

---

## Why this exists

Calorie apps that hand you a target from a BMR equation are guessing from
population averages. The interesting problem — the one paid apps charge for — is
working backwards from what actually happened to you:

> Given what you ate and how your weight moved, what must your expenditure have
> been?

That question has a clean answer, and this repo implements it.

## How the estimator works

There is exactly one equation linking expenditure to anything observable:

```
Δ(body mass) = (intake − expenditure) / kcalPerKgTissue
```

Expenditure is never measured. So treat it as a hidden state and let a linear
Kalman filter infer it:

```
state        x = [ trendWeightKg , expenditureKcal ]

transition   w' = w + (intake − E) / rho        rho = 7700 kcal per kg
             E' = E                 + process noise

observation  scale reading = w + noise
```

Two things fall out of this for free:

- **Expenditure adapts.** Metabolic adaptation, NEAT drifting down in a deficit,
  a new training block — none of it is modelled by name. It shows up as the
  state the filter must move to in order to keep explaining your data.
- **Scale noise is separated from real change.** Water, glycogen and gut
  contents live in the measurement noise term. Only the part of a swing that
  persists moves your trend weight.

The measurement is a single scalar (one scale reading), so the Kalman gain is a
division rather than a matrix inverse. The whole filter is ~100 lines with zero
dependencies, in [`packages/engine/src/kalman.ts`](packages/engine/src/kalman.ts).

Covariance updates use the Joseph form, which costs two extra matrix products
but stays symmetric and positive-definite under floating-point drift — this
filter runs over years of daily data without ever being restarted.

### Missing data

Both inputs go missing constantly in real use, and the filter handles each
differently:

| Situation | What the filter does |
|---|---|
| No weigh-in that day | Predict-only step. Uncertainty grows, which is correct — you know less. |
| No food logged that day | Transition becomes the identity and extra weight process noise is added. An unlogged day carries *no* information linking weight to energy, so the filter widens rather than assuming. |
| Intake logged before any weigh-in | Dropped. With no scale anchor there is nothing to reconcile against. |

### How accurate is it, really

`packages/engine/test/sensitivity.test.ts` measures what happens when the
model's assumptions are wrong, rather than only when they hold. Numbers below
are from that suite, on a simulated 120-day history with a true expenditure of
2800 kcal.

**The energy density of tissue is the largest standing error.** 7700 kcal/kg
assumes the weight you lose is mostly fat. Early in a diet it is substantially
glycogen and its bound water, which is far cheaper. The bias is exactly
`(rate of weight change) × (true density − assumed density)`:

| If tissue is really… | Estimated expenditure | Error |
|---|---|---|
| 5000 kcal/kg (glycogen-heavy) | 3031 | **+231** |
| 6000 kcal/kg | 2903 | +103 |
| 7700 kcal/kg (assumed) | 2762 | −38 |
| 9000 kcal/kg | 2690 | −110 |

Crucially it **scales with how fast you are changing**. With tissue truly at
6000: at maintenance the error is −38 kcal; at −0.35 kg/week it is +47; at
−0.93 kg/week it is +188. Fast loss is when the estimate is least trustworthy,
which is the opposite of most people's intuition.

**Under-reporting your intake barely matters, which is the design working.**
The same biased instrument sets the target and measures compliance, so the
error cancels:

| Under-logging | Estimated expenditure | Deficit actually achieved |
|---|---|---|
| 0% | 2762 | 538 |
| 10% | 2532 | 542 |
| 20% | 2303 | 546 |

Every figure on screen is wrong by 20% in the last row, and the user still
loses weight at the intended rate. No fixed-formula calculator can do that.

**The stated uncertainty is optimistic when water weight persists.** The filter
assumes each scale reading errs independently; real water and glycogen shifts
last for days. With errors correlated at 0.8, the true error reaches twice the
±80 kcal the app reports. The confidence figure is a lower bound, not a
guarantee.

**The cold start matters for about a month, not two weeks.** Seeds 1200 kcal
apart, and what you would actually have been told on each day:

| Seed | Day 7 | Day 14 | Day 28 | Day 60 |
|---|---|---|---|---|
| 2200 | 2123 | 2314 | 2547 | 2784 |
| 2800 | 2617 | 2583 | 2625 | 2799 |
| 3400 | 3111 | 2852 | 2703 | 2814 |

For scale, the activity multiplier alone spans 2181–3453 kcal for the same
person, so picking the wrong one is a ~1200 kcal error on day one. It is gone
by two months and small by four weeks — but "about two weeks", which the app's
own copy says, is optimistic. Trust the confidence indicator over the calendar.

### What it cannot do

Stated plainly, because a confident wrong number is worse than a missing one:

- **It believes your food log.** Systematic under-reporting is mathematically
  indistinguishable from a low expenditure. Garbage in, confidently-wrong TDEE out.
- **`kcalPerKgTissue` is a constant here** (7700 kcal/kg). Real tissue change is
  a shifting mix of fat, lean mass and water, so a wrong value biases the
  estimate proportionally. It is configurable.
- **It needs roughly two weeks of data** before the estimate is worth acting on.
  Check `expenditureSdKcal` rather than guessing — `expenditureConfidence()`
  buckets it for display.

## Targets

Once expenditure is known, the calorie target is arithmetic:

```
target = expenditure − (goalRateKgPerWeek × 7700 / 7)
```

with guardrails. The requested rate is a *request*: it gets capped at 25% of
expenditure for a deficit, 20% for a surplus, and by an absolute calorie floor.
`achievableRateKgPerWeek` reports what the clamped target will actually produce,
so the UI can show the real number rather than the one that was asked for.

Macros split protein → fat → carbohydrate as the remainder. Protein and fat both
have floors worth defending; carbohydrate is the flexible fuel. If the floors
together exceed the budget, they are scaled down proportionally and the
`macroFloorsExceedBudget` clamp is reported — the plan never returns macros that
contradict its own calorie target.

## Food data

Two free sources, no API of our own:

- **[Open Food Facts](https://world.openfoodfacts.org/)** — ~3M packaged
  products, barcode lookup by UPC/EAN. Searchable per country: set
  `foodCountry` to `ph`, `jp`, `gb` and the local market's view is searched
  first, which is where local brands live — the global view often misses them
  entirely. Barcodes always resolve against the global view, since a barcode
  identifies one product worldwide. Crowd-sourced, so entries are often
  internally inconsistent. `isNutritionallyConsistent()` cross-checks a food's
  stated calories against its own macros and flags suspects **to the user**
  rather than silently correcting them: the database might be right about
  calories and wrong about a macro, and guessing which would be inventing data.
- **[USDA FoodData Central](https://fdc.nal.usda.gov/)** — authoritative macros
  for whole and generic foods. Needs a free API key.

Everything is normalised to a per-100 g basis on the way in, so portion maths is
a single multiply everywhere instead of a per-food special case.

## The app

Expo / React Native, four tabs:

- **Today** — calorie ring and macro bars against the adaptive target, diary
  grouped by meal, add by search, barcode or description. Tap an entry to
  change its portion, quick-add bare calories for things no database has, or
  copy a previous day's meals onto this one.
- **Weight** — log a weigh-in, see raw readings as dots against the filtered
  trend line, 14-day rate.
- **Trends** — expenditure over time with its uncertainty band, how confident
  the estimate currently is, goal projection, and a plain-English explanation of
  where the number comes from.
- **Settings** — profile, goal and rate, macro policy, units, USDA key, model
  tuning knobs, and JSON export. Development builds also get a demo-data card
  that generates four months of synthetic history, so the charts and the
  expenditure estimate have something to show before you have logged that long.

Meals can also be described in plain words — "two scrambled eggs in butter,
sourdough toast, flat white" — and a model estimates the macros. Searching a
database for every component of a real meal is the slowest part of tracking and
the reason people stop.

**This runs on a local model by default**, through Ollama, so it needs no API
key, costs nothing and sends nothing off the machine. A hosted Claude model is
available as an alternative for anyone who wants it. Which one is a setting;
nothing else in the app knows which ran.

The estimate is presented as Claude's, not as fact. Every item carries the
assumption behind it and a confidence, portions are editable before anything is
logged, and the app never quietly adjusts the numbers afterwards. The API cost
of each estimate is shown. It runs on your own Anthropic API key, entered in
Settings and stored on the device — so it is off until you add one.

### What the eval found

`evals/meal-estimation/` measures this rather than leaving it to instinct.
Measured on qwen2.5:32b through Ollama, 8 meals × 3 reps:

| Tier | Calories right | Mean bias |
|---|---|---|
| Precise — exact quantities given | 15/15 | −2.5% |
| Vague — "fish and chips at the pub" | 3/9 | −10.9% |

So a local model is genuinely good at weighed food and underestimates composed
restaurant dishes, undershooting every rep of both failures.

The bias *pattern* matters more than its size here, and this is specific to how
the estimator works. A **consistent** logging bias cancels out completely: if
intake is always under-reported by X, the filter infers an expenditure X lower,
sets a target X lower, and the user — logging with the same biased instrument —
still lands on the intended deficit. What does not cancel is a bias that
*varies*, because it depends on how the meal happened to be phrased rather than
on anything real. −2.5% on precise and −11% on vague is exactly that kind of
inconsistency.

Two caveats on the numbers. There is no frontier-model control run, so a vague
case failing could mean the model undershot or that this repo's plausible range
is set too high — the fish-and-chips lower bound is the one most open to that
challenge. And 8 cases leaves a noise floor around ±20 points, so treat a
one-case difference as a tie.

On Claude Opus 5, for comparison, a meal costs roughly 1.4–4p of API usage,
about $2.60 a month at three meals a day.

Foods the databases do not carry — homemade, local, sold loose — can be entered
by hand, per 100 g or per serving. If the calories you type disagree with the
macros you type by more than 15%, it says so and offers the implied figure,
but never applies it for you: the label might be right and a macro mistyped,
and guessing which would invent a number.

Storage is SQLite on the device, migrated on `PRAGMA user_version`. There is no
account and no server, so the JSON export is the only backup and the only path
to a new phone.

## Layout

```
packages/engine/     Pure TypeScript. No React Native, no I/O, fully tested.
  src/kalman.ts        Linear Kalman filter, scalar measurement
  src/expenditure.ts   The adaptive TDEE model
  src/trend.ts         Weight trend rate and goal projection
  src/targets.ts       Calorie and macro target maths
  src/foods.ts         Food model, portion scaling, consistency checks
  src/dates.ts         DST-safe calendar day arithmetic

mobile/              Expo app (SDK 57, expo-router, React Native 0.86)
  app/                 Routes: tabs, food search modal, barcode scanner modal
  src/db/              SQLite schema, migrations and queries
  src/api/             Open Food Facts and USDA clients
  src/state/           Settings and the store that re-runs the filter
  src/components/      Chart, macro rings and bars, form controls
```

The engine is deliberately free of app dependencies — it is testable against
synthetic data with a known ground truth, which is the only way to know the
filter is right. `test/helpers.ts` simulates a person with a known true TDEE
behind noisy scale readings; the tests assert the filter recovers it.

## Usage

```ts
import {
  estimateExpenditure,
  DEFAULT_MODEL_OPTIONS,
  seedExpenditure,
  buildProgram,
  trendRate,
} from '@adaptive-macros/engine';

const profile = { sex: 'male', age: 32, heightCm: 180 } as const;

const { series, latest } = estimateExpenditure(observations, {
  ...DEFAULT_MODEL_OPTIONS,
  initialExpenditureKcal: seedExpenditure(profile, 85, 'moderate'),
});

const program = buildProgram(
  latest.expenditureKcal,
  latest.trendWeightKg,
  { direction: 'lose', rateKgPerWeek: 0.5 },
);

program.calories.kcal;      // e.g. 2250
program.macros;             // { proteinG, carbsG, fatG, split, clamps }
trendRate(series, 14);      // actual kg/week over the last two weeks
```

## Development

```bash
npm install
npm test           # 70 tests, including ground-truth recovery of a known TDEE
npm run typecheck  # engine and app
npm run web        # runs in a browser at localhost:8081 — no phone needed
npm start          # Expo dev server; open in Expo Go or a dev build
```

### On a phone, over your own network

No build and no developer account needed — Expo Go loads the JavaScript from
your computer over the LAN.

1. Install **Expo Go** from the App Store or Play Store.
2. Put the phone and the computer on the same Wi-Fi. A guest network or one
   with client isolation will not work; the phone has to be able to reach the
   computer directly.
3. `npm start` on the computer, then scan the QR code — iOS with the Camera
   app, Android from inside Expo Go.

Everything works there, barcode scanning included. The database is the phone's
own, separate from the browser's.

**To use the local model from the phone**, Ollama needs to accept connections
from off the machine, which it does not by default:

```powershell
# PowerShell, on the computer running Ollama
$env:OLLAMA_HOST = "0.0.0.0:11434"
ollama serve
```

The app then finds it by itself: with no saved address it points at whichever
machine served the bundle, which is the same machine running Ollama. If the
address ever goes stale — a new DHCP lease gives the computer a different IP —
Settings shows a button with the freshly detected one.

Windows Firewall will prompt the first time; allow it on private networks. If
it was dismissed, port 11434 has to be opened by hand.

### Trying it without a phone

`npm run web` is the quickest way to see it. It runs the real app through
React Native Web, and SQLite runs as WebAssembly in the browser, so logging and
persistence behave the same as on device — data survives a reload and lives in
that browser profile.

Barcode scanning is the exception: it needs a native camera, so use Expo Go or
a development build for that.

If you add a package that ships a `.wasm` asset, note `metro.config.js` has to
register the extension with Metro or the web bundle will fail to resolve it.

The app is a workspace member and imports the engine directly from TypeScript
source, so editing the engine hot-reloads the app. `mobile/metro.config.js`
carries the monorepo resolver setup that makes that work.

## Status

The engine is complete and tested: 70 tests pass, including recovery of a known
ground-truth TDEE from simulated noisy data.

All three platforms bundle: `expo export` succeeds for web, iOS and Android.
The Android and iOS bundles have been built but not yet run on a device.

The app has been run in a browser via React Native Web and driven end to end:
all four tabs render, a weigh-in writes to SQLite and survives a page reload,
and the console is clean. The targets it displays match the engine by hand —
the default profile seeds 2740 kcal, and a 0.5 kg/week goal renders 2190 kcal
with 144 g protein.

The charts have since been driven against four months of seeded history and
screenshotted: the weight trend renders as a filtered line through the raw
readings, and expenditure renders with its uncertainty band. Creating a custom
food, logging it and finding it again by search were each exercised end to end
in the browser.

Still **unverified**: any real iOS or Android device or simulator (none was
available where it was built) and barcode scanning, which needs a native
camera.

Known web-only limitation: SQLite runs on OPFS, which permits a single
connection, so the app expects one tab. Opening a second tab against the same
browser profile will fail to open the database. On a device this does not apply.

The Claude call goes straight from the device to api.anthropic.com, which means
the key lives in the client. That is a deliberate trade for a local-first app
with no server: it is your key, on your device, and it never goes anywhere else.
It is stored unencrypted alongside the rest of the data, so anyone who can open
that browser profile or phone can read it. Use a key you are willing to rotate,
and do not put one in on a shared machine. **This is not a pattern to copy into
anything you distribute** — a key shipped inside a product is a key given away.

Verified: the request is constructed and sent (`POST /v1/messages`), and every
failure path maps to a readable message. **Not** verified: a successful
response and its parsing, which needs a real key — the environment this was
built in has none and blocks the endpoint.

Not built yet: recipes and multi-ingredient foods, editing or deleting a custom
food once saved, backup *import* (export works), a weekly coached check-in that
explains why the target moved (targets currently update continuously, which is
noisier than it needs to be), and an onboarding flow — `settings.onboarded`
exists but nothing reads it yet.

## License

MIT
