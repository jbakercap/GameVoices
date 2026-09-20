import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

// Pick the highest-bitrate MP4 variant for best quality
function pickBestMp4(variants: any[]): string | null {
  const mp4s = variants
    .filter((v: any) => v.content_type === 'video/mp4' && v.url)
    .sort((a: any, b: any) => (b.bitrate ?? b.bit_rate ?? 0) - (a.bitrate ?? a.bit_rate ?? 0));
  if (mp4s.length === 0) return null;
  return mp4s[0].url;
}

// Check if a media array contains video or animated_gif
function rowHasVideo(media: any[]): boolean {
  return media.some((m: any) => m.type === 'video' || m.type === 'animated_gif');
}

// ── OAuth 1.0a helpers (for List Timeline endpoint) ─────────────────

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function generateNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}

async function hmacSha1(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return base64Encode(new Uint8Array(signature));
}

interface OAuthCreds {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

async function buildOAuthHeader(
  method: string,
  url: string,
  queryParams: Record<string, string>,
  creds: OAuthCreds
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = generateNonce();

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  // Merge query params + oauth params for signature base
  const allParams = { ...queryParams, ...oauthParams };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const baseString = `${method.toUpperCase()}&${percentEncode(url)}&${percentEncode(paramString)}`;
  const signingKey = `${percentEncode(creds.consumerSecret)}&${percentEncode(creds.accessTokenSecret)}`;

  const signature = await hmacSha1(signingKey, baseString);
  oauthParams["oauth_signature"] = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

function sanitizeHandle(h: string): string {
  return h.replace(/^@/, "").trim().toLowerCase();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const xApiKey = Deno.env.get("X_API_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    // OAuth 1.0a creds for List Timeline (requires user-context auth)
    const oauthCreds: OAuthCreds | null = (() => {
      const ck = Deno.env.get("X_CONSUMER_KEY");
      const cs = Deno.env.get("X_CONSUMER_SECRET");
      const at = Deno.env.get("X_ACCESS_TOKEN");
      const ats = Deno.env.get("X_ACCESS_TOKEN_SECRET");
      if (ck && cs && at && ats) {
        return { consumerKey: ck, consumerSecret: cs, accessToken: at, accessTokenSecret: ats };
      }
      return null;
    })();

  try {
    // Parse body and check feature flag in parallel
    const [body, { data: flagRow }] = await Promise.all([
      req.json(),
      supabase.from("app_config").select("value").eq("key", "x_feed_enabled").maybeSingle(),
    ]);

    if (flagRow?.value !== "true") {
      return new Response(JSON.stringify({ enabled: false, posts: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { mode, team_id, player_id, game_id, show_id, team_ids, unfiltered, cursor: incomingCursor, force, mediaFilter } = body;
    console.log(`[fetch-x-feed] incoming request: mode=${mode} team_id=${team_id} cursor=${incomingCursor || 'none'} deepPagination=${body.deepPagination ? 'true' : 'false'} force=${!!force} mediaFilter=${mediaFilter || 'none'}`);

    if (!mode) {
      return new Response(JSON.stringify({ error: "mode is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve handles based on mode
    let handles: string[] = [];
    let cacheKey = "";
    let gameTimeWindow: { start: Date; end: Date } | null = null;
    let playerXUserId: string | null = null;
    let playerFallbackAuthor: { name: string; username: string } | null = null;
    let teamXListId: string | null = null;

    if (mode === "home" && team_ids && team_ids.length > 0) {
      // Home mode: 15-handle cap distributed evenly across followed teams
      const sortedIds = [...team_ids].sort();
      cacheKey = `home_media:${sortedIds.join(",")}`;

      const { data: xAccounts } = await supabase
        .from("team_x_accounts")
        .select("handle, account_type, team_id")
        .in("team_id", sortedIds)
        .eq("active", true)
        .in("account_type", ["team", "host", "reporter"]);

      if (xAccounts && xAccounts.length > 0) {
        const MAX_HOME_HANDLES = 15;
        const handlesPerTeam = Math.max(1, Math.floor(MAX_HOME_HANDLES / sortedIds.length));

        // Group accounts by team, each group sorted by priority: team > host > reporter
        const priorityOrder: Record<string, number> = { team: 0, host: 1, reporter: 2 };
        const byTeam = new Map<string, typeof xAccounts>();
        for (const a of xAccounts) {
          const list = byTeam.get(a.team_id) || [];
          list.push(a);
          byTeam.set(a.team_id, list);
        }

        for (const teamId of sortedIds) {
          const teamAccounts = byTeam.get(teamId) || [];
          teamAccounts.sort((a: any, b: any) => (priorityOrder[a.account_type] ?? 9) - (priorityOrder[b.account_type] ?? 9));
          const selected = teamAccounts.slice(0, handlesPerTeam);
          handles.push(...selected.map((a: any) => a.handle));
        }

        // Cap at MAX_HOME_HANDLES after all teams processed
        handles = handles.slice(0, MAX_HOME_HANDLES);
      }
    } else if (mode === "game" && game_id) {
      // Game mode: reuse the team's cached list posts filtered to a time window
      const { data: game } = await supabase
        .from("games")
        .select("home_team_slug, away_team_slug, game_time, event_date")
        .eq("id", game_id)
        .maybeSingle();

      if (!game) {
        return new Response(JSON.stringify({ enabled: true, posts: [], fromCache: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Resolve the home team to get its x_list_id
      const { data: homeTeam } = await supabase
        .from("teams")
        .select("id, x_list_id")
        .eq("slug", game.home_team_slug)
        .maybeSingle();

      if (!homeTeam?.x_list_id) {
        return new Response(JSON.stringify({ enabled: true, posts: [], fromCache: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use the team's cache key so we read from the same cached list posts
      cacheKey = `team:${homeTeam.id}`;

      const gameTime = game.game_time
        ? new Date(game.game_time)
        : new Date(game.event_date + "T12:00:00Z");
      gameTimeWindow = {
        start: new Date(gameTime.getTime() + 2 * 60 * 60 * 1000),
        end: new Date(gameTime.getTime() + 48 * 60 * 60 * 1000),
      };

      // Skip handle resolution — game mode reads directly from cached list posts
      const posts = await getCachedPosts(supabase, cacheKey, gameTimeWindow, mode, !!unfiltered);
      return new Response(
        JSON.stringify({ enabled: true, posts, fromCache: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (mode === "team") {
      let teamSlugs: string[] = [];
      let teamIds: string[] = [];

      if (team_id) {
        cacheKey = `team:${team_id}`;
        teamIds = [team_id];
        const { data: team } = await supabase
          .from("teams")
          .select("slug, x_list_id")
          .eq("id", team_id)
          .maybeSingle();
        if (team) {
          teamSlugs = [team.slug];
          teamXListId = team.x_list_id || null;
        }

        // Cache-first: if cache is fresh, skip all handle resolution queries
        const { data: latestTeamCache } = await supabase
          .from("x_feed_cache")
          .select("fetched_at")
          .eq("cache_key", cacheKey)
          .order("fetched_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const teamCacheFresh =
          latestTeamCache &&
          Date.now() - new Date(latestTeamCache.fetched_at).getTime() < CACHE_TTL_MS;

        if (teamCacheFresh && !incomingCursor && !body.deepPagination && !force) {
          console.log(`[fetch-x-feed] Team mode: cache fresh, no cursor, not deep pagination — returning cached posts`);
          const posts = await getCachedPosts(supabase, cacheKey, null, mode, !!unfiltered);
          return new Response(
            JSON.stringify({ enabled: true, posts, fromCache: true }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        if (incomingCursor || body.deepPagination) {
          console.log(`[fetch-x-feed] Team mode: skipping cache short-circuit (cursor=${incomingCursor ? 'present' : 'none'}, deepPagination=${body.deepPagination ? 'true' : 'false'})`);
        }
      }

      // Cache miss — resolve handles in parallel
      if (teamIds.length > 0) {
        const [xAccountsRes, showsRes, playersRes] = await Promise.all([
          supabase
            .from("team_x_accounts")
            .select("handle")
            .in("team_id", teamIds)
            .eq("active", true),
          supabase
            .from("shows")
            .select("twitter_handle")
            .in("team_id", teamIds)
            .not("twitter_handle", "is", null),
          teamSlugs.length > 0
            ? supabase
                .from("players")
                .select("twitter_handle")
                .in("team_slug", teamSlugs)
                .not("twitter_handle", "is", null)
                .eq("status", "active")
            : Promise.resolve({ data: [] }),
        ]);

        if (xAccountsRes.data) handles.push(...xAccountsRes.data.map((a: any) => a.handle));
        if (showsRes.data) handles.push(...showsRes.data.map((s: any) => s.twitter_handle));
        if (playersRes.data) handles.push(...playersRes.data.map((p: any) => p.twitter_handle));
        console.log(`Team mode: cache miss, resolved ${handles.length} handles in parallel`);
      }
    } else if (mode === "player" && player_id) {
      cacheKey = `player:${player_id}`;
      const { data: player } = await supabase
        .from("players")
        .select("twitter_handle, x_user_id, name")
        .eq("id", player_id)
        .maybeSingle();
      if (player?.twitter_handle) handles.push(player.twitter_handle);
      if (player?.x_user_id) {
        playerXUserId = player.x_user_id;
      }
      playerFallbackAuthor = {
        name: player?.name || "",
        username: player?.twitter_handle ? sanitizeHandle(player.twitter_handle) : "",
      };
    } else if (mode === "show" && show_id) {
      cacheKey = `show:${show_id}`;
      const { data: show } = await supabase
        .from("shows")
        .select("twitter_handle")
        .eq("id", show_id)
        .maybeSingle();
      if (show?.twitter_handle) handles.push(show.twitter_handle);
    }

    // Deduplicate and sanitize handles
    const cleanHandles = [...new Set(handles.map(sanitizeHandle))].filter(
      (h) => h.length > 0
    );

    if (cleanHandles.length === 0 && !(mode === "team" && teamXListId)) {
      // For team mode with x_list_id, we can still fetch via List Timeline even with 0 handles
      const fallbackPosts = await getCachedPosts(supabase, cacheKey, null, mode, !!unfiltered);
      return new Response(
        JSON.stringify({ enabled: true, posts: fallbackPosts, fromCache: fallbackPosts.length > 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (mode === "home") {
      // Home mode: fetch each handle individually, skip handles with fresh cache
      if (xApiKey) {
        const now = new Date().toISOString();

        // Check per-handle cache freshness
        const { data: cachedHandles } = await supabase
          .from("x_feed_cache")
          .select("handle, fetched_at")
          .eq("cache_key", cacheKey)
          .in("handle", cleanHandles)
          .order("fetched_at", { ascending: false });

        // Build a map of latest fetch time per handle
        const handleFreshness = new Map<string, number>();
        for (const row of cachedHandles || []) {
          if (!handleFreshness.has(row.handle)) {
            handleFreshness.set(row.handle, new Date(row.fetched_at).getTime());
          }
        }

        const staleHandles = cleanHandles.filter((h) => {
          const lastFetch = handleFreshness.get(h);
          return !lastFetch || Date.now() - lastFetch > CACHE_TTL_MS;
        });

        console.log(`Home feed: ${cleanHandles.length} handles, ${staleHandles.length} stale, fetching individually`);

        // Fetch stale handles individually with has:media
        const fetchPromises = staleHandles.map((handle) =>
          fetchCombinedQuery(supabase, xApiKey, [handle], cacheKey, now, 10, true)
            .catch((err) => console.error(`X API error for @${handle}:`, err))
        );
        await Promise.all(fetchPromises);
      }

      const posts = await getCachedPosts(supabase, cacheKey, gameTimeWindow, mode, !!unfiltered);
      return new Response(
        JSON.stringify({ enabled: true, posts, fromCache: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Non-home modes: check global cache freshness
    const { data: latestCache } = await supabase
      .from("x_feed_cache")
      .select("fetched_at")
      .eq("cache_key", cacheKey)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isCacheFresh =
      latestCache &&
      Date.now() - new Date(latestCache.fetched_at).getTime() < CACHE_TTL_MS;

    if (isCacheFresh && !incomingCursor && !force) {
      const posts = await getCachedPosts(supabase, cacheKey, gameTimeWindow, mode, !!unfiltered);
      return new Response(
        JSON.stringify({ enabled: true, posts, fromCache: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch new posts from X API for non-home modes
    let resultCursor: string | null = null;
    if (xApiKey || oauthCreds) {
      try {
        const now = new Date().toISOString();

        if (mode === "player" && playerXUserId && xApiKey) {
          const fallback = playerFallbackAuthor || { name: "", username: "" };
          await fetchUserTimeline(supabase, xApiKey, playerXUserId, cacheKey, now, fallback);
        } else if (mode === "team") {
          const proxyKey = Deno.env.get("TWITTER_API_IO_KEY");
          if (proxyKey && cleanHandles.length > 0) {
            // Try Advanced Search first (uses all resolved handles)
            console.log(`[fetch-x-feed] trying Advanced Search with ${cleanHandles.length} handles, incomingCursor: ${incomingCursor || 'none'}`);
            try {
              const searchMaxResults = 100;
              resultCursor = await fetchAdvancedSearchViaProxy(supabase, proxyKey, cleanHandles, cacheKey, now, searchMaxResults, incomingCursor || null, mediaFilter || null);
              console.log(`[fetch-x-feed] Advanced Search returned cursor: ${resultCursor || 'none'}`);
            } catch (searchErr) {
              console.error('TwitterAPI.io Advanced Search failed, trying list endpoint:', searchErr);
              // Fallback to list endpoint
              if (teamXListId) {
                try {
                  console.log('X feed: falling back to TwitterAPI.io list endpoint');
                  await fetchListTimelineViaProxy(supabase, proxyKey, teamXListId, cacheKey, now, 50);
                } catch (listErr) {
                  console.error('TwitterAPI.io list endpoint failed, trying official X API:', listErr);
                  if (oauthCreds && teamXListId) {
                    console.log('X feed: using official X API');
                    await fetchListTimeline(supabase, oauthCreds, teamXListId, cacheKey, now, 50);
                  }
                }
              } else if (oauthCreds && teamXListId) {
                console.log('X feed: using official X API');
                await fetchListTimeline(supabase, oauthCreds, teamXListId, cacheKey, now, 50);
              }
            }
          } else if (proxyKey && teamXListId) {
            // No handles resolved, fall back to list endpoint
            console.log('X feed: no handles, using TwitterAPI.io list endpoint');
            try {
              await fetchListTimelineViaProxy(supabase, proxyKey, teamXListId, cacheKey, now, 50);
            } catch (proxyErr) {
              console.error('TwitterAPI.io proxy failed, falling back:', proxyErr);
              if (oauthCreds) {
                console.log('X feed: using official X API');
                await fetchListTimeline(supabase, oauthCreds, teamXListId, cacheKey, now, 50);
              }
            }
          } else if (oauthCreds && teamXListId) {
            console.log('X feed: using official X API');
            await fetchListTimeline(supabase, oauthCreds, teamXListId, cacheKey, now, 50);
          } else if (xApiKey) {
            console.log(`Team mode: no x_list_id, falling back to search/recent with ${cleanHandles.length} handles`);
            await fetchCombinedQuery(supabase, xApiKey, cleanHandles.slice(0, 10), cacheKey, now, 50, true);
          }
        } else if (mode === "game") {
          // Game mode is handled above via cached list posts — no API fetch needed
        } else if (xApiKey) {
          await fetchCombinedQuery(supabase, xApiKey, cleanHandles.slice(0, 1), cacheKey, now);
        }
      } catch (apiError) {
        console.error("X API fetch error:", apiError);
      }
    }

    // Post-fetch cleanup for team mode: delete old posts, update refresh timestamp
    if (mode === "team" && team_id && cacheKey) {
      try {
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from("x_feed_cache")
          .delete({ count: 'exact' })
          .eq("cache_key", cacheKey)
          .lt("posted_at", fourteenDaysAgo);
        if (count && count > 0) {
          console.log(`[fetch-x-feed] Cleaned up ${count} posts older than 14 days for ${cacheKey}`);
        }
        await supabase
          .from("teams")
          .update({ x_cache_refreshed_at: new Date().toISOString() })
          .eq("id", team_id);
      } catch (cleanupErr) {
        console.error("[fetch-x-feed] Cleanup error:", cleanupErr);
      }
    }

    const posts = await getCachedPosts(supabase, cacheKey, gameTimeWindow, mode, !!unfiltered);
    return new Response(
      JSON.stringify({ enabled: true, posts, fromCache: false, ...(resultCursor ? { next_cursor: resultCursor } : {}) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-x-feed error:", error);
    return new Response(
      JSON.stringify({ enabled: true, posts: [], error: "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function hasRichMedia(postData: any): boolean {
  const media = postData?.media || [];
  if (media.some((m: any) => ['photo', 'video', 'animated_gif'].includes(m.type))) return true;
  const entities = postData?.entities || [];
  if (entities.some((e: any) => e.title && e.images?.length > 0)) return true;
  return false;
}

/** Matches XFeedPostCard rendering: video/gif thumb, photo, or link preview with image */
function hasRenderableMedia(postData: any): boolean {
  const media = postData?.media || [];
  const hasVideo = media.some((m: any) => (m.type === 'video' || m.type === 'animated_gif') && m.preview_image_url);
  const hasPhoto = media.some((m: any) => m.type === 'photo' && (m.url || m.preview_image_url));
  const entities = postData?.entities || [];
  const hasLinkPreview = entities.some((e: any) => e.title && e.images?.length > 0);
  return hasVideo || hasPhoto || hasLinkPreview;
}

async function fetchCombinedQuery(
  supabase: any,
  xApiKey: string,
  handles: string[],
  cacheKey: string,
  now: string,
  maxResults: number = 10,
  mediaOnly: boolean = false
) {
  const fromClause = handles.map((h) => `from:${h}`).join(" OR ");
  const mediaFilter = mediaOnly ? " has:media" : "";
  const query = encodeURIComponent(`(${fromClause})${mediaFilter} -is:reply`);

  const url = `https://api.x.com/2/tweets/search/recent?query=${query}&max_results=${maxResults}&tweet.fields=created_at,public_metrics,entities,attachments&expansions=author_id,attachments.media_keys&user.fields=profile_image_url,name,username&media.fields=url,preview_image_url,variants,type,duration_ms`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${xApiKey}` },
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`X API error: ${resp.status} ${resp.statusText} | body: ${errBody}`);
    return;
  }

  const xData = await resp.json();
  const tweets = xData.data || [];
  const users = xData.includes?.users || [];
  const mediaItems = xData.includes?.media || [];
  const userMap = new Map(users.map((u: any) => [u.id, u]));
  const mediaMap = new Map(mediaItems.map((m: any) => [m.media_key, m]));

  const rows = tweets.map((tweet: any) => {
    const author = userMap.get(tweet.author_id);
    const handle = author?.username?.toLowerCase() || "";

    // Resolve media attachments
    const mediaKeys: string[] = tweet.attachments?.media_keys || [];
    const media = mediaKeys
      .map((key: string) => mediaMap.get(key))
      .filter(Boolean)
      .map((m: any) => {
        const item: any = {
          url: m.url || null,
          preview_image_url: m.preview_image_url || null,
          type: m.type,
        };
        if ((m.type === 'video' || m.type === 'animated_gif') && m.variants?.length) {
          const url = pickBestMp4(m.variants);
          if (url) item.video_url = url;
        }
        return item;
      });

    return {
      cache_key: cacheKey,
      handle,
      post_id: tweet.id,
      has_video: rowHasVideo(media),
      post_data: {
        text: tweet.text,
        created_at: tweet.created_at,
        public_metrics: tweet.public_metrics,
        media: media.length > 0 ? media : undefined,
        entities: tweet.entities?.urls || undefined,
        author: author
          ? {
              name: author.name,
              username: author.username,
              profile_image_url: author.profile_image_url,
            }
          : { name: handle, username: handle },
      },
      posted_at: tweet.created_at,
      fetched_at: now,
    };
  });

  if (rows.length > 0) {
    await supabase.from("x_feed_cache").upsert(rows, {
      onConflict: "cache_key,post_id",
    });
  }
}

async function fetchUserTimeline(
  supabase: any,
  xApiKey: string,
  xUserId: string,
  cacheKey: string,
  now: string,
  fallbackAuthor?: { name: string; username: string }
) {
  const url = `https://api.x.com/2/users/${xUserId}/tweets?max_results=10&exclude=replies&tweet.fields=created_at,public_metrics,entities&expansions=author_id,attachments.media_keys&media.fields=url,preview_image_url,variants,type,duration_ms&user.fields=profile_image_url,name,username`;

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${xApiKey}` },
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`X Timeline API error: ${resp.status} ${resp.statusText} | body: ${errBody}`);
    return;
  }

  const xData = await resp.json();
  const tweets = xData.data || [];
  const users = xData.includes?.users || [];
  const mediaItems = xData.includes?.media || [];
  const userMap = new Map(users.map((u: any) => [u.id, u]));
  const mediaMap = new Map(mediaItems.map((m: any) => [m.media_key, m]));

  // For timeline, author is the user themselves; find them from includes or use fallback
  const author = users.find((u: any) => u.id === xUserId) || users[0] || null;

  const rows = tweets.map((tweet: any) => {
    const handle = author?.username?.toLowerCase() || "";

    const mediaKeys: string[] = tweet.attachments?.media_keys || [];
    const media = mediaKeys
      .map((key: string) => mediaMap.get(key))
      .filter(Boolean)
      .map((m: any) => {
        const item: any = {
          url: m.url || null,
          preview_image_url: m.preview_image_url || null,
          type: m.type,
        };
        if ((m.type === 'video' || m.type === 'animated_gif') && m.variants?.length) {
          const url = pickBestMp4(m.variants);
          if (url) item.video_url = url;
        }
        return item;
      });

    return {
      cache_key: cacheKey,
      handle,
      post_id: tweet.id,
      has_video: rowHasVideo(media),
      post_data: {
        text: tweet.text,
        created_at: tweet.created_at,
        public_metrics: tweet.public_metrics,
        media: media.length > 0 ? media : undefined,
        entities: tweet.entities?.urls || undefined,
        author: author
          ? {
              name: author.name,
              username: author.username,
              profile_image_url: author.profile_image_url,
            }
          : {
              name: fallbackAuthor?.name || handle,
              username: fallbackAuthor?.username || handle,
            },
      },
      posted_at: tweet.created_at,
      fetched_at: now,
    };
  });

  if (rows.length > 0) {
    await supabase.from("x_feed_cache").upsert(rows, {
      onConflict: "cache_key,post_id",
    });
  }
}

async function fetchAdvancedSearchViaProxy(
  supabase: any,
  apiKey: string,
  handles: string[],
  cacheKey: string,
  now: string,
  maxResults: number = 100,
  initialCursor: string | null = null,
  mediaFilter: string | null = null
): Promise<string | null> {
  // Build combined search query: (from:handle1 OR from:handle2 OR ...) has:media -is:reply
  // When mediaFilter=video, use has:video instead of has:media to get only video posts
  const fromClauses = handles.map((h) => `from:${h}`).join(" OR ");
  const searchQuery = `(${fromClauses}) has:media -is:reply`;
  console.log(`TwitterAPI.io Advanced Search: query length=${searchQuery.length}, handles=${handles.length}, maxResults=${maxResults}`);

  const MAX_PAGES = 5;
  const allTweets: any[] = [];
  let cursor: string | null = initialCursor;
  let pagesLoaded = 0;

  while (allTweets.length < maxResults && pagesLoaded < MAX_PAGES) {
    try {
      const params = new URLSearchParams({
        query: searchQuery,
        queryType: "Latest",
      });
      if (cursor) params.set("cursor", cursor);

      const pageUrl = `https://api.twitterapi.io/twitter/tweet/advanced_search?${params.toString()}`;
      const resp = await fetch(pageUrl, {
        headers: { "X-API-Key": apiKey },
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        if (allTweets.length > 0) {
          console.log(`TwitterAPI.io search page ${pagesLoaded + 1} failed (${resp.status}), stopping. Keeping ${allTweets.length} tweets.`);
          break;
        }
        throw new Error(`TwitterAPI.io search error: ${resp.status} ${resp.statusText} | ${errBody}`);
      }

      const json = await resp.json();
      const tweets = json.tweets || json.data || [];
      pagesLoaded++;

      console.log(`TwitterAPI.io search page ${pagesLoaded}: ${tweets.length} tweets, has_next_page=${json.has_next_page}, cursor=${(json.next_cursor || '').slice(0, 20)}...`);

      allTweets.push(...tweets);

      if (!json.has_next_page || !json.next_cursor || tweets.length === 0) break;
      cursor = json.next_cursor;
    } catch (err) {
      if (allTweets.length > 0) {
        console.log(`TwitterAPI.io search pagination error on page ${pagesLoaded + 1}, keeping ${allTweets.length} tweets: ${err}`);
        break;
      }
      throw err;
    }
  }

  // Deduplicate
  const seenIds = new Set<string>();
  const uniqueTweets = allTweets.filter((t: any) => {
    const id = t.id || t.id_str || t.tweetId;
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
  const tweetsToMap = uniqueTweets.slice(0, maxResults);

  if (tweetsToMap.length > 0) {
    const dates = tweetsToMap.map((t: any) => t.createdAt || t.created_at || '').filter(Boolean).sort();
    const newest = dates[dates.length - 1] || 'unknown';
    console.log(`TwitterAPI.io search: ${tweetsToMap.length} unique tweets across ${pagesLoaded} pages, newest: ${newest}`);
  }

  // Map to cache rows — same format as fetchListTimelineViaProxy
  const rows = tweetsToMap.map((tweet: any) => {
    const author = tweet.author || tweet.user || {};
    const handle = (author.userName || author.username || author.screen_name || "").toLowerCase();

    const media: any[] = [];
    const extMedia = tweet.extendedEntities?.media || tweet.entities?.media || tweet.media || [];
    for (const m of extMedia) {
      const type = m.type === "animated_gif" ? "animated_gif" : m.type === "video" ? "video" : "photo";
      if (type === "video" || type === "animated_gif") {
        console.log(`[video-debug] tweet=${tweet.id || tweet.id_str} handle=${handle} raw_media=`, JSON.stringify(m, null, 2));
      }
      const item: any = {
        url: m.media_url_https || m.media_url || m.url || null,
        preview_image_url: m.media_url_https || m.media_url || m.preview_image_url || null,
        type,
      };
      if ((type === "video" || type === "animated_gif") && m.video_info?.variants?.length) {
        const videoUrl = pickBestMp4(m.video_info.variants);
        if (videoUrl) item.video_url = videoUrl;
      }
      media.push(item);
    }

    const urlEntities = tweet.entities?.urls || [];
    const entities = urlEntities
      .filter((u: any) => u.expanded_url && !u.expanded_url.includes("twitter.com") && !u.expanded_url.includes("x.com"))
      .map((u: any) => ({
        url: u.url,
        expanded_url: u.expanded_url,
        display_url: u.display_url,
        title: u.title || undefined,
        description: u.description || undefined,
        images: u.images || undefined,
      }));

    const metrics = {
      like_count: tweet.likeCount ?? tweet.favorite_count ?? 0,
      retweet_count: tweet.retweetCount ?? tweet.retweet_count ?? 0,
      reply_count: tweet.replyCount ?? tweet.reply_count ?? 0,
      impression_count: tweet.viewCount ?? tweet.impressionCount ?? 0,
    };

    const rawPostedAt = tweet.createdAt || tweet.created_at || now;
    const parsedDate = new Date(rawPostedAt);
    const postedAt = isNaN(parsedDate.getTime()) ? now : parsedDate.toISOString();

    return {
      cache_key: cacheKey,
      handle,
      post_id: tweet.id || tweet.id_str || tweet.tweetId,
      has_video: rowHasVideo(media),
      post_data: {
        text: tweet.text || tweet.full_text || "",
        created_at: postedAt,
        public_metrics: metrics,
        media: media.length > 0 ? media : undefined,
        entities: entities.length > 0 ? entities : undefined,
        author: {
          name: author.name || handle,
          username: author.userName || author.username || author.screen_name || handle,
          profile_image_url: author.profilePicture || author.profileImageUrl || author.profile_image_url_https || author.profile_image_url || undefined,
        },
      },
      posted_at: postedAt,
      fetched_at: now,
    };
  });

  console.log(`TwitterAPI.io search: mapped ${rows.length} tweets`);

  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("x_feed_cache").upsert(rows, {
      onConflict: "cache_key,post_id",
    });
    if (upsertError) {
      console.error(`TwitterAPI.io search upsert failed: ${upsertError.message}`, upsertError);
    } else {
      console.log(`TwitterAPI.io search: upserted ${rows.length} rows to cache`);
    }
  }

  return cursor;
}

async function fetchListTimelineViaProxy(
  supabase: any,
  apiKey: string,
  listId: string,
  cacheKey: string,
  now: string,
  maxResults: number = 50
) {
  const MAX_PAGES = 3;
  const allTweets: any[] = [];
  let cursor: string | null = null;
  let pagesLoaded = 0;

  while (allTweets.length < maxResults && pagesLoaded < MAX_PAGES) {
    try {
      const pageUrl = `https://api.twitterapi.io/twitter/list/tweets?listId=${listId}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const resp = await fetch(pageUrl, {
        headers: { "X-API-Key": apiKey },
      });

      if (!resp.ok) {
        const errBody = await resp.text();
        // If we already have tweets from a previous page, don't throw — just stop paginating
        if (allTweets.length > 0) {
          console.log(`TwitterAPI.io page ${pagesLoaded + 1} failed (${resp.status}), stopping pagination. Keeping ${allTweets.length} tweets from previous pages.`);
          break;
        }
        throw new Error(`TwitterAPI.io error: ${resp.status} ${resp.statusText} | ${errBody}`);
      }

      const json = await resp.json();
      const tweets = json.tweets || json.data || [];
      pagesLoaded++;

      console.log(`TwitterAPI.io page ${pagesLoaded}: ${tweets.length} tweets, has_next_page=${json.has_next_page}, cursor=${(json.next_cursor || '').slice(0, 20)}...`);

      allTweets.push(...tweets);

      if (!json.has_next_page || !json.next_cursor || tweets.length === 0) break;
      cursor = json.next_cursor;
    } catch (err) {
      // If we collected tweets from earlier pages, preserve them instead of throwing
      if (allTweets.length > 0) {
        console.log(`TwitterAPI.io pagination error on page ${pagesLoaded + 1}, keeping ${allTweets.length} tweets: ${err}`);
        break;
      }
      throw err;
    }
  }

  // Deduplicate tweets by ID (pagination can return overlapping results)
  const seenIds = new Set<string>();
  const uniqueTweets = allTweets.filter((t: any) => {
    const id = t.id || t.id_str || t.tweetId;
    if (!id || seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
  const tweetsToMap = uniqueTweets.slice(0, maxResults);

  // Log newest date for freshness debugging
  if (tweetsToMap.length > 0) {
    const dates = tweetsToMap.map((t: any) => t.createdAt || t.created_at || '').filter(Boolean).sort();
    const newest = dates[dates.length - 1] || 'unknown';
    console.log(`TwitterAPI.io: ${tweetsToMap.length} total tweets fetched across ${pagesLoaded} pages, newest: ${newest}`);
  }

  const rows = tweetsToMap.map((tweet: any) => {
    const author = tweet.author || tweet.user || {};
    const handle = (author.userName || author.username || author.screen_name || "").toLowerCase();

    // Extract media
    const media: any[] = [];
    const extMedia = tweet.extendedEntities?.media || tweet.entities?.media || tweet.media || [];
    for (const m of extMedia) {
      const type = m.type === "animated_gif" ? "animated_gif" : m.type === "video" ? "video" : "photo";
      const item: any = {
        url: m.media_url_https || m.media_url || m.url || null,
        preview_image_url: m.media_url_https || m.media_url || m.preview_image_url || null,
        type,
      };
      if ((type === "video" || type === "animated_gif") && m.video_info?.variants?.length) {
        const videoUrl = pickBestMp4(m.video_info.variants);
        if (videoUrl) item.video_url = videoUrl;
      }
      media.push(item);
    }

    // Extract link previews from URLs
    const urlEntities = tweet.entities?.urls || [];
    const entities = urlEntities
      .filter((u: any) => u.expanded_url && !u.expanded_url.includes("twitter.com") && !u.expanded_url.includes("x.com"))
      .map((u: any) => ({
        url: u.url,
        expanded_url: u.expanded_url,
        display_url: u.display_url,
        title: u.title || undefined,
        description: u.description || undefined,
        images: u.images || undefined,
      }));

    // Metrics
    const metrics = {
      like_count: tweet.likeCount ?? tweet.favorite_count ?? 0,
      retweet_count: tweet.retweetCount ?? tweet.retweet_count ?? 0,
      reply_count: tweet.replyCount ?? tweet.reply_count ?? 0,
      impression_count: tweet.viewCount ?? tweet.impressionCount ?? 0,
    };

    const rawPostedAt = tweet.createdAt || tweet.created_at || now;
    // TwitterAPI.io returns dates like "Mon Mar 23 19:10:09 +0000 2026" — convert to ISO
    const parsedDate = new Date(rawPostedAt);
    const postedAt = isNaN(parsedDate.getTime()) ? now : parsedDate.toISOString();

    return {
      cache_key: cacheKey,
      handle,
      post_id: tweet.id || tweet.id_str || tweet.tweetId,
      has_video: rowHasVideo(media),
      post_data: {
        text: tweet.text || tweet.full_text || "",
        created_at: postedAt,
        public_metrics: metrics,
        media: media.length > 0 ? media : undefined,
        entities: entities.length > 0 ? entities : undefined,
        author: {
          name: author.name || handle,
          username: author.userName || author.username || author.screen_name || handle,
          profile_image_url: author.profilePicture || author.profileImageUrl || author.profile_image_url_https || author.profile_image_url || undefined,
        },
      },
      posted_at: postedAt,
      fetched_at: now,
    };
  });

  console.log(`TwitterAPI.io: mapped ${rows.length} tweets for list ${listId}`);

  if (rows.length > 0) {
    const { error: upsertError } = await supabase.from("x_feed_cache").upsert(rows, {
      onConflict: "cache_key,post_id",
    });
    if (upsertError) {
      console.error(`TwitterAPI.io upsert failed: ${upsertError.message}`, upsertError);
    } else {
      console.log(`TwitterAPI.io: upserted ${rows.length} rows to cache`);
    }
  }
}

async function fetchListTimeline(
  supabase: any,
  creds: OAuthCreds,
  listId: string,
  cacheKey: string,
  now: string,
  maxResults: number = 50
) {
  const baseUrl = `https://api.x.com/2/lists/${listId}/tweets`;
  const queryParams: Record<string, string> = {
    max_results: String(maxResults),
    "tweet.fields": "created_at,public_metrics,entities,attachments",
    expansions: "author_id,attachments.media_keys",
    "user.fields": "profile_image_url,name,username",
    "media.fields": "url,preview_image_url,variants,type,duration_ms",
  };

  const authHeader = await buildOAuthHeader("GET", baseUrl, queryParams, creds);
  const qs = Object.entries(queryParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const resp = await fetch(`${baseUrl}?${qs}`, {
    headers: { Authorization: authHeader },
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`X List Timeline API error: ${resp.status} ${resp.statusText} | body: ${errBody}`);
    return;
  }

  const xData = await resp.json();
  const tweets = xData.data || [];
  const users = xData.includes?.users || [];
  const mediaItems = xData.includes?.media || [];
  const userMap = new Map(users.map((u: any) => [u.id, u]));
  const mediaMap = new Map(mediaItems.map((m: any) => [m.media_key, m]));

  const rows = tweets.map((tweet: any) => {
    const author = userMap.get(tweet.author_id);
    const handle = author?.username?.toLowerCase() || "";

    const mediaKeys: string[] = tweet.attachments?.media_keys || [];
    const media = mediaKeys
      .map((key: string) => mediaMap.get(key))
      .filter(Boolean)
      .map((m: any) => {
        const item: any = {
          url: m.url || null,
          preview_image_url: m.preview_image_url || null,
          type: m.type,
        };
        if ((m.type === 'video' || m.type === 'animated_gif') && m.variants?.length) {
          const url = pickBestMp4(m.variants);
          if (url) item.video_url = url;
        }
        return item;
      });

    return {
      cache_key: cacheKey,
      handle,
      post_id: tweet.id,
      has_video: rowHasVideo(media),
      post_data: {
        text: tweet.text,
        created_at: tweet.created_at,
        public_metrics: tweet.public_metrics,
        media: media.length > 0 ? media : undefined,
        entities: tweet.entities?.urls || undefined,
        author: author
          ? {
              name: author.name,
              username: author.username,
              profile_image_url: author.profile_image_url,
            }
          : { name: handle, username: handle },
      },
      posted_at: tweet.created_at,
      fetched_at: now,
    };
  });

  if (rows.length > 0) {
    await supabase.from("x_feed_cache").upsert(rows, {
      onConflict: "cache_key,post_id",
    });
  }
}

async function getCachedPosts(
  supabase: any,
  cacheKey: string,
  timeWindow: { start: Date; end: Date } | null,
  mode: string,
  unfiltered: boolean = false
) {
  const limit = unfiltered ? 150 : mode === "home" ? 20 : mode === "team" ? 5 : mode === "game" ? 15 : 10;
  // Fetch larger buffer to allow media-richness sorting
  const fetchLimit = mode === "player" ? limit : mode === "team" ? 150 : 50;

  // Prefer posts refreshed in last 4 hours (fresh CDN URLs), but fall back to any cached posts
  const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("x_feed_cache")
    .select("post_id, handle, post_data, posted_at, fetched_at")
    .eq("cache_key", cacheKey)
    .gte("fetched_at", fourHoursAgo)
    .order("posted_at", { ascending: false })
    .limit(fetchLimit);

  if (timeWindow) {
    query = query
      .gte("posted_at", timeWindow.start.toISOString())
      .lte("posted_at", timeWindow.end.toISOString());
  }

  let { data } = await query;

  // Fallback: if no fresh posts, serve stale cached posts (images still work, videos may not)
  if (!data || data.length === 0) {
    console.log(`[getCachedPosts] No fresh posts for ${cacheKey}, falling back to stale cache`);
    let fallbackQuery = supabase
      .from("x_feed_cache")
      .select("post_id, handle, post_data, posted_at, fetched_at")
      .eq("cache_key", cacheKey)
      .order("posted_at", { ascending: false })
      .limit(fetchLimit);

    if (timeWindow) {
      fallbackQuery = fallbackQuery
        .gte("posted_at", timeWindow.start.toISOString())
        .lte("posted_at", timeWindow.end.toISOString());
    }

    const fallbackResult = await fallbackQuery;
    data = fallbackResult.data;
  }
  const allRows = (data || []).map((row: any) => ({
    id: row.post_id,
    handle: row.handle,
    text: row.post_data?.text || "",
    created_at: row.posted_at,
    public_metrics: row.post_data?.public_metrics || {},
    media: row.post_data?.media || [],
    entities: row.post_data?.entities || [],
    author: row.post_data?.author || { name: row.handle, username: row.handle },
    _postData: row.post_data,
  }));

  // Filter to posts with client-renderable media (video thumb, photo, or link preview)
  // When unfiltered=true, skip the media filter to return all posts
  const rows = (mode === "player" || unfiltered) ? allRows : allRows.filter((r: any) => hasRenderableMedia(r._postData));

  if (mode === "player") {
    return rows.slice(0, limit).map(({ _postData, ...rest }: any) => rest);
  }

  if (mode === "home") {
    // Two-pass variety logic: cap each handle at 2 posts, then backfill
    const handleCount = new Map<string, number>();
    const pass1: any[] = [];
    const skipped: any[] = [];

    for (const row of rows) {
      const count = handleCount.get(row.handle) || 0;
      if (count < 2) {
        pass1.push(row);
        handleCount.set(row.handle, count + 1);
      } else {
        skipped.push(row);
      }
    }

    // Pass 2: backfill if under limit
    const result = [...pass1];
    if (result.length < limit) {
      for (const row of skipped) {
        if (result.length >= limit) break;
        result.push(row);
      }
    }

    return result.slice(0, limit).map(({ _postData, ...rest }: any) => rest);
  }

  // Three-tier sorting for team mode; two-tier for game/show
  if (mode === "team") {
    const tierVideo: any[] = [];
    const tierPhoto: any[] = [];
    const tierLink: any[] = [];
    for (const row of rows) {
      const media = row._postData?.media || [];
      const hasVideoOrGif = media.some((m: any) => (m.type === 'video' || m.type === 'animated_gif') && m.preview_image_url);
      const hasPhoto = media.some((m: any) => m.type === 'photo' && (m.url || m.preview_image_url));
      if (hasVideoOrGif) {
        tierVideo.push(row);
      } else if (hasPhoto) {
        tierPhoto.push(row);
      } else {
        tierLink.push(row);
      }
    }
    const sorted = [...tierVideo, ...tierPhoto, ...tierLink].slice(0, limit);
    return sorted.map(({ _postData, ...rest }: any) => rest);
  }

  // Three-tier sorting for game/show: video → photo → link preview
  if (mode === "game" || mode === "show") {
    const tierVideo: any[] = [];
    const tierPhoto: any[] = [];
    const tierLink: any[] = [];
    for (const row of rows) {
      const media = row._postData?.media || [];
      const hasVideoOrGif = media.some((m: any) => (m.type === 'video' || m.type === 'animated_gif') && m.preview_image_url);
      const hasPhotoMedia = media.some((m: any) => m.type === 'photo' && (m.url || m.preview_image_url));
      if (hasVideoOrGif) {
        tierVideo.push(row);
      } else if (hasPhotoMedia) {
        tierPhoto.push(row);
      } else {
        tierLink.push(row);
      }
    }
    const sorted = [...tierVideo, ...tierPhoto, ...tierLink].slice(0, limit);
    return sorted.map(({ _postData, ...rest }: any) => rest);
  }

  // Fallback: media-richness tiered sorting
  const tier1: any[] = [];
  const tier2: any[] = [];
  for (const row of rows) {
    if (hasRichMedia(row._postData)) {
      tier1.push(row);
    } else {
      tier2.push(row);
    }
  }

  const sorted = [...tier1, ...tier2].slice(0, limit);
  return sorted.map(({ _postData, ...rest }: any) => rest);
}
