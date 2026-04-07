import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface CreatePlaylistParams {
  name: string;
  description?: string;
  isPublic?: boolean;
}

export function useCreatePlaylist() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, description, isPublic }: CreatePlaylistParams) => {
      if (!user) throw new Error('Must be logged in');

      const { data, error } = await supabase
        .from('playlists')
        .insert({
          user_id: user.id,
          name,
          description: description || null,
          is_public: isPublic || false,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
    },
    onError: (error) => {
      console.error('Create playlist error:', error);
    },
  });
}
