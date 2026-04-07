import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface WatchVideoPost {
  id: string;
  postId: string;
  handle: string;
  text: string;
  postedAt: string;
  videoUrl: string;
  thumbnailUrl?: string;
  author: {
    name: string;
    username: string;
    profileImageUrl?: string;
  };
  publicMetrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
  };
}

const CUTOFF_HOURS = 72;
const MAX_POSTS = 100;

function getCutoffISO() {
  return new Date(Date.now() - CUTOFF_HOURS * 60 * 60 * 1000).toISOString();
}

function diversityShuffle<T>(posts: T[], getHandle: (p: T) => string, maxConsecutive = 2): T[] {
  const arr = [...posts];
  for (let i = maxConsecutive; i < arr.length; i++) {
    const lastHandles = arr.slice(i - maxConsecutive, i).map(getHandle);
    if (lastHandles.every(h => h === lastHandles[0])) {
      const swapIdx = arr.findIndex((p, j) => j > i && getHandle(p) !== lastHandles[0]);
      if (swapIdx !== -1) {
        [arr[i], arr[swapIdx]] = [arr[swapIdx], arr[i]];
      }
    }
  }
  return arr;
}

function mapRows(rows: any[]): WatchVideoPost[] {
  const posts: WatchVideoPost[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.post_id)) continue;
    const pd = row.post_data;
    if (!pd) continue;

    const media = pd.media || pd.attachments?.media || [];
    const videoMedia = media.find((m: any) => m.type === 'video' && m.video_url);
    const videoUrl = videoMedia?.video_url;
    if (!videoUrl) continue;

    seen.add(row.post_id);
    posts.push({
      id: row.id,
      postId: row.post_id,
      handle: row.handle,
      text: (pd.text || '').slice(0, 280),
      postedAt: row.posted_at || pd.created_at,
      videoUrl,
      thumbnailUrl: videoMedia?.preview_image_url || videoMedia?.url,
      author: {
        name: pd.author?.name || row.handle,
        username: pd.author?.username || row.handle,
        profileImageUrl: pd.author?.profile_image_url,
      },
      publicMetrics: pd.public_metrics || undefined,
    });
  }

  return posts;
}

export function useWatchXVideos(teamIds: string[]) {
  const hasTeams = teamIds.length > 0;

  const query = useQuery({
    queryKey: ['watch-x-videos', teamIds],
    queryFn: async () => {
      const cutoff = getCutoffISO();
      const cacheKeys = teamIds.map(id => `team:${id}`);

      const { data, error } = await supabase
        .from('x_feed_cache')
        .select('id, cache_key, handle, post_id, post_data, posted_at, fetched_at')
        .in('cache_key', cacheKeys)
        .eq('has_video', true)
        .gte('posted_at', cutoff)
        .order('posted_at', { ascending: false })
        .limit(MAX_POSTS);

      if (error) throw error;
      return mapRows(data || []);
    },
    enabled: hasTeams,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const sorted = [...(query.data || [])].sort(
    (a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
  );
  const posts = diversityShuffle(sorted, p => p.handle);

  return {
    posts,
    isLoading: query.isLoading,
    isEmpty: !query.isLoading && posts.length === 0,
  };
}
