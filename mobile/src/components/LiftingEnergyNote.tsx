import type { LiftingEnergy } from '@adaptive-macros/engine';
import { StyleSheet, Text, View } from 'react-native';
import { font, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';

/**
 * A session's rough energy cost, said once and with its limits: a range, an
 * estimate, and not something to eat back. The measured expenditure already
 * includes every session, so offering this as a credit would count it twice.
 */
export const LiftingEnergyNote = ({ energy }: { energy: LiftingEnergy }) => (
  <View style={styles.wrap}>
    <Text style={styles.figure}>
      About {energy.lowKcal.toLocaleString('en-US')}–{energy.highKcal.toLocaleString('en-US')} kcal
      <Text style={styles.label}> burned above resting</Text>
    </Text>
    <Text style={styles.note}>
      An estimate from the session's length and your weight. Your measured burn already includes it, so it is not
      added to your calories.
    </Text>
  </View>
);

const styles = StyleSheet.create({
  wrap: { gap: 2, marginTop: space.md },
  figure: { fontFamily: font.figure, fontSize: 15, color: loud.figure },
  label: { fontFamily: font.ui, fontSize: 13, color: loud.figureMuted },
  note: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, color: loud.figureMuted },
});
