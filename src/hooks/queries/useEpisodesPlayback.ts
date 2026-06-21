import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface PlaybackMap {
  [episodeId: string]: {
    position_seconds: number;
    completed: boolean;
  };
}

export function useEpisodesPlayback(episodeIds: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['episodesPlayback', user?.id, episodeIds.slice().sort().join(',')],
    queryFn: async (): Promise<PlaybackMap> => {
      if (!user || episodeIds.length === 0) return {};
      const { data, error } = await supabase
        .from('user_listen_history')
        .select('episode_id, position_seconds, completed')
        .eq('user_id', user.id)
        .in('episode_id', episodeIds)
        .order('listened_at', { ascending: false });
      if (error) throw error;
      const map: PlaybackMap = {};
      // Only keep the most recent entry per episode
      (data || []).forEach((row: any) => {
        if (!map[row.episode_id]) {
          map[row.episode_id] = {
            position_seconds: row.position_seconds || 0,
            completed: row.completed || false,
          };
        }
      });
      return map;
    },
    enabled: !!user && episodeIds.length > 0,
    staleTime: 30 * 1000,
  });
}
