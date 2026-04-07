import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface StartClaimData {
  show_id: string;
  verification_method: 'self_attestation' | 'email';
  manual_explanation?: string;
}

export function useStartClaim() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: StartClaimData) => {
      if (!user) throw new Error('You must be logged in to claim a podcast');
      const { data: response, error } = await supabase.functions.invoke('send-claim-verification', {
        body: {
          show_id: data.show_id,
          verification_method: data.verification_method,
          manual_explanation: data.manual_explanation,
        },
      });
      if (error) throw new Error(response?.error || error.message || 'Failed to start claim');
      return response;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['my-claim-for-show', variables.show_id] });
      queryClient.invalidateQueries({ queryKey: ['my-claims'] });
    },
    onError: (error) => {
      console.error('Claim error:', error);
    },
  });
}

export function useMyClaimForShow(showId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-claim-for-show', showId, user?.id],
    queryFn: async () => {
      if (!user || !showId) return null;
      const { data, error } = await supabase
        .from('podcast_claims')
        .select('id, user_id, show_id, status, verification_method, submitted_at, admin_notes')
        .eq('show_id', showId)
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!showId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useMyClaims() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-claims', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('podcast_claims')
        .select(`id, show_id, status, verification_method, submitted_at, admin_notes, shows (id, title, artwork_url)`)
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}
