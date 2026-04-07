import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function useSaveEpisode() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ episodeId, isSaved }: { episodeId: string; isSaved: boolean }) => {
      if (!user) throw new Error('Must be logged in');

      if (isSaved) {
        const { error } = await supabase
          .from('user_library')
          .delete()
          .eq('user_id', user.id)
          .eq('episode_id', episodeId)
          .eq('item_type', 'save');
        if (error) throw error;
        return { action: 'unsaved' as const };
      } else {
        const { error } = await supabase
          .from('user_library')
          .insert({ user_id: user.id, episode_id: episodeId, item_type: 'save' });
        if (error) throw error;
        return { action: 'saved' as const };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userLibrary'] });
    },
    onError: (error) => {
      console.error('Save episode error:', error);
    },
  });
}
