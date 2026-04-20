import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface Show {
  id: string;
  title: string;
  description: string | null;
  artwork_url: string | null;
  rss_url: string | null;
  site_url: string | null;
  publisher: string | null;
  episode_count: number | null;
  last_episode_at: string | null;
  is_featured: boolean | null;
  claim_status: string | null;
  claimed_by_user_id: string | null;
  status: string | null;
  league_id: string | null;
  team_id: string | null;
  format: string | null;
  hosts_json: any;
  youtube_url: string | null;
  twitter_handle: string | null;
  teams?: { primary_color: string | null } | null;
}

export interface ShowEpisode {
  id: string;
  title: string;
  description: string | null;
  artwork_url: string | null;
  audio_url: string;
  duration_seconds: number | null;
  published_at: string | null;
  show_id: string;
  topic_slug: string | null;
  is_video: boolean | null;
}

export interface ShowWithDetails extends Show {
  episodes: ShowEpisode[];
  isFollowed: boolean;
}

export function useShow(showId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['show', showId, user?.id],
    queryFn: async (): Promise<ShowWithDetails | null> => {
      if (!showId) return null;

      const { data: show, error: showError } = await supabase
        .from('shows')
        .select(`
          id, title, description, artwork_url, rss_url, site_url,
          hosts_json, is_featured, episode_count, last_episode_at,
          publisher, status, claim_status, claimed_by_user_id,
          format, league_id, team_id,
          youtube_url, twitter_handle,
          teams ( primary_color )
        `)
        .eq('id', showId)
        .maybeSingle();

      if (showError) throw showError;
      if (!show) return null;

      const { data: episodes, error: episodesError } = await supabase
        .from('episodes')
        .select('id, title, description, artwork_url, audio_url, duration_seconds, published_at, show_id, topic_slug, is_video')
        .eq('show_id', showId)
        .order('published_at', { ascending: false });

      if (episodesError) throw episodesError;

      let isFollowed = false;
      if (user) {
        const { data: follow } = await supabase
          .from('user_library')
          .select('id')
          .eq('user_id', user.id)
          .eq('show_id', showId)
          .eq('item_type', 'follow')
          .maybeSingle();
        isFollowed = !!follow;
      }

      return {
        ...show,
        episodes: episodes || [],
        isFollowed,
      } as ShowWithDetails;
    },
    enabled: !!showId,
    staleTime: 5 * 60 * 1000,
  });
}
