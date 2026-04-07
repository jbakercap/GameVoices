import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { deduplicateEpisodes } from '../../lib/deduplicateEpisodes';

export interface EpisodeWithShow {
  id: string;
  title: string;
  artwork_url: string | null;
  audio_url: string;
  duration_seconds: number | null;
  published_at: string | null;
  show_id: string;
  topic_slug: string | null;
  shows: {
    id: string;
    title: string;
    artwork_url: string | null;
    episode_count: number | null;
    team_slugs?: string[] | null;
  } | null;
}

const PAGE_SIZE = 10;
const FETCH_SIZE = PAGE_SIZE * 3;

async function getTeamShowData(teamSlug: string) {
  const { data: team } = await supabase.from('teams').select('id, short_name').eq('slug', teamSlug).maybeSingle();
  if (!team) return null;

  const [r1, r2] = await Promise.all([
    supabase.from('shows').select('id, team_slugs').eq('team_id', team.id).or('status.eq.active,status.is.null'),
    supabase.from('shows').select('id, team_slugs').contains('team_slugs', [teamSlug]).or('status.eq.active,status.is.null'),
  ]);

  const showMap = new Map<string, string[] | null>();
  for (const s of [...(r1.data || []), ...(r2.data || [])]) {
    if (!showMap.has(s.id)) showMap.set(s.id, (s as any).team_slugs ?? null);
  }

  const multiTeamShowIds = new Set<string>();
  for (const [id, slugs] of showMap) {
    if (Array.isArray(slugs) && slugs.length > 1) multiTeamShowIds.add(id);
  }

  return {
    teamShortName: team.short_name,
    showIds: [...showMap.keys()],
    multiTeamShowIds,
  };
}

function isRelevant(episode: EpisodeWithShow, teamShortName: string, multiTeamShowIds: Set<string>): boolean {
  if (!multiTeamShowIds.has(episode.show_id)) return true;
  const titleLower = (episode.title || '').toLowerCase();
  return titleLower.includes(teamShortName.toLowerCase());
}

export function useTeamEpisodes(teamSlug: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['team-episodes', teamSlug],
    queryFn: async ({ pageParam }): Promise<{ episodes: EpisodeWithShow[]; nextCursor: string | null }> => {
      const result = await getTeamShowData(teamSlug!);
      if (!result || result.showIds.length === 0) return { episodes: [], nextCursor: null };

      let query = supabase
        .from('episodes')
        .select(`id, title, artwork_url, audio_url, duration_seconds, published_at, show_id, topic_slug, shows (id, title, artwork_url, episode_count)`)
        .in('show_id', result.showIds)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(FETCH_SIZE);

      if (pageParam) query = (query as any).lt('published_at', pageParam);

      const { data: rawEpisodes, error } = await query;
      if (error) throw error;

      const raw = (rawEpisodes || []) as unknown as EpisodeWithShow[];
      const relevant = raw.filter(ep => isRelevant(ep, result.teamShortName, result.multiTeamShowIds));
      const filtered = deduplicateEpisodes(relevant).slice(0, PAGE_SIZE);
      const lastRaw = raw[raw.length - 1];

      return {
        episodes: filtered,
        nextCursor: raw.length === FETCH_SIZE ? lastRaw?.published_at : null,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    enabled: !!teamSlug,
    staleTime: 2 * 60 * 1000,
  });
}
