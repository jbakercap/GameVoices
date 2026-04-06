import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { FollowedPlayer } from '../types/player';

export interface PlayerEpisodeRow {
  player: FollowedPlayer;
  episode_id: string;
  episode_title: string;
  show_name: string;
  audio_url: string;
  artwork_url: string | null;
  duration_seconds: number | null;
  published_at: string;
  team_color: string | null;
  headshot_url: string | null;
  show_id?: string;
}

export function useFollowedPlayerEpisodes(followedPlayers: FollowedPlayer[]) {
  const playerIds = followedPlayers.map((p) => p.id);

  return useQuery({
    queryKey: ['followed-player-episodes', playerIds],
    queryFn: async (): Promise<PlayerEpisodeRow[]> => {
      if (playerIds.length === 0) return [];

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);

      const { data: links, error } = await supabase
        .from('player_episodes')
        .select(`
          player_id, episode_id,
          episodes!inner(
            id, title, description, published_at, duration_seconds,
            audio_url, artwork_url, show_id,
            shows!inner(title, episode_count, artwork_url)
          )
        `)
        .in('player_id', playerIds)
        .eq('mention_type', 'primary')
        .gte('episodes.published_at', cutoff.toISOString())
        .order('published_at', { referencedTable: 'episodes', ascending: false })
        .limit(50);

      if (error) throw error;
      if (!links || links.length === 0) return [];

      const playerMap = new Map(followedPlayers.map((p) => [p.id, p]));

      // Fetch team colors
      const teamSlugs = [
        ...new Set(followedPlayers.map((p) => p.team_slug).filter(Boolean)),
      ] as string[];
      const teamColorMap = new Map<string, string>();
      if (teamSlugs.length > 0) {
        const { data: teams } = await supabase
          .from('teams')
          .select('slug, primary_color')
          .in('slug', teamSlugs);
        for (const t of teams || []) {
          if (t.primary_color) teamColorMap.set(t.slug, t.primary_color);
        }
      }

      // Build results, deduplicate by episode
      const seenEpisodes = new Set<string>();
      const results: PlayerEpisodeRow[] = [];

      for (const link of links) {
        if (results.length >= 10) break;
        const ep = link.episodes as any;
        if (!ep || seenEpisodes.has(ep.id)) continue;

        const player = playerMap.get(link.player_id);
        if (!player) continue;

        // Check player name appears in title or description
        const playerNameLower = player.name.toLowerCase();
        const titleLower = (ep.title || '').toLowerCase();
        const descLower = (ep.description || '')
          .replace(/<[^>]*>/g, '')
          .slice(0, 500)
          .toLowerCase();

        if (
          !titleLower.includes(playerNameLower) &&
          !descLower.includes(playerNameLower)
        )
          continue;

        seenEpisodes.add(ep.id);
        results.push({
          player,
          episode_id: ep.id,
          episode_title: ep.title,
          show_name: ep.shows?.title || '',
          audio_url: ep.audio_url,
          artwork_url: ep.artwork_url || ep.shows?.artwork_url || null,
          duration_seconds: ep.duration_seconds,
          published_at: ep.published_at,
          team_color:
            (player.team_slug && teamColorMap.get(player.team_slug)) || null,
          headshot_url: player.headshot_url,
          show_id: ep.show_id,
        });
      }

      return results;
    },
    enabled: playerIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}