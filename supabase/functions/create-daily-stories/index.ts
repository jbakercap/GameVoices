import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chatCompletion } from '../_shared/google-ai.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CLUSTERING_PROMPT = `You are a sports podcast editor. Given these recent podcast episodes about {team_name}, group them by the specific NARRATIVE topic they're discussing.

IMPORTANT: Game results are already handled by a separate system. 
Do NOT create groups about who won or lost a specific game. Instead, 
find NARRATIVE storylines that span across games or exist independently 
of game outcomes — controversies, player milestones, injuries, returns 
from injury, trades, ejections, coaching decisions, roster moves, etc.

A group about "Celtics lose to Thunder" = WRONG (that's a game result)
A group about "Jaylen Brown ejection fallout" = RIGHT (that's a narrative)
A group about "Jayson Tatum return impact" = RIGHT (that's a narrative)

Rules:
- Each group must have 2+ episodes discussing the SAME specific narrative topic
- Episodes that are general team recaps or don't share a narrative topic with any other episode go in no group — discard them
- One episode can only belong to one group
- Write headlines like a sports talk radio producer — punchy, specific, opinionated. Use player names and the specific event.
  GOOD: "Jaylen Brown Ejection Sparks Ref Controversy"
  GOOD: "Tatum's Return Already Transforming Celtics Offense"
  BAD: "Impact of Jayson Tatum's Return on Team Dynamics"
  BAD: "Recent Developments Around the Boston Celtics"
  Headlines should feel like a segment title on a drive-time sports show, not a newspaper editorial.
- Identify if the story is primarily about one player (provide name) or the team generally
- Assign a story_type: trade, injury, coaching, controversy, milestone, suspension, contract, retirement, fantasy, preview, general
- Assign a topic_key: a 2-3 word lowercase slug that uniquely identifies this narrative (e.g., "brown_ejection", "tatum_return", "smart_trade"). This is used for deduplication.

EPISODES:
{episodes_json}

Return JSON only:
{
  "groups": [
    {
      "headline": "...",
      "story_type": "...",
      "topic_key": "...",
      "player_name": "..." or null,
      "episode_ids": ["...", "..."]
    }
  ]
}`;

async function sendTelegramLog(token: string, chatId: number, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
    });
  } catch { /* non-critical */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const start = Date.now();
  console.log(`[create-daily-stories] ▶ STARTUP at ${new Date().toISOString()}`);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);
  const googleAiKey = Deno.env.get("GOOGLE_AI_API_KEY");

  if (!googleAiKey) {
    return new Response(JSON.stringify({ ok: false, error: "GOOGLE_AI_API_KEY not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: any = {};
  try { body = await req.json(); } catch {}

  const teamSlugsFilter: string[] | null = body.team_slugs || null;
  const lookbackHours = body.lookback_hours || 48;

  console.log(`[create-daily-stories] lookback=${lookbackHours}h${teamSlugsFilter ? `, filter=${teamSlugsFilter.join(",")}` : ""}`);

  try {
    // 1. Get all teams with single-team shows
    const { data: allTeams, error: teamsErr } = await sb
      .from("teams")
      .select("id, slug, name, short_name")
      .eq("is_active", true);
    if (teamsErr) throw teamsErr;

    let teams = allTeams || [];
    if (teamSlugsFilter && teamSlugsFilter.length > 0) {
      const filterSet = new Set(teamSlugsFilter);
      teams = teams.filter(t => filterSet.has(t.slug));
    }

    console.log(`[create-daily-stories] Processing ${teams.length} teams`);

    const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
    // Use the ET calendar date as the canonical "sports day" for event_date.
    // Previously this used `new Date().toISOString().slice(0,10)` (UTC date), which
    // rolled to tomorrow after ~8 PM ET and tagged late-evening narratives with the
    // wrong day. ET is the canonical timezone for league schedules.
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date()); // en-CA → "YYYY-MM-DD"

    // 2. Load players for name→slug resolution
    const allPlayers: any[] = [];
    let playerOffset = 0;
    while (true) {
      const { data } = await sb
        .from("players")
        .select("id, name, slug, team_slug")
        .eq("status", "active")
        .range(playerOffset, playerOffset + 999);
      if (!data || data.length === 0) break;
      allPlayers.push(...data);
      if (data.length < 1000) break;
      playerOffset += 1000;
    }
    const playersByName = new Map<string, { id: string; slug: string; team_slug: string | null }>();
    for (const p of allPlayers) {
      playersByName.set(p.name.toLowerCase(), { id: p.id, slug: p.slug, team_slug: p.team_slug });
    }

    let totalStories = 0;
    let totalEpisodeLinks = 0;
    let teamsProcessed = 0;
    let teamsSkipped = 0;
    const errors: string[] = [];

    for (const team of teams) {
      try {
        // 3. Fetch recent episodes from single-team shows for this team
        const { data: episodes, error: epErr } = await sb
          .from("episodes")
          .select(`
            id, title, description, published_at, show_id,
            show:shows!inner(id, team_id, team_slugs, status)
          `)
          .gte("published_at", since)
          .eq("shows.team_id", team.id)
          .eq("shows.status", "active")
          .order("published_at", { ascending: false })
          .limit(100);

        if (epErr) throw epErr;
        if (!episodes || episodes.length === 0) {
          teamsSkipped++;
          continue;
        }

        // Filter to single-team shows only
        const singleTeamEps = episodes.filter((ep: any) => {
          const teamSlugs = ep.show?.team_slugs;
          return !teamSlugs || !Array.isArray(teamSlugs) || teamSlugs.length <= 1;
        });

        // 4. Use all single-team episodes (episodes can appear in both game stories AND narratives)
        const remainingEps = singleTeamEps;

        if (remainingEps.length < 2) {
          teamsSkipped++;
          continue;
        }

        // 5. Send to LLM for clustering
        const episodePayload = remainingEps.map((ep: any) => ({
          id: ep.id,
          title: ep.title,
          description: ((ep as any).description || "").slice(0, 300),
        }));

        const prompt = CLUSTERING_PROMPT
          .replace("{team_name}", team.name)
          .replace("{episodes_json}", JSON.stringify(episodePayload));

        let content: string;
        try {
          content = await chatCompletion({
            model: 'gemini-2.5-flash',
            messages: [
              { role: 'user', content: prompt },
            ],
            temperature: 0.2,
            max_tokens: 4000,
          });
        } catch (e) {
          const errMsg = (e as Error).message;
          if (errMsg.includes('429')) {
            console.warn(`[create-daily-stories] Rate limited on ${team.slug}, pausing 10s...`);
            await new Promise(r => setTimeout(r, 10000));
            continue;
          }
          throw new Error(`AI error: ${errMsg.slice(0, 200)}`);
        }
        content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

        let groups: Array<{
          headline: string;
          story_type: string;
          topic_key: string;
          player_name: string | null;
          episode_ids: string[];
        }>;
        try {
          const parsed = JSON.parse(content);
          groups = parsed.groups || [];
          if (!Array.isArray(groups)) groups = [];
        } catch {
          console.error(`[create-daily-stories] Bad JSON for ${team.slug}:`, content.slice(0, 300));
          errors.push(`${team.slug}: bad JSON`);
          continue;
        }

        // 5b. Load existing daily_narrative topic_keys for this team (last 48h) for dedup
        const dedupSince = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: existingStories } = await sb
          .from("stories")
          .select("narrative_key")
          .eq("source_type", "daily_narrative")
          .contains("team_slugs", [team.slug])
          .gte("created_at", dedupSince);

        const existingKeys = new Set(
          (existingStories || []).map((s: any) => s.narrative_key).filter(Boolean)
        );

        // 6. Create stories and link episodes
        for (const group of groups) {
          if (!group.headline || !group.episode_ids || group.episode_ids.length < 2) continue;

          // Dedup: skip if topic_key already exists for this team
          const topicKey = group.topic_key || group.headline.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
          if (existingKeys.has(topicKey)) {
            console.log(`[create-daily-stories] Skipping duplicate topic_key "${topicKey}" for ${team.slug}`);
            continue;
          }
          existingKeys.add(topicKey); // prevent dupes within same run too

          // Resolve player slug
          let people: string[] = [];
          let primaryEntitySlug = team.slug;
          if (group.player_name) {
            const playerInfo = playersByName.get(group.player_name.toLowerCase());
            if (playerInfo) {
              people = [playerInfo.slug];
              primaryEntitySlug = playerInfo.slug;
            } else {
              // Fuzzy: last name match on this team
              const lastName = group.player_name.split(" ").pop()?.toLowerCase() || "";
              if (lastName.length >= 3) {
                for (const [name, info] of playersByName.entries()) {
                  if (name.endsWith(lastName) && info.team_slug === team.slug) {
                    people = [info.slug];
                    primaryEntitySlug = info.slug;
                    break;
                  }
                }
              }
            }
          }

          const storyType = (group.story_type || "general").toUpperCase();
          const slug = group.headline
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .slice(0, 80);

          const sport = team.slug.startsWith("mlb-") ? "baseball" :
            team.slug.startsWith("nba-") || team.slug.startsWith("wnba-") ? "basketball" :
            team.slug.startsWith("nfl-") ? "football" :
            team.slug.startsWith("nhl-") ? "hockey" : "unknown";

          const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

          const { data: newStory, error: insertErr } = await sb
            .from("stories")
            .insert({
              source_type: "daily_narrative",
              headline: group.headline,
              story_type: storyType,
              team_slugs: [team.slug],
              people: people.length ? people : null,
              primary_entity_slug: primaryEntitySlug,
              event_date: today,
              expires_at: expiresAt,
              metadata: { run_date: today, topic_key: topicKey },
              narrative_key: topicKey,
              game_id: null,
              status: "active",
              slug,
              sport,
              confidence_level: "reported",
              episode_count: group.episode_ids.length,
              show_count: 0, // updated below
            })
            .select("id")
            .single();

          if (insertErr) {
            console.error(`[create-daily-stories] Insert error for ${team.slug}:`, insertErr.message);
            errors.push(`${team.slug}: ${insertErr.message}`);
            continue;
          }

          // Link episodes
          const validEpIds = group.episode_ids.filter(id =>
            remainingEps.some((ep: any) => ep.id === id)
          );

          const links = validEpIds.map(epId => ({
            episode_id: epId,
            story_id: newStory.id,
            relevance: "strong",
          }));

          if (links.length > 0) {
            const { error: linkErr } = await sb
              .from("episode_stories")
              .insert(links);

            if (linkErr) {
              console.error(`[create-daily-stories] Link error:`, linkErr.message);
            } else {
              totalEpisodeLinks += links.length;
            }
          }

          // Update show_count
          const showIds = new Set(
            validEpIds
              .map(id => remainingEps.find((ep: any) => ep.id === id))
              .filter(Boolean)
              .map((ep: any) => ep.show_id)
          );

          await sb.from("stories").update({
            show_count: showIds.size,
            episode_count: validEpIds.length,
          }).eq("id", newStory.id);

          totalStories++;
          console.log(`[create-daily-stories] Created: "${group.headline}" (${storyType}) — ${validEpIds.length} eps, ${showIds.size} shows`);
        }

        teamsProcessed++;

        // Rate limit between teams
        if (teams.length > 1) await new Promise(r => setTimeout(r, 500));
      } catch (e) {
        errors.push(`${team.slug}: ${(e as Error).message}`);
        console.error(`[create-daily-stories] ${team.slug}:`, e);
      }
    }

    // Attach related articles to new daily_narrative stories
    try {
      const { data: newStories } = await sb
        .from("stories")
        .select("id, headline, team_slugs")
        .eq("source_type", "daily_narrative")
        .eq("status", "active")
        .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString()); // last 5 min

      // This is supplementary — just log count, no blocking
      console.log(`[create-daily-stories] ${newStories?.length || 0} new stories for article matching (skipping for v1)`);
    } catch { /* non-critical */ }

    const result: any = {
      ok: true,
      teams_processed: teamsProcessed,
      teams_skipped: teamsSkipped,
      stories_created: totalStories,
      episode_links: totalEpisodeLinks,
      errors: errors.length ? errors : undefined,
      duration_ms: Date.now() - start,
    };

    console.log(`[create-daily-stories] ■ DONE:`, JSON.stringify(result));

    // Telegram log
    const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const tgAllowed = Deno.env.get("TELEGRAM_ALLOWED_USERS");
    if (tgToken && tgAllowed) {
      const chatId = parseInt(tgAllowed.split(",")[0], 10);
      if (!isNaN(chatId)) {
        const msg = `📊 *Daily Stories*\nTeams: ${teamsProcessed} processed, ${teamsSkipped} skipped\nStories: ${totalStories}\nEpisode links: ${totalEpisodeLinks}${errors.length ? `\nErrors: ${errors.length}` : ""}\n⏱ ${Date.now() - start}ms`;
        await sendTelegramLog(tgToken, chatId, msg);
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[create-daily-stories] ✖ FATAL:", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message, duration_ms: Date.now() - start }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
