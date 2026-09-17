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
  products, barcode lookup by UPC/EAN. Crowd-sourced, so entries are often
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
  grouped by meal, add by search or barcode.
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
sourdough toast, flat white" — and Claude estimates the macros. Searching a
database for every component of a real meal is the slowest part of tracking and
the reason people stop.

The estimate is presented as Claude's, not as fact. Every item carries the
assumption behind it and a confidence, portions are editable before anything is
logged, and the app never quietly adjusts the numbers afterwards. The API cost
of each estimate is shown. It runs on your own Anthropic API key, entered in
Settings and stored on the device — so it is off until you add one.

On Claude Opus 5 a meal costs roughly 1.4–4p of API usage depending on how much
it has to work out, which is about $2.60 a month at three meals a day. Cheaper
models are a fraction of that, and `evals/meal-estimation/` measures whether
they are accurate enough to use.

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
npm test           # 51 tests, including ground-truth recovery of a known TDEE
npm run typecheck  # engine and app
npm run web        # runs in a browser at localhost:8081 — no phone needed
npm start          # Expo dev server; open in Expo Go or a dev build
```

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

The engine is complete and tested: 51 tests pass, including recovery of a known
ground-truth TDEE from simulated noisy data.

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
food once saved, backup *import* (export works), and an onboarding flow —
`settings.onboarded` exists but nothing reads it yet.

## License

MIT
