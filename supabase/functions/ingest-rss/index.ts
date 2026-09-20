import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  MAX_EPISODES, LARGE_XML_THRESHOLD, LARGE_FEED_PRETRUNCATE_THRESHOLD, ERROR_SNIPPET_LEN,
  nowIso, normalizeUrl, safeStr, extractTextNode, extractGuidText,
  safeDateToIso, parseItunesDuration, sha256Hex,
  detectFeedType, truncateRssToFirstNItems, truncateAtomToFirstNEntries,
  makeXmlParser, asArray,
  extractOwnerEmail, extractRssShow, extractRssItems,
  extractAtomFeed, extractAtomEntries, pickAtomEnclosure,
  parseHostNames, calculateFetchTier,
  extractHubFromXml, extractHubFromHeaders, extractCanonicalFromPodroll,
  extractSelfUrl,
} from "../_shared/rss-parser.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Syndication dupe detection helpers ──

/** Normalize a title for syndication dupe matching:
 *  - trim, lowercase
 *  - strip show-name suffixes after " | " or " - " */
function normalizeTitleForDupe(title: string, showTitle?: string | null): string {
  let t = title.trim().toLowerCase();
  const showLower = showTitle?.trim().toLowerCase();
  if (showLower) {
    // Strip " | Show Name" or " - Show Name" suffixes
    for (const sep of [' | ', ' - ']) {
      const idx = t.lastIndexOf(sep);
      if (idx > 0) {
        const suffix = t.substring(idx + sep.length).trim();
        if (suffix === showLower || showLower.includes(suffix) || suffix.includes(showLower)) {
          t = t.substring(0, idx).trim();
        }
      }
    }
  }
  return t;
}

/** Check if a new episode is a syndication dupe of an existing episode.
 *  Match: same normalized title, different show, published within 24h.
 *  Duration is extra confirmation (±60s) but not required if either is null. */
async function checkSyndicationDupe(
  supabase: any, title: string, showId: string,
  publishedAt: string | null, durationSeconds: number | null,
  showTitle: string | null
): Promise<{ isDupe: boolean; sourceEpisodeId?: string; sourceTagged?: boolean }> {
  if (!publishedAt) return { isDupe: false };
  const normalizedTitle = normalizeTitleForDupe(title, showTitle);
  if (normalizedTitle.length < 10) return { isDupe: false }; // Too short = high false positive risk

  const pubDate = new Date(publishedAt);
  const windowStart = new Date(pubDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(pubDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // Find candidates: different show, published within 24h window, not itself a dupe
  const { data: candidates } = await supabase
    .from('episodes')
    .select('id, title, duration_seconds, show_id, tags_extracted_at, shows!inner(title)')
    .neq('show_id', showId)
    .eq('is_syndication_dupe', false)
    .gte('published_at', windowStart)
    .lte('published_at', windowEnd)
    .limit(20);

  if (!candidates?.length) return { isDupe: false };

  for (const candidate of candidates) {
    const candidateShowTitle = (candidate as any).shows?.title ?? null;
    const candidateNormalized = normalizeTitleForDupe(candidate.title, candidateShowTitle);
    if (candidateNormalized !== normalizedTitle) continue;

    // Title matches. Check duration if both have it.
    if (durationSeconds != null && candidate.duration_seconds != null) {
      if (Math.abs(durationSeconds - candidate.duration_seconds) > 60) continue;
    }
    // Duration check passed (or skipped because one/both are null)

    return {
      isDupe: true,
      sourceEpisodeId: candidate.id,
      sourceTagged: !!candidate.tags_extracted_at,
    };
  }

  return { isDupe: false };
}

/** Copy AI metadata from original episode to dupe episode */
async function copySyndicationMetadata(supabase: any, sourceEpisodeId: string, dupeEpisodeId: string): Promise<void> {
  // 1. Copy extracted_tags and processing timestamps from source
  const { data: source } = await supabase
    .from('episodes')
    .select('extracted_tags, tags_extracted_at, signals_extracted_at, stories_extracted_at, speakers_extracted_at')
    .eq('id', sourceEpisodeId)
    .single();

  if (source) {
    await supabase.from('episodes').update({
      extracted_tags: source.extracted_tags,
      tags_extracted_at: source.tags_extracted_at,
      signals_extracted_at: source.signals_extracted_at,
      stories_extracted_at: source.stories_extracted_at,
      speakers_extracted_at: source.speakers_extracted_at,
      pending_syndication_copy: false,
    }).eq('id', dupeEpisodeId);
  }

  // 2. Copy player_episodes
  const { data: playerEps } = await supabase
    .from('player_episodes')
    .select('player_id, mention_type, confidence, source_text')
    .eq('episode_id', sourceEpisodeId);

  if (playerEps?.length) {
    await supabase.from('player_episodes').upsert(
      playerEps.map((pe: any) => ({ ...pe, episode_id: dupeEpisodeId })),
      { onConflict: 'player_id,episode_id' }
    );
  }

  // 3. Copy episode_stories
  const { data: storyLinks } = await supabase
    .from('episode_stories')
    .select('story_id, relevance')
    .eq('episode_id', sourceEpisodeId);

  if (storyLinks?.length) {
    await supabase.from('episode_stories').upsert(
      storyLinks.map((es: any) => ({ ...es, episode_id: dupeEpisodeId })),
      { onConflict: 'episode_id,story_id' }
    );
  }

  // 4. Copy episode_signals
  const { data: signals } = await supabase
    .from('episode_signals')
    .select('signal_id, match_snippet')
    .eq('episode_id', sourceEpisodeId);

  if (signals?.length) {
    await supabase.from('episode_signals').upsert(
      signals.map((es: any) => ({ ...es, episode_id: dupeEpisodeId })),
      { onConflict: 'episode_id,signal_id' }
    );
  }

  console.log(`[syndication] Copied metadata from ${sourceEpisodeId} → ${dupeEpisodeId} (players=${playerEps?.length ?? 0}, stories=${storyLinks?.length ?? 0}, signals=${signals?.length ?? 0})`);
}

// ── Artwork caching helpers ──

async function computeHash(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function cacheShowArtwork(
  supabase: any, showId: string, artworkUrl: string | null,
  existingHash: string | null, existingCachedAt: string | null
): Promise<void> {
  if (!artworkUrl) return;
  // Skip if cached less than 30 days ago
  if (existingCachedAt) {
    const cachedAge = Date.now() - new Date(existingCachedAt).getTime();
    if (cachedAge < 30 * 24 * 60 * 60 * 1000) return;
  }
  const resp = await fetch(artworkUrl);
  if (!resp.ok) throw new Error(`Fetch artwork failed: ${resp.status}`);
  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) throw new Error(`Not an image: ${contentType}`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024) throw new Error(`Artwork too large: ${bytes.length}`);
  const hash = await computeHash(bytes);
  if (hash === existingHash) return; // No change
  const path = `shows/${showId}.webp`;
  const { error: uploadErr } = await supabase.storage
    .from('podcast-artwork')
    .upload(path, bytes, { contentType, upsert: true });
  if (uploadErr) throw uploadErr;
  await supabase.from('shows').update({
    artwork_storage_path: path,
    artwork_cached_at: new Date().toISOString(),
    artwork_content_hash: hash,
  }).eq('id', showId);
}

async function cacheEpisodeArtwork(
  supabase: any, episodeId: string, artworkUrl: string | null,
  showContentHash: string | null
): Promise<void> {
  if (!artworkUrl) return;
  const resp = await fetch(artworkUrl);
  if (!resp.ok) throw new Error(`Fetch artwork failed: ${resp.status}`);
  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    await supabase.from('episodes').update({ artwork_cache_failed_at: new Date().toISOString() }).eq('id', episodeId);
    return;
  }
  const bytes = new Uint8Array(await resp.arrayBuffer());
  if (bytes.length > 5 * 1024 * 1024) {
    await supabase.from('episodes').update({ artwork_cache_failed_at: new Date().toISOString() }).eq('id', episodeId);
    return;
  }
  const hash = await computeHash(bytes);
  // Dedup: if episode art matches show art, just store hash (no upload)
  if (hash === showContentHash) {
    await supabase.from('episodes').update({ artwork_content_hash: hash }).eq('id', episodeId);
    return;
  }
  // Unique episode artwork — upload
  const path = `episodes/${episodeId}.webp`;
  const { error: uploadErr } = await supabase.storage
    .from('podcast-artwork')
    .upload(path, bytes, { contentType, upsert: true });
  if (uploadErr) throw uploadErr;
  await supabase.from('episodes').update({
    artwork_storage_path: path,
    artwork_content_hash: hash,
  }).eq('id', episodeId);
}

// ── Schedule-aware next_fetch_at computation ──
// Uses calculateFetchTier's intervalHours + publish pattern + WebSub to compute
// when this source should next be fetched. This is the ONLY place next_fetch_at is set on success.
function computeScheduleAwareNextFetch(src: {
  fetch_interval_hours?: number | null;
  publish_pattern?: string | null;
  publish_days?: number[] | null;
  publish_hour_start?: number | null;
  publish_hour_end?: number | null;
  websub_subscribed_at?: string | null;
  websub_expires_at?: string | null;
}): string {
  const now = new Date();
  const intervalHours = src.fetch_interval_hours ?? 4;

  // WebSub-active sources use 12h safety-net fallback (matches ingest-rss-cron logic)
  const hasActiveWebSub = src.websub_subscribed_at && src.websub_expires_at && new Date(src.websub_expires_at) > now;
  const effectiveInterval = hasActiveWebSub ? Math.max(intervalHours, 12) : intervalHours;

  let nextFetch = new Date(now.getTime() + effectiveInterval * 60 * 60 * 1000);

  // Weekday shows: if next fetch lands on weekend, push to Monday
  if (src.publish_pattern === 'weekdays') {
    const dow = nextFetch.getUTCDay();
    if (dow === 6) nextFetch = new Date(nextFetch.getTime() + 2 * 24 * 60 * 60 * 1000); // Sat → Mon
    else if (dow === 0) nextFetch = new Date(nextFetch.getTime() + 1 * 24 * 60 * 60 * 1000); // Sun → Mon
  }

  // Weekly shows: if next fetch doesn't land on a publish day, advance to next publish day
  if (src.publish_pattern === 'weekly' && src.publish_days?.length) {
    const targetDow = nextFetch.getUTCDay();
    if (!src.publish_days.includes(targetDow)) {
      for (let i = 1; i <= 7; i++) {
        const candidateDow = (targetDow + i) % 7;
        if (src.publish_days.includes(candidateDow)) {
          nextFetch = new Date(nextFetch.getTime() + i * 24 * 60 * 60 * 1000);
          break;
        }
      }
    }
  }

  // Hour window: if next fetch is before the publish window, push to window start
  if (src.publish_hour_start !== null && src.publish_hour_start !== undefined) {
    const windowStart = Math.max(0, src.publish_hour_start - 1); // -1h buffer
    const nextHour = nextFetch.getUTCHours();
    if (nextHour < windowStart) {
      nextFetch.setUTCHours(windowStart, 0, 0, 0);
    }
  }

  return nextFetch.toISOString();
}

type Body = { 
  mode?: "single" | "batch"; 
  source_id?: string; 
  source_ids?: string[]; // Array of source IDs from cron - bypasses cursor pagination
  limit?: number; 
  pending_only?: boolean; // Only fetch sources never fetched or with errors
  rssUrl?: string;
  sourceId?: string; 
  defaultSpecialtySlug?: string;
  // Category fields
  pillarId?: string;
  subtopicIds?: string[];
  format?: string;
  audienceLevel?: string;
};

type SourceRow = {
  id: string;
  rss_url: string;
  title: string | null;
  publisher: string | null;
  artwork_url: string | null;
  apple_podcast_id: number | null;
  apple_url: string | null;
  active: boolean;
  pillar_id: string | null;
  subtopic_ids: string[] | null;
  format: string | null;
  audience_level: string | null;
  // ETag/304 support
  etag: string | null;
  last_modified_header: string | null;
  // Tiering
  fetch_interval_hours: number | null;
  last_fetch_at: string | null;
  // WebSub hub detection
  websub_hub_url: string | null;
};

// All RSS parsing functions (nowIso, normalizeUrl, safeStr, extractTextNode, extractGuidText,
// safeDateToIso, parseItunesDuration, sha256Hex, detectFeedType, truncateRssToFirstNItems,
// truncateAtomToFirstNEntries, makeXmlParser, firstArray, asArray, extractOwnerEmail,
// extractRssShow, extractRssItems, extractAtomFeed, extractAtomEntries, pickAtomEnclosure,
// calculateFetchTier) are imported from ../_shared/rss-parser.ts

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const start = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const body: Body = await req.json().catch(() => ({}));

    // Support both old API (rssUrl, sourceId) and new API (mode, source_id)
    const legacyRssUrl = body.rssUrl;
    const legacySourceId = body.sourceId;
    const legacySpecialty = body.defaultSpecialtySlug;
    
    // Category fields
    const pillarId = body.pillarId;
    const subtopicIds = body.subtopicIds;
    const format = body.format;
    const audienceLevel = body.audienceLevel;

    // If legacy mode (single rssUrl passed directly)
    if (legacyRssUrl) {
      return await handleLegacySingleFeed(
        supabase, 
        legacyRssUrl, 
        legacySourceId, 
        legacySpecialty, 
        start,
        { pillarId, subtopicIds, format, audienceLevel }
      );
    }

    // ── Job queue mode: pg_cron worker calls with empty body ──
    // Claims jobs from rss_fetch_jobs, processes each source, updates job status,
    // writes cron log, triggers AI enrichment. No self-chaining.
    if (!body.mode && !body.source_id && !body.source_ids?.length) {
      console.log('[ingest-rss] Job queue mode: claiming jobs...');
      const { data: jobs, error: claimErr } = await supabase.rpc('rss_claim_jobs', { p_limit: 10 });
      if (claimErr) throw claimErr;
      if (!jobs?.length) {
        return new Response(JSON.stringify({ ok: true, message: 'No jobs to process' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[ingest-rss] Claimed ${jobs.length} jobs`);

      // Fetch full source rows including schedule fields
      const jobSourceIds = jobs.map((j: any) => j.source_id);
      const { data: jobSourcesArr } = await supabase
        .from('pv_podcast_sources')
        .select('id,rss_url,title,publisher,artwork_url,apple_podcast_id,apple_url,active,pillar_id,subtopic_ids,format,audience_level,etag,last_modified_header,fetch_interval_hours,last_fetch_at,websub_hub_url,publish_pattern,publish_days,publish_hour_start,publish_hour_end,websub_subscribed_at,websub_expires_at,failure_count')
        .in('id', jobSourceIds);
      const jobSourceById = new Map((jobSourcesArr ?? []).map((s: any) => [s.id, s]));

      // Create cron log entry
      const { data: cronLogEntry } = await supabase.from('rss_cron_logs').insert({
        started_at: new Date().toISOString(),
        status: 'running',
        total_active_sources: jobs.length,
        sources_eligible: jobs.length,
      }).select('id').single();
      const cronLogId = cronLogEntry?.id;

      // processOneSource is defined below in the main handler as a closure.
      // Rather than duplicating it, we set body fields so the existing batch flow
      // handles processing, then intercept results in post-processing.

      // Actually: set body fields so the existing batch flow handles processing
      body.mode = 'batch';
      body.source_ids = jobSourceIds;

      // Store job queue context for post-processing after main loop
      (body as any)._jobQueueJobs = jobs;
      (body as any)._jobQueueCronLogId = cronLogId;
      (body as any)._jobQueueSourceMap = jobSourceById;
    }

    const mode = body.mode ?? "single";
    const sourceId = body.source_id;
    const limit = Math.min(Math.max(body.limit ?? 25, 1), 500);
    const pendingOnly = body.pending_only ?? false;

    let sources: SourceRow[] = [];
    let syncState: { last_source_id: string | null; sources_in_current_cycle: number } | null = null;
    
    if (mode === "single") {
      if (!sourceId) {
        return new Response(JSON.stringify({ ok: false, error: "source_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data, error } = await supabase
        .from("pv_podcast_sources")
        .select("id,rss_url,title,publisher,artwork_url,apple_podcast_id,apple_url,active,pillar_id,subtopic_ids,format,audience_level,etag,last_modified_header,fetch_interval_hours,last_fetch_at,websub_hub_url")
        .eq("id", sourceId)
        .eq("active", true)
        .limit(1);
      if (error) throw error;
      sources = (data ?? []) as SourceRow[];
    } else {
      // Batch mode
      const sourceIds = body.source_ids;
      
      // If source_ids provided (from cron), fetch those specific sources directly
      if (sourceIds && sourceIds.length > 0) {
        console.log(`[ingest-rss] Batch mode: fetching ${sourceIds.length} specific sources from cron`);
        
        const { data, error } = await supabase
          .from("pv_podcast_sources")
           .select("id,rss_url,title,publisher,artwork_url,apple_podcast_id,apple_url,active,pillar_id,subtopic_ids,format,audience_level,etag,last_modified_header,fetch_interval_hours,last_fetch_at,websub_hub_url")
          .in("id", sourceIds)
          .eq("active", true);
        if (error) throw error;
        sources = (data ?? []) as SourceRow[];
        console.log(`[ingest-rss] Found ${sources.length} active sources from ${sourceIds.length} requested IDs`);
      } else {
        // Fallback: cursor-based pagination (for manual/legacy calls)
        console.log(`[ingest-rss] Batch mode: pending_only=${pendingOnly}, limit=${limit}, using cursor pagination with tiering`);
        
        // Get last cursor from sync state
        const { data: syncData } = await supabase
          .from("rss_sync_state")
          .select("last_source_id, sources_in_current_cycle")
          .eq("id", "main")
          .single();
        
        syncState = syncData;
        
        let query = supabase
          .from("pv_podcast_sources")
          .select("id,rss_url,title,publisher,artwork_url,apple_podcast_id,apple_url,active,pillar_id,subtopic_ids,format,audience_level,etag,last_modified_header,fetch_interval_hours,last_fetch_at,websub_hub_url")
          .eq("active", true)
          .order("id", { ascending: true });
        
        if (syncState?.last_source_id) {
          query = query.gt("id", syncState.last_source_id);
          console.log(`[ingest-rss] Resuming from cursor: ${syncState.last_source_id}`);
        }
        
        if (pendingOnly) {
          query = query.or('last_fetch_at.is.null,last_fetch_status.eq.error');
        }
        
        const { data, error } = await query.limit(limit);
        if (error) throw error;
        
        const allSources = (data ?? []) as SourceRow[];
        sources = allSources.filter(src => {
          if (!src.last_fetch_at) return true;
          const lastFetch = new Date(src.last_fetch_at);
          const intervalHours = src.fetch_interval_hours ?? 4;
          const nextFetchAt = new Date(lastFetch.getTime() + intervalHours * 60 * 60 * 1000);
          return new Date() >= nextFetchAt;
        });
        
        console.log(`[ingest-rss] Tiering filter: ${allSources.length} total sources, ${sources.length} due for fetch`);
        
        if (sources.length === 0 && syncState?.last_source_id) {
          console.log(`[ingest-rss] Cycle complete! Processed ${syncState.sources_in_current_cycle} sources total. Resetting cursor.`);
          await supabase
            .from("rss_sync_state")
            .update({ 
              last_source_id: null, 
              sources_in_current_cycle: 0,
              cycle_started_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq("id", "main");
          
          const { data: freshData } = await supabase
            .from("pv_podcast_sources")
            .select("id,rss_url,title,publisher,artwork_url,apple_podcast_id,apple_url,active,pillar_id,subtopic_ids,format,audience_level,etag,last_modified_header,fetch_interval_hours,last_fetch_at,websub_hub_url")
            .eq("active", true)
            .order("id", { ascending: true })
            .limit(limit);
          sources = (freshData ?? []) as SourceRow[];
          syncState = { last_source_id: null, sources_in_current_cycle: 0 };
        }
      }
    }

    let totalCreated = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    const errorDetails: { source_id: string; title: string; error: string }[] = [];
    // Keep results lightweight to reduce memory pressure (was causing WORKER_LIMIT at ~60 sources)
    const results: any[] = [];

    // ---- Sequential processing with circuit breaker ----
    // NOTE: Concurrency 3-5 caused Error 546 WORKER_LIMIT (compute exhaustion from parallel XML parsing).
    // Sequential processing is reliable. Circuit breaker prevents wasting time on cascading failures.
    const CIRCUIT_BREAKER_THRESHOLD = 3; // Abort if 3+ consecutive failures
    const CIRCUIT_BREAKER_WINDOW = 5; // Track failures in rolling window of 5
    let abortReason: string | null = null;
    let sourcesAttempted = 0;

    // Process a single source - returns structured result
    // Creates its own parser instance to avoid memory accumulation across sources
    async function processOneSource(src: any): Promise<{
      ok: boolean;
      result: any;
      created: number;
      updated: number;
      errorDetail?: { source_id: string; title: string; error: string };
    }> {
      const parser = makeXmlParser(); // Fresh parser per source to avoid memory buildup
      const rssUrl = normalizeUrl(src.rss_url);
      let httpStatus: number | null = null;
      const logBase = { source_id: src.id, rss_url: rssUrl, fetched_at: nowIso() };

      try {
        const f0 = Date.now();

        // Build headers with conditional GET support (ETag/304)
        const fetchHeaders: Record<string, string> = {
          "User-Agent": "GameVoicesRSSIngest/3.0",
          "Accept": "application/xml, text/xml, */*"
        };
        if (src.etag) fetchHeaders["If-None-Match"] = src.etag;
        if (src.last_modified_header) fetchHeaders["If-Modified-Since"] = src.last_modified_header;

        const resp = await fetch(rssUrl, { headers: fetchHeaders });
        httpStatus = resp.status;

        // Detect permanent redirects and auto-update stored URL
        if (resp.redirected && resp.url !== rssUrl) {
          console.log(`[ingest] Redirect detected: ${rssUrl} → ${resp.url}`);
          await supabase.from('pv_podcast_sources')
            .update({ rss_url: resp.url })
            .eq('id', src.id);
        }

        // Handle 304 Not Modified
        if (httpStatus === 304) {
          console.log(`[ingest] src=${src.id} 304 Not Modified (${Date.now() - f0}ms)`);
          await supabase.from("pv_podcast_sources").update({
            last_fetch_at: nowIso(),
            last_fetch_status: "not_modified",
            last_fetch_message: "304 Not Modified"
          }).eq("id", src.id);
          return { ok: true, created: 0, updated: 0, result: { source_id: src.id, ok: true, stage: "skipped_304", http_status: 304 } };
        }

        const xml = await resp.text();
        const f1 = Date.now();
        const rawLen = xml.length;
        const feedType = detectFeedType(xml);
        console.log(`[ingest] src=${src.id} status=${httpStatus} ms_fetch=${f1 - f0} len=${rawLen} type=${feedType}`);

        // Auto-detect WebSub hub if not already known
        if (!src.websub_hub_url) {
          try {
            const hubFromHeader = extractHubFromHeaders(resp.headers);
            const hubFromXml = hubFromHeader ? null : extractHubFromXml(xml.substring(0, 5000));
            const detectedHub = hubFromHeader || hubFromXml;

            if (detectedHub) {
              const hubUpdate: Record<string, any> = { websub_hub_url: detectedHub };
              const canonical = extractCanonicalFromPodroll(src.rss_url);
              if (canonical) hubUpdate.websub_topic_url = canonical;

              await supabase.from('pv_podcast_sources').update(hubUpdate).eq('id', src.id);
              console.log(`[ingest] Discovered WebSub hub for ${src.title}: ${detectedHub}`);
            }
          } catch (hubErr) {
            console.warn(`[ingest] Hub detection error for ${src.id}:`, hubErr);
          }
        }
        if (!resp.ok) {
          const msg = `Fetch failed: ${httpStatus}`;
          await supabase.from("pv_rss_fetch_logs").insert({ ...logBase, status: "error", http_status: httpStatus, message: msg, items_found: 0, items_upserted: 0 });
          await supabase.from("pv_podcast_sources").update({ last_fetch_at: nowIso(), last_fetch_status: "error", last_fetch_message: msg }).eq("id", src.id);
          return { ok: false, created: 0, updated: 0, result: { source_id: src.id, ok: false, stage: "fetch", http_status: httpStatus, error: msg }, errorDetail: { source_id: src.id, title: src.title || 'Unknown', error: msg } };
        }

        // Capture ETag and Last-Modified headers for future conditional requests
        const newEtag = resp.headers.get("etag");
        const newLastModified = resp.headers.get("last-modified");

        let parseMode: "full" | "truncated" = "full";
        let isTruncated = false;
        let truncatedCopied = 0;
        let preemptivelyTruncated = false;
        let parsed: any = null;

        const tryParse = (xmlToParse: string) => parser.parse(xmlToParse);

        // Pre-truncate large feeds BEFORE parsing to prevent CPU timeout
        let xmlToParse = xml;
        if (rawLen > LARGE_FEED_PRETRUNCATE_THRESHOLD) {
          console.log(`[ingest] Large feed detected (${(rawLen / 1024 / 1024).toFixed(1)}MB) - pre-truncating before parse`);
          if (feedType === "rss") {
            const t = truncateRssToFirstNItems(xml, MAX_EPISODES + 5);
            xmlToParse = t.truncatedXml;
            truncatedCopied = t.copied;
          } else if (feedType === "atom") {
            const t = truncateAtomToFirstNEntries(xml, MAX_EPISODES + 5);
            xmlToParse = t.truncatedXml;
            truncatedCopied = t.copied;
          }
          preemptivelyTruncated = true;
          isTruncated = true;
          parseMode = "truncated";
          console.log(`[ingest] Pre-truncated ${rawLen} bytes → ${xmlToParse.length} bytes (${truncatedCopied} items)`);
        }

        try {
          parsed = tryParse(xmlToParse);
        } catch (e) {
          const errMsg = (e instanceof Error ? e.message : String(e)).slice(0, ERROR_SNIPPET_LEN);
          if (!preemptivelyTruncated && rawLen > LARGE_XML_THRESHOLD) {
            parseMode = "truncated";
            isTruncated = true;
            let truncatedXml = xml;
            if (feedType === "rss") {
              const t = truncateRssToFirstNItems(xml, MAX_EPISODES);
              truncatedXml = t.truncatedXml;
              truncatedCopied = t.copied;
            } else if (feedType === "atom") {
              const t = truncateAtomToFirstNEntries(xml, MAX_EPISODES);
              truncatedXml = t.truncatedXml;
              truncatedCopied = t.copied;
            }
            try {
              parsed = tryParse(truncatedXml);
            } catch (e2) {
              const errMsg2 = (e2 instanceof Error ? e2.message : String(e2)).slice(0, ERROR_SNIPPET_LEN);
              const msg = `Parse failed (${feedType}) full_err="${errMsg}" trunc_err="${errMsg2}" rawLen=${rawLen} truncatedCopied=${truncatedCopied}`;
              await supabase.from("pv_rss_fetch_logs").insert({ ...logBase, status: "error", http_status: httpStatus, message: msg, items_found: 0, items_upserted: 0 });
              await supabase.from("pv_podcast_sources").update({ last_fetch_at: nowIso(), last_fetch_status: "error", last_fetch_message: msg }).eq("id", src.id);
              return { ok: false, created: 0, updated: 0, result: { source_id: src.id, ok: false, stage: "parse", feedType, parseMode, isTruncated, truncatedCopied, error: msg }, errorDetail: { source_id: src.id, title: src.title || 'Unknown', error: msg } };
            }
          } else {
            const msg = `Parse failed (${feedType}) err="${errMsg}" rawLen=${rawLen} pretrunc=${preemptivelyTruncated}`;
            await supabase.from("pv_rss_fetch_logs").insert({ ...logBase, status: "error", http_status: httpStatus, message: msg, items_found: 0, items_upserted: 0 });
            await supabase.from("pv_podcast_sources").update({ last_fetch_at: nowIso(), last_fetch_status: "error", last_fetch_message: msg }).eq("id", src.id);
            return { ok: false, created: 0, updated: 0, result: { source_id: src.id, ok: false, stage: "parse", feedType, parseMode, isTruncated, truncatedCopied, preemptivelyTruncated, error: msg }, errorDetail: { source_id: src.id, title: src.title || 'Unknown', error: msg } };
          }
        }

        let showTitle: string | null = null;
        let showDesc: string | null = null;
        let showPublisher: string | null = null;
        let showLink: string | null = null;
        let showArtwork: string | null = null;
        let itemsFound = 0;
        let episodesToUpsert: any[] = [];
        let ownerEmail: string | null = null;

        if (feedType === "rss") {
          const show = extractRssShow(parsed);
          if (!show) throw new Error("RSS parse: missing channel");
          showTitle = show.title ?? src.title ?? "Untitled Show";
          showDesc = show.description ?? null;
          showPublisher = show.publisher ?? src.publisher ?? null;
          showLink = show.link ?? null;
          showArtwork = show.artwork ?? src.artwork_url ?? null;
          ownerEmail = show.ownerEmail;

          // Detect atom:link rel="self" mismatch (host migration signal)
          const selfUrl = extractSelfUrl(show.channel);
          if (selfUrl && selfUrl !== rssUrl && selfUrl !== src.rss_url) {
            console.log(`[ingest] Self-URL mismatch for ${src.id}: stored=${rssUrl} self=${selfUrl}`);
            await supabase.from('pv_podcast_sources')
              .update({ self_url_mismatch: selfUrl })
              .eq('id', src.id);
          } else if (!selfUrl || selfUrl === rssUrl || selfUrl === src.rss_url) {
            // Clear any previous mismatch if it's now resolved
            await supabase.from('pv_podcast_sources')
              .update({ self_url_mismatch: null })
              .eq('id', src.id)
              .not('self_url_mismatch', 'is', null);
          }

          const items = extractRssItems(show.channel);
          itemsFound = items.length;
          const itemsSliced = items.slice(0, MAX_EPISODES);
          episodesToUpsert = itemsSliced.map((it: any) => {
            const title = safeStr(it.title) ?? "Untitled Episode";
            const description = extractTextNode(it.description) ?? extractTextNode(it["content:encoded"]) ?? extractTextNode(it["itunes:summary"]) ?? null;
            const pub = safeDateToIso(it.pubDate);
            let guid = extractGuidText(it.guid) ?? extractGuidText(it.id) ?? null;
            const enclosure = it.enclosure;
            const audioUrl = normalizeUrl(safeStr(enclosure?.["@_url"] ?? enclosure?.url) ?? "");
            const audioType = safeStr(enclosure?.["@_type"] ?? enclosure?.type) ?? null;
            if (!audioUrl) return null;
            const audioUrlLower = audioUrl.toLowerCase().split('?')[0];
            const isVideo =
              audioUrlLower.endsWith('.mp4') ||
              audioUrlLower.endsWith('.m4v') ||
              audioUrlLower.endsWith('.webm') ||
              audioType?.includes('video/mp4') ||
              audioType?.includes('video/x-m4v') ||
              audioType?.includes('video/webm');
            const epLink = safeStr(it.link) ?? null;
            const dur = parseItunesDuration(it["itunes:duration"]);
            const epArtwork = safeStr(it["itunes:image"]?.["@_href"]) ?? showArtwork;
            return { guid, title, description, episode_url: epLink, audio_url: audioUrl, audio_type: audioType, duration_seconds: dur, artwork_url: epArtwork, published_at: pub, is_video: isVideo };
          }).filter(Boolean);
        } else if (feedType === "atom") {
          const show = extractAtomFeed(parsed);
          if (!show) throw new Error("Atom parse: missing feed");
          showTitle = show.title ?? src.title ?? "Untitled Show";
          showDesc = show.description ?? null;
          showPublisher = show.publisher ?? src.publisher ?? null;
          showLink = show.link ?? null;
          showArtwork = show.artwork ?? src.artwork_url ?? null;
          const entries = extractAtomEntries(show.feed);
          itemsFound = entries.length;
          const entriesSliced = entries.slice(0, MAX_EPISODES);
          episodesToUpsert = entriesSliced.map((en: any) => {
            const title = safeStr(en.title) ?? "Untitled Episode";
            const description = extractTextNode(en.summary) ?? extractTextNode(en.content) ?? null;
            const pub = safeDateToIso(en.published) ?? safeDateToIso(en.updated);
            let guid = extractGuidText(en.id) ?? null;
            const { audioUrl, audioType } = pickAtomEnclosure(en);
            const audio = audioUrl ? normalizeUrl(audioUrl) : null;
            if (!audio) return null;
            const audioLower = audio.toLowerCase().split('?')[0];
            const isVideo =
              audioLower.endsWith('.mp4') ||
              audioLower.endsWith('.m4v') ||
              audioLower.endsWith('.webm') ||
              audioType?.includes('video/mp4') ||
              audioType?.includes('video/x-m4v') ||
              audioType?.includes('video/webm');
            const links = asArray(en.link);
            const alt = links.find((l: any) => l?.["@_rel"] === "alternate") ?? links[0];
            const epLink = safeStr(alt?.["@_href"]) ?? null;
            return { guid, title, description, episode_url: epLink, audio_url: audio, audio_type: audioType, duration_seconds: null, artwork_url: showArtwork, published_at: pub, is_video: isVideo };
          }).filter(Boolean);
        } else {
          throw new Error("Unknown feed type");
        }

        // Fetch league_id from pillar if source has a pillar_id
        let leagueId: string | null = null;
        if (src.pillar_id) {
          const { data: pillarData } = await supabase
            .from("pillars")
            .select("league_id")
            .eq("id", src.pillar_id)
            .maybeSingle();
          leagueId = pillarData?.league_id ?? null;
        }

        // Build show payload with league_id and category fields
        const hostsJson = parseHostNames(showPublisher);
        const showPayloadBatch: Record<string, any> = {
          source_id: src.id,
          title: showTitle,
          description: showDesc,
          artwork_url: showArtwork,
          rss_url: rssUrl,
          site_url: showLink,
          owner_email: ownerEmail,
          hosts_json: hostsJson,
          updated_at: nowIso(),
        };
        if (leagueId) showPayloadBatch.league_id = leagueId;
        if (src.format) showPayloadBatch.format = src.format;
        if (src.audience_level) showPayloadBatch.audience = src.audience_level;

        // AI content farm blocklist — skip known AI-generated bulk podcast networks
        const AI_FARM_SIGNALS = ['thednn.ai', 'advertise@thednn.ai', 'fastcast.ai/podcasts', '| 2 min news |', '| 2 minute news |'];
        const showDescLower = (showDesc || '').toLowerCase();
        const showTitleLower = (showTitle || '').toLowerCase();
        const isAIFarm = AI_FARM_SIGNALS.some(sig =>
          showDescLower.includes(sig) || showTitleLower.includes(sig) || (rssUrl || '').toLowerCase().includes(sig)
        );
        if (isAIFarm) {
          console.log(`[blocklist] Skipping AI content farm: ${showTitle} — deactivating source ${src.id}`);
          // Deactivate so this source is never re-selected
          await supabase.from("pv_podcast_sources").update({
            last_fetch_at: nowIso(),
            last_fetch_status: "skipped",
            last_fetch_message: "Blocked: AI content farm",
            active: false,
          }).eq("id", src.id);
          results.push({ sourceId: src.id, title: src.title, status: "skipped_ai_farm", episodesAdded: 0 });
          // Return ok: true so blocklist skips don't trigger the circuit breaker
          return { ok: true, created: 0, updated: 0, result: { source_id: src.id, ok: true, stage: "skipped_blocklist" } };
        }

        // Upsert show
        const { data: showRows, error: showErr } = await supabase
          .from("shows")
          .upsert(showPayloadBatch, { onConflict: "rss_url" })
          .select("id")
          .limit(1);
        if (showErr) throw showErr;
        const showId = showRows?.[0]?.id as string;
        if (!showId) throw new Error("Show upsert returned no id");

        // Sync show_pillars if source has pillar_id
        if (src.pillar_id) {
          await supabase
            .from("show_pillars")
            .upsert({ show_id: showId, pillar_id: src.pillar_id, is_primary: true }, { onConflict: 'show_id,pillar_id' });
        }

        // Sync show_subtopics if source has subtopic_ids
        if (src.subtopic_ids && src.subtopic_ids.length > 0) {
          await supabase.from("show_subtopics").delete().eq("show_id", showId);
          const subtopicEntries = src.subtopic_ids.map((subtopic_id: string) => ({
            show_id: showId,
            subtopic_id,
          }));
          await supabase.from("show_subtopics").insert(subtopicEntries);
        }

        // Process episodes individually to track created vs updated
        let sourceCreated = 0;
        let sourceUpdated = 0;
        let sourceSkipped = 0;

        for (const ep of episodesToUpsert) {
          const audioUrlHash = await sha256Hex(ep.audio_url);
          const guid = ep.guid || `fallback-${audioUrlHash}`;
          const episodeData = {
            show_id: showId, guid, title: ep.title, description: ep.description,
            episode_url: ep.episode_url, audio_url: ep.audio_url, audio_type: ep.audio_type,
            duration_seconds: ep.duration_seconds, artwork_url: ep.artwork_url,
            published_at: ep.published_at,
            audio_url_hash: audioUrlHash, is_video: ep.is_video || false, updated_at: nowIso(),
          };

          const { data: existing } = await supabase
            .from("episodes")
            .select("id, title, description, audio_url, duration_seconds")
            .eq("show_id", showId)
            .eq("guid", guid)
            .maybeSingle();

          if (!existing) {
            // Syndication dupe detection before insert
            const dupeCheck = await checkSyndicationDupe(supabase, ep.title, showId, ep.published_at, ep.duration_seconds, showTitle);
            if (dupeCheck.isDupe && dupeCheck.sourceEpisodeId) {
              const dupeData = {
                ...episodeData,
                is_syndication_dupe: true,
                syndication_source_id: dupeCheck.sourceEpisodeId,
                pending_syndication_copy: !dupeCheck.sourceTagged,
              };
              const { data: inserted, error: insertErr } = await supabase.from("episodes").insert(dupeData).select("id").maybeSingle();
              if (insertErr) {
                console.error(`[ingest] Dupe insert error for guid=${guid}:`, insertErr.message);
              } else {
                sourceCreated++;
                console.log(`[syndication] Detected dupe: "${ep.title}" (show=${showId}) → source=${dupeCheck.sourceEpisodeId} tagged=${dupeCheck.sourceTagged}`);
                if (dupeCheck.sourceTagged && inserted?.id) {
                  copySyndicationMetadata(supabase, dupeCheck.sourceEpisodeId, inserted.id)
                    .catch(err => console.warn('[syndication] Copy failed:', err));
                }
              }
            } else {
              const { data: inserted, error: insertErr } = await supabase.from("episodes").insert(episodeData).select("id").maybeSingle();
              if (insertErr) {
                console.error(`[ingest] Insert error for guid=${guid}:`, insertErr.message);
              } else {
                sourceCreated++;
                // Fire-and-forget episode artwork caching
                if (inserted?.id && ep.artwork_url) {
                  cacheEpisodeArtwork(supabase, inserted.id, ep.artwork_url, null)
                    .catch(err => console.warn('Episode artwork cache failed:', err));
                }
              }
            }
          } else {
            const hasChanges = existing.title !== ep.title || existing.description !== ep.description || existing.audio_url !== ep.audio_url || (existing.duration_seconds == null && ep.duration_seconds != null);
            if (hasChanges) {
              const { error: updateErr } = await supabase.from("episodes").update(episodeData).eq("id", existing.id);
              if (updateErr) {
                console.error(`[ingest] Update error for id=${existing.id}:`, updateErr.message);
              } else {
                sourceUpdated++;
              }
            } else {
              sourceSkipped++;
            }
          }
        }

        // Update show episode count
        const { count: totalEpisodeCount } = await supabase
          .from("episodes")
          .select("*", { count: "exact", head: true })
          .eq("show_id", showId);

        const { data: latestEp } = await supabase
          .from("episodes")
          .select("published_at")
          .eq("show_id", showId)
          .order("published_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        await supabase.from("shows").update({
          episode_count: totalEpisodeCount ?? 0,
          last_episode_at: latestEp?.published_at ?? nowIso()
        }).eq("id", showId);

        // Fire-and-forget artwork caching for show
        cacheShowArtwork(supabase, showId, showArtwork, null, null)
          .catch(err => console.warn('Artwork cache failed:', err));

        const msg = `OK type=${feedType} parse=${parseMode} truncated=${isTruncated} new=${sourceCreated} updated=${sourceUpdated} skipped=${sourceSkipped} items_found=${itemsFound} rawLen=${xml.length}`;
        await supabase.from("pv_rss_fetch_logs").insert({
          ...logBase, status: "success", http_status: httpStatus, message: msg,
          items_found: itemsFound, items_upserted: sourceCreated + sourceUpdated,
        });

        // Calculate new fetch tier based on show's latest episode
        const tierInfo = calculateFetchTier(latestEp?.published_at);
        console.log(`[ingest] Show ${showId} tier: ${tierInfo.tier} (${tierInfo.intervalHours}h)`);

        const sourceUpdate: Record<string, any> = {
          last_fetch_at: nowIso(),
          last_fetch_status: "success",
          last_fetch_message: `+${sourceCreated} new · ${sourceUpdated} updated`,
          fetch_interval_hours: tierInfo.intervalHours,
        };
        if (newEtag) sourceUpdate.etag = newEtag;
        if (newLastModified) sourceUpdate.last_modified_header = newLastModified;
        await supabase.from("pv_podcast_sources").update(sourceUpdate).eq("id", src.id);

        // Inline show enrichment for new shows (replaces ai_enrichment_pending flag)
        const { data: showEnrichCheck } = await supabase.from("shows").select("ai_enriched_at").eq("id", showId).maybeSingle();
        if (!showEnrichCheck?.ai_enriched_at) {
          console.log(`[ingest] Running inline enrichment for new show ${showId}`);
          try {
            const enrichResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/tag-episodes`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode: 'enrich_show', show_id: showId }),
            });
            // Fire-and-forget — don't block ingestion on enrichment
            enrichResp.body?.cancel();
            console.log(`[ingest] Inline enrichment triggered for ${showId}: ${enrichResp.status}`);
          } catch (e) {
            console.warn(`[ingest] Inline enrichment failed for ${showId}:`, e);
          }
        }

        // Return slim result to minimize memory footprint
        return {
          ok: true,
          created: sourceCreated,
          updated: sourceUpdated,
          result: {
            source_id: src.id, ok: true, episodes_created: sourceCreated,
            episodes_updated: sourceUpdated, show_id: showId,
            preemptivelyTruncated,
          },
        };

      } catch (e) {
        const errMsg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
        await supabase.from("pv_rss_fetch_logs").insert({
          source_id: src.id, rss_url: rssUrl, status: "error", http_status: httpStatus,
          message: errMsg, fetched_at: nowIso(), items_found: 0, items_upserted: 0,
        });
        await supabase.from("pv_podcast_sources").update({
          last_fetch_at: nowIso(), last_fetch_status: "error", last_fetch_message: errMsg,
        }).eq("id", src.id);

        return {
          ok: false, created: 0, updated: 0,
          result: { source_id: src.id, ok: false, http_status: httpStatus, error: errMsg },
          errorDetail: { source_id: src.id, title: src.title || 'Unknown', error: errMsg },
        };
      }
    }

    // Process sources sequentially with circuit breaker
    const recentFailures: boolean[] = []; // rolling window of last N results
    for (const src of sources) {
      if (abortReason) break;
      sourcesAttempted++;

      const r = await processOneSource(src);
      results.push(r.result);
      totalCreated += r.created;
      totalUpdated += r.updated;

      if (!r.ok) {
        totalErrors++;
        if (r.errorDetail) errorDetails.push(r.errorDetail);
      }

      // Rolling window circuit breaker
      recentFailures.push(!r.ok);
      if (recentFailures.length > CIRCUIT_BREAKER_WINDOW) recentFailures.shift();
      const recentFailCount = recentFailures.filter(Boolean).length;
      if (recentFailures.length >= CIRCUIT_BREAKER_WINDOW && recentFailCount >= CIRCUIT_BREAKER_THRESHOLD) {
        const remaining = sources.length - sourcesAttempted;
        abortReason = `Circuit breaker: ${recentFailCount}/${CIRCUIT_BREAKER_WINDOW} recent failures. Aborting ${remaining} remaining sources.`;
        console.error(`[ingest] ${abortReason}`);
      }

      if (sourcesAttempted % 10 === 0) {
        console.log(`[ingest] Progress: ${sourcesAttempted}/${sources.length} sources, created=${totalCreated} updated=${totalUpdated} errors=${totalErrors}`);
      }
    }

    if (abortReason) {
      console.warn(`[ingest] Early abort after ${sourcesAttempted}/${sources.length} sources. Reason: ${abortReason}`);
    }

    // ── Job queue post-processing ──
    // If this was a job queue invocation, update job statuses, cron log, and trigger AI enrichment.
    const jqJobs = (body as any)._jobQueueJobs;
    const jqCronLogId = (body as any)._jobQueueCronLogId;
    const jqSourceMap: Map<string, any> | undefined = (body as any)._jobQueueSourceMap;

    if (jqJobs && jqSourceMap) {
      console.log(`[ingest-rss] Job queue post-processing: ${jqJobs.length} jobs, ${results.length} results`);
      const resultMap = new Map(results.map((r: any) => [r.source_id, r]));

      for (const job of jqJobs) {
        const result = resultMap.get(job.source_id);
        const src = jqSourceMap.get(job.source_id);

        if (!src) {
          // Source deleted — mark dead
          await supabase.from('rss_fetch_jobs').update({
            status: 'dead', finished_at: nowIso(), locked_until: null,
            last_error: 'source not found',
          }).eq('id', job.id);
          continue;
        }

        if (!result || !result.ok) {
          // Failed — backoff with exponential retry, dead after 5 failures
          const nextFailureCount = (src.failure_count ?? 0) + 1;
          const isDead = nextFailureCount >= 5;
          const backoffMinutes = [10, 30, 120, 360, 1440][Math.min(nextFailureCount - 1, 4)];
          const backoffUntil = new Date(Date.now() + backoffMinutes * 60000).toISOString();

          await supabase.from('rss_fetch_jobs').update({
            status: isDead ? 'dead' : 'pending',
            run_after: isDead ? nowIso() : backoffUntil,
            finished_at: nowIso(), locked_until: null,
            last_error: result?.error || 'unknown error',
          }).eq('id', job.id);

          const sourceUpdate: Record<string, any> = {
            failure_count: nextFailureCount,
            backoff_until: backoffUntil,
            next_fetch_at: backoffUntil,
          };

          // Auto-deactivate feeds with 10+ consecutive failures
          if (nextFailureCount >= 10) {
            sourceUpdate.active = false;
            console.log(`[ingest-rss] Auto-deactivated source ${job.source_id} (${src.title}) after ${nextFailureCount} consecutive failures`);
          }

          await supabase.from('pv_podcast_sources').update(sourceUpdate).eq('id', job.source_id);
        } else {
          // Success — compute schedule-aware next_fetch_at using calculateFetchTier result
          // processOneSource already updated fetch_interval_hours via calculateFetchTier()
          // Re-read the updated source to get the fresh interval
          const { data: updatedSrc } = await supabase
            .from('pv_podcast_sources')
            .select('fetch_interval_hours, publish_pattern, publish_days, publish_hour_start, publish_hour_end, websub_subscribed_at, websub_expires_at')
            .eq('id', job.source_id)
            .single();

          const nextFetchAt = computeScheduleAwareNextFetch(updatedSrc || src);
          console.log(`[ingest-rss] Source ${job.source_id}: next_fetch_at=${nextFetchAt} (interval=${updatedSrc?.fetch_interval_hours ?? src.fetch_interval_hours}h, pattern=${updatedSrc?.publish_pattern ?? src.publish_pattern})`);

          await supabase.from('rss_fetch_jobs').update({
            status: 'success', finished_at: nowIso(), locked_until: null, last_error: null,
          }).eq('id', job.id);

          await supabase.from('pv_podcast_sources').update({
            next_fetch_at: nextFetchAt,
            failure_count: 0,
            backoff_until: null,
          }).eq('id', job.source_id);

          // Track shows with new episodes for AI enrichment
          if (result.show_id && (result.episodes_created > 0 || result.episodes_updated > 0)) {
            if (!(body as any)._jqShowsWithNew) (body as any)._jqShowsWithNew = [];
            (body as any)._jqShowsWithNew.push(result.show_id);
          }
        }
      }

      // Close cron log — required for Telegram daily health report
      const jqSourcesWithNew = results.filter((r: any) => r.ok && (r.episodes_created > 0 || r.episodes_updated > 0)).length;
      if (jqCronLogId) {
        await supabase.from('rss_cron_logs').update({
          completed_at: nowIso(),
          status: totalErrors > 0 && sourcesAttempted === 0 ? 'failed' : abortReason ? 'partial' : 'complete',
          sources_processed: sourcesAttempted,
          sources_eligible: jqJobs.length,
          sources_with_new_episodes: jqSourcesWithNew,
          episodes_added: totalCreated,
          errors: errorDetails.length > 0 ? errorDetails : [],
          total_active_sources: jqJobs.length,
        }).eq('id', jqCronLogId);
      }

      // Trigger AI enrichment for shows with new episodes
      const uniqueShowIds = [...new Set((body as any)._jqShowsWithNew || [])];
      if (uniqueShowIds.length > 0) {
        console.log(`[ingest-rss] Marking ${uniqueShowIds.length} shows for AI enrichment`);
        await supabase.from('shows').update({ ai_enrichment_pending: true }).in('id', uniqueShowIds);

        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
        if (supabaseUrl && anonKey) {
          fetch(`${supabaseUrl}/functions/v1/ai-enrichment-cron`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ priority_show_ids: uniqueShowIds }),
          }).catch(e => console.error('[ingest-rss] AI enrichment trigger error:', e));
        }
      }

      // Fire-and-forget: match new episodes to game stories
      if (totalCreated > 0) {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (supabaseUrl && serviceKey) {
          fetch(`${supabaseUrl}/functions/v1/match-episodes-to-game-stories`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'incremental' }),
          }).catch(err => console.error('[ingest-rss] match-episodes fire-and-forget error:', err));
        }
      }

      console.log(`[ingest-rss] Job queue complete: ${sourcesAttempted} processed, ${totalCreated} created, ${totalUpdated} updated, ${totalErrors} errors`);
    }

    return new Response(JSON.stringify({
      ok: true,
      processed_sources: sourcesAttempted,
      total_sources: sources.length,
      episodes_created: totalCreated,
      episodes_updated: totalUpdated,
      episodes_upserted: totalCreated + totalUpdated,
      errors: totalErrors,
      aborted: !!abortReason,
      abort_reason: abortReason,
      ms: Date.now() - start,
      results
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 800);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Legacy handler for old API: { rssUrl, sourceId, defaultSpecialtySlug }
// Now also supports category fields
interface CategoryOptions {
  pillarId?: string;
  subtopicIds?: string[];
  format?: string;
  audienceLevel?: string;
}

async function handleLegacySingleFeed(
  supabase: any,
  rssUrl: string,
  sourceId: string | undefined,
  defaultSpecialtySlug: string | undefined,
  start: number,
  categoryOptions: CategoryOptions = {}
) {
  const parser = makeXmlParser();
  const normalizedUrl = normalizeUrl(rssUrl);
  let httpStatus: number | null = null;

  try {
    console.log(`[legacy-ingest] rssUrl=${normalizedUrl}`);

    const resp = await fetch(normalizedUrl, {
      headers: { "User-Agent": "GameVoicesRSSIngest/3.0", "Accept": "application/xml, text/xml, */*" },
    });
    httpStatus = resp.status;
    const xml = await resp.text();

    if (!resp.ok) {
      const msg = `Fetch failed: ${httpStatus}`;
      if (sourceId) {
        await supabase.from("pv_rss_fetch_logs").insert({ source_id: sourceId, rss_url: normalizedUrl, status: "error", http_status: httpStatus, message: msg, fetched_at: nowIso(), items_found: 0, items_upserted: 0 });
        await supabase.from("pv_podcast_sources").update({ last_fetch_at: nowIso(), last_fetch_status: "error", last_fetch_message: msg }).eq("id", sourceId);
      }
      return new Response(JSON.stringify({ success: false, error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const rawLen = xml.length;
    const feedType = detectFeedType(xml);
    let parsed: any;

    try {
      parsed = parser.parse(xml);
    } catch (e) {
      // Try truncation for large feeds
      if (rawLen > LARGE_XML_THRESHOLD && feedType === "rss") {
        const { truncatedXml } = truncateRssToFirstNItems(xml, MAX_EPISODES);
        parsed = parser.parse(truncatedXml);
      } else if (rawLen > LARGE_XML_THRESHOLD && feedType === "atom") {
        const { truncatedXml } = truncateAtomToFirstNEntries(xml, MAX_EPISODES);
        parsed = parser.parse(truncatedXml);
      } else {
        throw e;
      }
    }

    // Support both RSS and Atom feeds in legacy mode
    let showTitle: string;
    let showDesc: string | null;
    let showArtwork: string | null;
    let showLink: string | null;
    let publisher: string | null;
    let feedContainer: any;

    if (feedType === "rss") {
      const show = extractRssShow(parsed);
      if (!show) throw new Error("RSS parse: missing channel");
      showTitle = show.title ?? "Untitled Show";
      showDesc = show.description ?? null;
      showArtwork = show.artwork ?? null;
      showLink = show.link ?? null;
      publisher = show.publisher ?? null;
      feedContainer = show.channel;
    } else if (feedType === "atom") {
      const atomFeed = extractAtomFeed(parsed);
      if (!atomFeed) throw new Error("Atom parse: missing feed");
      showTitle = atomFeed.title ?? "Untitled Show";
      showDesc = atomFeed.description ?? null;
      showArtwork = atomFeed.artwork ?? null;
      showLink = atomFeed.link ?? null;
      publisher = atomFeed.publisher ?? null;
      feedContainer = atomFeed.feed;
    } else {
      return new Response(JSON.stringify({ success: false, error: "Unknown feed format - only RSS and Atom feeds are supported" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build hosts_json by parsing individual names from publisher
    const hostsJson = parseHostNames(publisher);

    // Fetch league_id from pillar if provided
    let leagueId: string | null = null;
    if (categoryOptions.pillarId) {
      const { data: pillarData } = await supabase
        .from("pillars")
        .select("league_id")
        .eq("id", categoryOptions.pillarId)
        .maybeSingle();
      leagueId = pillarData?.league_id ?? null;
      console.log(`[legacy-ingest] Pillar ${categoryOptions.pillarId} has league_id=${leagueId}`);
    }

    // Upsert show with new category fields if provided
    const showPayload: Record<string, any> = {
      title: showTitle,
      description: showDesc,
      artwork_url: showArtwork,
      rss_url: normalizedUrl,
      site_url: showLink,
      hosts_json: hostsJson,
      specialty_slugs_json: defaultSpecialtySlug ? [defaultSpecialtySlug] : [],
      source_id: sourceId ?? null,
      updated_at: nowIso(),
    };
    
    // Add league_id if derived from pillar
    if (leagueId) {
      showPayload.league_id = leagueId;
    }
    
    // Add new category fields if provided
    if (categoryOptions.format) {
      showPayload.format = categoryOptions.format;
    }
    if (categoryOptions.audienceLevel) {
      showPayload.audience = categoryOptions.audienceLevel;
    }

    const { data: showData, error: showErr } = await supabase
      .from("shows")
      .upsert(showPayload, { onConflict: "rss_url" })
      .select()
      .single();

    if (showErr) throw showErr;
    const showId = showData.id;

    // Create show_pillars entry if pillar provided
    if (categoryOptions.pillarId) {
      console.log(`[legacy-ingest] Creating show_pillars entry for show ${showId}, pillar ${categoryOptions.pillarId}`);
      await supabase
        .from("show_pillars")
        .upsert({
          show_id: showId,
          pillar_id: categoryOptions.pillarId,
          is_primary: true,
        }, { onConflict: 'show_id,pillar_id' });
    }

    // Create show_subtopics entries if subtopics provided
    if (categoryOptions.subtopicIds && categoryOptions.subtopicIds.length > 0) {
      console.log(`[legacy-ingest] Creating show_subtopics entries for show ${showId}, ${categoryOptions.subtopicIds.length} subtopics`);
      // Delete existing and insert new
      await supabase.from("show_subtopics").delete().eq("show_id", showId);
      
      const subtopicEntries = categoryOptions.subtopicIds.map((subtopic_id: string) => ({
        show_id: showId,
        subtopic_id,
      }));
      await supabase.from("show_subtopics").insert(subtopicEntries);
    }

    // Extract items based on feed type
    const items = feedType === "rss" 
      ? extractRssItems(feedContainer).slice(0, MAX_EPISODES)
      : extractAtomEntries(feedContainer).slice(0, MAX_EPISODES);
    let episodesCreated = 0;
    let episodesUpdated = 0;
    let episodesSkipped = 0;

    for (const it of items) {
      const title = safeStr(it.title);
      if (!title) { episodesSkipped++; continue; }

      // Handle enclosure extraction for RSS vs Atom
      let audioUrl: string;
      let audioType: string | null;
      
      if (feedType === "rss") {
        const enclosure = it.enclosure;
        audioUrl = normalizeUrl(safeStr(enclosure?.["@_url"] ?? enclosure?.url) ?? "");
        audioType = safeStr(enclosure?.["@_type"] ?? enclosure?.type) ?? null;
      } else {
        // Atom feed - use pickAtomEnclosure
        const atomEnc = pickAtomEnclosure(it);
        audioUrl = normalizeUrl(atomEnc.audioUrl ?? "");
        audioType = atomEnc.audioType;
      }
      
      if (!audioUrl) { episodesSkipped++; continue; }

      const guid = extractGuidText(it.guid) ?? extractGuidText(it.id) ?? `fallback-${await sha256Hex(audioUrl + title)}`;
      const audioUrlHash = await sha256Hex(audioUrl);
      const description = safeStr(it.description) ?? safeStr(it["content:encoded"]) ?? safeStr(it["itunes:summary"]) ?? safeStr(it.summary) ?? safeStr(it.content) ?? null;
      
      // Handle episode URL for RSS vs Atom
      let episodeUrl: string | null;
      if (feedType === "rss") {
        episodeUrl = safeStr(it.link) ?? null;
      } else {
        // Atom - find alternate link
        const links = asArray(it.link);
        const altLink = links.find((l: any) => l?.["@_rel"] === "alternate" || !l?.["@_rel"]) ?? links[0];
        episodeUrl = safeStr(altLink?.["@_href"]) ?? safeStr(altLink) ?? null;
      }
      
      const duration = parseItunesDuration(it["itunes:duration"]);
      const episodeArtwork = safeStr(it["itunes:image"]?.["@_href"]) ?? showArtwork;
      
      // Handle published date for RSS vs Atom
      const publishedAt = feedType === "rss" 
        ? safeDateToIso(it.pubDate) 
        : safeDateToIso(it.published ?? it.updated);

      // Detect video by file extension or MIME type
      const audioUrlLower = audioUrl.toLowerCase().split('?')[0];
      const isVideo = 
        audioUrlLower.endsWith('.mp4') || 
        audioUrlLower.endsWith('.m4v') || 
        audioUrlLower.endsWith('.webm') ||
        audioType?.includes('video/mp4') ||
        audioType?.includes('video/x-m4v') ||
        audioType?.includes('video/webm');

      const episodeData = {
        show_id: showId,
        guid,
        title,
        description,
        audio_url: audioUrl,
        audio_type: audioType,
        audio_url_hash: audioUrlHash,
        duration_seconds: duration,
        artwork_url: episodeArtwork,
        episode_url: episodeUrl,
        published_at: publishedAt,
        topic_slug: defaultSpecialtySlug,
        is_video: isVideo,
        updated_at: nowIso(),
      };

      const { data: existing } = await supabase.from("episodes").select("id").eq("show_id", showId).eq("guid", guid).maybeSingle();

      if (existing) {
        await supabase.from("episodes").update(episodeData).eq("id", existing.id);
        episodesUpdated++;
      } else {
        // Syndication dupe detection before insert
        const dupeCheck = await checkSyndicationDupe(supabase, title, showId, publishedAt, duration, showTitle);
        if (dupeCheck.isDupe && dupeCheck.sourceEpisodeId) {
          const dupeData = {
            ...episodeData,
            is_syndication_dupe: true,
            syndication_source_id: dupeCheck.sourceEpisodeId,
            pending_syndication_copy: !dupeCheck.sourceTagged,
          };
          const { data: inserted } = await supabase.from("episodes").insert(dupeData).select("id").maybeSingle();
          console.log(`[syndication-legacy] Detected dupe: "${title}" (show=${showId}) → source=${dupeCheck.sourceEpisodeId}`);
          if (dupeCheck.sourceTagged && inserted?.id) {
            copySyndicationMetadata(supabase, dupeCheck.sourceEpisodeId, inserted.id)
              .catch(err => console.warn('[syndication] Copy failed:', err));
          }
        } else {
          await supabase.from("episodes").insert(episodeData);
        }
        episodesCreated++;
      }
    }

    // Update show counts
    const { data: latestEp } = await supabase.from("episodes").select("published_at").eq("show_id", showId).order("published_at", { ascending: false }).limit(1).maybeSingle();
    const { count } = await supabase.from("episodes").select("*", { count: "exact", head: true }).eq("show_id", showId);

    await supabase.from("shows").update({ episode_count: count ?? 0, last_episode_at: latestEp?.published_at }).eq("id", showId);

    // Log success
    if (sourceId) {
      await supabase.from("pv_rss_fetch_logs").insert({ source_id: sourceId, rss_url: normalizedUrl, status: "success", http_status: httpStatus, message: `Created: ${episodesCreated}, Updated: ${episodesUpdated}, Skipped: ${episodesSkipped}`, items_found: items.length, items_upserted: episodesCreated + episodesUpdated, fetched_at: nowIso() });
      await supabase.from("pv_podcast_sources").update({ last_fetch_at: nowIso(), last_fetch_status: "success", last_fetch_message: `${episodesCreated} created, ${episodesUpdated} updated` }).eq("id", sourceId);

      // Update rss_feeds
      await supabase.from("rss_feeds").upsert({ rss_url: normalizedUrl, show_id: showId, enabled: true, default_specialty_slug: defaultSpecialtySlug, last_fetch_at: nowIso(), last_fetch_status: "success" }, { onConflict: "rss_url" });
    }

    // Inline show enrichment for new shows
    const { data: showEnrichCheck2 } = await supabase.from("shows").select("ai_enriched_at").eq("id", showId).maybeSingle();
    if (!showEnrichCheck2?.ai_enriched_at) {
      console.log(`[legacy-ingest] Running inline enrichment for new show ${showId}`);
      try {
        const enrichResp = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/tag-episodes`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'enrich_show', show_id: showId }),
        });
        enrichResp.body?.cancel();
      } catch (e) {
        console.warn(`[legacy-ingest] Inline enrichment failed for ${showId}:`, e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      showId,
      showTitle,
      episodesCreated,
      episodesUpdated,
      episodesSkipped,
      totalItems: items.length,
      ms: Date.now() - start,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    const errMsg = (e instanceof Error ? e.message : String(e)).slice(0, 400);
    console.error("[legacy-ingest] error:", errMsg);

    if (sourceId) {
      await supabase.from("pv_rss_fetch_logs").insert({ source_id: sourceId, rss_url: normalizedUrl, status: "error", http_status: httpStatus, message: errMsg, fetched_at: nowIso(), items_found: 0, items_upserted: 0 });
      await supabase.from("pv_podcast_sources").update({ last_fetch_at: nowIso(), last_fetch_status: "error", last_fetch_message: errMsg }).eq("id", sourceId);
    }

    return new Response(JSON.stringify({ success: false, error: errMsg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}
