import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface Bookmark {
  id: string;
  user_id: string;
  episode_id: string;
  timestamp_seconds: number;
  note: string | null;
  created_at: string;
  episodes: {
    id: string;
    title: string;
    artwork_url: string | null;
    audio_url: string;
    show_id: string;
    shows: {
      id: string;
      title: string;
      artwork_url: string | null;
    } | null;
  } | null;
}

export function useBookmarks() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['bookmarks', user?.id],
    queryFn: async (): Promise<Bookmark[]> => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('bookmarks')
        .select(`
          id, user_id, episode_id, timestamp_seconds, note, created_at,
          episodes (
            id, title, artwork_url, audio_url, show_id,
            shows ( id, title, artwork_url )
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as Bookmark[];
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

export function useBookmarksCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['bookmarksCount', user?.id],
    queryFn: async (): Promise<number> => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('bookmarks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}
