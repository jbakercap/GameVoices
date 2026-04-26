import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView,
  ActivityIndicator, Modal, TextInput, Alert,
  Dimensions, Share, ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { usePlayer } from '../contexts/PlayerContext';
import { useAddPearl } from '../hooks/mutations/useAddPearl';
import { useQueue } from '../hooks/queries/useQueue';
import { useRemoveFromQueue } from '../hooks/mutations/useRemoveFromQueue';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ARTWORK_SIZE = SCREEN_WIDTH - 64;

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatRemaining(position: number, duration: number): string {
  if (!duration) return '-0:00';
  const remaining = Math.max(0, duration - position);
  return `-${formatTime(remaining)}`;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SPEED_LABELS: Record<number, string> = { 0.5: '0.5x', 0.75: '0.75x', 1: 'Normal', 1.25: '1.25x', 1.5: '1.5x', 2: '2x' };

export default function FullPlayerScreen({ onClose }: { onClose: () => void }) {
  const navigation = useNavigation<any>();
  const {
    currentEpisode, isPlaying, isLoading, progress,
    togglePlayPause, seekTo, skipForward, skipBack,
    playbackRate, setPlaybackRate, closeFullPlayer,
  } = usePlayer();

  const addPearl = useAddPearl();
  const { data: queue = [] } = useQueue();
  const removeFromQueue = useRemoveFromQueue();
  const [bookmarkModal, setBookmarkModal] = useState<{ timestamp: number } | null>(null);
  const [bookmarkNote, setBookmarkNote] = useState('');
  const [showOptions, setShowOptions] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [trackWidth, setTrackWidth] = useState(1);

  if (!currentEpisode) return null;

  const accentColor = currentEpisode.teamColor || '#FFFFFF';
  const progressPercent = progress.duration > 0 ? Math.min(1, progress.position / progress.duration) : 0;

  const handleSeek = (locationX: number) => {
    if (trackWidth <= 0) return;
    const position = Math.max(0, Math.min(1, locationX / trackWidth)) * progress.duration;
    seekTo(position);
  };

  const handleSaveMoment = () => {
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

  const handleShare = async () => {
    try {
      await Share.share({ message: `${currentEpisode.title} — ${currentEpisode.showTitle}` });
    } catch {}
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(playbackRate);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setPlaybackRate(next);
  };

  const navigateAndClose = (screen: string, params: any) => {
    setShowOptions(false);
    closeFullPlayer();
    setTimeout(() => navigation.navigate(screen, params), 300);
  };

  const dotLeft = trackWidth * progressPercent;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>

      {/* ── Header ──────────────────────────────────────────── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
      }}>
        <TouchableOpacity onPress={onClose} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-down" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: '#888', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.5 }}>
          NOW PLAYING
        </Text>
        <TouchableOpacity
          onPress={() => setShowQueue(true)}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="list" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Artwork ─────────────────────────────────────────── */}
      <View style={{ alignItems: 'center', paddingHorizontal: 32, marginTop: 16, marginBottom: 28 }}>
        <View style={{ width: ARTWORK_SIZE, height: ARTWORK_SIZE, borderRadius: 16, overflow: 'hidden', backgroundColor: '#1A1A1A' }}>
          {currentEpisode.artworkUrl ? (
            <Image source={{ uri: currentEpisode.artworkUrl }}
              style={{ width: ARTWORK_SIZE, height: ARTWORK_SIZE }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="mic" size={64} color="#555" />
            </View>
          )}
        </View>
      </View>

      {/* ── Episode Info ─────────────────────────────────────── */}
      <View style={{ alignItems: 'center', paddingHorizontal: 32, marginBottom: 24 }}>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center', lineHeight: 24, marginBottom: 6 }}
          numberOfLines={2}>
          {currentEpisode.title}
        </Text>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }} numberOfLines={1}>
          {currentEpisode.showTitle}
        </Text>
      </View>

      {/* ── Progress Bar ─────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 32, marginBottom: 28 }}>
        {/* Track */}
        <View
          style={{ height: 4, backgroundColor: '#2A2A2A', borderRadius: 2, marginBottom: 10, position: 'relative' }}
          onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onResponderRelease={(e) => handleSeek(e.nativeEvent.locationX)}
          onResponderMove={(e) => handleSeek(e.nativeEvent.locationX)}
        >
          {/* Fill */}
          <View style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: dotLeft, backgroundColor: accentColor, borderRadius: 2,
          }} />
          {/* Dot */}
          <View style={{
            position: 'absolute', top: -5,
            left: Math.max(0, dotLeft - 7),
            width: 14, height: 14, borderRadius: 7,
            backgroundColor: accentColor,
          }} />
        </View>
        {/* Times */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ color: '#555', fontSize: 12 }}>{formatTime(progress.position)}</Text>
          <Text style={{ color: '#555', fontSize: 12 }}>{formatRemaining(progress.position, progress.duration)}</Text>
        </View>
      </View>

      {/* ── Controls ─────────────────────────────────────────── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', paddingHorizontal: 32,
      }}>
        {/* Save moment */}
        <TouchableOpacity onPress={handleSaveMoment}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="sparkles-outline" size={26} color="#fff" />
        </TouchableOpacity>

        {/* Rewind 15 */}
        <TouchableOpacity onPress={skipBack}
          style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-undo" size={30} color="#fff" />
          <Text style={{ color: '#888', fontSize: 10, marginTop: 1 }}>15</Text>
        </TouchableOpacity>

        {/* Play / Pause */}
        <TouchableOpacity
          onPress={togglePlayPause}
          style={{
            width: 72, height: 72, borderRadius: 36,
            backgroundColor: accentColor,
            alignItems: 'center', justifyContent: 'center',
          }}>
          {isLoading ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={34} color="#fff"
              style={{ marginLeft: isPlaying ? 0 : 3 }} />
          )}
        </TouchableOpacity>

        {/* Forward 30 */}
        <TouchableOpacity onPress={skipForward}
          style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="arrow-redo" size={30} color="#fff" />
          <Text style={{ color: '#888', fontSize: 10, marginTop: 1 }}>30</Text>
        </TouchableOpacity>

        {/* Options */}
        <TouchableOpacity onPress={() => setShowOptions(true)}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="ellipsis-horizontal" size={26} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ── Save Moment Modal ────────────────────────────────── */}
      <Modal visible={!!bookmarkModal} transparent animationType="slide" onRequestClose={() => setBookmarkModal(null)}>
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
              <TouchableOpacity onPress={() => setBookmarkModal(null)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#2A2A2A', alignItems: 'center' }}>
                <Text style={{ color: '#aaa', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveBookmark} disabled={addPearl.isPending}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: accentColor, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
                  {addPearl.isPending ? 'Saving...' : 'Done'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Options Modal ───────────────────────────────────── */}
      <Modal visible={showOptions} transparent animationType="slide" onRequestClose={() => setShowOptions(false)}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowOptions(false)} />
        <View style={{ backgroundColor: '#1A1A1A', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingBottom: 40 }}>
          {/* Handle */}
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#444', alignSelf: 'center', marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 8 }}>
            <View style={{ width: 32 }} />
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Options</Text>
            <TouchableOpacity onPress={() => setShowOptions(false)}>
              <Ionicons name="close" size={24} color="#888" />
            </TouchableOpacity>
          </View>

          {[
            {
              icon: 'speedometer-outline', label: 'Playback Speed',
              right: SPEED_LABELS[playbackRate] || `${playbackRate}x`,
              onPress: cycleSpeed,
            },
            {
              icon: 'moon-outline', label: 'Sleep Timer',
              right: '', onPress: () => Alert.alert('Sleep Timer', 'Coming soon'),
            },
            {
              icon: 'bookmark-outline', label: 'Save Episode',
              right: '', onPress: () => { setShowOptions(false); handleSaveMoment(); },
            },
            {
              icon: 'share-social-outline', label: 'Share Episode',
              right: '', onPress: () => { setShowOptions(false); handleShare(); },
            },
            {
              icon: 'document-text-outline', label: 'Go to Episode',
              right: '', onPress: () => navigateAndClose('EpisodeDetail', { episodeId: currentEpisode.id }),
            },
            {
              icon: 'radio-outline', label: 'Go to Show',
              right: '', onPress: currentEpisode.showId
                ? () => navigateAndClose('ShowDetail', { showId: currentEpisode.showId })
                : () => {},
            },
          ].map((item, i) => (
            <TouchableOpacity key={i} onPress={item.onPress}
              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16,
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: '#2A2A2A' }}>
              <Ionicons name={item.icon as any} size={22} color="#e11d48" style={{ marginRight: 16 }} />
              <Text style={{ color: '#fff', fontSize: 16, flex: 1 }}>{item.label}</Text>
              {item.right ? <Text style={{ color: '#888', fontSize: 14 }}>{item.right}</Text> : null}
            </TouchableOpacity>
          ))}
        </View>
      </Modal>

      {/* ── Queue Modal ──────────────────────────────────────── */}
      <Modal visible={showQueue} transparent animationType="slide" onRequestClose={() => setShowQueue(false)}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowQueue(false)} />
        <View style={{ backgroundColor: '#1A1A1A', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 20, paddingBottom: 40, minHeight: 200 }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#444', alignSelf: 'center', marginBottom: 16 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 20 }}>
            <View style={{ width: 32 }} />
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>Up Next</Text>
            <TouchableOpacity onPress={() => setShowQueue(false)}>
              <Ionicons name="close" size={24} color="#888" />
            </TouchableOpacity>
          </View>
          {/* Now playing */}
          <View style={{ paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {currentEpisode.artworkUrl && (
              <Image source={{ uri: currentEpisode.artworkUrl }}
                style={{ width: 48, height: 48, borderRadius: 8 }} contentFit="cover" />
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#888', fontSize: 11, fontWeight: '600', marginBottom: 2 }}>NOW PLAYING</Text>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={2}>
                {currentEpisode.title}
              </Text>
              <Text style={{ color: '#666', fontSize: 12 }}>{currentEpisode.showTitle}</Text>
            </View>
          </View>

          {/* Queue items */}
          {queue.length === 0 ? (
            <View style={{ marginTop: 24, paddingHorizontal: 24 }}>
              <Text style={{ color: '#555', fontSize: 14, textAlign: 'center' }}>Nothing else queued up</Text>
            </View>
          ) : (
            <ScrollView style={{ marginTop: 16 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: '#888', fontSize: 11, fontWeight: '600', paddingHorizontal: 24, marginBottom: 8 }}>
                UP NEXT
              </Text>
              {queue.map((item, i) => {
                const ep = item.episodes;
                if (!ep) return null;
                return (
                  <View key={item.id}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24,
                      paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: '#2A2A2A' }}>
                    {ep.artwork_url ? (
                      <Image source={{ uri: ep.artwork_url }}
                        style={{ width: 44, height: 44, borderRadius: 6 }} contentFit="cover" />
                    ) : (
                      <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: '#2A2A2A',
                        alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="mic" size={20} color="#555" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={2}>
                        {ep.title}
                      </Text>
                      <Text style={{ color: '#666', fontSize: 12 }} numberOfLines={1}>
                        {ep.shows?.title}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeFromQueue.mutate(item.episode_id)}
                      style={{ padding: 8 }}>
                      <Ionicons name="close" size={18} color="#555" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>

    </SafeAreaView>
  );
}
