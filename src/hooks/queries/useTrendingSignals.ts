import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

/** Exponential decay with configurable half-life. Fresh stories score higher. */
function decayScore(
  episodeCount: number,
  eventDate: string | null,
  firstSeenAt: string | null,
  halfLifeDays = 1.5,
): number {
  const ref = eventDate || firstSeenAt || new Date().toISOString();
  const ageDays = Math.max(0, (Date.now() - new Date(ref).getTime()) / 86_400_000);
  return episodeCount / Math.pow(2, ageDays / halfLifeDays);
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

interface TrendingSignalMetadata {
  winner?: string;
  score?: string;
  context?: string;
  players?: string[];
}

interface EpisodeShow {
  id: string;
  title: string;
  artwork_url: string | null;
  status: string | null;
  team_slug?: string | null;
}

export interface EpisodeData {
  id: string;
  title: string;
  published_at: string | null;
  duration_seconds: number | null;
  audio_url: string;
  artwork_url: string | null;
  show: EpisodeShow | null;
}

export interface TeamInfo {
  slug: string;
  short_name: string;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
}

export interface TrendingSignal {
  id: string;
  signal_type: string;
  entity_code: string;
  entity_name: string;
  team_slugs: string[];
  league: string | null;
  mention_count: number;
  show_count: number;
  velocity_score: number;
  trending_streak_days: number;
  event_date: string | null;
  metadata: TrendingSignalMetadata;
  recent_episodes: EpisodeData[];
  total_episode_count: number;
  teams: TeamInfo[];
}

interface UseTrendingSignalsOptions {
  teamSlugs?: string[];
  league?: string;
  limit?: number;
  enabled?: boolean;
  applyFreshnessDecay?: boolean;
  minShowCount?: number;
  halfLifeDays?: number;
}

export function useTrendingSignals(options?: UseTrendingSignalsOptions) {
  const {
    teamSlugs,
    league,
    limit = 5,
    enabled = true,
    applyFreshnessDecay = false,
    minShowCount = 2,
    halfLifeDays = 1.5,
  } = options || {};

  return useQuery({
    queryKey: [
      'trending-signals',
      teamSlugs?.join(','),
      league,
      limit,
      applyFreshnessDecay,
      minShowCount,
      halfLifeDays,
    ],
    queryFn: async (): Promise<TrendingSignal[]> => {
      const fetchLimit = applyFreshnessDecay ? Math.max(limit * 5, 20) : limit;

      let query = supabase
        .from('stories')
        .select(`
          id,
          story_type,
          slug,
          headline,
          team_slugs,
          sport,
          show_count,
          episode_count,
          primary_count,
          event_date,
          metadata,
          first_seen_at,
          people,
          episode_stories (
            relevance,
            episode:episodes (
              id,
              title,
              published_at,
              duration_seconds,
              audio_url,
              artwork_url,
              show:shows (
                id,
                title,
                artwork_url,
                status,
                team:teams(slug)
              )
            )
          )
        `)
        .eq('status', 'active')
        .eq('source_type', 'espn_game')
        .gte(
          'event_date',
          new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString().split('T')[0],
        )
        .gte('show_count', minShowCount)
        .order('event_date', { ascending: false, nullsFirst: false })
        .order('first_seen_at', { ascending: false })
        .limit(fetchLimit);

      if (teamSlugs && teamSlugs.length > 0) {
        query = query.overlaps('team_slugs', teamSlugs);
      }

      if (league) {
        query = query.eq('sport', league);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch team info for all referenced teams
      const allTeamSlugs = [...new Set((data || []).flatMap((s: any) => s.team_slugs || []))];
      let teamsMap: Record<string, TeamInfo> = {};
      if (allTeamSlugs.length > 0) {
        const { data: teamsData } = await supabase
          .from('teams')
          .select('slug, short_name, logo_url, primary_color, secondary_color')
          .in('slug', allTeamSlugs);
        if (teamsData) {
          teamsMap = Object.fromEntries(
            teamsData.map((t: any) => [
              t.slug,
              {
                slug: t.slug,
                short_name: t.short_name,
                logo_url: t.logo_url,
                primary_color: t.primary_color ?? null,
                secondary_color: t.secondary_color ?? null,
              },
            ]),
          );
        }
      }

      let signals: TrendingSignal[] = (data || []).map((story: any) => {
        // Sort episodes by recency, filter to active shows only
        const episodes = (story.episode_stories || [])
          .map((es: any) => es.episode)
          .filter(Boolean)
          .filter((ep: any) => ep.show?.status === 'active' || !ep.show?.status)
          .sort(
            (a: any, b: any) =>
              new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime(),
          );

        const totalCount = episodes.length;

        // Deduplicate: max 1 episode per show
        const seenShowIds = new Set<string>();
        const deduplicated: any[] = [];
        for (const ep of episodes) {
          if (!ep.show?.id || seenShowIds.has(ep.show.id)) continue;
          seenShowIds.add(ep.show.id);
          deduplicated.push(ep);
          if (deduplicated.length >= 10) break;
        }

        const score = decayScore(
          story.episode_count || 0,
          story.event_date,
          story.first_seen_at,
          halfLifeDays,
        );

        return {
          id: story.id,
          signal_type: story.story_type,
          entity_code: story.slug,
          entity_name: story.headline,
          team_slugs: story.team_slugs || [],
          league: story.sport,
          mention_count: story.episode_count || 0,
          show_count: story.show_count || 0,
          velocity_score: score,
          trending_streak_days: daysSince(story.first_seen_at),
          event_date: story.event_date,
          metadata: {
            ...(story.metadata || {}),
            players: story.people || (story.metadata as any)?.players,
          },
          teams: (story.team_slugs || [])
            .map((slug: string) => teamsMap[slug])
            .filter(Boolean),
          recent_episodes: deduplicated.map((ep: any) => ({
            id: ep.id,
            title: ep.title,
            published_at: ep.published_at,
            duration_seconds: ep.duration_seconds,
            audio_url: ep.audio_url || '',
            artwork_url: ep.artwork_url,
            show: ep.show
              ? {
                  id: ep.show.id,
                  title: ep.show.title,
                  artwork_url: ep.show.artwork_url,
                  status: ep.show.status ?? null,
                  team_slug: ep.show.team?.slug ?? null,
                }
              : null,
          })),
          total_episode_count: totalCount,
        };
      });

      // Sort by decay score
      signals.sort((a, b) => b.velocity_score - a.velocity_score);

      // Cap game_result to 1 per team slug – keep the most recent
      const gamesByTeam = new Map<string, TrendingSignal>();
      for (const s of signals) {
        if (s.signal_type !== 'game_result') continue;
        for (const t of s.team_slugs) {
          const existing = gamesByTeam.get(t);
          if (!existing || (s.event_date ?? '') > (existing.event_date ?? '')) {
            gamesByTeam.set(t, s);
          }
        }
      }
      const keptGameIds = new Set([...gamesByTeam.values()].map(s => s.id));
      signals = signals.filter(
        s => s.signal_type !== 'game_result' || keptGameIds.has(s.id),
      );

      return signals.slice(0, limit);
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}
