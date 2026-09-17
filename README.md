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

## Layout

```
packages/engine/     Pure TypeScript. No React Native, no I/O, fully tested.
  src/kalman.ts        Linear Kalman filter, scalar measurement
  src/expenditure.ts   The adaptive TDEE model
  src/trend.ts         Weight trend rate and goal projection
  src/targets.ts       Calorie and macro target maths
  src/foods.ts         Food model, portion scaling, consistency checks
  src/dates.ts         DST-safe calendar day arithmetic
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
npm test         # 51 tests, including ground-truth recovery of a known TDEE
npm run typecheck
```

## Status

The engine is complete and tested. The Expo app is in progress.

## License

MIT
