-- Tables and RPC needed by story pipeline functions

-- story_cleanup_log: tracks each cleanup run
CREATE TABLE IF NOT EXISTS story_cleanup_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stories_merged integer NOT NULL DEFAULT 0,
  stories_flagged integer NOT NULL DEFAULT 0,
  teams_processed integer NOT NULL DEFAULT 0,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE story_cleanup_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages story_cleanup_log" ON story_cleanup_log FOR ALL TO service_role USING (true) WITH CHECK (true);

-- story_cleanup_flags: pairs flagged for manual review
CREATE TABLE IF NOT EXISTS story_cleanup_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  story_id_a uuid NOT NULL REFERENCES stories(id),
  story_id_b uuid NOT NULL REFERENCES stories(id),
  reason text NOT NULL,
  similarity_ngram text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE story_cleanup_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages story_cleanup_flags" ON story_cleanup_flags FOR ALL TO service_role USING (true) WITH CHECK (true);

-- update_story_counts RPC: recalculates episode_count and show_count for a story
CREATE OR REPLACE FUNCTION update_story_counts(p_story_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_episode_count integer;
  v_show_count integer;
BEGIN
  SELECT COUNT(*)
  INTO v_episode_count
  FROM episode_stories
  WHERE story_id = p_story_id;

  SELECT COUNT(DISTINCT e.show_id)
  INTO v_show_count
  FROM episode_stories es
  JOIN episodes e ON e.id = es.episode_id
  WHERE es.story_id = p_story_id;

  UPDATE stories
  SET episode_count = v_episode_count,
      show_count = v_show_count,
      updated_at = now()
  WHERE id = p_story_id;
END;
$$;
