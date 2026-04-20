import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Dimensions, Modal, Share,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useProfile } from '../hooks/useProfile';
import { useTeamStories } from '../hooks/useTeamStories';
import { useTeamsBySlug } from '../hooks/useTeamsBySlug';
import { useTrendingPlayers } from '../hooks/useTrendingPlayers';
import { useRecentTeamEpisodes } from '../hooks/useRecentTeamEpisodes';
import { useNavigation } from '@react-navigation/native';
import { usePlayer } from '../contexts/PlayerContext';
import { useFollowedPlayers } from '../hooks/useFollowedPlayers';
import { useToggleFollowPlayer } from '../hooks/mutations/useToggleFollowPlayer';
import { FromPlayersYouFollowShelf } from '../components/FromPlayersYouFollowShelf';
import { GameScoreCard } from '../components/ScoreboardCard';
import { ShowDiscoverySections } from '../components/ShowDiscoverySections';
import { useRecentGames } from '../hooks/useRecentGames';
import { useUserTeams } from '../hooks/useUserTeams';
import { TeamPickerModal } from '../components/TeamPickerModal';
import { useAuth } from '../contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.78;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

// ─── New Episodes Carousel ────────────────────────────────────────────────────

function NewEpisodesCarousel({ teamSlugs, teams, onNavigate }: {
  teamSlugs: string[]; teams: any[];
  onNavigate?: (screen: string, params: any) => void;
}) {
  const { data: episodes, isLoading } = useRecentTeamEpisodes(teamSlugs);
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();
  const [menuEp, setMenuEp] = useState<typeof episodes extends (infer T)[] | undefined ? T : any | null>(null);

  if (isLoading || !episodes || episodes.length === 0) return null;

  const ARTWORK_SIZE = CARD_WIDTH;

  return (
    <View style={{ marginBottom: 28 }}>
      {/* Section header */}
      <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>New Episodes</Text>
        <Text style={{ color: '#888', fontSize: 13, marginTop: 2 }}>
          Latest drops from your teams
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + 12}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {episodes.map((ep) => {
          const isCurrentEpisode = currentEpisode?.id === ep.id;
          const isNew = ep.published_at
            ? Date.now() - new Date(ep.published_at).getTime() < 24 * 60 * 60 * 1000
            : false;
          const teamColor = ep.team_slug
            ? teams.find(t => t.slug === ep.team_slug)?.primary_color || null
            : null;

          const handlePlay = () => {
            if (isCurrentEpisode) {
              togglePlayPause();
            } else {
              playEpisode({
                id: ep.id,
                title: ep.title,
                showTitle: ep.show_title || '',
                artworkUrl: ep.artwork_url || undefined,
                audioUrl: ep.audio_url,
                durationSeconds: ep.duration_seconds,
                teamColor: teamColor || undefined,
              });
            }
          };

          return (
            <View key={ep.id} style={{
              width: CARD_WIDTH, borderRadius: 16, overflow: 'hidden',
              backgroundColor: '#1A1A1A',
            }}>
              {/* Artwork */}
              <View style={{ width: ARTWORK_SIZE, height: ARTWORK_SIZE * 0.72, backgroundColor: '#2A2A2A' }}>
                {ep.artwork_url ? (
                  <Image
                    source={{ uri: ep.artwork_url }}
                    style={{ width: ARTWORK_SIZE, height: ARTWORK_SIZE * 0.72 }}
                    contentFit="cover"
                  />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 48 }}>🎙</Text>
                  </View>
                )}
                {/* Dark gradient overlay */}
                <View style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, height: 100,
                  backgroundColor: 'rgba(0,0,0,0.55)',
                }} />
                {/* NEW badge */}
                {isNew && (
                  <View style={{
                    position: 'absolute', top: 12, right: 12,
                    backgroundColor: '#22C55E', borderRadius: 20,
                    paddingHorizontal: 10, paddingVertical: 4,
                  }}>
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>NEW</Text>
                  </View>
                )}
              </View>

              {/* Info + controls */}
              <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', lineHeight: 22 }}
                  numberOfLines={2}>{ep.title}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>
                  {timeAgo(ep.published_at)}
                </Text>

                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  justifyContent: 'space-between', marginTop: 12,
                }}>
                  <TouchableOpacity onPress={handlePlay} style={{
                    width: 46, height: 46, borderRadius: 23,
                    backgroundColor: teamColor || '#2A2A2A', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons
                      name={isCurrentEpisode && isPlaying ? 'pause' : 'play'}
                      size={20} color="#fff"
                      style={{ marginLeft: isCurrentEpisode && isPlaying ? 0 : 2 }}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setMenuEp(ep)}
                    style={{
                      width: 38, height: 38, borderRadius: 19,
                      backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center',
                    }}>
                    <Ionicons name="ellipsis-horizontal" size={18} color="#888" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Episode options menu */}
      <Modal visible={!!menuEp} transparent animationType="fade" onRequestClose={() => setMenuEp(null)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPress={() => setMenuEp(null)}
        >
          <TouchableOpacity activeOpacity={1}>
            <View style={{ backgroundColor: '#1E1E1E', borderRadius: 16, width: 280, overflow: 'hidden' }}>
              {[
                { icon: 'close-circle-outline', label: 'Remove from Up Next', onPress: () => setMenuEp(null) },
                { icon: 'radio-outline', label: 'Go to Episode', onPress: () => { setMenuEp(null); onNavigate?.('EpisodeDetail', { episodeId: menuEp?.id }); } },
                { icon: 'share-social-outline', label: 'Share Episode', onPress: () => { setMenuEp(null); Share.share({ message: `${menuEp?.title} — ${menuEp?.show_title || ''}` }); } },
                { icon: 'list-outline', label: 'Add to Queue', onPress: () => setMenuEp(null) },
                { icon: 'musical-notes-outline', label: 'Add to Playlist', onPress: () => setMenuEp(null) },
                { icon: 'bookmark-outline', label: 'Save Episode', onPress: () => setMenuEp(null) },
                { icon: 'radio-outline', label: 'Go to Show', onPress: () => { setMenuEp(null); if (menuEp?.show_id) onNavigate?.('ShowDetail', { showId: menuEp.show_id }); } },
              ].map((item, i) => (
                <TouchableOpacity key={i} onPress={item.onPress}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 15,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: '#2A2A2A' }}>
                  <Ionicons name={item.icon as any} size={20} color="#aaa" style={{ marginRight: 14, width: 24 }} />
                  <Text style={{ color: '#fff', fontSize: 15 }}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ─── Scoreboard Section ───────────────────────────────────────────────────────

function ScoreboardSection({
  teamSlugs, onNavigate,
}: {
  teamSlugs: string[];
  onNavigate?: (screen: string, params: any) => void;
}) {
  const { data: games, isLoading } = useRecentGames(teamSlugs);

  if (isLoading || !games || games.length === 0) return null;

  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>Scoreboard</Text>
        <Text style={{ color: '#888', fontSize: 13, marginTop: 2 }}>
          Recent results for your teams
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {games.map(game => (
          <GameScoreCard key={game.id} game={game} onNavigate={onNavigate} />
        ))}
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
          const ringColor = player.primary_color || '#FFFFFF';
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
                    backgroundColor: isFollowed ? '#FFFFFF' : '#1E1E1E',
                    borderWidth: 1.5, borderColor: '#333',
                    alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <Ionicons
                    name={isFollowed ? 'heart' : 'heart-outline'}
                    size={11} color={isFollowed ? '#000' : '#888'}
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
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const teamSlugs = profile?.topic_slugs || [];
  const { data: teams } = useTeamsBySlug(teamSlugs);
  const { data: userTeams = [] } = useUserTeams();
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);

  const handleSaveTeams = async (slugs: string[]) => {
    if (!user) return;
    await supabase.from('profiles').update({ topic_slugs: slugs }).eq('user_id', user.id);
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    setTeamPickerOpen(false);
  };

  if (profileLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <TeamPickerModal
        visible={teamPickerOpen}
        onClose={() => setTeamPickerOpen(false)}
        selectedTeams={teamSlugs}
        onSave={handleSaveTeams}
      />

      {/* Sticky top filter bar */}
      <View style={{
        paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#121212',
      }}>
        {/* Filter icon */}
        <TouchableOpacity
          onPress={() => setTeamPickerOpen(true)}
          style={{
            width: 42, height: 42, borderRadius: 12,
            backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center',
          }}>
          <Ionicons name="options-outline" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Team circles */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10 }}>
          {(teams || []).map((team) => (
            <TouchableOpacity
              key={team.id}
              onPress={() => onNavigate?.('TeamDetail', { teamSlug: team.slug })}
              style={{
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
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Scrollable content */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* New Episodes carousel */}
        <View style={{ marginTop: 8 }}>
          <NewEpisodesCarousel teamSlugs={teamSlugs} teams={teams || []} onNavigate={onNavigate} />
        </View>

        {/* Scoreboard */}
        <ScoreboardSection
          teamSlugs={teamSlugs}
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
