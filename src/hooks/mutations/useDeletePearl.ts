import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function useDeletePearl() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pearlId: string) => {
      if (!user) throw new Error('Must be logged in');
      const { error } = await supabase
        .from('bookmarks')
        .delete()
        .eq('id', pearlId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarksCount'] });
    },
    onError: () => {
      console.error('Failed to delete moment');
    },
  });
}
