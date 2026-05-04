import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { FeedEpisode } from '../../components/EpisodeFeedPost';

export interface CreatorEpisode extends FeedEpisode {
  comment_count: number;
  play_count: number;
}

export interface PersonProfileData {
  show_id: string;
  show_title: string;
  show_artwork_url: string | null;
  team_color: string | null;
  team_slug: string | null;
  host_name: string | null;
  host_credentials: string | null;
  follower_count: number;
  total_plays: number;
  total_comments: number;
  is_following: boolean;
  episodes: CreatorEpisode[];
}

export function usePersonProfile(showId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['personProfile', showId, user?.id],
    queryFn: async (): Promise<PersonProfileData | null> => {
      if (!showId) return null;

      // 1. Show + team
      const { data: show, error: showError } = await supabase
        .from('shows')
        .select('id, title, artwork_url, teams(primary_color, slug)')
        .eq('id', showId)
        .maybeSingle();
      if (showError) throw showError;
      if (!show) return null;

      const team = (show as any).teams;

      // 2. Primary host name from show_hosts
      const { data: hostRows } = await supabase
        .from('show_hosts')
        .select('speakers(full_name, credentials)')
        .eq('show_id', showId)
        .limit(1);

      const primaryHost = (hostRows?.[0] as any)?.speakers ?? null;

      // 3. Episodes
      const { data: epData } = await supabase
        .from('episodes')
        .select('id, title, artwork_url, audio_url, duration_seconds, published_at, show_id')
        .eq('show_id', showId)
        .order('published_at', { ascending: false });

      const episodeIds = (epData || []).map((ep: any) => ep.id);

      // 4. Comment counts
      const commentCountMap = new Map<string, number>();
      if (episodeIds.length > 0) {
        const { data: commentRows } = await supabase
          .from('episode_comments')
          .select('episode_id')
          .in('episode_id', episodeIds);
        for (const row of commentRows || []) {
          const id = (row as any).episode_id;
          commentCountMap.set(id, (commentCountMap.get(id) || 0) + 1);
        }
      }

      // 5. Play counts (from listen history — may be RLS-scoped to current user)
      const playCountMap = new Map<string, number>();
      if (episodeIds.length > 0) {
        const { data: playRows } = await supabase
          .from('user_library')
          .select('episode_id')
          .in('episode_id', episodeIds)
          .eq('item_type', 'listen');
        for (const row of playRows || []) {
          const id = (row as any).episode_id;
          playCountMap.set(id, (playCountMap.get(id) || 0) + 1);
        }
      }

      // 6. Follower count (show follows)
      const { count: followerCount } = await supabase
        .from('user_library')
        .select('*', { count: 'exact', head: true })
        .eq('show_id', showId)
        .eq('item_type', 'follow');

      // 7. Is following
      let isFollowing = false;
      if (user) {
        const { data: followRow } = await supabase
          .from('user_library')
          .select('id')
          .eq('user_id', user.id)
          .eq('show_id', showId)
          .eq('item_type', 'follow')
          .maybeSingle();
        isFollowing = !!followRow;
      }

      const episodes: CreatorEpisode[] = (epData || []).map((ep: any) => ({
        id: ep.id,
        title: ep.title,
        artwork_url: ep.artwork_url || null,
        show_artwork_url: (show as any).artwork_url || null,
        audio_url: ep.audio_url,
        duration_seconds: ep.duration_seconds || 0,
        published_at: ep.published_at || null,
        show_id: ep.show_id,
        show_title: (show as any).title || null,
        team_slug: team?.slug || null,
        comment_count: commentCountMap.get(ep.id) || 0,
        play_count: playCountMap.get(ep.id) || 0,
      }));

      const totalComments = episodes.reduce((sum, ep) => sum + ep.comment_count, 0);
      const totalPlays = episodes.reduce((sum, ep) => sum + ep.play_count, 0);

      return {
        show_id: (show as any).id,
        show_title: (show as any).title,
        show_artwork_url: (show as any).artwork_url || null,
        team_color: team?.primary_color || null,
        team_slug: team?.slug || null,
        host_name: primaryHost?.full_name || null,
        host_credentials: primaryHost?.credentials || null,
        follower_count: followerCount || 0,
        total_plays: totalPlays,
        total_comments: totalComments,
        is_following: isFollowing,
        episodes,
      };
    },
    enabled: !!showId,
    staleTime: 3 * 60 * 1000,
  });
}
