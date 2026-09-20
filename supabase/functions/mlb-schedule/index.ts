import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ESPN team ID → MLB Stats API team ID
const ESPN_TO_MLB: Record<number, number> = {
  1: 110,   // Orioles
  2: 111,   // Red Sox
  3: 108,   // Angels
  4: 145,   // White Sox
  5: 114,   // Guardians
  6: 116,   // Tigers
  7: 118,   // Royals
  8: 158,   // Brewers
  9: 142,   // Twins
  10: 147,  // Yankees
  11: 133,  // Athletics
  12: 136,  // Mariners
  13: 140,  // Rangers
  14: 141,  // Blue Jays
  15: 144,  // Braves
  16: 112,  // Cubs
  17: 113,  // Reds
  18: 117,  // Astros
  19: 119,  // Dodgers
  20: 120,  // Nationals
  21: 121,  // Mets
  22: 143,  // Phillies
  23: 134,  // Pirates
  24: 138,  // Cardinals
  25: 135,  // Padres
  26: 137,  // Giants
  27: 115,  // Rockies
  28: 146,  // Marlins
  29: 109,  // Diamondbacks
  30: 139,  // Rays
};

const DEFAULT_ESPN_ID = 2; // Red Sox ESPN ID as default

interface MLBGame {
  gamePk: number;
  gameDate: string;
  status: {
    abstractGameState: string;
    detailedState: string;
    statusCode: string;
  };
  teams: {
    away: {
      team: { id: number; name: string };
      score?: number;
    };
    home: {
      team: { id: number; name: string };
      score?: number;
    };
  };
  venue: {
    name: string;
  };
  broadcasts?: Array<{
    type: string;
    name: string;
  }>;
}

interface LiveGameData {
  gameData: {
    status: {
      abstractGameState: string;
      detailedState: string;
    };
    datetime: {
      dateTime: string;
    };
    teams: {
      away: { id: number; name: string; abbreviation: string };
      home: { id: number; name: string; abbreviation: string };
    };
    venue: { name: string };
  };
  liveData: {
    linescore: {
      currentInning?: number;
      currentInningOrdinal?: string;
      inningState?: string;
      outs?: number;
      teams: {
        away: { runs?: number; hits?: number; errors?: number };
        home: { runs?: number; hits?: number; errors?: number };
      };
    };
    plays?: {
      currentPlay?: {
        result?: {
          description?: string;
        };
      };
    };
  };
}

interface Transaction {
  trans_date: string;
  transaction: string;
  team: string;
  from_team?: string;
  player?: string;
  type_cd?: string;
  note?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { gameId, type, teamId } = await req.json().catch(() => ({}));
    const espnId = Number(teamId ?? DEFAULT_ESPN_ID);
    const TEAM_ID = ESPN_TO_MLB[espnId] ?? espnId;

  // Fetch transactions for offseason
    if (type === 'transactions') {
      console.log('Fetching Red Sox transactions');
      
      // Get transactions from last 60 days
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 60);
      
      const startStr = startDate.toISOString().split('T')[0].replace(/-/g, '');
      const endStr = endDate.toISOString().split('T')[0].replace(/-/g, '');
      
      try {
        // Use HTTPS version of the API
        const transUrl = `https://lookup-service-prod.mlb.com/json/named.transaction_all.bam?sport_code=%27mlb%27&start_date=%27${startStr}%27&end_date=%27${endStr}%27`;
        console.log('Transaction URL:', transUrl);
        
        const transResponse = await fetch(transUrl);
        console.log('Transaction response status:', transResponse.status);
        
        if (transResponse.ok) {
          const transData = await transResponse.json();
          console.log('Transaction data keys:', Object.keys(transData || {}));
          
          const allTransactions = transData?.transaction_all?.queryResults?.row || [];
          console.log('Total transactions found:', Array.isArray(allTransactions) ? allTransactions.length : 1);
          
          // Filter for Red Sox transactions - can be array or single object
          const transactionArray = Array.isArray(allTransactions) ? allTransactions : (allTransactions ? [allTransactions] : []);
          
          const redSoxTransactions = transactionArray
            .filter((t: Transaction) => {
              const isRedSox = t.team?.toLowerCase().includes('red sox') || 
                              t.from_team?.toLowerCase().includes('red sox');
              return isRedSox;
            })
            .slice(0, 5)
            .map((t: Transaction) => ({
              date: t.trans_date,
              description: t.transaction || t.note || 'Transaction',
              player: t.player,
              team: t.team,
            }));
          
          console.log(`Found ${redSoxTransactions.length} Red Sox transactions`);
          
          return new Response(JSON.stringify({ transactions: redSoxTransactions }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          console.error('Transaction API returned status:', transResponse.status);
        }
      } catch (transError) {
        console.error('Error fetching transactions:', transError);
      }
      
      // Return mock offseason transaction if API fails
      const mockTransaction = {
        date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
        description: 'Preparing for Spring Training 2026',
        player: 'Red Sox',
        team: 'Boston Red Sox',
      };
      
      return new Response(JSON.stringify({ transactions: [mockTransaction] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If gameId provided, get live game data
    if (gameId) {
      console.log(`Fetching live game data for gameId: ${gameId}`);
      
      const liveResponse = await fetch(
        `https://statsapi.mlb.com/api/v1.1/game/${gameId}/feed/live`
      );
      
      if (!liveResponse.ok) {
        throw new Error(`MLB API error: ${liveResponse.status}`);
      }
      
      const liveData: LiveGameData = await liveResponse.json();
      
      const result = {
        gameId,
        status: liveData.gameData.status.detailedState,
        abstractStatus: liveData.gameData.status.abstractGameState,
        venue: liveData.gameData.venue.name,
        gameTime: liveData.gameData.datetime.dateTime,
        away: {
          id: liveData.gameData.teams.away.id,
          name: liveData.gameData.teams.away.name,
          abbreviation: liveData.gameData.teams.away.abbreviation,
          runs: liveData.liveData.linescore.teams.away.runs ?? 0,
          hits: liveData.liveData.linescore.teams.away.hits ?? 0,
          errors: liveData.liveData.linescore.teams.away.errors ?? 0,
        },
        home: {
          id: liveData.gameData.teams.home.id,
          name: liveData.gameData.teams.home.name,
          abbreviation: liveData.gameData.teams.home.abbreviation,
          runs: liveData.liveData.linescore.teams.home.runs ?? 0,
          hits: liveData.liveData.linescore.teams.home.hits ?? 0,
          errors: liveData.liveData.linescore.teams.home.errors ?? 0,
        },
        inning: liveData.liveData.linescore.currentInning,
        inningOrdinal: liveData.liveData.linescore.currentInningOrdinal,
        inningState: liveData.liveData.linescore.inningState,
        outs: liveData.liveData.linescore.outs,
        lastPlay: liveData.liveData.plays?.currentPlay?.result?.description,
      };
      
      console.log(`Live game result:`, result);
      
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get schedule for past 30 days + next 30 days to capture recent results and upcoming games
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 30);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 30);
    
    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];
    
    console.log(`Fetching Red Sox schedule from ${startStr} to ${endStr}`);
    
    const scheduleResponse = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${TEAM_ID}&startDate=${startStr}&endDate=${endStr}&hydrate=broadcasts(all)`
    );
    
    if (!scheduleResponse.ok) {
      throw new Error(`MLB API error: ${scheduleResponse.status}`);
    }
    
    const scheduleData = await scheduleResponse.json();
    
    // Parse the schedule dates
    const games: Array<{
      gameId: number;
      gameDate: string;
      gameTime: string;
      status: string;
      abstractStatus: string;
      venue: string;
      opponent: string;
      opponentId: number;
      isHome: boolean;
      homeScore?: number;
      awayScore?: number;
      broadcast?: string;
    }> = [];
    
    for (const date of scheduleData.dates || []) {
      for (const game of date.games || []) {
        const mlbGame = game as MLBGame;
        const isHome = mlbGame.teams.home.team.id === TEAM_ID;
        const opponent = isHome 
          ? mlbGame.teams.away.team.name 
          : mlbGame.teams.home.team.name;
        const opponentId = isHome
          ? mlbGame.teams.away.team.id
          : mlbGame.teams.home.team.id;
        
        // Find TV broadcast
        const tvBroadcast = mlbGame.broadcasts?.find(b => b.type === 'TV')?.name;
        
        games.push({
          gameId: mlbGame.gamePk,
          gameDate: date.date,
          gameTime: mlbGame.gameDate,
          status: mlbGame.status.detailedState,
          abstractStatus: mlbGame.status.abstractGameState,
          venue: mlbGame.venue.name,
          opponent,
          opponentId,
          isHome,
          homeScore: mlbGame.teams.home.score,
          awayScore: mlbGame.teams.away.score,
          broadcast: tvBroadcast,
        });
      }
    }
    
    console.log(`Found ${games.length} games in schedule`);
    
    // True offseason only if there are NO games at all in the 60-day window
    // (spring training + regular season should always have some games listed)
    const isOffseason = games.length === 0;
    
    return new Response(JSON.stringify({ 
      games,
      isOffseason,
      springTrainingDate: '2026-02-15', // Update this annually
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error: unknown) {
    console.error('Error in mlb-schedule function:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
