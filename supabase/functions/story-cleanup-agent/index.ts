import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Story Type Priority (higher = more specific, same as extract-stories) ──
const STORY_TYPE_PRIORITY: Record<string, number> = {
  game_result: 7, game_preview: 6, milestone: 5, coaching: 5,
  trade: 4, signing: 4, injury: 3, suspension: 3, retirement: 3,
  roster_move: 2, player_narrative: 2, draft: 2, offseason: 1, general: 0,
  line_movement: 2, prop_bet: 2, betting_preview: 2,
  waiver_wire: 2, fantasy_preview: 2, trade_value: 2,
};

// ── Headline N-gram Dedup ──
function headlineNgrams(headline: string, n: number): Set<string> {
  const words = headline.toLowerCase().replace(/[^a-z0-9\s'-]/g, "").split(/\s+/).filter(Boolean);
  const grams = new Set<string>();
  for (let i = 0; i <= words.length - n; i++) {
    grams.add(words.slice(i, i + n).join(" "));
  }
  return grams;
}

function findSharedNgram(a: string, b: string, n: number): string | null {
  const gramsA = headlineNgrams(a, n);
  const gramsB = headlineNgrams(b, n);
  for (const g of gramsA) {
    if (gramsB.has(g)) return g;
  }
  return null;
}

function arraysOverlap(a: string[], b: string[]): boolean {
  const setB = new Set(b);
  return a.some(x => setB.has(x));
}

function arrayUnion(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

/** Extract short team names from slugs (e.g. "nba-celtics" → "celtics") */
function getTeamShortNames(slugs: string[]): Set<string> {
  const names = new Set<string>();
  for (const slug of slugs) {
    const parts = slug.split("-");
    if (parts.length >= 2) {
      names.add(parts[parts.length - 1]); // last segment
    }
  }
  return names;
}

/** Check if an ngram contains any team short name from overlapping slugs */
function ngramContainsTeamName(ngram: string, overlappingSlugs: string[]): boolean {
  const teamNames = getTeamShortNames(overlappingSlugs);
  const ngramWords = ngram.toLowerCase().split(/\s+/);
  for (const word of ngramWords) {
    if (teamNames.has(word)) return true;
  }
  return false;
}

interface StoryRow {
  id: string;
  headline: string;
  story_type: string;
  team_slugs: string[];
  people: string[];
  sport: string;
  event_date: string | null;
  episode_count: number;
  status: string;
}

/** Determine winner/loser, move episode links, union metadata, mark loser as merged */
async function mergeStories(
  supabase: any,
  a: StoryRow,
  b: StoryRow,
  mergedIds: Set<string>,
  mergeLog: Array<{ kept: string; deleted: string; reason: string; team: string }>,
  teamSlug: string,
  reason: string,
): Promise<void> {
  const priA = STORY_TYPE_PRIORITY[a.story_type] ?? 0;
  const priB = STORY_TYPE_PRIORITY[b.story_type] ?? 0;
  let winner: StoryRow, loser: StoryRow;
  if (priA > priB) { winner = a; loser = b; }
  else if (priB > priA) { winner = b; loser = a; }
  else { winner = a.episode_count >= b.episode_count ? a : b; loser = winner === a ? b : a; }

  console.log(`[story-cleanup] MERGING: keep="${winner.headline}" (${winner.story_type}, ${winner.episode_count} eps), delete="${loser.headline}" (${loser.story_type}, ${loser.episode_count} eps), reason="${reason}"`);

  // Move episode associations
  const { data: loserEps } = await supabase
    .from("episode_stories")
    .select("episode_id, relevance")
    .eq("story_id", loser.id);

  if (loserEps?.length) {
    for (const ep of loserEps) {
      await supabase.from("episode_stories").upsert(
        { episode_id: ep.episode_id, story_id: winner.id, relevance: ep.relevance },
        { onConflict: "episode_id,story_id" }
      );
    }
    await supabase.from("episode_stories").delete().eq("story_id", loser.id);
  }

  // Union people and team_slugs on winner
  const mergedPeople = arrayUnion(winner.people || [], loser.people || []);
  const mergedTeams = arrayUnion(winner.team_slugs || [], loser.team_slugs || []);

  await supabase.from("stories").update({
    people: mergedPeople,
    team_slugs: mergedTeams,
    updated_at: new Date().toISOString(),
  }).eq("id", winner.id);

  // Mark loser as merged
  await supabase.from("stories").update({
    status: "merged",
    updated_at: new Date().toISOString(),
  }).eq("id", loser.id);

  // Recount winner
  await supabase.rpc("update_story_counts", { p_story_id: winner.id });

  mergedIds.add(loser.id);
  mergeLog.push({ kept: winner.id, deleted: loser.id, reason, team: teamSlug });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startMs = Date.now();

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Parse optional team_slugs from body
    let targetTeamSlugs: string[] | null = null;
    try {
      const body = await req.json();
      if (body?.team_slugs?.length) {
        targetTeamSlugs = body.team_slugs;
      }
    } catch {
      // No body or invalid JSON — process all teams
    }

    // ── PHASE 0: Expiration Sweep ──
    // Expire stories past their expires_at date
    const { data: expiredRows } = await supabase
      .from("stories")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("status", "active")
      .lt("expires_at", new Date().toISOString())
      .select("id");
    const expiredCount = expiredRows?.length ?? 0;
    if (expiredCount > 0) {
      console.log(`[story-cleanup] PHASE 0: Expired ${expiredCount} past-due stories`);
    }

    // ── PHASE 0a: Non-game story staleness expiration ──
    // Expire trade/signing/roster_move/injury stories older than 30 days
    // that have not received a new episode link in the last 14 days
    const STALENESS_TYPES = ['trade', 'signing', 'roster_move', 'injury'];
    const stalenessEventCutoff = new Date(Date.now() - 30 * 86400 * 1000).toISOString().slice(0, 10);
    const stalenessEpisodeCutoff = new Date(Date.now() - 14 * 86400 * 1000).toISOString();

    const { data: stalenessCandidate } = await supabase
      .from("stories")
      .select("id, headline, story_type, event_date")
      .eq("status", "active")
      .in("story_type", STALENESS_TYPES)
      .lt("event_date", stalenessEventCutoff)
      .limit(500);

    let nonGameExpired = 0;
    if (stalenessCandidate?.length) {
      for (let i = 0; i < stalenessCandidate.length; i += 50) {
        const batch = stalenessCandidate.slice(i, i + 50);
        for (const story of batch) {
          // Check if any linked episode was published in the last 14 days
          const { data: recentEp } = await supabase
            .from("episode_stories")
            .select("episode_id, episodes!inner(published_at)")
            .eq("story_id", story.id)
            .gt("episodes.published_at", stalenessEpisodeCutoff)
            .limit(1);

          if (!recentEp?.length) {
            await supabase
              .from("stories")
              .update({ status: "expired", updated_at: new Date().toISOString() })
              .eq("id", story.id);
            nonGameExpired++;
            console.log(`[story-cleanup] PHASE 0a: Expired stale ${story.story_type} "${story.headline}" (event_date=${story.event_date})`);
          }
        }
      }
      if (nonGameExpired > 0) {
        console.log(`[story-cleanup] PHASE 0a: Expired ${nonGameExpired} stale non-game stories`);
      }
    }

    // Expire orphan stories (active but no episode links)
    const { data: orphanStories } = await supabase
      .from("stories")
      .select("id")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (orphanStories?.length) {
      const orphanIds: string[] = [];
      // Check in batches of 100
      for (let i = 0; i < orphanStories.length; i += 100) {
        const batch = orphanStories.slice(i, i + 100);
        const ids = batch.map((s: any) => s.id);
        const { data: linked } = await supabase
          .from("episode_stories")
          .select("story_id")
          .in("story_id", ids);
        const linkedIds = new Set((linked || []).map((l: any) => l.story_id));
        for (const id of ids) {
          if (!linkedIds.has(id)) orphanIds.push(id);
        }
      }
      if (orphanIds.length > 0) {
        await supabase
          .from("stories")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .in("id", orphanIds);
        console.log(`[story-cleanup] PHASE 0: Expired ${orphanIds.length} orphan stories`);
      }
    }

    // ── PHASE 0b: Preview→Result Merge ──
    // Find game_preview stories that have a matching game_result by matchup_key
    const { data: previews } = await supabase
      .from("stories")
      .select("id, headline, story_type, team_slugs, people, sport, event_date, episode_count, status, matchup_key")
      .eq("status", "active")
      .eq("story_type", "game_preview")
      .not("matchup_key", "is", null);

    let previewsMerged = 0;
    if (previews?.length) {
      for (const preview of previews) {
        const { data: results } = await supabase
          .from("stories")
          .select("id, headline, story_type, team_slugs, people, sport, event_date, episode_count, status")
          .eq("status", "active")
          .eq("story_type", "game_result")
          .eq("matchup_key", preview.matchup_key)
          .limit(1);

        if (results?.length) {
          const result = results[0];
          // Move episodes from preview to result
          const { data: previewEps } = await supabase
            .from("episode_stories")
            .select("episode_id, relevance")
            .eq("story_id", preview.id);

          if (previewEps?.length) {
            for (const ep of previewEps) {
              await supabase.from("episode_stories").upsert(
                { episode_id: ep.episode_id, story_id: result.id, relevance: ep.relevance },
                { onConflict: "episode_id,story_id" }
              );
            }
            await supabase.from("episode_stories").delete().eq("story_id", preview.id);
          }

          // Union metadata
          const mergedPeople = arrayUnion(result.people || [], preview.people || []);
          const mergedTeams = arrayUnion(result.team_slugs || [], preview.team_slugs || []);
          await supabase.from("stories").update({
            people: mergedPeople, team_slugs: mergedTeams, updated_at: new Date().toISOString(),
          }).eq("id", result.id);

          // Mark preview as merged
          await supabase.from("stories").update({
            status: "merged", updated_at: new Date().toISOString(),
          }).eq("id", preview.id);

          await supabase.rpc("update_story_counts", { p_story_id: result.id });
          previewsMerged++;
          console.log(`[story-cleanup] PHASE 0b: Merged preview "${preview.headline}" into result "${result.headline}"`);
        }
      }
    }

    // Get all active stories from last 48 hours
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: stories, error: storiesErr } = await supabase
      .from("stories")
      .select("id, headline, story_type, team_slugs, people, sport, event_date, episode_count, status")
      .eq("status", "active")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });

    if (storiesErr) throw storiesErr;
    if (!stories?.length) {
      console.log("[story-cleanup] No recent stories found");
      await supabase.from("story_cleanup_log").insert({
        stories_merged: 0, stories_flagged: 0, teams_processed: 0,
        duration_ms: Date.now() - startMs,
      });
      return new Response(JSON.stringify({ merged: 0, flagged: 0, teams: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group stories by team slug
    const teamStories = new Map<string, StoryRow[]>();
    for (const s of stories as StoryRow[]) {
      const slugs = s.team_slugs || [];
      for (const slug of slugs) {
        if (targetTeamSlugs && !targetTeamSlugs.includes(slug)) continue;
        if (!teamStories.has(slug)) teamStories.set(slug, []);
        teamStories.get(slug)!.push(s);
      }
    }

    if (targetTeamSlugs && teamStories.size === 0) {
      console.log(`[story-cleanup] No stories found for teams: ${targetTeamSlugs.join(", ")}`);
      await supabase.from("story_cleanup_log").insert({
        stories_merged: 0, stories_flagged: 0, teams_processed: 0,
        duration_ms: Date.now() - startMs,
      });
      return new Response(JSON.stringify({ merged: 0, flagged: 0, teams: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalMerged = 0;
    let totalFlagged = 0;
    const mergedIds = new Set<string>();
    const mergeLog: Array<{ kept: string; deleted: string; reason: string; team: string }> = [];

    for (const [teamSlug, teamStoryList] of teamStories) {
      console.log(`[story-cleanup] Processing ${teamSlug}: ${teamStoryList.length} stories`);

      for (let i = 0; i < teamStoryList.length; i++) {
        const a = teamStoryList[i];
        if (mergedIds.has(a.id)) continue;

        for (let j = i + 1; j < teamStoryList.length; j++) {
          const b = teamStoryList[j];
          if (mergedIds.has(b.id)) continue;

          // Check for 5+ word ngram match first (auto-merge threshold)
          const shared5 = findSharedNgram(a.headline, b.headline, 5);

          if (shared5) {
            // Both game_result → never auto-merge, flag instead
            if (a.story_type === "game_result" && b.story_type === "game_result") {
              console.log(`[story-cleanup] FLAGGED game_result pair: "${a.headline}" vs "${b.headline}"`);
              await supabase.from("story_cleanup_flags").insert({
                story_id_a: a.id, story_id_b: b.id,
                reason: "both_game_result_5gram", similarity_ngram: shared5,
              });
              totalFlagged++;
              continue;
            }

            if (!arraysOverlap(a.team_slugs || [], b.team_slugs || [])) continue;

            await mergeStories(supabase, a, b, mergedIds, mergeLog, teamSlug, `headline_ngram_match_5: "${shared5}"`);
            totalMerged++;

          } else {
            // Check for 4-word ngram match
            const shared4 = findSharedNgram(a.headline, b.headline, 4);
            if (shared4 && arraysOverlap(a.team_slugs || [], b.team_slugs || [])) {
              const overlappingSlugs = (a.team_slugs || []).filter(s => (b.team_slugs || []).includes(s));

              // If ngram contains team name → high-confidence auto-merge (unless both game_result)
              if (ngramContainsTeamName(shared4, overlappingSlugs)) {
                if (a.story_type === "game_result" && b.story_type === "game_result") {
                  console.log(`[story-cleanup] FLAGGED game_result pair (team 4gram): "${a.headline}" vs "${b.headline}"`);
                  await supabase.from("story_cleanup_flags").insert({
                    story_id_a: a.id, story_id_b: b.id,
                    reason: "both_game_result_team_4gram", similarity_ngram: shared4,
                  });
                  totalFlagged++;
                } else {
                  console.log(`[story-cleanup] AUTO-MERGE team-name 4gram: "${shared4}" for ${overlappingSlugs.join(",")}`);
                  await mergeStories(supabase, a, b, mergedIds, mergeLog, teamSlug, `team_name_4gram: "${shared4}"`);
                  totalMerged++;
                }
              } else {
                // Generic 4-gram → flag only
                console.log(`[story-cleanup] FLAGGED 4-gram: "${a.headline}" vs "${b.headline}" ngram="${shared4}"`);
                await supabase.from("story_cleanup_flags").insert({
                  story_id_a: a.id, story_id_b: b.id,
                  reason: a.story_type === "game_result" && b.story_type === "game_result"
                    ? "both_game_result_4gram" : "headline_ngram_4word",
                  similarity_ngram: shared4,
                });
                totalFlagged++;
              }
            }
          }
        }
      }
    }

    // ── PHASE 2b: Repair game stories with missing team slugs ──
    // Find game_result/game_preview stories with < 2 team_slugs and try to resolve from headline
    const { data: incompleteGameStories } = await supabase
      .from("stories")
      .select("id, headline, story_type, team_slugs, sport, event_date")
      .eq("status", "active")
      .in("story_type", ["game_result", "game_preview"])
      .limit(500);

    // Build a simple team name lookup from the teams table
    const { data: allTeams } = await supabase
      .from("teams")
      .select("slug, name, short_name, city")
      .eq("is_active", true);

    let gameStoriesRepaired = 0;
    if (incompleteGameStories?.length && allTeams?.length) {
      // Build variant map inline
      const teamLookup = new Map<string, string[]>();
      for (const t of allTeams) {
        const variants: string[] = [];
        if (t.name) variants.push(t.name.toLowerCase());
        if (t.short_name) variants.push(t.short_name.toLowerCase());
        teamLookup.set(t.slug, variants);
      }

      for (const story of incompleteGameStories) {
        const slugs = story.team_slugs || [];
        if (slugs.length >= 2) continue; // already has both teams

        const headlineLower = story.headline.toLowerCase();
        const existingSlugs = new Set(slugs);
        const foundSlugs: string[] = [];

        for (const [slug, variants] of teamLookup.entries()) {
          if (existingSlugs.has(slug)) continue;
          const slugSport = slug.split('-')[0];
          if (story.sport && slugSport !== story.sport) continue;
          if (variants.some((v: string) => headlineLower.includes(v))) {
            foundSlugs.push(slug);
          }
        }

        if (foundSlugs.length > 0) {
          const repairedSlugs = [...slugs, ...foundSlugs];
          const updateData: any = { team_slugs: repairedSlugs, updated_at: new Date().toISOString() };

          // Rebuild matchup_key if we now have 2+ teams and an event_date
          if (story.event_date && repairedSlugs.length >= 2) {
            const dateStr = story.event_date.slice(0, 10);
            const sortedTeams = [...repairedSlugs].sort();
            updateData.matchup_key = `${story.sport}:${dateStr}:${sortedTeams.join('|')}`;
          }

          await supabase.from("stories").update(updateData).eq("id", story.id);
          gameStoriesRepaired++;
          console.log(`[story-cleanup] PHASE 2b: Repaired game story "${story.headline}" — added ${foundSlugs.join(', ')} (was: [${slugs.join(', ')}])`);
        }
      }
      if (gameStoriesRepaired > 0) {
        console.log(`[story-cleanup] PHASE 2b: Repaired ${gameStoriesRepaired} game stories with missing team slugs`);
      }
    }

    // ── PHASE 3: Periodic Recount ──
    // Recount episode_count and show_count for all active stories to fix drift
    const { data: activeStoryIds } = await supabase
      .from("stories")
      .select("id")
      .eq("status", "active")
      .limit(2000);

    let recountFixed = 0;
    if (activeStoryIds?.length) {
      for (let i = 0; i < activeStoryIds.length; i += 50) {
        const batch = activeStoryIds.slice(i, i + 50).map((s: any) => s.id);
        for (const storyId of batch) {
          try {
            await supabase.rpc("update_story_counts", { p_story_id: storyId });
            recountFixed++;
          } catch {
            // Skip individual failures
          }
        }
      }
      console.log(`[story-cleanup] PHASE 3: Recounted ${recountFixed} active stories`);
    }

    const durationMs = Date.now() - startMs;
    const teamsProcessed = teamStories.size;

    await supabase.from("story_cleanup_log").insert({
      stories_merged: totalMerged, stories_flagged: totalFlagged,
      teams_processed: teamsProcessed, duration_ms: durationMs,
    });

    const result = {
      success: true, stories_merged: totalMerged, stories_flagged: totalFlagged,
      stories_expired: expiredCount, non_game_expired: nonGameExpired,
      previews_merged: previewsMerged,
      game_stories_repaired: gameStoriesRepaired,
      stories_recounted: recountFixed,
      teams_processed: teamsProcessed, duration_ms: durationMs, merge_log: mergeLog,
    };

    console.log(`[story-cleanup] COMPLETE: ${JSON.stringify(result)}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[story-cleanup] ERROR:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
