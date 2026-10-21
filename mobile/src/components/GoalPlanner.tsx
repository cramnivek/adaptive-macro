import { addDays, lbToKg, paceForGoal, todayISO, type GoalPace } from '@adaptive-macros/engine';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayWeight, formatDateLong, formatRate, weightUnit } from '../format';
import type { UnitSystem } from '../state/settings';
import { font, space, useTheme } from '../theme';
import { Field, Segmented } from './Controls';

/** How far out a goal can be set: chips rather than a typed date, which is quicker and cannot be mistyped. */
const WEEKS = ['8', '12', '16', '24'] as const;
type Weeks = (typeof WEEKS)[number];

export interface GoalPlan {
  goalWeightKg: number;
  /** The weeks asked for, so the pace can be worked out again from a corrected current weight. */
  weeks: number;
  pace: GoalPace;
}

/**
 * A goal as a weight and a date, turned into the weekly rate the targets run on.
 *
 * People think in "75 kg by March", not in kilos a week, and the rate alone
 * never said when anything would happen. The date shown is always worked out
 * from the weight and the rate, so the two cannot disagree; when the date asks
 * for a pace faster than `paceForGoal` allows, the planner says so and shows
 * the date the sensible pace really reaches instead.
 */
export const GoalPlanner = ({
  currentKg,
  units,
  initialGoalKg,
  onPlan,
}: {
  currentKg: number | null;
  units: UnitSystem;
  initialGoalKg: number | null;
  onPlan: (plan: GoalPlan | null) => void;
}) => {
  const { colors } = useTheme();
  const [goalStr, setGoalStr] = useState(
    initialGoalKg !== null ? String(Math.round(displayWeight(initialGoalKg, units) * 10) / 10) : '',
  );
  const [weeks, setWeeks] = useState<Weeks>('12');

  const goalNum = Number.parseFloat(goalStr.replace(',', '.'));
  const goalKg = Number.isFinite(goalNum) && goalNum > 0 ? (units === 'metric' ? goalNum : lbToKg(goalNum)) : null;
  const pace = currentKg !== null && goalKg !== null ? paceForGoal(currentKg, goalKg, Number(weeks)) : null;

  const tell = (nextGoalKg: number | null, nextWeeks: Weeks) => {
    if (currentKg === null || nextGoalKg === null) {
      onPlan(null);
      return;
    }
    onPlan({
      goalWeightKg: nextGoalKg,
      weeks: Number(nextWeeks),
      pace: paceForGoal(currentKg, nextGoalKg, Number(nextWeeks)),
    });
  };

  const parse = (text: string) => {
    const n = Number.parseFloat(text.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? (units === 'metric' ? n : lbToKg(n)) : null;
  };

  return (
    <View>
      <Field
        label="Goal weight"
        value={goalStr}
        onChangeText={(text) => {
          setGoalStr(text);
          tell(parse(text), weeks);
        }}
        keyboardType="decimal-pad"
        suffix={weightUnit(units)}
        placeholder={currentKg !== null ? String(Math.round(displayWeight(currentKg, units))) : undefined}
      />
      <Segmented<Weeks>
        label="Reach it in"
        value={weeks}
        onChange={(next) => {
          setWeeks(next);
          tell(goalKg, next);
        }}
        options={WEEKS.map((w) => ({ value: w, label: `${w} wk` }))}
      />
      {pace && pace.direction !== 'maintain' && (
        <Text style={[styles.result, { color: pace.capped ? colors.warning : colors.textMuted }]}>
          {pace.capped
            ? `That is faster than is worth planning for. At ${formatRate(
                pace.direction === 'lose' ? -pace.rateKgPerWeek : pace.rateKgPerWeek,
                units,
              )}, the most that keeps ${pace.direction === 'lose' ? 'muscle' : 'the gain mostly muscle'}, you get there around ${formatDateLong(
                addDays(todayISO(), pace.weeks * 7),
              )}.`
            : `${formatRate(pace.direction === 'lose' ? -pace.rateKgPerWeek : pace.rateKgPerWeek, units)}, reaching it around ${formatDateLong(
                addDays(todayISO(), pace.weeks * 7),
              )}.`}
        </Text>
      )}
      {pace && pace.direction === 'maintain' && (
        <Text style={[styles.result, { color: colors.textMuted }]}>That is where you are now, so the plan is to hold it.</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  result: { fontFamily: font.ui, fontSize: 13, lineHeight: 19, marginTop: space.xs },
});
