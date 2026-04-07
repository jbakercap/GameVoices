import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface PlaylistItem {
  id: string;
  position: number;
  added_at: string;
  episode: {
    id: string;
    title: string;
    artwork_url: string | null;
    audio_url: string;
    duration_seconds: number | null;
    published_at: string | null;
    show_id: string;
    description: string | null;
    show: { id: string; title: string; artwork_url: string | null } | null;
  };
}

export interface PlaylistWithItems {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  items: PlaylistItem[];
}

export function usePlaylist(playlistId: string | undefined) {
  return useQuery({
    queryKey: ['playlist', playlistId],
    queryFn: async (): Promise<PlaylistWithItems | null> => {
      if (!playlistId) return null;

      const { data: playlist, error } = await supabase
        .from('playlists')
        .select('id, user_id, name, description, is_public, public_code, created_at, updated_at')
        .eq('id', playlistId)
        .maybeSingle();

      if (error) throw error;
      if (!playlist) return null;

      const { data: items } = await supabase
        .from('playlist_items')
        .select('id, position, added_at, episode_id')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true });

      if (!items || items.length === 0) return { ...playlist, items: [] };

      const episodeIds = items.map((i: any) => i.episode_id);
      const { data: episodes } = await supabase
        .from('episodes')
        .select('id, title, artwork_url, audio_url, duration_seconds, published_at, show_id, description')
        .in('id', episodeIds);

      const showIds = [...new Set((episodes || []).map((e: any) => e.show_id))];
      const { data: shows } = await supabase.from('shows').select('id, title, artwork_url').in('id', showIds);
      const showMap = new Map((shows || []).map((s: any) => [s.id, s]));
      const episodeMap = new Map((episodes || []).map((ep: any) => [ep.id, { ...ep, show: showMap.get(ep.show_id) || null }]));

      const mappedItems: PlaylistItem[] = [];
      for (const item of items) {
        const ep = episodeMap.get((item as any).episode_id);
        if (ep) {
          mappedItems.push({
            id: item.id,
            position: item.position,
            added_at: (item as any).added_at,
            episode: ep,
          });
        }
      }

      return { ...playlist, items: mappedItems };
    },
    enabled: !!playlistId,
    staleTime: 60 * 1000,
  });
}
