-- ============================================================================
-- GameVoices Supabase Migration
-- Generated for React Native app (TestFlight build 7)
-- 30 tables + helper functions + search RPCs + RLS policies + storage
-- ============================================================================

-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch SCHEMA extensions;

-- ============================================================================
-- 2. CUSTOM TYPES
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'creator', 'user');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 3. TABLES (dependency order)
-- ============================================================================

-- -------------------------------------------------------
-- leagues (no deps)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS leagues (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  short_name text NOT NULL,
  sport text NOT NULL,
  icon text,
  primary_color text,
  secondary_color text,
  description text,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  logo_url text,
  CONSTRAINT leagues_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- games (no deps)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS games (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sport text NOT NULL,
  league text NOT NULL,
  home_team_slug text NOT NULL,
  away_team_slug text NOT NULL,
  home_score integer,
  away_score integer,
  event_date date NOT NULL,
  game_time timestamp with time zone,
  status text DEFAULT 'scheduled'::text,
  espn_game_id text,
  venue text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  period text,
  display_period text,
  last_play text,
  home_win_probability numeric,
  away_win_probability numeric,
  CONSTRAINT games_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- speakers (no deps)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS speakers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  first_name text,
  last_name text,
  credentials text,
  primary_affiliation text,
  affiliation_city text,
  affiliation_state text,
  photo_url text,
  twitter_handle text,
  match_confidence numeric DEFAULT 1.0,
  needs_review boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT speakers_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- teams (depends on leagues)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL,
  slug text NOT NULL,
  name text NOT NULL,
  short_name text NOT NULL,
  city text NOT NULL,
  abbreviation text NOT NULL,
  conference text,
  division text,
  primary_color text,
  secondary_color text,
  logo_url text,
  espn_team_id integer,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  new_episode_count integer DEFAULT 0,
  last_synthesized_at timestamp with time zone,
  daily_synthesis_count integer DEFAULT 0,
  google_news_query text,
  locked_until timestamp with time zone,
  record text,
  division_rank integer,
  conference_rank integer,
  streak text,
  standings_updated_at timestamp with time zone,
  x_list_id text,
  x_cache_refreshed_at timestamp with time zone,
  x_refresh_priority integer DEFAULT 1,
  CONSTRAINT teams_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- players (no FK deps, team_slug is text)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  name text NOT NULL,
  team_slug text,
  sport text,
  "position" text,
  created_at timestamp with time zone DEFAULT now(),
  jersey_number integer,
  role text DEFAULT 'player'::text,
  status text DEFAULT 'active'::text,
  previous_team_slug text,
  espn_id text,
  headshot_url text,
  updated_at timestamp with time zone DEFAULT now(),
  twitter_handle text,
  x_user_id text,
  CONSTRAINT players_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- shows (depends on leagues, teams)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS shows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  artwork_url text,
  rss_url text,
  site_url text,
  hosts_json jsonb DEFAULT '[]'::jsonb,
  specialty_slugs_json jsonb DEFAULT '[]'::jsonb,
  claim_status text DEFAULT 'unclaimed'::text,
  claimed_by_user_id uuid,
  is_featured boolean DEFAULT false,
  featured_rank integer,
  episode_count integer DEFAULT 0,
  last_episode_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  source_id uuid,
  primary_topic text,
  focus_areas text[],
  audience text,
  content_type text,
  publisher text,
  claimed_at timestamp with time zone,
  verification_method text,
  itunes_id text,
  source_type text,
  owner_email text,
  status text DEFAULT 'active'::text,
  removal_requested_at timestamp with time zone,
  removal_requested_by uuid,
  format text,
  league_id uuid,
  team_id uuid,
  state text,
  city text,
  ai_enrichment_pending boolean DEFAULT false,
  ai_enriched_at timestamp with time zone,
  is_betting_show boolean DEFAULT false,
  is_fantasy_show boolean DEFAULT false,
  is_featured_multisport boolean NOT NULL DEFAULT false,
  is_featured_league boolean NOT NULL DEFAULT false,
  artwork_storage_path text,
  artwork_cached_at timestamp with time zone,
  artwork_content_hash text,
  youtube_url text,
  twitter_handle text,
  substack_url text,
  tiktok_url text,
  instagram_url text,
  team_slugs text[],
  market text,
  artwork_cache_failed_at timestamp with time zone,
  x_user_id text,
  youtube_channel_id text,
  CONSTRAINT shows_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- episodes (depends on shows)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS episodes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  guid text NOT NULL,
  episode_url text,
  title text NOT NULL,
  description text,
  audio_url text NOT NULL,
  audio_type text,
  duration_seconds integer,
  artwork_url text,
  published_at timestamp with time zone,
  topic_slug text,
  is_featured boolean DEFAULT false,
  featured_rank integer,
  audio_status text DEFAULT 'ok'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  audio_url_hash text,
  extracted_tags jsonb DEFAULT '{}'::jsonb,
  tags_extracted_at timestamp with time zone,
  is_video boolean DEFAULT false,
  alternate_media_id uuid,
  signals_extracted_at timestamp with time zone,
  stories_extracted_at timestamp with time zone,
  search_vector tsvector,
  speakers_extracted_at timestamp with time zone,
  artwork_storage_path text,
  artwork_content_hash text,
  artwork_cache_failed_at timestamp with time zone,
  tags_extraction_started_at timestamp with time zone,
  video_url text,
  is_syndication_dupe boolean DEFAULT false,
  syndication_source_id uuid,
  pending_syndication_copy boolean DEFAULT false,
  youtube_offset_seconds integer,
  youtube_video_id text,
  youtube_match_confidence real,
  player_resolve_attempts smallint NOT NULL DEFAULT 0,
  tag_extraction_attempts smallint NOT NULL DEFAULT 0,
  pinned_comment_id uuid,
  CONSTRAINT episodes_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- stories (depends on games)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS stories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  headline text NOT NULL,
  slug text NOT NULL,
  story_type text NOT NULL,
  sport text NOT NULL,
  team_slugs text[] DEFAULT '{}'::text[],
  people text[] DEFAULT '{}'::text[],
  event_date date,
  expires_at timestamp with time zone,
  status text NOT NULL DEFAULT 'active'::text,
  show_count integer NOT NULL DEFAULT 0,
  episode_count integer NOT NULL DEFAULT 0,
  primary_count integer NOT NULL DEFAULT 0,
  first_seen_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  narrative_key text,
  ai_reviewed boolean NOT NULL DEFAULT false,
  review_status text,
  review_notes text,
  narrative_topic text,
  narrative_scope text,
  primary_entity_slug text,
  confidence_level text NOT NULL DEFAULT 'official'::text,
  last_mentioned_at timestamp with time zone,
  matchup_key text,
  embedding_model text,
  embedding_updated_at timestamp with time zone,
  story_anchor text,
  source_type text DEFAULT 'legacy'::text,
  game_id uuid,
  CONSTRAINT stories_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- profiles (user_id references auth.users)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  display_name text,
  email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  topic_slugs text[] DEFAULT '{}'::text[],
  avatar_url text,
  user_type text DEFAULT 'professional'::text,
  primary_interest text,
  city text,
  state text,
  zip_code text,
  signup_method text,
  professional_details jsonb DEFAULT '{}'::jsonb,
  first_name text,
  last_name text,
  role_title text,
  welcome_email_sent_at timestamp with time zone,
  preferred_team_slug text,
  twitter_handle text,
  bio text,
  youtube_url text,
  substack_url text,
  tiktok_url text,
  instagram_url text,
  is_public boolean NOT NULL DEFAULT true,
  username text,
  push_token text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- user_roles (user_id references auth.users)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- episode_comments
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS episode_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  parent_id uuid,
  timestamp_seconds integer,
  CONSTRAINT episode_comments_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- episode_comment_likes
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS episode_comment_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT episode_comment_likes_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- episode_likes
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS episode_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT episode_likes_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- episode_stories
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS episode_stories (
  episode_id uuid NOT NULL,
  story_id uuid NOT NULL,
  relevance text NOT NULL DEFAULT 'strong'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT episode_stories_pkey PRIMARY KEY (episode_id, story_id)
);

-- -------------------------------------------------------
-- episode_speakers
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS episode_speakers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL,
  speaker_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'guest'::text,
  credited_name text,
  credited_title text,
  credited_affiliation text,
  display_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT episode_speakers_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- user_library
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_library (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_type text NOT NULL,
  episode_id uuid,
  show_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  speaker_id uuid,
  story_id uuid,
  player_id uuid,
  CONSTRAINT user_library_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- user_listen_history
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_listen_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  listened_at timestamp with time zone DEFAULT now(),
  duration_listened integer DEFAULT 0,
  position_seconds integer DEFAULT 0,
  completed boolean DEFAULT false,
  CONSTRAINT user_listen_history_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- user_playback
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_playback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  position_seconds integer DEFAULT 0,
  completed boolean DEFAULT false,
  started_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_playback_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- user_queue
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  "position" integer NOT NULL,
  added_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_queue_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- notifications
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  actor_id uuid,
  type text NOT NULL,
  clip_id uuid,
  comment_id uuid,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  episode_id uuid,
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- friendships
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS friendships (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  addressee_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT friendships_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- bookmarks
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS bookmarks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  timestamp_seconds integer NOT NULL,
  note text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT clinical_pearls_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- playlists
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS playlists (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_public boolean DEFAULT false,
  public_code text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT playlists_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- playlist_items
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS playlist_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  playlist_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  "position" integer NOT NULL DEFAULT 0,
  added_at timestamp with time zone DEFAULT now(),
  CONSTRAINT playlist_items_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- podcast_claims
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS podcast_claims (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  verification_method text NOT NULL,
  verification_token text,
  verification_sent_at timestamp with time zone,
  verification_completed_at timestamp with time zone,
  admin_notes text,
  submitted_at timestamp with time zone DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT podcast_claims_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- podcast_submissions
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS podcast_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  rss_url text,
  title text,
  description text,
  artwork_url text,
  publisher text,
  episode_count integer,
  primary_specialty text,
  secondary_specialties text[],
  status text NOT NULL DEFAULT 'pending'::text,
  admin_notes text,
  rejection_reason text,
  created_show_id uuid,
  submitted_at timestamp with time zone DEFAULT now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  fast_track boolean DEFAULT false,
  apple_podcast_id bigint,
  apple_url text,
  CONSTRAINT podcast_submissions_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- show_hosts
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS show_hosts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  show_id uuid NOT NULL,
  speaker_id uuid NOT NULL,
  is_primary boolean DEFAULT false,
  display_order integer DEFAULT 0,
  extracted_name text,
  extracted_from text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT show_hosts_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- x_feed_cache
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS x_feed_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cache_key text NOT NULL,
  handle text NOT NULL,
  post_id text NOT NULL,
  post_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  posted_at timestamp with time zone NOT NULL,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  has_video boolean DEFAULT false,
  CONSTRAINT x_feed_cache_pkey PRIMARY KEY (id)
);

-- -------------------------------------------------------
-- player_stories
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS player_stories (
  player_id uuid NOT NULL,
  story_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT player_stories_pkey PRIMARY KEY (player_id, story_id)
);

-- -------------------------------------------------------
-- user_follows
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_follows (
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_follows_pkey PRIMARY KEY (follower_id, following_id)
);

-- ============================================================================
-- 4. FOREIGN KEYS (only where both tables exist or target is auth.users)
-- ============================================================================

-- teams
ALTER TABLE teams ADD CONSTRAINT teams_league_id_fkey
  FOREIGN KEY (league_id) REFERENCES leagues(id) ON DELETE CASCADE;

-- shows
ALTER TABLE shows ADD CONSTRAINT shows_league_id_fkey
  FOREIGN KEY (league_id) REFERENCES leagues(id);
ALTER TABLE shows ADD CONSTRAINT shows_team_id_fkey
  FOREIGN KEY (team_id) REFERENCES teams(id);
ALTER TABLE shows ADD CONSTRAINT shows_claimed_by_user_id_fkey
  FOREIGN KEY (claimed_by_user_id) REFERENCES auth.users(id);
-- NOTE: shows_source_id_fkey skipped (references pv_podcast_sources, not in our 30 tables)

-- episodes
ALTER TABLE episodes ADD CONSTRAINT episodes_show_id_fkey
  FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;
ALTER TABLE episodes ADD CONSTRAINT episodes_alternate_media_id_fkey
  FOREIGN KEY (alternate_media_id) REFERENCES episodes(id);
ALTER TABLE episodes ADD CONSTRAINT episodes_syndication_source_id_fkey
  FOREIGN KEY (syndication_source_id) REFERENCES episodes(id);
ALTER TABLE episodes ADD CONSTRAINT episodes_pinned_comment_id_fkey
  FOREIGN KEY (pinned_comment_id) REFERENCES episode_comments(id) ON DELETE SET NULL;

-- stories
ALTER TABLE stories ADD CONSTRAINT stories_game_id_fkey
  FOREIGN KEY (game_id) REFERENCES games(id);

-- profiles
ALTER TABLE profiles ADD CONSTRAINT profiles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- user_roles
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- episode_comments
ALTER TABLE episode_comments ADD CONSTRAINT episode_comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE episode_comments ADD CONSTRAINT episode_comments_episode_id_fkey
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;
ALTER TABLE episode_comments ADD CONSTRAINT episode_comments_parent_id_fkey
  FOREIGN KEY (parent_id) REFERENCES episode_comments(id) ON DELETE CASCADE;

-- episode_comment_likes
ALTER TABLE episode_comment_likes ADD CONSTRAINT episode_comment_likes_comment_id_fkey
  FOREIGN KEY (comment_id) REFERENCES episode_comments(id) ON DELETE CASCADE;
ALTER TABLE episode_comment_likes ADD CONSTRAINT episode_comment_likes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- episode_likes
ALTER TABLE episode_likes ADD CONSTRAINT episode_likes_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE episode_likes ADD CONSTRAINT episode_likes_episode_id_fkey
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;

-- episode_stories
ALTER TABLE episode_stories ADD CONSTRAINT episode_stories_episode_id_fkey
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;
ALTER TABLE episode_stories ADD CONSTRAINT episode_stories_story_id_fkey
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;

-- episode_speakers
ALTER TABLE episode_speakers ADD CONSTRAINT episode_speakers_episode_id_fkey
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;
ALTER TABLE episode_speakers ADD CONSTRAINT episode_speakers_speaker_id_fkey
  FOREIGN KEY (speaker_id) REFERENCES speakers(id) ON DELETE CASCADE;

-- user_library
ALTER TABLE user_library ADD CONSTRAINT user_library_episode_id_fkey
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;
ALTER TABLE user_library ADD CONSTRAINT user_library_show_id_fkey
  FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;
ALTER TABLE user_library ADD CONSTRAINT user_library_speaker_id_fkey
  FOREIGN KEY (speaker_id) REFERENCES speakers(id) ON DELETE CASCADE;
ALTER TABLE user_library ADD CONSTRAINT user_library_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;

-- user_listen_history
ALTER TABLE user_listen_history ADD CONSTRAINT user_listen_history_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_listen_history ADD CONSTRAINT user_listen_history_episode_id_fkey
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;

-- user_playback
ALTER TABLE user_playback ADD CONSTRAINT user_playback_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_playback ADD CONSTRAINT user_playback_episode_id_fkey
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;

-- user_queue
ALTER TABLE user_queue ADD CONSTRAINT user_queue_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_queue ADD CONSTRAINT user_queue_episode_id_fkey
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;

-- notifications
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_episode_id_fkey
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;
-- NOTE: notifications_clip_id_fkey skipped (references fan_clips)
-- NOTE: notifications_comment_id_fkey skipped (references clip_comments)

-- friendships
ALTER TABLE friendships ADD CONSTRAINT friendships_requester_id_fkey
  FOREIGN KEY (requester_id) REFERENCES profiles(user_id);
ALTER TABLE friendships ADD CONSTRAINT friendships_addressee_id_fkey
  FOREIGN KEY (addressee_id) REFERENCES profiles(user_id);

-- bookmarks
ALTER TABLE bookmarks ADD CONSTRAINT clinical_pearls_episode_id_fkey
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;

-- playlist_items
ALTER TABLE playlist_items ADD CONSTRAINT playlist_items_playlist_id_fkey
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE;
ALTER TABLE playlist_items ADD CONSTRAINT playlist_items_episode_id_fkey
  FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE;

-- podcast_claims
ALTER TABLE podcast_claims ADD CONSTRAINT podcast_claims_show_id_fkey
  FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;

-- podcast_submissions
ALTER TABLE podcast_submissions ADD CONSTRAINT podcast_submissions_created_show_id_fkey
  FOREIGN KEY (created_show_id) REFERENCES shows(id);

-- show_hosts
ALTER TABLE show_hosts ADD CONSTRAINT show_hosts_show_id_fkey
  FOREIGN KEY (show_id) REFERENCES shows(id) ON DELETE CASCADE;
ALTER TABLE show_hosts ADD CONSTRAINT show_hosts_speaker_id_fkey
  FOREIGN KEY (speaker_id) REFERENCES speakers(id) ON DELETE CASCADE;

-- player_stories
ALTER TABLE player_stories ADD CONSTRAINT player_stories_player_id_fkey
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE player_stories ADD CONSTRAINT player_stories_story_id_fkey
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE;

-- user_follows
ALTER TABLE user_follows ADD CONSTRAINT user_follows_follower_id_fkey
  FOREIGN KEY (follower_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_follows ADD CONSTRAINT user_follows_following_id_fkey
  FOREIGN KEY (following_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============================================================================
-- 5. INDEXES (only for our 30 tables)
-- ============================================================================

-- leagues
CREATE UNIQUE INDEX IF NOT EXISTS leagues_slug_key ON leagues USING btree (slug);

-- games
CREATE UNIQUE INDEX IF NOT EXISTS games_espn_game_id_key ON games USING btree (espn_game_id);
CREATE INDEX IF NOT EXISTS idx_games_event_date ON games USING btree (event_date);
CREATE INDEX IF NOT EXISTS idx_games_league_date ON games USING btree (league, event_date);
CREATE INDEX IF NOT EXISTS idx_games_teams ON games USING btree (home_team_slug, away_team_slug);

-- speakers
CREATE UNIQUE INDEX IF NOT EXISTS speakers_name_affiliation_idx ON speakers USING btree (lower(full_name), lower(COALESCE(primary_affiliation, ''::text)));

-- teams
CREATE UNIQUE INDEX IF NOT EXISTS teams_slug_key ON teams USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_teams_league_id ON teams USING btree (league_id);
CREATE INDEX IF NOT EXISTS idx_teams_slug ON teams USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_teams_espn_team_id ON teams USING btree (espn_team_id);
CREATE INDEX IF NOT EXISTS idx_teams_locked_until ON teams USING btree (locked_until);

-- players
CREATE UNIQUE INDEX IF NOT EXISTS players_slug_key ON players USING btree (slug);
CREATE UNIQUE INDEX IF NOT EXISTS players_espn_id_key ON players USING btree (espn_id);
CREATE INDEX IF NOT EXISTS idx_players_team_slug ON players USING btree (team_slug);
CREATE INDEX IF NOT EXISTS idx_players_sport ON players USING btree (sport);
CREATE INDEX IF NOT EXISTS idx_players_status ON players USING btree (status);
CREATE INDEX IF NOT EXISTS idx_players_espn_id ON players USING btree (espn_id);
CREATE INDEX IF NOT EXISTS idx_players_slug ON players USING btree (slug);

-- shows
CREATE UNIQUE INDEX IF NOT EXISTS shows_rss_url_key ON shows USING btree (rss_url);
CREATE INDEX IF NOT EXISTS idx_shows_hosts_json_gin ON shows USING gin (hosts_json);
CREATE INDEX IF NOT EXISTS idx_shows_itunes_id ON shows USING btree (itunes_id) WHERE (itunes_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_shows_publisher_trgm ON shows USING gin (publisher gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_shows_search ON shows USING gin (to_tsvector('english'::regconfig, ((((COALESCE(title, ''::text) || ' '::text) || COALESCE(publisher, ''::text)) || ' '::text) || COALESCE(description, ''::text))));
CREATE INDEX IF NOT EXISTS idx_shows_title_trgm ON shows USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS shows_created_at_idx ON shows USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS shows_is_featured_idx ON shows USING btree (is_featured) WHERE (is_featured = true);
CREATE INDEX IF NOT EXISTS idx_shows_team_id ON shows USING btree (team_id);
CREATE INDEX IF NOT EXISTS idx_shows_ai_enrichment_pending ON shows USING btree (ai_enrichment_pending) WHERE (ai_enrichment_pending = true);

-- episodes
CREATE UNIQUE INDEX IF NOT EXISTS episodes_show_id_guid_key ON episodes USING btree (show_id, guid);
CREATE UNIQUE INDEX IF NOT EXISTS episodes_show_audiohash_unique ON episodes USING btree (show_id, audio_url_hash) WHERE ((audio_url_hash IS NOT NULL) AND (length(audio_url_hash) > 0));
CREATE INDEX IF NOT EXISTS episodes_show_id_published_at_idx ON episodes USING btree (show_id, published_at DESC);
CREATE INDEX IF NOT EXISTS episodes_published_at_idx ON episodes USING btree (published_at DESC);
CREATE INDEX IF NOT EXISTS episodes_is_featured_idx ON episodes USING btree (is_featured) WHERE (is_featured = true);
CREATE INDEX IF NOT EXISTS episodes_specialty_slug_idx ON episodes USING btree (topic_slug);
CREATE INDEX IF NOT EXISTS idx_episodes_youtube_video_id ON episodes USING btree (youtube_video_id) WHERE (youtube_video_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_episodes_published_at_show_id ON episodes USING btree (published_at, show_id) WHERE (is_syndication_dupe = false);
CREATE INDEX IF NOT EXISTS idx_episodes_syndication_lookup ON episodes USING btree (is_syndication_dupe) WHERE (is_syndication_dupe = true);
CREATE INDEX IF NOT EXISTS idx_episodes_untagged_published_at ON episodes USING btree (published_at DESC) WHERE (tags_extracted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_episodes_tag_lock ON episodes USING btree (tags_extraction_started_at) WHERE (tags_extracted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_episodes_tags_extracted_at_recent ON episodes USING btree (tags_extracted_at DESC) WHERE (tags_extracted_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_episodes_published_show ON episodes USING btree (published_at DESC, show_id);
CREATE INDEX IF NOT EXISTS idx_episodes_stories_extracted ON episodes USING btree (stories_extracted_at) WHERE (stories_extracted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_episodes_search_vector ON episodes USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_episodes_created_at ON episodes USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_title_trgm ON episodes USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_episodes_show_id ON episodes USING btree (show_id);
CREATE INDEX IF NOT EXISTS idx_episodes_published_at ON episodes USING btree (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_is_video ON episodes USING btree (is_video) WHERE (is_video = true);
CREATE INDEX IF NOT EXISTS idx_episodes_extracted_tags_gin ON episodes USING gin (extracted_tags);
CREATE INDEX IF NOT EXISTS idx_episodes_alternate_media ON episodes USING btree (alternate_media_id) WHERE (alternate_media_id IS NOT NULL);

-- stories
CREATE UNIQUE INDEX IF NOT EXISTS stories_slug_key ON stories USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_stories_game_id ON stories USING btree (game_id);
CREATE INDEX IF NOT EXISTS idx_stories_narrative_key ON stories USING btree (narrative_key);
CREATE INDEX IF NOT EXISTS idx_stories_headline_trgm ON stories USING gin (headline gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories USING btree (status);
CREATE INDEX IF NOT EXISTS idx_stories_sport ON stories USING btree (sport);
CREATE INDEX IF NOT EXISTS idx_stories_matchup_key ON stories USING btree (matchup_key) WHERE (matchup_key IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_stories_last_mentioned_at ON stories USING btree (last_mentioned_at);
CREATE INDEX IF NOT EXISTS idx_stories_team_slugs ON stories USING gin (team_slugs);
CREATE INDEX IF NOT EXISTS idx_stories_people ON stories USING gin (people);
CREATE INDEX IF NOT EXISTS idx_stories_story_type ON stories USING btree (story_type);
CREATE INDEX IF NOT EXISTS idx_stories_event_date ON stories USING btree (event_date);
CREATE INDEX IF NOT EXISTS idx_stories_confidence_level ON stories USING btree (confidence_level);
CREATE INDEX IF NOT EXISTS idx_stories_sport_type_expires ON stories USING btree (sport, story_type, expires_at);
CREATE INDEX IF NOT EXISTS idx_stories_story_anchor ON stories USING btree (story_anchor) WHERE (story_anchor IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_stories_source_type ON stories USING btree (source_type);

-- profiles
CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_key ON profiles USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON profiles USING btree (username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower ON profiles USING btree (lower(username));

-- user_roles
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_id_role_key ON user_roles USING btree (user_id, role);

-- episode_comments
-- (pkey index created automatically)

-- episode_comment_likes
CREATE UNIQUE INDEX IF NOT EXISTS episode_comment_likes_comment_id_user_id_key ON episode_comment_likes USING btree (comment_id, user_id);

-- episode_likes
CREATE UNIQUE INDEX IF NOT EXISTS episode_likes_user_id_episode_id_key ON episode_likes USING btree (user_id, episode_id);

-- episode_stories
CREATE INDEX IF NOT EXISTS idx_episode_stories_episode ON episode_stories USING btree (episode_id);
CREATE INDEX IF NOT EXISTS idx_episode_stories_story ON episode_stories USING btree (story_id);
CREATE INDEX IF NOT EXISTS idx_episode_stories_relevance ON episode_stories USING btree (relevance);

-- episode_speakers
CREATE UNIQUE INDEX IF NOT EXISTS episode_speakers_episode_id_speaker_id_key ON episode_speakers USING btree (episode_id, speaker_id);
CREATE INDEX IF NOT EXISTS idx_episode_speakers_speaker_id ON episode_speakers USING btree (speaker_id);

-- user_library
CREATE UNIQUE INDEX IF NOT EXISTS user_library_unique_episode ON user_library USING btree (user_id, item_type, episode_id) WHERE (episode_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS user_library_unique_show ON user_library USING btree (user_id, item_type, show_id) WHERE (show_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS user_library_unique_story ON user_library USING btree (user_id, item_type, story_id) WHERE (story_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS user_library_speaker_unique ON user_library USING btree (user_id, speaker_id) WHERE ((item_type = 'follow_speaker'::text) AND (speaker_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_library_follow_player ON user_library USING btree (user_id, player_id) WHERE (item_type = 'follow_player'::text);
CREATE INDEX IF NOT EXISTS idx_user_library_user_id ON user_library USING btree (user_id);
CREATE INDEX IF NOT EXISTS user_library_user_type_idx ON user_library USING btree (user_id, item_type);
CREATE INDEX IF NOT EXISTS idx_user_library_player_id ON user_library USING btree (player_id) WHERE (player_id IS NOT NULL);

-- user_listen_history
CREATE INDEX IF NOT EXISTS idx_user_listen_history_user ON user_listen_history USING btree (user_id, listened_at DESC);

-- user_playback
CREATE UNIQUE INDEX IF NOT EXISTS user_playback_user_id_episode_id_key ON user_playback USING btree (user_id, episode_id);
CREATE INDEX IF NOT EXISTS idx_user_playback_user_id ON user_playback USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_user_playback_updated ON user_playback USING btree (user_id, updated_at DESC);

-- user_queue
CREATE UNIQUE INDEX IF NOT EXISTS user_queue_user_id_episode_id_key ON user_queue USING btree (user_id, episode_id);
CREATE INDEX IF NOT EXISTS idx_user_queue_user ON user_queue USING btree (user_id, "position");

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications USING btree (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications USING btree (user_id, read);

-- friendships
CREATE UNIQUE INDEX IF NOT EXISTS unique_friendship ON friendships USING btree (requester_id, addressee_id);
CREATE INDEX IF NOT EXISTS friendships_requester_id_status_idx ON friendships USING btree (requester_id, status);
CREATE INDEX IF NOT EXISTS friendships_addressee_id_status_idx ON friendships USING btree (addressee_id, status);

-- bookmarks
CREATE UNIQUE INDEX IF NOT EXISTS unique_pearl ON bookmarks USING btree (user_id, episode_id, timestamp_seconds);
CREATE INDEX IF NOT EXISTS idx_pearls_user_id ON bookmarks USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_pearls_episode_id ON bookmarks USING btree (episode_id);

-- playlists
CREATE INDEX IF NOT EXISTS idx_playlists_user ON playlists USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_playlists_public_code ON playlists USING btree (public_code) WHERE (public_code IS NOT NULL);

-- playlist_items
CREATE UNIQUE INDEX IF NOT EXISTS playlist_items_playlist_id_episode_id_key ON playlist_items USING btree (playlist_id, episode_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items USING btree (playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_position ON playlist_items USING btree (playlist_id, "position");

-- podcast_claims
CREATE UNIQUE INDEX IF NOT EXISTS podcast_claims_unique_pending ON podcast_claims USING btree (show_id, user_id) WHERE (status = 'pending'::text);

-- podcast_submissions
-- (pkey index only)

-- show_hosts
CREATE UNIQUE INDEX IF NOT EXISTS show_hosts_show_id_speaker_id_key ON show_hosts USING btree (show_id, speaker_id);

-- x_feed_cache
CREATE UNIQUE INDEX IF NOT EXISTS x_feed_cache_cache_key_post_id_key ON x_feed_cache USING btree (cache_key, post_id);
CREATE INDEX IF NOT EXISTS idx_x_feed_cache_posted ON x_feed_cache USING btree (cache_key, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_x_feed_cache_key ON x_feed_cache USING btree (cache_key);
CREATE INDEX IF NOT EXISTS idx_x_feed_cache_video ON x_feed_cache USING btree (cache_key, posted_at DESC) WHERE (has_video = true);

-- player_stories
CREATE INDEX IF NOT EXISTS idx_player_stories_story ON player_stories USING btree (story_id);

-- user_follows
CREATE INDEX IF NOT EXISTS idx_user_follows_following_id ON user_follows USING btree (following_id);

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- -------------------------------------------------------
-- has_role(_user_id uuid, _role app_role) returns boolean
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- -------------------------------------------------------
-- is_show_owner(_show_id uuid) returns boolean
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION is_show_owner(_show_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shows
    WHERE id = _show_id
    AND claimed_by_user_id = auth.uid()
    AND claim_status = 'claimed'
  )
$$;

-- -------------------------------------------------------
-- resolve_team_nickname(query text) returns TABLE
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION resolve_team_nickname(query text)
RETURNS TABLE(team_name text, team_city text, team_slug text, team_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  resolved_name text;
  q text := lower(trim(query));
BEGIN
  resolved_name := CASE q
    WHEN 'pats' THEN 'Patriots'
    WHEN 'sox' THEN NULL
    WHEN 'niners' THEN '49ers'
    WHEN 'bolts' THEN 'Chargers'
    WHEN 'birds' THEN 'Eagles'
    WHEN 'pack' THEN 'Packers'
    WHEN 'fins' THEN 'Dolphins'
    WHEN 'jags' THEN 'Jaguars'
    WHEN 'hawks' THEN NULL
    WHEN 'cards' THEN 'Cardinals'
    WHEN 'bucs' THEN 'Buccaneers'
    WHEN 'vikes' THEN 'Vikings'
    WHEN 'skins' THEN 'Commanders'
    WHEN 'nats' THEN 'Nationals'
    WHEN 'stros' THEN 'Astros'
    WHEN 'halos' THEN 'Angels'
    WHEN 'phils' THEN 'Phillies'
    WHEN 'yanks' THEN 'Yankees'
    WHEN 'dubs' THEN 'Warriors'
    WHEN 'clips' THEN 'Clippers'
    WHEN 'blazers' THEN 'Trail Blazers'
    WHEN 'wolves' THEN 'Timberwolves'
    WHEN 'sixers' THEN '76ers'
    WHEN 'grizz' THEN 'Grizzlies'
    WHEN 'pels' THEN 'Pelicans'
    WHEN 'wiz' THEN 'Wizards'
    WHEN 'habs' THEN 'Canadiens'
    WHEN 'sens' THEN 'Senators'
    WHEN 'pens' THEN 'Penguins'
    WHEN 'caps' THEN 'Capitals'
    WHEN 'avs' THEN 'Avalanche'
    WHEN 'jackets' THEN 'Blue Jackets'
    WHEN 'wings' THEN 'Red Wings'
    WHEN 'isles' THEN 'Islanders'
    ELSE NULL
  END;

  IF resolved_name IS NOT NULL THEN
    RETURN QUERY
    SELECT t.name, t.city, t.slug, t.id
    FROM public.teams t
    WHERE t.short_name = resolved_name OR t.name ILIKE '%' || resolved_name || '%'
    LIMIT 3;
  END IF;
END;
$$;

-- ============================================================================
-- 7. SEARCH / RPC FUNCTIONS
-- ============================================================================

-- -------------------------------------------------------
-- get_episode_play_counts
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION get_episode_play_counts(episode_ids uuid[])
RETURNS TABLE(episode_id uuid, play_count bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT episode_id, COUNT(*) as play_count
  FROM user_listen_history
  WHERE episode_id = ANY(episode_ids)
  GROUP BY episode_id;
$$;

-- -------------------------------------------------------
-- search_shows
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION search_shows(
  search_query text,
  result_limit integer DEFAULT 20,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  artwork_url text,
  publisher text,
  episode_count integer,
  rank float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  search_pattern text;
  tsquery_val tsquery;
  phrase_tsquery tsquery;
  search_words text[];
  normalized_query text;
BEGIN
  search_pattern := '%' || search_query || '%';
  search_words := regexp_split_to_array(lower(trim(search_query)), '\s+');
  normalized_query := lower(regexp_replace(trim(search_query), '[^a-zA-Z0-9]', '', 'g'));

  BEGIN
    IF array_length(search_words, 1) > 1 THEN
      phrase_tsquery := phraseto_tsquery('english', search_query);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    phrase_tsquery := NULL;
  END;

  BEGIN tsquery_val := plainto_tsquery('english', search_query);
  EXCEPTION WHEN OTHERS THEN tsquery_val := NULL; END;

  RETURN QUERY
  WITH abbrev_match AS (
    SELECT t.name AS team_name, t.city AS team_city, t.slug AS team_slug, t.id AS team_id
    FROM public.teams t
    WHERE upper(t.abbreviation) = upper(trim(search_query))
    LIMIT 1
  ),
  nickname_match AS (
    SELECT rtn.team_name, rtn.team_city, rtn.team_slug, rtn.team_id
    FROM public.resolve_team_nickname(search_query) rtn
  ),
  team_lookup AS (
    SELECT * FROM abbrev_match
    UNION ALL
    SELECT * FROM nickname_match
  ),
  user_teams AS (
    SELECT unnest(p.topic_slugs) AS team_slug
    FROM public.profiles p
    WHERE p_user_id IS NOT NULL AND p.user_id = p_user_id
  ),
  user_team_ids AS (
    SELECT t.id AS team_id
    FROM user_teams ut
    JOIN public.teams t ON t.slug = ut.team_slug
  ),
  candidates AS (
    SELECT
      s.id,
      s.title,
      s.description,
      s.artwork_url,
      s.publisher,
      s.episode_count,
      s.hosts_json,
      s.team_id AS show_team_id
    FROM public.shows s
    WHERE
      (s.status = 'active' OR s.status IS NULL)
      AND (
        s.title ILIKE search_pattern
        OR s.publisher ILIKE search_pattern
        OR (array_length(search_words, 1) > 1
            AND (SELECT bool_and(lower(s.title) LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1))
        OR (array_length(search_words, 1) > 1
            AND s.publisher IS NOT NULL
            AND (SELECT bool_and(lower(s.publisher) LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1))
        OR (tsquery_val IS NOT NULL
            AND to_tsvector('english', COALESCE(s.title, '') || ' ' || COALESCE(s.description, '')) @@ tsquery_val)
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(s.hosts_json, '[]'::jsonb)) AS host
          WHERE host->>'name' ILIKE search_pattern
        )
        OR (array_length(search_words, 1) > 1
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(COALESCE(s.hosts_json, '[]'::jsonb)) AS host
              WHERE (SELECT bool_and(lower(host->>'name') LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1)
            ))
        OR EXISTS (
          SELECT 1 FROM team_lookup tl
          WHERE s.title ILIKE '%' || tl.team_name || '%'
             OR s.title ILIKE '%' || tl.team_city || '%'
             OR s.team_id = tl.team_id
        )
        OR (length(normalized_query) >= 4 AND
            word_similarity(normalized_query, lower(regexp_replace(s.title, '[^a-zA-Z0-9]', '', 'g'))) > 0.4)
        OR (length(normalized_query) >= 4 AND
            lower(regexp_replace(s.title, '[^a-zA-Z0-9]', '', 'g')) LIKE '%' || normalized_query || '%')
      )
  ),
  recent_activity AS (
    SELECT e.show_id, COUNT(*) AS recent_eps
    FROM public.episodes e
    WHERE e.show_id IN (SELECT c.id FROM candidates c)
      AND e.published_at > NOW() - INTERVAL '30 days'
    GROUP BY e.show_id
  ),
  ranked AS (
    SELECT
      c.id,
      c.title,
      c.description,
      c.artwork_url,
      c.publisher,
      c.episode_count,
      (
        CASE WHEN lower(regexp_replace(c.title, '[^a-zA-Z0-9]', '', 'g')) LIKE '%' || normalized_query || '%'
          THEN 115.0 ELSE 0.0 END
        + CASE WHEN EXISTS (SELECT 1 FROM team_lookup tl WHERE c.show_team_id = tl.team_id)
          THEN 120.0
          WHEN EXISTS (SELECT 1 FROM team_lookup tl WHERE c.title ILIKE '%' || tl.team_name || '%' OR c.title ILIKE '%' || tl.team_city || '%')
          THEN 110.0
          ELSE 0.0 END
        + CASE WHEN c.title ILIKE search_pattern THEN 100.0
               WHEN array_length(search_words, 1) > 1
                    AND (SELECT bool_and(lower(c.title) LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1)
               THEN 95.0
               ELSE 0.0 END
        + CASE WHEN c.publisher ILIKE search_pattern THEN 90.0
               WHEN array_length(search_words, 1) > 1
                    AND c.publisher IS NOT NULL
                    AND (SELECT bool_and(lower(c.publisher) LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1)
               THEN 85.0
               ELSE 0.0 END
        + CASE WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(c.hosts_json, '[]'::jsonb)) AS host
            WHERE host->>'name' ILIKE search_pattern
          ) THEN 85.0 ELSE 0.0 END
        + CASE WHEN EXISTS (
            SELECT 1 FROM unnest(regexp_split_to_array(COALESCE(c.publisher, ''), '\s+')) AS word
            WHERE length(word) > 2 AND extensions.levenshtein(lower(search_query), lower(word)) <= 2
          ) THEN 75.0 ELSE 0.0 END
        + CASE WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(c.hosts_json, '[]'::jsonb)) AS host,
                 unnest(regexp_split_to_array(COALESCE(host->>'name', ''), '\s+')) AS name_part
            WHERE length(name_part) > 2 AND extensions.levenshtein(lower(search_query), lower(name_part)) <= 2
          ) THEN 90.0 ELSE 0.0 END
        + CASE WHEN phrase_tsquery IS NOT NULL
            AND to_tsvector('english', COALESCE(c.title, '') || ' ' || COALESCE(c.description, '')) @@ phrase_tsquery
          THEN 20.0 ELSE 0.0 END
        + word_similarity(search_query, c.title) * 15.0
        + word_similarity(normalized_query, lower(regexp_replace(c.title, '[^a-zA-Z0-9]', '', 'g'))) * 20.0
        + word_similarity(search_query, COALESCE(c.publisher, '')) * 10.0
        + CASE WHEN tsquery_val IS NOT NULL THEN
            COALESCE(ts_rank(to_tsvector('english', COALESCE(c.title, '') || ' ' || COALESCE(c.description, '')), tsquery_val), 0) * 5.0
          ELSE 0.0 END
        + LEAST(COALESCE(c.episode_count, 0)::float / 10.0, 5.0)
        + CASE WHEN p_user_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM user_team_ids uti WHERE uti.team_id = c.show_team_id
          ) THEN 40.0 ELSE 0.0 END
        + LEAST(COALESCE((SELECT ra.recent_eps FROM recent_activity ra WHERE ra.show_id = c.id), 0) * 0.1, 10.0)
      )::float AS rank
    FROM candidates c
  )
  SELECT r.id, r.title, r.description, r.artwork_url, r.publisher, r.episode_count, r.rank
  FROM ranked r
  ORDER BY r.rank DESC
  LIMIT result_limit;
END;
$$;

-- -------------------------------------------------------
-- search_episodes
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION search_episodes(
  search_query text,
  result_limit integer DEFAULT 20,
  p_user_id uuid DEFAULT NULL,
  filter_show_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  title text,
  description text,
  audio_url text,
  artwork_url text,
  duration_seconds integer,
  published_at timestamp with time zone,
  extracted_tags jsonb,
  show_id uuid,
  show_title text,
  show_publisher text,
  show_artwork_url text,
  rank double precision,
  match_reason text,
  match_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  tsquery_val tsquery;
  phrase_tsquery tsquery;
  search_pattern text;
  search_words text[];
  normalized_query text;
  primary_count integer;
BEGIN
  search_pattern := '%' || search_query || '%';
  search_words := regexp_split_to_array(lower(trim(search_query)), '\s+');
  normalized_query := lower(regexp_replace(trim(search_query), '[^a-zA-Z0-9]', '', 'g'));

  BEGIN
    IF array_length(search_words, 1) > 1 THEN
      phrase_tsquery := phraseto_tsquery('english', search_query);
    END IF;
  EXCEPTION WHEN OTHERS THEN phrase_tsquery := NULL; END;

  BEGIN tsquery_val := plainto_tsquery('english', search_query);
  EXCEPTION WHEN OTHERS THEN tsquery_val := NULL; END;

  RETURN QUERY
  WITH abbrev_match AS (
    SELECT t.name AS team_name, t.city AS team_city, t.slug AS team_slug, t.id AS team_id
    FROM public.teams t WHERE upper(t.abbreviation) = upper(trim(search_query)) LIMIT 1
  ),
  nickname_match AS (
    SELECT rtn.team_name, rtn.team_city, rtn.team_slug, rtn.team_id
    FROM public.resolve_team_nickname(search_query) rtn
  ),
  team_lookup AS (SELECT * FROM abbrev_match UNION ALL SELECT * FROM nickname_match),
  user_teams AS (
    SELECT unnest(p.topic_slugs) AS team_slug FROM public.profiles p
    WHERE p_user_id IS NOT NULL AND p.user_id = p_user_id
  ),
  user_team_ids AS (
    SELECT t.id AS team_id FROM user_teams ut JOIN public.teams t ON t.slug = ut.team_slug
  ),
  matching_shows AS (
    SELECT s.id AS show_id, s.team_id
    FROM public.shows s
    WHERE (s.status = 'active' OR s.status IS NULL)
      AND (
        s.title ILIKE search_pattern
        OR s.publisher ILIKE search_pattern
        OR (array_length(search_words, 1) > 1
            AND (SELECT bool_and(lower(s.title) LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1))
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(s.hosts_json, '[]'::jsonb)) AS host
          WHERE host->>'name' ILIKE search_pattern
        )
        OR EXISTS (
          SELECT 1 FROM team_lookup tl
          WHERE s.team_id = tl.team_id OR s.title ILIKE '%' || tl.team_name || '%'
        )
        OR (length(normalized_query) >= 4 AND
            lower(regexp_replace(s.title, '[^a-zA-Z0-9]', '', 'g')) LIKE '%' || normalized_query || '%')
      )
  ),
  candidates AS (
    SELECT e.id, e.title, e.description, e.audio_url, e.artwork_url,
      e.duration_seconds, e.published_at, e.extracted_tags, e.search_vector,
      e.show_id, s.title AS show_title, s.publisher AS show_publisher,
      s.artwork_url AS show_artwork_url, s.hosts_json, s.team_id AS show_team_id
    FROM public.episodes e JOIN public.shows s ON s.id = e.show_id
    WHERE (s.status = 'active' OR s.status IS NULL)
      AND (filter_show_id IS NULL OR e.show_id = filter_show_id)
      AND (filter_show_id IS NOT NULL OR e.published_at > NOW() - INTERVAL '1 year')
      AND (
        (tsquery_val IS NOT NULL AND e.search_vector @@ tsquery_val)
        OR e.title ILIKE search_pattern
        OR (array_length(search_words, 1) > 1
            AND (SELECT bool_and(lower(e.title) LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1))
        OR e.show_id IN (SELECT ms.show_id FROM matching_shows ms)
        OR (e.extracted_tags IS NOT NULL
            AND e.extracted_tags @? (('$.people[*] ? (@ like_regex "' || search_query || '" flag "i")')::jsonpath))
      )
    LIMIT 100
  ),
  speaker_match AS (
    SELECT DISTINCT es.episode_id FROM public.episode_speakers es
    JOIN public.speakers sp ON sp.id = es.speaker_id
    WHERE lower(sp.full_name) LIKE '%' || lower(trim(search_query)) || '%'
       OR (array_length(search_words, 1) > 1
           AND (SELECT bool_and(lower(sp.full_name) LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1))
  ),
  people_tag_match AS (
    SELECT c.id AS episode_id FROM candidates c
    WHERE c.extracted_tags IS NOT NULL
      AND c.extracted_tags @? (('$.people[*] ? (@ like_regex "' || search_query || '" flag "i")')::jsonpath)
  ),
  high_profile_check AS (
    SELECT EXISTS (
      SELECT 1 FROM (
        SELECT sp.id FROM public.speakers sp
        JOIN public.episode_speakers es ON es.speaker_id = sp.id
        WHERE lower(sp.full_name) LIKE '%' || lower(trim(search_query)) || '%'
        GROUP BY sp.id HAVING COUNT(DISTINCT es.episode_id) >= 50
        UNION ALL
        SELECT NULL::uuid FROM public.episodes e
        WHERE e.extracted_tags IS NOT NULL
          AND e.extracted_tags @? (('$.people[*] ? (@ like_regex "' || search_query || '" flag "i")')::jsonpath)
          AND e.published_at > NOW() - INTERVAL '2 years'
        HAVING COUNT(*) >= 50
      ) hp LIMIT 1
    ) AS is_high_profile
  ),
  base_ranked AS (
    SELECT c.id, c.title, c.description, c.audio_url, c.artwork_url,
      c.duration_seconds, c.published_at, c.extracted_tags, c.search_vector,
      c.show_id, c.show_title, c.show_publisher, c.show_artwork_url,
      c.hosts_json, c.show_team_id,
      (
        CASE WHEN c.title ILIKE search_pattern
               OR (array_length(search_words, 1) > 1
                   AND (SELECT bool_and(lower(c.title) LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1))
             THEN 100.0 ELSE 0.0 END
        + CASE WHEN EXISTS (SELECT 1 FROM team_lookup tl WHERE c.show_team_id = tl.team_id) THEN 120.0
               WHEN EXISTS (SELECT 1 FROM team_lookup tl WHERE c.title ILIKE '%' || tl.team_name || '%' OR c.show_title ILIKE '%' || tl.team_name || '%') THEN 110.0
               ELSE 0.0 END
        + CASE WHEN c.show_title ILIKE search_pattern
                 OR (array_length(search_words, 1) > 1
                     AND (SELECT bool_and(lower(c.show_title) LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1))
               THEN 95.0 ELSE 0.0 END
        + CASE WHEN length(normalized_query) >= 4 AND
                    lower(regexp_replace(c.show_title, '[^a-zA-Z0-9]', '', 'g')) LIKE '%' || normalized_query || '%'
               THEN 105.0 ELSE 0.0 END
        + CASE WHEN c.show_publisher ILIKE search_pattern
                 OR (array_length(search_words, 1) > 1 AND c.show_publisher IS NOT NULL
                     AND (SELECT bool_and(lower(c.show_publisher) LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1))
               THEN 85.0 ELSE 0.0 END
        + CASE WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(c.hosts_json, '[]'::jsonb)) AS host
            WHERE host->>'name' ILIKE search_pattern
          ) THEN 85.0 ELSE 0.0 END
        + CASE WHEN (
            EXISTS (SELECT 1 FROM speaker_match sm WHERE sm.episode_id = c.id)
            OR EXISTS (SELECT 1 FROM people_tag_match ptm WHERE ptm.episode_id = c.id)
          )
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(c.hosts_json, '[]'::jsonb)) AS host
            WHERE host->>'name' ILIKE search_pattern
          )
          THEN (CASE WHEN (SELECT is_high_profile FROM high_profile_check) THEN 130.0 ELSE 80.0 END)
          ELSE 0.0 END
        + CASE WHEN phrase_tsquery IS NOT NULL AND c.search_vector @@ phrase_tsquery THEN 25.0 ELSE 0.0 END
        + word_similarity(search_query, c.title) * 10.0
        + word_similarity(search_query, COALESCE(c.show_title, '')) * 8.0
        + CASE WHEN tsquery_val IS NOT NULL AND c.search_vector @@ tsquery_val
            THEN ts_rank_cd(c.search_vector, tsquery_val) * 50.0 ELSE 0.0 END
        + CASE WHEN p_user_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM user_team_ids uti WHERE uti.team_id = c.show_team_id
          ) THEN 40.0 ELSE 0.0 END
        + CASE WHEN c.published_at > NOW() - INTERVAL '7 days' THEN 5.0
               WHEN c.published_at > NOW() - INTERVAL '30 days' THEN 2.0
               ELSE 0.0 END
      ) AS base_score
    FROM candidates c
  ),
  top_candidates AS (
    SELECT * FROM base_ranked ORDER BY base_score DESC LIMIT 50
  ),
  ranked AS (
    SELECT tc.id, tc.title, tc.description, tc.audio_url, tc.artwork_url,
      tc.duration_seconds, tc.published_at, tc.extracted_tags,
      tc.show_id, tc.show_title, tc.show_publisher, tc.show_artwork_url,
      (
        tc.base_score
        + CASE WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(tc.hosts_json, '[]'::jsonb)) AS host,
                 unnest(regexp_split_to_array(COALESCE(host->>'name', ''), '\s+')) AS name_part
            WHERE length(name_part) > 2 AND extensions.levenshtein(lower(search_query), lower(name_part)) <= 2
          ) THEN 90.0 ELSE 0.0 END
        + CASE WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(COALESCE(tc.extracted_tags->'people', '[]'::jsonb)) AS person,
                 unnest(regexp_split_to_array(person, '\s+')) AS name_part
            WHERE length(name_part) > 2 AND extensions.levenshtein(lower(search_query), lower(name_part)) <= 2
          ) THEN 75.0 ELSE 0.0 END
        + CASE WHEN EXISTS (
            SELECT 1 FROM unnest(regexp_split_to_array(tc.title, '\s+')) AS word
            WHERE length(word) > 2 AND (
              (length(word) >= 7 AND extensions.levenshtein(lower(search_query), lower(word)) <= 2)
              OR (length(word) < 7 AND extensions.levenshtein(lower(search_query), lower(word)) <= 1)
            )
          ) THEN 60.0 ELSE 0.0 END
      ) AS rank,
      CASE
        WHEN (EXISTS (SELECT 1 FROM speaker_match sm WHERE sm.episode_id = tc.id)
              OR EXISTS (SELECT 1 FROM people_tag_match ptm WHERE ptm.episode_id = tc.id))
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(tc.hosts_json, '[]'::jsonb)) AS host WHERE host->>'name' ILIKE search_pattern)
          AND (SELECT is_high_profile FROM high_profile_check)
          THEN 'Speaker match'
        WHEN EXISTS (SELECT 1 FROM team_lookup tl WHERE tc.show_team_id = tl.team_id)
          THEN 'Team: ' || (SELECT tl.team_name FROM team_lookup tl LIMIT 1)
        WHEN tc.title ILIKE search_pattern
             OR (array_length(search_words, 1) > 1
                 AND (SELECT bool_and(lower(tc.title) LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1))
             THEN 'Title match'
        WHEN length(normalized_query) >= 4 AND lower(regexp_replace(tc.show_title, '[^a-zA-Z0-9]', '', 'g')) LIKE '%' || normalized_query || '%'
             THEN 'Show: ' || tc.show_title
        WHEN tc.show_title ILIKE search_pattern
             OR (array_length(search_words, 1) > 1
                 AND (SELECT bool_and(lower(tc.show_title) LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1))
             THEN 'Show: ' || tc.show_title
        WHEN tc.show_publisher ILIKE search_pattern THEN 'Publisher: ' || tc.show_publisher
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(tc.hosts_json, '[]'::jsonb)) AS host WHERE host->>'name' ILIKE search_pattern) THEN 'Host match'
        WHEN EXISTS (SELECT 1 FROM speaker_match sm WHERE sm.episode_id = tc.id) THEN 'Speaker match'
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(tc.extracted_tags->'people', '[]'::jsonb)) AS person WHERE person ILIKE search_pattern) THEN 'People match'
        WHEN tsquery_val IS NOT NULL AND tc.search_vector @@ tsquery_val THEN 'Full-text match'
        ELSE 'Related'
      END AS match_reason,
      CASE
        WHEN (EXISTS (SELECT 1 FROM speaker_match sm WHERE sm.episode_id = tc.id)
              OR EXISTS (SELECT 1 FROM people_tag_match ptm WHERE ptm.episode_id = tc.id))
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(tc.hosts_json, '[]'::jsonb)) AS host WHERE host->>'name' ILIKE search_pattern)
          AND (SELECT is_high_profile FROM high_profile_check) THEN 'people'
        WHEN EXISTS (SELECT 1 FROM team_lookup tl WHERE tc.show_team_id = tl.team_id) THEN 'show'
        WHEN tc.title ILIKE search_pattern
             OR (array_length(search_words, 1) > 1
                 AND (SELECT bool_and(lower(tc.title) LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1)) THEN 'title'
        WHEN tc.show_title ILIKE search_pattern
             OR (array_length(search_words, 1) > 1
                 AND (SELECT bool_and(lower(tc.show_title) LIKE '%' || w || '%') FROM unnest(search_words) AS w WHERE length(w) > 1)) THEN 'show'
        WHEN tc.show_publisher ILIKE search_pattern THEN 'show'
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(tc.hosts_json, '[]'::jsonb)) AS host WHERE host->>'name' ILIKE search_pattern) THEN 'people'
        WHEN EXISTS (SELECT 1 FROM speaker_match sm WHERE sm.episode_id = tc.id) THEN 'people'
        WHEN EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(tc.extracted_tags->'people', '[]'::jsonb)) AS person WHERE person ILIKE search_pattern) THEN 'people'
        ELSE 'other'
      END AS match_source
    FROM top_candidates tc
  )
  SELECT r.id, r.title, r.description, r.audio_url, r.artwork_url,
    r.duration_seconds, r.published_at, r.extracted_tags,
    r.show_id, r.show_title, r.show_publisher, r.show_artwork_url,
    r.rank, r.match_reason, r.match_source
  FROM ranked r WHERE r.rank > 0
  ORDER BY r.rank DESC, r.published_at DESC NULLS LAST
  LIMIT result_limit;

  GET DIAGNOSTICS primary_count = ROW_COUNT;

  IF primary_count = 0 THEN
    RETURN QUERY
    SELECT e.id, e.title, e.description, e.audio_url, e.artwork_url,
      e.duration_seconds, e.published_at, e.extracted_tags,
      e.show_id, s.title AS show_title, s.publisher AS show_publisher,
      s.artwork_url AS show_artwork_url,
      (
        GREATEST(
          word_similarity(search_query, e.title),
          COALESCE((
            SELECT MAX(word_similarity(search_query, person))
            FROM jsonb_array_elements_text(COALESCE(e.extracted_tags->'people', '[]'::jsonb)) AS person
          ), 0)
        ) * 100.0
        + CASE WHEN e.published_at > NOW() - INTERVAL '30 days' THEN 5.0 ELSE 0.0 END
      )::double precision AS rank,
      'Fuzzy match'::text AS match_reason,
      'fuzzy'::text AS match_source
    FROM public.episodes e
    JOIN public.shows s ON s.id = e.show_id
    WHERE (s.status = 'active' OR s.status IS NULL)
      AND (filter_show_id IS NULL OR e.show_id = filter_show_id)
      AND (filter_show_id IS NOT NULL OR e.published_at > NOW() - INTERVAL '1 year')
      AND (
        word_similarity(search_query, e.title) > 0.3
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(COALESCE(e.extracted_tags->'people', '[]'::jsonb)) AS person
          WHERE word_similarity(search_query, person) > 0.3
        )
      )
    ORDER BY
      GREATEST(
        word_similarity(search_query, e.title),
        COALESCE((
          SELECT MAX(word_similarity(search_query, person))
          FROM jsonb_array_elements_text(COALESCE(e.extracted_tags->'people', '[]'::jsonb)) AS person
        ), 0)
      ) DESC,
      e.published_at DESC NULLS LAST
    LIMIT result_limit;
  END IF;
END;
$$;

-- -------------------------------------------------------
-- search_stories
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION search_stories(
  search_query text,
  result_limit integer DEFAULT 20
)
RETURNS TABLE(
  id uuid,
  headline text,
  story_type text,
  sport text,
  team_slugs text[],
  people text[],
  episode_count integer,
  show_count integer,
  event_date date,
  first_seen_at timestamp with time zone,
  rank float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  q text := lower(trim(search_query));
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.headline,
    s.story_type,
    s.sport,
    s.team_slugs,
    s.people,
    s.episode_count,
    s.show_count,
    s.event_date,
    s.first_seen_at,
    (CASE WHEN s.headline ILIKE q || '%' THEN 100.0 ELSE 0.0 END +
     CASE WHEN s.headline ILIKE '%' || q || '%' THEN 50.0 ELSE 0.0 END +
     CASE WHEN EXISTS (
       SELECT 1 FROM unnest(s.people) AS p WHERE p ILIKE '%' || q || '%'
     ) THEN 40.0 ELSE 0.0 END +
     CASE WHEN EXISTS (
       SELECT 1 FROM unnest(s.team_slugs) AS ts WHERE ts ILIKE '%' || q || '%'
     ) THEN 30.0 ELSE 0.0 END +
     s.episode_count::float * 2.0 +
     CASE WHEN s.first_seen_at > now() - interval '3 days' THEN 20.0 ELSE 0.0 END
    )::float as rank
  FROM stories s
  WHERE s.status = 'active'
    AND (
      s.headline ILIKE '%' || q || '%'
      OR EXISTS (SELECT 1 FROM unnest(s.people) AS p WHERE p ILIKE '%' || q || '%')
      OR EXISTS (SELECT 1 FROM unnest(s.team_slugs) AS ts WHERE ts ILIKE '%' || q || '%')
    )
  ORDER BY rank DESC, s.first_seen_at DESC
  LIMIT result_limit;
END;
$$;

-- -------------------------------------------------------
-- search_suggestions
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION search_suggestions(
  query_prefix text,
  max_results integer DEFAULT 10
)
RETURNS TABLE(
  suggestion text,
  suggestion_type text,
  rank float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  normalized_prefix text;
BEGIN
  normalized_prefix := lower(regexp_replace(trim(query_prefix), '[^a-zA-Z0-9]', '', 'g'));

  RETURN QUERY
  WITH all_suggestions AS (
    -- Teams (highest priority)
    SELECT DISTINCT
      t.name as sugg,
      'team'::text as sugg_type,
      (CASE WHEN t.name ILIKE query_prefix || '%' THEN 150.0 ELSE 0.0 END +
       CASE WHEN t.short_name ILIKE query_prefix || '%' THEN 140.0 ELSE 0.0 END +
       CASE WHEN t.abbreviation ILIKE query_prefix THEN 145.0 ELSE 0.0 END +
       CASE WHEN t.city ILIKE query_prefix || '%' THEN 120.0 ELSE 0.0 END +
       CASE WHEN t.name ILIKE '%' || query_prefix || '%' THEN 60.0 ELSE 0.0 END)::float as sugg_rank
    FROM teams t
    WHERE t.is_active = true
      AND (
        t.name ILIKE '%' || query_prefix || '%'
        OR t.short_name ILIKE '%' || query_prefix || '%'
        OR t.abbreviation ILIKE query_prefix
        OR t.city ILIKE query_prefix || '%'
      )

    UNION ALL

    -- Show titles with normalized matching
    SELECT DISTINCT
      s.title as sugg,
      'show_title'::text as sugg_type,
      (CASE WHEN s.title ILIKE query_prefix || '%' THEN 100.0 ELSE 0.0 END +
       CASE WHEN s.title ILIKE '%' || query_prefix || '%' THEN 50.0 ELSE 0.0 END +
       CASE WHEN length(normalized_prefix) >= 4 AND
                 lower(regexp_replace(s.title, '[^a-zA-Z0-9]', '', 'g')) LIKE '%' || normalized_prefix || '%'
            THEN 95.0 ELSE 0.0 END +
       CASE WHEN EXISTS (
         SELECT 1 FROM unnest(regexp_split_to_array(s.title, '\s+')) AS word
         WHERE length(word) > 2 AND extensions.levenshtein(lower(query_prefix), lower(word)) <= 2
       ) THEN 80.0 ELSE 0.0 END +
       COALESCE(s.episode_count, 0)::float / 10.0)::float as sugg_rank
    FROM shows s
    WHERE (s.status = 'active' OR s.status IS NULL)
      AND (
        s.title ILIKE '%' || query_prefix || '%'
        OR (length(normalized_prefix) >= 4 AND
            lower(regexp_replace(s.title, '[^a-zA-Z0-9]', '', 'g')) LIKE '%' || normalized_prefix || '%')
        OR EXISTS (
          SELECT 1 FROM unnest(regexp_split_to_array(s.title, '\s+')) AS word
          WHERE length(word) > 2 AND extensions.levenshtein(lower(query_prefix), lower(word)) <= 2
        )
      )

    UNION ALL

    -- Story headlines
    SELECT DISTINCT
      st.headline as sugg,
      'story'::text as sugg_type,
      (CASE WHEN st.headline ILIKE query_prefix || '%' THEN 110.0 ELSE 0.0 END +
       CASE WHEN st.headline ILIKE '%' || query_prefix || '%' THEN 55.0 ELSE 0.0 END +
       CASE WHEN st.episode_count > 5 THEN 20.0 ELSE st.episode_count::float * 3.0 END +
       CASE WHEN st.first_seen_at > now() - interval '3 days' THEN 30.0 ELSE 0.0 END)::float as sugg_rank
    FROM stories st
    WHERE st.status = 'active'
      AND st.headline ILIKE '%' || query_prefix || '%'
      AND st.first_seen_at > now() - interval '30 days'

    UNION ALL

    -- Publishers
    SELECT DISTINCT
      s.publisher as sugg,
      'publisher'::text as sugg_type,
      (CASE WHEN s.publisher ILIKE query_prefix || '%' THEN 80.0 ELSE 0.0 END +
       CASE WHEN s.publisher ILIKE '%' || query_prefix || '%' THEN 40.0 ELSE 0.0 END +
       CASE WHEN EXISTS (
         SELECT 1 FROM unnest(regexp_split_to_array(COALESCE(s.publisher, ''), '\s+')) AS word
         WHERE length(word) > 2 AND extensions.levenshtein(lower(query_prefix), lower(word)) <= 2
       ) THEN 70.0 ELSE 0.0 END)::float as sugg_rank
    FROM shows s
    WHERE (s.status = 'active' OR s.status IS NULL)
      AND s.publisher IS NOT NULL
      AND (
        s.publisher ILIKE '%' || query_prefix || '%'
        OR EXISTS (
          SELECT 1 FROM unnest(regexp_split_to_array(s.publisher, '\s+')) AS word
          WHERE length(word) > 2 AND extensions.levenshtein(lower(query_prefix), lower(word)) <= 2
        )
      )

    UNION ALL

    -- Hosts
    SELECT DISTINCT
      host->>'name' as sugg,
      'host'::text as sugg_type,
      (CASE WHEN host->>'name' ILIKE query_prefix || '%' THEN 90.0 ELSE 0.0 END +
       CASE WHEN host->>'name' ILIKE '%' || query_prefix || '%' THEN 45.0 ELSE 0.0 END +
       CASE WHEN EXISTS (
         SELECT 1 FROM unnest(regexp_split_to_array(COALESCE(host->>'name', ''), '\s+')) AS word
         WHERE length(word) > 2 AND extensions.levenshtein(lower(query_prefix), lower(word)) <= 2
       ) THEN 85.0 ELSE 0.0 END)::float as sugg_rank
    FROM shows s,
    jsonb_array_elements(COALESCE(s.hosts_json, '[]'::jsonb)) AS host
    WHERE (s.status = 'active' OR s.status IS NULL)
      AND host->>'name' IS NOT NULL
      AND (
        host->>'name' ILIKE '%' || query_prefix || '%'
        OR EXISTS (
          SELECT 1 FROM unnest(regexp_split_to_array(host->>'name', '\s+')) AS word
          WHERE length(word) > 2 AND extensions.levenshtein(lower(query_prefix), lower(word)) <= 2
        )
      )

    UNION ALL

    -- People from episode tags
    SELECT DISTINCT
      person::text as sugg,
      'person'::text as sugg_type,
      (CASE WHEN person::text ILIKE query_prefix || '%' THEN 90.0 ELSE 0.0 END +
       CASE WHEN person::text ILIKE '%' || query_prefix || '%' THEN 45.0 ELSE 0.0 END +
       CASE WHEN EXISTS (
         SELECT 1 FROM unnest(regexp_split_to_array(person::text, '\s+')) AS word
         WHERE length(word) > 2 AND extensions.levenshtein(lower(query_prefix), lower(word)) <= 2
       ) THEN 85.0 ELSE 0.0 END)::float as sugg_rank
    FROM episodes e
    JOIN shows s ON e.show_id = s.id,
    jsonb_array_elements_text(COALESCE(e.extracted_tags->'people', '[]'::jsonb)) as person
    WHERE (s.status = 'active' OR s.status IS NULL)
      AND (
        person::text ILIKE '%' || query_prefix || '%'
        OR EXISTS (
          SELECT 1 FROM unnest(regexp_split_to_array(person::text, '\s+')) AS word
          WHERE length(word) > 2 AND extensions.levenshtein(lower(query_prefix), lower(word)) <= 2
        )
      )
  )
  SELECT DISTINCT ON (lower(sugg))
    sugg as suggestion,
    sugg_type as suggestion_type,
    sugg_rank as rank
  FROM all_suggestions
  WHERE sugg IS NOT NULL AND sugg != ''
  ORDER BY lower(sugg), sugg_rank DESC
  LIMIT max_results;
END;
$$;

-- ============================================================================
-- 8. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE shows ENABLE ROW LEVEL SECURITY;
ALTER TABLE episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE episode_speakers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_listen_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_playback ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE playlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE show_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE x_feed_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_follows ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 9. RLS POLICIES
-- ============================================================================

-- -------------------------------------------------------
-- leagues
-- -------------------------------------------------------
CREATE POLICY "Anyone can view leagues" ON leagues FOR SELECT USING (true);
CREATE POLICY "Admins can manage leagues" ON leagues FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- -------------------------------------------------------
-- games
-- -------------------------------------------------------
CREATE POLICY "Anyone can view games" ON games FOR SELECT USING (true);
CREATE POLICY "Service role manages games" ON games FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- speakers
-- -------------------------------------------------------
CREATE POLICY "Anyone can view speakers" ON speakers FOR SELECT USING (true);
CREATE POLICY "Admins can manage speakers" ON speakers FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- -------------------------------------------------------
-- teams
-- -------------------------------------------------------
CREATE POLICY "Anyone can view teams" ON teams FOR SELECT USING (true);
CREATE POLICY "Admins can manage teams" ON teams FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- -------------------------------------------------------
-- players
-- -------------------------------------------------------
CREATE POLICY "Anyone can view players" ON players FOR SELECT USING (true);
CREATE POLICY "Players are publicly readable" ON players FOR SELECT USING (true);
CREATE POLICY "Service role manages players" ON players FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- shows
-- -------------------------------------------------------
CREATE POLICY "Authenticated users can view shows" ON shows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anonymous can view public show data" ON shows FOR SELECT TO anon USING (true);
CREATE POLICY "Admins can manage shows" ON shows FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Owners can update own shows" ON shows FOR UPDATE
  USING ((claimed_by_user_id = auth.uid()) AND (claim_status = 'claimed'::text));
CREATE POLICY "Owners can request removal of own shows" ON shows FOR UPDATE
  USING ((claimed_by_user_id = auth.uid()) AND (claim_status = 'claimed'::text) AND ((status IS NULL) OR (status = 'active'::text)))
  WITH CHECK ((claimed_by_user_id = auth.uid()) AND (claim_status = 'claimed'::text) AND (status = ANY (ARRAY['active'::text, 'removal_requested'::text])));

-- -------------------------------------------------------
-- episodes
-- -------------------------------------------------------
CREATE POLICY "Anyone can view episodes" ON episodes FOR SELECT USING (true);
CREATE POLICY "Admins can manage episodes" ON episodes FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- -------------------------------------------------------
-- stories
-- -------------------------------------------------------
CREATE POLICY "Stories are viewable by everyone" ON stories FOR SELECT USING (true);
CREATE POLICY "Service role manages stories" ON stories FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- profiles
-- -------------------------------------------------------
CREATE POLICY "Anyone can view profiles" ON profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = user_id);

-- -------------------------------------------------------
-- user_roles
-- -------------------------------------------------------
CREATE POLICY "Users can view their own roles" ON user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON user_roles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage roles" ON user_roles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- -------------------------------------------------------
-- episode_comments
-- -------------------------------------------------------
CREATE POLICY "Anyone can view comments" ON episode_comments FOR SELECT USING (true);
CREATE POLICY "Users can insert own comments" ON episode_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments" ON episode_comments FOR DELETE USING (auth.uid() = user_id);

-- -------------------------------------------------------
-- episode_comment_likes
-- -------------------------------------------------------
CREATE POLICY "Anyone can view comment likes" ON episode_comment_likes FOR SELECT USING (true);
CREATE POLICY "Users can manage own comment likes" ON episode_comment_likes FOR ALL USING (auth.uid() = user_id);

-- -------------------------------------------------------
-- episode_likes
-- -------------------------------------------------------
CREATE POLICY "Anyone can view likes" ON episode_likes FOR SELECT USING (true);
CREATE POLICY "Users can manage own likes" ON episode_likes FOR ALL USING (auth.uid() = user_id);

-- -------------------------------------------------------
-- episode_stories
-- -------------------------------------------------------
CREATE POLICY "Episode stories are viewable by everyone" ON episode_stories FOR SELECT USING (true);
CREATE POLICY "Service role manages episode_stories" ON episode_stories FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- episode_speakers
-- -------------------------------------------------------
CREATE POLICY "Anyone can view episode speakers" ON episode_speakers FOR SELECT USING (true);
CREATE POLICY "Admins can manage episode speakers" ON episode_speakers FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- -------------------------------------------------------
-- user_library
-- -------------------------------------------------------
CREATE POLICY "Users can view their own library" ON user_library FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can add to their own library" ON user_library FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove from their own library" ON user_library FOR DELETE USING (auth.uid() = user_id);

-- -------------------------------------------------------
-- user_listen_history
-- -------------------------------------------------------
CREATE POLICY "Users can view own history" ON user_listen_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own history" ON user_listen_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own listen history" ON user_listen_history FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can delete own history" ON user_listen_history FOR DELETE USING (auth.uid() = user_id);

-- -------------------------------------------------------
-- user_playback
-- -------------------------------------------------------
CREATE POLICY "Users can view own playback" ON user_playback FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own playback" ON user_playback FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own playback" ON user_playback FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own playback" ON user_playback FOR DELETE USING (auth.uid() = user_id);

-- -------------------------------------------------------
-- user_queue
-- -------------------------------------------------------
CREATE POLICY "Users can view own queue" ON user_queue FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own queue" ON user_queue FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own queue" ON user_queue FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own queue" ON user_queue FOR DELETE USING (auth.uid() = user_id);

-- -------------------------------------------------------
-- notifications
-- -------------------------------------------------------
CREATE POLICY "Users can view own notifications" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users read own notifications" ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Authenticated can insert notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service role insert" ON notifications FOR INSERT WITH CHECK (true);

-- -------------------------------------------------------
-- friendships
-- -------------------------------------------------------
CREATE POLICY "Users can view their own friendships" ON friendships FOR SELECT
  USING ((auth.uid() = requester_id) OR (auth.uid() = addressee_id));
CREATE POLICY "Users can send friend requests" ON friendships FOR INSERT
  WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Addressee can respond to requests" ON friendships FOR UPDATE
  USING (auth.uid() = addressee_id);
CREATE POLICY "Participants can remove friendship" ON friendships FOR DELETE
  USING ((auth.uid() = requester_id) OR (auth.uid() = addressee_id));

-- -------------------------------------------------------
-- bookmarks
-- -------------------------------------------------------
CREATE POLICY "Users can view own bookmarks" ON bookmarks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own bookmarks" ON bookmarks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own bookmarks" ON bookmarks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own bookmarks" ON bookmarks FOR DELETE USING (auth.uid() = user_id);

-- -------------------------------------------------------
-- playlists
-- -------------------------------------------------------
CREATE POLICY "Users can view own playlists" ON playlists FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Public playlists viewable by all" ON playlists FOR SELECT USING (is_public = true);
CREATE POLICY "Users can create own playlists" ON playlists FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own playlists" ON playlists FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "Users can delete own playlists" ON playlists FOR DELETE USING (user_id = auth.uid());

-- -------------------------------------------------------
-- playlist_items
-- -------------------------------------------------------
CREATE POLICY "Users can view own playlist items" ON playlist_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM playlists WHERE playlists.id = playlist_items.playlist_id AND playlists.user_id = auth.uid()));
CREATE POLICY "Public playlist items viewable" ON playlist_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM playlists WHERE playlists.id = playlist_items.playlist_id AND playlists.is_public = true));
CREATE POLICY "Users can insert own playlist items" ON playlist_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM playlists WHERE playlists.id = playlist_items.playlist_id AND playlists.user_id = auth.uid()));
CREATE POLICY "Users can update own playlist items" ON playlist_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM playlists WHERE playlists.id = playlist_items.playlist_id AND playlists.user_id = auth.uid()));
CREATE POLICY "Users can delete own playlist items" ON playlist_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM playlists WHERE playlists.id = playlist_items.playlist_id AND playlists.user_id = auth.uid()));

-- -------------------------------------------------------
-- podcast_claims
-- -------------------------------------------------------
CREATE POLICY "Users can view own claims" ON podcast_claims FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can submit claims" ON podcast_claims FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage all claims" ON podcast_claims FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- -------------------------------------------------------
-- podcast_submissions
-- -------------------------------------------------------
CREATE POLICY "Users can view own submissions" ON podcast_submissions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can submit podcasts" ON podcast_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage submissions" ON podcast_submissions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- -------------------------------------------------------
-- show_hosts
-- -------------------------------------------------------
CREATE POLICY "Anyone can view show hosts" ON show_hosts FOR SELECT USING (true);
CREATE POLICY "Admins can manage show hosts" ON show_hosts FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- -------------------------------------------------------
-- x_feed_cache
-- -------------------------------------------------------
CREATE POLICY "Public read x_feed_cache" ON x_feed_cache FOR SELECT USING (true);

-- -------------------------------------------------------
-- player_stories
-- -------------------------------------------------------
CREATE POLICY "Anyone can view player_stories" ON player_stories FOR SELECT USING (true);
CREATE POLICY "Service role manages player_stories" ON player_stories FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- user_follows
-- -------------------------------------------------------
CREATE POLICY "Anyone can view follows" ON user_follows FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Users can follow others" ON user_follows FOR INSERT TO authenticated WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "Users can unfollow others" ON user_follows FOR DELETE TO authenticated USING (auth.uid() = follower_id);

-- ============================================================================
-- 10. STORAGE BUCKET
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: public read
CREATE POLICY "Public avatar read" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Storage policy: authenticated users can upload
CREATE POLICY "Authenticated avatar upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

-- Storage policy: users can update their own avatars
CREATE POLICY "Users can update own avatars" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Storage policy: users can delete their own avatars
CREATE POLICY "Users can delete own avatars" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
