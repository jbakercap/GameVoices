import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface AppNotification {
  id: string;
  type: 'comment_reply' | 'comment_like';
  episode_id: string | null;
  comment_id: string | null;
  read: boolean;
  created_at: string;
  actor: {
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  episode_title: string | null;
}

export function useNotifications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: async (): Promise<AppNotification[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('notifications')
        .select('id, type, episode_id, comment_id, read, created_at, actor_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      if (!data || data.length === 0) return [];

      const actorIds = [...new Set(data.map((n) => n.actor_id))];
      const episodeIds = [...new Set(data.map((n) => n.episode_id).filter(Boolean))] as string[];

      const [{ data: profiles }, { data: episodes }] = await Promise.all([
        supabase.from('profiles').select('user_id, display_name, avatar_url').in('user_id', actorIds),
        episodeIds.length > 0
          ? supabase.from('episodes').select('id, title').in('id', episodeIds)
          : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      ]);

      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
      const episodeMap = new Map((episodes ?? []).map((e) => [e.id, e.title]));

      return data.map((n) => ({
        id: n.id,
        type: n.type as AppNotification['type'],
        episode_id: n.episode_id,
        comment_id: n.comment_id,
        read: n.read,
        created_at: n.created_at,
        actor: profileMap.get(n.actor_id) ?? null,
        episode_title: n.episode_id ? (episodeMap.get(n.episode_id) ?? null) : null,
      }));
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });
}

export function useUnreadNotificationCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications-unread-count', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}
