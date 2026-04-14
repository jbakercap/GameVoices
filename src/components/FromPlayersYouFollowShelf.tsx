import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { useFollowedPlayers } from '../hooks/useFollowedPlayers';
import { useFollowedPlayerEpisodes } from '../hooks/useFollowedPlayerEpisodes';
import { usePlayer } from '../contexts/PlayerContext';

interface Props {
  onNavigate?: (screen: string, params: any) => void;
}

export function FromPlayersYouFollowShelf({ onNavigate }: Props) {
  const { data: followedPlayers = [] } = useFollowedPlayers();
  const { data: playerEpisodes = [] } = useFollowedPlayerEpisodes(followedPlayers);
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();

  if (followedPlayers.length === 0 || playerEpisodes.length === 0) return null;

  return (
    <View style={{ marginBottom: 28 }}>
      {/* Section header */}
      <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>Your Players</Text>
        <Text style={{ color: '#888', fontSize: 13, marginTop: 2 }}>
          Episodes that mention them
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {playerEpisodes.map((row) => {
          const borderColor = row.team_color || '#E53935';
          const isCurrentEpisode = currentEpisode?.id === row.episode_id;

          const handlePlay = () => {
            if (isCurrentEpisode) {
              togglePlayPause();
            } else {
              playEpisode({
                id: row.episode_id,
                title: row.episode_title,
                showTitle: row.show_name,
                showId: row.show_id,
                artworkUrl: row.artwork_url || undefined,
                audioUrl: row.audio_url,
                durationSeconds: row.duration_seconds || undefined,
              });
            }
          };

          return (
            <TouchableOpacity
              key={`${row.player.id}-${row.episode_id}`}
              onPress={handlePlay}
              style={{
                width: 220, backgroundColor: '#1E1E1E',
                borderRadius: 14, overflow: 'hidden',
              }}
            >
              {/* Show artwork */}
              <View style={{ width: 220, height: 130, backgroundColor: '#2A2A2A' }}>
                {row.artwork_url ? (
                  <Image source={{ uri: row.artwork_url }}
                    style={{ width: 220, height: 130 }} contentFit="cover" />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 32 }}>🎙</Text>
                  </View>
                )}
              </View>

              {/* Episode title + player info */}
              <View style={{ padding: 12, gap: 8 }}>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600',
                  lineHeight: 18 }} numberOfLines={2}>
                  {row.episode_title}
                </Text>

                {/* Player avatar + name */}
                <TouchableOpacity
                  onPress={() => onNavigate?.('PlayerDetail', { playerSlug: row.player.slug })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  {row.headshot_url ? (
                    <Image source={{ uri: row.headshot_url }}
                      style={{
                        width: 28, height: 28, borderRadius: 14,
                        borderWidth: 2, borderColor: borderColor,
                      }}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={{
                      width: 28, height: 28, borderRadius: 14,
                      backgroundColor: borderColor,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>
                        {row.player.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </Text>
                    </View>
                  )}
                  <Text style={{ color: '#ccc', fontSize: 12, fontWeight: '500' }}>
                    {row.player.name}
                  </Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
