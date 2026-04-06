import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface TrendingPlayer {
  id: string;
  name: string;
  slug: string;
  headshot_url: string | null;
  position: string | null;
  team_slug: string | null;
  sport: string | null;
  primary_color: string | null;
  logo_url: string | null;
  team_name: string | null;
  episode_count: number;
}

interface UseTrendingPlayersOptions {
  sport?: string | null;
  teamSlug?: string | null;
  teamSlugs?: string[] | null;
  followedIds?: string[];
  limit?: number;
  enabled?: boolean;
}

export function useTrendingPlayers(options: UseTrendingPlayersOptions = {}) {
  const {
    sport = null,
    teamSlug = null,
    teamSlugs = null,
    followedIds = [],
    limit = 20,
    enabled = true,
  } = options;

  return useQuery({
    queryKey: ['trending-players', sport, teamSlug, teamSlugs, followedIds, limit],
    queryFn: async (): Promise<TrendingPlayer[]> => {
      const { data, error } = await (supabase.rpc as any)('get_trending_players', {
        p_sport: sport || null,
        p_team_slug: teamSlug || null,
        p_team_slugs: teamSlugs && teamSlugs.length > 0 ? teamSlugs : null,
        p_limit: limit,
        p_followed_ids: followedIds.length > 0 ? followedIds : [],
      });

      if (error) throw error;
      return ((data as any[]) ?? []).map((row: any) => ({
        id: row.player_id,
        name: row.player_name,
        slug: row.player_slug,
        headshot_url: row.player_headshot_url,
        position: row.player_position,
        team_slug: row.player_team_slug,
        sport: row.player_sport,
        primary_color: row.team_primary_color,
        logo_url: row.team_logo_url,
        team_name: row.team_name,
        episode_count: Number(row.episode_count),
      }));
    },
    enabled,
    staleTime: 1000 * 60 * 5,
  });
}