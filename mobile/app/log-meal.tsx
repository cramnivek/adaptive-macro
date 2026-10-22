import type { Meal } from '@adaptive-macros/engine';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../src/components/Controls';
import { Screen } from '../src/components/Screen';
import { MEAL_LABELS } from '../src/format';
import { font, space, useTheme } from '../src/theme';

export default function LogMealScreen() {
  const { meal: requestedMeal } = useLocalSearchParams<{ meal?: string }>();
  const meal: Meal = requestedMeal === 'breakfast' || requestedMeal === 'lunch' || requestedMeal === 'dinner'
    ? requestedMeal
    : 'snack';
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Screen topInset={false}>
      <Text style={[styles.meal, { color: colors.textMuted }]}>{MEAL_LABELS[meal]}</Text>
      <Text style={[styles.title, { color: colors.text }]}>Photo or words. You check the estimate.</Text>
      <Text style={[styles.description, { color: colors.textMuted }]}>
        AI estimates the foods and portions. Adjust anything before adding it to your diary.
      </Text>
      <View style={styles.actions}>
        <Button label="Take a photo" onPress={() => router.replace({ pathname: '/describe', params: { meal, capture: 'camera' } })} />
        <Button label="Describe your meal" onPress={() => router.replace({ pathname: '/describe', params: { meal } })} />
        <Text style={[styles.example, { color: colors.textMuted }]}>
          Try “Chicken rice, extra chicken, half the rice.”
        </Text>
      </View>
      <View style={styles.actions}>
        <Text style={[styles.description, { color: colors.textMuted }]}>Have a label or know the food?</Text>
        <Button label="Scan a barcode" variant="subtle" onPress={() => router.replace({ pathname: '/scan', params: { meal } })} />
        <Button label="Search foods" variant="subtle" onPress={() => router.replace({ pathname: '/search', params: { meal } })} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meal: { fontFamily: font.uiStrong, fontSize: 13, marginBottom: space.sm },
  title: { fontFamily: font.display, fontSize: 26, marginBottom: space.md },
  description: { fontFamily: font.ui, fontSize: 14, lineHeight: 21 },
  actions: { gap: space.sm, marginTop: space.xl },
  example: { fontFamily: font.ui, fontSize: 13, lineHeight: 19, marginTop: space.xs },
});
