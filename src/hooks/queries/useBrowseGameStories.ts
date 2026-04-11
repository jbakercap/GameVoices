import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface GameStory {
  id: string;
  headline: string;
  sport: string;
  team_slugs: string[];
  episode_count: number;
  show_count: number;
  event_date: string | null;
  game_id: string | null;
  // Score data
  home_abbr: string | null;
  away_abbr: string | null;
  home_score: number | null;
  away_score: number | null;
  home_logo: string | null;
  away_logo: string | null;
  home_primary_color: string | null;
  away_primary_color: string | null;
}

export function useBrowseGameStories(sport?: string) {
  return useQuery({
    queryKey: ['browse-game-stories', sport || 'all'],
    queryFn: async (): Promise<GameStory[]> => {
      const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      let query = supabase
        .from('stories')
        .select('id, headline, sport, team_slugs, episode_count, show_count, event_date, game_id')
        .eq('source_type', 'espn_game')
        .eq('status', 'active')
        .gte('event_date', threeDaysAgo)
        .order('event_date', { ascending: false })
        .order('episode_count', { ascending: false })
        .limit(20);

      if (sport && sport !== 'all') {
        query = query.eq('sport', sport);
      }

      const { data, error } = await query;
      if (error) return [];
      if (!data || data.length === 0) return [];

      // Collect unique game IDs and team slugs
      const gameIds = [...new Set(data.map((s: any) => s.game_id).filter(Boolean))] as string[];
      const allSlugs = [...new Set(data.flatMap((s: any) => s.team_slugs || []))];

      const [teamsResult, gamesResult] = await Promise.all([
        supabase
          .from('teams')
          .select('slug, logo_url, short_name, abbreviation, primary_color')
          .in('slug', allSlugs),
        gameIds.length > 0
          ? supabase
              .from('games')
              .select('id, home_team_slug, away_team_slug, home_score, away_score')
              .in('id', gameIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const teamMap = new Map((teamsResult.data || []).map((t: any) => [t.slug, t]));
      const gameMap = new Map(((gamesResult as any).data || []).map((g: any) => [g.id, g]));

      // Fetch any extra team slugs referenced by games but not in stories
      const gameSlugs = new Set<string>();
      ((gamesResult as any).data || []).forEach((g: any) => {
        if (g.home_team_slug) gameSlugs.add(g.home_team_slug);
        if (g.away_team_slug) gameSlugs.add(g.away_team_slug);
      });
      const missingSlugs = [...gameSlugs].filter(s => !teamMap.has(s));
      if (missingSlugs.length > 0) {
        const { data: extraTeams } = await supabase
          .from('teams')
          .select('slug, logo_url, short_name, abbreviation, primary_color')
          .in('slug', missingSlugs);
        (extraTeams || []).forEach((t: any) => teamMap.set(t.slug, t));
      }

      return data.map((story: any) => {
        const game = story.game_id ? gameMap.get(story.game_id) : null;
        const homeTeam = game ? teamMap.get(game.home_team_slug) : null;
        const awayTeam = game ? teamMap.get(game.away_team_slug) : null;

        return {
          id: story.id,
          headline: story.headline,
          sport: story.sport,
          team_slugs: story.team_slugs || [],
          episode_count: story.episode_count,
          show_count: story.show_count,
          event_date: story.event_date,
          game_id: story.game_id,
          home_abbr: homeTeam?.abbreviation || null,
          away_abbr: awayTeam?.abbreviation || null,
          home_score: game?.home_score ?? null,
          away_score: game?.away_score ?? null,
          home_logo: homeTeam?.logo_url || null,
          away_logo: awayTeam?.logo_url || null,
          home_primary_color: homeTeam?.primary_color || null,
          away_primary_color: awayTeam?.primary_color || null,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });
}
