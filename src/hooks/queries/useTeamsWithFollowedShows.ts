import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useProfile } from '../useProfile';
import { UserTeam } from '../useUserTeams';

const DEFAULT_TEAM_SLUGS = ['red-sox', 'patriots', 'celtics', 'bruins'];

const TEAM_SELECT = 'id, name, short_name, slug, abbreviation, primary_color, logo_url, city, leagues!inner(slug)';

function mapTeam(team: any): UserTeam {
  return {
    id: team.id,
    name: team.name,
    short_name: team.short_name,
    slug: team.slug,
    abbreviation: team.abbreviation,
    primary_color: team.primary_color,
    logo_url: team.logo_url,
    league_slug: team.leagues?.slug || '',
    city: team.city || '',
  };
}

export function useTeamsWithFollowedShows() {
  const { user } = useAuth();
  const { data: profile } = useProfile();

  return useQuery({
    queryKey: ['teams-with-followed-shows', user?.id, profile?.topic_slugs],
    queryFn: async (): Promise<UserTeam[]> => {
      // Not logged in — use defaults
      if (!user) {
        const { data } = await supabase.from('teams').select(TEAM_SELECT).in('slug', DEFAULT_TEAM_SLUGS);
        return (data || []).map(mapTeam);
      }

      // Priority 1: explicit team prefs from topic_slugs
      const topicSlugs = profile?.topic_slugs || [];
      if (topicSlugs.length > 0) {
        const { data } = await supabase.from('teams').select(TEAM_SELECT).in('slug', topicSlugs);
        if (data && data.length > 0) return data.map(mapTeam);
      }

      // Priority 2: teams from followed shows
      const { data: followedShowData } = await supabase
        .from('user_library')
        .select('shows!inner(team_id, teams(id, name, short_name, slug, abbreviation, primary_color, logo_url, city, leagues!inner(slug)))')
        .eq('user_id', user.id)
        .eq('item_type', 'follow')
        .not('show_id', 'is', null);

      const teamsFromFollows = new Map<string, UserTeam>();
      for (const item of followedShowData || []) {
        const team = (item.shows as any)?.teams;
        if (team?.id) teamsFromFollows.set(team.id, mapTeam(team));
      }
      if (teamsFromFollows.size > 0) return Array.from(teamsFromFollows.values());

      // Priority 3: default teams
      const { data } = await supabase.from('teams').select(TEAM_SELECT).in('slug', DEFAULT_TEAM_SLUGS);
      return (data || []).map(mapTeam);
    },
    staleTime: 5 * 60 * 1000,
  });
}
