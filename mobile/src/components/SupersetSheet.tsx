import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Tappable } from './Tappable';
import { TOUCH_TARGET } from './Controls';

import {
  SUPERSET_COLORS,
  getSupersetStyle,
  nextSupersetLetter,
} from '../superset';

export { SUPERSET_COLORS, getSupersetStyle, nextSupersetLetter };

export interface SupersetBlockInfo {
  name: string;
  supersetGroup?: string | null;
}

interface SupersetSheetProps {
  open: boolean;
  exerciseIndex: number | null;
  blocks: SupersetBlockInfo[];
  onAssignGroup: (exerciseIndices: number[], group: string) => void;
  onUnlink: (exerciseIndex: number) => void;
  onDisband: (group: string) => void;
  onClose: () => void;
}

export const SupersetSheet = ({
  open,
  exerciseIndex,
  blocks,
  onAssignGroup,
  onUnlink,
  onDisband,
  onClose,
}: SupersetSheetProps) => {
  const insets = useSafeAreaInsets();

  if (exerciseIndex === null || !blocks[exerciseIndex]) {
    return null;
  }

  const currentBlock = blocks[exerciseIndex];
  const currentGroup = currentBlock.supersetGroup;
  const currentStyle = getSupersetStyle(currentGroup);

  const groupBlocks = currentGroup
    ? blocks
        .map((b, idx) => ({ ...b, index: idx }))
        .filter((b) => b.supersetGroup === currentGroup)
    : [];

  const isGiantSet = groupBlocks.length >= 3;

  // Determine available letters for a new superset:
  const usedGroups = new Set(
    blocks.map((b) => b.supersetGroup).filter(Boolean) as string[],
  );
  const nextAvailableLetter = nextSupersetLetter(usedGroups);

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.header}>
          {currentGroup ? (
            <View style={styles.titleRow}>
              <View
                style={[
                  styles.badgePill,
                  { borderColor: currentStyle.border, backgroundColor: currentStyle.bg },
                ]}
              >
                <Ionicons
                  name={isGiantSet ? 'flash' : 'link'}
                  size={14}
                  color={currentStyle.text}
                />
                <Text style={[styles.badgeText, { color: currentStyle.text }]}>
                  {isGiantSet ? 'GIANT SET' : 'SUPERSET'} {currentGroup}
                </Text>
              </View>
              <Text style={styles.titleExercise} numberOfLines={1}>
                {currentBlock.name.toUpperCase()}
              </Text>
            </View>
          ) : (
            <View style={styles.titleRow}>
              <View style={styles.linkHeaderIcon}>
                <Ionicons name="link" size={16} color={loud.loud} />
              </View>
              <Text style={styles.title}>LINK SUPERSET</Text>
            </View>
          )}

          <Tappable onPress={onClose} style={styles.closeBtn} scaleTo={0.85}>
            <Text style={styles.closeText}>✕</Text>
          </Tappable>
        </View>

        <ScrollView style={styles.scrollBody} contentContainerStyle={styles.scrollContent}>
          {currentGroup ? (
            <>
              <Text style={styles.sectionSubtitle}>
                Exercises in this {isGiantSet ? 'giant set' : 'superset'}:
              </Text>

              <View style={styles.groupList}>
                {groupBlocks.map((b, order) => {
                  const isThisOne = b.index === exerciseIndex;
                  return (
                    <View
                      key={b.name}
                      style={[
                        styles.groupItem,
                        isThisOne && {
                          borderColor: currentStyle.border,
                          backgroundColor: currentStyle.bg,
                        },
                      ]}
                    >
                      <View style={styles.groupItemOrder}>
                        <Text style={[styles.groupItemOrderNum, { color: currentStyle.text }]}>
                          {order + 1}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.groupItemName,
                          isThisOne && { color: loud.figure, fontWeight: '700' },
                        ]}
                        numberOfLines={1}
                      >
                        {b.name.toUpperCase()}
                      </Text>
                      {isThisOne && (
                        <View style={styles.activeTag}>
                          <Text style={styles.activeTagText}>CURRENT</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>

              <View style={styles.actions}>
                <Tappable
                  onPress={() => {
                    onUnlink(exerciseIndex);
                    onClose();
                  }}
                  scaleTo={0.96}
                >
                  <View style={[styles.actionBtn, { backgroundColor: loud.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: loud.rule }]}>
                    <Ionicons name="close-circle-outline" size={16} color={loud.figure} />
                    <Text style={styles.actionBtnText}>
                      REMOVE {currentBlock.name.toUpperCase()}
                    </Text>
                  </View>
                </Tappable>

                <Tappable
                  onPress={() => {
                    onDisband(currentGroup);
                    onClose();
                  }}
                  scaleTo={0.96}
                >
                  <View style={[styles.disbandBtn, { backgroundColor: 'rgba(255, 59, 48, 0.15)' }]}>
                    <Ionicons name="trash-outline" size={16} color={loud.warn} />
                    <Text style={[styles.actionBtnText, { color: loud.warn }]}>
                      DISBAND {isGiantSet ? 'GIANT SET' : 'SUPERSET'} {currentGroup}
                    </Text>
                  </View>
                </Tappable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.sectionSubtitle}>
                Select an exercise to link with {currentBlock.name.toUpperCase()}:
              </Text>

              <View style={styles.optionsList}>
                {blocks.map((otherBlock, otherIdx) => {
                  if (otherIdx === exerciseIndex) return null;
                  const targetGroup = otherBlock.supersetGroup ?? nextAvailableLetter;
                  const isExistingGroup = Boolean(otherBlock.supersetGroup);
                  const styleForGroup = getSupersetStyle(targetGroup);

                  return (
                    <Tappable
                      key={otherBlock.name}
                      onPress={() => {
                        onAssignGroup([exerciseIndex, otherIdx], targetGroup);
                        onClose();
                      }}
                      scaleTo={0.96}
                      style={styles.optionTappable}
                    >
                      <View style={[styles.optionCard, { borderColor: styleForGroup.border }]}>
                        <View style={styles.optionCardHeader}>
                          <View
                            style={[
                              styles.badgePillSmall,
                              {
                                borderColor: styleForGroup.border,
                                backgroundColor: styleForGroup.bg,
                              },
                            ]}
                          >
                            <Ionicons
                              name={isExistingGroup ? 'flash' : 'link'}
                              size={12}
                              color={styleForGroup.text}
                            />
                            <Text style={[styles.badgeTextSmall, { color: styleForGroup.text }]}>
                              {isExistingGroup ? 'JOIN GROUP' : 'SUPERSET'} {targetGroup}
                            </Text>
                          </View>
                          <Text style={styles.optionDistance}>
                            {Math.abs(otherIdx - exerciseIndex) === 1
                              ? otherIdx > exerciseIndex
                                ? 'NEXT EXERCISE'
                                : 'PREVIOUS EXERCISE'
                              : 'CIRCUIT'}
                          </Text>
                        </View>
                        <Text style={styles.optionName} numberOfLines={1}>
                          {otherBlock.name.toUpperCase()}
                        </Text>
                      </View>
                    </Tappable>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    backgroundColor: loud.ground,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    paddingTop: space.lg,
    paddingHorizontal: space.lg,
    maxHeight: '80%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  titleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkHeaderIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: font.display,
    fontSize: 18,
    letterSpacing: 0.5,
    color: loud.figure,
  },
  titleExercise: {
    flex: 1,
    fontFamily: font.display,
    fontSize: 15,
    color: loud.figureMuted,
  },
  closeBtn: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
    color: loud.figureFaint,
  },
  scrollBody: {
    marginTop: space.md,
  },
  scrollContent: {
    paddingBottom: space.lg,
  },
  sectionSubtitle: {
    fontFamily: font.ui,
    fontSize: 13,
    color: loud.figureFaint,
    marginBottom: space.md,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: font.display,
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: '700',
  },
  groupList: {
    gap: 8,
    marginBottom: space.lg,
  },
  groupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    backgroundColor: loud.panel,
  },
  groupItemOrder: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupItemOrderNum: {
    fontFamily: font.figure,
    fontSize: 12,
    fontWeight: '700',
  },
  groupItemName: {
    flex: 1,
    fontFamily: font.display,
    fontSize: 14,
    color: loud.figureMuted,
  },
  activeTag: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 2,
  },
  activeTagText: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 0.8,
    color: loud.figure,
  },
  actions: {
    gap: 10,
  },
  actionBtn: {
    minHeight: TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
  },
  disbandBtn: {
    minHeight: TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: space.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 59, 48, 0.4)',
    borderRadius: radius.lg,
  },
  actionBtnText: {
    fontFamily: font.display,
    fontSize: 12,
    letterSpacing: 1.2,
    color: loud.figure,
  },
  optionsList: {
    gap: 10,
  },
  optionTappable: {
    marginBottom: 2,
  },
  optionCard: {
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: loud.panel,
  },
  optionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  badgePillSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  badgeTextSmall: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 0.9,
    fontWeight: '700',
  },
  optionDistance: {
    fontFamily: font.display,
    fontSize: 9.5,
    letterSpacing: 1,
    color: loud.figureFaint,
  },
  optionName: {
    fontFamily: font.display,
    fontSize: 15,
    letterSpacing: 0.2,
    color: loud.figure,
  },
});
