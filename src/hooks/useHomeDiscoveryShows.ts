import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { UserTeam } from './useUserTeams';

export interface DiscoveryShow {
  id: string;
  title: string;
  artwork_url: string | null;
}

export interface TeamShelf {
  team: UserTeam;
  shows: DiscoveryShow[];
}

export interface MarketShelf {
  market: string;
  shows: DiscoveryShow[];
}

export interface LeagueShelf {
  leagueSlug: string;
  leagueName: string;
  shows: DiscoveryShow[];
}

export interface HomeDiscoveryData {
  teamShelves: TeamShelf[];
  marketShelves: MarketShelf[];
  leagueShelves: LeagueShelf[];
  nationalShows: DiscoveryShow[];
}

const CITY_TO_MARKET: Record<string, string> = {
  'Boston': 'Boston',
  'New York': 'New York',
  'Brooklyn': 'New York',
  'Los Angeles': 'Los Angeles',
  'Chicago': 'Chicago',
  'Philadelphia': 'Philadelphia',
  'Dallas': 'Dallas',
  'Houston': 'Houston',
  'San Francisco': 'San Francisco',
  'Washington': 'Washington D.C.',
  'Miami': 'Miami',
  'Atlanta': 'Atlanta',
  'Denver': 'Denver',
  'Phoenix': 'Phoenix',
  'Seattle': 'Seattle',
  'Toronto': 'Toronto',
  'Kansas City': 'Kansas City',
  'Las Vegas': 'Las Vegas',
  'Green Bay': 'Green Bay',
  'Buffalo': 'Buffalo',
  'Nashville': 'Nashville',
};

const LEAGUE_NAMES: Record<string, string> = {
  nba: 'NBA',
  nfl: 'NFL',
  mlb: 'MLB',
  nhl: 'NHL',
  wnba: 'WNBA',
};

function toShow(s: any): DiscoveryShow {
  return { id: s.id, title: s.title, artwork_url: s.artwork_url };
}

export function useHomeDiscoveryShows(userTeams: UserTeam[], followedShowIds: string[]) {
  const teamSlugs = userTeams.map(t => t.slug);
  const leagueSlugs = [...new Set(userTeams.map(t => t.league_slug))];

  return useQuery({
    queryKey: ['home-discovery-shows', teamSlugs.sort().join(',')],
    queryFn: async (): Promise<HomeDiscoveryData> => {
      const followedSet = new Set(followedShowIds);
      const isUnfollowed = (s: any) => !followedSet.has(s.id);

      // 1. Team shelves
      const teamResults = await Promise.all(
        userTeams.map(team =>
          supabase
            .from('shows')
            .select('id, title, artwork_url, team_slugs')
            .in('status', ['active', 'stale'])
            .contains('team_slugs', [team.slug])
        )
      );

      const teamShelves: TeamShelf[] = [];
      const usedInTeam = new Set<string>();

      userTeams.forEach((team, i) => {
        const shows = (teamResults[i].data || [])
          .filter(s => ((s as any).team_slugs || []).length <= 1 && isUnfollowed(s))
          .map(toShow);
        if (shows.length > 0) {
          teamShelves.push({ team, shows });
          shows.forEach(s => usedInTeam.add(s.id));
        }
      });

      // 2. Market shelves
      const userMarkets = [
        ...new Set(userTeams.map(t => CITY_TO_MARKET[t.city] || t.city).filter(Boolean)),
      ];

      const marketResults = await Promise.all(
        userMarkets.map(market =>
          supabase
            .from('shows')
            .select('id, title, artwork_url')
            .in('status', ['active', 'stale'])
            .eq('market', market)
        )
      );

      const marketShelves: MarketShelf[] = [];
      userMarkets.forEach((market, i) => {
        const shows = (marketResults[i].data || [])
          .filter(isUnfollowed)
          .slice(0, 10)
          .map(toShow);
        if (shows.length >= 2) marketShelves.push({ market, shows });
      });

      // 3. League shelves
      const leagueResults = await Promise.all(
        leagueSlugs.map(slug =>
          supabase
            .from('shows')
            .select('id, title, artwork_url, leagues!inner(slug)')
            .in('status', ['active', 'stale'])
            .eq('leagues.slug', slug)
            .limit(30)
        )
      );

      const leagueShelves: LeagueShelf[] = [];
      leagueSlugs.forEach((leagueSlug, i) => {
        const shows = ((leagueResults[i].data || []) as any[])
          .filter(s => isUnfollowed(s) && !usedInTeam.has(s.id))
          .slice(0, 10)
          .map(toShow);
        if (shows.length > 0) {
          leagueShelves.push({
            leagueSlug,
            leagueName: LEAGUE_NAMES[leagueSlug] || leagueSlug.toUpperCase(),
            shows,
          });
        }
      });

      // 4. National shows
      const usedAbove = new Set([
        ...usedInTeam,
        ...marketShelves.flatMap(ms => ms.shows.map(s => s.id)),
        ...leagueShelves.flatMap(ls => ls.shows.map(s => s.id)),
      ]);

      const { data: natData } = await supabase
        .from('shows')
        .select('id, title, artwork_url, team_id, team_slugs')
        .in('status', ['active', 'stale'])
        .is('team_id', null)
        .limit(30);

      const nationalShows = ((natData || []) as any[])
        .filter(s => isUnfollowed(s) && !usedAbove.has(s.id))
        .slice(0, 10)
        .map(toShow);

      return { teamShelves, marketShelves, leagueShelves, nationalShows };
    },
    enabled: userTeams.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}