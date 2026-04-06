import React, { useState } from 'react';
import {
    View, Text, ScrollView, FlatList,
    TouchableOpacity, ActivityIndicator
  } from 'react-native';
import { useProfile } from '../hooks/useProfile';
import { useTeamStories, Story } from '../hooks/useTeamStories';
import { useTeamsBySlug } from '../hooks/useTeamsBySlug';
import { Image } from 'expo-image';
import { useTrendingPlayers, TrendingPlayer } from '../hooks/useTrendingPlayers';
import { useYourLineup } from '../hooks/useYourlineup';
import { useNavigation, NavigationProp } from '@react-navigation/native';
import { usePlayer } from '../contexts/PlayerContext';
import { useFollowedPlayers } from '../hooks/useFollowedPlayers';
import { useToggleFollowPlayer } from '../hooks/mutations/useToggleFollowPlayer';
import { TodayRecapCard } from '../components/TodayRecapCard';
import { FromPlayersYouFollowShelf } from '../components/FromPlayersYouFollowShelf';
import { ScoreboardCard } from '../components/ScoreboardCard';
import { ShowDiscoverySections } from '../components/ShowDiscoverySections';
import { useUserTeams } from '../hooks/useUserTeams';

const STORY_TYPE_COLORS: Record<string, string> = {
  game_result: '#4CAF50',
  game_preview: '#2196F3',
  trade: '#FF9800',
  signing: '#FF9800',
  injury: '#F44336',
  general: '#888',
  player_emergence: '#9C27B0',
  award_candidacy: '#FFD700',
  coaching: '#00BCD4',
  milestone: '#FFD700',
  draft: '#888',
  offseason: '#888',
};

function StoryCard({ story }: { story: Story }) {
  const navigation = useNavigation<any>();
  const typeColor = STORY_TYPE_COLORS[story.story_type] || '#888';
  const mins = Math.round(story.totalDuration / 60);

  return (
    <TouchableOpacity 
      onPress={() => navigation.navigate('StoryDetail', { storyId: story.id })}
      style={{
        backgroundColor: '#1E1E1E', borderRadius: 12,
        padding: 14, marginHorizontal: 16, marginBottom: 10,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <View style={{
          backgroundColor: typeColor + '22', borderRadius: 4,
          paddingHorizontal: 8, paddingVertical: 3,
        }}>
          <Text style={{ color: typeColor, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' }}>
            {story.story_type.replace(/_/g, ' ')}
          </Text>
        </View>
      </View>
      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', lineHeight: 22, marginBottom: 10 }}>
        {story.headline}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: '#888', fontSize: 13 }}>🎙 {story.episode_count} eps</Text>
        <Text style={{ color: '#888', fontSize: 13 }}>📻 {story.show_count} shows</Text>
        {mins > 0 && <Text style={{ color: '#888', fontSize: 13 }}>⏱ {mins}m</Text>}
      </View>
    </TouchableOpacity>
  );
}

function TeamChip({ slug, label, selected, onPress }: {
  slug: string; label: string; selected: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={{
      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
      backgroundColor: selected ? '#E53935' : '#2A2A2A', marginRight: 8,
    }}>
      <Text style={{ color: selected ? '#fff' : '#aaa', fontWeight: '600', fontSize: 13 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function YourLineupShelf() {
  const { data: episodes, isLoading } = useYourLineup();
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();

  if (isLoading || !episodes || episodes.length === 0) return null;

  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{
        color: '#fff', fontSize: 20, fontWeight: 'bold',
        paddingHorizontal: 16, marginBottom: 12
      }}>
        Your Lineup
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {episodes.map((ep) => {
          const mins = Math.floor(ep.time_remaining / 60);
          const isCurrentEpisode = currentEpisode?.id === ep.id;

          const handlePlay = () => {
            if (isCurrentEpisode) {
              togglePlayPause();
            } else {
              playEpisode({
                id: ep.id,
                title: ep.title,
                showTitle: ep.show_name || '',
                artworkUrl: ep.artwork_url || undefined,
                audioUrl: ep.audio_url,
                durationSeconds: ep.duration_seconds,
              });
            }
          };

          return (
            <TouchableOpacity key={ep.id} onPress={handlePlay} style={{
              width: 160, backgroundColor: '#1E1E1E',
              borderRadius: 12, overflow: 'hidden',
            }}>
              {/* Artwork */}
              <View style={{ width: 160, height: 160, backgroundColor: '#2A2A2A' }}>
                {ep.artwork_url ? (
                  <Image
                    source={{ uri: ep.artwork_url }}
                    style={{ width: 160, height: 160 }}
                    contentFit="cover"
                  />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 40 }}>🎙</Text>
                  </View>
                )}
                {/* Play button overlay */}
                <View style={{
                  position: 'absolute', bottom: 8, right: 8,
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: isCurrentEpisode && isPlaying ? '#fff' : '#E53935',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: isCurrentEpisode && isPlaying ? '#E53935' : '#fff', fontSize: 12, marginLeft: 2 }}>
                    {isCurrentEpisode && isPlaying ? '⏸' : '▶'}
                  </Text>
                </View>
              </View>
              {/* Progress bar */}
              <View style={{ height: 3, backgroundColor: '#333' }}>
                <View style={{
                  height: 3, backgroundColor: '#E53935',
                  width: `${Math.round(ep.progress * 100)}%` as any,
                }} />
              </View>
              {/* Info */}
              <View style={{ padding: 8 }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}
                  numberOfLines={2}>{ep.title}</Text>
                {ep.show_name && (
                  <Text style={{ color: '#888', fontSize: 11, marginTop: 3 }}
                    numberOfLines={1}>{ep.show_name}</Text>
                )}
                <Text style={{ color: '#E53935', fontSize: 11, marginTop: 4, fontWeight: '600' }}>
                  {mins}m left
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function TeamLogoRow({ teams }: { teams: any[] }) {
  if (!teams || teams.length === 0) return null;

  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 12 }}>
        My Teams
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
        {teams.map((team) => (
          <TouchableOpacity key={team.id} style={{
            width: 64, height: 64, borderRadius: 32,
            backgroundColor: '#fff', overflow: 'hidden',
            borderWidth: 3, borderColor: team.primary_color || '#333',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {team.logo_url ? (
              <Image
                source={{ uri: team.logo_url }}
                style={{ width: 52, height: 52 }}
                contentFit="contain"
              />
            ) : (
              <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 14 }}>
                {team.short_name?.slice(0, 2)}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function TrendingPlayersShelf({ teamSlugs, onNavigate }: { 
  teamSlugs: string[], onNavigate?: (screen: string, params: any) => void 
}) {
  const { data: followedPlayers = [] } = useFollowedPlayers();
  const toggleFollow = useToggleFollowPlayer();
  const followedIds = followedPlayers.map(p => p.id);

  const { data: players, isLoading } = useTrendingPlayers({
    teamSlugs: teamSlugs.length > 0 ? teamSlugs : null,
    followedIds,
    limit: 20,
  });

  if (isLoading || !players || players.length === 0) return null;

  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{
        color: '#fff', fontSize: 20, fontWeight: 'bold',
        paddingHorizontal: 16, marginBottom: 12
      }}>
        Trending Players
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}>
        {players.map((player) => {
          const ringColor = player.primary_color || '#E53935';
          const isFollowed = followedIds.includes(player.id);
          return (
            <TouchableOpacity
              onPress={() => onNavigate?.('PlayerDetail', { playerSlug: player.slug })}
              key={player.id} style={{ alignItems: 'center', width: 72 }}>
              {/* Avatar circle */}
              <View style={{ position: 'relative' }}>
                <View style={{
                  width: 64, height: 64, borderRadius: 32,
                  borderWidth: 3, borderColor: ringColor,
                  backgroundColor: '#2A2A2A',
                  overflow: 'hidden', marginBottom: 6,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {player.headshot_url ? (
                    <Image
                      source={{ uri: player.headshot_url }}
                      style={{ width: 64, height: 64 }}
                      contentFit="cover"
                    />
                  ) : (
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
                      {player.name.charAt(0)}
                    </Text>
                  )}
                </View>
                {/* Follow heart button */}
                <TouchableOpacity
                  onPress={(e) => {
                    toggleFollow.mutate({ playerId: player.id, isFollowing: isFollowed });
                  }}
                  style={{
                    position: 'absolute', bottom: 4, right: -4,
                    width: 20, height: 20, borderRadius: 10,
                    backgroundColor: isFollowed ? '#E53935' : '#2A2A2A',
                    borderWidth: 1, borderColor: '#444',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                  <Text style={{ fontSize: 10 }}>{isFollowed ? '❤️' : '🤍'}</Text>
                </TouchableOpacity>
              </View>
              {/* Player name */}
              <Text style={{
                color: '#ccc', fontSize: 11, textAlign: 'center',
              }} numberOfLines={2}>
                {player.name.split(' ').pop()}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export default function HomeScreen({ onNavigate }: { onNavigate?: (screen: string, params: any) => void }) {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const teamSlugs = profile?.topic_slugs || [];
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const activeTeam = selectedTeam || teamSlugs[0] || 'nba-celtics';
  const { data: stories, isLoading: storiesLoading } = useTeamStories(activeTeam);
  const { data: teams } = useTeamsBySlug(teamSlugs);
  const { data: userTeams = [] } = useUserTeams();

  // ✅ Define as a memoized component, not an inline arrow function
  const ListHeader = React.useMemo(() => (
    <>
      <YourLineupShelf />
      <TodayRecapCard
        teamSlugs={teamSlugs}
        teams={teams || []}
        onNavigate={onNavigate}
      />
      <FromPlayersYouFollowShelf onNavigate={onNavigate} />
      <TeamLogoRow teams={teams || []} />
      <TrendingPlayersShelf teamSlugs={teamSlugs} onNavigate={onNavigate} />

      {/* Scoreboard — game_result stories */}
      {(stories || [])
        .filter(s => s.story_type === 'game_result')
        .slice(0, 5)
        .map(story => {
          const teamColor = teams?.find(t => story.team_slugs?.includes(t.slug))?.primary_color || '#E53935';
          return (
            <ScoreboardCard
              key={story.id}
              story={{
                ...story,
                showArtworks: [],
                showCountActual: story.show_count || 0,
                totalDuration: 0,
                episodes: [],
              }}
              teamColor={teamColor}
              onNavigate={onNavigate}
            />
          );
        })
      }

      {teamSlugs.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}>
          {teamSlugs.map((slug) => {
            const team = teams?.find(t => t.slug === slug);
            const label = team?.short_name || slug.split('-').pop() || slug;
            return (
              <TeamChip
                key={slug}
                slug={slug}
                label={label}
                selected={activeTeam === slug}
                onPress={() => setSelectedTeam(slug)}
              />
            );
          })}
        </ScrollView>
      )}

      {/* Show Discovery */}
      <ShowDiscoverySections
        userTeams={userTeams}
        followedShowIds={[]}
        onNavigate={onNavigate}
      />

      {storiesLoading && (
        <View style={{ padding: 32, alignItems: 'center' }}>
          <ActivityIndicator color="#E53935" />
        </View>
      )}
    </>
  ), [teamSlugs, teams, stories, activeTeam, storiesLoading, onNavigate, userTeams]);

  if (profileLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E53935" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 16 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>GameVoices</Text>
        <Text style={{ color: '#888', fontSize: 14, marginTop: 2 }}>What's being talked about</Text>
      </View>

      <FlatList
        data={(stories || []).filter(s => s.story_type !== 'game_result')}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={() => ListHeader}
        renderItem={({ item }) => <StoryCard story={item} />}
        ListEmptyComponent={() => !storiesLoading ? (
          <View style={{ padding: 32, alignItems: 'center' }}>
            <Text style={{ color: '#888', fontSize: 15 }}>No stories yet for this team</Text>
          </View>
        ) : null}
      />
    </View>
  );
}