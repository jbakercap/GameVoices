import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useEpisode } from '../hooks/queries/useEpisode';
import { useSaveEpisode } from '../hooks/mutations/useSaveEpisode';
import { useAddToQueue } from '../hooks/mutations/useAddToQueue';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { formatDurationHuman, formatRelativeDate, formatDuration } from '../lib/formatters';

function ProgressBar({ position, duration }: { position: number; duration: number }) {
  if (!duration || duration === 0) return null;
  const pct = Math.min(1, position / duration);
  return (
    <View style={{ height: 4, backgroundColor: '#333', borderRadius: 2, marginVertical: 8 }}>
      <View style={{ height: 4, backgroundColor: '#E53935', borderRadius: 2, width: `${pct * 100}%` as any }} />
    </View>
  );
}

export default function EpisodeScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { episodeId } = route.params;
  const { user } = useAuth();
  const { data: episode, isLoading } = useEpisode(episodeId);
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause, progress } = usePlayer();
  const saveEpisode = useSaveEpisode();
  const addToQueue = useAddToQueue();

  const isCurrent = currentEpisode?.id === episodeId;
  const artwork = episode?.artwork_url || episode?.shows?.artwork_url;

  const handlePlay = () => {
    if (!episode) return;
    if (isCurrent) {
      togglePlayPause();
    } else {
      const startTime = episode.playback?.position_seconds || 0;
      playEpisode({
        id: episode.id,
        title: episode.title,
        showTitle: episode.shows?.title || '',
        artworkUrl: artwork || undefined,
        audioUrl: episode.audio_url,
        durationSeconds: episode.duration_seconds ?? undefined,
        startTime: startTime > 10 ? startTime : undefined,
      });
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E53935" />
      </View>
    );
  }

  if (!episode) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', padding: 16 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: '#888', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: '#888', marginTop: 16 }}>Episode not found.</Text>
      </View>
    );
  }

  const showPlaybackPosition = isCurrent ? progress.position : (episode.playback?.position_seconds || 0);
  const showPlaybackDuration = isCurrent ? progress.duration : (episode.duration_seconds || 0);

  const descriptionText = episode.description
    ? episode.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    : '';

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Back button */}
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: '#888', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Artwork */}
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View style={{ width: 200, height: 200, borderRadius: 16, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
            {artwork ? (
              <Image source={{ uri: artwork }} style={{ width: 200, height: 200 }} contentFit="cover" />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 60 }}>🎙</Text>
              </View>
            )}
          </View>
        </View>

        {/* Show name */}
        {episode.shows && (
          <TouchableOpacity onPress={() => navigation.navigate('ShowDetail', { showId: episode.shows!.id })}>
            <Text style={{ color: '#888', fontSize: 13, textAlign: 'center', marginBottom: 6 }}>
              {episode.shows.title}
            </Text>
          </TouchableOpacity>
        )}

        {/* Title */}
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center', lineHeight: 28, marginBottom: 8 }}>
          {episode.title}
        </Text>

        {/* Meta */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
          {episode.published_at && (
            <Text style={{ color: '#666', fontSize: 13 }}>{formatRelativeDate(episode.published_at)}</Text>
          )}
          {episode.duration_seconds && (
            <Text style={{ color: '#666', fontSize: 13 }}>{formatDurationHuman(episode.duration_seconds)}</Text>
          )}
        </View>

        {/* Progress bar */}
        {showPlaybackDuration > 0 && (
          <View style={{ marginBottom: 4 }}>
            <ProgressBar position={showPlaybackPosition} duration={showPlaybackDuration} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#555', fontSize: 11 }}>{formatDuration(showPlaybackPosition)}</Text>
              <Text style={{ color: '#555', fontSize: 11 }}>{formatDuration(showPlaybackDuration)}</Text>
            </View>
          </View>
        )}

        {/* Play button */}
        <TouchableOpacity
          onPress={handlePlay}
          style={{
            backgroundColor: '#E53935', borderRadius: 14, paddingVertical: 14,
            alignItems: 'center', marginVertical: 16,
          }}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
            {isCurrent && isPlaying ? '⏸  Pause' : '▶  Play'}
          </Text>
        </TouchableOpacity>

        {/* Action buttons */}
        {user && (
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
            <TouchableOpacity
              onPress={() => saveEpisode.mutate({ episodeId: episode.id, isSaved: episode.isSaved || false })}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#1E1E1E', alignItems: 'center', borderWidth: 1, borderColor: episode.isSaved ? '#E53935' : '#333' }}>
              <Text style={{ color: episode.isSaved ? '#E53935' : '#aaa', fontSize: 14, fontWeight: '600' }}>
                {episode.isSaved ? '★ Saved' : '☆ Save'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => addToQueue.mutate(episode.id)}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#1E1E1E', alignItems: 'center', borderWidth: 1, borderColor: '#333' }}>
              <Text style={{ color: '#aaa', fontSize: 14, fontWeight: '600' }}>+ Queue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Description */}
        {descriptionText.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ color: '#888', fontSize: 13, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              About This Episode
            </Text>
            <Text style={{ color: '#aaa', fontSize: 14, lineHeight: 22 }}>{descriptionText}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
