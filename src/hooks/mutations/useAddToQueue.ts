import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function useAddToQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (episodeId: string) => {
      if (!user) throw new Error('Must be logged in');

      const { data: existing } = await supabase
        .from('user_queue')
        .select('position')
        .eq('user_id', user.id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextPosition = (existing?.position ?? 0) + 1;

      const { error } = await supabase
        .from('user_queue')
        .insert({ user_id: user.id, episode_id: episodeId, position: nextPosition });

      if (error) {
        if (error.code === '23505') throw new Error('Episode is already in queue');
        throw error;
      }
      return { position: nextPosition };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (error) => {
      console.error('Add to queue error:', error);
    },
  });
}
