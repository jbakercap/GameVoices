import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, SafeAreaView, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../contexts/PlayerContext';

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function FullPlayerScreen({ onClose }: { onClose: () => void }) {
    const {
        currentEpisode,
        isPlaying,
        isLoading,
        progress,
        togglePlayPause,
        seekTo,
        skipForward,
        skipBack,
        playbackRate,
        setPlaybackRate,
      } = usePlayer();

  if (!currentEpisode) return null;

  const progressPercent = progress.duration > 0
    ? progress.position / progress.duration
    : 0;

  const handleSeek = (x: number, width: number) => {
    const position = (x / width) * progress.duration;
    seekTo(position);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="chevron-down" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Now Playing</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Artwork */}
      <View style={styles.artworkContainer}>
        {currentEpisode.artworkUrl ? (
          <Image
            source={{ uri: currentEpisode.artworkUrl }}
            style={styles.artwork}
          />
        ) : (
          <View style={[styles.artwork, styles.artworkFallback]}>
            <Ionicons name="mic" size={64} color="#555" />
          </View>
        )}
      </View>

      {/* Episode Info */}
      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={2}>
          {currentEpisode.title}
        </Text>
        <Text style={styles.showTitle} numberOfLines={1}>
          {currentEpisode.showTitle}
        </Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View
          style={styles.progressTrack}
          onTouchEnd={(e) => {
            const { locationX, target } = e.nativeEvent;
            // @ts-ignore
            e.target.measure((_x: number, _y: number, width: number) => {
              handleSeek(locationX, width);
            });
          }}
        >
          <View style={[styles.progressFill, { flex: progressPercent }]} />
          <View style={{ flex: 1 - progressPercent }} />
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.timeText}>{formatTime(progress.position)}</Text>
          <Text style={styles.timeText}>{formatTime(progress.duration)}</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        {/* Skip Back */}
        <TouchableOpacity onPress={skipBack} style={styles.skipButton}>
          <Ionicons name="play-back" size={28} color="#fff" />
          <Text style={styles.skipLabel}>15</Text>
        </TouchableOpacity>

        {/* Play/Pause */}
        <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
          {isLoading ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={36}
              color="#fff"
            />
          )}
        </TouchableOpacity>

        {/* Skip Forward */}
        <TouchableOpacity onPress={skipForward} style={styles.skipButton}>
          <Ionicons name="play-forward" size={28} color="#fff" />
          <Text style={styles.skipLabel}>30</Text>
        </TouchableOpacity>
      </View>

      {/* Playback Speed */}
      <View style={styles.speedRow}>
        {[0.75, 1, 1.25, 1.5, 2].map((rate) => (
          <TouchableOpacity
            key={rate}
            onPress={() => setPlaybackRate(rate)}
            style={[styles.speedButton, playbackRate === rate && styles.speedButtonActive]}
          >
            <Text style={[styles.speedLabel, playbackRate === rate && styles.speedLabelActive]}>
              {rate}x
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 24,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  artworkContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  artwork: {
    width: 220,
    height: 220,
    borderRadius: 16,
  },
  artworkFallback: {
    backgroundColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContainer: {
    marginBottom: 20,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 6,
    lineHeight: 26,
  },
  showTitle: {
    color: '#888',
    fontSize: 15,
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressTrack: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    flexDirection: 'row',
    marginBottom: 8,
  },
  progressFill: {
    height: 4,
    backgroundColor: '#E53935',
    borderRadius: 2,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeText: {
    color: '#555',
    fontSize: 12,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 40,
  },
  skipButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 56,
    height: 56,
  },
  skipLabel: {
    color: '#888',
    fontSize: 10,
    marginTop: 2,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
  },
  speedButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
  },
  speedButtonActive: {
    backgroundColor: '#E53935',
  },
  speedLabel: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  speedLabelActive: {
    color: '#fff',
  },
});