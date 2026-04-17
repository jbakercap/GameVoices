import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useShow } from '../hooks/queries/useShow';
import { useFollowShow } from '../hooks/mutations/useFollowShow';
import { useIsShowFollowed } from '../hooks/queries/useUserLibrary';
import { useAddToQueue } from '../hooks/mutations/useAddToQueue';
import { useSaveEpisode } from '../hooks/mutations/useSaveEpisode';
import { useIsEpisodeSaved } from '../hooks/queries/useUserLibrary';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { formatDurationHuman, formatRelativeDate } from '../lib/formatters';

function EpisodeRow({ episode, showArtwork, onNavigate }: {
  episode: any;
  showArtwork: string | null;
  onNavigate?: (screen: string, params: any) => void;
}) {
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();
  const { user } = useAuth();
  const isCurrent = currentEpisode?.id === episode.id;
  const artwork = episode.artwork_url || showArtwork;
  const saveEpisode = useSaveEpisode();
  const isSaved = useIsEpisodeSaved(episode.id);
  const addToQueue = useAddToQueue();

  const handlePlay = () => {
    if (isCurrent) togglePlayPause();
    else {
      playEpisode({
        id: episode.id,
        title: episode.title,
        showTitle: '',
        artworkUrl: artwork || undefined,
        audioUrl: episode.audio_url,
        durationSeconds: episode.duration_seconds,
      });
    }
  };

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        {/* Artwork */}
        <TouchableOpacity onPress={handlePlay}>
          <View style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
            {artwork ? (
              <Image source={{ uri: artwork }} style={{ width: 56, height: 56 }} contentFit="cover" />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#888', fontSize: 20 }}>🎙</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Info */}
        <View style={{ flex: 1 }}>
          <TouchableOpacity onPress={() => onNavigate?.('EpisodeDetail', { episodeId: episode.id })}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 20 }}
              numberOfLines={2}>{episode.title}</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            {episode.published_at && (
              <Text style={{ color: '#666', fontSize: 12 }}>{formatRelativeDate(episode.published_at)}</Text>
            )}
            {episode.duration_seconds && (
              <Text style={{ color: '#666', fontSize: 12 }}>{formatDurationHuman(episode.duration_seconds)}</Text>
            )}
          </View>
        </View>

        {/* Play button */}
        <TouchableOpacity onPress={handlePlay} style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: isCurrent ? '#FFFFFF' : '#2A2A2A',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: isCurrent ? '#000' : '#fff', fontSize: 12 }}>{isCurrent && isPlaying ? '⏸' : '▶'}</Text>
        </TouchableOpacity>
      </View>

      {/* Action row */}
      {user && (
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 8, paddingLeft: 68 }}>
          <TouchableOpacity onPress={() => saveEpisode.mutate({ episodeId: episode.id, isSaved })}>
            <Text style={{ color: isSaved ? '#FFFFFF' : '#555', fontSize: 12 }}>
              {isSaved ? '★ Saved' : '☆ Save'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => addToQueue.mutate(episode.id)}>
            <Text style={{ color: '#555', fontSize: 12 }}>+ Queue</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function ShowScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { showId } = route.params;
  const { user } = useAuth();
  const { data: show, isLoading } = useShow(showId);
  const isFollowed = useIsShowFollowed(showId);
  const followShow = useFollowShow();

  const handleFollow = () => {
    if (!user) {
      Alert.alert('Sign in', 'Sign in to follow shows');
      return;
    }
    followShow.mutate({ showId, isFollowing: isFollowed });
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  if (!show) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', padding: 16 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: '#888', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: '#888', marginTop: 16 }}>Show not found.</Text>
      </View>
    );
  }

  const hosts = Array.isArray(show.hosts_json) ? show.hosts_json : [];

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Back button */}
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: '#888', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingBottom: 20 }}>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start' }}>
            <View style={{ width: 100, height: 100, borderRadius: 12, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
              {show.artwork_url ? (
                <Image source={{ uri: show.artwork_url }} style={{ width: 100, height: 100 }} contentFit="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 32 }}>🎙</Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', lineHeight: 26 }}>{show.title}</Text>
              {show.publisher && (
                <Text style={{ color: '#888', fontSize: 14, marginTop: 4 }}>{show.publisher}</Text>
              )}
              {show.episode_count && (
                <Text style={{ color: '#666', fontSize: 13, marginTop: 2 }}>{show.episode_count} episodes</Text>
              )}
            </View>
          </View>

          {/* Description */}
          {show.description && (
            <Text style={{ color: '#aaa', fontSize: 14, lineHeight: 20, marginTop: 12 }} numberOfLines={4}>
              {show.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
            </Text>
          )}

          {/* Action buttons */}
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <TouchableOpacity
              onPress={handleFollow}
              disabled={followShow.isPending}
              style={{
                flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                backgroundColor: isFollowed ? '#2A2A2A' : '#FFFFFF',
                borderWidth: isFollowed ? 1 : 0, borderColor: '#444',
              }}>
              <Text style={{ color: isFollowed ? '#aaa' : '#fff', fontWeight: '600', fontSize: 15 }}>
                {isFollowed ? '✓ Following' : '+ Follow'}
              </Text>
            </TouchableOpacity>
            {show.site_url && (
              <TouchableOpacity
                onPress={() => Linking.openURL(show.site_url!)}
                style={{ paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#2A2A2A', borderWidth: 1, borderColor: '#444' }}>
                <Text style={{ color: '#aaa', fontWeight: '600', fontSize: 15 }}>Website</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Hosts */}
          {hosts.length > 0 && (
            <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {hosts.slice(0, 3).map((host: any, i: number) => (
                <View key={i} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: '#1E1E1E' }}>
                  <Text style={{ color: '#aaa', fontSize: 13 }}>🎙 {host.name || host}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Episodes */}
        <View style={{ borderTopWidth: 1, borderTopColor: '#1E1E1E' }}>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', paddingHorizontal: 16, paddingVertical: 12 }}>
            Episodes ({show.episodes.length})
          </Text>
          {show.episodes.map((ep) => (
            <EpisodeRow
              key={ep.id}
              episode={ep}
              showArtwork={show.artwork_url}
              onNavigate={(screen, params) => navigation.navigate(screen, params)}
            />
          ))}
          {show.episodes.length === 0 && (
            <Text style={{ color: '#888', textAlign: 'center', padding: 32 }}>No episodes yet</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}
