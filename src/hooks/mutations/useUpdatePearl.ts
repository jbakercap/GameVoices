import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface UpdatePearlParams {
  pearlId: string;
  note: string | null;
}

export function useUpdatePearl() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pearlId, note }: UpdatePearlParams) => {
      if (!user) throw new Error('Must be logged in');
      const { data, error } = await supabase
        .from('bookmarks')
        .update({ note })
        .eq('id', pearlId)
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
    },
    onError: () => {
      console.error('Failed to update note');
    },
  });
}
