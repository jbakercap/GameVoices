import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface UserComment {
  id: string;
  content: string;
  created_at: string;
  like_count: number;
  reply_count: number;
  episode_id: string;
  episode_title: string | null;
  duration_seconds: number | null;
  audio_url: string | null;
  show_id: string | null;
  show_title: string | null;
  show_artwork_url: string | null;
  artwork_url: string | null;
  team_color: string | null;
}

export function useUserComments(userId: string | undefined, limit = 3) {
  return useQuery({
    queryKey: ['user-comments', userId, limit],
    queryFn: async (): Promise<UserComment[]> => {
      if (!userId) return [];

      // Step 1: fetch comments
      const { data: comments, error } = await supabase
        .from('episode_comments')
        .select('id, content, created_at, episode_id')
        .eq('user_id', userId)
        .is('parent_id', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      if (!comments || comments.length === 0) return [];

      const commentIds = comments.map((c: any) => c.id);
      const episodeIds = [...new Set(comments.map((c: any) => c.episode_id).filter(Boolean))];

      // Step 2: fetch episode data, like counts, and reply counts in parallel
      const [{ data: episodes }, { data: likes }, { data: replies }] = await Promise.all([
        supabase
          .from('episodes')
          .select('id, title, artwork_url, audio_url, duration_seconds, show_id, shows ( title, artwork_url, teams ( primary_color ) )')
          .in('id', episodeIds),
        supabase
          .from('episode_comment_likes')
          .select('comment_id')
          .in('comment_id', commentIds),
        supabase
          .from('episode_comments')
          .select('parent_id')
          .in('parent_id', commentIds),
      ]);

      const episodeMap = new Map((episodes ?? []).map((e: any) => [e.id, e]));

      const likeCounts = new Map<string, number>();
      for (const like of likes ?? []) {
        likeCounts.set(like.comment_id, (likeCounts.get(like.comment_id) ?? 0) + 1);
      }

      const replyCounts = new Map<string, number>();
      for (const reply of replies ?? []) {
        replyCounts.set(reply.parent_id, (replyCounts.get(reply.parent_id) ?? 0) + 1);
      }

      return comments.map((row: any) => {
        const ep = episodeMap.get(row.episode_id);
        return {
          id: row.id,
          content: row.content,
          created_at: row.created_at,
          like_count: likeCounts.get(row.id) ?? 0,
          reply_count: replyCounts.get(row.id) ?? 0,
          episode_id: row.episode_id,
          episode_title: ep?.title ?? null,
          duration_seconds: ep?.duration_seconds ?? null,
          audio_url: ep?.audio_url ?? null,
          show_id: ep?.show_id ?? null,
          show_title: ep?.shows?.title ?? null,
          show_artwork_url: ep?.shows?.artwork_url ?? null,
          artwork_url: ep?.artwork_url ?? null,
          team_color: ep?.shows?.teams?.primary_color ?? null,
        };
      });
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
}
