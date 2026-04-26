import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function useToggleEpisodeLike() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ episodeId, isLiked }: { episodeId: string; isLiked: boolean }) => {
      if (!user) throw new Error('Must be logged in');

      if (isLiked) {
        const { error } = await supabase
          .from('episode_likes')
          .delete()
          .eq('episode_id', episodeId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('episode_likes')
          .insert({ episode_id: episodeId, user_id: user.id });
        if (error && error.code !== '23505') throw error;
      }
    },
    onSuccess: (_, { episodeId }) => {
      queryClient.invalidateQueries({ queryKey: ['episode-likes', episodeId] });
      queryClient.invalidateQueries({ queryKey: ['episode-liked', episodeId] });
    },
  });
}
