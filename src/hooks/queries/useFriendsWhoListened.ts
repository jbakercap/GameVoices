import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface ListenerProfile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
}

export function useFriendsWhoListened(episodeId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['friends-listened', user?.id, episodeId],
    queryFn: async (): Promise<ListenerProfile[]> => {
      if (!user) return [];

      const { data: follows, error: followError } = await supabase
        .from('user_follows')
        .select('following_id')
        .eq('follower_id', user.id);

      if (followError) throw followError;
      if (!follows || follows.length === 0) return [];

      const followingIds = follows.map((r) => r.following_id);

      const { data: listens, error: listenError } = await supabase
        .from('user_listen_history')
        .select('user_id')
        .eq('episode_id', episodeId)
        .in('user_id', followingIds);

      if (listenError) throw listenError;
      if (!listens || listens.length === 0) return [];

      const listenerIds = [...new Set(listens.map((l) => l.user_id))];

      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', listenerIds)
        .limit(5);

      if (profileError) throw profileError;

      return profiles ?? [];
    },
    enabled: !!user && !!episodeId,
    staleTime: 60 * 1000,
  });
}
