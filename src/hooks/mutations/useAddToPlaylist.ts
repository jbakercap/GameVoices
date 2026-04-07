import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

interface AddToPlaylistParams {
  playlistId: string;
  episodeId: string;
}

export function useAddToPlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ playlistId, episodeId }: AddToPlaylistParams) => {
      const { data: existing } = await supabase
        .from('playlist_items')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1);

      const nextPosition = ((existing as any)?.[0]?.position ?? -1) + 1;

      const { error } = await supabase
        .from('playlist_items')
        .insert({ playlist_id: playlistId, episode_id: episodeId, position: nextPosition });

      if (error) {
        if (error.code === '23505') throw new Error('Episode already in playlist');
        throw error;
      }

      await supabase.from('playlists').update({ updated_at: new Date().toISOString() }).eq('id', playlistId);
    },
    onSuccess: (_, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
    onError: (error) => {
      console.error('Add to playlist error:', error);
    },
  });
}
