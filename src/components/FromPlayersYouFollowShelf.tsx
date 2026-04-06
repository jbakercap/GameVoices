import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { useFollowedPlayers } from '../hooks/useFollowedPlayers';
import { useFollowedPlayerEpisodes } from '../hooks/useFollowedPlayerEpisodes';
import { usePlayer } from '../contexts/PlayerContext';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

interface Props {
  onNavigate?: (screen: string, params: any) => void;
}

export function FromPlayersYouFollowShelf({ onNavigate }: Props) {
  const { data: followedPlayers = [] } = useFollowedPlayers();
  const { data: playerEpisodes = [] } = useFollowedPlayerEpisodes(followedPlayers);
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();

  if (followedPlayers.length === 0 || playerEpisodes.length === 0) return null;

  return (
    <View style={{ marginBottom: 24 }}>
      <Text style={{
        color: '#fff', fontSize: 20, fontWeight: 'bold',
        paddingHorizontal: 16, marginBottom: 12,
      }}>
        From Players You Follow
      </Text>
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
                width: 200,
                backgroundColor: '#1E1E1E',
                borderRadius: 12,
                padding: 12,
                gap: 8,
                borderWidth: 1,
                borderColor: '#2A2A2A',
              }}
            >
              {/* Player headshot + name */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => onNavigate?.('PlayerDetail', { playerSlug: row.player.slug })}
                >
                  {row.headshot_url ? (
                    <Image
                      source={{ uri: row.headshot_url }}
                      style={{
                        width: 40, height: 40, borderRadius: 20,
                        borderWidth: 2, borderColor: borderColor,
                      }}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={{
                      width: 40, height: 40, borderRadius: 20,
                      backgroundColor: borderColor,
                      alignItems: 'center', justifyContent: 'center',
                      borderWidth: 2, borderColor: borderColor,
                    }}>
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>
                        {row.player.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: 'bold', flex: 1 }} numberOfLines={1}>
                  {row.player.name}
                </Text>
              </View>

              {/* Episode title */}
              <Text style={{ color: '#fff', fontSize: 13, lineHeight: 18, flex: 1 }} numberOfLines={3}>
                {row.episode_title}
              </Text>

              {/* Show name + duration */}
              <Text style={{ color: '#888', fontSize: 11 }} numberOfLines={1}>
                {row.show_name}{row.duration_seconds ? ` · ${formatDuration(row.duration_seconds)}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}