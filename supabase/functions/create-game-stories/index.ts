import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Pro leagues: 1 league = 1 ESPN endpoint
// College: multiple conferences share the same ESPN endpoint
const PRO_LEAGUES = [
  { league: 'nba', sport: 'basketball', espnSport: 'basketball', espnLeague: 'nba' },
  { league: 'nfl', sport: 'football', espnSport: 'football', espnLeague: 'nfl' },
  { league: 'nhl', sport: 'hockey', espnSport: 'hockey', espnLeague: 'nhl' },
  { league: 'mlb', sport: 'baseball', espnSport: 'baseball', espnLeague: 'mlb' },
];

const COLLEGE_ENDPOINTS = [
  { espnSport: 'football', espnLeague: 'college-football' },
  { espnSport: 'basketball', espnLeague: 'mens-college-basketball' },
];

const COLLEGE_CONFERENCES = ['sec', 'big-ten', 'acc', 'big-12', 'big-east'];

function getWinnerVerb(diff: number): string {
  if (diff >= 20) return ['crush', 'rout', 'dominate'][Math.floor(Math.random() * 3)];
  if (diff >= 10) return ['beat', 'top', 'handle'][Math.floor(Math.random() * 3)];
  return ['edge', 'outlast', 'hold off'][Math.floor(Math.random() * 3)];
}

function getLoserVerb(diff: number): string {
  if (diff >= 20) return ['crushed by', 'routed by'][Math.floor(Math.random() * 2)];
  if (diff >= 10) return ['fall to', 'lose to'][Math.floor(Math.random() * 2)];
  return ['edged by', 'fall to'][Math.floor(Math.random() * 2)];
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function extractCompScore(competitor: any): number {
  const s = competitor?.score;
  if (typeof s === 'string') return parseInt(s, 10) || 0;
  if (typeof s === 'number') return s;
  if (s?.value != null) return parseInt(s.value, 10) || 0;
  if (s?.displayValue) return parseInt(s.displayValue, 10) || 0;
  const ls = competitor?.linescores;
  if (Array.isArray(ls)) {
    return ls.reduce((sum: number, l: any) => sum + (parseInt(l.value, 10) || 0), 0);
  }
  return 0;
}

interface TeamRow {
  slug: string;
  name: string;
  short_name: string;
  espn_team_id: number | null;
  league_short_name: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const start = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const backfillDays = body.backfill_days || 0;

  try {
    const { data: teams, error: teamsErr } = await supabase
      .from('teams')
      .select('slug, name, short_name, espn_team_id, league:leagues!inner(short_name, slug)')
      .not('espn_team_id', 'is', null);
    if (teamsErr) throw teamsErr;

    // Per-league map (keyed by league slug)
    const leagueEspnMap = new Map<string, Map<number, TeamRow>>();
    // Flat college map: ESPN ID → TeamRow (for cross-conference lookups)
    const collegeEspnMap = new Map<number, TeamRow>();

    for (const t of teams || []) {
      const leagueSlug = ((t as any).league?.slug || '').toLowerCase();
      if (!t.espn_team_id || !leagueSlug) continue;

      if (!leagueEspnMap.has(leagueSlug)) {
        leagueEspnMap.set(leagueSlug, new Map());
      }
      const row: TeamRow = { ...t, league_short_name: leagueSlug };
      leagueEspnMap.get(leagueSlug)!.set(t.espn_team_id, row);

      if (COLLEGE_CONFERENCES.includes(leagueSlug)) {
        collegeEspnMap.set(t.espn_team_id, row);
      }
    }

    const dates: string[] = [];
    const today = new Date();
    const daysBack = Math.max(2, backfillDays + 1);
    for (let i = 0; i < daysBack; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
    }

    let gamesCreated = 0;
    let storiesCreated = 0;
    let gamesSkipped = 0;
    const errors: string[] = [];
    const processedGameIds = new Set<string>();

    async function processEvent(event: any, sport: string, leagueLookup: (espnId: number) => TeamRow | undefined) {
      const competition = event.competitions?.[0];
      if (!competition) return;
      if (event.status?.type?.completed !== true) return;

      const espnGameId = String(event.id);
      if (processedGameIds.has(espnGameId)) return;
      processedGameIds.add(espnGameId);

      const competitors = competition.competitors || [];
      if (competitors.length < 2) return;

      const homeComp = competitors.find((c: any) => c.homeAway === 'home');
      const awayComp = competitors.find((c: any) => c.homeAway === 'away');
      if (!homeComp || !awayComp) return;

      const homeEspnId = parseInt(homeComp.team?.id);
      const awayEspnId = parseInt(awayComp.team?.id);

      const homeTeam = leagueLookup(homeEspnId);
      const awayTeam = leagueLookup(awayEspnId);

      // For stories, we need at least one team we know about
      if (!homeTeam && !awayTeam) { gamesSkipped++; return; }

      const homeScore = extractCompScore(homeComp);
      const awayScore = extractCompScore(awayComp);
      const eventDate = event.date ? event.date.slice(0, 10) : '';
      const venue = competition.venue?.fullName || null;

      // For game table, use the home team's league if available, else away
      const primaryTeam = homeTeam || awayTeam!;
      const gameLeague = primaryTeam.league_short_name;

      // Upsert game row
      const { data: gameRow, error: gameErr } = await supabase
        .from('games')
        .upsert({
          espn_game_id: espnGameId,
          sport,
          league: gameLeague,
          home_team_slug: homeTeam?.slug || `unknown-${homeEspnId}`,
          away_team_slug: awayTeam?.slug || `unknown-${awayEspnId}`,
          home_score: homeScore,
          away_score: awayScore,
          event_date: eventDate,
          game_time: event.date || null,
          status: 'final',
          venue,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'espn_game_id' })
        .select('id')
        .single();

      if (gameErr) {
        errors.push(`game upsert: ${gameErr.message}`);
        return;
      }
      gamesCreated++;
      const gameId = gameRow.id;

      // Create stories for each known team
      const knownTeams = [homeTeam, awayTeam].filter(Boolean) as TeamRow[];
      const winnerEspnId = homeScore >= awayScore ? homeEspnId : awayEspnId;
      const winnerScore = Math.max(homeScore, awayScore);
      const loserScore = Math.min(homeScore, awayScore);
      const diff = winnerScore - loserScore;

      const sortedSlugs = knownTeams.length === 2
        ? [homeTeam!.slug, awayTeam!.slug].sort().join('|')
        : knownTeams[0].slug;

      const expiresAt = new Date(eventDate);
      expiresAt.setDate(expiresAt.getDate() + 5);

      for (const team of knownTeams) {
        const isWinner = team.espn_team_id === winnerEspnId;
        const opponent = knownTeams.find(t => t.slug !== team.slug);
        const opponentName = opponent?.name || (isWinner ? awayComp : homeComp).team?.displayName || 'Opponent';

        const verb = isWinner ? getWinnerVerb(diff) : getLoserVerb(diff);
        const headline = isWinner
          ? `${team.name} ${verb} ${opponentName} ${winnerScore}-${loserScore}`
          : `${team.name} ${verb} ${opponentName} ${winnerScore}-${loserScore}`;
        const storySlug = slugify(`${team.short_name}-${verb}-${opponentName.split(' ').pop()}-${winnerScore}-${loserScore}-${eventDate}`);
        const anchor = `event:${sport}:${eventDate}:${sortedSlugs}:${team.slug}`;
        const matchupKey = `${team.league_short_name}:${eventDate}:${sortedSlugs}`;

        const { data: existing } = await supabase
          .from('stories')
          .select('id')
          .eq('game_id', gameId)
          .contains('team_slugs', [team.slug])
          .eq('source_type', 'espn_game')
          .maybeSingle();

        if (!existing) {
          const { error: storyErr } = await supabase
            .from('stories')
            .insert({
              headline,
              slug: storySlug,
              story_type: 'game_result',
              source_type: 'espn_game',
              sport,
              team_slugs: [team.slug],
              people: [],
              event_date: eventDate,
              game_id: gameId,
              matchup_key: matchupKey,
              story_anchor: anchor,
              status: 'active',
              confidence_level: 'official',
              expires_at: expiresAt.toISOString(),
              show_count: 0,
              episode_count: 0,
              primary_count: 0,
            });
          if (storyErr) {
            errors.push(`story: ${storyErr.message}`);
          } else {
            storiesCreated++;
            console.log(`[create-game-stories] Created: ${headline}`);
          }
        }
      }
    }

    // Process pro leagues
    for (const cfg of PRO_LEAGUES) {
      const leagueMap = leagueEspnMap.get(cfg.league);
      if (!leagueMap) continue;

      for (const dateStr of dates) {
        try {
          const url = `https://site.api.espn.com/apis/site/v2/sports/${cfg.espnSport}/${cfg.espnLeague}/scoreboard?dates=${dateStr}`;
          console.log(`[create-game-stories] Fetching ${url}`);
          const resp = await fetch(url);
          if (!resp.ok) continue;
          const data = await resp.json();

          for (const event of (data.events || [])) {
            try {
              await processEvent(event, cfg.sport, (id) => leagueMap.get(id));
            } catch (e) {
              errors.push(`event: ${String(e)}`);
            }
          }
        } catch (e) {
          errors.push(`fetch ${cfg.league}: ${String(e)}`);
        }
      }
    }

    // Process college (deduplicated: 2 ESPN endpoints, not 9 league configs)
    for (const ep of COLLEGE_ENDPOINTS) {
      for (const dateStr of dates) {
        try {
          const url = `https://site.api.espn.com/apis/site/v2/sports/${ep.espnSport}/${ep.espnLeague}/scoreboard?dates=${dateStr}`;
          console.log(`[create-game-stories] Fetching ${url}`);
          const resp = await fetch(url);
if (!resp.ok) continue;
          const data = await resp.json();

          for (const event of (data.events || [])) {
            try {
              // Use flat college map so cross-conference games work
              await processEvent(event, 'college', (id) => collegeEspnMap.get(id));
            } catch (e) {
              errors.push(`event: ${String(e)}`);
            }
          }
        } catch (e) {
          errors.push(`fetch college ${ep.espnLeague}: ${String(e)}`);
        }
      }
    }

    console.log(`[create-game-stories] Done: ${gamesCreated} games, ${storiesCreated} stories, ${gamesSkipped} skipped, ${errors.length} errors, ${Date.now() - start}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        games_created: gamesCreated,
        stories_created: storiesCreated,
        games_skipped: gamesSkipped,
        errors: errors.slice(0, 10),
        duration_ms: Date.now() - start,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[create-game-stories] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: String(err), duration_ms: Date.now() - start }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
