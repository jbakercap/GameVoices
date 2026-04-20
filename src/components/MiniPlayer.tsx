import React from 'react';
import {
  View, Text, TouchableOpacity, Image, ActivityIndicator,
  StyleSheet
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../contexts/PlayerContext';

export default function MiniPlayer({ onPress }: { onPress?: () => void }) {
  const { currentEpisode, isPlaying, isLoading, togglePlayPause, progress, dismissPlayer } = usePlayer();

  if (!currentEpisode) return null;

  const progressPercent = progress.duration > 0
    ? (progress.position / progress.duration) * 100
    : 0;

  const accentColor = currentEpisode.teamColor || '#FFFFFF';

  return (
    <TouchableOpacity activeOpacity={0.95} onPress={onPress} style={styles.container}>
      {/* Progress bar at top */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progressPercent}%` as any, backgroundColor: accentColor }]} />
      </View>

      <View style={styles.content}>
        {/* Artwork */}
        {currentEpisode.artworkUrl ? (
          <Image
            source={{ uri: currentEpisode.artworkUrl }}
            style={styles.artwork}
          />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]}>
            <Ionicons name="mic" size={20} color="#888" />
          </View>
        )}

        {/* Title & Show */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>
            {currentEpisode.title}
          </Text>
          <Text style={styles.show} numberOfLines={1}>
            {currentEpisode.showTitle}
          </Text>
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); togglePlayPause(); }}
            style={[styles.playButton, { backgroundColor: accentColor }]}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={24}
                color="#000"
              />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); dismissPlayer(); }}
            style={styles.dismissButton}
          >
            <Ionicons name="close" size={18} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: 8,
    right: 8,
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
    overflow: 'hidden',
  },
  progressTrack: {
    height: 2,
    backgroundColor: '#333',
    width: '100%',
  },
  progressFill: {
    height: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  artworkFallback: {
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
  },
  title: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  show: {
    color: '#888',
    fontSize: 11,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
