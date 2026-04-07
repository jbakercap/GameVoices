import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface Playlist {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  public_code: string | null;
  created_at: string;
  updated_at: string;
  item_count: number;
  artwork_urls: string[];
}

export function usePlaylists() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['playlists', user?.id],
    queryFn: async (): Promise<Playlist[]> => {
      if (!user) return [];

      const { data: playlists, error } = await supabase
        .from('playlists')
        .select('id, name, description, is_public, public_code, created_at, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (!playlists || playlists.length === 0) return [];

      const playlistIds = playlists.map(p => p.id);
      const { data: items } = await supabase
        .from('playlist_items')
        .select('playlist_id, episode_id')
        .in('playlist_id', playlistIds)
        .order('position', { ascending: true });

      const countMap: Record<string, number> = {};
      const episodesByPlaylist: Record<string, string[]> = {};
      (items || []).forEach((item: any) => {
        countMap[item.playlist_id] = (countMap[item.playlist_id] || 0) + 1;
        if (!episodesByPlaylist[item.playlist_id]) episodesByPlaylist[item.playlist_id] = [];
        if (episodesByPlaylist[item.playlist_id].length < 4) episodesByPlaylist[item.playlist_id].push(item.episode_id);
      });

      const allEpisodeIds = Object.values(episodesByPlaylist).flat();
      let episodeArtworkMap = new Map<string, string | null>();
      if (allEpisodeIds.length > 0) {
        const { data: episodes } = await supabase.from('episodes').select('id, artwork_url, show_id').in('id', allEpisodeIds);
        const showIds = [...new Set((episodes || []).map((e: any) => e.show_id))];
        const { data: shows } = await supabase.from('shows').select('id, artwork_url').in('id', showIds);
        const showArtworkMap = new Map((shows || []).map((s: any) => [s.id, s.artwork_url]));
        episodeArtworkMap = new Map((episodes || []).map((e: any) => [e.id, e.artwork_url || showArtworkMap.get(e.show_id) || null]));
      }

      return playlists.map(playlist => ({
        ...playlist,
        item_count: countMap[playlist.id] || 0,
        artwork_urls: (episodesByPlaylist[playlist.id] || [])
          .map(epId => episodeArtworkMap.get(epId))
          .filter((url): url is string => url != null),
      }));
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}
