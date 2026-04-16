import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import { usePlaylist } from '../hooks/queries/usePlaylist';
import { useRemoveFromPlaylist } from '../hooks/mutations/useRemoveFromPlaylist';
import { usePlayer } from '../contexts/PlayerContext';
import { formatDurationHuman, formatRelativeDate } from '../lib/formatters';

export default function PlaylistScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { playlistId } = route.params;
  const { data: playlist, isLoading } = usePlaylist(playlistId);
  const removeFromPlaylist = useRemoveFromPlaylist();
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();

  const handlePlay = (item: any) => {
    const ep = item.episode;
    if (currentEpisode?.id === ep.id) {
      togglePlayPause();
    } else {
      playEpisode({
        id: ep.id,
        title: ep.title,
        showTitle: ep.show?.title || '',
        artworkUrl: ep.artwork_url || ep.show?.artwork_url || undefined,
        audioUrl: ep.audio_url,
        durationSeconds: ep.duration_seconds,
      });
    }
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#F0B429" />
      </View>
    );
  }

  if (!playlist) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', padding: 16 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: '#888', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: '#888', marginTop: 16 }}>Playlist not found.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: '#888', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 4 }}>{playlist.name}</Text>
          {playlist.description && (
            <Text style={{ color: '#888', fontSize: 14, marginBottom: 6 }}>{playlist.description}</Text>
          )}
          <Text style={{ color: '#666', fontSize: 13 }}>{playlist.items.length} episode{playlist.items.length !== 1 ? 's' : ''}</Text>
        </View>

        {/* Episodes */}
        {playlist.items.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🎵</Text>
            <Text style={{ color: '#888', fontSize: 15 }}>No episodes in this playlist</Text>
          </View>
        ) : (
          playlist.items.map(item => {
            const ep = item.episode;
            const isCurrent = currentEpisode?.id === ep.id;
            const artwork = ep.artwork_url || ep.show?.artwork_url;
            return (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
                <TouchableOpacity onPress={() => handlePlay(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                  <View style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
                    {artwork ? <Image source={{ uri: artwork }} style={{ width: 52, height: 52 }} contentFit="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18 }}>🎙</Text></View>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: isCurrent ? '#F0B429' : '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={2}>{ep.title}</Text>
                    <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                      {[ep.show?.title, ep.duration_seconds ? formatDurationHuman(ep.duration_seconds) : null].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isCurrent ? '#F0B429' : '#2A2A2A', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 10 }}>{isCurrent && isPlaying ? '⏸' : '▶'}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => Alert.alert('Remove', `Remove from playlist?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => removeFromPlaylist.mutate({ playlistId: playlist.id, itemId: item.id }) },
                  ])}
                  style={{ paddingLeft: 12 }}>
                  <Text style={{ color: '#555', fontSize: 18 }}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
