import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function useToggleCommentLike() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      commentId,
      episodeId,
      isLiked,
      commentAuthorId,
    }: {
      commentId: string;
      episodeId: string;
      isLiked: boolean;
      commentAuthorId?: string;
    }) => {
      if (!user) throw new Error('Must be logged in');

      if (isLiked) {
        const { error } = await supabase
          .from('episode_comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('episode_comment_likes')
          .insert({ comment_id: commentId, user_id: user.id });
        if (error && error.code !== '23505') throw error;

        // Notify comment author on like (fire-and-forget)
        if (commentAuthorId && commentAuthorId !== user.id) {
          supabase.functions.invoke('send-notification', {
            body: {
              userId: commentAuthorId,
              actorId: user.id,
              type: 'comment_like',
              episodeId,
              commentId,
            },
          }).catch(console.warn);
        }
      }
    },
    onSuccess: (_, { episodeId }) => {
      queryClient.invalidateQueries({ queryKey: ['episode-comments', episodeId] });
    },
  });
}
