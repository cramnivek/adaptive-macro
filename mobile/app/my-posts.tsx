import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Button } from '../src/components/Controls';
import { PostCard } from '../src/components/PostCard';
import { Screen } from '../src/components/Screen';
import { confirm, notify } from '../src/dialog';
import { deletePost, myPosts } from '../src/social/api';
import { postView } from '../src/social/postPayload';
import type { Post } from '../src/social/types';
import { useApp } from '../src/state/AppStore';
import { font, space, useTheme } from '../src/theme';

/** What you have posted, newest first — how you can tell posting worked before there is a feed. */
export default function MyPostsScreen() {
  const { colors } = useTheme();
  const { settings } = useApp();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setProblem(null);
    try {
      setPosts(await myPosts());
    } catch (error) {
      setProblem((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (post: Post) => {
    const sure = await confirm({
      title: 'Delete this post?',
      message: 'It is removed from your profile. The workout stays in your log.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!sure) return;
    try {
      await deletePost(post.id);
      setPosts((current) => current?.filter((p) => p.id !== post.id) ?? null);
    } catch (error) {
      notify('Could not delete the post', (error as Error).message);
    }
  };

  const say = (text: string) => <Text style={[styles.note, { color: colors.textMuted }]}>{text}</Text>;

  return (
    <Screen>
      {problem !== null ? (
        <>
          {say(problem)}
          <Button label="Try again" onPress={() => void load()} />
        </>
      ) : posts === null ? (
        <ActivityIndicator color={colors.text} />
      ) : posts.length === 0 ? (
        say('Nothing posted yet. Finish a workout and tap POST.')
      ) : (
        posts.map((post) => (
          <PostCard key={post.id} view={postView(post, settings.units)} onDelete={() => void remove(post)} />
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 14, marginBottom: space.md },
});
