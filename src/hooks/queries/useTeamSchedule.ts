import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface ScheduleGame {
  gameId: string | number;
  gameDate: string;
  gameTime: string;
  status: string;
  statusState?: string;
  abstractStatus?: string;
  venue: string;
  opponent: string;
  opponentAbbr?: string;
  isHome: boolean;
  homeScore?: number;
  awayScore?: number;
  period?: number;
  clock?: string;
  inning?: number;
  inningOrdinal?: string;
  inningState?: string;
  broadcast?: string;
}

export interface GameStripData {
  lastGame: ScheduleGame | null;
  nextGame: ScheduleGame | null;
  liveGame: ScheduleGame | null;
  recentGames: ScheduleGame[];
  upcomingGames: ScheduleGame[];
  isOffseason: boolean;
  isLoading: boolean;
  error: Error | null;
}

const LEAGUE_FUNCTION_MAP: Record<string, string> = {
  nfl: 'nfl-schedule',
  nba: 'nba-schedule',
  nhl: 'nhl-schedule',
  mlb: 'mlb-schedule',
  sec: 'cfb-schedule',
  'big-ten': 'cfb-schedule',
  acc: 'cfb-schedule',
  'big-east': 'cbb-schedule',
  'big-12': 'cfb-schedule',
};

function isLive(game: ScheduleGame) { return game.statusState === 'in' || game.abstractStatus === 'Live'; }
function isCompleted(game: ScheduleGame) { return game.statusState === 'post' || game.abstractStatus === 'Final'; }
function isUpcoming(game: ScheduleGame) { return game.statusState === 'pre' || game.abstractStatus === 'Preview'; }

interface TeamForSchedule {
  espn_team_id?: number | null;
  leagues?: { slug: string } | null;
}

export function useTeamSchedule(team: TeamForSchedule | null | undefined): GameStripData {
  const leagueSlug = team?.leagues?.slug ?? null;
  const espnTeamId = team?.espn_team_id ?? null;
  const enabled = !!(leagueSlug && espnTeamId && LEAGUE_FUNCTION_MAP[leagueSlug]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['team-schedule', leagueSlug, espnTeamId],
    queryFn: async () => {
      const fnName = LEAGUE_FUNCTION_MAP[leagueSlug!];
      const { data, error } = await supabase.functions.invoke(fnName, {
        body: { teamId: espnTeamId },
      });
      if (error) throw error;
      return { games: (data?.games || []) as ScheduleGame[], isOffseason: data?.isOffseason ?? false };
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchInterval: (query) => {
      const games = (query.state.data?.games ?? []) as ScheduleGame[];
      return games.some(isLive) ? 30_000 : 5 * 60 * 1000;
    },
  });

  if (!enabled) return { lastGame: null, nextGame: null, liveGame: null, recentGames: [], upcomingGames: [], isOffseason: false, isLoading: false, error: null };

  const games = data?.games ?? [];
  const isOffseason = data?.isOffseason ?? false;
  const liveGame = games.find(isLive) ?? null;
  const completed = games.filter(isCompleted);
  const upcoming = games.filter(isUpcoming);

  return {
    lastGame: completed.length > 0 ? completed[completed.length - 1] : null,
    nextGame: upcoming.length > 0 ? upcoming[0] : null,
    liveGame,
    recentGames: completed.slice(-3),
    upcomingGames: upcoming.slice(0, 3),
    isOffseason,
    isLoading,
    error: error as Error | null,
  };
}
