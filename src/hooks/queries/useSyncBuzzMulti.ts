import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

async function fetchStaleTeamIds(teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const { data } = await supabase
    .from('teams')
    .select('id, x_cache_refreshed_at')
    .in('id', teamIds);
  if (!data) return teamIds;
  const now = Date.now();
  return data
    .filter(t => !t.x_cache_refreshed_at || now - new Date(t.x_cache_refreshed_at).getTime() > STALE_THRESHOLD_MS)
    .map(t => t.id);
}

async function syncTeamFeeds(teamIds: string[]) {
  if (teamIds.length === 0) return;
  await Promise.allSettled(
    teamIds.map(teamId =>
      supabase.functions
        .invoke('fetch-x-feed', { body: { mode: 'team', team_id: teamId, force: true } })
        .catch(err => console.warn(`fetch-x-feed failed for ${teamId}:`, err))
    )
  );
}

export function useSyncBuzzMulti(teamIds: string[]) {
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const hasRun = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const invalidateVideos = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['watch-x-videos'] });
    }, 500);
  }, [queryClient]);

  // Background sync on mount — only stale teams
  useEffect(() => {
    if (hasRun.current || teamIds.length === 0) return;
    hasRun.current = true;

    (async () => {
      setIsSyncing(true);
      try {
        const stale = await fetchStaleTeamIds(teamIds);
        if (stale.length > 0) {
          await syncTeamFeeds(stale);
          invalidateVideos();
        }
      } finally {
        setIsSyncing(false);
      }
    })();
  }, [teamIds, invalidateVideos]);

  // Manual trigger — force-syncs ALL teams
  const syncAllTeams = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await syncTeamFeeds(teamIds);
      invalidateVideos();
    } finally {
      setIsSyncing(false);
    }
  }, [teamIds, isSyncing, invalidateVideos]);

  return { syncAllTeams, isSyncing };
}
