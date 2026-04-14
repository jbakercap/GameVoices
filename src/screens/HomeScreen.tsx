import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useProfile } from '../hooks/useProfile';
import { useTeamStories } from '../hooks/useTeamStories';
import { useTeamsBySlug } from '../hooks/useTeamsBySlug';
import { useTrendingPlayers } from '../hooks/useTrendingPlayers';
import { useYourLineup } from '../hooks/useYourlineup';
import { useNavigation } from '@react-navigation/native';
import { usePlayer } from '../contexts/PlayerContext';
import { useFollowedPlayers } from '../hooks/useFollowedPlayers';
import { useToggleFollowPlayer } from '../hooks/mutations/useToggleFollowPlayer';
import { FromPlayersYouFollowShelf } from '../components/FromPlayersYouFollowShelf';
import { ScoreboardCard } from '../components/ScoreboardCard';
import { ShowDiscoverySections } from '../components/ShowDiscoverySections';
import { useTodayRecap } from '../components/TodayRecapCard';
import { useUserTeams } from '../hooks/useUserTeams';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.78;

// ─── Featured Carousel ────────────────────────────────────────────────────────

function FeaturedCarousel() {
  const { data: episodes, isLoading } = useYourLineup();
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();

  if (isLoading || !episodes || episodes.length === 0) return null;

  return (
    <View style={{ marginBottom: 28 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + 12}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {episodes.map((ep) => {
          const mins = Math.round(ep.time_remaining / 60);
          const totalMins = Math.round(ep.duration_seconds / 60);
          const isCurrentEpisode = currentEpisode?.id === ep.episodeId;
          const isRecent = true; // show NEW badge for in-progress episodes

          const handlePlay = () => {
            if (isCurrentEpisode) {
              togglePlayPause();
            } else {
              playEpisode({
                id: ep.episodeId,
                title: ep.title,
                showTitle: ep.show_name || '',
                artworkUrl: ep.artwork_url || undefined,
                audioUrl: ep.audio_url,
                durationSeconds: ep.duration_seconds,
              });
            }
          };

          return (
            <View key={ep.id} style={{
              width: CARD_WIDTH, borderRadius: 16, overflow: 'hidden',
              backgroundColor: '#1E1E1E',
            }}>
              {/* Artwork */}
              <View style={{ width: CARD_WIDTH, height: 240, backgroundColor: '#2A2A2A' }}>
                {ep.artwork_url ? (
                  <Image
                    source={{ uri: ep.artwork_url }}
                    style={{ width: CARD_WIDTH, height: 240 }}
                    contentFit="cover"
                  />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 48 }}>🎙</Text>
                  </View>
                )}
                {/* Dark gradient overlay */}
                <View style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, height: 140,
                  backgroundColor: 'rgba(0,0,0,0.65)',
                }} />
                {/* NEW badge */}
                <View style={{
                  position: 'absolute', top: 12, right: 12,
                  backgroundColor: '#22C55E', borderRadius: 20,
                  paddingHorizontal: 10, paddingVertical: 4,
                }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>NEW</Text>
                </View>
                {/* Title + meta overlay */}
                <View style={{ position: 'absolute', bottom: 48, left: 14, right: 14 }}>
                  <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', lineHeight: 22 }}
                    numberOfLines={2}>{ep.title}</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 4 }}>
                    {totalMins > 0 ? `${totalMins} min` : ''}
                    {mins > 0 && totalMins > 0 ? ` · ${mins}m left` : ''}
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
              {/* Buttons row */}
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12,
              }}>
                <TouchableOpacity onPress={handlePlay} style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#fff', fontSize: 14, marginLeft: isCurrentEpisode && isPlaying ? 0 : 2 }}>
                    {isCurrentEpisode && isPlaying ? '⏸' : '▶'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#aaa', fontSize: 16, letterSpacing: 1 }}>···</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Scoreboard Section ───────────────────────────────────────────────────────

function ScoreboardSection({
  teamSlugs, teams, onNavigate,
}: {
  teamSlugs: string[];
  teams: any[];
  onNavigate?: (screen: string, params: any) => void;
}) {
  const { data: stories, isLoading } = useTodayRecap(teamSlugs);

  if (isLoading || !stories || stories.length === 0) return null;

  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>Scoreboard</Text>
        <Text style={{ color: '#888', fontSize: 13, marginTop: 2 }}>
          Game results covered across multiple podcasts
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {stories.map((story) => {
          const teamColor = teams?.find(t => story.team_slugs?.includes(t.slug))?.primary_color || '#E53935';
          const matchedTeam = teams?.find(t => story.team_slugs?.includes(t.slug));
          return (
            <ScoreboardCard
              key={story.id}
              story={story as any}
              teamColor={teamColor}
              matchedTeam={matchedTeam}
              onNavigate={onNavigate}
              compact
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Who's Buzzing ────────────────────────────────────────────────────────────

function WhoBuzzingShelf({ teamSlugs, onNavigate }: {
  teamSlugs: string[];
  onNavigate?: (screen: string, params: any) => void;
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
    <View style={{ marginBottom: 28 }}>
      <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
        <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>Who's Buzzing</Text>
          <Ionicons name="chevron-forward" size={20} color="#fff" style={{ marginTop: 2 }} />
        </TouchableOpacity>
        <Text style={{ color: '#888', fontSize: 13, marginTop: 2 }}>
          Most mentioned in podcasts this week
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 16 }}>
        {players.map((player) => {
          const ringColor = player.primary_color || '#E53935';
          const isFollowed = followedIds.includes(player.id);
          return (
            <TouchableOpacity
              onPress={() => onNavigate?.('PlayerDetail', { playerSlug: player.slug })}
              key={player.id}
              style={{ alignItems: 'center', width: 80 }}
            >
              <View style={{ position: 'relative', marginBottom: 8 }}>
                <View style={{
                  width: 68, height: 68, borderRadius: 34,
                  borderWidth: 3, borderColor: ringColor,
                  backgroundColor: '#2A2A2A', overflow: 'hidden',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {player.headshot_url ? (
                    <Image source={{ uri: player.headshot_url }}
                      style={{ width: 68, height: 68 }} contentFit="cover" />
                  ) : (
                    <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>
                      {player.name.charAt(0)}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => toggleFollow.mutate({ playerId: player.id, isFollowing: isFollowed })}
                  style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 22, height: 22, borderRadius: 11,
                    backgroundColor: isFollowed ? '#E53935' : '#1E1E1E',
                    borderWidth: 1.5, borderColor: '#333',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name={isFollowed ? 'heart' : 'heart-outline'}
                    size={11} color={isFollowed ? '#fff' : '#888'}
                  />
                </TouchableOpacity>
              </View>
              <Text style={{ color: '#ccc', fontSize: 11, textAlign: 'center' }} numberOfLines={2}>
                {player.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function HomeFooter() {
  return (
    <View style={{
      marginHorizontal: 16, marginTop: 8, marginBottom: 32,
      backgroundColor: '#1A1A1A', borderRadius: 16, padding: 24,
      alignItems: 'center',
    }}>
      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', marginBottom: 16 }}>
        Connect with GameVoices:
      </Text>
      <View style={{ flexDirection: 'row', gap: 24, marginBottom: 16 }}>
        <TouchableOpacity style={{
          width: 44, height: 44, borderRadius: 22,
          borderWidth: 1.5, borderColor: '#444',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="logo-instagram" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={{
          width: 44, height: 44, borderRadius: 22,
          borderWidth: 1.5, borderColor: '#444',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="logo-tiktok" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={{
          width: 44, height: 44, borderRadius: 22,
          borderWidth: 1.5, borderColor: '#444',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="logo-snapchat" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
      <Text style={{ color: '#555', fontSize: 12 }}>© 2026 GameVoices</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen({ onNavigate }: {
  onNavigate?: (screen: string, params: any) => void;
}) {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const teamSlugs = profile?.topic_slugs || [];
  const { data: teams } = useTeamsBySlug(teamSlugs);
  const { data: userTeams = [] } = useUserTeams();

  if (profileLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E53935" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Sticky top filter bar */}
      <View style={{
        paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#121212',
      }}>
        {/* Filter icon */}
        <TouchableOpacity style={{
          width: 42, height: 42, borderRadius: 12,
          backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center',
        }}>
          <Ionicons name="options-outline" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Team circles */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10 }}>
          {(teams || []).map((team) => (
            <View key={team.id} style={{
              width: 46, height: 46, borderRadius: 23,
              backgroundColor: '#fff', overflow: 'hidden',
              borderWidth: 3, borderColor: team.primary_color || '#333',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {team.logo_url ? (
                <Image source={{ uri: team.logo_url }}
                  style={{ width: 36, height: 36 }} contentFit="contain" />
              ) : (
                <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 12 }}>
                  {team.short_name?.slice(0, 2)}
                </Text>
              )}
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Scrollable content */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Featured carousel */}
        <View style={{ marginTop: 8 }}>
          <FeaturedCarousel />
        </View>

        {/* Scoreboard */}
        <ScoreboardSection
          teamSlugs={teamSlugs}
          teams={teams || []}
          onNavigate={onNavigate}
        />

        {/* Your Players */}
        <FromPlayersYouFollowShelf onNavigate={onNavigate} />

        {/* Who's Buzzing */}
        <WhoBuzzingShelf teamSlugs={teamSlugs} onNavigate={onNavigate} />

        {/* Show Discovery */}
        <ShowDiscoverySections
          userTeams={userTeams}
          followedShowIds={[]}
          onNavigate={onNavigate}
        />

        {/* Footer */}
        <HomeFooter />
      </ScrollView>
    </View>
  );
}
