import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * ingest-rss-cron - Smart Schedule-Aware RSS Ingestion
 * 
 * SIMPLIFIED ARCHITECTURE (v2):
 * - Runs hourly via pg_cron
 * - Uses detected publish patterns to only fetch sources during their publish windows
 * - No self-chaining, no cursor state - just a simple batch query
 * - Triggers AI enrichment after processing
 * 
 * Schedule-Aware Logic:
 * - sporadic/unknown: Always eligible (based on fetch_interval_hours)
 * - daily/weekdays/weekly: Only fetch on matching days within hour window
 * 
 * Expected reduction: ~46% fewer fetches with zero missed episodes
 */

const BATCH_LIMIT = 120; // Total sources to process per cron run (120 × 12 runs/day = 1,440 fetches → full coverage of 940 sources)
const CHUNK_SIZE = 20;  // Sources per ingest-rss call (each gets fresh memory to avoid WORKER_LIMIT; 20 keeps chunks fast with ~30s safety margin)
const MAX_CHUNK_RETRIES = 1; // Retry failed chunks once
const RETRY_DELAY_MS = 2000; // 2s backoff before retry

interface SourceRow {
  id: string;
  rss_url: string;
  title: string;
  publish_pattern: string | null;
  publish_days: number[] | null;
  publish_hour_start: number | null;
  publish_hour_end: number | null;
  fetch_interval_hours: number | null;
  last_fetch_at: string | null;
  websub_subscribed_at: string | null;
  websub_expires_at: string | null;
}

/** Helper to delay execution */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Process a single chunk of sources. Returns parsed result or null on failure.
 */
async function processChunk(
  ingestUrl: string,
  anonKey: string,
  chunk: SourceRow[],
  chunkIndex: number,
  totalChunks: number,
): Promise<{ result: any; retried: boolean } | null> {
  for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt++) {
    const isRetry = attempt > 0;
    if (isRetry) {
      console.warn(`[ingest-rss-cron] Retrying chunk ${chunkIndex + 1}/${totalChunks} (attempt ${attempt + 1})...`);
      await sleep(RETRY_DELAY_MS);
    }

    try {
      const response = await fetch(ingestUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'batch',
          limit: CHUNK_SIZE,
          skipAI: true,
          source_ids: chunk.map(s => s.id),
        }),
      });

      // WORKER_LIMIT — abort entirely, no retry
      if (response.status === 546) {
        console.error(`[ingest-rss-cron] Chunk ${chunkIndex + 1} hit WORKER_LIMIT — aborting`);
        return null;
      }

      const responseText = await response.text();

      // Non-200 from ingest-rss — retry on 5xx, skip on 4xx
      if (response.status !== 200) {
        console.error(`[ingest-rss-cron] Chunk ${chunkIndex + 1} returned HTTP ${response.status}: ${responseText.slice(0, 200)}`);
        if (response.status >= 500 && attempt < MAX_CHUNK_RETRIES) {
          continue; // retry
        }
        return null;
      }

      let result: any;
      try {
        result = JSON.parse(responseText);
      } catch {
        console.error(`[ingest-rss-cron] Chunk ${chunkIndex + 1} returned invalid JSON: ${responseText.slice(0, 200)}`);
        if (attempt < MAX_CHUNK_RETRIES) continue;
        return null;
      }

      // Check for application-level error (ok: false)
      if (result.ok === false || result.success === false) {
        console.error(`[ingest-rss-cron] Chunk ${chunkIndex + 1} returned error response: ${result.error || result.message || 'unknown'}`);
        if (attempt < MAX_CHUNK_RETRIES) continue;
        return null;
      }

      // Validate that results array exists (catch silent swallowing)
      if (!result.results && !result.processed_sources) {
        console.error(`[ingest-rss-cron] Chunk ${chunkIndex + 1} returned no results or processed_sources — possible silent failure: ${JSON.stringify(result).slice(0, 300)}`);
        if (attempt < MAX_CHUNK_RETRIES) continue;
        return null;
      }

      return { result, retried: isRetry };
    } catch (e) {
      console.error(`[ingest-rss-cron] Chunk ${chunkIndex + 1} fetch error:`, e);
      if (attempt < MAX_CHUNK_RETRIES) continue;
      return null;
    }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const start = Date.now();
  console.log('[ingest-rss-cron] Starting smart schedule-aware ingestion...');

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    const now = new Date();
    const currentDow = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
    const currentHour = now.getUTCHours();

    console.log(`[ingest-rss-cron] Current UTC: DOW=${currentDow}, Hour=${currentHour}`);

    // Count total active sources for metrics
    const { count: totalActive } = await supabase
      .from('pv_podcast_sources')
      .select('*', { count: 'exact', head: true })
      .eq('active', true);

    // Get all active sources
    const { data: allSources, error: fetchError } = await supabase
      .from('pv_podcast_sources')
      .select('id, rss_url, title, publish_pattern, publish_days, publish_hour_start, publish_hour_end, fetch_interval_hours, last_fetch_at, websub_subscribed_at, websub_expires_at')
      .eq('active', true)
      .order('last_fetch_at', { ascending: true, nullsFirst: true });

    if (fetchError) throw fetchError;

    // Apply smart schedule-aware filter
    const eligibleSources = (allSources || []).filter((src: SourceRow) => {
      // Determine effective interval: WebSub-active sources use 12h safety-net fallback
      const hasActiveWebSub = src.websub_subscribed_at && src.websub_expires_at && new Date(src.websub_expires_at) > now;
      const effectiveInterval = hasActiveWebSub ? 12 : (src.fetch_interval_hours ?? 4);

      // Check if source is due based on effective interval
      if (src.last_fetch_at) {
        const lastFetch = new Date(src.last_fetch_at);
        const nextFetchAt = new Date(lastFetch.getTime() + effectiveInterval * 60 * 60 * 1000);
        if (now < nextFetchAt) {
          return false; // Not due yet
        }
      }

      // Unknown or sporadic: always eligible if due
      if (!src.publish_pattern || src.publish_pattern === 'sporadic') {
        return true;
      }

      // Daily: always eligible if due (publish_days data is unreliable for daily shows)
      if (src.publish_pattern === 'daily') {
        return true;
      }

      // Weekdays: use fixed Mon-Fri check (don't rely on publish_days)
      if (src.publish_pattern === 'weekdays') {
        if (currentDow === 0 || currentDow === 6) {
          return false; // Skip weekends
        }
        return true;
      }

      // Weekly: check publish_days if available
      if (src.publish_pattern === 'weekly') {
        if (src.publish_days && src.publish_days.length > 0) {
          if (!src.publish_days.includes(currentDow)) {
            return false; // Not a publish day
          }
        }
      }

      // Check hour window (with -1h before and +3h after buffer)
      if (src.publish_hour_start !== null && src.publish_hour_end !== null) {
        const windowStart = Math.max(0, src.publish_hour_start - 1);
        const windowEnd = Math.min(23, src.publish_hour_end + 3);
        
        if (windowStart <= windowEnd) {
          if (currentHour < windowStart || currentHour > windowEnd) {
            return false;
          }
        } else {
          if (currentHour < windowStart && currentHour > windowEnd) {
            return false;
          }
        }
      }

      return true; // Passed all checks
    });

    const sourcesToFetch = eligibleSources.slice(0, BATCH_LIMIT);
    const sourcesEligible = eligibleSources.length;

    console.log(`[ingest-rss-cron] Schedule filter: ${totalActive || 0} total active, ${sourcesEligible} eligible by schedule, fetching ${sourcesToFetch.length}`);

    // Calculate fetch reduction percentage
    const fetchReductionPct = totalActive && totalActive > 0
      ? Math.round((1 - sourcesEligible / totalActive) * 100)
      : 0;

    console.log(`[ingest-rss-cron] Fetch reduction: ${fetchReductionPct}% (${totalActive! - sourcesEligible} sources skipped by schedule)`);

    // Create a single cron log entry for this run
    const { data: cronLog } = await supabase
      .from('rss_cron_logs')
      .insert({
        status: 'running',
        sources_processed: 0,
        sources_eligible: sourcesEligible,
        total_active_sources: totalActive || 0,
        fetch_reduction_pct: fetchReductionPct,
        episodes_added: 0,
        started_at: now.toISOString(),
      })
      .select('id')
      .single();

    const cronLogId = cronLog?.id;

    if (sourcesToFetch.length === 0) {
      console.log('[ingest-rss-cron] No sources eligible for fetch at this time');

      if (cronLogId) {
        await supabase
          .from('rss_cron_logs')
          .update({
            status: 'success',
            completed_at: new Date().toISOString(),
            details: { message: 'No sources eligible for fetch' },
          })
          .eq('id', cronLogId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'No sources eligible for fetch at this time',
          sources_eligible: 0,
          total_active: totalActive,
          fetch_reduction_pct: fetchReductionPct,
          duration_ms: Date.now() - start,
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Split sources into chunks of CHUNK_SIZE
    const chunks: typeof sourcesToFetch[] = [];
    for (let i = 0; i < sourcesToFetch.length; i += CHUNK_SIZE) {
      chunks.push(sourcesToFetch.slice(i, i + CHUNK_SIZE));
    }

    console.log(`[ingest-rss-cron] Processing ${sourcesToFetch.length} sources in ${chunks.length} chunks of up to ${CHUNK_SIZE}`);

    const ingestUrl = `${supabaseUrl}/functions/v1/ingest-rss`;
    let allResults: any[] = [];
    let totalSourcesProcessed = 0;
    let totalEpisodesCreated = 0;
    let totalErrorCount = 0;
    let chunksRetried = 0;
    let aborted = false;

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      const chunkStart = Date.now();

      console.log(`[ingest-rss-cron] Chunk ${ci + 1}/${chunks.length}: sending ${chunk.length} sources`);

      const chunkResult = await processChunk(ingestUrl, supabaseAnonKey, chunk, ci, chunks.length);
      const chunkMs = Date.now() - chunkStart;

      if (chunkResult === null) {
        // Chunk failed after retries (or WORKER_LIMIT)
        totalErrorCount += chunk.length;
        console.error(`[ingest-rss-cron] Chunk ${ci + 1} FAILED after retries (${chunkMs}ms) — ${chunk.length} sources lost`);
        
        // Check if it was a WORKER_LIMIT (we can't easily distinguish here, but if all fail we should stop)
        // For safety, if 2+ consecutive chunks fail, abort
        if (ci > 0 && totalSourcesProcessed === 0) {
          console.error(`[ingest-rss-cron] Multiple consecutive chunk failures with 0 processed — aborting remaining chunks`);
          aborted = true;
          break;
        }
        continue;
      }

      const { result, retried } = chunkResult;
      if (retried) chunksRetried++;

      const chunkResults = result.results || [];
      allResults = allResults.concat(chunkResults);
      totalSourcesProcessed += result.processed_sources || chunkResults.length;
      totalEpisodesCreated += result.episodes_created || 0;
      totalErrorCount += result.errors || 0;

      // If the chunk itself aborted (circuit breaker), stop processing more chunks
      if (result.aborted) {
        console.warn(`[ingest-rss-cron] Chunk ${ci + 1} aborted internally: ${result.abort_reason}`);
        aborted = true;
        break;
      }

      console.log(`[ingest-rss-cron] Chunk ${ci + 1} done: ${chunkResults.length} processed, +${result.episodes_created || 0} episodes, ${result.errors || 0} errors (${chunkMs}ms)${retried ? ' [RETRIED]' : ''}`);
    }

    // ===== ZERO-PROCESSING ALERT =====
    if (totalSourcesProcessed === 0 && sourcesToFetch.length > 0) {
      console.error(`[ingest-rss-cron] ALERT: 0 sources processed out of ${sourcesToFetch.length} attempted — possible infrastructure issue`);
    }

    const sourcesWithNewEpisodes = allResults.filter((r: any) => 
      r.ok && (r.episodes_created > 0 || r.episodes_updated > 0)
    ).length;
    const pretruncatedCount = allResults.filter((r: any) => 
      r.preemptivelyTruncated === true
    ).length;

    console.log(`[ingest-rss-cron] All chunks complete: ${totalSourcesProcessed} sources, ${pretruncatedCount} pre-truncated, ${totalEpisodesCreated} new episodes, ${totalErrorCount} errors${aborted ? ' (ABORTED)' : ''}${chunksRetried > 0 ? ` (${chunksRetried} chunks retried)` : ''}`);

    // FIX A: Only mark shows that had NEW episodes inserted this run
    const showsWithNewEpisodes = allResults
      .filter((r: any) => r.ok && r.show_id && (r.episodes_created > 0 || r.episodes_updated > 0))
      .map((r: any) => r.show_id);

    // Deduplicate
    const uniqueShowIds = [...new Set(showsWithNewEpisodes)];

    if (uniqueShowIds.length > 0) {
      console.log(`[ingest-rss-cron] Marking ${uniqueShowIds.length} shows with new episodes for AI enrichment (out of ${allResults.filter((r: any) => r.ok).length} processed)`);
      
      await supabase
        .from('shows')
        .update({ ai_enrichment_pending: true })
        .in('id', uniqueShowIds);
    } else {
      console.log(`[ingest-rss-cron] No shows had new episodes — skipping enrichment marking`);
    }

    // Update cron log with final stats
    const duration = Date.now() - start;
    
    if (cronLogId) {
      await supabase
        .from('rss_cron_logs')
        .update({
          status: totalErrorCount > 0 && totalSourcesProcessed === 0 ? 'failed' : aborted ? 'partial' : 'success',
          sources_processed: totalSourcesProcessed,
          sources_with_new_episodes: sourcesWithNewEpisodes,
          episodes_added: totalEpisodesCreated,
          completed_at: new Date().toISOString(),
          details: {
            schedule_info: {
              current_dow: currentDow,
              current_hour: currentHour,
            },
            chunks_info: {
              total_chunks: chunks.length,
              chunk_size: CHUNK_SIZE,
              aborted,
              chunks_retried: chunksRetried,
            },
            results_summary: {
              success: allResults.filter((r: any) => r.ok).length,
              errors: totalErrorCount,
              pretruncated_feeds: pretruncatedCount,
            },
          },
          ...(totalSourcesProcessed === 0 && sourcesToFetch.length > 0 ? {
            errors: { alert: `ZERO_PROCESSING: 0/${sourcesToFetch.length} sources processed` },
          } : {}),
        })
        .eq('id', cronLogId);
    }

    // FIX B: Trigger AI enrichment with priority_show_ids for shows that got new episodes
    if (totalSourcesProcessed > 0) {
      console.log(`[ingest-rss-cron] Triggering AI enrichment${uniqueShowIds.length > 0 ? ` with ${uniqueShowIds.length} priority shows` : ''}...`);
      
      fetch(`${supabaseUrl}/functions/v1/ai-enrichment-cron`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priority_show_ids: uniqueShowIds,
        }),
      }).catch(e => console.error('[ingest-rss-cron] AI enrichment trigger error:', e));
    }

    const summary = {
      success: true,
      message: `Processed ${totalSourcesProcessed} sources in ${chunks.length} chunks`,
      total_active_sources: totalActive,
      sources_eligible_by_schedule: sourcesEligible,
      sources_fetched: totalSourcesProcessed,
      sources_with_new_episodes: sourcesWithNewEpisodes,
      pretruncated_feeds: pretruncatedCount,
      episodes_added: totalEpisodesCreated,
      errors: totalErrorCount,
      chunks: chunks.length,
      chunks_retried: chunksRetried,
      chunk_size: CHUNK_SIZE,
      aborted,
      fetch_reduction_pct: fetchReductionPct,
      duration_ms: duration,
      schedule_context: {
        utc_dow: currentDow,
        utc_hour: currentHour,
      },
    };

    console.log('[ingest-rss-cron] Summary:', JSON.stringify(summary));

    return new Response(
      JSON.stringify(summary),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (err) {
    console.error('[ingest-rss-cron] Error:', err);
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: String(err),
        duration_ms: Date.now() - start,
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});