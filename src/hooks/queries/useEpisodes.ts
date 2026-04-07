import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface EpisodeWithShow {
  id: string;
  title: string;
  artwork_url: string | null;
  audio_url: string;
  duration_seconds: number | null;
  published_at: string | null;
  show_id: string;
  topic_slug: string | null;
  shows: {
    id: string;
    title: string;
    artwork_url: string | null;
    episode_count: number | null;
  } | null;
}

interface UseEpisodesOptions {
  limit?: number;
  showId?: string;
  cursor?: string;
}

export function useEpisodes(options: UseEpisodesOptions = {}) {
  const { limit = 20, showId, cursor } = options;

  return useQuery({
    queryKey: ['episodes', { limit, showId, cursor }],
    queryFn: async (): Promise<EpisodeWithShow[]> => {
      let query = supabase
        .from('episodes')
        .select(`
          id, title, artwork_url, audio_url, duration_seconds, published_at, show_id, topic_slug,
          shows (id, title, artwork_url, episode_count)
        `)
        .order('published_at', { ascending: false })
        .limit(limit);

      if (showId) query = (query as any).eq('show_id', showId);
      if (cursor) query = (query as any).lt('published_at', cursor);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as EpisodeWithShow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useShowEpisodes(showId: string, limit = 50) {
  return useEpisodes({ showId, limit });
}
