import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface PublicProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  topic_slugs: string[] | null;
  created_at: string | null;
}

export function usePublicProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['public-profile', userId],
    queryFn: async (): Promise<PublicProfile | null> => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, bio, topic_slugs, created_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
  });
}
