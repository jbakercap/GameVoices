import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface SearchResult {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export function useSearchProfiles(query: string) {
  const { user } = useAuth();
  const trimmed = query.trim().toLowerCase();

  return useQuery({
    queryKey: ['search-profiles', trimmed],
    queryFn: async (): Promise<SearchResult[]> => {
      if (!user || trimmed.length < 2) return [];

      // Search by display_name or username (case-insensitive)
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, username, avatar_url')
        .or(`display_name.ilike.%${trimmed}%,username.ilike.%${trimmed}%`)
        .neq('user_id', user.id)
        .limit(20);

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && trimmed.length >= 2,
    staleTime: 15 * 1000,
  });
}
