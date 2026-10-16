import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Button, TOUCH_TARGET } from '../src/components/Controls';
import { PostCard } from '../src/components/PostCard';
import { Screen } from '../src/components/Screen';
import { Tappable } from '../src/components/Tappable';
import { confirm, notify } from '../src/dialog';
import { cursorAfter, follow, followCounts, followState, like, PAGE, postsBy, profileByUsername, unfollow, unlike } from '../src/social/feed';
import { postView } from '../src/social/postPayload';
import { useSocial } from '../src/social/session';
import type { FeedPost, FollowState, PublicProfile } from '../src/social/types';
import { useApp } from '../src/state/AppStore';
import { font, space, useTheme } from '../src/theme';

/**
 * Someone's profile, their follow state with you, and their workouts.
 *
 * A profile that does not exist, one that has blocked you and one you have blocked all come
 * back from the database as no row, so they all get the same sentence here. Nothing on this
 * screen may tell them apart, or a block would show.
 */
export default function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { settings } = useApp();
  const { configured, session, profile: me } = useSocial();
  const params = useLocalSearchParams<{ username?: string }>();
  const username = typeof params.username === 'string' ? params.username : '';
  // `undefined` is "not read yet", which is not the same as the null of "not available".
  const [person, setPerson] = useState<PublicProfile | null | undefined>(undefined);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [state, setState] = useState<FollowState>('none');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [more, setMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  // Refs, not state: both are read in the same tick a second tap arrives, before
  // any re-render could have carried the new value to them.
  const postsRef = useRef<FeedPost[]>([]);
  postsRef.current = posts;
  const loadingMoreRef = useRef(false);
  const likesInFlight = useRef(new Set<string>());

  const load = useCallback(async () => {
    setProblem(null);
    try {
      const found = await profileByUsername(username);
      if (found === null) {
        setPerson(null);
        return;
      }
      const [theirCounts, theirState, page] = await Promise.all([followCounts(found.id), followState(found.id), postsBy(found.id, null)]);
      setPerson(found);
      setCounts(theirCounts);
      setState(theirState);
      setPosts(page);
      setMore(page.length === PAGE);
    } catch (error) {
      setProblem((error as Error).message);
    }
  }, [username]);

  useFocusEffect(
    useCallback(() => {
      if (session && me) void load();
    }, [session, me, load]),
  );

  const loadMore = async () => {
    const current = postsRef.current;
    if (current.length === 0 || loadingMoreRef.current || !person) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const page = await postsBy(person.id, cursorAfter(current));
      // Appended to whatever the list is now, not to what it was when the page
      // was asked for: a like or a reload that landed meanwhile must survive.
      // A post already in the list is skipped, so a reload that raced this page
      // cannot give React two rows with one key.
      setPosts((latest) => {
        const have = new Set(latest.map((p) => p.id));
        return [...latest, ...page.filter((p) => !have.has(p.id))];
      });
      setMore(page.length === PAGE);
    } catch (error) {
      notify('Could not load more', (error as Error).message);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  // Optimistic: the heart changes at once and is put back if the server says no.
  // One tap at a time per post — two in flight would finish in whichever order
  // the server chose, and the heart would be left disagreeing with it until the
  // next reload.
  const toggleLike = async (post: FeedPost) => {
    if (likesInFlight.current.has(post.id)) return;
    likesInFlight.current.add(post.id);
    const flip = (p: FeedPost): FeedPost =>
      p.id === post.id ? { ...p, liked: !p.liked, like_count: p.like_count + (p.liked ? -1 : 1) } : p;
    setPosts((current) => current.map(flip));
    try {
      await (post.liked ? unlike(post.id) : like(post.id));
    } catch (error) {
      setPosts((current) => current.map(flip));
      notify('Could not save that', (error as Error).message);
    } finally {
      likesInFlight.current.delete(post.id);
    }
  };

  // The state is read back rather than assumed. Whether following a private account is
  // pending is the database's decision, and following someone who cannot be followed
  // changes nothing, so only a re-read can say what the button should show now.
  const changeFollow = async () => {
    if (!person || busy) return;
    if (state === 'requested' && !(await confirm({ title: 'Withdraw your follow request?', confirmLabel: 'Withdraw' }))) return;
    if (state === 'following' && !(await confirm({ title: `Unfollow @${person.username}?`, confirmLabel: 'Unfollow', destructive: true }))) return;
    setBusy(true);
    try {
      await (state === 'none' ? follow(person.id) : unfollow(person.id));
      await load();
    } catch (error) {
      notify('Could not save that', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const say = (words: string) => <Text style={[styles.note, { color: colors.textMuted }]}>{words}</Text>;

  if (!configured) return <Screen>{say('Social is not set up in this build.')}</Screen>;
  if (session === undefined || me === undefined) return <Screen><ActivityIndicator color={colors.text} /></Screen>;
  if (session === null || me === null) {
    return (
      <Screen>
        <Card>
          {say('Sign in and choose a username to see profiles.')}
          <Button label={session === null ? 'Sign in' : 'Choose a username'} onPress={() => router.push(session === null ? '/sign-in' : '/profile-setup')} />
        </Card>
      </Screen>
    );
  }
  if (problem !== null) {
    return (
      <Screen>
        {say(problem)}
        <Button label="Try again" onPress={() => void load()} />
      </Screen>
    );
  }
  if (person === undefined) return <Screen><ActivityIndicator color={colors.text} /></Screen>;
  if (person === null) return <Screen>{say("That account isn't available.")}</Screen>;

  const own = state === 'self';
  const locked = person.is_private && state !== 'following' && state !== 'self';
  const instagram = person.instagram;

  return (
    <Screen
      action={
        own ? undefined : (
          <Tappable
            onPress={() => router.push({ pathname: '/report', params: { profileId: person.id, username: person.username } })}
            accessibilityRole="button"
            accessibilityLabel="More"
            style={styles.more}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.textMuted} />
          </Tappable>
        )
      }
    >
      <Card>
        <Text style={[styles.name, { color: colors.text }]}>{person.display_name}</Text>
        <Text style={[styles.handle, { color: colors.textFaint }]}>@{person.username}</Text>
        {instagram !== null && (
          <Tappable
            onPress={() => void Linking.openURL(`https://instagram.com/${encodeURIComponent(instagram)}`).catch(() => notify('Could not open Instagram'))}
            accessibilityRole="link"
            style={styles.link}
          >
            <Text style={[styles.linkText, { color: colors.accent }]}>Instagram: @{instagram}</Text>
          </Tappable>
        )}
        <Text style={[styles.counts, { color: colors.textMuted }]}>
          {counts.followers} {counts.followers === 1 ? 'follower' : 'followers'} · {counts.following} following
        </Text>
        {own ? (
          <Button label="Edit profile" variant="subtle" onPress={() => router.push('/profile-setup')} />
        ) : (
          <Button
            label={state === 'none' ? 'Follow' : state === 'requested' ? 'Requested' : 'Following'}
            variant={state === 'none' ? 'primary' : 'subtle'}
            disabled={busy}
            onPress={() => void changeFollow()}
          />
        )}
      </Card>
      {locked ? (
        say('This account is private. Follow to see their workouts.')
      ) : posts.length === 0 ? (
        say('No workouts yet.')
      ) : (
        <View>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              view={postView(post, settings.units)}
              isOwnPost={own}
              author={{
                username: post.username,
                displayName: post.display_name,
                onPress: () => router.push({ pathname: '/profile', params: { username: post.username } }),
              }}
              likes={{ count: post.like_count, liked: post.liked, onToggle: () => void toggleLike(post) }}
              onMore={own ? undefined : () => router.push({ pathname: '/report', params: { postId: post.id, profileId: post.author_id, username: post.username } })}
            />
          ))}
          {more && <Button label={loadingMore ? 'Loading…' : 'Load more'} variant="subtle" disabled={loadingMore} onPress={() => void loadMore()} />}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
  more: { minWidth: TOUCH_TARGET, minHeight: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: font.uiStrong, fontSize: 20 },
  handle: { fontFamily: font.ui, fontSize: 14, marginBottom: space.sm },
  link: { minHeight: TOUCH_TARGET, justifyContent: 'center' },
  linkText: { fontFamily: font.ui, fontSize: 14 },
  counts: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
});
