import React from 'react';
import { View } from 'react-native';
import { useHomeDiscoveryShows } from '../hooks/useHomeDiscoveryShows';
import { ShowDiscoveryShelf } from './ShowDiscoveryShelf';
import { UserTeam } from '../hooks/useUserTeams';

interface Props {
  userTeams: UserTeam[];
  followedShowIds: string[];
  onNavigate?: (screen: string, params: any) => void;
}

export function ShowDiscoverySections({ userTeams, followedShowIds, onNavigate }: Props) {
  const { data } = useHomeDiscoveryShows(userTeams, followedShowIds);
  if (!data) return null;

  const { teamShelves, marketShelves, leagueShelves, nationalShows } = data;
  const hasContent =
    teamShelves.length > 0 ||
    marketShelves.length > 0 ||
    leagueShelves.length > 0 ||
    nationalShows.length > 0;

  if (!hasContent) return null;

  return (
    <View>
      {teamShelves.map(({ team, shows }) => (
        <ShowDiscoveryShelf
          key={`team-${team.slug}`}
          title={`More from the ${team.short_name}`}
          shows={shows}
          accentColor={team.primary_color}
          onNavigate={onNavigate}
        />
      ))}
      {marketShelves.map(({ market, shows }) => (
        <ShowDiscoveryShelf
          key={`market-${market}`}
          title={`Popular in ${market}`}
          shows={shows}
          onNavigate={onNavigate}
        />
      ))}
      {leagueShelves.map(({ leagueSlug, leagueName, shows }) => (
        <ShowDiscoveryShelf
          key={`league-${leagueSlug}`}
          title={`${leagueName} Shows`}
          shows={shows}
          onNavigate={onNavigate}
        />
      ))}
      {nationalShows.length > 0 && (
        <ShowDiscoveryShelf
          title="National Shows"
          shows={nationalShows}
          onNavigate={onNavigate}
        />
      )}
    </View>
  );
}