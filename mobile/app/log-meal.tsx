import type { Meal } from '@adaptive-macros/engine';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
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
      <Card variant="featured" tone="food" title="AI meal estimate" icon="restaurant-outline">
        <Text style={[styles.description, { color: colors.textMuted }]}>
          AI estimates the foods and portions. Adjust anything before adding it to your diary.
        </Text>
        <View style={styles.actions}>
          <Button label="Take a photo" icon="camera-outline" onPress={() => router.replace({ pathname: '/describe', params: { meal, capture: 'camera' } })} />
          <Button label="Describe your meal" icon="create-outline" variant="subtle" onPress={() => router.replace({ pathname: '/describe', params: { meal } })} />
          <Text style={[styles.example, { color: colors.textMuted }]}>
            Try “Chicken rice, extra chicken, half the rice.”
          </Text>
        </View>
      </Card>
      <Card title="Other ways to log">
        <Text style={[styles.description, { color: colors.textMuted }]}>Have a label or know the food?</Text>
        <View style={styles.alternatives}>
          <Button label="Scan a barcode" icon="barcode-outline" variant="subtle" onPress={() => router.replace({ pathname: '/scan', params: { meal } })} />
          <Button label="Search foods" icon="search-outline" variant="subtle" onPress={() => router.replace({ pathname: '/search', params: { meal } })} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  meal: { fontFamily: font.uiStrong, fontSize: 13, marginBottom: space.sm },
  title: { fontFamily: font.uiStrong, fontSize: 26, lineHeight: 33, letterSpacing: -0.6, marginBottom: space.xl },
  description: { fontFamily: font.ui, fontSize: 14, lineHeight: 21 },
  actions: { gap: space.xs, marginTop: space.lg },
  alternatives: { marginTop: space.md },
  example: { fontFamily: font.ui, fontSize: 13, lineHeight: 19, marginTop: space.xs },
});
