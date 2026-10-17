import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { VolumeDiagnostics } from '@adaptive-macros/engine';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Card } from './Card';

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
  },
  effective: {
    text: '#C8A45C',
    bg: '#241F14',
    border: '#443A22',
    bar: '#C8A45C',
  },
  maintenance: {
    text: '#9C9C96',
    bg: '#1C1C1F',
    border: '#2E2E33',
    bar: '#67676C',
  },
  untrained: {
    text: '#67676C',
    bg: '#141416',
    border: '#222226',
    bar: '#26262B',
  },
  overreaching: {
    text: '#E8352A',
    bg: '#281414',
    border: '#4D1D1B',
    bar: '#E8352A',
  },
};

export const VolumeLandmarksCard = ({
  diagnostics,
  periodDays,
  goal,
  targetKcalDelta,
}: VolumeLandmarksCardProps) => {
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const { muscleVolumes, pushPullBalance, legBalance, weeklyWorkingSets } = diagnostics;

  return (
    <Card loud title="Volume & Growth Landmarks">
      <Text style={styles.subtitle}>
        Weekly sets vs. evidence-based hypertrophy thresholds (Israetel & Schoenfeld).
        {periodDays > 7 ? ' Scaled to a 7-day rate.' : ''}
      </Text>

      {/* Adaptive Energy Balance Recovery Guidance */}
      {goal === 'lose' && (
        <View style={styles.energyAdaptiveBanner}>
          <View style={styles.energyBadgeRow}>
            <View style={[styles.energyDot, { backgroundColor: '#FBBF24' }]} />
            <Text style={styles.energyBadgeTitle}>
              ENERGY BALANCE: CALORIC DEFICIT {targetKcalDelta ? `(${targetKcalDelta > 0 ? `+${targetKcalDelta}` : targetKcalDelta} KCAL/DAY)` : ''}
            </Text>
          </View>
          <Text style={styles.energyBannerBody}>
            In a sustained caloric deficit, systemic recovery capacity is constrained and Maximum Recoverable Volume (MRV) drops by ~15–25%. Prioritize strength retention near MEV–MAV (10–14 sets/wk) to preserve lean muscle without generating unrecoverable fatigue.
          </Text>
        </View>
      )}

      {goal === 'gain' && (
        <View style={[styles.energyAdaptiveBanner, styles.energyBannerSurplus]}>
          <View style={styles.energyBadgeRow}>
            <View style={[styles.energyDot, { backgroundColor: '#10B981' }]} />
            <Text style={[styles.energyBadgeTitle, { color: '#10B981' }]}>
              ENERGY BALANCE: CALORIC SURPLUS {targetKcalDelta ? `(${targetKcalDelta > 0 ? `+${targetKcalDelta}` : targetKcalDelta} KCAL/DAY)` : ''}
            </Text>
          </View>
          <Text style={styles.energyBannerBody}>
            Surplus energy and elevated glycogen stores heighten muscle protein synthesis (MPS) and accelerate systemic recovery. This is your prime window to push training volume into the upper MAV–MRV sweet spot.
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
          <Text style={styles.stripLabel}>SWEET SPOT (MAV)</Text>
          <Text style={[styles.stripValue, { color: '#6FB58A' }]}>
            {diagnostics.optimalMusclesCount} / {muscleVolumes.length}{' '}
            <Text style={styles.stripUnit}>groups</Text>
          </Text>
        </View>
      </View>

      {/* Muscle Group Volume Rows */}
      <View style={styles.groupList}>
        {muscleVolumes.map((item) => {
          const colors = ZONE_COLORS[item.zone];
          const isSelected = selectedGroup === item.key;

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
                    {item.zoneLabel}
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
                {/* Visual landmark indicator for MAV range */}
                <View style={styles.mavZoneMarker} />
              </View>

              {/* Collapsible Info Drawer on Tap */}
              {isSelected && (
                <View style={styles.drawer}>
                  <Text style={styles.drawerDesc}>{item.zoneDescription}</Text>
                  <View style={styles.landmarksRow}>
                    <Text style={styles.landmarkItem}>
                      MEV: <Text style={styles.landmarkVal}>{item.mev}</Text>
                    </Text>
                    <Text style={styles.landmarkItem}>
                      MAV (Sweet spot):{' '}
                      <Text style={[styles.landmarkVal, { color: '#6FB58A' }]}>
                        {item.mavMin}–{item.mavMax}
                      </Text>
                    </Text>
                    <Text style={styles.landmarkItem}>
                      MRV Ceiling: <Text style={styles.landmarkVal}>{item.mrv}</Text>
                    </Text>
                  </View>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Structural Movement Balance Section */}
      <Text style={styles.balanceHeading}>STRUCTURAL MOVEMENT BALANCE</Text>
      <View style={styles.balanceGrid}>
        {/* Push vs Pull Tile */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceTop}>
            <Text style={styles.balanceTitle}>PUSH : PULL</Text>
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
                {pushPullBalance.label}
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
            <Text style={styles.balanceTitle}>QUAD : POSTERIOR</Text>
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
                {legBalance.label}
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
    fontSize: 12,
    lineHeight: 17,
    color: loud.figureFaint,
    marginBottom: space.md,
  },
  statStrip: {
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: loud.panel,
    borderRadius: radius.md,
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
    fontSize: 11,
    lineHeight: 16,
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
    fontSize: 10,
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
    marginBottom: space.sm,
  },
  balanceGrid: {
    flexDirection: 'column',
    gap: space.sm,
  },
  balanceCard: {
    backgroundColor: loud.panel,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  balanceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  balanceTitle: {
    fontFamily: font.display,
    fontSize: 11,
    letterSpacing: 1.2,
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
    borderRadius: radius.md,
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
});
