-- ============================================================================
-- Ingestion Pipeline Tables
-- Required for ingest-rss and ingest-rss-cron Edge Functions
-- ============================================================================

-- pv_podcast_sources: RSS feed registry
CREATE TABLE IF NOT EXISTS pv_podcast_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    title text NOT NULL,
    publisher text,
    rss_url text NOT NULL,
    apple_podcast_id bigint,
    apple_url text,
    artwork_url text,
    genres_json jsonb DEFAULT '[]'::jsonb,
    specialty text,
    audience text,
    is_kol boolean DEFAULT true,
    active boolean DEFAULT true,
    notes text,
    resolved_via text,
    confidence real,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_fetch_at timestamp with time zone,
    last_fetch_status text,
    last_fetch_message text,
    pillar_id uuid,
    subtopic_ids uuid[],
    tradition_style text,
    format text,
    audience_level text,
    etag text,
    last_modified_header text,
    fetch_interval_hours integer DEFAULT 4,
    publish_days integer[],
    publish_hour_start integer,
    publish_hour_end integer,
    publish_pattern text,
    pattern_analyzed_at timestamp with time zone,
    websub_topic_url text,
    websub_subscribed_at timestamp with time zone,
    websub_expires_at timestamp with time zone,
    next_fetch_at timestamp with time zone,
    failure_count integer NOT NULL DEFAULT 0,
    backoff_until timestamp with time zone,
    self_url_mismatch text
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pv_podcast_sources_rss_url ON pv_podcast_sources(rss_url);

ALTER TABLE pv_podcast_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for pv_podcast_sources"
  ON pv_podcast_sources FOR SELECT TO public USING (true);

CREATE POLICY "Service role can manage pv_podcast_sources"
  ON pv_podcast_sources FOR ALL USING (true) WITH CHECK (true);

-- rss_sync_state: cursor for cron-based ingestion
CREATE TABLE IF NOT EXISTS rss_sync_state (
    id text PRIMARY KEY DEFAULT 'main',
    last_source_id uuid,
    sources_in_current_cycle integer DEFAULT 0,
    cycle_started_at timestamp with time zone DEFAULT now(),
    last_run_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE rss_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage sync state"
  ON rss_sync_state FOR ALL USING (true) WITH CHECK (true);

-- rss_fetch_jobs: job queue for RSS fetches
CREATE TABLE IF NOT EXISTS rss_fetch_jobs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id uuid NOT NULL REFERENCES pv_podcast_sources(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','dead')),
    attempts integer NOT NULL DEFAULT 0,
    locked_until timestamp with time zone,
    run_after timestamp with time zone NOT NULL DEFAULT now(),
    last_error text,
    started_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rss_fetch_jobs_active_source
  ON rss_fetch_jobs(source_id) WHERE status IN ('pending','running');

CREATE INDEX IF NOT EXISTS idx_rss_fetch_jobs_run_after
  ON rss_fetch_jobs(run_after) WHERE status = 'pending';

ALTER TABLE rss_fetch_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage fetch jobs"
  ON rss_fetch_jobs FOR ALL USING (true) WITH CHECK (true);

-- rss_cron_logs: logging for cron runs
CREATE TABLE IF NOT EXISTS rss_cron_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    started_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    sources_processed integer DEFAULT 0,
    episodes_added integer DEFAULT 0,
    errors jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'running',
    details jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE rss_cron_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage cron logs"
  ON rss_cron_logs FOR ALL USING (true) WITH CHECK (true);

-- app_config: key-value config store
CREATE TABLE IF NOT EXISTS app_config (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for app_config"
  ON app_config FOR SELECT TO public USING (true);

CREATE POLICY "Service role can manage app_config"
  ON app_config FOR ALL USING (true) WITH CHECK (true);

-- team_x_accounts: X/Twitter accounts per team (used by fetch-x-feed)
CREATE TABLE IF NOT EXISTS team_x_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid REFERENCES teams(id),
    handle text NOT NULL,
    display_name text,
    account_type text,
    outlet text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_x_accounts_team_id ON team_x_accounts(team_id);

ALTER TABLE team_x_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for team_x_accounts"
  ON team_x_accounts FOR SELECT TO public USING (true);

CREATE POLICY "Service role can manage team_x_accounts"
  ON team_x_accounts FOR ALL USING (true) WITH CHECK (true);

-- Add source_id FK to shows if not exists
DO $$ BEGIN
  ALTER TABLE shows ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES pv_podcast_sources(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
