import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

export interface RosterPlayer {
  id: string;
  name: string;
  slug: string;
  position: string | null;
  jersey_number: number | null;
  role: string | null;
  headshot_url: string | null;
  status: string | null;
  isFeatured?: boolean;
}

async function getFeaturedPlayerIds(teamSlug: string): Promise<Set<string>> {
  const featured = new Set<string>();

  const { data: storyLinked } = await supabase
    .from('player_stories')
    .select('player_id, stories!inner(status, team_slugs)')
    .filter('stories.status', 'eq', 'active')
    .filter('stories.team_slugs', 'cs', `{${teamSlug}}`);

  if (storyLinked?.length) storyLinked.forEach((r: any) => featured.add(r.player_id));

  const { data: hotStories } = await supabase
    .from('stories')
    .select('primary_entity_slug')
    .eq('status', 'active')
    .contains('team_slugs', [teamSlug])
    .gte('show_count', 3)
    .not('primary_entity_slug', 'is', null);

  if (hotStories?.length) {
    const slugs = hotStories.map((s: any) => s.primary_entity_slug!).filter(Boolean);
    if (slugs.length) {
      const { data: matchedPlayers } = await supabase
        .from('players')
        .select('id')
        .eq('team_slug', teamSlug)
        .in('slug', slugs);
      matchedPlayers?.forEach((p: any) => featured.add(p.id));
    }
  }

  return featured;
}

function getLastName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] || '').toLowerCase();
}

export function useTeamRoster(teamSlug: string | undefined) {
  return useQuery({
    queryKey: ['team-roster', teamSlug],
    queryFn: async () => {
      const [rosterResult, featuredIds] = await Promise.all([
        supabase
          .from('players')
          .select('id, name, slug, position, jersey_number, role, headshot_url, status')
          .eq('team_slug', teamSlug!)
          .eq('status', 'active')
          .order('role', { ascending: true }),
        getFeaturedPlayerIds(teamSlug!),
      ]);

      if (rosterResult.error) throw rosterResult.error;
      const roster = (rosterResult.data || []) as RosterPlayer[];

      roster.forEach(p => { p.isFeatured = featuredIds.has(p.id); });
      roster.sort((a, b) => {
        if (a.role !== b.role) return a.role === 'player' ? -1 : 1;
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return getLastName(a.name).localeCompare(getLastName(b.name));
      });

      return roster;
    },
    enabled: !!teamSlug,
    staleTime: 30 * 60 * 1000,
  });
}
