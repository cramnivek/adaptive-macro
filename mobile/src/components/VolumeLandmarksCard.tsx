import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { VolumeDiagnostics } from '@adaptive-macros/engine';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Card } from './Card';
import { thud } from '../platform/haptics';

interface VolumeLandmarksCardProps {
  diagnostics: VolumeDiagnostics;
  periodDays: number;
  goal?: 'lose' | 'maintain' | 'gain';
  targetKcalDelta?: number;
}

const ZONE_COLORS = {
  optimal: {
    text: '#6FB58A',
    bg: '#14261C',
    border: '#234430',
    bar: '#6FB58A',
    friendlyName: 'GROWTH RANGE',
  },
  effective: {
    text: '#C8A45C',
    bg: '#241F14',
    border: '#443A22',
    bar: '#C8A45C',
    friendlyName: 'MODERATE VOLUME',
  },
  maintenance: {
    text: '#9C9C96',
    bg: '#1C1C1F',
    border: '#2E2E33',
    bar: '#67676C',
    friendlyName: 'MAINTENANCE RANGE',
  },
  untrained: {
    text: '#67676C',
    bg: '#141416',
    border: '#222226',
    bar: '#26262B',
    friendlyName: 'NOT LOGGED',
  },
  overreaching: {
    text: '#E8352A',
    bg: '#281414',
    border: '#4D1D1B',
    bar: '#E8352A',
    friendlyName: 'HIGH VOLUME — REVIEW RECOVERY',
  },
};

export const VolumeLandmarksCard = ({
  diagnostics,
  periodDays,
  goal,
  targetKcalDelta,
}: VolumeLandmarksCardProps) => {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showScience, setShowScience] = useState(false);
  const [showDeficitScience, setShowDeficitScience] = useState(false);

  const { muscleVolumes, pushPullBalance, legBalance, weeklyWorkingSets } = diagnostics;

  return (
    <Card loud title="Weekly Muscle Volume">
      <Text style={styles.subtitle}>
        Weekly working sets completed across muscle groups compared with evidence-based hypertrophy ranges. Individual response varies with training experience, intensity, and recovery.
        {periodDays > 7 ? ' Scaled to a 7-day rate.' : ''}
      </Text>

      {/* Expandable Science Reference Button */}
      <Pressable
        onPress={() => {
          thud('light');
          setShowScience((prev) => !prev);
        }}
        style={styles.scienceToggleRow}
      >
        <Ionicons name="school-outline" size={15} color="#00E5FF" />
        <Text style={styles.scienceToggleText}>
          {showScience ? 'Hide the science & references' : 'How does this work? (Science & References)'}
        </Text>
        <Ionicons
          name={showScience ? 'chevron-up' : 'chevron-down'}
          size={14}
          color="#00E5FF"
        />
      </Pressable>

      {/* Expanded Science Details */}
      {showScience && (
        <View style={styles.scienceDetailsBox}>
          <Text style={styles.scienceIntro}>
            Research indicates that muscle hypertrophy tends to respond to weekly working sets in broad tiers, though optimal volume varies significantly with individual recovery capacity, proximity to failure, sleep, and nutrition:
          </Text>

          <View style={styles.scienceTier}>
            <Text style={[styles.tierTitle, { color: '#9C9C96' }]}>1. Maintenance Range (~6–10 sets/wk)</Text>
            <Text style={styles.tierDesc}>
              General baseline volume shown to preserve existing muscle tissue for most lifters.
            </Text>
          </View>

          <View style={styles.scienceTier}>
            <Text style={[styles.tierTitle, { color: '#6FB58A' }]}>2. Typical Growth Range (~10–20 sets/wk)</Text>
            <Text style={styles.tierDesc}>
              Common evidence-based range associated with consistent muscle gains across training literature.
            </Text>
          </View>

          <View style={styles.scienceTier}>
            <Text style={[styles.tierTitle, { color: '#E8352A' }]}>3. Higher-Volume Range (~20+ sets/wk)</Text>
            <Text style={styles.tierDesc}>
              Demands high recovery capacity, adequate sleep, and sufficient calories to avoid accumulating non-functional fatigue.
            </Text>
          </View>

          <View style={styles.scienceRefDivider} />
          <Text style={styles.scienceRefHeader}>ACADEMIC CITATIONS:</Text>
          <Text style={styles.scienceCitation}>
            • <Text style={styles.scienceAuthor}>Schoenfeld, B. J. et al. (2017)</Text>. Dose-response relationship between weekly resistance training volume and increases in muscle mass. <Text style={styles.scienceJournal}>J Sports Sci</Text>.
          </Text>
          <Text style={styles.scienceCitation}>
            • <Text style={styles.scienceAuthor}>Israetel, M. A. et al. (2020)</Text>. Hypertrophy Training Volume Framework. <Text style={styles.scienceJournal}>Renaissance Periodization</Text>.
          </Text>
          <Text style={styles.scienceCitation}>
            • <Text style={styles.scienceAuthor}>Helms, E. R. et al. (2014)</Text>. Evidence-based recommendations for natural bodybuilding. <Text style={styles.scienceJournal}>JISSN</Text>.
          </Text>
        </View>
      )}

      {/* Adaptive Energy Balance Recovery Guidance */}
      {goal === 'lose' && (
        <View style={styles.energyAdaptiveBanner}>
          <View style={styles.energyBadgeRow}>
            <View style={[styles.energyDot, { backgroundColor: '#FBBF24' }]} />
            <Text style={styles.energyBadgeTitle}>
              EATING TO LOSE FAT (CALORIE DEFICIT) {targetKcalDelta ? `(${targetKcalDelta > 0 ? `+${targetKcalDelta}` : targetKcalDelta} KCAL/DAY)` : ''}
            </Text>
          </View>
          <Text style={styles.energyBannerBody}>
            When eating in a deficit, recovery capacity can be somewhat constrained. Focusing on maintaining lifting intensity with moderate volume helps protect muscle while keeping fatigue manageable.
          </Text>
          <Pressable
            onPress={() => {
              thud('light');
              setShowDeficitScience((prev) => !prev);
            }}
            style={styles.deficitSubToggle}
          >
            <Text style={styles.deficitSubToggleText}>
              {showDeficitScience ? 'Hide deficit science ▴' : 'How does a calorie deficit affect training volume? ▾'}
            </Text>
          </Pressable>
          {showDeficitScience && (
            <Text style={styles.deficitScienceBody}>
              Energy restriction can influence systemic recovery bandwidth and muscle protein synthesis. Prioritizing high-quality working sets and sufficient daily protein (1.6–2.2 g/kg) helps retain muscle without accumulating excessive fatigue (Helms et al., 2014; Morton et al., 2018).
            </Text>
          )}
        </View>
      )}

      {goal === 'gain' && (
        <View style={[styles.energyAdaptiveBanner, styles.energyBannerSurplus]}>
          <View style={styles.energyBadgeRow}>
            <View style={[styles.energyDot, { backgroundColor: '#10B981' }]} />
            <Text style={[styles.energyBadgeTitle, { color: '#10B981' }]}>
              EATING TO BUILD MUSCLE (CALORIE SURPLUS) {targetKcalDelta ? `(${targetKcalDelta > 0 ? `+${targetKcalDelta}` : targetKcalDelta} KCAL/DAY)` : ''}
            </Text>
          </View>
          <Text style={styles.energyBannerBody}>
            With ample calories and glycogen stores, recovery capacity is typically elevated. This provides good headroom to explore higher training volumes if you are progressing well.
          </Text>
        </View>
      )}

      {/* Overview Stat Strip */}
      <View style={styles.statStrip}>
        <View style={styles.stripStat}>
          <Text style={styles.stripLabel}>WEEKLY VOLUME</Text>
          <Text style={styles.stripValue}>
            {weeklyWorkingSets} <Text style={styles.stripUnit}>sets/wk</Text>
          </Text>
        </View>
        <View style={styles.stripStat}>
          <Text style={styles.stripLabel}>IN GROWTH RANGE</Text>
          <Text style={[styles.stripValue, { color: '#6FB58A' }]}>
            {diagnostics.optimalMusclesCount} / {muscleVolumes.length}{' '}
            <Text style={styles.stripUnit}>muscles</Text>
          </Text>
        </View>
      </View>

      {/* Muscle Group Volume Rows */}
      <View style={styles.groupList}>
        {muscleVolumes.map((item) => {
          const colors = ZONE_COLORS[item.zone];
          const isSelected = selectedGroup === item.key;

          const friendlyZoneName = colors.friendlyName;

          return (
            <Pressable
              key={item.key}
              onPress={() => setSelectedGroup(isSelected ? null : item.key)}
              style={[styles.rowContainer, isSelected && styles.rowSelected]}
            >
              <View style={styles.rowHeader}>
                <View style={styles.labelGroup}>
                  <Text style={styles.muscleLabel}>{item.label.toUpperCase()}</Text>
                  <Text style={styles.setDetail}>
                    {item.effectiveWeeklySets} sets/wk
                    {item.indirectSets > 0 ? ` (${item.directSets} direct)` : ''}
                  </Text>
                </View>

                <View
                  style={[
                    styles.badge,
                    { backgroundColor: colors.bg, borderColor: colors.border },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: colors.text }]}>
                    {friendlyZoneName}
                  </Text>
                </View>
              </View>

              {/* Progress Meter Bar */}
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.max(4, Math.min(100, item.progressPct))}%`,
                      backgroundColor: colors.bar,
                    },
                  ]}
                />
                {/* Visual landmark indicator for typical growth range */}
                <View style={styles.mavZoneMarker} />
              </View>

              {/* Collapsible Info Drawer on Tap */}
              {isSelected && (
                <View style={styles.drawer}>
                  <Text style={styles.drawerDesc}>
                    {item.zone === 'optimal'
                      ? `Your ${item.label.toLowerCase()} is in the typical hypertrophy range (10–20 sets/wk) shown to produce consistent gains for most lifters.`
                      : item.zone === 'effective'
                        ? `Moderate volume logged for ${item.label.toLowerCase()}. If your strength is progressing well, this is a solid working range.`
                        : item.zone === 'maintenance'
                          ? `Baseline maintenance volume logged for ${item.label.toLowerCase()}. If this muscle is a growth priority, consider gradually adding sets as recovery permits.`
                          : item.zone === 'overreaching'
                            ? `High volume logged for ${item.label.toLowerCase()} (~20+ sets/wk). Check recovery, sleep, and joint comfort before adding more sets.`
                            : `No sets logged for ${item.label.toLowerCase()} yet this week.`}
                  </Text>
                  <View style={styles.landmarksRow}>
                    <Text style={styles.landmarkItem}>
                      Maintain: <Text style={styles.landmarkVal}>{item.mev}+ sets</Text>
                    </Text>
                    <Text style={styles.landmarkItem}>
                      Growth range:{' '}
                      <Text style={[styles.landmarkVal, { color: '#6FB58A' }]}>
                        {item.mavMin}–{item.mavMax} sets
                      </Text>
                    </Text>
                    <Text style={styles.landmarkItem}>
                      Higher volume: <Text style={styles.landmarkVal}>{item.mrv}+ sets</Text>
                    </Text>
                  </View>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Structural Movement Balance Section */}
      <Text style={styles.balanceHeading}>MOVEMENT PATTERN BALANCE</Text>
      <Text style={styles.balanceSubtext}>
        Comparing relative weekly volume across opposing movement patterns to identify training emphasis.
      </Text>
      <View style={styles.balanceGrid}>
        {/* Push vs Pull Tile */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceTop}>
            <Text style={styles.balanceTitle}>PUSH (CHEST/SHOULDERS) : PULL (BACK)</Text>
            <View
              style={[
                styles.smallBadge,
                pushPullBalance.status === 'balanced'
                  ? styles.badgeBalanced
                  : styles.badgeWarning,
              ]}
            >
              <Text
                style={[
                  styles.smallBadgeText,
                  {
                    color:
                      pushPullBalance.status === 'balanced' ? '#6FB58A' : loud.warn,
                  },
                ]}
              >
                {pushPullBalance.status === 'balanced' ? 'BALANCED' : 'EMPHASIS VARIES'}
              </Text>
            </View>
          </View>
          <Text style={styles.ratioFigure}>
            {pushPullBalance.status === 'insufficient-data'
              ? '—'
              : `${pushPullBalance.ratio} : 1`}
          </Text>
          <Text style={styles.balanceCue}>{pushPullBalance.cue}</Text>
        </View>

        {/* Quad vs Posterior Chain Tile */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceTop}>
            <Text style={styles.balanceTitle}>QUADS : POSTERIOR CHAIN (GLUTES/HAMS)</Text>
            <View
              style={[
                styles.smallBadge,
                legBalance.status === 'balanced'
                  ? styles.badgeBalanced
                  : styles.badgeWarning,
              ]}
            >
              <Text
                style={[
                  styles.smallBadgeText,
                  {
                    color:
                      legBalance.status === 'balanced' ? '#6FB58A' : loud.warn,
                  },
                ]}
              >
                {legBalance.status === 'balanced' ? 'BALANCED' : 'EMPHASIS VARIES'}
              </Text>
            </View>
          </View>
          <Text style={styles.ratioFigure}>
            {legBalance.status === 'insufficient-data'
              ? '—'
              : `${legBalance.ratio} : 1`}
          </Text>
          <Text style={styles.balanceCue}>{legBalance.cue}</Text>
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  subtitle: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
    color: loud.figureFaint,
    marginBottom: space.sm,
  },
  scienceToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    marginBottom: space.md,
  },
  scienceToggleText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    color: '#00E5FF',
  },
  scienceDetailsBox: {
    backgroundColor: '#0D1520',
    borderColor: '#1D3B54',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
    gap: space.xs,
  },
  scienceIntro: {
    fontFamily: font.ui,
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 17,
    marginBottom: 4,
  },
  scienceTier: {
    marginTop: 4,
  },
  tierTitle: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  tierDesc: {
    fontFamily: font.ui,
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 16,
    marginTop: 1,
  },
  scienceRefDivider: {
    height: 1,
    backgroundColor: '#1E2530',
    marginVertical: 6,
  },
  scienceRefHeader: {
    fontFamily: font.uiStrong,
    fontSize: 9,
    letterSpacing: 1.1,
    color: '#64748B',
  },
  scienceCitation: {
    fontFamily: font.ui,
    fontSize: 10,
    color: '#94A3B8',
    lineHeight: 15,
  },
  scienceAuthor: {
    fontFamily: font.uiStrong,
    color: '#CBD5E1',
  },
  scienceJournal: {
    fontStyle: 'italic',
    color: '#64748B',
  },
  statStrip: {
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: loud.panel,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  stripStat: {
    flex: 1,
  },
  stripLabel: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 1.3,
    color: loud.figureFaint,
    marginBottom: 2,
  },
  stripValue: {
    fontFamily: font.figure,
    fontSize: 22,
    letterSpacing: -0.5,
    color: loud.figure,
    fontVariant: ['tabular-nums'],
  },
  stripUnit: {
    fontFamily: font.ui,
    fontSize: 12,
    color: loud.figureMuted,
  },
  groupList: {
    gap: space.sm,
  },
  rowContainer: {
    backgroundColor: loud.panel,
    borderRadius: radius.sm,
    padding: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  rowSelected: {
    borderColor: loud.loud,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  labelGroup: {
    flex: 1,
  },
  muscleLabel: {
    fontFamily: font.display,
    fontSize: 11,
    letterSpacing: 1.2,
    color: loud.figure,
  },
  setDetail: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureFaint,
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 1.1,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: loud.ground,
    overflow: 'hidden',
    position: 'relative',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  mavZoneMarker: {
    position: 'absolute',
    left: '60%',
    width: 2,
    height: '100%',
    backgroundColor: loud.rule,
  },
  drawer: {
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  drawerDesc: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: loud.figureMuted,
    marginBottom: 6,
  },
  landmarksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
  },
  landmarkItem: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureFaint,
  },
  landmarkVal: {
    fontFamily: font.figure,
    color: loud.figure,
  },
  balanceHeading: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 1.4,
    color: loud.figureFaint,
    marginTop: space.xl,
    marginBottom: 2,
  },
  balanceSubtext: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureMuted,
    marginBottom: space.sm,
  },
  balanceGrid: {
    flexDirection: 'column',
    gap: space.sm,
  },
  balanceCard: {
    backgroundColor: loud.panel,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  balanceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    marginBottom: 4,
  },
  balanceTitle: {
    // Wraps instead of pushing the badge off the card: on a phone-width
    // Android screen the longer title and the badge do not fit on one line.
    flexShrink: 1,
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 1.1,
    color: loud.figureMuted,
  },
  smallBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeBalanced: {
    backgroundColor: '#14261C',
    borderColor: '#234430',
  },
  badgeWarning: {
    backgroundColor: '#262014',
    borderColor: '#4D3B18',
  },
  smallBadgeText: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 1,
  },
  ratioFigure: {
    fontFamily: font.figure,
    fontSize: 20,
    letterSpacing: -0.5,
    color: loud.figure,
    fontVariant: ['tabular-nums'],
    marginBottom: 2,
  },
  balanceCue: {
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 15,
    color: loud.figureFaint,
  },
  energyAdaptiveBanner: {
    backgroundColor: '#1C1914',
    borderColor: '#4D3B18',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.md,
  },
  energyBannerSurplus: {
    backgroundColor: '#122018',
    borderColor: '#1D452E',
  },
  energyBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  energyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  energyBadgeTitle: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 1,
    color: '#FBBF24',
  },
  energyBannerBody: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: loud.figureMuted,
  },
  deficitSubToggle: {
    paddingTop: 6,
  },
  deficitSubToggleText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    color: '#FBBF24',
  },
  deficitScienceBody: {
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 16,
    color: '#CBD5E1',
    marginTop: 4,
    backgroundColor: '#281C10',
    padding: space.sm,
    borderRadius: radius.sm,
  },
});
