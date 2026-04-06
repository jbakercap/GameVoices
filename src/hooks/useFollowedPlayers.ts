import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Remove the FollowedPlayer interface definition, replace with:
export type { FollowedPlayer } from '../types/player';
import type { FollowedPlayer } from '../types/player';

export function useFollowedPlayers() {
  return useQuery({
    queryKey: ['followedPlayers'],
    queryFn: async (): Promise<FollowedPlayer[]> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return [];

      const { data: libraryData, error: libraryError } = await supabase
        .from('user_library')
        .select('player_id, created_at')
        .eq('user_id', session.user.id)
        .eq('item_type', 'follow_player')
        .not('player_id', 'is', null);

      if (libraryError) throw libraryError;
      if (!libraryData || libraryData.length === 0) return [];

      const playerIds = libraryData
        .map((item: any) => item.player_id)
        .filter(Boolean) as string[];
      const followDates = new Map(
        libraryData.map((item: any) => [item.player_id, item.created_at])
      );

      const { data: playersData, error: playersError } = await supabase
        .from('players')
        .select('id, name, slug, headshot_url, team_slug, position, jersey_number')
        .in('id', playerIds);

      if (playersError) throw playersError;
      if (!playersData) return [];

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: storyCounts } = await supabase
        .from('player_stories')
        .select('player_id, stories!inner(created_at)')
        .in('player_id', playerIds)
        .gte('stories.created_at', sevenDaysAgo.toISOString());

      const countMap = new Map<string, number>();
      for (const row of storyCounts || []) {
        countMap.set(row.player_id, (countMap.get(row.player_id) || 0) + 1);
      }

      return playersData.map((player: any) => ({
        id: player.id,
        name: player.name,
        slug: player.slug,
        headshot_url: player.headshot_url,
        team_slug: player.team_slug,
        position: player.position,
        jersey_number: player.jersey_number,
        followed_at: followDates.get(player.id) || '',
        recent_story_count: countMap.get(player.id) || 0,
      }));
    },
    staleTime: 2 * 60 * 1000,
  });
}

export function useIsFollowingPlayer(playerId: string | undefined) {
  const { data: followedPlayers = [] } = useFollowedPlayers();
  return playerId ? followedPlayers.some((p) => p.id === playerId) : false;
}