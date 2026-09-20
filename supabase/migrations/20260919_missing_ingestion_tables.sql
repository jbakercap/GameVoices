-- ============================================================================
-- Missing tables referenced by ingest-rss Edge Function
-- Run this in Supabase SQL Editor
-- ============================================================================

-- pv_rss_fetch_logs: per-fetch logging for RSS ingestion
CREATE TABLE IF NOT EXISTS pv_rss_fetch_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id uuid REFERENCES pv_podcast_sources(id) ON DELETE CASCADE,
    rss_url text,
    status text NOT NULL,
    http_status integer,
    message text,
    items_found integer DEFAULT 0,
    items_upserted integer DEFAULT 0,
    fetched_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pv_rss_fetch_logs_source_id ON pv_rss_fetch_logs(source_id);

ALTER TABLE pv_rss_fetch_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage fetch logs"
  ON pv_rss_fetch_logs FOR ALL USING (true) WITH CHECK (true);

-- pillars: content categorization (e.g. league-level grouping)
CREATE TABLE IF NOT EXISTS pillars (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text UNIQUE,
    league_id uuid REFERENCES leagues(id),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE pillars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for pillars"
  ON pillars FOR SELECT TO public USING (true);

CREATE POLICY "Service role can manage pillars"
  ON pillars FOR ALL USING (true) WITH CHECK (true);

-- show_pillars: junction table between shows and pillars
CREATE TABLE IF NOT EXISTS show_pillars (
    show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    pillar_id uuid NOT NULL REFERENCES pillars(id) ON DELETE CASCADE,
    is_primary boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    PRIMARY KEY (show_id, pillar_id)
);

ALTER TABLE show_pillars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for show_pillars"
  ON show_pillars FOR SELECT TO public USING (true);

CREATE POLICY "Service role can manage show_pillars"
  ON show_pillars FOR ALL USING (true) WITH CHECK (true);

-- show_subtopics: junction table between shows and subtopics
CREATE TABLE IF NOT EXISTS show_subtopics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    show_id uuid NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
    subtopic_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_show_subtopics_show_id ON show_subtopics(show_id);

ALTER TABLE show_subtopics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for show_subtopics"
  ON show_subtopics FOR SELECT TO public USING (true);

CREATE POLICY "Service role can manage show_subtopics"
  ON show_subtopics FOR ALL USING (true) WITH CHECK (true);

-- rss_feeds: tracks RSS feed URLs mapped to shows
CREATE TABLE IF NOT EXISTS rss_feeds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rss_url text NOT NULL UNIQUE,
    show_id uuid REFERENCES shows(id) ON DELETE CASCADE,
    enabled boolean DEFAULT true,
    default_specialty_slug text,
    last_fetch_at timestamp with time zone,
    last_fetch_status text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE rss_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for rss_feeds"
  ON rss_feeds FOR SELECT TO public USING (true);

CREATE POLICY "Service role can manage rss_feeds"
  ON rss_feeds FOR ALL USING (true) WITH CHECK (true);

-- player_episodes: junction table between players and episodes
CREATE TABLE IF NOT EXISTS player_episodes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    episode_id uuid NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
    mention_type text,
    confidence real,
    source_text text,
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE (player_id, episode_id)
);

CREATE INDEX IF NOT EXISTS idx_player_episodes_episode_id ON player_episodes(episode_id);

ALTER TABLE player_episodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for player_episodes"
  ON player_episodes FOR SELECT TO public USING (true);

CREATE POLICY "Service role can manage player_episodes"
  ON player_episodes FOR ALL USING (true) WITH CHECK (true);

-- Add source_id FK constraint on shows (column exists, FK may not)
DO $$ BEGIN
  ALTER TABLE shows ADD CONSTRAINT shows_source_id_fkey
    FOREIGN KEY (source_id) REFERENCES pv_podcast_sources(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
