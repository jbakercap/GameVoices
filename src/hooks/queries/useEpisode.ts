import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface EpisodeShow {
  id: string;
  title: string;
  description: string | null;
  artwork_url: string | null;
  publisher: string | null;
  episode_count: number | null;
  claim_status: string | null;
  claimed_by_user_id: string | null;
  league_id: string | null;
  team_id: string | null;
  teams?: { primary_color: string | null } | null;
}

export interface EpisodeDetail {
  id: string;
  title: string;
  description: string | null;
  artwork_url: string | null;
  audio_url: string;
  video_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  show_id: string;
  topic_slug: string | null;
  is_video: boolean | null;
  extracted_tags: any;
  shows: EpisodeShow | null;
  playback?: { position_seconds: number; completed: boolean } | null;
  isSaved?: boolean;
}

export function useEpisode(episodeId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['episode', episodeId, user?.id],
    queryFn: async (): Promise<EpisodeDetail | null> => {
      if (!episodeId) return null;

      const { data: episode, error } = await supabase
        .from('episodes')
        .select(`
          id, title, description, artwork_url, audio_url, video_url, duration_seconds,
          published_at, show_id, topic_slug, is_video, extracted_tags,
          shows (
            id, title, description, artwork_url, publisher,
            episode_count, claim_status, claimed_by_user_id,
            league_id, team_id,
            teams ( primary_color )
          )
        `)
        .eq('id', episodeId)
        .maybeSingle();

      if (error) throw error;
      if (!episode) return null;

      let playback = null;
      let isSaved = false;
      if (user) {
        const [playbackRes, savedRes] = await Promise.all([
          supabase
            .from('user_playback')
            .select('position_seconds, completed')
            .eq('episode_id', episodeId)
            .eq('user_id', user.id)
            .maybeSingle(),
          supabase
            .from('user_library')
            .select('id')
            .eq('user_id', user.id)
            .eq('episode_id', episodeId)
            .eq('item_type', 'save')
            .maybeSingle(),
        ]);
        playback = playbackRes.data || null;
        isSaved = !!savedRes.data;
      }

      return {
        ...episode,
        shows: (episode as any).shows as EpisodeShow | null,
        playback,
        isSaved,
      };
    },
    enabled: !!episodeId,
    staleTime: 5 * 60 * 1000,
  });
}
