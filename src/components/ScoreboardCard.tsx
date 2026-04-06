import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { usePlayer } from '../contexts/PlayerContext';

interface Episode {
  id: string;
  title: string;
  duration_seconds: number | null;
  audio_url: string;
  artwork_url: string | null;
  show: { id: string; title: string; artwork_url: string | null } | null;
}

interface ScoreboardStory {
  id: string;
  headline: string;
  episode_count: number;
  show_count: number;
  showArtworks: string[];
  showCountActual: number;
  totalDuration: number;
  team_slugs: string[];
  episodes: Episode[];
}

interface Props {
  story: ScoreboardStory;
  teamColor: string;
  onNavigate?: (screen: string, params: any) => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export function ScoreboardCard({ story, teamColor, onNavigate }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();
  const color = teamColor || '#E53935';
  const duration = story.totalDuration ? formatDuration(story.totalDuration) : null;
  const artworks = story.showArtworks || [];
  const showCount = story.showCountActual || story.show_count || 0;

  const handlePlayAll = () => {
    onNavigate?.('StoryDetail', { storyId: story.id });
  };

  const handlePlayEpisode = (ep: Episode) => {
    if (currentEpisode?.id === ep.id) {
      togglePlayPause();
    } else {
      playEpisode({
        id: ep.id,
        title: ep.title,
        showTitle: ep.show?.title || '',
        showId: ep.show?.id,
        artworkUrl: ep.artwork_url || ep.show?.artwork_url || undefined,
        audioUrl: ep.audio_url,
        durationSeconds: ep.duration_seconds || undefined,
      });
    }
  };

  return (
    <View style={{
      marginHorizontal: 16, marginBottom: 16, borderRadius: 16, overflow: 'hidden',
      backgroundColor: '#1A1A1A',
    }}>
      {/* Team color tint overlay */}
      <View style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: color + '33',
      }} />

      {/* Background artwork */}
      {artworks.length > 0 && (
        <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '55%', opacity: 0.15 }}>
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
            {artworks.slice(0, 4).map((url, i) => (
              <Image key={i} source={{ uri: url }} style={{ width: '50%', height: '50%' }} contentFit="cover" />
            ))}
          </View>
        </View>
      )}

      {/* Content */}
      <View style={{ padding: 16 }}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 24, marginBottom: 10 }}>
          {story.headline}
        </Text>

        {/* Artwork stack + stats */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          {artworks.length > 0 && (
            <View style={{ flexDirection: 'row' }}>
              {artworks.slice(0, 4).map((url, i) => (
                <Image key={i} source={{ uri: url }}
                  style={{ width: 28, height: 28, borderRadius: 6, marginLeft: i > 0 ? -6 : 0, borderWidth: 1.5, borderColor: '#000' }}
                  contentFit="cover"
                />
              ))}
              {showCount > 4 && (
                <View style={{
                  width: 28, height: 28, borderRadius: 6, marginLeft: -6,
                  backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Text style={{ color: '#888', fontSize: 10 }}>+{showCount - 4}</Text>
                </View>
              )}
            </View>
          )}
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>
            {story.episode_count} takes · {showCount} shows{duration ? ` · ${duration}` : ''}
          </Text>
        </View>

        {/* Play All button */}
        <TouchableOpacity
          onPress={handlePlayAll}
          style={{
            backgroundColor: color, borderRadius: 24, paddingVertical: 12,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: 'bold' }}>▶  Play All Takes</Text>
        </TouchableOpacity>

        {/* Expand toggle */}
        {story.episodes && story.episodes.length > 0 && (
          <TouchableOpacity
            onPress={() => setExpanded(!expanded)}
            style={{ alignItems: 'center', paddingVertical: 10 }}
          >
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '500' }}>
              {expanded ? 'Hide Episodes ↑' : `See ${story.episodes.length} Related Episodes ↓`}
            </Text>
          </TouchableOpacity>
        )}

        {/* Expanded episodes */}
        {expanded && story.episodes.map((ep) => {
          const isCurrent = currentEpisode?.id === ep.id;
          const epArtwork = ep.artwork_url || ep.show?.artwork_url;
          return (
            <View key={ep.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
              <View style={{ width: 40, height: 40, borderRadius: 8, overflow: 'hidden', backgroundColor: '#333' }}>
                {epArtwork ? (
                  <Image source={{ uri: epArtwork }} style={{ width: 40, height: 40 }} contentFit="cover" />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#888', fontSize: 11, fontWeight: 'bold' }}>
                      {(ep.show?.title || 'P').slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: isCurrent ? color : '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                  {ep.title}
                </Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }} numberOfLines={1}>
                  {ep.show?.title}{ep.duration_seconds ? ` · ${formatDuration(ep.duration_seconds)}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handlePlayEpisode(ep)}
                style={{
                  width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isCurrent ? color : 'rgba(255,255,255,0.1)',
                }}
              >
                <Text style={{ color: '#fff', fontSize: 12 }}>
                  {isCurrent && isPlaying ? '⏸' : '▶'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}