import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export function useToggleFollowPlayer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      playerId,
      isFollowing,
    }: {
      playerId: string;
      isFollowing: boolean;
    }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');

      if (isFollowing) {
        const { error } = await supabase
          .from('user_library')
          .delete()
          .eq('user_id', session.user.id)
          .eq('player_id', playerId)
          .eq('item_type', 'follow_player');
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_library')
          .insert({
            user_id: session.user.id,
            player_id: playerId,
            item_type: 'follow_player',
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followedPlayers'] });
    },
  });
}