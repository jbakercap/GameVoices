export function deduplicateEpisodes<
  T extends { title: string; published_at: string | null; show_id: string; shows?: { episode_count?: number | null } | null },
>(episodes: T[]): T[] {
  const seen = new Map<string, T>();
  for (const ep of episodes) {
    const key = `${(ep.title || '').trim().toLowerCase()}|${ep.published_at || ''}`;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, ep);
    } else {
      const prevCount = (prev as any).shows?.episode_count ?? 0;
      const curCount = (ep as any).shows?.episode_count ?? 0;
      if (curCount > prevCount) seen.set(key, ep);
    }
  }
  return [...seen.values()];
}
