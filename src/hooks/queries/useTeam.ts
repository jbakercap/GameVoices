import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface TeamWithLeague {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  city: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  espn_team_id: number | null;
  record: string | null;
  streak: string | null;
  leagues: {
    id: string;
    slug: string;
    short_name: string;
    name: string;
  } | null;
}

export function useTeam(teamSlug: string | undefined) {
  return useQuery({
    queryKey: ['team', teamSlug],
    queryFn: async (): Promise<TeamWithLeague | null> => {
      const { data, error } = await supabase
        .from('teams')
        .select(`
          id, slug, name, short_name, city,
          logo_url, primary_color, secondary_color, espn_team_id,
          record, streak,
          leagues (id, slug, short_name, name)
        `)
        .eq('slug', teamSlug)
        .maybeSingle();

      if (error) throw error;
      return data as TeamWithLeague | null;
    },
    enabled: !!teamSlug,
    staleTime: 10 * 60 * 1000,
  });
}
