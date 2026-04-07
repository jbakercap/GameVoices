import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export function useRemoveFromPlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ playlistId, itemId }: { playlistId: string; itemId: string }) => {
      const { error } = await supabase.from('playlist_items').delete().eq('id', itemId);
      if (error) throw error;
      await supabase.from('playlists').update({ updated_at: new Date().toISOString() }).eq('id', playlistId);
    },
    onSuccess: (_, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
    onError: (error) => {
      console.error('Remove from playlist error:', error);
    },
  });
}
