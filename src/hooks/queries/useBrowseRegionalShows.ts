import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface BrowseShow {
  id: string;
  title: string;
  artwork_url: string | null;
  episode_count: number | null;
}

/**
 * Regional shows: shows that cover 2+ teams (multi-team regional coverage).
 * Filtered by league when a sport is selected.
 */
export function useBrowseRegionalShows(sport?: string) {
  return useQuery({
    queryKey: ['browse-regional-shows', sport || 'all'],
    queryFn: async (): Promise<BrowseShow[]> => {
      let query = supabase
        .from('shows')
        .select('id, title, artwork_url, episode_count, team_slugs, league_id')
        .in('status', ['active', 'stale'])
        .eq('is_fantasy_show', false)
        .eq('is_betting_show', false)
        .not('team_slugs', 'is', null)
        .order('episode_count', { ascending: false })
        .limit(100);

      if (sport && sport !== 'all') {
        const { data: league } = await supabase
          .from('leagues')
          .select('id')
          .eq('slug', sport)
          .single();
        if (league) {
          query = query.eq('league_id', (league as any).id);
        }
      }

      const { data, error } = await query;
      if (error) return [];

      // Filter to only multi-team shows (2+ team_slugs)
      const regional = (data || [])
        .filter((s: any) => Array.isArray(s.team_slugs) && s.team_slugs.length >= 2)
        .slice(0, 20);

      return regional.map(({ id, title, artwork_url, episode_count }: any) => ({
        id,
        title,
        artwork_url,
        episode_count,
      }));
    },
    staleTime: 10 * 60 * 1000,
  });
}
