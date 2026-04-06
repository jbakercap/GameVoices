import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface StoryEpisode {
  id: string;
  title: string;
  duration_seconds: number | null;
  audio_url: string;
  published_at: string | null;
  artwork_url: string | null;
  show: {
    id: string;
    title: string;
    artwork_url: string | null;
  } | null;
}

export interface Story {
  id: string;
  headline: string;
  story_type: string;
  show_count: number;
  episode_count: number;
  people: string[];
  team_slugs: string[];
  created_at: string;
  event_date: string | null;
  showArtworks: string[];
  totalDuration: number;
  episodes: StoryEpisode[];
}

export function useTeamStories(teamSlug: string | undefined) {
  return useQuery({
    queryKey: ['team-stories', teamSlug],
    queryFn: async (): Promise<Story[]> => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('stories')
        .select(`
          id, headline, story_type, show_count, episode_count,
          people, team_slugs, created_at, event_date,
          episode_stories (
            relevance,
            episode:episodes (
              id, title, duration_seconds, audio_url, published_at, artwork_url,
              show:shows (id, title, artwork_url)
            )
          )
        `)
        .eq('status', 'active')
        .overlaps('team_slugs', [teamSlug])
        .gte('created_at', sevenDaysAgo)
        .order('episode_count', { ascending: false })
        .limit(12);

      if (error) throw error;

      return (data || []).map((story: any) => {
        const allEpisodes = (story.episode_stories || [])
          .filter((es: any) => es.episode)
          .map((es: any) => es.episode);

        const showMap = new Map<string, string | null>();
        for (const ep of allEpisodes) {
          if (ep.show?.id) showMap.set(ep.show.id, ep.show.artwork_url);
        }
        const showArtworks = [...showMap.values()].filter(Boolean) as string[];
        const totalDuration = allEpisodes.reduce(
          (sum: number, ep: any) => sum + (ep.duration_seconds || 0), 0
        );

        return {
          id: story.id,
          headline: story.headline,
          story_type: story.story_type,
          show_count: story.show_count || 0,
          episode_count: story.episode_count || 0,
          people: story.people || [],
          team_slugs: story.team_slugs || [],
          created_at: story.created_at,
          event_date: story.event_date,
          showArtworks,
          totalDuration,
          episodes: allEpisodes,
        };
      });
    },
    enabled: !!teamSlug,
    staleTime: 5 * 60 * 1000,
  });
}