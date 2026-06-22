import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRecentGames, GameWithTeams } from '../hooks/useRecentGames';
import { useGameRecaps, GameRecapEpisode } from '../hooks/queries/useGameRecaps';
import { usePlayer } from '../contexts/PlayerContext';
import { darkenColor, withAlpha } from './EpisodeFeedPost';
import { formatDurationHuman } from '../lib/formatters';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Recap mini card ──────────────────────────────────────────────────────────

interface RecapCardProps {
  episode: GameRecapEpisode;
  teamColor: string;
  onPress: () => void;
}

function RecapCard({ episode, teamColor, onPress }: RecapCardProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={{
        width: 240, height: 72, borderRadius: 12,
        backgroundColor: '#282828',
        borderWidth: 1, borderColor: withAlpha(teamColor, 0.75),
        flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10,
      }}
    >
      <View style={{
        width: 48, height: 48, borderRadius: 8,
        backgroundColor: '#1E1E1E', overflow: 'hidden', flexShrink: 0,
      }}>
        {episode.artwork_url ? (
          <Image source={{ uri: episode.artwork_url }} style={{ width: 48, height: 48 }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="mic" size={18} color="rgba(255,255,255,0.4)" />
          </View>
        )}
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 17 }} numberOfLines={2}>
          {episode.title}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }} numberOfLines={1}>
          {episode.show_title} · {formatDurationHuman(episode.duration_seconds)}
        </Text>
      </View>

      <View style={{
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Ionicons name="play" size={12} color="#fff" style={{ marginLeft: 2 }} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Recap shelf ──────────────────────────────────────────────────────────────

interface RecapShelfProps {
  game: GameWithTeams;
  onNavigate?: (screen: string, params: any) => void;
}

function RecapShelf({ game, onNavigate }: RecapShelfProps) {
  const { data: episodes = [], isLoading } = useGameRecaps(game.storyIds);
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();
  const awayName = game.awayTeam?.short_name || 'Away';
  const homeName = game.homeTeam?.short_name || 'Home';

  // Match episode's show_team_slugs against game teams to pick the right color
  function colorForEpisode(ep: GameRecapEpisode): string {
    const slugs = ep.show_team_slugs || [];
    if (slugs.includes(game.home_team_slug)) return game.homeTeam?.primary_color || '#1E2A3A';
    if (slugs.includes(game.away_team_slug)) return game.awayTeam?.primary_color || '#1E2A3A';
    // Fall back to the followed team's color
    const followedIsHome = game.followedTeamSlug === game.home_team_slug;
    return (followedIsHome ? game.homeTeam?.primary_color : game.awayTeam?.primary_color) || '#1E2A3A';
  }

  return (
    <View style={{ backgroundColor: '#0F0F0F', paddingTop: 14, paddingBottom: 14 }}>
      <TouchableOpacity
        onPress={() => game.storyIds?.length && onNavigate?.('GameFeed', {
          storyIds: game.storyIds,
          title: `${awayName} vs ${homeName}`,
          homeTeamSlug: game.home_team_slug,
          awayTeamSlug: game.away_team_slug,
          homeColor: game.homeTeam?.primary_color || '#333',
          awayColor: game.awayTeam?.primary_color || '#333',
          homeShortName: homeName,
          awayShortName: awayName,
        })}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, marginBottom: 10 }}
      >
        <Text style={{ color: '#888', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Recaps · {awayName} vs {homeName}
        </Text>
        <Ionicons name="chevron-forward" size={12} color="#555" />
      </TouchableOpacity>

      {isLoading ? (
        <ActivityIndicator color="#555" style={{ marginVertical: 8 }} />
      ) : episodes.length === 0 ? (
        <Text style={{ color: '#555', fontSize: 13, paddingHorizontal: 16 }}>
          No recaps yet for this game.
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
        >
          {episodes.map(ep => {
            const color = colorForEpisode(ep);
            const isCurrent = currentEpisode?.id === ep.id;
            return (
              <RecapCard
                key={ep.id}
                episode={ep}
                teamColor={color}
                onPress={() => {
                  if (isCurrent) {
                    togglePlayPause();
                  } else {
                    playEpisode({
                      id: ep.id,
                      title: ep.title,
                      showTitle: ep.show_title || '',
                      artworkUrl: ep.artwork_url || undefined,
                      audioUrl: ep.audio_url,
                      durationSeconds: ep.duration_seconds,
                      teamColor: color,
                    });
                  }
                }}
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CompactScoreboard({ teamSlugs, onNavigate }: { teamSlugs: string[]; onNavigate?: (screen: string, params: any) => void }) {
  const { data: games, isLoading } = useRecentGames(teamSlugs);
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [seenGameIds, setSeenGameIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem('seen_game_recap_ids').then(raw => {
      if (raw) setSeenGameIds(new Set(JSON.parse(raw)));
    });
  }, []);

  if (isLoading || !games || games.length === 0) return null;

  const expandedGame = games.find(g => g.id === expandedGameId) ?? null;

  const handleCardPress = (gameId: string) => {
    LayoutAnimation.configureNext({
      duration: 250,
      create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeOut },
      delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
    });
    if (!seenGameIds.has(gameId)) {
      const next = new Set(seenGameIds).add(gameId);
      setSeenGameIds(next);
      AsyncStorage.setItem('seen_game_recap_ids', JSON.stringify([...next]));
    }
    setExpandedGameId(prev => (prev === gameId ? null : gameId));
  };

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 10, paddingVertical: 12 }}>
        {games.map((game) => {
          const isActive = expandedGameId === game.id;
          const followedIsHome = game.followedTeamSlug === game.home_team_slug;
          const myTeam = followedIsHome ? game.homeTeam : game.awayTeam;
          const oppTeam = followedIsHome ? game.awayTeam : game.homeTeam;
          const myScore = followedIsHome ? game.home_score : game.away_score;
          const oppScore = followedIsHome ? game.away_score : game.home_score;
          const myWon = myScore > oppScore;
          const hasRecaps = (game.episode_count ?? 0) > 0;
          const date = game.event_date
            ? new Date(game.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
            : '';

          return (
            <TouchableOpacity
              key={game.id}
              activeOpacity={0.75}
              onPress={() => handleCardPress(game.id)}
              style={{
                width: 160,
                backgroundColor: isActive ? '#252525' : '#1A1A1A',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: isActive ? '#444' : '#272727',
                padding: 13,
              }}
            >
              {/* Away / My team */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={{
                  width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff',
                  alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 8,
                }}>
                  {myTeam?.logo_url ? (
                    <Image source={{ uri: myTeam.logo_url }} style={{ width: 20, height: 20 }} contentFit="contain" />
                  ) : (
                    <Text style={{ color: '#000', fontSize: 9, fontWeight: 'bold' }}>
                      {myTeam?.short_name?.slice(0, 3) || '?'}
                    </Text>
                  )}
                </View>
                <Text style={{ color: myWon ? '#fff' : '#666', fontSize: 13, fontWeight: myWon ? '700' : '400', flex: 1 }} numberOfLines={1}>
                  {myTeam?.short_name || '—'}
                </Text>
                <Text style={{ color: myWon ? '#fff' : '#555', fontSize: 16, fontWeight: '700' }}>
                  {myScore}
                </Text>
              </View>

              {/* Home / Opponent */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 11 }}>
                <View style={{
                  width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff',
                  alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 8,
                }}>
                  {oppTeam?.logo_url ? (
                    <Image source={{ uri: oppTeam.logo_url }} style={{ width: 20, height: 20 }} contentFit="contain" />
                  ) : (
                    <Text style={{ color: '#000', fontSize: 9, fontWeight: 'bold' }}>
                      {oppTeam?.short_name?.slice(0, 3) || '?'}
                    </Text>
                  )}
                </View>
                <Text style={{ color: myWon ? '#666' : '#fff', fontSize: 13, fontWeight: myWon ? '400' : '700', flex: 1 }} numberOfLines={1}>
                  {oppTeam?.short_name || '—'}
                </Text>
                <Text style={{ color: myWon ? '#555' : '#fff', fontSize: 16, fontWeight: '700' }}>
                  {oppScore}
                </Text>
              </View>

              {/* Footer */}
              <View style={{ borderTopWidth: 1, borderTopColor: '#272727', paddingTop: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                {hasRecaps ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: seenGameIds.has(game.id) ? '#555' : '#22c55e' }} />
                      <Text style={{ color: seenGameIds.has(game.id) ? '#555' : '#22c55e', fontSize: 11, fontWeight: '600' }}>
                        {game.episode_count} ep{game.episode_count === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Text style={{ color: '#555', fontSize: 10, fontWeight: '600' }}>
                        See recaps
                      </Text>
                      <Ionicons name={isActive ? 'chevron-up' : 'chevron-down'} size={10} color="#555" />
                    </View>
                  </>
                ) : (
                  <Text style={{ color: '#3A3A3A', fontSize: 11 }}>FINAL · {date}</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {expandedGame && <RecapShelf game={expandedGame} onNavigate={onNavigate} />}
    </View>
  );
}
