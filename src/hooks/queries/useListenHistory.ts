import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface HistoryItem {
  id: string;
  user_id: string;
  episode_id: string;
  listened_at: string;
  episodes: {
    id: string;
    title: string;
    artwork_url: string | null;
    audio_url: string;
    duration_seconds: number | null;
    show_id: string;
    shows: { id: string; title: string; artwork_url: string | null } | null;
  } | null;
}

export function useListenHistory(options: { limit?: number } = {}) {
  const { limit = 50 } = options;
  const { user } = useAuth();

  return useQuery({
    queryKey: ['listenHistory', user?.id, { limit }],
    queryFn: async (): Promise<HistoryItem[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('user_listen_history')
        .select(`
          *,
          episodes (
            id, title, artwork_url, audio_url, duration_seconds, show_id,
            shows (id, title, artwork_url)
          )
        `)
        .eq('user_id', user.id)
        .order('listened_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data as HistoryItem[]) || [];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}

export function useGroupedListenHistory() {
  const { data: history, ...rest } = useListenHistory({ limit: 100 });

  const groupedHistory = (history || []).reduce((acc, item) => {
    const date = new Date(item.listened_at || '');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    let group: string;
    if (date.toDateString() === today.toDateString()) group = 'Today';
    else if (date.toDateString() === yesterday.toDateString()) group = 'Yesterday';
    else if (date > weekAgo) group = 'This Week';
    else group = 'Earlier';

    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {} as Record<string, HistoryItem[]>);

  return { data: groupedHistory, ...rest };
}
