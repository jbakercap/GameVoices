import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function useSaveStory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ storyId, isSaved }: { storyId: string; isSaved: boolean }) => {
      if (!user) throw new Error('Must be logged in');

      if (isSaved) {
        const { error } = await (supabase.from('user_library') as any)
          .delete()
          .eq('user_id', user.id)
          .eq('story_id', storyId)
          .eq('item_type', 'story_save');
        if (error) throw error;
        return { action: 'unsaved' as const };
      } else {
        const { error } = await (supabase.from('user_library') as any)
          .insert({ user_id: user.id, story_id: storyId, item_type: 'story_save' });
        if (error) throw error;
        return { action: 'saved' as const };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['savedStories'] });
      queryClient.invalidateQueries({ queryKey: ['userLibrary'] });
    },
    onError: (error) => {
      console.error('Save story error:', error);
    },
  });
}
