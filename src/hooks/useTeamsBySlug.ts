import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface Team {
  id: string;
  name: string;
  short_name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
}

export function useTeamsBySlug(slugs: string[]) {
  return useQuery({
    queryKey: ['teams-by-slug', slugs],
    queryFn: async (): Promise<Team[]> => {
      if (slugs.length === 0) return [];
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, short_name, slug, logo_url, primary_color')
        .in('slug', slugs);
      if (error) throw error;
      return data || [];
    },
    enabled: slugs.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}