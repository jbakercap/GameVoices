import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface PopularEpisode {
  id: string;
  title: string;
  artwork_url: string | null;
  audio_url: string;
  duration_seconds: number | null;
  published_at: string | null;
  shows: {
    id: string;
    title: string;
    artwork_url: string | null;
  } | null;
}

export function useBrowsePopularEpisodes(leagueSlug?: string) {
  return useQuery({
    queryKey: ['browse-popular-episodes', leagueSlug || 'all'],
    queryFn: async (): Promise<PopularEpisode[]> => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let leagueIds: string[] = [];
      if (leagueSlug && leagueSlug !== 'all') {
        const { data: league } = await supabase
          .from('leagues')
          .select('id')
          .eq('slug', leagueSlug)
          .single();
        if (!league) return [];
        leagueIds = [(league as any).id];
      }

      let query = supabase
        .from('episodes')
        .select('id, title, artwork_url, audio_url, duration_seconds, published_at, shows!inner(id, title, artwork_url)')
        .gte('published_at', yesterday)
        .eq('shows.status', 'active')
        .order('published_at', { ascending: false })
        .limit(10);

      if (leagueIds.length === 1) {
        query = query.eq('shows.league_id', leagueIds[0]);
      }

      const { data, error } = await query;
      if (error) return [];

      return (data || []).map((ep: any) => ({
        id: ep.id,
        title: ep.title,
        artwork_url: ep.artwork_url,
        audio_url: ep.audio_url || '',
        duration_seconds: ep.duration_seconds,
        published_at: ep.published_at,
        shows: ep.shows
          ? { id: ep.shows.id, title: ep.shows.title, artwork_url: ep.shows.artwork_url }
          : null,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}
