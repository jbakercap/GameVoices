import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface AddPearlParams {
  episodeId: string;
  timestampSeconds: number;
  note?: string;
}

export function useAddPearl() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ episodeId, timestampSeconds, note }: AddPearlParams) => {
      if (!user) throw new Error('Must be logged in');
      const { data, error } = await supabase
        .from('bookmarks')
        .insert({ user_id: user.id, episode_id: episodeId, timestamp_seconds: timestampSeconds, note: note || null })
        .select()
        .single();
      if (error) {
        if (error.code === '23505') throw new Error('You already saved this moment');
        throw error;
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      queryClient.invalidateQueries({ queryKey: ['bookmarksCount'] });
    },
    onError: (error: Error) => {
      console.error('Failed to save moment:', error);
    },
  });
}
