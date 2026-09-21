/**
 * fetch-espn-scores.js
 *
 * Fetches completed game results from ESPN's public scoreboard API,
 * upserts them into the `games` table, and creates per-team stories
 * in the `stories` table.
 *
 * Designed to run as a GitHub Actions cron job (every 3 hours).
 * Can also be run locally: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/fetch-espn-scores.js
 */

const { createClient } = require('@supabase/supabase-js');

// ── Config ──────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKFILL_DAYS = parseInt(process.env.BACKFILL_DAYS || '2', 10);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

// ── Helpers ─────────────────────────────────────────────────────────

function getWinnerVerb(diff) {
  if (diff >= 20) return ['crush', 'rout', 'dominate'][Math.floor(Math.random() * 3)];
  if (diff >= 10) return ['beat', 'top', 'handle'][Math.floor(Math.random() * 3)];
  return ['edge', 'outlast', 'hold off'][Math.floor(Math.random() * 3)];
}

function getLoserVerb(diff) {
  if (diff >= 20) return ['crushed by', 'routed by'][Math.floor(Math.random() * 2)];
  if (diff >= 10) return ['fall to', 'lose to'][Math.floor(Math.random() * 2)];
  return ['edged by', 'fall to'][Math.floor(Math.random() * 2)];
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

function extractCompScore(competitor) {
  const s = competitor?.score;
  if (typeof s === 'string') return parseInt(s, 10) || 0;
  if (typeof s === 'number') return s;
  if (s?.value != null) return parseInt(s.value, 10) || 0;
  if (s?.displayValue) return parseInt(s.displayValue, 10) || 0;
  const ls = competitor?.linescores;
  if (Array.isArray(ls)) {
    return ls.reduce((sum, l) => sum + (parseInt(l.value, 10) || 0), 0);
  }
  return 0;
}

async function fetchJSON(url) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }
  return resp.json();
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const start = Date.now();
  console.log(`[fetch-espn-scores] Starting with backfill_days=${BACKFILL_DAYS}`);

  // Load teams with ESPN IDs
  const { data: teams, error: teamsErr } = await supabase
    .from('teams')
    .select('slug, name, short_name, espn_team_id, league:leagues!inner(short_name, slug)')
    .not('espn_team_id', 'is', null);

  if (teamsErr) throw teamsErr;
  console.log(`[fetch-espn-scores] Loaded ${teams.length} teams with ESPN IDs`);

  // Build per-league ESPN ID → team maps
  const leagueEspnMap = new Map();
  const collegeEspnMap = new Map();

  for (const t of teams || []) {
    const leagueSlug = (t.league?.slug || '').toLowerCase();
    if (!t.espn_team_id || !leagueSlug) continue;

    if (!leagueEspnMap.has(leagueSlug)) {
      leagueEspnMap.set(leagueSlug, new Map());
    }
    const row = { ...t, league_short_name: leagueSlug };
    leagueEspnMap.get(leagueSlug).set(t.espn_team_id, row);

    if (COLLEGE_CONFERENCES.includes(leagueSlug)) {
      collegeEspnMap.set(t.espn_team_id, row);
    }
  }

  console.log(`[fetch-espn-scores] Leagues mapped: ${[...leagueEspnMap.keys()].join(', ')}`);
  console.log(`[fetch-espn-scores] College teams: ${collegeEspnMap.size}`);

  // Build date range
  const dates = [];
  const today = new Date();
  const daysBack = Math.max(2, BACKFILL_DAYS + 1);
  for (let i = 0; i < daysBack; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }

  let gamesCreated = 0;
  let storiesCreated = 0;
  let gamesSkipped = 0;
  const errors = [];
  const processedGameIds = new Set();

  // ── Process a single ESPN event ──

  async function processEvent(event, sport, leagueLookup) {
    const competition = event.competitions?.[0];
    if (!competition) return;
    if (event.status?.type?.completed !== true) return;

    const espnGameId = String(event.id);
    if (processedGameIds.has(espnGameId)) return;
    processedGameIds.add(espnGameId);

    const competitors = competition.competitors || [];
    if (competitors.length < 2) return;

    const homeComp = competitors.find((c) => c.homeAway === 'home');
    const awayComp = competitors.find((c) => c.homeAway === 'away');
    if (!homeComp || !awayComp) return;

    const homeEspnId = parseInt(homeComp.team?.id);
    const awayEspnId = parseInt(awayComp.team?.id);

    const homeTeam = leagueLookup(homeEspnId);
    const awayTeam = leagueLookup(awayEspnId);

    if (!homeTeam && !awayTeam) { gamesSkipped++; return; }

    const homeScore = extractCompScore(homeComp);
    const awayScore = extractCompScore(awayComp);
    const eventDate = event.date ? event.date.slice(0, 10) : '';
    const venue = competition.venue?.fullName || null;

    const primaryTeam = homeTeam || awayTeam;
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
    const knownTeams = [homeTeam, awayTeam].filter(Boolean);
    const winnerEspnId = homeScore >= awayScore ? homeEspnId : awayEspnId;
    const winnerScore = Math.max(homeScore, awayScore);
    const loserScore = Math.min(homeScore, awayScore);
    const diff = winnerScore - loserScore;

    const sortedSlugs = knownTeams.length === 2
      ? [homeTeam.slug, awayTeam.slug].sort().join('|')
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
          console.log(`  Created: ${headline}`);
        }
      }
    }
  }

  // ── Fetch pro leagues ──

  for (const cfg of PRO_LEAGUES) {
    const leagueMap = leagueEspnMap.get(cfg.league);
    if (!leagueMap) {
      console.log(`[fetch-espn-scores] No teams for ${cfg.league}, skipping`);
      continue;
    }

    for (const dateStr of dates) {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${cfg.espnSport}/${cfg.espnLeague}/scoreboard?dates=${dateStr}`;
      try {
        const data = await fetchJSON(url);
        const events = data.events || [];
        console.log(`[fetch-espn-scores] ${cfg.espnLeague} ${dateStr}: ${events.length} events`);

        for (const event of events) {
          try {
            await processEvent(event, cfg.sport, (id) => leagueMap.get(id));
          } catch (e) {
            errors.push(`event ${cfg.espnLeague}: ${String(e)}`);
          }
        }
      } catch (e) {
        errors.push(`fetch ${cfg.espnLeague} ${dateStr}: ${String(e)}`);
      }
    }
  }

  // ── Fetch college ──

  for (const ep of COLLEGE_ENDPOINTS) {
    for (const dateStr of dates) {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${ep.espnSport}/${ep.espnLeague}/scoreboard?dates=${dateStr}`;
      try {
        const data = await fetchJSON(url);
        const events = data.events || [];
        console.log(`[fetch-espn-scores] ${ep.espnLeague} ${dateStr}: ${events.length} events`);

        for (const event of events) {
          try {
            await processEvent(event, 'college', (id) => collegeEspnMap.get(id));
          } catch (e) {
            errors.push(`event ${ep.espnLeague}: ${String(e)}`);
          }
        }
      } catch (e) {
        errors.push(`fetch ${ep.espnLeague} ${dateStr}: ${String(e)}`);
      }
    }
  }

  // ── Summary ──

  const duration = Date.now() - start;
  console.log(`\n[fetch-espn-scores] Done in ${duration}ms`);
  console.log(`  Games upserted: ${gamesCreated}`);
  console.log(`  Stories created: ${storiesCreated}`);
  console.log(`  Games skipped (no matching teams): ${gamesSkipped}`);
  if (errors.length > 0) {
    console.log(`  Errors (${errors.length}):`);
    for (const e of errors.slice(0, 20)) {
      console.log(`    - ${e}`);
    }
  }

  if (errors.length > 0 && gamesCreated === 0 && storiesCreated === 0) {
    console.error('[fetch-espn-scores] No games or stories created and errors occurred');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[fetch-espn-scores] Fatal error:', err);
  process.exit(1);
});
