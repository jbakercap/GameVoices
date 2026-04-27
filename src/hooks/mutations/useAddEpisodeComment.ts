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
      parentCommentUserId,
    }: {
      episodeId: string;
      content: string;
      parentId?: string;
      parentCommentUserId?: string;
    }) => {
      if (!user) throw new Error('Must be logged in');

      const { data: comment, error } = await supabase
        .from('episode_comments')
        .insert({
          episode_id: episodeId,
          user_id: user.id,
          content: content.trim(),
          parent_id: parentId ?? null,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Notify parent comment's author on reply (fire-and-forget)
      if (parentId && parentCommentUserId && parentCommentUserId !== user.id) {
        supabase.functions.invoke('send-notification', {
          body: {
            userId: parentCommentUserId,
            actorId: user.id,
            type: 'comment_reply',
            episodeId,
            commentId: comment.id,
          },
        }).catch(console.warn);
      }
    },
    onSuccess: (_, { episodeId }) => {
      queryClient.invalidateQueries({ queryKey: ['episode-comments', episodeId] });
      queryClient.invalidateQueries({ queryKey: ['episode-comment-count', episodeId] });
    },
  });
}
