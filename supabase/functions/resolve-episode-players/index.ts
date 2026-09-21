import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Blocklist: common English words that are also surnames ──
const LAST_NAME_BLOCKLIST = new Set([
  "lee", "may", "day", "ray", "fox", "law", "bay", "key",
  "guy", "joy", "ash", "cox", "best", "love", "long", "rice",
  "ward", "wade", "hill", "bell",
]);

// ── Types ──
interface PlayerRow {
  id: string;
  name: string;
  slug: string;
  status: string | null;
  team_slug: string | null;
}

interface ResolvedPlayer {
  player_id: string;
  slug: string;
  name: string;
  score: number;
  mention_type: "guest" | "primary" | "mention";
  confidence: "high" | "probable";
  source_text: string;
}

// ── Helpers ──

function parseChapterHeadings(description: string): string[] {
  if (!description) return [];
  const stripped = description.replace(/<[^>]*>/g, " ");
  const pattern = /\d+:\d+\s*[-–—]\s*(.+)/g;
  const headings: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(stripped)) !== null) {
    headings.push(match[1].trim());
  }
  return headings;
}

function getLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/['']/g, "").replace(/[^\w\s]/g, " ");
}

function nameAppearsInText(name: string, text: string): boolean {
  const normalized = normalizeForMatch(text);
  const nameLower = name.toLowerCase();
  return normalized.includes(nameLower);
}

function lastNameAppearsInText(lastName: string, text: string): boolean {
  const normalized = normalizeForMatch(text);
  const lastLower = lastName.toLowerCase();
  // Match whole word + possessive forms
  const pattern = new RegExp(`\\b${lastLower}(?:s)?\\b`);
  return pattern.test(normalized);
}

function isPossessiveForm(lastName: string, text: string): boolean {
  const normalized = text.toLowerCase();
  const lastLower = lastName.toLowerCase();
  return normalized.includes(`${lastLower}'s`) || normalized.includes(`${lastLower}'s`);
}

// ── Main resolver ──

async function resolvePlayersForEpisode(
  supabase: ReturnType<typeof createClient>,
  episode: {
    id: string;
    title: string;
    description: string | null;
    published_at: string | null;
    extracted_tags: any;
    show_id: string;
  },
  showInfo: { team_slug: string | null; sport: string | null },
  rosterCache: Map<string, PlayerRow[]>
): Promise<ResolvedPlayer[]> {
  const candidates = new Map<string, ResolvedPlayer>();
  const title = episode.title || "";
  const description = episode.description || "";
  const chapterHeadings = parseChapterHeadings(description);
  const hasTeamSlug = !!showInfo.team_slug;

  // Get team roster for scoped matching
  let roster: PlayerRow[] = [];
  if (hasTeamSlug) {
    if (rosterCache.has(showInfo.team_slug!)) {
      roster = rosterCache.get(showInfo.team_slug!)!;
    } else {
      const { data } = await supabase
        .from("players")
        .select("id, name, slug, status, team_slug")
        .eq("team_slug", showInfo.team_slug!)
        .eq("role", "player");
      roster = data || [];
      rosterCache.set(showInfo.team_slug!, roster);
    }
  }

  // Build last-name index for the roster
  const lastNameIndex = new Map<string, PlayerRow[]>();
  for (const player of roster) {
    const ln = getLastName(player.name).toLowerCase();
    if (!lastNameIndex.has(ln)) lastNameIndex.set(ln, []);
    lastNameIndex.get(ln)!.push(player);
  }

  // Helper to add/upgrade candidate
  function addCandidate(
    player: PlayerRow,
    score: number,
    mentionType: "guest" | "primary" | "mention",
    sourceText: string
  ) {
    const existing = candidates.get(player.id);
    if (!existing || score > existing.score) {
      candidates.set(player.id, {
        player_id: player.id,
        slug: player.slug,
        name: player.name,
        score,
        mention_type: mentionType,
        confidence: score >= 80 ? "high" : "probable",
        source_text: sourceText.slice(0, 200),
      });
    }
  }

  // ── Step 1: Parse featuring metadata from extracted_tags.people ──
  const featuredPeople: string[] = episode.extracted_tags?.people || [];
  for (const entry of featuredPeople) {
    // Entries like "Payton Tolle guest", "Jared Carrabis host", or just "Garrett Crochet"
    const parts = entry.trim().split(/\s+/);
    const lastToken = parts[parts.length - 1]?.toLowerCase();
    const knownRoles = ["guest", "host", "contributor", "analyst"];
    const hasRoleSuffix = knownRoles.includes(lastToken);
    const isGuest = lastToken === "guest";
    const isHost = lastToken === "host";
    const nameParts = hasRoleSuffix ? parts.slice(0, -1) : parts;
    const fullName = nameParts.join(" ");

    if (fullName.length < 3) continue;
    // Skip hosts — they're show hosts, not players
    if (isHost) continue;

    // Try full-name match against all roster players (or all players for national shows)
    const matchPool = hasTeamSlug ? roster : [];
    for (const player of matchPool) {
      if (nameAppearsInText(player.name, fullName) || nameAppearsInText(fullName, player.name)) {
        const mentionType = isGuest ? "guest" : "mention";
        addCandidate(player, 95, mentionType, `featuring: ${entry}`);
      }
    }

    // For national shows, do a DB lookup for full-name matches
    if (!hasTeamSlug && fullName.split(/\s+/).length >= 2) {
      const slug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { data } = await supabase
        .from("players")
        .select("id, name, slug, status, team_slug")
        .eq("slug", slug)
        .eq("role", "player")
        .limit(1);
      if (data?.[0]) {
        const mentionType = isGuest ? "guest" : "mention";
        addCandidate(data[0], 95, mentionType, `featuring: ${entry}`);
      }
    }
  }

  // ── Step 2: Full-name matches in title ──
  for (const player of roster) {
    if (nameAppearsInText(player.name, title)) {
      addCandidate(player, 100, "primary", `title: ${title.slice(0, 100)}`);
    }
  }

  // ── Step 3: Full-name matches in description ──
  for (const player of roster) {
    if (candidates.has(player.id) && candidates.get(player.id)!.score >= 90) continue;
    if (nameAppearsInText(player.name, description)) {
      addCandidate(player, 90, "mention", `description match: ${player.name}`);
    }
  }

  // ── Step 4: Last-name matching (team-scoped only) ──
  if (hasTeamSlug) {
    // Chapter headings
    for (const heading of chapterHeadings) {
      for (const [lastName, players] of lastNameIndex) {
        if (lastName.length < 4 || LAST_NAME_BLOCKLIST.has(lastName)) continue;
        if (players.length > 1) continue; // ambiguous — skip

        const player = players[0];
        if (candidates.has(player.id)) continue; // already matched via full name

        if (lastNameAppearsInText(lastName, heading)) {
          let score = 70;
          if (isPossessiveForm(lastName, heading)) score += 10;
          if (player.status === "active") score += 15;
          addCandidate(player, score, "mention", `chapter: ${heading.slice(0, 100)}`);
        }
      }
    }

    // Description body
    for (const [lastName, players] of lastNameIndex) {
      if (lastName.length < 4 || LAST_NAME_BLOCKLIST.has(lastName)) continue;
      if (players.length > 1) continue;

      const player = players[0];
      if (candidates.has(player.id)) continue;

      if (lastNameAppearsInText(lastName, description)) {
        let score = 60;
        if (isPossessiveForm(lastName, description)) score += 10;
        if (player.status === "active") score += 15;
        addCandidate(player, score, "mention", `description last-name: ${lastName}`);
      }
    }
  }

  // ── Filter by threshold ──
  return Array.from(candidates.values()).filter((c) => c.score >= 60);
}

// ── Story linking with relevance gate ──

async function linkResolvedPlayersToStories(
  supabase: ReturnType<typeof createClient>,
  episodeId: string,
  resolvedPlayers: ResolvedPlayer[]
): Promise<number> {
  if (!resolvedPlayers.length) return 0;

  // Get stories linked to this episode
  const { data: episodeStories } = await supabase
    .from("episode_stories")
    .select("story_id, stories!inner(id, headline, people, primary_entity_slug)")
    .eq("episode_id", episodeId);

  if (!episodeStories?.length) return 0;

  let linked = 0;
  for (const es of episodeStories) {
    const story = (es as any).stories;
    if (!story) continue;

    const headlineLower = (story.headline || "").toLowerCase();
    const storyPeople: string[] = story.people || [];

    for (const rp of resolvedPlayers) {
      // Apply relevance gate: player must appear in headline or be primary entity
      const isPrimaryEntity = story.primary_entity_slug === rp.slug;
      const nameInHeadline = headlineLower.includes(rp.name.toLowerCase());
      // Also check if player slug matches any person in story.people
      const inPeopleList = storyPeople.some(
        (p: string) => p.toLowerCase() === rp.name.toLowerCase() || p.toLowerCase().replace(/\s+/g, "-") === rp.slug
      );

      if (!isPrimaryEntity && !nameInHeadline && !inPeopleList) continue;

      const { error } = await supabase
        .from("player_stories")
        .upsert(
          { player_id: rp.player_id, story_id: story.id },
          { onConflict: "player_id,story_id", ignoreDuplicates: true }
        );
      if (!error) linked++;
    }
  }

  return linked;
}

// ── Deno serve ──

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const start = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || 50;
    const targetEpisodeIds: string[] | undefined = body.episode_ids;

    // Find episodes to process
    let query = supabase
      .from("episodes")
      .select("id, title, description, published_at, extracted_tags, show_id, player_resolve_attempts");

    if (targetEpisodeIds?.length) {
      // Target specific episodes
      query = query.in("id", targetEpisodeIds);
    } else {
      // Batch mode: tagged but not yet resolved (or under retry cap)
      query = query
        .not("tags_extracted_at", "is", null)
        .is("speakers_extracted_at", null)
        .lt("player_resolve_attempts", 3)
        .order("tags_extracted_at", { ascending: false })
        .limit(batchSize);
    }

    const { data: taggedEpisodes, error: fetchErr } = await query;

    if (fetchErr) {
      console.error("[resolve-episode-players] Fetch error:", fetchErr);
      return new Response(JSON.stringify({ success: false, error: fetchErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!taggedEpisodes?.length) {
      return new Response(JSON.stringify({ success: true, resolved: 0, message: "No episodes to process" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch show titles for logging
    const showIdSet = [...new Set(taggedEpisodes.map((e) => e.show_id))];

    // Collect unique show IDs
    const showIds = showIdSet;

    // Fetch show info — join teams for team_slug and leagues for sport
    const { data: shows } = await supabase
      .from("shows")
      .select("id, title, team_id, league_id, teams(slug), leagues(sport)")
      .in("id", showIds);
    // Normalize into {id, team_slug, sport, title} shape
    const normalizedShows = (shows || []).map((s: any) => ({
      id: s.id,
      title: s.title || "",
      team_slug: s.teams?.slug || null,
      sport: s.leagues?.sport || null,
    }));
    const showMap = new Map(normalizedShows.map((s: any) => [s.id, s]));

    // Check which episodes already have player_episodes rows
    const episodeIds = taggedEpisodes.map((e) => e.id);
    const { data: existingLinks } = await supabase
      .from("player_episodes")
      .select("episode_id, player_id")
      .in("episode_id", episodeIds);
    const existingSet = new Set((existingLinks || []).map((l) => `${l.episode_id}:${l.player_id}`));

    const rosterCache = new Map<string, PlayerRow[]>();
    let totalResolved = 0;
    let totalStoryLinks = 0;

    let totalGaveUp = 0;

    for (const episode of taggedEpisodes) {
      const showInfo = showMap.get(episode.show_id);
      const attempts = (episode as any).player_resolve_attempts || 0;
      const newAttempts = attempts + 1;

      if (!showInfo) {
        // No show info — mark as done
        await supabase.from("episodes").update({
          speakers_extracted_at: new Date().toISOString(),
          player_resolve_attempts: newAttempts,
        }).eq("id", episode.id);
        continue;
      }

      try {
        const resolved = await resolvePlayersForEpisode(supabase, episode, showInfo, rosterCache);

        // Filter out already-linked players
        const newPlayers = resolved.filter(
          (rp) => !existingSet.has(`${episode.id}:${rp.player_id}`)
        );

        if (newPlayers.length > 0) {
          // Insert into player_episodes
          const rows = newPlayers.map((rp) => ({
            player_id: rp.player_id,
            episode_id: episode.id,
            mention_type: rp.mention_type,
            confidence: rp.confidence,
            source_text: rp.source_text,
          }));

          const { error: insertErr } = await supabase
            .from("player_episodes")
            .upsert(rows, { onConflict: "player_id,episode_id", ignoreDuplicates: true });

          if (insertErr) {
            console.error(`[resolve-episode-players] Insert error for ${episode.id}:`, insertErr);
          } else {
            totalResolved += newPlayers.length;
            for (const rp of newPlayers) {
              existingSet.add(`${episode.id}:${rp.player_id}`);
            }

            console.log(
              `[resolve-episode-players] Episode "${episode.title.slice(0, 50)}" → ${newPlayers.length} players ` +
              `(${newPlayers.filter((p) => p.confidence === "high").length} high, ` +
              `${newPlayers.filter((p) => p.confidence === "probable").length} probable)`
            );
          }

          // Link to stories with relevance gate
          const storyLinks = await linkResolvedPlayersToStories(supabase, episode.id, newPlayers);
          totalStoryLinks += storyLinks;

          // Players found — mark as done
          await supabase.from("episodes").update({
            speakers_extracted_at: new Date().toISOString(),
            player_resolve_attempts: newAttempts,
          }).eq("id", episode.id);
        } else {
          // Zero players found
          const isNationalShow = !showInfo.team_slug;

          if (isNationalShow || newAttempts >= 3) {
            // National shows with zero matches are expected; also give up at cap
            await supabase.from("episodes").update({
              speakers_extracted_at: new Date().toISOString(),
              player_resolve_attempts: newAttempts,
            }).eq("id", episode.id);

            if (!isNationalShow && newAttempts >= 3) {
              totalGaveUp++;
              console.warn(
                `[resolve-episode-players] GAVE UP after ${newAttempts} attempts — ` +
                `episode="${episode.title}" show="${showInfo.title}" id=${episode.id}`
              );
            }
          } else {
            // Team-scoped show, under retry cap — leave speakers_extracted_at NULL, bump attempts
            await supabase.from("episodes").update({
              player_resolve_attempts: newAttempts,
            }).eq("id", episode.id);
          }
        }
      } catch (epErr) {
        console.error(`[resolve-episode-players] Error processing episode ${episode.id}:`, epErr);
      }
    }

    const result = {
      success: true,
      episodes_checked: taggedEpisodes.length,
      players_resolved: totalResolved,
      story_links_created: totalStoryLinks,
      gave_up: totalGaveUp,
      duration_ms: Date.now() - start,
    };
    console.log("[resolve-episode-players] Complete:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[resolve-episode-players] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: String(err), duration_ms: Date.now() - start }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
