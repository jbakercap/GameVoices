import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export function useSyncBuzz(teamId: string | undefined) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['sync-buzz', teamId],
    queryFn: async () => {
      const { data: team } = await supabase
        .from('teams')
        .select('x_cache_refreshed_at')
        .eq('id', teamId!)
        .single();

      const ageMinutes = team?.x_cache_refreshed_at
        ? (Date.now() - new Date(team.x_cache_refreshed_at).getTime()) / 1000 / 60
        : Infinity;

      if (ageMinutes > 5) {
        await supabase.functions.invoke('fetch-x-feed', {
          body: { mode: 'team', team_id: teamId, unfiltered: true, force: true },
        });
      }

      queryClient.invalidateQueries({ queryKey: ['team-buzz-feed', teamId] });
      return { syncedAt: Date.now() };
    },
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: true,
  });
}
