import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { stripSponsorText } from '../_shared/strip-sponsors.ts';
import { chatCompletion } from '../_shared/google-ai.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_AI_API_KEY = Deno.env.get('GOOGLE_AI_API_KEY');
const BATCH_LIMIT = 20; // Process 20 shows per inner batch
const MAX_EPISODES_TO_TAG = 20; // Limit episodes per show per batch for timeout safety
const MAX_EXECUTION_MS = 120_000; // Stop processing 30s before the 150s edge function timeout

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

/**
 * ai-enrichment-cron - Scheduled AI enrichment processor
 * 
 * This function is called by pg_cron 30 minutes after ingest-rss-cron.
 * It processes shows that have ai_enrichment_pending = true:
 * 1. Runs AI categorization (team, location, format detection)
 * 2. Extracts hosts from show descriptions
 * 3. Tags new episodes with AI-generated metadata
 * 4. Sets ai_enrichment_pending = false and ai_enriched_at = now()
 * 5. Triggers update-trending-cron when all shows are processed
 */

// AI system prompts
const CATEGORIZATION_SYSTEM_PROMPT = `You are a sports podcast categorization expert. Analyze the podcast metadata and detect the team.

Available Leagues with Example Teams:
- MLB: Yankees, Mets, Red Sox, Dodgers, Cubs, Braves, Cardinals, Giants, Phillies, Astros, Padres, Mariners, Angels, Rangers, Twins, etc.
- NFL: Patriots, Giants, Cowboys, Chiefs, Eagles, 49ers, Packers, Bears, Bills, Ravens, Dolphins, Jets, Steelers, Broncos, etc.
- NBA: Celtics, Knicks, Lakers, Warriors, Bulls, Heat, Nets, Suns, Bucks, Mavericks, Nuggets, Clippers, Sixers, etc.
- NHL: Bruins, Rangers, Blackhawks, Penguins, Maple Leafs, Canadiens, Red Wings, Flyers, Capitals, Kings, etc.

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

// Signal types for trending topics
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

interface TeamInfo {
  id: string;
  slug: string;
  name: string;
  short_name: string;
  abbreviation: string;
  league_id: string;
  league_slug: string;
}

// Generate canonical signal code by sorting team slugs alphabetically
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

function inferLeagueFromTeams(teamSlugs: string[], teams: TeamInfo[] = []): string | null {
  if (teamSlugs.length === 0) return null;
  
  // First try prefix-based detection (fast path for NFL/NBA/NHL)
  const firstTeam = teamSlugs[0];
  if (firstTeam.startsWith('nfl-')) return 'nfl';
  if (firstTeam.startsWith('nba-')) return 'nba';
  if (firstTeam.startsWith('wnba-')) return 'wnba';
  if (firstTeam.startsWith('nhl-')) return 'nhl';
  if (firstTeam.startsWith('mlb-')) return 'mlb';
  
  // Fallback: lookup in teams array (handles non-prefixed MLB slugs)
  const matchedTeam = teams.find(t => t.slug === firstTeam);
  if (matchedTeam?.league_slug) {
    return matchedTeam.league_slug;
  }
  
  return null;
}

// Strip meta-language prefixes from signal descriptions
function cleanSignalDescription(desc: string): string {
  if (!desc) return desc;
  
  // Remove forbidden meta-language prefixes
  let cleaned = desc
    .replace(/^(Discussion|Analysis|Concerns|Talk|Thoughts|Regarding|Update|Reaction|Overview|Breakdown|Preview|Review|Recap|Report)\s+(about|of|on|to|for|regarding)\s+/i, '')
    .replace(/^(the\s+)?/i, (m) => m.charAt(0).toUpperCase() + m.slice(1));
  
  // Truncate to ~8 words max
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

function generateDisplayName(signal: { type: string; teams: string[]; players?: string[]; context?: string; winner?: string; score?: string; description: string }, teams: TeamInfo[]): string {
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

function buildTagSystemPrompt(teamContext: string): string {
  return `You are a metadata extractor for sports podcast episodes covering MLB, NFL, NBA, WNBA, and NHL.
Extract structured information from episode titles and descriptions.

Return JSON only with these fields (use empty arrays if not found):
- topics: sports topics (e.g., ["trade deadline", "injury report", "draft picks", "game analysis"])
- people: ONLY people who actually APPEAR on the episode as hosts, guests, or interviewees (e.g., ["Tom Brady", "Bill Belichick"]). Do NOT include athletes, coaches, or public figures who are merely the SUBJECT of discussion. Clues for actual guests: "joins the show", "interview with", "sits down with". Clues for discussed-only (exclude): "reacts to [name]", "[name] hit a home run", "breaks down [name]'s stats". When in doubt, do NOT include.
- teams: teams discussed beyond the main team
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

interface AICategorizationResult {
  sport?: { league: string; team_slug: string; confidence: number };
  location?: { city: string; state: string; confidence: number };
  show_type?: { value: string; confidence: number };
  format?: { value: string; confidence: number };
  audience_level?: { value: string; confidence: number };
}

// Keyword fallback to match team from show title when AI doesn't return a slug
async function matchTeamByKeyword(
  supabase: any,
  showTitle: string,
  league: string | null
): Promise<{ id: string; league_id: string } | null> {
  try {
    let query = supabase
      .from('teams')
      .select('id, league_id, name, slug, city');

    if (league) {
      const { data: leagueData } = await supabase
        .from('leagues')
        .select('id')
        .eq('short_name', league)
        .maybeSingle();

      if (leagueData) {
        query = query.eq('league_id', leagueData.id);
      }
    }

    const { data: teams } = await query;
    if (!teams || teams.length === 0) return null;

    const titleLower = showTitle.toLowerCase();

    for (const team of teams) {
      const teamName = team.name.toLowerCase();
      const cityName = team.city?.toLowerCase() || '';
      const slugParts = team.slug.split('-');

      if (titleLower.includes(teamName)) {
        console.log(`[keyword-match] Matched "${teamName}" in title`);
        return { id: team.id, league_id: team.league_id };
      }

      for (const word of slugParts) {
        if (word.length > 3 && titleLower.includes(word)) {
          console.log(`[keyword-match] Matched slug word "${word}" in title`);
          return { id: team.id, league_id: team.league_id };
        }
      }

      if (cityName && titleLower.includes(cityName) && titleLower.includes(teamName)) {
        console.log(`[keyword-match] Matched city "${cityName}" + team "${teamName}" in title`);
        return { id: team.id, league_id: team.league_id };
      }
    }

    return null;
  } catch (e) {
    console.error('[keyword-match] Error:', e);
    return null;
  }
}

interface ExtractedHost {
  name: string;
  credentials: string | null;
  affiliation: string | null;
}

function parseName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "" };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
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
  
  // Compute word-level Jaccard similarity
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
      matched: finalScore > 0.35,
    });
    
    if (finalScore > 0.35 && (!bestMatch || finalScore > bestMatch.score)) {
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

// AI categorization for show
async function enrichShowWithAI(
  supabase: any,
  showId: string,
  showTitle: string,
  showDescription: string | null,
  publisher: string | null,
): Promise<void> {
  if (!GOOGLE_AI_API_KEY) {
    console.log('[ai-enrich] No GOOGLE_AI_API_KEY, skipping');
    return;
  }

  console.log(`[ai-enrich] Processing show ${showId}: ${showTitle}`);

  try {
    // Check if team already assigned (AI is fallback only)
    const { data: currentShow } = await supabase
      .from('shows')
      .select('team_id, league_id')
      .eq('id', showId)
      .single();

    const hasExistingTeam = !!currentShow?.team_id;

    // Get sample episode titles for better context
    const { data: episodes } = await supabase
      .from('episodes')
      .select('title')
      .eq('show_id', showId)
      .order('published_at', { ascending: false })
      .limit(5);

    const episodeTitles = episodes?.map((e: any) => e.title) || [];

    let userPrompt = `Analyze this sports podcast and detect which team it covers:

Title: ${showTitle}
Publisher: ${publisher || 'Unknown'}
Description: ${showDescription?.substring(0, 1500) || 'No description'}`;

    if (episodeTitles.length > 0) {
      userPrompt += `\n\nSample Episode Titles:\n${episodeTitles.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}`;
    }

    userPrompt += `\n\nReturn JSON:
{
  "sport": { "league": "MLB|NFL|NBA|WNBA|NHL or null", "team_slug": "team-nickname-lowercase or null", "confidence": 0.0-1.0 },
  "location": { "city": "city name", "state": "state name", "confidence": 0.0-1.0 },
  "show_type": { "value": "beat_reporter|former_player|fan_podcast|media_outlet", "confidence": 0.0-1.0 },
  "format": { "value": "daily_recap|interview|deep_dive|roundtable|game_preview|mailbag", "confidence": 0.0-1.0 },
  "audience_level": { "value": "diehard|casual|fantasy|new_fan", "confidence": 0.0-1.0 }
}`;

    let content: string;
    try {
      content = await chatCompletion({
        messages: [
          { role: 'system', content: CATEGORIZATION_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });
    } catch (e) {
      console.error('[ai-enrich] AI API error:', e);
      return;
    }

    // Parse JSON response
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1];
    
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!objectMatch) {
      console.error('[ai-enrich] No JSON found in response');
      return;
    }

    const suggestions: AICategorizationResult = JSON.parse(objectMatch[0]);
    console.log('[ai-enrich] AI suggestions:', JSON.stringify(suggestions));

    // Build update payload
    const updatePayload: Record<string, any> = {};

    if (suggestions.location?.city && suggestions.location.confidence > 0.5) {
      updatePayload.city = suggestions.location.city;
      updatePayload.state = suggestions.location.state || null;
    }

    if (suggestions.audience_level?.value && suggestions.audience_level.confidence > 0.6) {
      updatePayload.audience = suggestions.audience_level.value;
    }
    if (suggestions.show_type?.value && suggestions.show_type.confidence > 0.6) {
      updatePayload.content_type = suggestions.show_type.value;
    }
    if (suggestions.format?.value && suggestions.format.confidence > 0.6) {
      updatePayload.format = suggestions.format.value;
    }

    // Match team_id from detected team_slug or keyword fallback - ONLY if not already set
    if (!hasExistingTeam && suggestions.sport?.league) {
      let matchedTeam: { id: string; league_id: string } | null = null;

      // Try AI-suggested slug first with flexible matching
      if (suggestions.sport.team_slug && suggestions.sport.confidence > 0.7) {
        const aiSlug = suggestions.sport.team_slug.toLowerCase();
        const { data: team } = await supabase
          .from('teams')
          .select('id, league_id')
          .or(`slug.eq.${aiSlug},slug.ilike.%-${aiSlug}`)
          .limit(1)
          .maybeSingle();

        if (team) {
          matchedTeam = team;
          console.log(`[ai-enrich] Matched team via AI slug: ${aiSlug} -> ${team.id}`);
        }
      }

      // Keyword fallback if AI didn't find a match
      if (!matchedTeam) {
        matchedTeam = await matchTeamByKeyword(supabase, showTitle, suggestions.sport.league);
        if (matchedTeam) {
          console.log(`[ai-enrich] Matched team via keyword fallback: ${matchedTeam.id}`);
        }
      }

      if (matchedTeam) {
        updatePayload.team_id = matchedTeam.id;
        updatePayload.league_id = matchedTeam.league_id;
      }

      // League-only fallback: assign league even without a team match
      if (!currentShow?.league_id && !updatePayload.league_id && suggestions.sport?.league) {
        const leagueSlug = suggestions.sport.league.toLowerCase();
        const { data: league } = await supabase
          .from('leagues')
          .select('id')
          .eq('slug', leagueSlug)
          .maybeSingle();
        if (league) {
          updatePayload.league_id = league.id;
          console.log(`[ai-enrich] Assigned league directly (no team): ${leagueSlug}`);
        }
      }
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await supabase
        .from('shows')
        .update(updatePayload)
        .eq('id', showId);

      if (error) {
        console.error('[ai-enrich] Update error:', error);
      } else {
        console.log(`[ai-enrich] Updated show ${showId}`);
      }
    }

  } catch (e) {
    console.error('[ai-enrich] Error:', e);
  }
}

// Extract hosts from show description
async function extractHostsForShow(
  supabase: any,
  showId: string,
  showTitle: string,
  showDescription: string | null,
  publisher: string | null
): Promise<void> {
  if (!GOOGLE_AI_API_KEY) {
    return;
  }

  console.log(`[host-extract] Processing show ${showId}`);

  try {
    const userPrompt = `Extract the HOSTS of this podcast from the description.

Title: ${showTitle}
Publisher: ${publisher || "Unknown"}
Description: ${showDescription?.substring(0, 2000) || "No description"}

Remember: Hosts are PEOPLE who regularly present the show, NOT networks/companies.`;

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
    if (!jsonMatch) {
      console.log('[host-extract] No JSON found');
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const extractedHosts: ExtractedHost[] = parsed.hosts || [];

    console.log(`[host-extract] Found ${extractedHosts.length} hosts`);

    if (extractedHosts.length === 0) return;

    const hostsJson: Array<{ name: string; role: string }> = [];

    for (const host of extractedHosts) {
      if (!host.name || host.name.length < 3) continue;

      // Skip company names
      const skipPatterns = /^(the |audacy|espn|nbc|barstool|iheartmedia|spotify|apple|weei|nesn)/i;
      if (skipPatterns.test(host.name)) continue;

      // Find or create speaker
      const { data: existingSpeaker } = await supabase
        .from("speakers")
        .select("id")
        .ilike("full_name", host.name)
        .maybeSingle();

      let speakerId: string;

      if (existingSpeaker) {
        speakerId = existingSpeaker.id;
      } else {
        const { firstName, lastName } = parseName(host.name);

        const { data: newSpeaker, error: insertError } = await supabase
          .from("speakers")
          .insert({
            full_name: host.name,
            first_name: firstName,
            last_name: lastName,
            credentials: host.credentials,
            primary_affiliation: host.affiliation,
          })
          .select("id")
          .single();

        if (insertError) {
          console.error(`[host-extract] Failed to create speaker:`, insertError);
          continue;
        }

        speakerId = newSpeaker.id;
      }

      // Link to show_hosts
      const { error: linkError } = await supabase
        .from("show_hosts")
        .upsert({
          show_id: showId,
          speaker_id: speakerId,
          is_primary: hostsJson.length === 0,
          display_order: hostsJson.length,
          extracted_name: host.name,
          extracted_from: "ai_description",
        }, { onConflict: 'show_id,speaker_id' });

      if (!linkError) {
        hostsJson.push({ name: host.name, role: "Host" });
      }
    }

    if (hostsJson.length > 0) {
      await supabase
        .from("shows")
        .update({ hosts_json: hostsJson })
        .eq("id", showId);
    }

  } catch (e) {
    console.error('[host-extract] Error:', e);
  }
}

// Fetch all teams for signal context
async function fetchTeamsForSignals(supabase: any): Promise<TeamInfo[]> {
  const { data: teams, error } = await supabase
    .from('teams')
    .select(`
      id,
      slug,
      name,
      short_name,
      abbreviation,
      league_id,
      leagues!inner(slug)
    `)
    .eq('is_active', true);
  
  if (error) {
    console.error('[teams-fetch] Error:', error);
    return [];
  }
  
  return (teams || []).map((t: any) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    short_name: t.short_name,
    abbreviation: t.abbreviation,
    league_id: t.league_id,
    league_slug: t.leagues?.slug || '',
  }));
}

function buildTeamContext(teams: TeamInfo[]): string {
  return teams.map(t => 
    `${t.slug}: ${t.name} (${t.short_name}, ${t.abbreviation})`
  ).join('\n');
}

// ===== FIX 3a: Resolve non-prefixed team slugs =====
function resolveTeamSlug(slug: string, allTeams: TeamInfo[]): string {
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

// Upsert signals to content_signals table with fuzzy dedup
// FIX 1: Normalize field names (type/signal_type, teams/team_slugs)
// FIX 2: Normalize signal types via TYPE_NORMALIZATION_MAP
// FIX 3: Resolve team slugs + fallback to show's team
// FIX 4: Truncate entity names to 60 chars
async function upsertSignals(
  supabase: any,
  episodeId: string,
  signals: Signal[],
  teams: TeamInfo[],
  episodeTitle: string,
  showTeamSlug: string | null, // FIX 3b: Pre-cached show team slug
  publishedAt: string // Use episode's published_at, not NOW()
): Promise<number> {
  let signalsCreated = 0;
  
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
      
      // Post-process: clean meta-language from description
      const cleanedDescription = signal.description ? cleanSignalDescription(signal.description) : signal.description;
      
      // Build normalized signal for downstream functions
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
      const { data: existingSignal } = await supabase
        .from('content_signals')
        .select('id, mention_count, last_mentioned_at')
        .eq('entity_code', code)
        .maybeSingle();
      
      let signalId: string;
      
      if (existingSignal) {
        // Exact match found — update it
        const maxLastMentioned = new Date(Math.max(
          new Date(existingSignal.last_mentioned_at || 0).getTime(),
          new Date(publishedAt).getTime()
        )).toISOString();
        await supabase
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
        signalId = existingSignal.id;
      } else {
        // Step 2: No exact match — try fuzzy dedup before creating new
        const related = await findRelatedSignal(supabase, resolvedTeams, displayName, normalizedType);
        
        if (related) {
          console.log(`[signal-dedup] Linking to existing signal "${related.entity_code}" instead of creating "${code}"`);
          // Fetch existing last_mentioned_at for MAX logic
          const { data: relatedSignal } = await supabase
            .from('content_signals')
            .select('mention_count, last_mentioned_at')
            .eq('id', related.id)
            .single();
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
          // No match at all — create new signal
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
            console.error('[signal-upsert] Insert error:', insertError);
            continue;
          }
          signalId = newSignal.id;
          signalsCreated++;
        }
      }
      
      // Link episode to signal
      await supabase
        .from('episode_signals')
        .upsert({
          episode_id: episodeId,
          signal_id: signalId,
          match_snippet: episodeTitle.slice(0, 120),
        }, { onConflict: 'episode_id,signal_id' });
    } catch (e) {
      console.error(`[signal-upsert] Error processing signal "${signal.description}":`, e);
      // Continue to next signal instead of crashing the whole batch
      continue;
    }
  }
  
  return signalsCreated;
}

// Tag untagged episodes for a show (with signal extraction for trending)
async function tagShowEpisodes(supabase: any, showId: string, teams: TeamInfo[]): Promise<{ tagged: number; signals: number }> {
  if (!GOOGLE_AI_API_KEY) {
    return { tagged: 0, signals: 0 };
  }

  // Only tag episodes published in the last 3 days to stay within fresh content window
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: episodes, error } = await supabase
    .from('episodes')
    .select('id, title, description, published_at')
    .eq('show_id', showId)
    .is('tags_extracted_at', null)
    .gte('published_at', cutoff)
    .order('published_at', { ascending: false })
    .limit(MAX_EPISODES_TO_TAG);

  if (error || !episodes?.length) {
    return { tagged: 0, signals: 0 };
  }

  console.log(`[episode-tag] Tagging ${episodes.length} episodes for show ${showId}`);

  // FIX 3b: Cache show's team slug ONCE before the loop
  let showTeamSlug: string | null = null;
  try {
    const { data: showData } = await supabase
      .from('shows')
      .select('team_id, teams!inner(slug)')
      .eq('id', showId)
      .maybeSingle();
    if (showData?.teams?.slug) {
      showTeamSlug = showData.teams.slug;
      console.log(`[episode-tag] Show ${showId} team slug fallback: ${showTeamSlug}`);
    }
  } catch (e) {
    console.log(`[episode-tag] Could not resolve show team slug for ${showId}:`, e);
  }

  let tagged = 0;
  let totalSignals = 0;
  const teamContext = buildTeamContext(teams);

  for (const episode of episodes) {
    try {
      const cleanedDescription = stripSponsorText(episode.description)?.substring(0, 2000) || 'No description';
      const userPrompt = `Title: ${episode.title}\n\nDescription: ${cleanedDescription}`;

      let content: string;
      try {
        content = await chatCompletion({
          messages: [
            { role: 'system', content: buildTagSystemPrompt(teamContext) },
            { role: 'user', content: userPrompt },
          ],
        });
      } catch (e) {
        console.error(`[episode-tag] AI API error for ${episode.id}:`, e);
        continue;
      }

      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];
      
      // Extract JSON object
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

      // Update episode with extracted tags (signals_extracted_at set AFTER upsert)
      await supabase
        .from('episodes')
        .update({
          extracted_tags: tags,
          tags_extracted_at: new Date().toISOString(),
        })
        .eq('id', episode.id);

      tagged++;

      // Upsert signals for trending topics, then mark signals_extracted_at
      if (tags.signals && tags.signals.length > 0) {
        const signalsCreated = await upsertSignals(supabase, episode.id, tags.signals, teams, episode.title, showTeamSlug, episode.published_at || new Date().toISOString());
        totalSignals += signalsCreated;
        console.log(`[episode-tag] Episode ${episode.id}: ${tags.signals.length} signals detected, ${signalsCreated} new`);
      }

      // Mark signals as extracted AFTER successful upsert (or if no signals to upsert)
      await supabase
        .from('episodes')
        .update({ signals_extracted_at: new Date().toISOString() })
        .eq('id', episode.id);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (e) {
      console.error(`[episode-tag] Error tagging episode ${episode.id}:`, e);
    }
  }

  return { tagged, signals: totalSignals };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const start = Date.now();
  
  // Parse optional priority_show_ids and team_ids from request body
  let teamIds: string[] = [];
  let priorityShowIds: string[] = [];
  try {
    const body = await req.json();
    if (body?.team_ids && Array.isArray(body.team_ids) && body.team_ids.length > 0) {
      teamIds = body.team_ids;
    }
    if (body?.priority_show_ids && Array.isArray(body.priority_show_ids) && body.priority_show_ids.length > 0) {
      priorityShowIds = body.priority_show_ids;
    }
  } catch {
    // No body or invalid JSON — that's fine, process general backlog
  }

  console.log(`[ai-enrichment-cron] Starting execution...${priorityShowIds.length > 0 ? ` (${priorityShowIds.length} priority shows)` : ''}${teamIds.length > 0 ? ` (priority: ${teamIds.length} teams)` : ''}`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    // Fetch teams once for signal context
    const teams = await fetchTeamsForSignals(supabase);
    console.log(`[ai-enrichment-cron] Loaded ${teams.length} teams for signal context`);

    const allResults: Array<{ show_id: string; title: string; success: boolean; episodes_tagged: number; signals_created: number }> = [];
    let batchCount = 0;

    // FIX B: Process priority shows first (shows that had new episodes this ingest run)
    if (priorityShowIds.length > 0) {
      batchCount++;
      console.log(`[ai-enrichment-cron] Priority batch: processing ${priorityShowIds.length} shows with new episodes`);

      const { data: priorityShows, error: prioError } = await supabase
        .from('shows')
        .select('id, title, description, publisher, team_id')
        .in('id', priorityShowIds)
        .eq('ai_enrichment_pending', true)
        .limit(priorityShowIds.length);

      if (!prioError && priorityShows?.length) {
        console.log(`[ai-enrichment-cron] Found ${priorityShows.length} priority shows still pending`);

        for (const show of priorityShows) {
          if (Date.now() - start >= MAX_EXECUTION_MS) {
            console.log('[ai-enrichment-cron] Time budget reached during priority batch');
            break;
          }

          try {
            await enrichShowWithAI(supabase, show.id, show.title, show.description, show.publisher);
            await extractHostsForShow(supabase, show.id, show.title, show.description, show.publisher);
            const tagResult = await tagShowEpisodes(supabase, show.id, teams);

            if (tagResult.tagged > 0 && show.team_id) {
              try {
                const { data: teamData } = await supabase
                  .from('teams')
                  .select('slug')
                  .eq('id', show.team_id)
                  .maybeSingle();
                if (teamData?.slug) {
                  await supabase.rpc('increment_team_episode_count', { 
                    p_slug: teamData.slug, 
                    p_count: tagResult.tagged 
                  });
                }
              } catch (e) {
                console.error(`[ai-enrichment-cron] Counter increment error for show ${show.id}:`, e);
              }
            }

            await supabase
              .from('shows')
              .update({ ai_enrichment_pending: false, ai_enriched_at: new Date().toISOString() })
              .eq('id', show.id);

            allResults.push({ show_id: show.id, title: show.title, success: true, episodes_tagged: tagResult.tagged, signals_created: tagResult.signals });
            await new Promise(resolve => setTimeout(resolve, 300));
          } catch (e) {
            console.error(`[ai-enrichment-cron] Priority show error ${show.title}:`, e);
            allResults.push({ show_id: show.id, title: show.title, success: false, episodes_tagged: 0, signals_created: 0 });
          }
        }
      }
    }

    // Inner loop: keep processing remaining backlog batches until time budget is exhausted
    while (Date.now() - start < MAX_EXECUTION_MS) {
      batchCount++;

      let query = supabase
        .from('shows')
        .select('id, title, description, publisher, team_id')
        .eq('ai_enrichment_pending', true);

      // Apply team filter when team_ids provided (priority enrichment)
      if (teamIds.length > 0) {
        query = query.in('team_id', teamIds);
      }

      const { data: pendingShows, error: fetchError } = await query
        .order('updated_at', { ascending: true })
        .limit(BATCH_LIMIT);

      if (fetchError) {
        console.error(`[ai-enrichment-cron] Fetch error:`, fetchError);
        break;
      }

      if (!pendingShows || pendingShows.length === 0) {
        console.log('[ai-enrichment-cron] No more shows pending');
        break;
      }

      console.log(`[ai-enrichment-cron] Batch ${batchCount}: processing ${pendingShows.length} shows`);

      for (const show of pendingShows) {
        // Check time budget before each show
        if (Date.now() - start >= MAX_EXECUTION_MS) {
          console.log('[ai-enrichment-cron] Time budget reached mid-batch, stopping');
          break;
        }

        try {
          await enrichShowWithAI(supabase, show.id, show.title, show.description, show.publisher);
          await extractHostsForShow(supabase, show.id, show.title, show.description, show.publisher);
          const tagResult = await tagShowEpisodes(supabase, show.id, teams);

          // Increment team episode counter for synthesis triggers
          if (tagResult.tagged > 0 && show.team_id) {
            try {
              const { data: teamData } = await supabase
                .from('teams')
                .select('slug')
                .eq('id', show.team_id)
                .maybeSingle();
              if (teamData?.slug) {
                await supabase.rpc('increment_team_episode_count', { 
                  p_slug: teamData.slug, 
                  p_count: tagResult.tagged 
                });
              }
            } catch (e) {
              console.error(`[ai-enrichment-cron] Counter increment error for show ${show.id}:`, e);
            }
          }

          await supabase
            .from('shows')
            .update({ ai_enrichment_pending: false, ai_enriched_at: new Date().toISOString() })
            .eq('id', show.id);

          allResults.push({ show_id: show.id, title: show.title, success: true, episodes_tagged: tagResult.tagged, signals_created: tagResult.signals });
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (e) {
          console.error(`[ai-enrichment-cron] Error processing ${show.title}:`, e);
          allResults.push({ show_id: show.id, title: show.title, success: false, episodes_tagged: 0, signals_created: 0 });
        }
      }
    }

    const successCount = allResults.filter(r => r.success).length;
    const totalEpisodesTagged = allResults.reduce((sum, r) => sum + r.episodes_tagged, 0);
    const totalSignalsCreated = allResults.reduce((sum, r) => sum + r.signals_created, 0);

    // Auto-detect betting shows: if >60% of episodes (min 10) have betting category, flag the show
    try {
      const processedShowIds = [...new Set(allResults.map(r => r.show_id))];
      for (const sid of processedShowIds) {
        const { count: totalTagged } = await supabase
          .from('episodes')
          .select('*', { count: 'exact', head: true })
          .eq('show_id', sid)
          .not('extracted_tags', 'is', null);
        
        if ((totalTagged ?? 0) >= 10) {
          const { data: bettingEps } = await supabase
            .from('episodes')
            .select('id')
            .eq('show_id', sid)
            .not('extracted_tags', 'is', null)
            .contains('extracted_tags', { categories: ['betting'] });
          
          const bettingCount = bettingEps?.length ?? 0;
          const isBetting = bettingCount / (totalTagged ?? 1) > 0.6;
          
          // Don't un-flag a show that was manually marked as betting
          if (!isBetting) {
            const { data: currentBetting } = await supabase
              .from('shows')
              .select('is_betting_show')
              .eq('id', sid)
              .single();
            if (currentBetting?.is_betting_show) {
              console.log(`[betting-detect] Skipping ${sid} — already flagged, won't un-flag`);
              continue;
            }
          }

          await supabase
            .from('shows')
            .update({ is_betting_show: isBetting })
            .eq('id', sid);
          
          if (isBetting) {
            console.log(`[betting-detect] Show ${sid} flagged as betting show (${bettingCount}/${totalTagged})`);
          }
        }
      }
    } catch (e) {
      console.error('[betting-detect] Error:', e);
    }

    // ===== AUTO-DETECT FANTASY SHOWS =====
    try {
      const { data: fantasyShowIds } = await supabase
        .from('episodes')
        .select('show_id')
        .not('extracted_tags', 'is', null)
        .gte('published_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

      if (fantasyShowIds?.length) {
        const fantasyCounts: Record<string, { fantasy: number; total: number }> = {};
        for (const row of fantasyShowIds) {
          if (!fantasyCounts[row.show_id]) fantasyCounts[row.show_id] = { fantasy: 0, total: 0 };
          fantasyCounts[row.show_id].total++;
        }

        // Count fantasy-categorized episodes per show
        const { data: fantasyEps } = await supabase
          .from('episodes')
          .select('show_id')
          .contains('extracted_tags', { categories: ['fantasy'] })
          .gte('published_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

        for (const row of fantasyEps || []) {
          if (fantasyCounts[row.show_id]) fantasyCounts[row.show_id].fantasy++;
        }

        for (const [sid, counts] of Object.entries(fantasyCounts)) {
          const totalTagged = counts.total;
          if (totalTagged < 10) continue;
          const fantasyCount = counts.fantasy;
          const isFantasy = fantasyCount / totalTagged > 0.6;
          
          // Don't un-flag a show that was manually marked as fantasy
          if (!isFantasy) {
            const { data: currentFantasy } = await supabase
              .from('shows')
              .select('is_fantasy_show')
              .eq('id', sid)
              .single();
            if (currentFantasy?.is_fantasy_show) {
              console.log(`[fantasy-detect] Skipping ${sid} — already flagged, won't un-flag`);
              continue;
            }
          }

          await supabase
            .from('shows')
            .update({ is_fantasy_show: isFantasy })
            .eq('id', sid);
          
          if (isFantasy) {
            console.log(`[fantasy-detect] Show ${sid} flagged as fantasy show (${fantasyCount}/${totalTagged})`);
          }
        }
      }
    } catch (e) {
      console.error('[fantasy-detect] Error:', e);
    }

    // Check remaining
    const { count: remainingCount } = await supabase
      .from('shows')
      .select('*', { count: 'exact', head: true })
      .eq('ai_enrichment_pending', true);

    console.log(`[ai-enrichment-cron] Done: ${batchCount} batches, ${successCount} shows, ${totalEpisodesTagged} episodes tagged, ${totalSignalsCreated} signals, ${remainingCount ?? 0} remaining, ${Date.now() - start}ms`);

    // ===== V1 ESPN GAME STORIES: Old synthesis pipeline DISABLED =====
    // Story creation now handled by create-game-stories (ESPN-anchored)
    // Episode matching now handled by match-episodes-to-game-stories (keyword + time-proximity)
    // Original synthesis code preserved below for reference, commented out.
    
    // Fire match-episodes-to-game-stories instead
    let episodesMatched = 0;
    try {
      console.log('[ai-enrichment-cron] Triggering match-episodes-to-game-stories...');
      const matchResp = await fetch(`${supabaseUrl}/functions/v1/match-episodes-to-game-stories`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'incremental' }),
      });
      const matchResult = await matchResp.json().catch(() => ({}));
      episodesMatched = matchResult.matched ?? 0;
      console.log(`[ai-enrichment-cron] Episode matching: ${matchResp.status}`, JSON.stringify(matchResult));
    } catch (e) {
      console.error('[ai-enrichment-cron] Episode matching error:', e);
    }

    /*
    // ===== OLD TRIGGER-BASED STORY SYNTHESIS (DISABLED) =====
    // Volume trigger:  ≥5 new episodes, <2 daily runs, ≥6h since last
    // Safety net:      ≥2 new episodes, ≥8h since last
    // Catch-up:        ≥1 new episode, last synthesis 2-8h ago, <4 daily runs
    let synthesisTeamsTriggered = 0;
    try {
      // ... (original synthesis trigger code)
    } catch (e) {
      console.error('[synthesis-trigger] Error:', e);
    }

    // Fire-and-forget: per-episode story extraction catch-up
    // ... (original per-episode extraction code)
    */

    // Trigger trending update if no more shows remain (all caught up)
    if ((remainingCount ?? 0) === 0) {
      console.log('[ai-enrichment-cron] All shows processed! Triggering trending update...');
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/update-trending-cron`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json' },
          body: '{}',
        });
        console.log(`[ai-enrichment-cron] Trending update status: ${resp.status}`);
        resp.body?.cancel();
      } catch (e) {
        console.error('[ai-enrichment-cron] Trending update error:', e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        batches: batchCount,
        processed: allResults.length,
        successful: successCount,
        episodes_tagged: totalEpisodesTagged,
        signals_created: totalSignalsCreated,
        episodes_matched: episodesMatched,
        remaining_shows: remainingCount ?? 0,
        duration_ms: Date.now() - start,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[ai-enrichment-cron] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: String(err), duration_ms: Date.now() - start }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
