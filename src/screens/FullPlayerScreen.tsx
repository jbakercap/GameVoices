import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, SafeAreaView, ActivityIndicator, ScrollView, Modal, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../contexts/PlayerContext';
import { useAddPearl } from '../hooks/mutations/useAddPearl';

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

  const addPearl = useAddPearl();
  const [bookmarkModal, setBookmarkModal] = useState<{ timestamp: number } | null>(null);
  const [bookmarkNote, setBookmarkNote] = useState('');

  const handleBookmark = () => {
    if (!currentEpisode) return;
    setBookmarkNote('');
    setBookmarkModal({ timestamp: progress.position });
  };

  const handleSaveBookmark = async () => {
    if (!currentEpisode || !bookmarkModal) return;
    try {
      await addPearl.mutateAsync({
        episodeId: currentEpisode.id,
        timestampSeconds: bookmarkModal.timestamp,
        note: bookmarkNote.trim() || undefined,
      });
      setBookmarkModal(null);
    } catch (e: any) {
      Alert.alert('Could not save', e.message || 'Failed to save moment');
    }
  };

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
        {/* Bookmark */}
        <TouchableOpacity onPress={handleBookmark} style={styles.skipButton}>
          <Ionicons name="bookmark-outline" size={26} color="#fff" />
        </TouchableOpacity>

        {/* Skip Back */}
        <TouchableOpacity onPress={skipBack} style={styles.skipButton}>
          <Ionicons name="play-back" size={28} color="#fff" />
          <Text style={styles.skipLabel}>15</Text>
        </TouchableOpacity>

        {/* Play/Pause */}
        <TouchableOpacity onPress={togglePlayPause} style={styles.playButton}>
          {isLoading ? (
            <ActivityIndicator size="large" color="#000" />
          ) : (
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={36}
              color="#000"
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

      {/* Bookmark Modal */}
      <Modal
        visible={!!bookmarkModal}
        transparent
        animationType="slide"
        onRequestClose={() => setBookmarkModal(null)}
      >
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <View style={{ backgroundColor: '#1A1A1A', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', marginBottom: 4 }}>
              ✨ Moment saved at {bookmarkModal ? formatTime(bookmarkModal.timestamp) : ''}
            </Text>
            <Text style={{ color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>
              Add a note (optional)
            </Text>
            <TextInput
              value={bookmarkNote}
              onChangeText={setBookmarkNote}
              placeholder="e.g., great take on the trade deadline"
              placeholderTextColor="#555"
              style={{ backgroundColor: '#2A2A2A', color: '#fff', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 16 }}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setBookmarkModal(null)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2A2A2A', alignItems: 'center' }}
              >
                <Text style={{ color: '#aaa', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveBookmark}
                disabled={addPearl.isPending}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#FFFFFF', alignItems: 'center' }}
              >
                <Text style={{ color: '#000', fontSize: 15, fontWeight: '600' }}>
                  {addPearl.isPending ? 'Saving...' : 'Done'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#FFFFFF',
  },
  speedLabel: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  speedLabelActive: {
    color: '#000',
  },
});