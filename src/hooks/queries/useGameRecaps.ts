import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface GameRecapEpisode {
  id: string;
  title: string;
  audio_url: string;
  artwork_url: string | null;
  show_artwork_url: string | null;
  duration_seconds: number;
  published_at: string | null;
  show_id: string;
  show_title: string | null;
  show_team_slugs: string[] | null;
}

export function useGameRecaps(storyId: string | undefined) {
  return useQuery({
    queryKey: ['game-recaps', storyId],
    queryFn: async (): Promise<GameRecapEpisode[]> => {
      if (!storyId) return [];

      const { data, error } = await supabase
        .from('episode_stories')
        .select(`
          relevance,
          episode:episodes (
            id, title, audio_url, artwork_url, duration_seconds, published_at, show_id,
            show:shows ( id, title, artwork_url, team_slugs, status )
          )
        `)
        .eq('story_id', storyId);

      if (error) throw error;

      return (data || [])
        .filter((row: any) => row.episode && (row.episode.show?.status === 'active' || !row.episode.show?.status))
        .sort((a: any, b: any) => (b.relevance ?? 0) - (a.relevance ?? 0))
        .map((row: any) => {
          const ep = row.episode;
          const show = ep.show;
          return {
            id: ep.id,
            title: ep.title,
            audio_url: ep.audio_url,
            artwork_url: ep.artwork_url || null,
            show_artwork_url: show?.artwork_url || null,
            duration_seconds: ep.duration_seconds || 0,
            published_at: ep.published_at || null,
            show_id: ep.show_id,
            show_title: show?.title || null,
            show_team_slugs: show?.team_slugs || null,
          };
        });
    },
    enabled: !!storyId,
    staleTime: 10 * 60 * 1000,
  });
}
