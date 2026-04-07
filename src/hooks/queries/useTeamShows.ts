import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface TeamShow {
  id: string;
  title: string;
  artwork_url: string | null;
  publisher: string | null;
  episode_count: number | null;
  isFollowed: boolean;
}

export function useTeamShows(teamSlug: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['team-shows', teamSlug, user?.id],
    queryFn: async (): Promise<TeamShow[]> => {
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('id')
        .eq('slug', teamSlug)
        .maybeSingle();

      if (teamError) throw teamError;
      if (!team) return [];

      const cols = 'id, title, artwork_url, publisher, episode_count' as const;
      const statusFilter = 'status.eq.active,status.eq.stale,status.is.null';
      const [r1, r2] = await Promise.all([
        supabase.from('shows').select(cols).eq('team_id', team.id).or(statusFilter).order('last_episode_at', { ascending: false, nullsFirst: false }),
        supabase.from('shows').select(cols).contains('team_slugs', [teamSlug!]).or(statusFilter).order('last_episode_at', { ascending: false, nullsFirst: false }),
      ]);
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;

      const seen = new Set<string>();
      const shows: (typeof r1.data[0])[] = [];
      for (const s of [...(r1.data || []), ...(r2.data || [])]) {
        if (!seen.has(s.id)) { seen.add(s.id); shows.push(s); }
      }

      let followedIds: Set<string> = new Set();
      if (user) {
        const { data: follows } = await supabase
          .from('user_library')
          .select('show_id')
          .eq('user_id', user.id)
          .eq('item_type', 'follow')
          .not('show_id', 'is', null);
        if (follows) followedIds = new Set(follows.map(f => f.show_id!));
      }

      return (shows || []).map(s => ({
        ...s,
        isFollowed: followedIds.has(s.id),
      }));
    },
    enabled: !!teamSlug,
    staleTime: 2 * 60 * 1000,
  });
}
