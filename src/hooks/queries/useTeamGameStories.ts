import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface TeamGameStory {
  id: string;
  headline: string;
  sport: string | null;
  team_slugs: string[] | null;
  episode_count: number;
  show_count: number;
  event_date: string | null;
  game_id: string | null;
  home_abbr: string | null;
  away_abbr: string | null;
  home_score: number | null;
  away_score: number | null;
  home_logo: string | null;
  away_logo: string | null;
  home_primary_color: string | null;
  away_primary_color: string | null;
  showArtworks: string[];
  showCountActual: number;
  totalDuration: number;
  episodes: Array<{
    id: string;
    title: string;
    duration_seconds: number | null;
    audio_url: string;
    artwork_url: string | null;
    show: { id: string; title: string; artwork_url: string | null } | null;
  }>;
  teams: Array<{ slug: string; logo_url: string | null; short_name: string; primary_color: string | null }>;
}

export function useTeamGameStories(teamSlug?: string) {
  return useQuery({
    queryKey: ['team-game-stories', teamSlug],
    enabled: !!teamSlug,
    queryFn: async (): Promise<TeamGameStory[]> => {
      if (!teamSlug) return [];
      const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('stories')
        .select(`
          id, headline, sport, team_slugs, episode_count, show_count, event_date, game_id,
          episode_stories (
            relevance,
            episode:episodes (
              id, title, duration_seconds, audio_url, artwork_url,
              show:shows (id, title, artwork_url, status)
            )
          )
        `)
        .eq('source_type', 'espn_game')
        .in('status', ['active', 'expired'])
        .contains('team_slugs', [teamSlug])
        .gte('event_date', cutoff)
        .order('event_date', { ascending: false })
        .order('episode_count', { ascending: false })
        .limit(12);

      if (error || !data?.length) return [];

      const gameIds = [...new Set(data.map((s: any) => s.game_id).filter(Boolean))] as string[];
      const allSlugs = [...new Set(data.flatMap((s: any) => s.team_slugs || []))];

      const [teamsResult, gamesResult] = await Promise.all([
        supabase.from('teams').select('slug, logo_url, short_name, abbreviation, primary_color').in('slug', allSlugs),
        gameIds.length > 0
          ? supabase.from('games').select('id, home_team_slug, away_team_slug, home_score, away_score').in('id', gameIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const teamMap = new Map((teamsResult.data || []).map((t: any) => [t.slug, t]));
      const gameMap = new Map(((gamesResult as any).data || []).map((g: any) => [g.id, g]));

      return data.map((story: any) => {
        const game = story.game_id ? gameMap.get(story.game_id) : null;
        const homeTeam = game ? teamMap.get((game as any).home_team_slug) : null;
        const awayTeam = game ? teamMap.get((game as any).away_team_slug) : null;

        const episodes = (story.episode_stories || [])
          .filter((es: any) => es.episode)
          .map((es: any) => es.episode)
          .filter((ep: any) => ep.show?.status === 'active' || !ep.show?.status)
          .slice(0, 5);

        const showMapLocal = new Map<string, { artwork: string | null; count: number }>();
        for (const ep of episodes) {
          if (!ep.show?.id) continue;
          const entry = showMapLocal.get(ep.show.id);
          if (entry) entry.count++;
          else showMapLocal.set(ep.show.id, { artwork: ep.show.artwork_url, count: 1 });
        }

        const showArtworks = [...showMapLocal.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .map(([, v]) => v.artwork)
          .filter(Boolean) as string[];

        return {
          ...story,
          teams: (story.team_slugs || []).map((slug: string) => teamMap.get(slug)).filter(Boolean),
          home_abbr: (homeTeam as any)?.abbreviation || null,
          away_abbr: (awayTeam as any)?.abbreviation || null,
          home_score: game ? (game as any).home_score : null,
          away_score: game ? (game as any).away_score : null,
          home_logo: (homeTeam as any)?.logo_url || null,
          away_logo: (awayTeam as any)?.logo_url || null,
          home_primary_color: (homeTeam as any)?.primary_color || null,
          away_primary_color: (awayTeam as any)?.primary_color || null,
          showArtworks: showArtworks.slice(0, 4),
          showCountActual: showMapLocal.size,
          totalDuration: episodes.reduce((sum: number, ep: any) => sum + (ep.duration_seconds || 0), 0),
          episodes,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}
