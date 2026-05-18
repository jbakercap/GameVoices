import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface RelatedEpisode {
  id: string;
  title: string;
  audio_url: string;
  artwork_url: string | null;
  duration_seconds: number | null;
  show_id: string;
  published_at: string;
  shows: {
    title: string;
    artwork_url: string | null;
    teams: { primary_color: string | null; slug: string | null } | null;
  } | null;
}

export function useRelatedEpisodes(teamSlugs: string[]) {
  return useQuery({
    queryKey: ['related-episodes', teamSlugs],
    queryFn: async (): Promise<RelatedEpisode[]> => {
      if (!teamSlugs.length) return [];

      // Get team IDs directly from slugs
      const { data: teams } = await supabase
        .from('teams')
        .select('id')
        .in('slug', teamSlugs);

      if (!teams?.length) return [];
      const teamIds = teams.map((t: any) => t.id);

      // Get show IDs for those teams directly
      const { data: shows } = await supabase
        .from('shows')
        .select('id')
        .in('team_id', teamIds);

      if (!shows?.length) return [];
      const showIds = shows.map((s: any) => s.id);

      // Get most recent episodes from those shows
      const { data, error } = await supabase
        .from('episodes')
        .select('id, title, audio_url, artwork_url, duration_seconds, show_id, published_at, shows(title, artwork_url, teams(primary_color, slug))')
        .in('show_id', showIds)
        .order('published_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return (data || []) as RelatedEpisode[];
    },
    enabled: teamSlugs.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
