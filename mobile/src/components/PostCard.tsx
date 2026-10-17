import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { formatTimeAgo } from '../format';
import {
  cardFileFrom,
  cardFontsReady,
  composeCard,
  drawOverlay,
  pickCardPhoto,
  shareCardFile,
  shareWorkout,
} from '../platform/shareImage';
import { postViewToShareCard } from '../shareCard';
import { TEMPLATES } from '../shareCardTemplate';
import {
  type CardSyncStatus,
  getCustomCardStatus,
  getLocalCustomCard,
  getPublicCardUrl,
  persistCustomCard,
  retryCustomCardUpload,
} from '../social/customCard';
import type { PostExercise, PostView } from '../social/postPayload';
import { useApp } from '../state/AppStore';
import { font, radius, space, useTheme } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { Button, TOUCH_TARGET } from './Controls';
import { CopyWorkoutSheet } from './CopyWorkoutSheet';
import { Tappable } from './Tappable';

const AVATAR_PALETTE = ['#E57373', '#81C784', '#64B5F6', '#FFB74D', '#BA68C8', '#4DB6AC', '#F06292', '#FF8A65'];

const getAvatarColor = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

const getInitials = (name?: string): string => {
  if (!name) return '🏋️';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
};

/**
 * Rich, engaging workout post card:
 * - User avatar, relative time, and handle
 * - Visual stat chips (Duration, Sets, Volume, Steps)
 * - Segmented view: Structured Breakdown vs Visual Story Card
 * - Full-fidelity 9:16 Share Card preview with inherited custom photo & templates
 * - Interactive like counter, cheer fist-bump, and photo customizer
 */
export const PostCard = ({
  view,
  onDelete,
  author,
  likes,
  onMore,
  createdAt,
  isOwnPost,
}: {
  view: PostView;
  onDelete?: () => void;
  /** Whose post, for the feed and other people's profiles; tapping opens their profile. */
  author?: { username: string; displayName: string; onPress: () => void };
  likes?: { count: number; liked: boolean; onToggle: () => void };
  /** The ⋯ menu: report, block. */
  onMore?: () => void;
  /** ISO date string or timestamp for relative time formatting. */
  createdAt?: string;
  /** Only true if this post was created by the viewing user. */
  isOwnPost?: boolean;
}) => {
  const { colors } = useTheme();
  const { settings } = useApp();
  const canEditPhoto = isOwnPost ?? (onDelete !== undefined);
  const [cheered, setCheered] = useState(false);
  const [viewMode, setViewMode] = useState<'card' | 'breakdown'>('card');
  const [card, setCard] = useState<{ file: File; url: string } | null>(null);
  const [customCardUrl, setCustomCardUrl] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<CardSyncStatus | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [expandedExercises, setExpandedExercises] = useState(false);

  const exerciseList: PostExercise[] = useMemo(() => {
    if (view.rawExercises && view.rawExercises.length > 0) {
      return view.rawExercises;
    }
    if (view.exercises && view.exercises.length > 0) {
      return view.exercises.map((e) => ({
        name: e.name,
        sets: e.sets,
        best_kg: null,
        best_reps: 0,
      }));
    }
    return [];
  }, [view.rawExercises, view.exercises]);
  const hasExercises = exerciseList.length > 0;

  const displayTime = createdAt
    ? formatTimeAgo(createdAt)
    : view.date
      ? formatTimeAgo(view.date)
      : '';

  // Check for local customized card or cloud GCS card
  useEffect(() => {
    let alive = true;
    if (view.sessionId) {
      void getLocalCustomCard(view.sessionId).then((local) => {
        if (!alive) return;
        if (local) {
          setCustomCardUrl(local);
        } else {
          const publicUrl = getPublicCardUrl(view.sessionId, (view as any).authorId);
          if (publicUrl) setCustomCardUrl(publicUrl);
        }
      });
      if (canEditPhoto) {
        void getCustomCardStatus(view.sessionId).then((st) => {
          if (alive) setSyncStatus(st);
        });
      }
    }
    return () => {
      alive = false;
    };
  }, [view.sessionId, canEditPhoto]);

  const generateCard = useCallback(async (): Promise<{ file: File; url: string } | null> => {
    if (card) return card;
    if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
    setDrawing(true);
    try {
      await cardFontsReady();
      const summary = postViewToShareCard(view);
      const drawn = await shareCardFile(summary, null);
      if (drawn) {
        setCard(drawn);
      }
      return drawn;
    } catch {
      return null;
    } finally {
      setDrawing(false);
    }
  }, [card, view]);

  const displayCardUrl = customCardUrl || card?.url || null;

  useEffect(() => {
    if (viewMode === 'card' && !displayCardUrl && !drawing) {
      void generateCard();
    }
  }, [viewMode, displayCardUrl, drawing, generateCard]);

  const buildShareText = (): string => {
    const parts = [
      `🏋️ ${view.title}`,
      `${view.duration} · ${view.sets} sets${view.volume ? ` · ${view.volume}` : ''}`,
    ];
    if (view.highlight) {
      parts.push(`🏆 PR: ${view.highlight.label}: ${view.highlight.figure}`);
    }
    if (view.caption) {
      parts.push(`"${view.caption}"`);
    }
    if (view.exercises && view.exercises.length > 0) {
      parts.push('\nExercises:');
      view.exercises.forEach((ex) => {
        parts.push(`• ${ex.name}: ${ex.sets > 0 ? `${ex.sets}s` : '—'} (${ex.best})`);
      });
      if (view.more > 0) parts.push(`+ ${view.more} more`);
    }
    parts.push('\nLogged on Adaptive Macro');
    return parts.join('\n');
  };

  const getShareableCard = async (): Promise<{ file: File; url: string } | null> => {
    if (card) return card;
    if (displayCardUrl) {
      try {
        const resp = await fetch(displayCardUrl);
        const blob = await resp.blob();
        const file = new File(
          [blob],
          `${view.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_card.jpg`,
          { type: 'image/jpeg' },
        );
        const obj = { file, url: displayCardUrl };
        setCard(obj);
        return obj;
      } catch {
        // Fall back to generating
      }
    }
    return generateCard();
  };

  const handlePickPhoto = async () => {
    try {
      const picked = await pickCardPhoto();
      if (!picked.ok) return;
      setDrawing(true);
      await cardFontsReady();
      const summary = postViewToShareCard(view);
      const blocks = settings.cardBlocks;
      const template = settings.cardTemplate;
      const overlay = drawOverlay(summary, blocks, template);
      const canvas = composeCard(picked.image, overlay, TEMPLATES[template].place, null);
      const newCard = await cardFileFrom(canvas, summary.title, true);
      if (newCard) {
        setCard(newCard);
        setCustomCardUrl(newCard.url);
        if (view.sessionId) {
          void persistCustomCard(view.sessionId, newCard).then(() => {
            void getCustomCardStatus(view.sessionId).then(setSyncStatus);
          });
        }
      }
    } catch {
      // Photo cancelled
    } finally {
      setDrawing(false);
    }
  };

  const handleRetryUpload = async () => {
    if (!view.sessionId || retrying) return;
    setRetrying(true);
    try {
      const url = await retryCustomCardUpload(view.sessionId);
      if (url) {
        setCustomCardUrl(url);
      }
      const st = await getCustomCardStatus(view.sessionId);
      setSyncStatus(st);
    } finally {
      setRetrying(false);
    }
  };

  const handleOpenModal = () => {
    setModalOpen(true);
    if (!displayCardUrl) void generateCard();
  };

  const handleShareWorkout = async () => {
    handleOpenModal();
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header: Author Avatar & Byline */}
      {(author || onMore) && (
        <View style={styles.byline}>
          {author ? (
            <Tappable onPress={author.onPress} accessibilityRole="button" hitSlop={8} style={styles.authorTarget}>
              <View
                style={[
                  styles.avatar,
                  { backgroundColor: getAvatarColor(author.username) },
                ]}
              >
                <Text style={styles.avatarText}>{getInitials(author.displayName || author.username)}</Text>
              </View>
              <View style={styles.authorMeta}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {author.displayName}
                </Text>
                <Text style={[styles.handle, { color: colors.textMuted }]} numberOfLines={1}>
                  @{author.username}{displayTime ? ` · ${displayTime}` : ''}
                </Text>
              </View>
            </Tappable>
          ) : (
            <View />
          )}

          {onMore && (
            <Tappable
              onPress={onMore}
              accessibilityRole="button"
              accessibilityLabel="More options"
              hitSlop={8}
              style={[styles.target, styles.centered]}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
            </Tappable>
          )}
        </View>
      )}

      {/* Title & Caption */}
      <Text style={[styles.title, { color: colors.text }]}>{view.title}</Text>
      {view.caption ? <Text style={[styles.caption, { color: colors.text }]}>“{view.caption}”</Text> : null}

      {/* Visual Stat Badges */}
      <View style={styles.statsRow}>
        {view.duration ? (
          <View style={[styles.statChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="time-outline" size={13} color={colors.accent} />
            <Text style={[styles.statChipText, { color: colors.text }]}>{view.duration}</Text>
          </View>
        ) : null}

        {view.sets > 0 ? (
          <View style={[styles.statChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="flash-outline" size={13} color={colors.accent} />
            <Text style={[styles.statChipText, { color: colors.text }]}>
              {view.sets} {view.sets === 1 ? 'set' : 'sets'}
            </Text>
          </View>
        ) : null}

        {view.volume ? (
          <View style={[styles.statChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="barbell-outline" size={13} color={colors.accent} />
            <Text style={[styles.statChipText, { color: colors.text }]}>{view.volume}</Text>
          </View>
        ) : null}

        {view.steps && view.steps > 0 ? (
          <View style={[styles.statChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="footsteps-outline" size={13} color={colors.accent} />
            <Text style={[styles.statChipText, { color: colors.text }]}>~{view.steps.toLocaleString()} steps</Text>
          </View>
        ) : null}
      </View>

      {/* Segmented View Toggle: Story Card vs Breakdown */}
      <View style={[styles.viewToggleRow, { borderColor: colors.border }]}>
        <Pressable
          onPress={() => {
            setViewMode('card');
            if (!displayCardUrl) void generateCard();
          }}
          style={[
            styles.viewToggleBtn,
            viewMode === 'card' && [styles.viewToggleBtnActive, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }],
          ]}
        >
          <Ionicons
            name="image-outline"
            size={14}
            color={viewMode === 'card' ? colors.accent : colors.textMuted}
          />
          <Text
            style={[
              styles.viewToggleText,
              { color: viewMode === 'card' ? colors.text : colors.textMuted },
              viewMode === 'card' && styles.viewToggleTextActive,
            ]}
          >
            Story Card
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setViewMode('breakdown')}
          style={[
            styles.viewToggleBtn,
            viewMode === 'breakdown' && [styles.viewToggleBtnActive, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }],
          ]}
        >
          <Ionicons
            name="list-outline"
            size={14}
            color={viewMode === 'breakdown' ? colors.accent : colors.textMuted}
          />
          <Text
            style={[
              styles.viewToggleText,
              { color: viewMode === 'breakdown' ? colors.text : colors.textMuted },
              viewMode === 'breakdown' && styles.viewToggleTextActive,
            ]}
          >
            Breakdown
          </Text>
        </Pressable>
      </View>

      {/* Content depending on selected tab */}
      {viewMode === 'breakdown' ? (
        <>
          {/* Celebratory PR Milestone Card */}
          {view.highlight && (
            <View style={[styles.highlightCard, { backgroundColor: colors.accent + '15', borderColor: colors.accent }]}>
              <Ionicons name="trophy" size={17} color={colors.accent} />
              <View style={styles.highlightContent}>
                <Text style={[styles.highlightTag, { color: colors.accent }]}>NEW PERSONAL BEST</Text>
                <Text style={[styles.highlightDetail, { color: colors.text }]}>
                  {view.highlight.label}: {view.highlight.figure}
                </Text>
              </View>
            </View>
          )}

          {/* Formatted Exercise List */}
          <View style={styles.exerciseList}>
            {(expandedExercises && view.rawExercises && view.rawExercises.length > 0
              ? view.rawExercises.map((rx) => {
                  const isCardio = rx.best_kg === null && rx.sets === 0 && rx.best_reps === 0;
                  return {
                    name: rx.name,
                    sets: rx.sets,
                    best: isCardio
                      ? 'Cardio'
                      : rx.best_kg === null
                        ? `${rx.best_reps} reps`
                        : `${rx.best_kg} kg × ${rx.best_reps}`,
                  };
                })
              : view.exercises
            ).map((lift, index, arr) => (
              <View
                key={`${lift.name}-${index}`}
                style={[
                  styles.exerciseRow,
                  index < arr.length - 1 ? { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth } : null,
                ]}
              >
                <View style={[styles.setsPill, { backgroundColor: colors.surfaceRaised }]}>
                  <Text style={[styles.setsPillText, { color: colors.textMuted }]}>
                    {lift.sets > 0 ? `${lift.sets}s` : '—'}
                  </Text>
                </View>
                <Text style={[styles.exerciseName, { color: colors.text }]} numberOfLines={1}>
                  {lift.name}
                </Text>
                <Text style={[styles.exerciseBest, { color: colors.accent }]}>{lift.best}</Text>
              </View>
            ))}
          </View>

          {view.more > 0 && (
            <Tappable
              onPress={() => setExpandedExercises((prev) => !prev)}
              accessibilityRole="button"
              accessibilityLabel={expandedExercises ? 'Show fewer exercises' : `Show all ${exerciseList.length} exercises`}
              style={styles.moreTarget}
            >
              <Text style={[styles.more, { color: colors.accent }]}>
                {expandedExercises
                  ? 'Show fewer exercises ↑'
                  : `+ ${view.more} more ${view.more === 1 ? 'exercise' : 'exercises'} (tap to view all)`}
              </Text>
            </Tappable>
          )}

          {/* Copy Workout CTA Button */}
          {hasExercises && (
            <Tappable
              onPress={() => setCopyOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Copy workout to routines"
              style={[
                styles.copyRoutineBtn,
                { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
              ]}
            >
              <Ionicons name="copy-outline" size={15} color={colors.accent} />
              <Text style={[styles.copyRoutineBtnText, { color: colors.text }]}>
                Copy Workout to Routines
              </Text>
            </Tappable>
          )}
        </>
      ) : (
        /* Visual Story Card Mode */
        <View style={styles.cardPreviewContainer}>
          {displayCardUrl ? (
            <Tappable
              onPress={handleOpenModal}
              accessibilityRole="button"
              accessibilityLabel="Open high-resolution story card"
              style={styles.cardPreviewTouch}
            >
              <View style={styles.cardPreviewFrame}>
                <Image
                  source={{ uri: displayCardUrl }}
                  style={styles.cardPreviewImage}
                  resizeMode="contain"
                  onError={() => {
                    // Fall back to default card if custom card URL fails to load
                    setCustomCardUrl(null);
                    void generateCard();
                  }}
                />
                <View style={styles.expandPill}>
                  <Ionicons name="expand-outline" size={13} color="#ffffff" />
                  <Text style={styles.expandPillText}>Tap to open full card & share</Text>
                </View>
              </View>
            </Tappable>
          ) : drawing ? (
            <View style={[styles.cardLoadingFrame, { backgroundColor: loud.panel, borderColor: loud.rule }]}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={[styles.cardLoadingText, { color: colors.textMuted }]}>
                Rendering poster card…
              </Text>
            </View>
          ) : (
            <View style={[styles.cardLoadingFrame, { backgroundColor: loud.panel, borderColor: loud.rule }]}>
              <Button label="Render Story Card" onPress={() => void generateCard()} />
            </View>
          )}
        </View>
      )}

      {/* Social Actions Footer */}
      <View style={[styles.footerRow, { borderTopColor: colors.border }]}>
        <View style={styles.interactions}>
          {likes && (
            <Tappable
              onPress={likes.onToggle}
              accessibilityRole="button"
              accessibilityLabel={likes.liked ? 'Unlike' : 'Like'}
              accessibilityState={{ selected: likes.liked }}
              hitSlop={8}
              style={[styles.actionBtn, likes.liked && styles.actionBtnActive]}
            >
              <Ionicons
                name={likes.liked ? 'heart' : 'heart-outline'}
                size={20}
                color={likes.liked ? colors.danger : colors.textMuted}
              />
              <Text
                style={[
                  styles.actionText,
                  { color: likes.liked ? colors.danger : colors.textMuted },
                ]}
              >
                {likes.count}
              </Text>
            </Tappable>
          )}

          {/* Fist Bump / Cheer Quick Reaction */}
          <Tappable
            onPress={() => {
              setCheered((prev) => !prev);
              if (!likes?.liked && likes?.onToggle) {
                likes.onToggle();
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Fist bump cheer"
            hitSlop={8}
            style={[styles.actionBtn, cheered && styles.actionBtnActive]}
          >
            <Text style={styles.emojiIcon}>{cheered ? '🔥' : '👊'}</Text>
            <Text style={[styles.actionText, { color: cheered ? colors.accent : colors.textMuted }]}>
              {cheered ? 'Fired up!' : 'Cheer'}
            </Text>
          </Tappable>

          {/* Copy Workout Quick Action */}
          {hasExercises && (
            <Tappable
              onPress={() => setCopyOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Copy workout"
              hitSlop={8}
              style={[styles.actionBtn, { backgroundColor: colors.surfaceRaised }]}
            >
              <Ionicons name="copy-outline" size={15} color={colors.textMuted} />
              <Text style={[styles.actionText, { color: colors.text }]}>Copy</Text>
            </Tappable>
          )}

          {/* Story Card Quick Button */}
          <Tappable
            onPress={handleOpenModal}
            accessibilityRole="button"
            accessibilityLabel="View story card"
            hitSlop={8}
            style={[styles.actionBtn, { backgroundColor: colors.surfaceRaised }]}
          >
            <Ionicons name="image-outline" size={15} color={colors.accent} />
            <Text style={[styles.actionText, { color: colors.text }]}>Story Card</Text>
          </Tappable>
        </View>

        <Tappable
          onPress={() => void handleShareWorkout()}
          accessibilityRole="button"
          accessibilityLabel="Share workout options"
          hitSlop={8}
          style={styles.shareBtn}
        >
          <Ionicons name="share-outline" size={19} color={colors.textMuted} />
        </Tappable>
      </View>

      {onDelete && (
        <View style={styles.deleteSection}>
          <Button label="Delete post" variant="subtle" onPress={onDelete} />
        </View>
      )}

      {/* High-Resolution Share Card Modal */}
      <Modal
        visible={modalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { backgroundColor: loud.ground, borderColor: loud.rule }]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitle}>
                <Text style={styles.modalTitle}>STORY CARD</Text>
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {view.title}
                </Text>
              </View>
              <Tappable onPress={() => setModalOpen(false)} accessibilityRole="button" style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={loud.figure} />
              </Tappable>
            </View>

            {/* High-Res Preview */}
            <View style={styles.modalPreview}>
              {displayCardUrl ? (
                <Image
                  source={{ uri: displayCardUrl }}
                  style={styles.modalCardImage}
                  resizeMode="contain"
                  accessibilityLabel="High-resolution story card"
                  onError={() => {
                    setCustomCardUrl(null);
                    void generateCard();
                  }}
                />
              ) : (
                <View style={styles.modalLoading}>
                  <ActivityIndicator color={loud.loud} size="large" />
                  <Text style={styles.modalLoadingText}>Generating crisp 1080×1920 poster…</Text>
                </View>
              )}
            </View>

            {/* Modal Action Controls */}
            <View style={styles.modalActions}>
              <Tappable
                onPress={async () => {
                  const toShare = await getShareableCard();
                  if (toShare) {
                    void shareWorkout(postViewToShareCard(view), toShare);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Share image"
                style={styles.primaryActionBtn}
              >
                <Ionicons name="share-social-outline" size={18} color={loud.onLoud} />
                <Text style={styles.primaryActionText}>SHARE IMAGE</Text>
              </Tappable>

              <View style={styles.secondaryActionRow}>
                <Tappable
                  onPress={async () => {
                    const toShare = await getShareableCard();
                    if (toShare && typeof document !== 'undefined') {
                      const link = document.createElement('a');
                      link.href = toShare.url;
                      link.download = `${view.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_card.jpg`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Save image to device"
                  style={styles.secondaryActionBtn}
                >
                  <Ionicons name="download-outline" size={16} color={loud.figure} />
                  <Text style={styles.secondaryActionText}>SAVE IMAGE</Text>
                </Tappable>

                <Tappable
                  onPress={async () => {
                    try {
                      if (typeof navigator !== 'undefined' && navigator.clipboard) {
                        await navigator.clipboard.writeText(buildShareText());
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } else {
                        await Share.share({ message: buildShareText() });
                      }
                    } catch {}
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Copy workout text"
                  style={styles.secondaryActionBtn}
                >
                  <Ionicons
                    name={copied ? 'checkmark-circle' : 'copy-outline'}
                    size={16}
                    color={copied ? colors.accent : loud.figure}
                  />
                  <Text style={[styles.secondaryActionText, copied && { color: colors.accent }]}>
                    {copied ? 'COPIED!' : 'COPY TEXT'}
                  </Text>
                </Tappable>
              </View>

              {/* Copy Workout Routine */}
              {hasExercises && (
                <Tappable
                  onPress={() => {
                    setModalOpen(false);
                    setCopyOpen(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Copy workout routine"
                  style={[styles.secondaryActionBtn, styles.routineActionBtn, { borderColor: colors.accent }]}
                >
                  <Ionicons name="copy-outline" size={16} color={colors.accent} />
                  <Text style={[styles.secondaryActionText, { color: colors.accent }]}>
                    COPY WORKOUT ROUTINE
                  </Text>
                </Tappable>
              )}

              {/* Add or Change Custom Photo (only for author's own posts) */}
              {canEditPhoto && (
                <Tappable
                  onPress={handlePickPhoto}
                  accessibilityRole="button"
                  accessibilityLabel="Add or customize photo on card"
                  style={[styles.secondaryActionBtn, styles.photoActionBtn]}
                >
                  <Ionicons name="camera-outline" size={16} color={loud.figure} />
                  <Text style={styles.secondaryActionText}>
                    {customCardUrl ? 'CHANGE PHOTO' : 'ADD PHOTO'}
                  </Text>
                </Tappable>
              )}

              {/* Retry Cloud Sync if upload previously failed */}
              {canEditPhoto && syncStatus?.status === 'failed' && (
                <Tappable
                  onPress={handleRetryUpload}
                  accessibilityRole="button"
                  accessibilityLabel="Retry uploading customized card to cloud"
                  style={[styles.secondaryActionBtn, { borderColor: '#7F1D1D', backgroundColor: '#201012' }]}
                >
                  <Ionicons name="cloud-offline-outline" size={16} color="#F87171" />
                  <Text style={[styles.secondaryActionText, { color: '#F87171' }]}>
                    {retrying ? 'SYNCING...' : 'RETRY CLOUD SYNC'}
                  </Text>
                </Tappable>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* Copy Workout Modal Sheet */}
      <CopyWorkoutSheet
        visible={copyOpen}
        workoutTitle={view.title}
        authorName={author?.displayName || author?.username}
        exercises={exerciseList}
        onClose={() => setCopyOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: space.lg,
    marginBottom: space.lg,
  },
  byline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  authorTarget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: font.uiStrong,
    fontSize: 14,
    color: '#ffffff',
  },
  authorMeta: {
    flex: 1,
  },
  name: {
    fontFamily: font.uiStrong,
    fontSize: 15,
  },
  handle: {
    fontFamily: font.ui,
    fontSize: 12,
    marginTop: 1,
  },
  target: {
    minHeight: TOUCH_TARGET,
    padding: 8,
    justifyContent: 'center',
  },
  centered: {
    minWidth: TOUCH_TARGET,
    alignItems: 'center',
  },
  title: {
    fontFamily: font.display,
    fontSize: 20,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  caption: {
    fontFamily: font.ui,
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: space.sm,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginTop: space.xs,
    marginBottom: space.sm,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statChipText: {
    fontFamily: font.figure,
    fontSize: 12,
  },
  viewToggleRow: {
    flexDirection: 'row',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: space.md,
    gap: 4,
  },
  viewToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  viewToggleBtnActive: {
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  viewToggleText: {
    fontFamily: font.ui,
    fontSize: 13,
  },
  viewToggleTextActive: {
    fontFamily: font.uiStrong,
  },
  highlightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.sm,
    marginBottom: space.md,
  },
  highlightContent: {
    flex: 1,
  },
  highlightTag: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 0.8,
  },
  highlightDetail: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    marginTop: 1,
  },
  exerciseList: {
    marginBottom: space.xs,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: 7,
  },
  setsPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  setsPillText: {
    fontFamily: font.figure,
    fontSize: 11,
  },
  exerciseName: {
    flex: 1,
    fontFamily: font.ui,
    fontSize: 14,
  },
  exerciseBest: {
    fontFamily: font.uiStrong,
    fontSize: 13,
  },
  more: {
    fontFamily: font.ui,
    fontSize: 12,
    marginTop: space.xs,
    marginBottom: space.sm,
  },
  cardPreviewContainer: {
    marginVertical: space.xs,
    marginBottom: space.sm,
    alignItems: 'center',
  },
  cardPreviewTouch: {
    width: '100%',
    alignItems: 'center',
  },
  cardPreviewFrame: {
    height: 340,
    aspectRatio: 9 / 16,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: loud.ground,
    position: 'relative',
    borderWidth: 1,
    borderColor: loud.rule,
  },
  cardPreviewImage: {
    width: '100%',
    height: '100%',
  },
  expandPill: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  expandPillText: {
    fontFamily: font.ui,
    fontSize: 11,
    color: '#ffffff',
  },
  cardLoadingFrame: {
    height: 220,
    width: '100%',
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  cardLoadingText: {
    fontFamily: font.ui,
    fontSize: 13,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
    marginTop: space.xs,
  },
  interactions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
  },
  actionBtnActive: {
    transform: [{ scale: 1.05 }],
  },
  actionText: {
    fontFamily: font.figure,
    fontSize: 13,
  },
  emojiIcon: {
    fontSize: 15,
  },
  shareBtn: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteSection: {
    marginTop: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: space.sm,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 10, 11, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.md,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '94%',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  modalHeaderTitle: {
    flex: 1,
  },
  modalTitle: {
    fontFamily: font.display,
    fontSize: 18,
    color: loud.figure,
    letterSpacing: 1.2,
  },
  modalSubtitle: {
    fontFamily: font.figure,
    fontSize: 13,
    color: loud.figureMuted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPreview: {
    height: 380,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: space.xs,
  },
  modalCardImage: {
    height: '100%',
    aspectRatio: 9 / 16,
    borderRadius: radius.md,
  },
  modalLoading: {
    alignItems: 'center',
    gap: space.md,
  },
  modalLoadingText: {
    fontFamily: font.ui,
    fontSize: 13,
    color: loud.figureMuted,
  },
  modalActions: {
    marginTop: space.md,
    gap: space.sm,
  },
  primaryActionBtn: {
    backgroundColor: loud.loud,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: radius.md,
  },
  primaryActionText: {
    fontFamily: font.display,
    fontSize: 14,
    color: loud.onLoud,
    letterSpacing: 1.4,
  },
  secondaryActionRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  secondaryActionBtn: {
    flex: 1,
    backgroundColor: loud.panel,
    borderWidth: 1,
    borderColor: loud.rule,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  photoActionBtn: {
    flex: undefined,
    width: '100%',
  },
  routineActionBtn: {
    flex: undefined,
    width: '100%',
  },
  moreTarget: {
    paddingVertical: space.xs,
  },
  copyRoutineBtn: {
    marginTop: space.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  copyRoutineBtnText: {
    fontFamily: font.uiStrong,
    fontSize: 13,
  },
  secondaryActionText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    color: loud.figure,
    letterSpacing: 0.8,
  },
});
