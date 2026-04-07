import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function useFollowSpeaker() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ speakerId, isFollowing }: { speakerId: string; isFollowing: boolean }) => {
      if (!user) throw new Error('Not authenticated');

      if (isFollowing) {
        const { error } = await supabase
          .from('user_library')
          .delete()
          .eq('user_id', user.id)
          .eq('speaker_id', speakerId)
          .eq('item_type', 'follow_speaker');
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_library')
          .insert({ user_id: user.id, speaker_id: speakerId, item_type: 'follow_speaker' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userLibrary'] });
      queryClient.invalidateQueries({ queryKey: ['followedSpeakers'] });
    },
    onError: (error) => {
      console.error('Follow speaker error:', error);
    },
  });
}
