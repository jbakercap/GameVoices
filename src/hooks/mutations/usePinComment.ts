import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export function useEpisodePinnedCommentId(episodeId: string) {
  return useQuery({
    queryKey: ['episode-pinned-comment', episodeId],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('episodes')
        .select('pinned_comment_id')
        .eq('id', episodeId)
        .maybeSingle();
      if (error) throw error;
      return (data as any)?.pinned_comment_id ?? null;
    },
    enabled: !!episodeId,
    staleTime: 30 * 1000,
  });
}

export function usePinComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ episodeId, commentId }: { episodeId: string; commentId: string | null }) => {
      const { error } = await supabase
        .from('episodes')
        .update({ pinned_comment_id: commentId })
        .eq('id', episodeId);
      if (error) throw error;
    },
    onSuccess: (_, { episodeId }) => {
      queryClient.invalidateQueries({ queryKey: ['episode-pinned-comment', episodeId] });
    },
  });
}
