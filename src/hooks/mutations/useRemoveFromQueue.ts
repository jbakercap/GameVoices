import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function useRemoveFromQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (episodeId: string) => {
      if (!user) throw new Error('Must be logged in');

      const { data: removedItem } = await supabase
        .from('user_queue')
        .select('position')
        .eq('user_id', user.id)
        .eq('episode_id', episodeId)
        .maybeSingle();

      if (!removedItem) throw new Error('Episode not in queue');

      const { error } = await supabase
        .from('user_queue')
        .delete()
        .eq('user_id', user.id)
        .eq('episode_id', episodeId);

      if (error) throw error;

      // Reorder remaining items
      const { data: itemsToUpdate } = await supabase
        .from('user_queue')
        .select('id, position')
        .eq('user_id', user.id)
        .gt('position', removedItem.position)
        .order('position', { ascending: true });

      if (itemsToUpdate && itemsToUpdate.length > 0) {
        for (const item of itemsToUpdate) {
          await supabase.from('user_queue').update({ position: item.position - 1 }).eq('id', item.id);
        }
      }

      return { removed: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
    onError: (error) => {
      console.error('Remove from queue error:', error);
    },
  });
}

export function useClearQueue() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Must be logged in');
      const { error } = await supabase.from('user_queue').delete().eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue'] });
    },
  });
}
