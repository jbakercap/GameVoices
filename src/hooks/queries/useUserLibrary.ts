import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface LibraryShow {
  id: string;
  title: string;
  artwork_url: string | null;
  publisher: string | null;
  episode_count: number | null;
  last_episode_at: string | null;
}

export interface LibraryEpisode {
  id: string;
  title: string;
  artwork_url: string | null;
  audio_url: string;
  duration_seconds: number | null;
  published_at: string | null;
  show_id: string;
  shows: { id: string; title: string; artwork_url: string | null } | null;
}

interface UserLibraryData {
  followedShows: LibraryShow[];
  savedEpisodes: LibraryEpisode[];
}

export function useUserLibrary() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['userLibrary', user?.id],
    queryFn: async (): Promise<UserLibraryData> => {
      if (!user) return { followedShows: [], savedEpisodes: [] };

      const [followedRes, savedRes] = await Promise.all([
        supabase
          .from('user_library')
          .select(`show_id, shows (id, title, artwork_url, publisher, episode_count, last_episode_at)`)
          .eq('user_id', user.id)
          .eq('item_type', 'follow')
          .not('show_id', 'is', null),
        supabase
          .from('user_library')
          .select(`episode_id, episodes (id, title, artwork_url, audio_url, duration_seconds, published_at, show_id, shows (id, title, artwork_url))`)
          .eq('user_id', user.id)
          .eq('item_type', 'save')
          .not('episode_id', 'is', null),
      ]);

      if (followedRes.error) throw followedRes.error;
      if (savedRes.error) throw savedRes.error;

      const followedShows = (followedRes.data || [])
        .map((item: any) => item.shows)
        .filter((show: any): show is LibraryShow => show !== null);

      const savedEpisodes = (savedRes.data || [])
        .map((item: any) => item.episodes)
        .filter((ep: any): ep is LibraryEpisode => ep !== null);

      return { followedShows, savedEpisodes };
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}

export function useFollowedShows() {
  const { data, ...rest } = useUserLibrary();
  return { data: data?.followedShows || [], ...rest };
}

export function useSavedEpisodes() {
  const { data, ...rest } = useUserLibrary();
  return { data: data?.savedEpisodes || [], ...rest };
}

export function useIsShowFollowed(showId: string | undefined) {
  const { data } = useUserLibrary();
  return data?.followedShows.some(show => show.id === showId) || false;
}

export function useIsEpisodeSaved(episodeId: string | undefined) {
  const { data } = useUserLibrary();
  return data?.savedEpisodes.some(ep => ep.id === episodeId) || false;
}
