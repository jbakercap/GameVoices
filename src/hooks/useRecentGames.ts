import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export interface TeamInfo {
  slug: string;
  name: string;
  short_name: string;
  logo_url: string | null;
  primary_color: string | null;
}

export interface GameWithTeams {
  id: string;
  league: string;
  home_team_slug: string;
  away_team_slug: string;
  home_score: number;
  away_score: number;
  event_date: string;
  game_time: string | null;
  status: string;
  homeTeam?: TeamInfo;
  awayTeam?: TeamInfo;
  followedTeamSlug: string;
  storyIds?: string[];
  episode_count?: number;
}

const MAX_DAYS = 7;
const MAX_GAMES_PER_TEAM = 5;

export function useRecentGames(teamSlugs: string[]) {
  return useQuery({
    queryKey: ['recent-games', teamSlugs.slice().sort().join(',')],
    queryFn: async (): Promise<GameWithTeams[]> => {
      if (teamSlugs.length === 0) return [];

      const cutoffDate = new Date(Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

      const { data: gamesData, error } = await supabase
        .from('games')
        .select('id, league, home_team_slug, away_team_slug, home_score, away_score, event_date, game_time, status')
        .eq('status', 'final')
        .or(`home_team_slug.in.(${teamSlugs.join(',')}),away_team_slug.in.(${teamSlugs.join(',')})`)
        .gte('event_date', cutoffDate)
        .order('event_date', { ascending: false })
        .limit(60);

      if (error) throw error;

      const games = gamesData || [];
      if (games.length === 0) return [];

      // Collect all team slugs to fetch in one query
      const allSlugs = new Set<string>();
      for (const g of games) {
        allSlugs.add(g.home_team_slug);
        allSlugs.add(g.away_team_slug);
      }

      const { data: teamsData } = await supabase
        .from('teams')
        .select('slug, name, short_name, logo_url, primary_color')
        .in('slug', Array.from(allSlugs));

      const teamsBySlug: Record<string, TeamInfo> = {};
      for (const t of teamsData || []) {
        teamsBySlug[t.slug] = t;
      }

      // Fetch linked stories (for "Play All Takes" button)
      const gameIds = games.map(g => g.id);
      const { data: storiesData } = await supabase
        .from('stories')
        .select('id, game_id, episode_count')
        .in('game_id', gameIds)
        .eq('status', 'active')
        .eq('story_type', 'game_result');

      const storyByGameId: Record<string, { ids: string[]; episode_count: number }> = {};
      for (const s of storiesData || []) {
        if (!s.game_id) continue;
        const existing = storyByGameId[s.game_id];
        if (!existing) {
          storyByGameId[s.game_id] = { ids: [s.id], episode_count: s.episode_count };
        } else {
          existing.ids.push(s.id);
          existing.episode_count += s.episode_count;
        }
      }

      // Deduplicate and cap at MAX_GAMES_PER_TEAM per followed team slug
      const seen = new Set<string>();
      const perTeamCount: Record<string, number> = {};
      const result: GameWithTeams[] = [];

      for (const g of games) {
        if (seen.has(g.id)) continue;

        const followedTeamSlug = teamSlugs.includes(g.home_team_slug)
          ? g.home_team_slug
          : g.away_team_slug;

        const count = perTeamCount[followedTeamSlug] ?? 0;
        if (count >= MAX_GAMES_PER_TEAM) continue;

        seen.add(g.id);
        perTeamCount[followedTeamSlug] = count + 1;

        const story = storyByGameId[g.id];
        result.push({
          ...g,
          homeTeam: teamsBySlug[g.home_team_slug],
          awayTeam: teamsBySlug[g.away_team_slug],
          followedTeamSlug,
          storyIds: story?.ids,
          episode_count: story?.episode_count,
        });
      }

      return result;
    },
    enabled: teamSlugs.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
