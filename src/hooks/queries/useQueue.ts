import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface QueueItem {
  id: string;
  user_id: string;
  episode_id: string;
  position: number;
  created_at: string;
  episodes: {
    id: string;
    title: string;
    artwork_url: string | null;
    audio_url: string;
    duration_seconds: number | null;
    published_at: string | null;
    show_id: string;
    shows: { id: string; title: string; artwork_url: string | null } | null;
  } | null;
}

export function useQueue() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['queue', user?.id],
    queryFn: async (): Promise<QueueItem[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('user_queue')
        .select(`
          *,
          episodes (
            id, title, artwork_url, audio_url, duration_seconds, published_at, show_id,
            shows (id, title, artwork_url)
          )
        `)
        .eq('user_id', user.id)
        .order('position', { ascending: true });

      if (error) throw error;
      return (data as QueueItem[]) || [];
    },
    enabled: !!user,
    staleTime: 0,
  });
}

export function useIsInQueue(episodeId: string | undefined) {
  const { data: queue } = useQueue();
  return queue?.some(item => item.episode_id === episodeId) || false;
}

export function useQueueCount() {
  const { data: queue } = useQueue();
  return queue?.length || 0;
}
