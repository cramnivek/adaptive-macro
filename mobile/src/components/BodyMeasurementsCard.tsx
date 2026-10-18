import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getLatestBodyMeasurements, type BodyMeasurementRecord } from '../db';
import type { UnitSystem } from '../state/settings';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Card } from './Card';
import { TOUCH_TARGET } from './Controls';
import { Tappable } from './Tappable';
import { BodyMeasurementsSheet } from './BodyMeasurementsSheet';

interface BodyMeasurementsCardProps {
  units: UnitSystem;
}

const cmToInches = (cm: number): number => cm / 2.54;

export const BodyMeasurementsCard = ({ units }: BodyMeasurementsCardProps) => {
  const isMetric = units === 'metric';
  const unitLabel = isMetric ? 'cm' : 'in';

  const [records, setRecords] = useState<BodyMeasurementRecord[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<BodyMeasurementRecord | null>(null);

  const loadData = async () => {
    try {
      const data = await getLatestBodyMeasurements(10);
      setRecords(data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const latest = records[0] ?? null;
  const previous = records[1] ?? null;

  const formatVal = (cmVal: number | null | undefined): string | null => {
    if (cmVal == null) return null;
    const v = isMetric ? cmVal : cmToInches(cmVal);
    return `${(Math.round(v * 10) / 10).toFixed(1)} ${unitLabel}`;
  };

  const deltaVal = (currCm: number | null | undefined, prevCm: number | null | undefined): string | null => {
    if (currCm == null || prevCm == null) return null;
    const delta = isMetric ? currCm - prevCm : cmToInches(currCm) - cmToInches(prevCm);
    const sign = delta > 0 ? '+' : '';
    return `${sign}${(Math.round(delta * 10) / 10).toFixed(1)} ${unitLabel}`;
  };

  const METRICS = [
    { label: 'WAIST', val: latest?.waistCm, prev: previous?.waistCm },
    { label: 'CHEST', val: latest?.chestCm, prev: previous?.chestCm },
    { label: 'ARMS', val: latest?.armsCm, prev: previous?.armsCm },
    { label: 'THIGHS', val: latest?.thighsCm, prev: previous?.thighsCm },
    { label: 'CALVES', val: latest?.calvesCm, prev: previous?.calvesCm },
    { label: 'HIPS', val: latest?.hipsCm, prev: previous?.hipsCm },
    { label: 'SHOULDERS', val: latest?.shouldersCm, prev: previous?.shouldersCm },
    { label: 'NECK', val: latest?.neckCm, prev: previous?.neckCm },
  ].filter((m) => m.val != null);

  return (
    <Card loud title="Body Measurements">
      <View style={styles.cardContainer}>
        {latest ? (
          <View style={styles.content}>
            <View style={styles.topMeta}>
              <View>
                <Text style={styles.dateLabel}>LAST LOGGED: {latest.date}</Text>
                {latest.bodyFatPct != null && (
                  <Text style={styles.bodyFatHero}>
                    {latest.bodyFatPct.toFixed(1)}% <Text style={styles.bodyFatSub}>EST. BODY FAT</Text>
                  </Text>
                )}
              </View>
              <Tappable
                onPress={() => {
                  setSelectedRecord(latest);
                  setSheetOpen(true);
                }}
                scaleTo={0.93}
                style={styles.editPill}
              >
                <View style={styles.editPillInner}>
                  <Ionicons name="pencil" size={13} color={loud.figure} />
                  <Text style={styles.editPillText}>EDIT</Text>
                </View>
              </Tappable>
            </View>

            {METRICS.length > 0 ? (
              <View style={styles.grid}>
                {METRICS.map((item) => {
                  const delta = deltaVal(item.val, item.prev);
                  return (
                    <View key={item.label} style={styles.metricTile}>
                      <Text style={styles.metricLabel}>{item.label}</Text>
                      <Text style={styles.metricValue}>{formatVal(item.val)}</Text>
                      {delta && (
                        <Text style={[styles.metricDelta, delta.startsWith('+') ? styles.deltaGain : styles.deltaLoss]}>
                          {delta} vs prev
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.emptyPrompt}>No circumferences recorded for this date.</Text>
            )}

            {latest.notes && (
              <View style={styles.notesBox}>
                <Text style={styles.notesText}>"{latest.notes}"</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="body-outline" size={32} color={loud.figureMuted} style={{ marginBottom: space.sm }} />
            <Text style={styles.emptyTitle}>NO MEASUREMENTS LOGGED</Text>
            <Text style={styles.emptyDesc}>
              Track waist, chest, arms, and body fat percentage to see physique composition changes alongside weight.
            </Text>
          </View>
        )}

        {/* Log Measurement Button */}
        <Tappable
          onPress={() => {
            setSelectedRecord(null);
            setSheetOpen(true);
          }}
          scaleTo={0.97}
          style={styles.logBtn}
        >
          <View style={[styles.logBtnInner, { backgroundColor: loud.loud }]}>
            <Ionicons name="add" size={18} color={loud.onLoud} style={{ marginRight: 4 }} />
            <Text style={[styles.logBtnText, { color: loud.onLoud }]}>
              {latest ? 'LOG NEW MEASUREMENT' : '+ LOG FIRST MEASUREMENT'}
            </Text>
          </View>
        </Tappable>
      </View>

      <BodyMeasurementsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        units={units}
        onSaved={loadData}
        initialRecord={selectedRecord}
      />
    </Card>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    paddingTop: space.xs,
  },
  content: {
    gap: space.md,
  },
  topMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: loud.rule,
  },
  dateLabel: {
    fontFamily: font.figure,
    fontSize: 11,
    color: loud.figureMuted,
    letterSpacing: 0.8,
  },
  bodyFatHero: {
    fontFamily: font.figure,
    fontSize: 22,
    fontWeight: '800',
    color: loud.figure,
    marginTop: 2,
  },
  bodyFatSub: {
    fontSize: 11,
    fontFamily: font.display,
    color: loud.loud,
    letterSpacing: 1,
  },
  editPill: {
    alignSelf: 'flex-start',
  },
  editPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: loud.ground,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: loud.rule,
  },
  editPillText: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    color: loud.figure,
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  metricTile: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: loud.ground,
    borderRadius: radius.md,
    padding: space.sm,
    borderWidth: 1,
    borderColor: loud.rule,
  },
  metricLabel: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    color: loud.figureMuted,
    letterSpacing: 0.8,
  },
  metricValue: {
    fontFamily: font.figure,
    fontSize: 16,
    fontWeight: '800',
    color: loud.figure,
    marginTop: 2,
  },
  metricDelta: {
    fontFamily: font.figure,
    fontSize: 10,
    marginTop: 2,
  },
  deltaGain: {
    color: '#10B981',
  },
  deltaLoss: {
    color: '#00E5FF',
  },
  notesBox: {
    backgroundColor: loud.ground,
    borderRadius: radius.md,
    padding: space.sm,
    borderLeftWidth: 3,
    borderLeftColor: loud.loud,
  },
  notesText: {
    fontFamily: font.ui,
    fontSize: 12,
    fontStyle: 'italic',
    color: loud.figureMuted,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.lg,
    paddingHorizontal: space.md,
  },
  emptyTitle: {
    fontFamily: font.display,
    fontSize: 13,
    fontWeight: '800',
    color: loud.figure,
    letterSpacing: 1,
  },
  emptyDesc: {
    fontFamily: font.ui,
    fontSize: 12,
    color: loud.figureMuted,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
    maxWidth: 280,
  },
  emptyPrompt: {
    fontFamily: font.ui,
    fontSize: 12,
    color: loud.figureMuted,
    fontStyle: 'italic',
  },
  logBtn: {
    width: '100%',
    marginTop: space.sm,
  },
  logBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    minHeight: TOUCH_TARGET,
  },
  logBtnText: {
    fontFamily: font.display,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
