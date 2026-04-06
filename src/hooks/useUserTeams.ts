import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useProfile } from './useProfile';

export interface UserTeam {
  id: string;
  name: string;
  short_name: string;
  slug: string;
  abbreviation: string | null;
  primary_color: string | null;
  logo_url: string | null;
  league_slug: string;
  city: string;
}

export function useUserTeams() {
  const { data: profile } = useProfile();
  const teamSlugs = profile?.topic_slugs || [];

  return useQuery({
    queryKey: ['user-teams', teamSlugs],
    queryFn: async (): Promise<UserTeam[]> => {
      if (teamSlugs.length === 0) return [];
      const { data: teams, error } = await supabase
        .from('teams')
        .select('id, name, short_name, slug, abbreviation, primary_color, logo_url, city, leagues!inner(slug)')
        .in('slug', teamSlugs);
      if (error) return [];
      return (teams || []).map((team: any) => ({
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
    enabled: teamSlugs.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}