import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { UserTeam } from '../useUserTeams';

export function useTeamsBySlug(slugs: string[] | null | undefined) {
  return useQuery({
    queryKey: ['teams-by-slug', (slugs ?? []).slice().sort().join(',')],
    queryFn: async (): Promise<UserTeam[]> => {
      if (!slugs || slugs.length === 0) return [];
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, short_name, slug, abbreviation, primary_color, logo_url, city, leagues!inner(slug)')
        .in('slug', slugs);
      if (error) return [];
      return (data ?? []).map((team: any) => ({
        id: team.id,
        name: team.name,
        short_name: team.short_name,
        slug: team.slug,
        abbreviation: team.abbreviation,
        primary_color: team.primary_color,
        logo_url: team.logo_url,
        league_slug: team.leagues?.slug || '',
        city: team.city,
      }));
    },
    enabled: !!slugs && slugs.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}
