import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useRecentGames } from '../hooks/useRecentGames';

export function CompactScoreboard({ teamSlugs }: { teamSlugs: string[] }) {
  const { data: games, isLoading } = useRecentGames(teamSlugs);
  if (isLoading || !games || games.length === 0) return null;

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: '#222' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {games.map((game, i) => {
          const followedIsHome = game.followedTeamSlug === game.home_team_slug;
          const myTeam = followedIsHome ? game.homeTeam : game.awayTeam;
          const oppTeam = followedIsHome ? game.awayTeam : game.homeTeam;
          const myScore = followedIsHome ? game.home_score : game.away_score;
          const oppScore = followedIsHome ? game.away_score : game.home_score;
          const myWon = myScore > oppScore;
          const date = game.event_date
            ? new Date(game.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
            : '';

          return (
            <View
              key={game.id}
              style={{
                borderRightWidth: i < games.length - 1 ? 1 : 0,
                borderRightColor: '#222',
                paddingHorizontal: 16,
                paddingVertical: 10,
                minWidth: 155,
              }}
            >
              <Text style={{ color: '#555', fontSize: 10, fontWeight: '600', marginBottom: 6 }}>
                FINAL · {date}
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                <View style={{
                  width: 20, height: 20, borderRadius: 10,
                  backgroundColor: myTeam?.primary_color || '#333',
                  alignItems: 'center', justifyContent: 'center', marginRight: 8,
                }}>
                  {myTeam?.logo_url ? (
                    <Image source={{ uri: myTeam.logo_url }} style={{ width: 14, height: 14 }} contentFit="contain" />
                  ) : (
                    <Text style={{ color: '#fff', fontSize: 8, fontWeight: 'bold' }}>
                      {myTeam?.short_name?.slice(0, 2) || '?'}
                    </Text>
                  )}
                </View>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 }}>
                  {myTeam?.short_name || '—'}
                </Text>
                <Text style={{ color: myWon ? '#fff' : '#555', fontSize: 13, fontWeight: myWon ? '800' : '400' }}>
                  {myScore}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  width: 20, height: 20, borderRadius: 10,
                  backgroundColor: oppTeam?.primary_color || '#333',
                  alignItems: 'center', justifyContent: 'center', marginRight: 8,
                }}>
                  {oppTeam?.logo_url ? (
                    <Image source={{ uri: oppTeam.logo_url }} style={{ width: 14, height: 14 }} contentFit="contain" />
                  ) : (
                    <Text style={{ color: '#fff', fontSize: 8, fontWeight: 'bold' }}>
                      {oppTeam?.short_name?.slice(0, 2) || '?'}
                    </Text>
                  )}
                </View>
                <Text style={{ color: '#777', fontSize: 13, flex: 1 }}>
                  {oppTeam?.short_name || '—'}
                </Text>
                <Text style={{ color: myWon ? '#555' : '#fff', fontSize: 13, fontWeight: myWon ? '400' : '800' }}>
                  {oppScore}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
