import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { stripSponsorText } from '../_shared/strip-sponsors.ts';
import { chatCompletion } from '../_shared/google-ai.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
const BATCH_LIMIT = 100;

// ===== Signal type normalization =====
const TYPE_NORMALIZATION_MAP: Record<string, string> = {
  'coach_search': 'coach',
  'coaching_hires': 'coach',
  'coaching_decision': 'coach',
  'coaching-staff-changes': 'coach',
  'coaching_change': 'coach',
  'coaching': 'coach',
  'player_event': 'player',
  'player_signing': 'player',
  'player-outlook-season': 'player',
  'player_trade': 'trade',
  'front_office_moves': 'trade',
  'transaction': 'trade',
  'roster_move': 'trade',
  'free_agency': 'signing',
  'free-agency': 'signing',
  'extension': 'signing',
  'contract': 'signing',
  'suspension': 'player',
  'retirement': 'player',
};

const VALID_SIGNAL_TYPES = ['game', 'trade', 'injury', 'signing', 'draft', 'player', 'coach', 'other'];

function normalizeSignalType(rawType: string): string {
  const lower = rawType.toLowerCase().trim();
  if (VALID_SIGNAL_TYPES.includes(lower)) return lower;
  return TYPE_NORMALIZATION_MAP[lower] || 'other';
}

interface Signal {
  type: 'game' | 'trade' | 'injury' | 'signing' | 'draft' | 'player' | 'coach';
  signal_type?: string;
  teams: string[];
  team_slugs?: string[];
  players?: string[];
  context?: string;
  winner?: string;
  score?: string;
  description: string;
}

interface TeamInfo {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  abbreviation: string;
  city: string | null;
  league_id: string;
  league_slug: string;
}

// ===== Mention validation: confirm a team slug is actually named in source text =====
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function teamIsMentioned(team: TeamInfo, sourceText: string): boolean {
  if (!sourceText) return false;
  const candidates = [team.name, team.short_name, team.city]
    .filter((s): s is string => !!s && s.trim().length >= 3);
  // Abbreviation only counts if it's at least 3 chars (e.g. NYY, BOS) to avoid noise
  if (team.abbreviation && team.abbreviation.length >= 3) candidates.push(team.abbreviation);
  for (const cand of candidates) {
    const re = new RegExp(`\\b${escapeRegExp(cand)}\\b`, 'i');
    if (re.test(sourceText)) return true;
  }
  return false;
}

/**
 * Filter out hallucinated team slugs that aren't actually named in the source.
 * The show's primary team is always allowed (legitimate context).
 */
function validateTeamMentions(
  slugs: string[],
  sourceText: string,
  teamsById: Map<string, TeamInfo>,
  primaryTeamSlug: string | null,
  cap: number,
): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const slug of slugs) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (slug === primaryTeamSlug) { kept.push(slug); continue; }
    const team = teamsById.get(slug);
    if (!team) continue;
    if (teamIsMentioned(team, sourceText)) kept.push(slug);
  }
  return kept.slice(0, cap);
}


function generateSignalCode(type: string, teamSlugs: string[], context?: string, eventDate?: Date): string {
  const sortedTeams = [...teamSlugs].sort().join('_');
  const now = eventDate || new Date();
  
  if (type === 'game' && context) {
    const weekMatch = context.match(/week\s*(\d+)/i);
    if (weekMatch) {
      const year = now.getFullYear();
      return `GAME_${sortedTeams}_${year}W${weekMatch[1].padStart(2, '0')}`;
    }
    const gameMatch = context.match(/game\s*(\d+)/i);
    if (gameMatch) {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      return `GAME_${sortedTeams}_${year}${month}G${gameMatch[1]}`;
    }
  }
  
  const dateKey = now.toISOString().slice(0, 7);
  return `${type.toUpperCase()}_${sortedTeams}_${dateKey}`;
}

const COLLEGE_PREFIXES = ['sec-', 'big-ten-', 'acc-', 'big-east-', 'big-12-'];

function isCollegeTeamSlug(slug: string): boolean {
  return COLLEGE_PREFIXES.some(p => slug.startsWith(p));
}

function inferLeagueFromTeams(teamSlugs: string[], teams: TeamInfo[] = []): string | null {
  if (teamSlugs.length === 0) return null;
  const firstTeam = teamSlugs[0];
  if (firstTeam.startsWith('nfl-')) return 'nfl';
  if (firstTeam.startsWith('nba-')) return 'nba';
  if (firstTeam.startsWith('wnba-')) return 'wnba';
  if (firstTeam.startsWith('nhl-')) return 'nhl';
  if (firstTeam.startsWith('mlb-')) return 'mlb';
  if (firstTeam.startsWith('sec-')) return 'sec';
  if (firstTeam.startsWith('big-ten-')) return 'big-ten';
  if (firstTeam.startsWith('acc-')) return 'acc';
  if (firstTeam.startsWith('big-east-')) return 'big-east';
  if (firstTeam.startsWith('big-12-')) return 'big-12';
  const matchedTeam = teams.find(t => t.slug === firstTeam);
  if (matchedTeam?.league_slug) return matchedTeam.league_slug;
  return null;
}

function cleanSignalDescription(desc: string): string {
  if (!desc) return desc;
  let cleaned = desc
    .replace(/^(Discussion|Analysis|Concerns|Talk|Thoughts|Regarding|Update|Reaction|Overview|Breakdown|Preview|Review|Recap|Report)\s+(about|of|on|to|for|regarding)\s+/i, '')
    .replace(/^(the\s+)?/i, (m) => m.charAt(0).toUpperCase() + m.slice(1));
  const words = cleaned.split(/\s+/);
  if (words.length > 10) cleaned = words.slice(0, 8).join(' ');
  return cleaned;
}

function safeEntityName(name: string): string {
  if (!name) return name;
  if (name.length <= 60) return name;
  return name.substring(0, 57) + '...';
}

function generateDisplayName(signal: { type: string; teams: string[]; players?: string[]; context?: string; winner?: string; score?: string; description: string }, teams: TeamInfo[]): string {
  if (signal.description) return cleanSignalDescription(signal.description);
  const teamNames = signal.teams.map(slug => {
    const team = teams.find(t => t.slug === slug);
    return team?.short_name || team?.name || slug;
  });
  switch (signal.type) {
    case 'game':
      const baseName = teamNames.length >= 2 ? `${teamNames[0]} vs ${teamNames[1]}` : teamNames[0] || 'Unknown Game';
      if (signal.winner && signal.score) {
        const winnerTeam = teams.find(t => t.slug === signal.winner);
        return `${baseName} - ${winnerTeam?.short_name || signal.winner} win ${signal.score}`;
      }
      return baseName;
    case 'trade':
      return signal.players?.length ? `${signal.players[0]} Trade` : `${teamNames.join(' & ')} Trade`;
    case 'injury':
      return signal.players?.length ? `${signal.players[0]} Injury` : `${teamNames[0]} Injury Update`;
    case 'signing':
      return signal.players?.length ? `${signal.players[0]} Signing` : `${teamNames[0]} Signing`;
    case 'draft':
      return `${inferLeagueFromTeams(signal.teams, teams)?.toUpperCase() || ''} Draft ${signal.context || ''}`.trim();
    case 'player':
      return signal.players?.length ? signal.players[0] : 'Player Focus';
    case 'coach':
      return `${teamNames[0]} Coaching Change`;
    default:
      return signal.description || 'Unknown Signal';
  }
}

function areSimilarTypes(a: string, b: string): boolean {
  if (a === b) return true;
  const groups = [['trade', 'signing', 'player'], ['injury', 'player'], ['coach', 'signing']];
  return groups.some(g => g.includes(a) && g.includes(b));
}

async function findRelatedSignal(supabase: any, teamSlugs: string[], entityName: string, signalType: string): Promise<{ id: string; entity_code: string } | null> {
  if (teamSlugs.length === 0) return null;
  const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: candidates } = await supabase
    .from('content_signals')
    .select('id, entity_code, entity_name, team_slugs, signal_type')
    .overlaps('team_slugs', teamSlugs)
    .gte('last_mentioned_at', windowStart)
    .limit(50);
  if (!candidates || candidates.length === 0) return null;
  const nameWords = new Set(entityName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  let bestMatch: { id: string; entity_code: string; score: number } | null = null;
  for (const candidate of candidates) {
    const candidateWords = new Set(candidate.entity_name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: string) => w.length > 2));
    const intersection = [...nameWords].filter(w => candidateWords.has(w)).length;
    const union = new Set([...nameWords, ...candidateWords]).size;
    const similarity = union > 0 ? intersection / union : 0;
    const typeBoost = areSimilarTypes(signalType, candidate.signal_type) ? 0.15 : 0;
    const teamOverlap = teamSlugs.filter(t => (candidate.team_slugs || []).includes(t)).length;
    const teamBoost = teamOverlap / Math.max(teamSlugs.length, (candidate.team_slugs || []).length) * 0.1;
    const finalScore = similarity + typeBoost + teamBoost;
    if (finalScore > 0.35 && (!bestMatch || finalScore > bestMatch.score)) {
      bestMatch = { id: candidate.id, entity_code: candidate.entity_code, score: finalScore };
    }
  }
  return bestMatch;
}

function resolveTeamSlug(slug: string, allTeams: TeamInfo[]): string {
  if (allTeams.find(t => t.slug === slug)) return slug;
  for (const prefix of ['nfl-', 'nba-', 'nhl-', 'mlb-', 'sec-', 'big-ten-', 'acc-', 'big-east-', 'big-12-']) {
    const prefixed = prefix + slug;
    if (allTeams.find(t => t.slug === prefixed)) return prefixed;
  }
  const lower = slug.toLowerCase().replace(/-/g, ' ');
  const byName = allTeams.find(t => t.name.toLowerCase() === lower || t.short_name.toLowerCase() === lower);
  if (byName) return byName.slug;
  return slug;
}

// ===== upsertSignals — extracted verbatim from ai-enrichment-cron =====
async function upsertSignals(
  supabase: any, episodeId: string, signals: Signal[], teams: TeamInfo[],
  episodeTitle: string, showTeamSlug: string | null, publishedAt: string
): Promise<number> {
  let signalsCreated = 0;
  for (const signal of signals) {
    try {
      const rawType = signal.type || signal.signal_type || 'other';
      const rawTeams: string[] = signal.teams || signal.team_slugs || [];
      const normalizedType = normalizeSignalType(rawType);
      let resolvedTeams = rawTeams
        .filter(t => t && typeof t === 'string' && t.trim().length > 0)
        .map(slug => resolveTeamSlug(slug.trim().toLowerCase(), teams));
      resolvedTeams = [...new Set(resolvedTeams)];
      if (resolvedTeams.length === 0 && showTeamSlug) resolvedTeams = [showTeamSlug];
      if (resolvedTeams.length === 0) continue;

      const cleanedDescription = signal.description ? cleanSignalDescription(signal.description) : signal.description;
      const normalizedSignal = { type: normalizedType, teams: resolvedTeams, players: signal.players, context: signal.context, winner: signal.winner, score: signal.score, description: cleanedDescription };
      const code = generateSignalCode(normalizedType, resolvedTeams, signal.context);
      const league = inferLeagueFromTeams(resolvedTeams, teams);
      const rawDisplayName = generateDisplayName(normalizedSignal, teams);
      const displayName = safeEntityName(rawDisplayName);

      const { data: existingSignal } = await supabase
        .from('content_signals').select('id, mention_count, last_mentioned_at').eq('entity_code', code).maybeSingle();

      let signalId: string;
      if (existingSignal) {
        const maxLastMentioned = new Date(Math.max(new Date(existingSignal.last_mentioned_at || 0).getTime(), new Date(publishedAt).getTime())).toISOString();
        await supabase.from('content_signals').update({
          last_mentioned_at: maxLastMentioned, mention_count: (existingSignal.mention_count || 0) + 1,
          metadata: { winner: signal.winner, score: signal.score, context: signal.context, players: signal.players },
        }).eq('id', existingSignal.id);
        signalId = existingSignal.id;
      } else {
        const related = await findRelatedSignal(supabase, resolvedTeams, displayName, normalizedType);
        if (related) {
          const { data: relatedSignal } = await supabase.from('content_signals').select('mention_count, last_mentioned_at').eq('id', related.id).single();
          const maxRelatedMentioned = new Date(Math.max(new Date(relatedSignal?.last_mentioned_at || 0).getTime(), new Date(publishedAt).getTime())).toISOString();
          await supabase.from('content_signals').update({ mention_count: (relatedSignal?.mention_count || 0) + 1, last_mentioned_at: maxRelatedMentioned }).eq('id', related.id);
          signalId = related.id;
        } else {
          const { data: newSignal, error: insertError } = await supabase.from('content_signals').insert({
            entity_code: code, signal_type: normalizedType, entity_name: displayName, team_slugs: resolvedTeams,
            league, first_detected_at: publishedAt, last_mentioned_at: publishedAt,
            metadata: { winner: signal.winner, score: signal.score, context: signal.context, players: signal.players },
          }).select('id').single();
          if (insertError) { console.error('[signal-upsert] Insert error:', insertError); continue; }
          signalId = newSignal.id;
          signalsCreated++;
        }
      }
      await supabase.from('episode_signals').upsert({ episode_id: episodeId, signal_id: signalId, match_snippet: episodeTitle.slice(0, 120) }, { onConflict: 'episode_id,signal_id' });
    } catch (e) {
      console.error(`[signal-upsert] Error processing signal "${signal.description}":`, e);
      continue;
    }
  }
  return signalsCreated;
}

// ===== Team context helpers =====
async function fetchTeamsForSignals(supabase: any): Promise<TeamInfo[]> {
  const { data: teams, error } = await supabase
    .from('teams')
    .select('id, slug, name, short_name, abbreviation, city, league_id, leagues!inner(slug)')
    .eq('is_active', true);
  if (error) { console.error('[teams-fetch] Error:', error); return []; }
  return (teams || []).map((t: any) => ({
    id: t.id, slug: t.slug, name: t.name, short_name: t.short_name,
    abbreviation: t.abbreviation, city: t.city ?? null,
    league_id: t.league_id, league_slug: t.leagues?.slug || '',
  }));
}

function buildTeamContext(teams: TeamInfo[]): string {
  return teams.map(t => `${t.slug}: ${t.name} (${t.short_name}, ${t.abbreviation})`).join('\n');
}

// ===== Tag system prompt — extracted verbatim =====
function buildTagSystemPrompt(teamContext: string): string {
  return `You are a metadata extractor for sports podcast episodes covering MLB, NFL, NBA, WNBA, NHL, SEC (college football & basketball), Big Ten (college football & basketball), ACC (college football & basketball), Big East (college basketball), and Big 12 (college football & basketball).
Extract structured information from episode titles and descriptions.

Return JSON only with these fields (use empty arrays if not found):
- topics: sports topics (e.g., ["trade deadline", "injury report", "draft picks", "game analysis"])
- people: ONLY people who actually APPEAR on the episode as hosts, guests, or interviewees (e.g., ["Tom Brady", "Bill Belichick"]). Do NOT include athletes, coaches, or public figures who are merely the SUBJECT of discussion. Clues for actual guests: "joins the show", "interview with", "sits down with". Clues for discussed-only (exclude): "reacts to [name]", "[name] hit a home run", "breaks down [name]'s stats". When in doubt, do NOT include.
- teams: teams DISCUSSED in this episode beyond the main team. CRITICAL: Only include a team slug if the team's name, city, or nickname literally appears in the title or description. NEVER copy slugs from the AVAILABLE TEAMS list that are not actually mentioned. If no other team is clearly named, return []. Maximum 8 entries — if more than 8 teams are mentioned, only include the most prominent.
  POSITIVE example: title "Aaron Rodgers to the Steelers, Refs Vote on CBA, former Broncos Safety Justin Simmons joins" -> teams: ["nfl-steelers", "nfl-broncos"]  (NOT a long list)
  NEGATIVE example: a generic NFL roundup that names no specific teams -> teams: []
- game_refs: game references (e.g., ["vs Yankees 4/15", "Celtics @ Lakers"])
- categories: Content categories detected. Choose ALL that apply from: ["betting", "fantasy", "recap", "preview", "interview", "analysis", "news"].
  IMPORTANT: Classify based on the EDITORIAL CONTENT of the episode only. Ignore sponsor reads, ad copy, disclaimers, and promotional text. An episode sponsored by a sportsbook (e.g., FanDuel, DraftKings) is NOT automatically betting content.
  "betting" = episode's PRIMARY or SIGNIFICANT focus includes odds, spreads, parlays, picks against the spread, over/unders, prop bets, sportsbook lines, or wagering strategy.
  The word "odds" alone is NOT sufficient. There must be explicit wagering context — lines, spreads, sportsbooks, or betting strategy discussion IN THE EDITORIAL CONTENT (not in ads).
  POSITIVE examples (tag as betting):
    - "My picks against the spread for Week 12" -> include "betting"
    - "Best bets and parlays for tonight's slate" -> include "betting"
    - "Over/under and prop bets for Celtics vs Lakers" -> include "betting"
  NEGATIVE examples (do NOT tag as betting):
    - "My picks for MVP" -> NOT betting (opinion, not wagering)
    - "Red Sox are the favorite to win the division" -> NOT betting (general analysis)
    - Coaching hires, firings, or front office moves -> NOT betting
    - Trade analysis or roster moves (unless discussing betting lines/odds impact) -> NOT betting
    - Game recaps that mention "upset" or "underdog" without wagering context -> NOT betting
    - Draft coverage -> NOT betting
    - Injury reports (unless discussing how the injury affects the betting line) -> NOT betting
    - "Odds are they'll make the playoffs" -> NOT betting (colloquial use of "odds")
    - Episode has FanDuel/DraftKings as a SPONSOR but discusses roster moves -> NOT betting
  An episode CAN have multiple categories. A betting preview should get ["betting", "preview"].
- signals: Array of notable sports events being discussed

AVAILABLE TEAMS (use these exact slugs in signals.teams):
${teamContext}

For each SIGNAL detected, return an object with:
{
  "type": "game|trade|injury|signing|draft|player|coach",
  "teams": ["team-slug-1", "team-slug-2"],
  "players": ["Player Full Name"],
  "context": "Week 12" or "Game 3" or "Trade deadline" etc,
  "winner": "team-slug" or null,
  "score": "34-17" or null,
  "description": "Short summary of the event"
}

=== SIGNAL EXTRACTION RULES (CRITICAL - FOLLOW EXACTLY) ===

0. RELEVANCE GATE (CHECK FIRST - MOST IMPORTANT)
   - A signal should ONLY be created if the episode EXPLICITLY discusses that event
   - Keywords from the signal description MUST appear in the episode title or description
   - If the title mentions "Coach" but discusses player trades → DO NOT create a coach signal
   - When in doubt, DO NOT create the signal

1. ONE EVENT = ONE SIGNAL
   - ✓ "Red Sox Sign Garrett Crochet" → one signal
   - ✓ "Red Sox Sign Sonny Gray" → separate signal
   - ✗ "Red Sox acquire multiple pitchers" (SPLIT into separate signals for each player)

2. MUST BE TIME-BOUND EVENTS (things that happened or are scheduled)
   - ✓ Trades that happened or are reported
   - ✓ Injuries reported
   - ✓ Games played or scheduled
   - ✓ Signings/extensions announced
   - ✗ "Ongoing discussion about X" (not an event)
   - ✗ "Analysis of team needs" (not an event)
   - ✗ "Talk about offensive power" (not an event)

3. SPECIFIC NOUNS REQUIRED
   - ✓ Player name + event type: "Jaylen Brown Hamstring Injury"
   - ✓ Team vs Team + identifier: "Celtics Beat Nets 118-115 2OT"
   - ✗ "offensive power" (too vague)
   - ✗ "pitching depth" (too vague)

4. NO META-LANGUAGE - State the event directly
   - FORBIDDEN prefixes: "Discussion about", "Analysis of", "Concerns about", "Talk about", "Thoughts on", "Regarding", "Update on", "Reaction to"
   - ✗ "Discussion about Rafael Devers trade" → ✓ "Rafael Devers Trade Rumors"
   - ✗ "Concerns about Jaylen Brown hamstring" → ✓ "Jaylen Brown Hamstring Injury"
   - The signal description IS the headline, NOT a description OF a discussion

5. HEADLINE FORMAT (6-8 words maximum)
   - ✓ "Celtics Beat Nets 118-115 2OT"
   - ✓ "Jaylen Brown Hamstring Injury"
   - ✓ "Red Sox Sign Garrett Crochet"
   - ✗ "Boston Celtics win double overtime thriller against the Brooklyn Nets" (WAY too long)

IF NO SPECIFIC EVENT IS MENTIONED, return an empty signals array. Do NOT create vague category signals.

Be specific. Extract from both title and description.
Return ONLY valid JSON, no other text.`;
}

// ===== Show enrichment prompts =====
const CATEGORIZATION_SYSTEM_PROMPT = `You are a sports podcast categorization expert. Analyze the podcast metadata and detect the team.

Available Leagues with Example Teams:
- MLB: Yankees, Mets, Red Sox, Dodgers, Cubs, Braves, Cardinals, Giants, Phillies, Astros, Padres, Mariners, Angels, Rangers, Twins, etc.
- NFL: Patriots, Giants, Cowboys, Chiefs, Eagles, 49ers, Packers, Bears, Bills, Ravens, Dolphins, Jets, Steelers, Broncos, etc.
- NBA: Celtics, Knicks, Lakers, Warriors, Bulls, Heat, Nets, Suns, Bucks, Mavericks, Nuggets, Clippers, Sixers, etc.
- NHL: Bruins, Rangers, Blackhawks, Penguins, Maple Leafs, Canadiens, Red Wings, Flyers, Capitals, Kings, etc.
- SEC (College): Alabama, Auburn, Florida, Georgia, LSU, Tennessee, Texas, Texas A&M, Ole Miss, Oklahoma, etc.
- Big Ten (College): Ohio State, Michigan, Penn State, Oregon, USC, Wisconsin, Iowa, Nebraska, etc.
- ACC (College): Clemson, Florida State, Miami, North Carolina, Duke, Virginia Tech, Notre Dame, Pitt, Louisville, NC State, etc.
- Big East (College Basketball): Villanova, UConn, Marquette, Creighton, Xavier, Georgetown, St. Johns, etc.
- Big 12 (College): Arizona, Arizona State, Baylor, BYU, UCF, Cincinnati, Colorado, Houston, Iowa State, Kansas, Kansas State, Oklahoma State, Texas Tech, TCU, Utah, West Virginia, etc.

Return the team's common nickname in lowercase (hyphenate if multi-word):
Examples: "red-sox", "mets", "yankees", "celtics", "knicks", "cowboys", "49ers", "maple-leafs"

Available Show Types: beat_reporter, former_player, fan_podcast, media_outlet
Available Formats: daily_recap, interview, deep_dive, roundtable, game_preview, mailbag
Available Audience Levels: diehard, casual, fantasy, new_fan

Return JSON with: sport (league, team_slug), location (city, state), show_type, format, audience_level.
Include confidence scores 0.0-1.0.`;

const HOST_EXTRACTION_PROMPT = `You are a podcast metadata extractor specializing in Boston sports podcasts.
Extract the names of regular HOSTS from podcast descriptions.

HOSTS are people who regularly present or host the show.
DO NOT include: Publisher/network names (Audacy, ESPN, NBC, Barstool, iHeart, WEEI, The Athletic), production companies, guest speakers, team names.

Return ONLY valid JSON:
{ "hosts": [ { "name": "First Last", "credentials": "Former Red Sox" or null, "affiliation": "WEEI" or null } ] }

If no specific host names found, return: { "hosts": [] }`;

function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

async function matchTeamByKeyword(supabase: any, showTitle: string, league: string | null): Promise<{ id: string; league_id: string } | null> {
  try {
    let query = supabase.from('teams').select('id, league_id, name, slug, city');
    if (league) {
      const { data: leagueData } = await supabase.from('leagues').select('id').eq('short_name', league).maybeSingle();
      if (leagueData) query = query.eq('league_id', leagueData.id);
    }
    const { data: teams } = await query;
    if (!teams || teams.length === 0) return null;
    const titleLower = showTitle.toLowerCase();
    for (const team of teams) {
      const teamName = team.name.toLowerCase();
      if (titleLower.includes(teamName)) return { id: team.id, league_id: team.league_id };
      for (const word of team.slug.split('-')) {
        if (word.length > 3 && titleLower.includes(word)) return { id: team.id, league_id: team.league_id };
      }
    }
    return null;
  } catch { return null; }
}

// ===== enrichShowWithAI — extracted verbatim from ai-enrichment-cron =====
async function enrichShowWithAI(supabase: any, showId: string, showTitle: string, showDescription: string | null, publisher: string | null): Promise<void> {
  if (!GOOGLE_AI_API_KEY) return;
  console.log(`[enrich-show] Processing show ${showId}: ${showTitle}`);
  try {
    const { data: currentShow } = await supabase.from('shows').select('team_id, league_id').eq('id', showId).single();
    const hasExistingTeam = !!currentShow?.team_id;
    const { data: episodes } = await supabase.from('episodes').select('title').eq('show_id', showId).order('published_at', { ascending: false }).limit(5);
    const episodeTitles = episodes?.map((e: any) => e.title) || [];
    let userPrompt = `Analyze this sports podcast and detect which team it covers:\n\nTitle: ${showTitle}\nPublisher: ${publisher || 'Unknown'}\nDescription: ${showDescription?.substring(0, 1500) || 'No description'}`;
    if (episodeTitles.length > 0) userPrompt += `\n\nSample Episode Titles:\n${episodeTitles.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}`;
    userPrompt += `\n\nReturn JSON:\n{\n  "sport": { "league": "MLB|NFL|NBA|WNBA|NHL|SEC|Big Ten|ACC|Big East or null", "team_slug": "team-nickname-lowercase or null", "confidence": 0.0-1.0 },\n  "location": { "city": "city name", "state": "state name", "confidence": 0.0-1.0 },\n  "show_type": { "value": "beat_reporter|former_player|fan_podcast|media_outlet", "confidence": 0.0-1.0 },\n  "format": { "value": "daily_recap|interview|deep_dive|roundtable|game_preview|mailbag", "confidence": 0.0-1.0 },\n  "audience_level": { "value": "diehard|casual|fantasy|new_fan", "confidence": 0.0-1.0 }\n}`;
    let content: string;
    try {
      content = await chatCompletion({
        messages: [
          { role: 'system', content: CATEGORIZATION_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });
    } catch (e) {
      console.error('[enrich-show] AI API error:', e);
      return;
    }
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!objectMatch) return;
    const suggestions = JSON.parse(objectMatch[0]);
    const updatePayload: Record<string, any> = {};
    if (suggestions.location?.city && suggestions.location.confidence > 0.5) { updatePayload.city = suggestions.location.city; updatePayload.state = suggestions.location.state || null; }
    if (suggestions.audience_level?.value && suggestions.audience_level.confidence > 0.6) updatePayload.audience = suggestions.audience_level.value;
    if (suggestions.show_type?.value && suggestions.show_type.confidence > 0.6) updatePayload.content_type = suggestions.show_type.value;
    if (suggestions.format?.value && suggestions.format.confidence > 0.6) updatePayload.format = suggestions.format.value;
    if (!hasExistingTeam && suggestions.sport?.league) {
      let matchedTeam: { id: string; league_id: string } | null = null;
      if (suggestions.sport.team_slug && suggestions.sport.confidence > 0.7) {
        const aiSlug = suggestions.sport.team_slug.toLowerCase();
        const { data: team } = await supabase.from('teams').select('id, league_id').or(`slug.eq.${aiSlug},slug.ilike.%-${aiSlug}`).limit(1).maybeSingle();
        if (team) matchedTeam = team;
      }
      if (!matchedTeam) matchedTeam = await matchTeamByKeyword(supabase, showTitle, suggestions.sport.league);
      if (matchedTeam) { updatePayload.team_id = matchedTeam.id; updatePayload.league_id = matchedTeam.league_id; }
      if (!currentShow?.league_id && !updatePayload.league_id && suggestions.sport?.league) {
        const { data: league } = await supabase.from('leagues').select('id').eq('slug', suggestions.sport.league.toLowerCase()).maybeSingle();
        if (league) updatePayload.league_id = league.id;
      }
    }
    if (Object.keys(updatePayload).length > 0) {
      await supabase.from('shows').update(updatePayload).eq('id', showId);
      console.log(`[enrich-show] Updated show ${showId}`);
    }
  } catch (e) { console.error('[enrich-show] Error:', e); }
}

// ===== extractHostsForShow — extracted verbatim from ai-enrichment-cron =====
async function extractHostsForShow(supabase: any, showId: string, showTitle: string, showDescription: string | null, publisher: string | null): Promise<void> {
  if (!GOOGLE_AI_API_KEY) return;
  try {
    const userPrompt = `Extract the HOSTS of this podcast from the description.\n\nTitle: ${showTitle}\nPublisher: ${publisher || "Unknown"}\nDescription: ${showDescription?.substring(0, 2000) || "No description"}\n\nRemember: Hosts are PEOPLE who regularly present the show, NOT networks/companies.`;
    let content: string;
    try {
      content = await chatCompletion({
        messages: [
          { role: 'system', content: HOST_EXTRACTION_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
      });
    } catch (e) {
      console.error('[host-extract] AI API error:', e);
      return;
    }
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;
    const parsed = JSON.parse(jsonMatch[0]);
    const extractedHosts = parsed.hosts || [];
    if (extractedHosts.length === 0) return;
    const hostsJson: Array<{ name: string; role: string }> = [];
    for (const host of extractedHosts) {
      if (!host.name || host.name.length < 3) continue;
      if (/^(the |audacy|espn|nbc|barstool|iheartmedia|spotify|apple|weei|nesn)/i.test(host.name)) continue;
      const { data: existingSpeaker } = await supabase.from("speakers").select("id").ilike("full_name", host.name).maybeSingle();
      let speakerId: string;
      if (existingSpeaker) { speakerId = existingSpeaker.id; } else {
        const { firstName, lastName } = parseName(host.name);
        const { data: newSpeaker, error: insertError } = await supabase.from("speakers").insert({ full_name: host.name, first_name: firstName, last_name: lastName, credentials: host.credentials, primary_affiliation: host.affiliation }).select("id").single();
        if (insertError) continue;
        speakerId = newSpeaker.id;
      }
      await supabase.from("show_hosts").upsert({ show_id: showId, speaker_id: speakerId, is_primary: hostsJson.length === 0, display_order: hostsJson.length, extracted_name: host.name, extracted_from: "ai_description" }, { onConflict: 'show_id,speaker_id' });
      hostsJson.push({ name: host.name, role: "Host" });
    }
    if (hostsJson.length > 0) await supabase.from("shows").update({ hosts_json: hostsJson }).eq("id", showId);
  } catch (e) { console.error('[host-extract] Error:', e); }
}

/**
 * tag-episodes — Simplified episode-level enrichment pipeline
 * 
 * Modes:
 *   default (cron)  — tag up to 50 recent untagged episodes
 *   backfill        — tag all untagged episodes for specific team slugs (no date cutoff)
 *   enrich_show     — run show enrichment (categorization + hosts) for a specific show
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const start = Date.now();

  try {
    let mode = 'cron';
    let backfillTeamSlugs: string[] = [];
    let enrichShowId: string | null = null;
    try {
      const body = await req.json();
      if (body?.mode === 'backfill' && Array.isArray(body?.team_slugs)) {
        mode = 'backfill';
        backfillTeamSlugs = body.team_slugs;
      } else if (body?.mode === 'enrich_show' && body?.show_id) {
        mode = 'enrich_show';
        enrichShowId = body.show_id;
      }
    } catch { /* no body = cron mode */ }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    // ===== ENRICH_SHOW MODE: run show categorization + host extraction =====
    if (mode === 'enrich_show' && enrichShowId) {
      const { data: show } = await supabase
        .from('shows').select('id, title, description, publisher, ai_enriched_at')
        .eq('id', enrichShowId).maybeSingle();

      if (!show) {
        return new Response(JSON.stringify({ success: false, error: 'Show not found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (show.ai_enriched_at) {
        return new Response(JSON.stringify({ success: true, mode: 'enrich_show', skipped: true, reason: 'already enriched' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[tag-episodes] Enriching show ${show.id}: ${show.title}`);
      await enrichShowWithAI(supabase, show.id, show.title, show.description, show.publisher);
      await extractHostsForShow(supabase, show.id, show.title, show.description, show.publisher);
      await supabase.from('shows').update({ ai_enriched_at: new Date().toISOString() }).eq('id', show.id);

      return new Response(JSON.stringify({ success: true, mode: 'enrich_show', show_id: show.id, duration_ms: Date.now() - start }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!GOOGLE_AI_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'GOOGLE_AI_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch teams for signal context
    const teams = await fetchTeamsForSignals(supabase);
    const teamContext = buildTeamContext(teams);
    console.log(`[tag-episodes] Mode: ${mode}, loaded ${teams.length} teams`);

    // ===== Build query based on mode =====
    let episodes: any[] = [];

    if (mode === 'backfill') {
      // Backfill: get team IDs from slugs, then find all untagged episodes (no date cutoff)
      const { data: backfillTeams } = await supabase
        .from('teams').select('id, slug').in('slug', backfillTeamSlugs);
      const teamIds = backfillTeams?.map((t: any) => t.id) || [];
      
      if (teamIds.length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'No matching teams found' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data, error } = await supabase
        .from('episodes')
        .select('id, title, description, published_at, show_id, shows!inner(team_id, teams!inner(slug))')
        .in('shows.team_id', teamIds)
        .is('tags_extracted_at', null)
        .eq('is_syndication_dupe', false)
        .order('published_at', { ascending: false })
        .limit(BATCH_LIMIT);

      if (error) {
        console.error('[tag-episodes] Backfill query error:', error);
        // Fallback: use a simpler query
        const { data: showsForTeams } = await supabase
          .from('shows').select('id').in('team_id', teamIds);
        const showIds = showsForTeams?.map((s: any) => s.id) || [];
        
        if (showIds.length > 0) {
          const { data: fallbackEps } = await supabase
            .from('episodes')
            .select('id, title, description, published_at, show_id')
            .in('show_id', showIds)
            .is('tags_extracted_at', null)
            .eq('is_syndication_dupe', false)
            .order('published_at', { ascending: false })
            .limit(BATCH_LIMIT);
          episodes = fallbackEps || [];
        }
      } else {
        episodes = data || [];
      }

      console.log(`[tag-episodes] Backfill: ${episodes.length} untagged episodes for teams [${backfillTeamSlugs.join(', ')}]`);
    } else {
      // Cron mode: atomically claim untagged episodes (prevents double-processing on overlapping cron runs)
      const { data, error } = await supabase.rpc('claim_untagged_episodes', { claim_limit: BATCH_LIMIT });

      if (error) {
        console.error('[tag-episodes] Claim RPC error:', error);
        // Fallback to direct query if RPC fails
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: fallbackData, error: fallbackErr } = await supabase
          .from('episodes')
          .select('id, title, description, published_at, show_id')
          .is('tags_extracted_at', null)
          .eq('is_syndication_dupe', false)
          .gte('published_at', cutoff)
          .order('published_at', { ascending: false })
          .limit(BATCH_LIMIT);
        if (fallbackErr) { console.error('[tag-episodes] Fallback query error:', fallbackErr); }
        episodes = fallbackData || [];
      } else {
        episodes = data || [];
      }
      // Filter out syndication dupes that may have been claimed by the RPC
      episodes = episodes.filter((e: any) => e.is_syndication_dupe !== true);
      console.log(`[tag-episodes] Cron: ${episodes.length} untagged episodes claimed for tagging (after dupe filter)`);
    }

    if (episodes.length === 0) {
      return new Response(JSON.stringify({ success: true, mode, episodes_tagged: 0, signals_created: 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ===== Pre-fetch show → team_slug mappings + show context for all episodes in this batch =====
    const showIds = [...new Set(episodes.map((e: any) => e.show_id))];
    const { data: showTeamData } = await supabase
      .from('shows')
      .select('id, title, team_id, teams(slug, name, league_id, leagues(slug))')
      .in('id', showIds);

    const showTeamMap: Record<string, string | null> = {};
    const showTeamIdMap: Record<string, string | null> = {};
    const showContextMap: Record<string, { showTitle: string; teamSlug: string | null; teamName: string | null; sport: string | null }> = {};
    for (const s of showTeamData || []) {
      const teamSlug = (s as any).teams?.slug || null;
      const teamName = (s as any).teams?.name || null;
      const sport = (s as any).teams?.leagues?.slug || null;
      showTeamMap[s.id] = teamSlug;
      showTeamIdMap[s.id] = s.team_id;
      showContextMap[s.id] = { showTitle: s.title, teamSlug, teamName, sport };
    }

    // Build set of all valid team slugs for post-processing validation
    const validTeamSlugs = new Set(teams.map(t => t.slug));
    const teamsBySlug = new Map<string, TeamInfo>(teams.map(t => [t.slug, t]));

    // ===== Tag each episode =====
    let tagged = 0;
    let totalSignals = 0;
    const teamEpisodeCounts: Record<string, number> = {}; // team_slug → count of newly tagged episodes

    for (const episode of episodes) {
      try {
        const cleanedDescription = stripSponsorText(episode.description)?.substring(0, 2000) || 'No description';
        
        // FIX 1: Include show context in the prompt
        const ctx = showContextMap[episode.show_id] || { showTitle: '', teamSlug: null, teamName: null, sport: null };
        let showContextPrefix = '';
        if (ctx.teamSlug && ctx.teamName && ctx.sport) {
          showContextPrefix = `This episode is from "${ctx.showTitle}", a show about the ${ctx.teamName}. The primary team for all signals is ${ctx.teamSlug} unless the episode explicitly covers a different team's story. Sport: ${ctx.sport}.\n\n`;
        } else if (ctx.showTitle) {
          showContextPrefix = `This episode is from "${ctx.showTitle}".\n\n`;
        }
        
        const userPrompt = `${showContextPrefix}Title: ${episode.title}\n\nDescription: ${cleanedDescription}`;

        let content: string;
        try {
          content = await chatCompletion({
            messages: [
              { role: 'system', content: buildTagSystemPrompt(teamContext) },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.1,
          });
        } catch (e) {
          console.error(`[tag-episodes] AI API error for ${episode.id}:`, e);
          continue;
        }

        let jsonStr = content;
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1];
        const firstBrace = jsonStr.indexOf('{');
        const lastBrace = jsonStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
        }

        const parsed = JSON.parse(jsonStr.trim());
        const tags = {
          topics: parsed.topics || [],
          people: parsed.people || [],
          teams: parsed.teams || [],
          game_refs: parsed.game_refs || [],
          categories: parsed.categories || [],
          signals: parsed.signals || [],
        };

        // FIX 3: Post-process to correct hallucinations
        const primaryTeamSlug = showTeamMap[episode.show_id] || null;
        const primarySport = ctx.sport || null; // e.g. "nba", "nfl", "mlb", "nhl", "sec", "big-ten", "acc", "big-east"
        
        // Helper: check if a team slug belongs to the same league/sport as the show
        // CRITICAL: All college conference prefixes are treated as "same sport"
        // so an SEC show discussing an ACC or Big East team won't get filtered out
        const isSameLeague = (slug: string): boolean => {
          if (!primarySport) return true; // no sport context, allow all
          // If the show's sport is any college conference, accept all college team slugs
          if (isCollegeTeamSlug(primarySport + '-dummy')) {
            return isCollegeTeamSlug(slug);
          }
          return slug.startsWith(primarySport + '-');
        };
        
        // Build the source text used to validate mentions (title + cleaned description)
        const sourceText = `${episode.title || ''} ${cleanedDescription}`;

        // 3a: Filter root-level teams to valid slugs + same league preference
        tags.teams = tags.teams.filter((t: string) => validTeamSlugs.has(t));
        // Remove cross-league hallucinations (e.g. wnba-fever for an nba show)
        if (primarySport) {
          tags.teams = tags.teams.filter((t: string) => isSameLeague(t) || t === primaryTeamSlug);
        }
        // 3a-bis: HALLUCINATION GUARD — drop any team slug not actually named in the source
        const beforeMention = tags.teams.length;
        tags.teams = validateTeamMentions(tags.teams, sourceText, teamsBySlug, primaryTeamSlug, 8);
        if (beforeMention !== tags.teams.length) {
          console.log(`[tag-episodes] Mention-filter dropped ${beforeMention - tags.teams.length} hallucinated team(s) for ${episode.id}`);
        }
        if (primaryTeamSlug && !tags.teams.includes(primaryTeamSlug)) {
          tags.teams.unshift(primaryTeamSlug);
        }
        
        // 3b: Fix signals
        for (const signal of tags.signals) {
          // Filter signal teams to valid slugs
          if (Array.isArray(signal.teams)) {
            signal.teams = signal.teams.filter((t: string) => validTeamSlugs.has(t));
            // Remove cross-league hallucinations from signals
            if (primarySport) {
              signal.teams = signal.teams.filter((t: string) => isSameLeague(t));
            }
            // HALLUCINATION GUARD on signal teams (cap 4)
            signal.teams = validateTeamMentions(signal.teams, sourceText, teamsBySlug, primaryTeamSlug, 4);
          } else {
            signal.teams = [];
          }
          // Ensure primary team is present in signal teams if empty
          if (signal.teams.length === 0 && primaryTeamSlug) {
            signal.teams.push(primaryTeamSlug);
          } else if (primaryTeamSlug && !signal.teams.includes(primaryTeamSlug)) {
            signal.teams.push(primaryTeamSlug);
          }
          // Validate winner slug — must be valid AND same league AND mentioned
          if (signal.winner) {
            const winnerTeam = teamsBySlug.get(signal.winner);
            const winnerOk =
              validTeamSlugs.has(signal.winner) &&
              (!primarySport || isSameLeague(signal.winner)) &&
              (signal.winner === primaryTeamSlug || (winnerTeam ? teamIsMentioned(winnerTeam, sourceText) : false));
            if (!winnerOk) {
              console.log(`[tag-episodes] Nullified invalid/cross-league/unmentioned winner "${signal.winner}" for episode ${episode.id}`);
              signal.winner = null;
            }
          }
        }

        // Update episode with extracted tags
        await supabase.from('episodes').update({
          extracted_tags: tags,
          tags_extracted_at: new Date().toISOString(),
        }).eq('id', episode.id);

        tagged++;

        // Upsert signals for trending topics
        const showTeamSlug = showTeamMap[episode.show_id] || null;
        if (tags.signals && tags.signals.length > 0) {
          const signalsCreated = await upsertSignals(
            supabase, episode.id, tags.signals, teams, episode.title,
            showTeamSlug, episode.published_at || new Date().toISOString()
          );
          totalSignals += signalsCreated;
        }

        // Mark signals as extracted
        await supabase.from('episodes').update({ signals_extracted_at: new Date().toISOString() }).eq('id', episode.id);

        // Track team episode counts for synthesis trigger
        if (showTeamSlug) {
          teamEpisodeCounts[showTeamSlug] = (teamEpisodeCounts[showTeamSlug] || 0) + 1;
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) {
        console.error(`[tag-episodes] Error tagging episode ${episode.id}:`, e);
      }
    }

    // ===== Increment team episode counters =====
    for (const [slug, count] of Object.entries(teamEpisodeCounts)) {
      try {
        await supabase.rpc('increment_team_episode_count', { p_slug: slug, p_count: count });
        console.log(`[tag-episodes] Incremented ${slug} by ${count}`);
      } catch (e) {
        console.error(`[tag-episodes] Counter increment error for ${slug}:`, e);
      }
    }

    // V2 synthesis pipeline removed — V1 match-episodes-to-game-stories handles story linking

    // ===== Post-batch: betting/fantasy show detection =====
    const processedShowIds = [...new Set(episodes.map((e: any) => e.show_id))];
    try {
      for (const sid of processedShowIds) {
        const { count: totalTagged } = await supabase
          .from('episodes').select('*', { count: 'exact', head: true })
          .eq('show_id', sid).not('extracted_tags', 'is', null);
        
        if ((totalTagged ?? 0) >= 10) {
          // Betting detection
          const { data: bettingEps } = await supabase
            .from('episodes').select('id').eq('show_id', sid)
            .not('extracted_tags', 'is', null).contains('extracted_tags', { categories: ['betting'] });
          const bettingCount = bettingEps?.length ?? 0;
          const isBetting = bettingCount / (totalTagged ?? 1) > 0.6;
          if (!isBetting) {
            const { data: curr } = await supabase.from('shows').select('is_betting_show').eq('id', sid).single();
            if (curr?.is_betting_show) continue;
          }
          await supabase.from('shows').update({ is_betting_show: isBetting }).eq('id', sid);
          if (isBetting) console.log(`[tag-episodes] Show ${sid} flagged as betting (${bettingCount}/${totalTagged})`);

          // Fantasy detection
          const { data: fantasyEps } = await supabase
            .from('episodes').select('id').eq('show_id', sid)
            .not('extracted_tags', 'is', null).contains('extracted_tags', { categories: ['fantasy'] });
          const fantasyCount = fantasyEps?.length ?? 0;
          const isFantasy = fantasyCount / (totalTagged ?? 1) > 0.6;
          if (!isFantasy) {
            const { data: curr } = await supabase.from('shows').select('is_fantasy_show').eq('id', sid).single();
            if (curr?.is_fantasy_show) continue;
          }
          await supabase.from('shows').update({ is_fantasy_show: isFantasy }).eq('id', sid);
          if (isFantasy) console.log(`[tag-episodes] Show ${sid} flagged as fantasy (${fantasyCount}/${totalTagged})`);
        }
      }
    } catch (e) {
      console.error('[tag-episodes] Betting/fantasy detection error:', e);
    }

    // ===== Post-batch: process pending syndication copies =====
    // After tagging originals, check if any dupes are waiting for metadata copy
    try {
      const taggedEpisodeIds = episodes.map((e: any) => e.id);
      const { data: pendingDupes } = await supabase
        .from('episodes')
        .select('id, syndication_source_id')
        .eq('pending_syndication_copy', true)
        .in('syndication_source_id', taggedEpisodeIds)
        .limit(100);

      if (pendingDupes?.length) {
        console.log(`[tag-episodes] Processing ${pendingDupes.length} pending syndication copies`);
        for (const dupe of pendingDupes) {
          try {
            // Copy extracted_tags and processing timestamps
            const { data: source } = await supabase
              .from('episodes')
              .select('extracted_tags, tags_extracted_at, signals_extracted_at, stories_extracted_at, speakers_extracted_at')
              .eq('id', dupe.syndication_source_id)
              .single();

            if (source?.tags_extracted_at) {
              await supabase.from('episodes').update({
                extracted_tags: source.extracted_tags,
                tags_extracted_at: source.tags_extracted_at,
                signals_extracted_at: source.signals_extracted_at,
                stories_extracted_at: source.stories_extracted_at,
                speakers_extracted_at: source.speakers_extracted_at,
                pending_syndication_copy: false,
              }).eq('id', dupe.id);

              // Copy player_episodes
              const { data: playerEps } = await supabase
                .from('player_episodes')
                .select('player_id, mention_type, confidence, source_text')
                .eq('episode_id', dupe.syndication_source_id);
              if (playerEps?.length) {
                await supabase.from('player_episodes').upsert(
                  playerEps.map((pe: any) => ({ ...pe, episode_id: dupe.id })),
                  { onConflict: 'player_id,episode_id' }
                );
              }

              // Copy episode_stories
              const { data: storyLinks } = await supabase
                .from('episode_stories')
                .select('story_id, relevance')
                .eq('episode_id', dupe.syndication_source_id);
              if (storyLinks?.length) {
                await supabase.from('episode_stories').upsert(
                  storyLinks.map((es: any) => ({ ...es, episode_id: dupe.id })),
                  { onConflict: 'episode_id,story_id' }
                );
              }

              // Copy episode_signals
              const { data: signals } = await supabase
                .from('episode_signals')
                .select('signal_id, match_snippet')
                .eq('episode_id', dupe.syndication_source_id);
              if (signals?.length) {
                await supabase.from('episode_signals').upsert(
                  signals.map((es: any) => ({ ...es, episode_id: dupe.id })),
                  { onConflict: 'episode_id,signal_id' }
                );
              }

              console.log(`[tag-episodes] Syndication copy complete: ${dupe.syndication_source_id} → ${dupe.id}`);
            }
          } catch (e) {
            console.error(`[tag-episodes] Syndication copy error for ${dupe.id}:`, e);
          }
        }
      }
    } catch (e) {
      console.error('[tag-episodes] Pending syndication copy error:', e);
    }

    // ===== Fire-and-forget: speaker extraction + per-episode story extraction =====
    fetch(`${supabaseUrl}/functions/v1/extract-episode-speakers`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_size: 50 }),
    }).then(r => { console.log(`[tag-episodes] Speaker extraction: ${r.status}`); r.body?.cancel(); })
      .catch(e => console.error('[tag-episodes] Speaker extraction error:', e));

    // V2 per-episode story extraction removed — V1 pipeline handles this

    fetch(`${supabaseUrl}/functions/v1/resolve-episode-players`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_size: 50 }),
    }).then(r => { console.log(`[tag-episodes] Player resolution: ${r.status}`); r.body?.cancel(); })
      .catch(e => console.error('[tag-episodes] Player resolution error:', e));

    // ===== Trigger trending update if we tagged anything =====
    if (tagged > 0) {
      fetch(`${supabaseUrl}/functions/v1/update-trending-cron`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
        body: '{}',
      }).then(r => { r.body?.cancel(); }).catch(() => {});
    }

    const result = {
      success: true, mode,
      episodes_found: episodes.length, episodes_tagged: tagged, signals_created: totalSignals,
      team_episode_counts: teamEpisodeCounts,
      duration_ms: Date.now() - start,
    };
    console.log(`[tag-episodes] Complete:`, JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[tag-episodes] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: String(err), duration_ms: Date.now() - start }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
