import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { stripSponsorText } from "../_shared/strip-sponsors.ts";
import { chatCompletion } from '../_shared/google-ai.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ===== FIX 2: Signal type normalization map =====
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

interface Speaker {
  name: string;
  role?: string;
  affiliation?: string;
}

interface Signal {
  type: 'game' | 'trade' | 'injury' | 'signing' | 'draft' | 'player' | 'coach';
  signal_type?: string; // AI sometimes uses this instead of type
  teams: string[];
  team_slugs?: string[]; // AI sometimes uses this instead of teams
  players?: string[];
  context?: string;
  winner?: string;
  score?: string;
  description: string;
}

interface ExtractedTags {
  sport: string | null;
  league: string | null;
  team: string | null;
  players: string[];
  opponents: string[];
  game_dates: string[];
  topics: string[];
  seasons: string[];
  stats: string[];
  locations: string[];
  speakers: Speaker[];
  people: string[];
  pillars: string[];
  categories: string[];
  signals: Signal[];
}

interface Team {
  slug: string;
  name: string;
  short_name: string;
  abbreviation: string;
  city: string | null;
  league_slug: string;
}

// ===== Mention validation: confirm a team slug is actually named in source text =====
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function teamIsMentioned(team: Team, sourceText: string): boolean {
  if (!sourceText) return false;
  const candidates = [team.name, team.short_name, team.city]
    .filter((s): s is string => !!s && s.trim().length >= 3);
  if (team.abbreviation && team.abbreviation.length >= 3) candidates.push(team.abbreviation);
  for (const cand of candidates) {
    const re = new RegExp(`\\b${escapeRegExp(cand)}\\b`, 'i');
    if (re.test(sourceText)) return true;
  }
  return false;
}

function validateTeamMentions(
  slugs: string[],
  sourceText: string,
  teamsBySlug: Map<string, Team>,
  primaryTeamSlug: string | null,
  cap: number,
): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const slug of slugs) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    if (slug === primaryTeamSlug) { kept.push(slug); continue; }
    const team = teamsBySlug.get(slug);
    if (!team) continue;
    if (teamIsMentioned(team, sourceText)) kept.push(slug);
  }
  return kept.slice(0, cap);
}

// Generate canonical signal code by sorting team slugs alphabetically
function generateSignalCode(type: string, teamSlugs: string[], context?: string, eventDate?: Date): string {
  const sortedTeams = [...teamSlugs].sort().join('_');
  const now = eventDate || new Date();
  
  if (type === 'game' && context) {
    // Extract week number for NFL
    const weekMatch = context.match(/week\s*(\d+)/i);
    if (weekMatch) {
      const year = now.getFullYear();
      return `GAME_${sortedTeams}_${year}W${weekMatch[1].padStart(2, '0')}`;
    }
    // Extract game number for NBA/NHL/MLB
    const gameMatch = context.match(/game\s*(\d+)/i);
    if (gameMatch) {
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      return `GAME_${sortedTeams}_${year}${month}G${gameMatch[1]}`;
    }
  }
  
  // For trades/signings/injuries/draft, use year-month
  const dateKey = now.toISOString().slice(0, 7); // YYYY-MM
  return `${type.toUpperCase()}_${sortedTeams}_${dateKey}`;
}

// Infer league from team slugs
function inferLeagueFromTeams(teamSlugs: string[], allTeams: Team[] = []): string | null {
  if (teamSlugs.length === 0) return null;
  
  const firstTeam = teamSlugs[0];
  if (firstTeam.startsWith('nfl-')) return 'nfl';
  if (firstTeam.startsWith('nba-')) return 'nba';
  if (firstTeam.startsWith('wnba-')) return 'wnba';
  if (firstTeam.startsWith('mlb-')) return 'mlb';
  if (firstTeam.startsWith('nhl-')) return 'nhl';
  
  // Fallback: lookup in teams array
  const matchedTeam = allTeams.find(t => t.slug === firstTeam);
  if (matchedTeam?.league_slug) return matchedTeam.league_slug;
  
  return null;
}

// Strip meta-language prefixes from signal descriptions
function cleanSignalDescription(desc: string): string {
  if (!desc) return desc;
  
  let cleaned = desc
    .replace(/^(Discussion|Analysis|Concerns|Talk|Thoughts|Regarding|Update|Reaction|Overview|Breakdown|Preview|Review|Recap|Report)\s+(about|of|on|to|for|regarding)\s+/i, '')
    .replace(/^(the\s+)?/i, (m) => m.charAt(0).toUpperCase() + m.slice(1));
  
  const words = cleaned.split(/\s+/);
  if (words.length > 10) {
    cleaned = words.slice(0, 8).join(' ');
  }
  
  return cleaned;
}

// FIX 4: Truncate entity name to 60 chars max
function safeEntityName(name: string): string {
  if (!name) return name;
  if (name.length <= 60) return name;
  return name.substring(0, 57) + '...';
}

// Generate display name for signal
function generateDisplayName(signal: { type: string; teams: string[]; players?: string[]; context?: string; winner?: string; score?: string; description: string }, teams: Team[]): string {
  if (signal.description) return cleanSignalDescription(signal.description);
  
  const teamNames = signal.teams.map(slug => {
    const team = teams.find(t => t.slug === slug);
    return team?.short_name || team?.name || slug;
  });
  
  switch (signal.type) {
    case 'game':
      const baseName = teamNames.length >= 2 
        ? `${teamNames[0]} vs ${teamNames[1]}`
        : teamNames[0] || 'Unknown Game';
      if (signal.winner && signal.score) {
        const winnerTeam = teams.find(t => t.slug === signal.winner);
        return `${baseName} - ${winnerTeam?.short_name || signal.winner} win ${signal.score}`;
      }
      return baseName;
    case 'trade':
      return signal.players?.length 
        ? `${signal.players[0]} Trade`
        : `${teamNames.join(' & ')} Trade`;
    case 'injury':
      return signal.players?.length 
        ? `${signal.players[0]} Injury`
        : `${teamNames[0]} Injury Update`;
    case 'signing':
      return signal.players?.length 
        ? `${signal.players[0]} Signing`
        : `${teamNames[0]} Signing`;
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

function buildSystemPrompt(teamContext: string): string {
  return `You are a metadata extractor for sports podcast episodes covering MLB, NFL, NBA, WNBA, and NHL.
Extract structured information from episode titles and descriptions.
First, detect which sport(s) the episode is about, then extract relevant metadata.

Return JSON only with these fields (use empty arrays/null if not found):
- sport: Primary sport discussed ("baseball", "football", "basketball", "hockey", or "multi")
- league: League if identifiable ("MLB", "NFL", "NBA", "WNBA", "NHL", or null)
- team: Primary team discussed if identifiable (e.g., "Red Sox", "Patriots", "Celtics", "Bruins")
- players: Athletes mentioned (current or former, with full names when possible)
- opponents: Teams or opponents discussed
- game_dates: Specific game dates or events mentioned (e.g., "January 15, 2026", "Super Bowl", "Game 7", "Opening Day")
- topics: Sports topics (e.g., "pitching", "quarterback", "defense", "trades", "free agency", "draft", "playoffs", "injuries")
- seasons: Years or seasons referenced (e.g., "2025 season", "2024 playoffs", "2004 World Series")
- stats: Notable statistics mentioned (e.g., "batting average", "passing yards", "points per game", "goals")
- locations: Venues or places mentioned (e.g., "Fenway Park", "Gillette Stadium", "TD Garden")
- speakers: People who actually APPEAR on the episode as a speaker, host, or interviewee. Extract objects with: name (full name), role (if mentioned like "Coach", "GM", "Analyst"), affiliation (team/network if mentioned).
  CRITICAL DISTINCTION — "Guest" means someone who PARTICIPATES in the recording as a speaker/interviewee. People who are the SUBJECT of discussion are NOT guests or speakers.
  Clues someone is an ACTUAL guest/speaker:
    - "joins the show", "sits down with", "interview with", "talks to [host]", "guest: [name]", "[name] stops by", "welcomes [name]"
    - A timestamp or segment heading with a person's name + a verb of participation (e.g., "Dr. Smith at 15:00")
    - Someone identified as a co-host, correspondent, insider, or analyst ON the show
  Clues someone is merely DISCUSSED (do NOT include):
    - "reacts to [name]'s performance", "what's next for [name]", "breaks down [name]'s stats"
    - "[name] hit a home run", "[name] signed a contract", "[name] is injured"
    - Any athlete or coach whose actions/performance are being analyzed but who is not speaking
  When in doubt, do NOT list as a speaker/guest. It is better to miss a guest than to falsely attribute one.
- people: Simple array of names of people who actually APPEAR on the episode (hosts, guests, interviewees). Do NOT include athletes, coaches, or public figures who are merely the SUBJECT of discussion. Apply the same guest vs. discussed distinction as speakers above.
- pillars: Content categories. Choose from: game-recaps, trade-rumors, prospects, team-history, player-interviews, fantasy, hot-takes, news, draft-analysis, coaching. Can include multiple.
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
- signals: Array of notable sports events being discussed. IMPORTANT: Use ONLY the team slugs from the list below.

AVAILABLE TEAMS (use these exact slugs in signals.teams):
${teamContext}

=== SIGNAL EXTRACTION RULES (CRITICAL - FOLLOW EXACTLY) ===

0. RELEVANCE GATE (CHECK FIRST - MOST IMPORTANT)
   - A signal should ONLY be created if the episode EXPLICITLY discusses that event
   - Keywords from the signal description MUST appear in the episode title or description
   - If the title mentions "Coach" but discusses player trades → DO NOT create a coach signal
   - Example: "Wilson Denies Epstein Ties" does NOT discuss "OC Search" → NO coach signal
   - Example: "Celtics Win, Butler Trade Rumors" → OK to create Butler trade signal, but NOT a separate coaching signal
   - When in doubt, DO NOT create the signal

1. ONE EVENT = ONE SIGNAL
   - ✓ "Red Sox Sign Garrett Crochet" → one signal
   - ✓ "Red Sox Sign Sonny Gray" → separate signal
   - ✗ "Red Sox acquire multiple pitchers" (SPLIT into separate signals for each player)
   - If an episode discusses 3 signings, create 3 separate signal objects

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
   - ✗ "roster moves" (too vague)

4. NO META-LANGUAGE - State the event directly
   - FORBIDDEN prefixes: "Discussion about", "Analysis of", "Concerns about", "Talk about", "Thoughts on", "Regarding", "Update on", "Reaction to"
   - ✗ "Discussion about Rafael Devers trade" → ✓ "Rafael Devers Trade Rumors"
   - ✗ "Concerns about Jaylen Brown hamstring" → ✓ "Jaylen Brown Hamstring Injury"
   - ✗ "Talk about free agency moves" → ✓ Specific player signing (or skip if no specific event)
   - ✗ "Discussion about the Giants' OC search" → ✓ "New York Giants OC Search"
   - The signal description IS the headline, NOT a description OF a discussion

5. HEADLINE FORMAT (6-8 words maximum)
   - ✓ "Celtics Beat Nets 118-115 2OT"
   - ✓ "Jaylen Brown Hamstring Injury"
   - ✓ "Red Sox Sign Garrett Crochet"
   - ✓ "Rafael Devers Trade Rumors"
   - ✓ "New York Giants OC Search"
   - ✗ "Boston Celtics win double overtime thriller against the Brooklyn Nets with help from rookies" (WAY too long)

IF NO SPECIFIC EVENT IS MENTIONED, return an empty signals array. Do NOT create vague category signals.

Be specific. Use standardized player, team, and venue names where possible.
For speakers/people, ONLY include people who APPEAR on the episode (hosts, guests, interviewees). Look for patterns like "joins us", "interview with", "welcome back". Do NOT include athletes/coaches who are merely discussed as subjects.
Return ONLY valid JSON, no other text.`;
}

async function fetchTeams(supabase: any): Promise<Team[]> {
  const { data: teams, error } = await supabase
    .from('teams')
    .select(`
      slug,
      name,
      short_name,
      abbreviation,
      city,
      leagues!inner(slug)
    `)
    .eq('is_active', true);
  
  if (error) {
    console.error('Error fetching teams:', error);
    return [];
  }
  
  return (teams || []).map((t: any) => ({
    slug: t.slug,
    name: t.name,
    short_name: t.short_name,
    abbreviation: t.abbreviation,
    city: t.city ?? null,
    league_slug: t.leagues?.slug || '',
  }));
}

function buildTeamContext(teams: Team[]): string {
  return teams.map(t => 
    `${t.slug}: ${t.name} (${t.short_name}, ${t.abbreviation})`
  ).join('\n');
}

async function extractTags(
  title: string, 
  description: string,
  teamContext: string
): Promise<ExtractedTags> {
  const systemPrompt = buildSystemPrompt(teamContext);
  const cleanedDescription = stripSponsorText(description)?.substring(0, 2000) || 'No description';
  const userPrompt = `Title: ${title}\n\nDescription: ${cleanedDescription}`;

  console.log('Calling Google AI for tag + signal extraction...');

  const content = await chatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  // Parse JSON from the response - handle various markdown formats
  let jsonStr = content.trim();
  
  // Remove markdown code fences (```json, ```, etc.)
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }
  
  // Find the first { and last } to extract the JSON object
  const firstBrace = jsonStr.indexOf('{');
  const lastBrace = jsonStr.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    
    // Post-process: clean signal descriptions
    const signals = (parsed.signals || []).map((s: Signal) => ({
      ...s,
      description: s.description ? cleanSignalDescription(s.description) : s.description,
    }));
    
    return {
      sport: parsed.sport || null,
      league: parsed.league || null,
      team: parsed.team || null,
      players: parsed.players || [],
      opponents: parsed.opponents || [],
      game_dates: parsed.game_dates || [],
      topics: parsed.topics || [],
      seasons: parsed.seasons || [],
      stats: parsed.stats || [],
      locations: parsed.locations || [],
      speakers: parsed.speakers || [],
      people: parsed.people || [],
      pillars: parsed.pillars || [],
      categories: parsed.categories || [],
      signals: signals,
    };
  } catch (e) {
    console.error('Failed to parse AI response. Raw content:', content);
    console.error('Extracted JSON string:', jsonStr);
    throw new Error('Failed to parse AI response as JSON');
  }
}

// ===== ENTITY RELEVANCE GATE =====

// Common sports words that should NOT count as "significant" for relevance matching
const COMMON_SPORTS_WORDS = new Set([
  'team', 'game', 'trade', 'injury', 'signing', 'draft', 'player', 'coach',
  'update', 'rumors', 'news', 'report', 'deal', 'move', 'contract', 'free',
  'agency', 'roster', 'season', 'training', 'camp', 'spring', 'fort', 'myers',
  'practice', 'workout', 'prep', 'status', 'return', 'list', 'day',
  'boston', 'new', 'york', 'city', 'los', 'angeles', 'san', 'francisco',
]);

/**
 * Checks if at least one significant word from the signal's entity name
 * appears in the episode title or description.
 * This prevents false positives where unrelated episodes get linked
 * to a signal just because they share a team.
 */
function isEntityRelevantToEpisode(
  entityName: string,
  episodeTitle: string,
  episodeDescription: string | null
): boolean {
  if (!entityName) return false;

  // Extract significant words (>3 chars, not common sports terms)
  const significantWords = entityName
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 3 && !COMMON_SPORTS_WORDS.has(w));

  // If no significant words remain (e.g. "Red Sox Trade"), skip the gate
  if (significantWords.length === 0) return true;

  const searchText = (episodeTitle + ' ' + (episodeDescription || '')).toLowerCase();

  // At least ONE significant word must appear
  return significantWords.some(word => searchText.includes(word));
}

// ===== FUZZY SIGNAL DEDUPLICATION =====

// Check if two signal types are semantically related
function areSimilarTypes(a: string, b: string): boolean {
  if (a === b) return true;
  const groups = [
    ['trade', 'signing', 'player'],
    ['injury', 'player'],
    ['coach', 'signing'],
  ];
  return groups.some(g => g.includes(a) && g.includes(b));
}

// Find a related existing signal using fuzzy matching on teams + entity name
async function findRelatedSignal(
  supabase: any,
  teamSlugs: string[],
  entityName: string,
  signalType: string
): Promise<{ id: string; entity_code: string } | null> {
  if (teamSlugs.length === 0) return null;
  
  const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  
  const { data: candidates } = await supabase
    .from('content_signals')
    .select('id, entity_code, entity_name, team_slugs, signal_type')
    .overlaps('team_slugs', teamSlugs)
    .gte('last_mentioned_at', windowStart)
    .limit(50);
  
  if (!candidates || candidates.length === 0) return null;
  
  const nameWords = new Set(
    entityName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2)
  );
  
  let bestMatch: { id: string; entity_code: string; score: number } | null = null;
  const candidateScores: Array<{ name: string; score: number; matched: boolean }> = [];
  
  for (const candidate of candidates) {
    const candidateWords = new Set(
      candidate.entity_name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w: string) => w.length > 2)
    );
    
    const intersection = [...nameWords].filter(w => candidateWords.has(w)).length;
    const union = new Set([...nameWords, ...candidateWords]).size;
    const similarity = union > 0 ? intersection / union : 0;
    
    const typeBoost = areSimilarTypes(signalType, candidate.signal_type) ? 0.15 : 0;
    
    const teamOverlap = teamSlugs.filter(t => (candidate.team_slugs || []).includes(t)).length;
    const teamBoost = teamOverlap / Math.max(teamSlugs.length, (candidate.team_slugs || []).length) * 0.1;
    
    const finalScore = similarity + typeBoost + teamBoost;
    
    candidateScores.push({
      name: candidate.entity_name,
      score: finalScore,
      matched: finalScore > 0.50,
    });
    
    if (finalScore > 0.50 && (!bestMatch || finalScore > bestMatch.score)) {
      bestMatch = { id: candidate.id, entity_code: candidate.entity_code, score: finalScore };
    }
  }
  
  if (candidateScores.length > 0) {
    const sortedScores = candidateScores.sort((a, b) => b.score - a.score);
    const scoreLines = sortedScores.map(c => 
      `  - "${c.name}" score: ${c.score.toFixed(2)} ${c.matched ? '✓ MATCHED' : '✗'}`
    ).join('\n');
    console.log(`[signal-dedup] "${entityName}" candidates:\n${scoreLines}`);
  }
  
  return bestMatch;
}

// ===== FIX 3a: Resolve non-prefixed team slugs =====
function resolveTeamSlug(slug: string, allTeams: Team[]): string {
  // Already a known slug?
  if (allTeams.find(t => t.slug === slug)) return slug;
  // Try league-prefixed versions
  for (const prefix of ['nfl-', 'nba-', 'nhl-', 'mlb-']) {
    const prefixed = prefix + slug;
    if (allTeams.find(t => t.slug === prefixed)) {
      console.log(`[slug-resolve] Resolved "${slug}" → "${prefixed}"`);
      return prefixed;
    }
  }
  // Try matching by team name/short_name (case-insensitive)
  const lower = slug.toLowerCase().replace(/-/g, ' ');
  const byName = allTeams.find(t => 
    t.name.toLowerCase() === lower || 
    t.short_name.toLowerCase() === lower
  );
  if (byName) {
    console.log(`[slug-resolve] Resolved "${slug}" → "${byName.slug}" (by name)`);
    return byName.slug;
  }
  console.log(`[slug-resolve] Could not resolve "${slug}", keeping as-is`);
  return slug;
}

// Upsert signals with all 4 fixes applied
async function upsertSignals(
  supabase: any,
  episodeId: string,
  signals: Signal[],
  teams: Team[],
  episodeTitle: string,
  episodeDescription: string | null, // For relevance gate checking
  showTeamSlug: string | null, // FIX 3b: Pre-cached show team slug
  publishedAt: string // Use episode's published_at, not NOW()
): Promise<void> {
  for (const signal of signals) {
    try {
      // FIX 1: Normalize AI response field names
      const rawType = signal.type || signal.signal_type || 'other';
      const rawTeams: string[] = signal.teams || signal.team_slugs || [];
      
      // FIX 2: Normalize signal type
      const normalizedType = normalizeSignalType(rawType);
      
      // FIX 3a: Resolve each team slug
      let resolvedTeams = rawTeams
        .filter(t => t && typeof t === 'string' && t.trim().length > 0)
        .map(slug => resolveTeamSlug(slug.trim().toLowerCase(), teams));
      
      // Remove duplicates after resolution
      resolvedTeams = [...new Set(resolvedTeams)];

      // HALLUCINATION GUARD: drop slugs not actually mentioned in title/description.
      // Show's team is exempt (legitimate context).
      const sourceText = `${episodeTitle || ''} ${episodeDescription || ''}`;
      const teamsBySlug = new Map<string, Team>(teams.map(t => [t.slug, t]));
      const beforeMention = resolvedTeams.length;
      resolvedTeams = validateTeamMentions(resolvedTeams, sourceText, teamsBySlug, showTeamSlug, 4);
      if (beforeMention !== resolvedTeams.length) {
        console.log(`[signal-upsert] Mention-filter dropped ${beforeMention - resolvedTeams.length} hallucinated team(s) for episode ${episodeId}`);
      }
      
      // FIX 3b: Fallback to show's team when teams array is empty
      if (resolvedTeams.length === 0 && showTeamSlug) {
        console.log(`[signal-upsert] Empty teams for signal "${signal.description}", using show team fallback: ${showTeamSlug}`);
        resolvedTeams = [showTeamSlug];
      }
      
      // Skip if still no teams after all resolution attempts
      if (resolvedTeams.length === 0) {
        console.log(`[signal-upsert] Skipping signal with no resolvable teams: "${signal.description}"`);
        continue;
      }
      
      // Build normalized signal for downstream functions
      const cleanedDescription = signal.description ? cleanSignalDescription(signal.description) : signal.description;
      const normalizedSignal = {
        type: normalizedType,
        teams: resolvedTeams,
        players: signal.players,
        context: signal.context,
        winner: signal.winner,
        score: signal.score,
        description: cleanedDescription,
      };
      
      const code = generateSignalCode(normalizedType, resolvedTeams, signal.context);
      const league = inferLeagueFromTeams(resolvedTeams, teams);
      const rawDisplayName = generateDisplayName(normalizedSignal, teams);
      // FIX 4: Truncate entity name
      const displayName = safeEntityName(rawDisplayName);
      
      console.log(`[signal-upsert] ${code} - ${displayName} (type: ${rawType}→${normalizedType}, teams: [${rawTeams.join(',')}]→[${resolvedTeams.join(',')}])`);
      
      // Step 1: Check exact entity_code match first
      const { data: existingSignal, error: checkError } = await supabase
        .from('content_signals')
        .select('id, mention_count, last_mentioned_at')
        .eq('entity_code', code)
        .maybeSingle();
      
      if (checkError) {
        console.error('Error checking existing signal:', checkError);
        continue;
      }
      
      let signalId: string;
      let isNewSignal = false; // Track if we created a brand new signal
      
      if (existingSignal) {
        // Exact match found — update existing signal
        const maxLastMentioned = new Date(Math.max(
          new Date(existingSignal.last_mentioned_at || 0).getTime(),
          new Date(publishedAt).getTime()
        )).toISOString();
        const { error: updateError } = await supabase
          .from('content_signals')
          .update({
            last_mentioned_at: maxLastMentioned,
            mention_count: (existingSignal.mention_count || 0) + 1,
            metadata: {
              winner: signal.winner,
              score: signal.score,
              context: signal.context,
              players: signal.players,
            },
          })
          .eq('id', existingSignal.id);
        
        if (updateError) {
          console.error('Error updating signal:', updateError);
          continue;
        }
        signalId = existingSignal.id;
      } else {
        // Step 2: No exact match — try fuzzy dedup before creating new
        const related = await findRelatedSignal(supabase, resolvedTeams, displayName, normalizedType);
        
        if (related) {
          console.log(`[signal-dedup] Linking to existing signal "${related.entity_code}" instead of creating "${code}"`);
          const { data: relatedSignal } = await supabase
            .from('content_signals')
            .select('mention_count, last_mentioned_at, entity_name')
            .eq('id', related.id)
            .single();
          
          // === RELEVANCE GATE for fuzzy matches ===
          const relatedEntityName = relatedSignal?.entity_name || displayName;
          if (!isEntityRelevantToEpisode(relatedEntityName, episodeTitle, episodeDescription || '')) {
            console.log(`[relevance-gate] BLOCKED fuzzy: Episode "${episodeTitle.slice(0, 60)}" not relevant to signal "${relatedEntityName}"`);
            continue;
          }
          
          const maxRelatedMentioned = new Date(Math.max(
            new Date(relatedSignal?.last_mentioned_at || 0).getTime(),
            new Date(publishedAt).getTime()
          )).toISOString();
          await supabase.from('content_signals').update({
            mention_count: (relatedSignal?.mention_count || 0) + 1,
            last_mentioned_at: maxRelatedMentioned,
          }).eq('id', related.id);
          signalId = related.id;
        } else {
          // No match at all — create new signal (always link, AI just extracted it)
          isNewSignal = true;
          const { data: newSignal, error: insertError } = await supabase
            .from('content_signals')
            .insert({
              entity_code: code,
              signal_type: normalizedType,
              entity_name: displayName,
              team_slugs: resolvedTeams,
              league: league,
              first_detected_at: publishedAt,
              last_mentioned_at: publishedAt,
              metadata: {
                winner: signal.winner,
                score: signal.score,
                context: signal.context,
                players: signal.players,
              },
            })
            .select('id')
            .single();
          
          if (insertError) {
            console.error('Error inserting signal:', insertError);
            continue;
          }
          signalId = newSignal.id;
        }
      }
      
      // === RELEVANCE GATE for exact code matches ===
      if (existingSignal && !isNewSignal) {
        if (!isEntityRelevantToEpisode(displayName, episodeTitle, episodeDescription || '')) {
          console.log(`[relevance-gate] BLOCKED exact: Episode "${episodeTitle.slice(0, 60)}" not relevant to signal "${displayName}"`);
          continue;
        }
      }


      
      // Link episode to signal (upsert to handle duplicates)
      const { error: linkError } = await supabase
        .from('episode_signals')
        .upsert({
          episode_id: episodeId,
          signal_id: signalId,
          match_snippet: episodeTitle.slice(0, 120),
        }, { onConflict: 'episode_id,signal_id' });
      
      if (linkError) {
        console.error('Error linking episode to signal:', linkError);
      }
    } catch (e) {
      console.error(`[signal-upsert] Error processing signal "${signal.description}":`, e);
      continue;
    }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Fetch all teams for context injection
    const teams = await fetchTeams(supabase);
    const teamContext = buildTeamContext(teams);
    console.log(`Loaded ${teams.length} teams for context`);

    const { episode_id, batch_size = 10, reprocess = false, show_id, team_id } = await req.json();

    let episodesToProcess: any[] = [];
    // Track show_ids for team slug lookup
    let episodeShowIds: Map<string, string> = new Map();

    if (episode_id) {
      // Process single episode
      const { data, error } = await supabase
        .from('episodes')
        .select('id, title, description, show_id, published_at')
        .eq('id', episode_id)
        .single();

      if (error) throw error;
      episodesToProcess = [data];
      if (data) episodeShowIds.set(data.id, data.show_id);
    } else if (team_id) {
      // Process episodes for all shows belonging to a team
      console.log(`Fetching episodes for team_id: ${team_id}`);
      
      const { data: showsData, error: showsError } = await supabase
        .from('shows')
        .select('id')
        .eq('team_id', team_id);
      
      if (showsError) throw showsError;
      
      const showIds = (showsData || []).map((s: any) => s.id);
      console.log(`Found ${showIds.length} shows for team`);
      
      if (showIds.length > 0) {
        let query = supabase
          .from('episodes')
          .select('id, title, description, show_id, published_at')
          .in('show_id', showIds)
          .order('published_at', { ascending: false })
          .limit(batch_size);

        if (!reprocess) {
          query = query.is('signals_extracted_at', null);
        }

        const { data, error } = await query;
        if (error) throw error;
        episodesToProcess = data || [];
        for (const ep of episodesToProcess) {
          episodeShowIds.set(ep.id, ep.show_id);
        }
      }
    } else if (show_id) {
      let query = supabase
        .from('episodes')
        .select('id, title, description, show_id, published_at')
        .eq('show_id', show_id)
        .order('published_at', { ascending: false })
        .limit(batch_size);

      if (!reprocess) {
        query = query.is('tags_extracted_at', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      episodesToProcess = data || [];
      for (const ep of episodesToProcess) {
        episodeShowIds.set(ep.id, ep.show_id);
      }
    } else {
      let query = supabase
        .from('episodes')
        .select('id, title, description, show_id, published_at')
        .order('published_at', { ascending: false })
        .limit(batch_size);

      if (!reprocess) {
        query = query.is('tags_extracted_at', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      episodesToProcess = data || [];
      for (const ep of episodesToProcess) {
        episodeShowIds.set(ep.id, ep.show_id);
      }
    }

    console.log(`Processing ${episodesToProcess.length} episodes`);

    // FIX 3b: Pre-cache show team slugs for all unique shows in this batch
    const uniqueShowIds = [...new Set(episodeShowIds.values())];
    const showTeamSlugCache: Map<string, string | null> = new Map();
    
    if (uniqueShowIds.length > 0) {
      const { data: showsWithTeams } = await supabase
        .from('shows')
        .select('id, team_id, teams!left(slug)')
        .in('id', uniqueShowIds);
      
      for (const show of (showsWithTeams || [])) {
        showTeamSlugCache.set(show.id, show.teams?.slug || null);
      }
      console.log(`Cached team slugs for ${showTeamSlugCache.size} shows`);
    }

    const results = {
      processed: 0,
      failed: 0,
      signals_created: 0,
      errors: [] as string[],
    };

    for (const episode of episodesToProcess) {
      try {
        console.log(`Extracting tags for episode: ${episode.id} - ${episode.title?.substring(0, 50)}`);
        
        const tags = await extractTags(episode.title, episode.description, teamContext);
        
        // Update episode with extracted tags (signals_extracted_at set AFTER upsert)
        const { error: updateError } = await supabase
          .from('episodes')
          .update({
            extracted_tags: tags,
            tags_extracted_at: new Date().toISOString(),
          })
          .eq('id', episode.id);

        if (updateError) {
          console.error(`Failed to update episode ${episode.id}:`, updateError);
          results.failed++;
          results.errors.push(`${episode.id}: ${updateError.message}`);
        } else {
          results.processed++;
          
          if (tags.signals && tags.signals.length > 0) {
            const showId = episodeShowIds.get(episode.id) || episode.show_id;
            const showTeamSlug = showTeamSlugCache.get(showId) || null;
            await upsertSignals(supabase, episode.id, tags.signals, teams, episode.title, episode.description, showTeamSlug, episode.published_at || new Date().toISOString());
            results.signals_created += tags.signals.length;
          }
          
          // Mark signals as extracted AFTER successful upsert
          await supabase
            .from('episodes')
            .update({ signals_extracted_at: new Date().toISOString() })
            .eq('id', episode.id);
          
          console.log(`Successfully tagged episode ${episode.id} with ${tags.signals?.length || 0} signals`);
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        console.error(`Error processing episode ${episode.id}:`, e);
        results.failed++;
        results.errors.push(`${episode.id}: ${errorMessage}`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log('Batch complete:', results);

    return new Response(JSON.stringify({
      success: true,
      ...results,
      total: episodesToProcess.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in extract-episode-tags:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
