import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { Button, TOUCH_TARGET } from '../../src/components/Controls';
import { PostCard } from '../../src/components/PostCard';
import { Screen } from '../../src/components/Screen';
import { SquadHub } from '../../src/components/SquadHub';
import { Tappable } from '../../src/components/Tappable';
import { confirm, notify } from '../../src/dialog';
import { deletePost } from '../../src/social/api';
import {
  cursorAfter,
  explorePage,
  FeedCursor,
  feedPage,
  followCounts,
  like,
  PAGE,
  pendingRequests,
  postsBy,
  unlike,
} from '../../src/social/feed';
import { postView } from '../../src/social/postPayload';
import { useSocial } from '../../src/social/session';
import type { FeedPost } from '../../src/social/types';
import { useApp } from '../../src/state/AppStore';
import { getEventCopy } from '../../src/copy/personality';
import { font, radius, space, useTheme } from '../../src/theme';

type FeedTab = 'following' | 'squad' | 'explore' | 'my-posts';

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
 * Lively, engaging fitness community hub:
 * - Following feed (friends & connections)
 * - Community Explore feed (public workouts & PRs from all lifters)
 * - My Workouts (personal shared history & records)
 * - Profile hero banner with follower stats and quick actions
 * - Pull-to-refresh
 */
export default function SocialScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { settings } = useApp();
  const { configured, session, profile, profileFailed, refreshProfile } = useSocial();

  const [activeTab, setActiveTab] = useState<FeedTab>('following');
  const [postsByTab, setPostsByTab] = useState<Record<FeedTab, FeedPost[] | null>>({
    following: null,
    squad: [],
    explore: null,
    'my-posts': null,
  });
  const [moreByTab, setMoreByTab] = useState<Record<FeedTab, boolean>>({
    following: true,
    squad: false,
    explore: true,
    'my-posts': true,
  });

  const [counts, setCounts] = useState<{ followers: number; following: number }>({ followers: 0, following: 0 });
  const [requests, setRequests] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadingMoreRef = useRef(false);
  const likesInFlight = useRef(new Set<string>());
  const postsByTabRef = useRef(postsByTab);
  postsByTabRef.current = postsByTab;

  const fetchPage = useCallback(
    async (tab: FeedTab, cursor: FeedCursor | null = null) => {
      if (tab === 'squad') return [];
      if (tab === 'following') return feedPage(cursor);
      if (tab === 'explore') return explorePage(cursor);
      return profile ? postsBy(profile.id, cursor) : [];
    },
    [profile],
  );

  const load = useCallback(
    async (tab: FeedTab = activeTab) => {
      if (tab === 'squad') return;
      setProblem(null);
      try {
        const [page, pending, theirCounts] = await Promise.all([
          fetchPage(tab, null),
          pendingRequests(),
          profile ? followCounts(profile.id) : Promise.resolve({ followers: 0, following: 0 }),
        ]);

        setPostsByTab((prev) => ({ ...prev, [tab]: page }));
        setMoreByTab((prev) => ({ ...prev, [tab]: page.length === PAGE }));
        setRequests(pending.length);
        setCounts(theirCounts);
      } catch (error) {
        setProblem((error as Error).message);
      }
    },
    [activeTab, fetchPage, profile],
  );

  useFocusEffect(
    useCallback(() => {
      if (session && profile) void load(activeTab);
    }, [session, profile, activeTab, load]),
  );

  const handleTabChange = (tab: FeedTab) => {
    setActiveTab(tab);
    if (postsByTab[tab] === null) {
      void load(tab);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await load(activeTab);
    setRefreshing(false);
  };

  const loadMore = async () => {
    const currentList = postsByTabRef.current[activeTab];
    if (!currentList || currentList.length === 0 || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await fetchPage(activeTab, cursorAfter(currentList));
      setPostsByTab((prev) => {
        const existing = prev[activeTab];
        if (!existing) return prev;
        const have = new Set(existing.map((p) => p.id));
        return {
          ...prev,
          [activeTab]: [...existing, ...page.filter((p) => !have.has(p.id))],
        };
      });
      setMoreByTab((prev) => ({ ...prev, [activeTab]: page.length === PAGE }));
    } catch (error) {
      notify('Could not load more', (error as Error).message);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const toggleLike = async (post: FeedPost) => {
    if (likesInFlight.current.has(post.id)) return;
    likesInFlight.current.add(post.id);
    const flip = (p: FeedPost): FeedPost =>
      p.id === post.id ? { ...p, liked: !p.liked, like_count: p.like_count + (p.liked ? -1 : 1) } : p;

    setPostsByTab((prev) => ({
      ...prev,
      following: prev.following?.map(flip) ?? null,
      explore: prev.explore?.map(flip) ?? null,
      'my-posts': prev['my-posts']?.map(flip) ?? null,
    }));

    try {
      await (post.liked ? unlike(post.id) : like(post.id));
    } catch (error) {
      setPostsByTab((prev) => ({
        ...prev,
        following: prev.following?.map(flip) ?? null,
        explore: prev.explore?.map(flip) ?? null,
        'my-posts': prev['my-posts']?.map(flip) ?? null,
      }));
      notify('Could not save that', (error as Error).message);
    } finally {
      likesInFlight.current.delete(post.id);
    }
  };

  const handleDeletePost = async (post: FeedPost) => {
    const sure = await confirm({
      title: 'Delete this post?',
      message: 'It is removed from your profile. The workout stays in your log.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!sure) return;
    try {
      await deletePost(post.id);
      setPostsByTab((prev) => ({
        ...prev,
        following: prev.following?.filter((p) => p.id !== post.id) ?? null,
        explore: prev.explore?.filter((p) => p.id !== post.id) ?? null,
        'my-posts': prev['my-posts']?.filter((p) => p.id !== post.id) ?? null,
      }));
      notify('Post deleted');
    } catch (error) {
      notify('Could not delete the post', (error as Error).message);
    }
  };

  const gear = (
    <Tappable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings" style={styles.icon}>
      <Ionicons name="settings-outline" size={22} color={colors.textMuted} />
    </Tappable>
  );

  const say = (text: string) => <Text style={[styles.note, { color: colors.textMuted }]}>{text}</Text>;

  if (!configured) return <Screen title="Social" action={gear}>{say('Social is not set up in this build.')}</Screen>;
  if (session === undefined) return <Screen title="Social" action={gear}><ActivityIndicator color={colors.text} /></Screen>;
  if (session && profile === undefined) {
    return (
      <Screen title="Social" action={gear}>
        {profileFailed ? (
          <Card>
            {say('Could not load your profile.')}
            <Button label="Try again" onPress={() => void refreshProfile().catch(() => undefined)} />
          </Card>
        ) : (
          <ActivityIndicator color={colors.text} />
        )}
      </Screen>
    );
  }
  if (!session || !profile) {
    return (
      <Screen title="Social" action={gear}>
        <Card>
          {say('Follow friends and see their workouts. Sign in and choose a username to start.')}
          <Button label={!session ? 'Sign in' : 'Choose a username'} onPress={() => router.push(!session ? '/sign-in' : '/profile-setup')} />
        </Card>
      </Screen>
    );
  }

  const currentPosts = postsByTab[activeTab];
  const hasMore = moreByTab[activeTab];

  return (
    <Screen
      title="Social"
      subtitle={`${counts.followers} followers · ${counts.following} following`}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      action={
        <View style={styles.actions}>
          <Tappable
            onPress={() => router.push('/people')}
            accessibilityRole="button"
            accessibilityLabel="Find people"
            style={styles.icon}
          >
            <Ionicons name="search-outline" size={21} color={colors.textMuted} />
          </Tappable>

          <Tappable
            onPress={() => router.push('/requests')}
            accessibilityRole="button"
            accessibilityLabel={`Follow requests, ${requests}`}
            style={styles.icon}
          >
            <Ionicons name="person-add-outline" size={21} color={colors.textMuted} />
            {requests > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                <Text style={styles.badgeText}>{requests}</Text>
              </View>
            )}
          </Tappable>

          {profile && (
            <Tappable
              onPress={() => router.push({ pathname: '/profile', params: { username: profile.username } })}
              accessibilityRole="button"
              accessibilityLabel={`My profile, ${profile.username}`}
              style={[styles.profilePill, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
            >
              <View style={[styles.profilePillAvatar, { backgroundColor: getAvatarColor(profile.username) }]}>
                <Text style={styles.profilePillAvatarText}>
                  {getInitials(profile.display_name || profile.username)}
                </Text>
              </View>
              <Text style={[styles.profilePillText, { color: colors.text }]} numberOfLines={1}>
                {profile.display_name || profile.username}
              </Text>
            </Tappable>
          )}

          {gear}
        </View>
      }
    >
      {/* Segmented Feed Tabs Bar */}
      <View style={[styles.tabsContainer, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        {(['following', 'squad', 'explore', 'my-posts'] as const).map((tab) => {
          const isSelected = activeTab === tab;
          const label =
            tab === 'following'
              ? 'Friends'
              : tab === 'squad'
                ? 'Squad'
                : tab === 'explore'
                  ? 'Community'
                  : 'My Posts';
          const iconName =
            tab === 'following'
              ? 'people'
              : tab === 'squad'
                ? 'shield-checkmark'
                : tab === 'explore'
                  ? 'globe-outline'
                  : 'barbell-outline';
          return (
            <Pressable
              key={tab}
              onPress={() => handleTabChange(tab)}
              style={[
                styles.tabItem,
                isSelected && [styles.tabItemActive, { backgroundColor: colors.accent }],
              ]}
            >
              <Ionicons
                name={iconName}
                size={14}
                color={isSelected ? colors.onFill : colors.textMuted}
                style={{ marginRight: 4 }}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.tabItemText,
                  { color: isSelected ? colors.onFill : colors.textMuted },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Feed Content */}
      {activeTab === 'squad' ? (
        <SquadHub
          user={{
            id: profile?.id ?? 'me',
            username: profile?.username ?? 'lifter',
            displayName: profile?.display_name ?? 'Lifter',
          }}
        />
      ) : problem !== null ? (
        <>
          {say(problem)}
          <Button label="Try again" onPress={() => void load(activeTab)} />
        </>
      ) : currentPosts === null ? (
        <ActivityIndicator color={colors.text} style={styles.spinner} />
      ) : currentPosts.length === 0 ? (
        <Card>
          {activeTab === 'following' ? (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={32} color={colors.accent} style={{ marginBottom: space.xs }} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {getEventCopy('social.feed_empty_title', { personality: settings.personality })}
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
                Follow training partners to see their sessions and PRs, or check out what the community is lifting right now.
              </Text>
              <View style={styles.emptyButtons}>
                <Button label="Explore Community" onPress={() => handleTabChange('explore')} />
                <Button label="Find lifters" variant="subtle" onPress={() => router.push('/people')} />
              </View>
            </View>
          ) : activeTab === 'explore' ? (
            <View style={styles.emptyCard}>
              <Ionicons name="globe-outline" size={32} color={colors.accent} style={{ marginBottom: space.xs }} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {getEventCopy('social.explore_empty_title', { personality: settings.personality })}
              </Text>
              <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
                Be the first to share a session today. Log a workout and tap Post to share.
              </Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="barbell-outline" size={32} color={colors.accent} style={{ marginBottom: space.xs }} />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No posted workouts yet</Text>
              <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
                When you finish a workout in the Train tab, tap Post to save and share it here.
              </Text>
            </View>
          )}
        </Card>
      ) : (
        <>
          {currentPosts.map((post) => (
            <PostCard
              key={post.id}
              view={postView(post, settings.units)}
              createdAt={post.created_at}
              isOwnPost={post.author_id === profile?.id}
              author={{
                username: post.username,
                displayName: post.display_name,
                onPress: () => router.push({ pathname: '/profile', params: { username: post.username } }),
              }}
              likes={{ count: post.like_count, liked: post.liked, onToggle: () => void toggleLike(post) }}
              onDelete={activeTab === 'my-posts' || post.author_id === profile?.id ? () => void handleDeletePost(post) : undefined}
              onMore={
                post.author_id === profile?.id
                  ? undefined
                  : () =>
                      router.push({
                        pathname: '/report',
                        params: { postId: post.id, profileId: post.author_id, username: post.username },
                      })
              }
            />
          ))}

          {hasMore && (
            <Button
              label={loadingMore ? 'Loading…' : 'Load more'}
              variant="subtle"
              disabled={loadingMore}
              onPress={() => void loadMore()}
            />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
  actions: { flexDirection: 'row', alignItems: 'center' },
  icon: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontFamily: font.uiStrong, fontSize: 10 },

  // Compact Profile Pill in header
  profilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 130,
    marginRight: 4,
  },
  profilePillAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePillAvatarText: {
    fontFamily: font.uiStrong,
    fontSize: 9,
    color: '#ffffff',
  },
  profilePillText: {
    fontFamily: font.uiStrong,
    fontSize: 11.5,
  },

  // Segmented Tabs
  tabsContainer: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    marginBottom: space.lg,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  tabItemActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
    elevation: 1,
  },
  tabItemText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
  },

  spinner: {
    marginVertical: space.xl,
  },

  // Empty state card
  emptyCard: {
    alignItems: 'center',
    paddingVertical: space.md,
    textAlign: 'center',
  },
  emptyTitle: {
    fontFamily: font.display,
    fontSize: 17,
    marginBottom: space.xs,
    textAlign: 'center',
  },
  emptyDesc: {
    fontFamily: font.ui,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: space.md,
  },
  emptyButtons: {
    gap: space.xs,
    width: '100%',
  },
});
