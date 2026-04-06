import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface League {
  slug: string;
  name: string;
  short_name: string;
  sport: string;
  icon: string;
  primary_color: string;
  secondary_color: string;
  display_order: number;
}

export function useLeagues() {
  return useQuery({
    queryKey: ['leagues'],
    queryFn: async (): Promise<League[]> => {
      const { data, error } = await supabase
        .from('leagues')
        .select('id, slug, name, short_name, sport, icon, primary_color, secondary_color, display_order')
        .eq('is_active', true)
        .neq('slug', 'general')
        .order('display_order');
      if (error) throw error;
      return data || [];
    },
    staleTime: 30 * 60 * 1000,
  });
}

export function useAllTeams() {
    return useQuery({
      queryKey: ['all-teams'],
      queryFn: async () => {
        const { data: leaguesData, error: leaguesError } = await supabase
          .from('leagues')
          .select('id, slug');
        
        if (leaguesError) throw leaguesError;
  
        // Build a map of league id -> slug
        const leagueMap: Record<string, string> = {};
        (leaguesData || []).forEach((l: any) => { leagueMap[l.id] = l.slug; });
  
        const { data, error } = await supabase
          .from('teams')
          .select('id, name, short_name, slug, logo_url, primary_color, secondary_color, league_id, abbreviation, conference, division')
          .eq('is_active', true)
          .order('name');
  
        if (error) throw error;
  
        // Attach league_slug to each team
        return (data || []).map((t: any) => ({
          ...t,
          league_slug: leagueMap[t.league_id] || null,
        }));
      },
      staleTime: 30 * 60 * 1000,
    });
  }