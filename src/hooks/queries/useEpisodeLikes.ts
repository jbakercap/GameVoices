import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function useEpisodeLikes(episodeId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['episode-likes', episodeId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('episode_likes')
        .select('*', { count: 'exact', head: true })
        .eq('episode_id', episodeId);

      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 30 * 1000,
  });
}

export function useIsEpisodeLiked(episodeId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['episode-liked', episodeId, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from('episode_likes')
        .select('id')
        .eq('episode_id', episodeId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });
}
