import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_TEAM_ID = 2; // ESPN team ID for Celtics (default)

interface ScheduleGame {
  gameId: string;
  gameDate: string;
  gameTime: string;
  status: string;
  statusState: string;
  venue: string;
  opponent: string;
  opponentAbbr: string;
  isHome: boolean;
  homeScore?: number;
  awayScore?: number;
  period?: number;
  clock?: string;
  broadcast?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { gameId, teamId } = await req.json().catch(() => ({}));
    const TEAM_ID = teamId ?? DEFAULT_TEAM_ID;

    // If gameId provided, fetch live game data
    if (gameId) {
      const liveUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
      const response = await fetch(liveUrl);
      
      if (!response.ok) {
        return new Response(JSON.stringify({ error: 'Failed to fetch live game' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const data = await response.json();
      const competition = data.header?.competitions?.[0];
      
      if (!competition) {
        return new Response(JSON.stringify(null), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const homeTeam = competition.competitors?.find((c: any) => c.homeAway === 'home');
      const awayTeam = competition.competitors?.find((c: any) => c.homeAway === 'away');

      const liveGame = {
        gameId,
        status: competition.status?.type?.name || 'Unknown',
        statusState: competition.status?.type?.state || 'pre',
        venue: data.gameInfo?.venue?.fullName || '',
        gameTime: competition.date,
        away: {
          id: awayTeam?.team?.id,
          name: awayTeam?.team?.displayName,
          abbreviation: awayTeam?.team?.abbreviation,
          score: parseInt(awayTeam?.score || '0', 10),
        },
        home: {
          id: homeTeam?.team?.id,
          name: homeTeam?.team?.displayName,
          abbreviation: homeTeam?.team?.abbreviation,
          score: parseInt(homeTeam?.score || '0', 10),
        },
        period: competition.status?.period,
        clock: competition.status?.displayClock,
      };

      return new Response(JSON.stringify(liveGame), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch team schedule using ESPN API
    const scheduleUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/${TEAM_ID}/schedule`;
    const response = await fetch(scheduleUrl);

    if (!response.ok) {
      throw new Error(`ESPN API returned ${response.status}`);
    }

    const data = await response.json();
    const events = data.events || [];
    const now = new Date();

    // Only true offseason when ESPN returns no events at all for the season
    if (events.length === 0) {
      return new Response(JSON.stringify({
        games: [],
        isOffseason: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Filter to 30-day window (past 30 days + future 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const relevantGames = events.filter((event: any) => {
      const gameDate = new Date(event.date);
      return gameDate >= thirtyDaysAgo && gameDate <= thirtyDaysAhead;
    });

    // Smart selection: last 3 completed + all live + next 3 upcoming
    // This replaces the blind .slice(0, 10) which only returned past games
    const completedGames = relevantGames.filter((e: any) => e.competitions[0].status.type.state === 'post');
    const liveGames = relevantGames.filter((e: any) => e.competitions[0].status.type.state === 'in');
    const upcomingGames = relevantGames.filter((e: any) => e.competitions[0].status.type.state === 'pre');

    const selectedGames = [
      ...completedGames.slice(-3),   // last 3 completed (closest to today)
      ...liveGames,                   // any live game
      ...upcomingGames.slice(0, 3),   // next 3 upcoming
    ];

    // For completed games, we need to fetch scores from the summary API
    // The schedule API doesn't include final scores
    const games: ScheduleGame[] = await Promise.all(
      selectedGames.map(async (event: any) => {
        const competition = event.competitions[0];
        const ourTeam = competition.competitors.find((c: any) => c.team.id === String(TEAM_ID));
        const opponent = competition.competitors.find((c: any) => c.team.id !== String(TEAM_ID));
        const isHome = ourTeam?.homeAway === 'home';
        const gameState = competition.status.type.state;

        let homeScore: number | undefined;
        let awayScore: number | undefined;

        // Fetch scores for completed or in-progress games
        if (gameState === 'in' || gameState === 'post') {
          try {
            const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${event.id}`;
            const summaryResponse = await fetch(summaryUrl);
            if (summaryResponse.ok) {
              const summaryData = await summaryResponse.json();
              const summaryCompetition = summaryData.header?.competitions?.[0];
              if (summaryCompetition) {
                const homeCompetitor = summaryCompetition.competitors?.find((c: any) => c.homeAway === 'home');
                const awayCompetitor = summaryCompetition.competitors?.find((c: any) => c.homeAway === 'away');
                homeScore = parseInt(homeCompetitor?.score || '0', 10);
                awayScore = parseInt(awayCompetitor?.score || '0', 10);
              }
            }
          } catch (e) {
            console.error('Failed to fetch game summary:', e);
          }
        }

        return {
          gameId: event.id,
          gameDate: event.date.split('T')[0],
          gameTime: event.date,
          status: competition.status.type.name,
          statusState: gameState,
          venue: competition.venue?.fullName || '',
          opponent: opponent?.team.displayName || 'TBD',
          opponentAbbr: opponent?.team.abbreviation || 'TBD',
          isHome,
          homeScore,
          awayScore,
          period: competition.status.period,
          clock: competition.status.displayClock,
          broadcast: competition.broadcasts?.[0]?.names?.[0] || undefined,
        };
      })
    );

    return new Response(JSON.stringify({
      games,
      isOffseason: false,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('NBA Schedule error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: message,
      games: [],
      isOffseason: false,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
