import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface PublicHistoryItem {
  episode_id: string;
  listened_at: string;
  title: string | null;
  artwork_url: string | null;
  show_title: string | null;
  show_artwork_url: string | null;
}

export interface PublicFollowedShow {
  id: string;
  title: string;
  artwork_url: string | null;
}

export function usePublicListenHistory(userId: string | undefined, limit = 10) {
  return useQuery({
    queryKey: ['public-listen-history', userId, limit],
    queryFn: async (): Promise<PublicHistoryItem[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_listen_history')
        .select(`
          episode_id,
          listened_at,
          episodes (
            title,
            artwork_url,
            shows ( title, artwork_url )
          )
        `)
        .eq('user_id', userId)
        .order('listened_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        episode_id: row.episode_id,
        listened_at: row.listened_at,
        title: row.episodes?.title ?? null,
        artwork_url: row.episodes?.artwork_url ?? null,
        show_title: row.episodes?.shows?.title ?? null,
        show_artwork_url: row.episodes?.shows?.artwork_url ?? null,
      }));
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
}

export function usePublicFollowedShows(userId: string | undefined) {
  return useQuery({
    queryKey: ['public-followed-shows', userId],
    queryFn: async (): Promise<PublicFollowedShow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_library')
        .select('shows ( id, title, artwork_url )')
        .eq('user_id', userId)
        .eq('item_type', 'follow')
        .not('show_id', 'is', null);

      if (error) throw error;
      return (data ?? [])
        .map((row: any) => row.shows)
        .filter((s: any): s is PublicFollowedShow => s !== null);
    },
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
  });
}

export function usePublicListenCount(userId: string | undefined) {
  return useQuery({
    queryKey: ['public-listen-count', userId],
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from('user_listen_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePublicCommentCount(userId: string | undefined) {
  return useQuery({
    queryKey: ['public-comment-count', userId],
    queryFn: async (): Promise<number> => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from('episode_comments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .is('parent_id', null);
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
