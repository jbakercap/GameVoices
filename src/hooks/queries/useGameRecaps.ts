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

export function useGameRecaps(storyIds: string[] | undefined) {
  const key = storyIds?.slice().sort().join(',') ?? '';
  return useQuery({
    queryKey: ['game-recaps', key],
    queryFn: async (): Promise<GameRecapEpisode[]> => {
      if (!storyIds || storyIds.length === 0) return [];

      const { data, error } = await supabase
        .from('episode_stories')
        .select(`
          relevance,
          episode:episodes (
            id, title, audio_url, artwork_url, duration_seconds, published_at, show_id,
            show:shows ( id, title, artwork_url, team_slugs, status )
          )
        `)
        .in('story_id', storyIds);

      if (error) throw error;

      // Deduplicate episodes by id, keeping highest relevance
      const byId = new Map<string, { relevance: number; row: any }>();
      for (const row of data || []) {
        if (!row.episode) continue;
        const existing = byId.get(row.episode.id);
        if (!existing || (row.relevance ?? 0) > existing.relevance) {
          byId.set(row.episode.id, { relevance: row.relevance ?? 0, row });
        }
      }

      return Array.from(byId.values())
        .filter(({ row }) => row.episode.show?.status === 'active' || !row.episode.show?.status)
        .sort((a, b) => b.relevance - a.relevance)
        .map(({ row }) => {
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
    enabled: !!storyIds && storyIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}
