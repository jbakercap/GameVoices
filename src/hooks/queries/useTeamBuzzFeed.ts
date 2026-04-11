import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useState, useCallback } from 'react';

export interface BuzzPost {
  id: string;
  postId: string;
  handle: string;
  text: string;
  postedAt: string;
  postData: any;
}

const PAGE_SIZE = 50;
const CUTOFF_HOURS = 72;
const CUTOFF_HOURS_VIDEO = 120;

function getCutoffISO(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function extractPosts(rows: any[]): BuzzPost[] {
  const posts: BuzzPost[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.post_id)) continue;
    if (!row.post_data) continue;
    seen.add(row.post_id);
    posts.push({
      id: row.id,
      postId: row.post_id,
      handle: row.handle,
      text: (row.post_data.text || '').slice(0, 280),
      postedAt: row.posted_at || row.post_data.created_at,
      postData: row.post_data,
    });
  }
  return posts;
}

export function hasVideo(bp: BuzzPost): boolean {
  const media = bp.postData?.media;
  if (!Array.isArray(media)) return false;
  return media.some((m: any) => m.type === 'video' || m.type === 'animated_gif');
}

export function useTeamBuzzFeed(teamId: string | undefined, filter: 'all' | 'video' = 'all') {
  const queryClient = useQueryClient();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);

  const query = useInfiniteQuery({
    queryKey: ['team-buzz-feed', teamId, filter],
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const isVideo = filter === 'video';
      const cutoff = getCutoffISO(isVideo ? CUTOFF_HOURS_VIDEO : CUTOFF_HOURS);
      const cacheKey = `team:${teamId}`;

      let q = supabase
        .from('x_feed_cache')
        .select('id, cache_key, handle, post_id, post_data, posted_at, fetched_at')
        .eq('cache_key', cacheKey)
        .gte('posted_at', cutoff)
        .order('posted_at', { ascending: false })
        .range(pageParam as number, (pageParam as number) + PAGE_SIZE - 1);

      if (isVideo) q = q.eq('has_video', true);

      const { data, error } = await q;
      if (error) throw error;

      const rawRows = data || [];
      const posts = extractPosts(rawRows);
      const hasMore = rawRows.length >= PAGE_SIZE;
      return { posts, nextOffset: hasMore ? (pageParam as number) + PAGE_SIZE : undefined };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    enabled: !!teamId,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
  });

  const allPosts = query.data?.pages.flatMap(p => p.posts) || [];
  // Deduplicate
  const seen = new Set<string>();
  const posts = allPosts.filter(p => {
    if (seen.has(p.postId)) return false;
    seen.add(p.postId);
    return true;
  });

  const refresh = useCallback(async () => {
    if (isManualRefreshing || !teamId) return;
    setIsManualRefreshing(true);
    try {
      await supabase.functions.invoke('fetch-x-feed', {
        body: { mode: 'team', team_id: teamId, unfiltered: true, force: true },
      });
      await queryClient.invalidateQueries({ queryKey: ['team-buzz-feed', teamId] });
    } finally {
      setIsManualRefreshing(false);
    }
  }, [isManualRefreshing, queryClient, teamId]);

  return {
    posts,
    isLoading: query.isLoading,
    isEmpty: !query.isLoading && posts.length === 0,
    error: query.error,
    refresh,
    isRefreshing: isManualRefreshing,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: !!query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
