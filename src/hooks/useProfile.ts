import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface Profile {
  id: string;
  topic_slugs: string[];
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  twitter_handle: string | null;
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async (): Promise<Profile | null> => {
      const { data: { session } } = await supabase.auth.getSession();
      
      
      if (!session?.user) return null;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, topic_slugs, display_name, avatar_url, bio, twitter_handle')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}