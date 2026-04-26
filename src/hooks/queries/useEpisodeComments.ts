import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface EpisodeComment {
  id: string;
  user_id: string;
  episode_id: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  like_count: number;
  is_liked: boolean;
  profile: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export function useEpisodeComments(episodeId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['episode-comments', episodeId, user?.id],
    queryFn: async (): Promise<EpisodeComment[]> => {
      const { data: comments, error } = await supabase
        .from('episode_comments')
        .select('id, user_id, episode_id, content, created_at, parent_id')
        .eq('episode_id', episodeId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (!comments || comments.length === 0) return [];

      const commentIds = comments.map((c) => c.id);
      const userIds = [...new Set(comments.map((c) => c.user_id))];

      // Fetch profiles and likes in parallel
      const [{ data: profiles }, { data: likes }] = await Promise.all([
        supabase
          .from('profiles')
          .select('user_id, display_name, avatar_url')
          .in('user_id', userIds),
        supabase
          .from('episode_comment_likes')
          .select('comment_id, user_id')
          .in('comment_id', commentIds),
      ]);

      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

      const likeCounts = new Map<string, number>();
      const likedByMe = new Set<string>();
      for (const like of likes ?? []) {
        likeCounts.set(like.comment_id, (likeCounts.get(like.comment_id) ?? 0) + 1);
        if (like.user_id === user?.id) likedByMe.add(like.comment_id);
      }

      return comments.map((c) => ({
        ...c,
        profile: profileMap.get(c.user_id) ?? null,
        like_count: likeCounts.get(c.id) ?? 0,
        is_liked: likedByMe.has(c.id),
      }));
    },
    staleTime: 30 * 1000,
  });
}

export function useEpisodeCommentCount(episodeId: string) {
  return useQuery({
    queryKey: ['episode-comment-count', episodeId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('episode_comments')
        .select('*', { count: 'exact', head: true })
        .eq('episode_id', episodeId);
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30 * 1000,
  });
}
