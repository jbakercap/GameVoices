import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useFriends } from './useFriendships';

export interface FriendActivity {
  id: string;
  type: 'listened' | 'commented';
  userId: string;
  display_name: string | null;
  avatar_url: string | null;
  timestamp: string;
  episode: {
    id: string;
    title: string;
    artwork_url: string | null;
    show_id: string;
    show_title: string | null;
    show_artwork_url: string | null;
    audio_url: string;
    duration_seconds: number | null;
  };
  commentText?: string;
}

export function useFriendActivity() {
  const { user } = useAuth();
  const { data: friends = [] } = useFriends(user?.id);
  const friendIds = friends.map((f) => f.userId);

  return useQuery({
    queryKey: ['friend-activity', user?.id, friendIds.sort().join(',')],
    queryFn: async (): Promise<FriendActivity[]> => {
      if (!user || friendIds.length === 0) return [];

      // Fetch listens and comments in parallel
      const [listensResult, commentsResult] = await Promise.all([
        supabase
          .from('user_listen_history')
          .select(`
            id, user_id, listened_at,
            episodes (
              id, title, artwork_url, audio_url, duration_seconds, show_id,
              shows (id, title, artwork_url)
            )
          `)
          .in('user_id', friendIds)
          .order('listened_at', { ascending: false })
          .limit(30),

        supabase
          .from('episode_comments')
          .select(`
            id, user_id, content, created_at, episode_id,
            episodes:episode_id (
              id, title, artwork_url, audio_url, duration_seconds, show_id,
              shows (id, title, artwork_url)
            )
          `)
          .in('user_id', friendIds)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      if (listensResult.error) throw listensResult.error;
      if (commentsResult.error) throw commentsResult.error;

      // Build profile lookup from friends data
      const profileMap = new Map(
        friends.map((f) => [f.userId, { display_name: f.display_name, avatar_url: f.avatar_url }])
      );

      const activities: FriendActivity[] = [];

      // Map listens
      for (const item of listensResult.data || []) {
        const ep = item.episodes as any;
        if (!ep) continue;
        const profile = profileMap.get(item.user_id);
        activities.push({
          id: `listen-${item.id}`,
          type: 'listened',
          userId: item.user_id,
          display_name: profile?.display_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
          timestamp: item.listened_at,
          episode: {
            id: ep.id,
            title: ep.title,
            artwork_url: ep.artwork_url,
            show_id: ep.show_id,
            show_title: ep.shows?.title ?? null,
            show_artwork_url: ep.shows?.artwork_url ?? null,
            audio_url: ep.audio_url,
            duration_seconds: ep.duration_seconds,
          },
        });
      }

      // Map comments
      for (const item of commentsResult.data || []) {
        const ep = (item as any).episodes;
        if (!ep) continue;
        const profile = profileMap.get(item.user_id);
        activities.push({
          id: `comment-${item.id}`,
          type: 'commented',
          userId: item.user_id,
          display_name: profile?.display_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
          timestamp: item.created_at,
          commentText: item.content,
          episode: {
            id: ep.id,
            title: ep.title,
            artwork_url: ep.artwork_url,
            show_id: ep.show_id,
            show_title: ep.shows?.title ?? null,
            show_artwork_url: ep.shows?.artwork_url ?? null,
            audio_url: ep.audio_url,
            duration_seconds: ep.duration_seconds,
          },
        });
      }

      // Sort by timestamp descending, limit to 50
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      return activities.slice(0, 50);
    },
    enabled: !!user && friendIds.length > 0,
    staleTime: 2 * 60 * 1000,
  });
}
