import { useRouter, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../src/components/Screen';
import { Tappable } from '../src/components/Tappable';
import { font, radius, space, useTheme } from '../src/theme';

export default function PrivacyPolicyScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  return (
    <Screen
      title="PRIVACY POLICY"
      subtitle="Ascend • Transparent, Local-First"
      action={
        <Tappable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </Tappable>
      }
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.contentWrap}>
        <Text style={[styles.lastUpdated, { color: colors.textFaint }]}>
          Last updated: October 18, 2026
        </Text>

        <View style={[styles.calloutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.calloutTitle, { color: colors.text }]}>THE SHORT VERSION</Text>
          <Text style={[styles.bullet, { color: colors.text }]}>
            • <Text style={styles.bold}>Local-first by design:</Text> Your food diary, scale weight, body measurements, workouts, routines, and settings live strictly on your device.
          </Text>
          <Text style={[styles.bullet, { color: colors.text }]}>
            • <Text style={styles.bold}>No account required:</Text> An account is completely optional and only needed to share workouts with friends or join Training Squads.
          </Text>
          <Text style={[styles.bullet, { color: colors.text }]}>
            • <Text style={styles.bold}>AI & External queries:</Text> Photos or text sent for AI meal estimation or food searches are processed on-demand and never stored to train models.
          </Text>
          <Text style={[styles.bullet, { color: colors.text }]}>
            • <Text style={styles.bold}>No ads or data brokers:</Text> Zero third-party trackers, zero advertising SDKs, and zero selling of personal metrics.
          </Text>
        </View>

        {/* Section 1 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>1. What stays on your device</Text>
          <Text style={[styles.paragraph, { color: colors.textMuted }]}>
            Your entire historical log—including meals, macros, daily weight readings, body circumferences, custom routines, exercise history, and personal preferences—is stored locally in an embedded SQLite database on your device (or in your browser's private local storage on web).
          </Text>
          <Text style={[styles.paragraph, { color: colors.textMuted }]}>
            We have no access to this database. You can export a full JSON backup of your data at any time from Settings → Your Data. Clearing app data or browser cache without a backup will erase this information.
          </Text>
        </View>

        {/* Section 2 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>2. If you create an account</Text>
          <Text style={[styles.paragraph, { color: colors.textMuted }]}>
            If you choose to create an account for social features or Training Squads, we securely store:
          </Text>
          <Text style={[styles.subBullet, { color: colors.textMuted }]}>
            • <Text style={styles.bold}>Email address:</Text> Used exclusively to send passwordless sign-in magic codes.
          </Text>
          <Text style={[styles.subBullet, { color: colors.textMuted }]}>
            • <Text style={styles.bold}>Profile information:</Text> Your chosen username, display name, and avatar/bio.
          </Text>
          <Text style={[styles.subBullet, { color: colors.textMuted }]}>
            • <Text style={styles.bold}>Shared workouts & squad activity:</Text> Summaries of workouts you choose to publish (duration, volume, best sets) and squad cheers.
          </Text>
          <Text style={[styles.paragraph, { color: colors.textMuted, marginTop: space.xs }]}>
            Account data is hosted by Supabase with server-side Row Level Security (RLS) enforcement. You may delete your account and all associated posts at any time under Settings → Account → Delete Account.
          </Text>
        </View>

        {/* Section 3 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>3. External Services & AI</Text>
          <Text style={[styles.paragraph, { color: colors.textMuted }]}>
            Ascend integrates with trusted third-party providers strictly on-demand when you explicitly invoke specific tools:
          </Text>
          <View style={[styles.tableCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.tableRow}>
              <Text style={[styles.tableColHeader, { color: colors.text }]}>Feature</Text>
              <Text style={[styles.tableColHeader, { color: colors.text }]}>Data Sent</Text>
              <Text style={[styles.tableColHeader, { color: colors.text }]}>Provider</Text>
            </View>
            <View style={styles.tableDivider} />
            <View style={styles.tableRow}>
              <Text style={[styles.tableCol, { color: colors.text }]}>Meal Description / Photo</Text>
              <Text style={[styles.tableCol, { color: colors.textMuted }]}>Meal text or photo</Text>
              <Text style={[styles.tableCol, { color: colors.textMuted }]}>Google Gemini AI (via proxy)</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={[styles.tableCol, { color: colors.text }]}>Barcode / Food Search</Text>
              <Text style={[styles.tableCol, { color: colors.textMuted }]}>Barcode or query</Text>
              <Text style={[styles.tableCol, { color: colors.textMuted }]}>Open Food Facts & USDA</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={[styles.tableCol, { color: colors.text }]}>Custom API Keys</Text>
              <Text style={[styles.tableCol, { color: colors.textMuted }]}>User queries</Text>
              <Text style={[styles.tableCol, { color: colors.textMuted }]}>Anthropic Claude / Ollama</Text>
            </View>
          </View>
          <Text style={[styles.paragraph, { color: colors.textMuted, marginTop: space.sm }]}>
            Our Cloud Run proxy service handles rate limiting and token authentication without saving or logging your meal photos or food contents.
          </Text>
        </View>

        {/* Section 4 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>4. Device Permissions</Text>
          <Text style={[styles.paragraph, { color: colors.textMuted }]}>
            Ascend requests only essential device permissions:
          </Text>
          <Text style={[styles.subBullet, { color: colors.textMuted }]}>
            • <Text style={styles.bold}>Camera:</Text> Required only when scanning food barcodes or capturing meal photos.
          </Text>
          <Text style={[styles.subBullet, { color: colors.textMuted }]}>
            • <Text style={styles.bold}>Photo Library:</Text> Required only when selecting an existing photo for meal estimation or workout share cards.
          </Text>
        </View>

        {/* Section 5 */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>5. Contact & Data Inquiries</Text>
          <Text style={[styles.paragraph, { color: colors.textMuted }]}>
            If you have any questions about this Privacy Policy or wish to request data deletion assistance, please contact us at support@adaptive-macros.app or open an issue on our GitHub repository.
          </Text>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contentWrap: {
    paddingBottom: space.xxl,
    gap: space.lg,
  },
  lastUpdated: {
    fontFamily: font.figure,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  calloutCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    gap: space.xs,
  },
  calloutTitle: {
    fontFamily: font.display,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  bullet: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  subBullet: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
    marginLeft: space.sm,
    marginBottom: 4,
  },
  bold: {
    fontWeight: '700',
  },
  section: {
    gap: space.xs,
  },
  sectionTitle: {
    fontFamily: font.display,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  paragraph: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 19,
  },
  tableCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.sm,
    marginTop: space.xs,
    gap: space.xs,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  tableColHeader: {
    flex: 1,
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tableCol: {
    flex: 1,
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 14,
  },
  tableDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginVertical: 2,
  },
});
