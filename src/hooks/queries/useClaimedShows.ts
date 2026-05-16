import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface ClaimedShow {
  id: string;
  title: string;
  artwork_url: string | null;
}

export function useClaimedShows(userId: string | undefined) {
  return useQuery({
    queryKey: ['claimed-shows', userId],
    queryFn: async (): Promise<ClaimedShow[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('shows')
        .select('id, title, artwork_url')
        .eq('claimed_by_user_id', userId)
        .eq('claim_status', 'approved');
      if (error) throw error;
      return (data as ClaimedShow[]) ?? [];
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
