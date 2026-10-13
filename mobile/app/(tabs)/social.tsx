import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Card } from '../../src/components/Card';
import { Button } from '../../src/components/Controls';
import { PostCard } from '../../src/components/PostCard';
import { Screen } from '../../src/components/Screen';
import { Tappable } from '../../src/components/Tappable';
import { notify } from '../../src/dialog';
import { cursorAfter, feedPage, like, pendingRequests, unlike } from '../../src/social/feed';
import { postView } from '../../src/social/postPayload';
import { useSocial } from '../../src/social/session';
import type { FeedPost } from '../../src/social/types';
import { useApp } from '../../src/state/AppStore';
import { font, space, useTheme } from '../../src/theme';

/**
 * Workouts from the people you follow, newest first.
 *
 * A feed of the people you chose rather than of everyone: public accounts you
 * don't follow are found through Find people, never pushed at you.
 */
export default function SocialScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { settings } = useApp();
  const { configured, session, profile } = useSocial();
  const [posts, setPosts] = useState<FeedPost[] | null>(null);
  const [requests, setRequests] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      const [page, pending] = await Promise.all([feedPage(null), pendingRequests()]);
      setPosts(page);
      setMore(page.length === 20);
      setRequests(pending.length);
    } catch (error) {
      setProblem((error as Error).message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (session && profile) void load();
    }, [session, profile, load]),
  );

  const loadMore = async () => {
    if (!posts || posts.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await feedPage(cursorAfter(posts));
      setPosts([...posts, ...page]);
      setMore(page.length === 20);
    } catch (error) {
      notify('Could not load more', (error as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  // Optimistic: the heart changes at once and is put back if the server says no.
  const toggleLike = async (post: FeedPost) => {
    const flip = (p: FeedPost): FeedPost =>
      p.id === post.id ? { ...p, liked: !p.liked, like_count: p.like_count + (p.liked ? -1 : 1) } : p;
    setPosts((current) => current?.map(flip) ?? null);
    try {
      await (post.liked ? unlike(post.id) : like(post.id));
    } catch (error) {
      setPosts((current) => current?.map(flip) ?? null);
      notify('Could not save that', (error as Error).message);
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
  if (session === null || profile === null) {
    return (
      <Screen title="Social" action={gear}>
        <Card>
          {say('Follow friends and see their workouts. Sign in and choose a username to start.')}
          <Button label={session === null ? 'Sign in' : 'Choose a username'} onPress={() => router.push(session === null ? '/sign-in' : '/profile-setup')} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      title="Social"
      action={
        <View style={styles.actions}>
          <Tappable onPress={() => router.push('/requests')} accessibilityRole="button" accessibilityLabel={`Follow requests, ${requests}`} style={styles.icon}>
            <Ionicons name="person-add-outline" size={22} color={colors.textMuted} />
            {requests > 0 && (
              <View style={[styles.badge, { backgroundColor: colors.danger }]}>
                <Text style={styles.badgeText}>{requests}</Text>
              </View>
            )}
          </Tappable>
          <Tappable onPress={() => router.push('/people')} accessibilityRole="button" accessibilityLabel="Find people" style={styles.icon}>
            <Ionicons name="search-outline" size={22} color={colors.textMuted} />
          </Tappable>
          {gear}
        </View>
      }
    >
      {problem !== null ? (
        <>
          {say(problem)}
          <Button label="Try again" onPress={() => void load()} />
        </>
      ) : posts === null ? (
        <ActivityIndicator color={colors.text} />
      ) : posts.length === 0 ? (
        <Card>
          {say('Follow people to see their workouts here. Yours show up too, once you post one.')}
          <Button label="Find people" onPress={() => router.push('/people')} />
        </Card>
      ) : (
        <>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              view={postView(post, settings.units)}
              author={{
                username: post.username,
                displayName: post.display_name,
                onPress: () => router.push({ pathname: '/profile', params: { username: post.username } }),
              }}
              likes={{ count: post.like_count, liked: post.liked, onToggle: () => void toggleLike(post) }}
              onMore={() => router.push({ pathname: '/report', params: { postId: post.id, profileId: post.author_id, username: post.username } })}
            />
          ))}
          {more && <Button label={loadingMore ? 'Loading…' : 'Load more'} variant="subtle" disabled={loadingMore} onPress={() => void loadMore()} />}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
  actions: { flexDirection: 'row', alignItems: 'center' },
  icon: { padding: 10 },
  badge: { position: 'absolute', top: 4, right: 4, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontFamily: font.uiStrong, fontSize: 10 },
});
