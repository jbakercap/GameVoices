import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface RecentEpisode {
  id: string;
  title: string;
  artwork_url: string | null;
  audio_url: string;
  duration_seconds: number;
  published_at: string | null;
  show_id: string;
  show_title: string | null;
  show_artwork_url: string | null;
}

export function useRecentTeamEpisodes(teamSlugs: string[]) {
  return useQuery({
    queryKey: ['recent-team-episodes', teamSlugs.slice().sort().join(',')],
    queryFn: async (): Promise<RecentEpisode[]> => {
      if (teamSlugs.length === 0) return [];

      // Step 1: get show IDs for followed teams
      const { data: showsData, error: showsError } = await supabase
        .from('shows')
        .select('id')
        .in('status', ['active', 'stale'])
        .overlaps('team_slugs', teamSlugs);

      if (showsError) throw showsError;
      const showIds = (showsData || []).map((s: any) => s.id);
      if (showIds.length === 0) return [];

      // Step 2: get most recent episodes from those shows
      const { data, error } = await supabase
        .from('episodes')
        .select(`
          id, title, artwork_url, audio_url, duration_seconds, published_at, show_id,
          show:shows(id, title, artwork_url)
        `)
        .in('show_id', showIds)
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(15);

      if (error) throw error;

      return (data || []).map((ep: any) => ({
        id: ep.id,
        title: ep.title,
        artwork_url: ep.artwork_url || ep.show?.artwork_url || null,
        audio_url: ep.audio_url,
        duration_seconds: ep.duration_seconds || 0,
        published_at: ep.published_at,
        show_id: ep.show_id,
        show_title: ep.show?.title || null,
        show_artwork_url: ep.show?.artwork_url || null,
      }));
    },
    enabled: teamSlugs.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
