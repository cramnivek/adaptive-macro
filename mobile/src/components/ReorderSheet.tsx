import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Tappable } from './Tappable';
import { thud } from '../platform/haptics';

export interface ReorderItem {
  name: string;
  isCardio?: boolean;
  supersetGroup?: string | null;
  setCount?: number;
}

interface ReorderSheetProps {
  open: boolean;
  items: ReorderItem[];
  onMove: (fromIndex: number, toIndex: number) => void;
  onClose: () => void;
}

/**
 * ReorderExercisesSheet allows quick bird's-eye reordering of all exercises
 * and cardio blocks during an active workout session.
 */
export const ReorderSheet: React.FC<ReorderSheetProps> = ({
  open,
  items,
  onMove,
  onClose,
}) => {
  const insets = useSafeAreaInsets();

  const handleMove = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    thud('light');
    onMove(index, target);
  };

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.md) + space.md }]}>
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="swap-vertical" size={16} color={loud.loud} />
            </View>
            <View>
              <Text style={styles.title}>REORDER EXERCISES</Text>
              <Text style={styles.subtitle}>
                Move exercises up or down to adjust your workout order.
              </Text>
            </View>
          </View>
          <Tappable
            onPress={onClose}
            scaleTo={0.9}
            style={styles.closeHit}
            accessibilityRole="button"
            accessibilityLabel="Close reorder sheet"
          >
            <Ionicons name="close" size={20} color={loud.figureMuted} />
          </Tappable>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {items.map((item, index) => {
            const isFirst = index === 0;
            const isLast = index === items.length - 1;

            return (
              <View key={`${item.name}-${index}`} style={styles.itemRow}>
                <View style={styles.indexBadge}>
                  <Text style={styles.indexText}>{index + 1}</Text>
                </View>

                <View style={styles.nameBlock}>
                  <View style={styles.titleTagRow}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {item.name.toUpperCase()}
                    </Text>
                    {item.isCardio && (
                      <View style={styles.tagCardio}>
                        <Text style={styles.tagText}>CARDIO</Text>
                      </View>
                    )}
                    {item.supersetGroup && (
                      <View style={styles.tagSuperset}>
                        <Text style={styles.tagText}>SUPER {item.supersetGroup}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.itemMeta}>
                    {item.isCardio
                      ? 'Cardio segment'
                      : `${item.setCount ?? 0} set${(item.setCount ?? 0) === 1 ? '' : 's'}`}
                  </Text>
                </View>

                <View style={styles.btnGroup}>
                  <Tappable
                    onPress={() => handleMove(index, -1)}
                    disabled={isFirst}
                    scaleTo={0.88}
                    style={[styles.arrowBtn, isFirst && styles.arrowBtnDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${item.name} up`}
                  >
                    <Ionicons
                      name="chevron-up"
                      size={20}
                      color={isFirst ? loud.rule : loud.figure}
                    />
                  </Tappable>

                  <Tappable
                    onPress={() => handleMove(index, 1)}
                    disabled={isLast}
                    scaleTo={0.88}
                    style={[styles.arrowBtn, isLast && styles.arrowBtnDisabled]}
                    accessibilityRole="button"
                    accessibilityLabel={`Move ${item.name} down`}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={20}
                      color={isLast ? loud.rule : loud.figure}
                    />
                  </Tappable>
                </View>
              </View>
            );
          })}
        </ScrollView>

        <Tappable
          onPress={onClose}
          scaleTo={0.97}
          style={styles.doneBtnWrap}
          accessibilityRole="button"
          accessibilityLabel="Done reordering"
        >
          <View style={styles.doneBtn}>
            <Text style={styles.doneBtnLabel}>DONE</Text>
          </View>
        </Tappable>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '82%',
    backgroundColor: loud.panel,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    paddingTop: space.lg,
    paddingHorizontal: space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
    paddingRight: space.sm,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: loud.ground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: font.display,
    fontSize: 14,
    letterSpacing: 1.5,
    color: loud.figure,
  },
  subtitle: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureMuted,
    marginTop: 2,
  },
  closeHit: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    maxHeight: 380,
    marginTop: space.sm,
    marginBottom: space.md,
  },
  listContent: {
    gap: space.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: loud.ground,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    gap: space.sm,
  },
  indexBadge: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    fontFamily: font.figure,
    fontSize: 12,
    color: loud.figureMuted,
  },
  nameBlock: {
    flex: 1,
    justifyContent: 'center',
  },
  titleTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  itemName: {
    flexShrink: 1,
    fontFamily: font.display,
    fontSize: 13,
    letterSpacing: 0.5,
    color: loud.figure,
  },
  tagCardio: {
    backgroundColor: loud.loud,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  tagSuperset: {
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.xs,
  },
  tagText: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 0.8,
    color: loud.onLoud,
  },
  itemMeta: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureFaint,
    marginTop: 2,
  },
  btnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowBtnDisabled: {
    opacity: 0.35,
  },
  doneBtnWrap: {
    width: '100%',
  },
  doneBtn: {
    minHeight: 46,
    backgroundColor: loud.loud,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnLabel: {
    fontFamily: font.display,
    fontSize: 14,
    letterSpacing: 1.5,
    color: loud.onLoud,
  },
});
