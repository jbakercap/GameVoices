import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function useAddEpisodeComment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      episodeId,
      content,
      parentId,
    }: {
      episodeId: string;
      content: string;
      parentId?: string;
    }) => {
      if (!user) throw new Error('Must be logged in');
      const { error } = await supabase.from('episode_comments').insert({
        episode_id: episodeId,
        user_id: user.id,
        content: content.trim(),
        parent_id: parentId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_, { episodeId }) => {
      queryClient.invalidateQueries({ queryKey: ['episode-comments', episodeId] });
      queryClient.invalidateQueries({ queryKey: ['episode-comment-count', episodeId] });
    },
  });
}
