import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList,
  ActivityIndicator, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useFollowedShows, useSavedEpisodes } from '../hooks/queries/useUserLibrary';
import { useQueue } from '../hooks/queries/useQueue';
import { useGroupedListenHistory } from '../hooks/queries/useListenHistory';
import { usePlaylists } from '../hooks/queries/usePlaylists';
import { useSavedStories } from '../hooks/queries/useSavedStories';
import { useRemoveFromQueue, useClearQueue } from '../hooks/mutations/useRemoveFromQueue';
import { useClearHistory } from '../hooks/mutations/useClearHistory';
import { useCreatePlaylist } from '../hooks/mutations/useCreatePlaylist';
import { useDeletePlaylist } from '../hooks/mutations/useDeletePlaylist';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { formatDurationHuman, formatRelativeDate } from '../lib/formatters';

type LibraryTab = 'saved' | 'queue' | 'history' | 'playlists' | 'shows' | 'stories';

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={{ color: '#888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
      {title}
    </Text>
  );
}

function EpisodeItem({ episode, showTitle, artwork, onPress, onNavigateShow }: {
  episode: any; showTitle?: string; artwork?: string | null; onPress?: () => void; onNavigateShow?: () => void;
}) {
  const { currentEpisode, isPlaying } = usePlayer();
  const isCurrent = currentEpisode?.id === episode.id;
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
      <View style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
        {artwork ? <Image source={{ uri: artwork }} style={{ width: 52, height: 52 }} contentFit="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18 }}>🎙</Text></View>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: isCurrent ? '#E53935' : '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={2}>{episode.title}</Text>
        <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
          {[showTitle, episode.duration_seconds ? formatDurationHuman(episode.duration_seconds) : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {isCurrent && isPlaying && <Text style={{ color: '#E53935', fontSize: 10 }}>▶</Text>}
    </TouchableOpacity>
  );
}

export default function LibraryScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<LibraryTab>('saved');
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const { data: savedEpisodes = [], isLoading: savedLoading } = useSavedEpisodes();
  const { data: queue = [], isLoading: queueLoading } = useQueue();
  const { data: historyGroups, isLoading: historyLoading } = useGroupedListenHistory();
  const { data: playlists = [], isLoading: playlistsLoading } = usePlaylists();
  const { data: followedShows = [], isLoading: showsLoading } = useFollowedShows();
  const { data: savedStories = [], isLoading: storiesLoading } = useSavedStories();

  const removeFromQueue = useRemoveFromQueue();
  const clearQueue = useClearQueue();
  const clearHistory = useClearHistory();
  const createPlaylist = useCreatePlaylist();
  const deletePlaylist = useDeletePlaylist();

  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();

  const handlePlayEpisode = (ep: any, showTitle: string, artwork: string | null) => {
    if (currentEpisode?.id === ep.id) {
      togglePlayPause();
    } else {
      playEpisode({ id: ep.id, title: ep.title, showTitle, artworkUrl: artwork || undefined, audioUrl: ep.audio_url, durationSeconds: ep.duration_seconds });
    }
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 40, marginBottom: 16 }}>📚</Text>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8 }}>Your Library</Text>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>Sign in to access your saved episodes, queue, and playlists</Text>
      </View>
    );
  }

  const tabs: { key: LibraryTab; label: string; count?: number }[] = [
    { key: 'saved', label: 'Saved', count: savedEpisodes.length },
    { key: 'queue', label: 'Queue', count: queue.length },
    { key: 'history', label: 'History' },
    { key: 'playlists', label: 'Playlists', count: playlists.length },
    { key: 'shows', label: 'Shows', count: followedShows.length },
    { key: 'stories', label: 'Stories', count: savedStories.length },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 8 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>Library</Text>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: activeTab === tab.key ? '#E53935' : '#2A2A2A' }}>
            <Text style={{ color: activeTab === tab.key ? '#fff' : '#aaa', fontSize: 13, fontWeight: '600' }}>
              {tab.label}{tab.count !== undefined && tab.count > 0 ? ` (${tab.count})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Saved Episodes */}
      {activeTab === 'saved' && (
        savedLoading ? <ActivityIndicator color="#E53935" style={{ marginTop: 40 }} /> :
        savedEpisodes.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>★</Text>
            <Text style={{ color: '#888', fontSize: 15 }}>No saved episodes yet</Text>
          </View>
        ) : (
          <FlatList
            data={savedEpisodes}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 120 }}
            renderItem={({ item }) => (
              <EpisodeItem
                episode={item}
                showTitle={item.shows?.title}
                artwork={item.artwork_url || item.shows?.artwork_url}
                onPress={() => handlePlayEpisode(item, item.shows?.title || '', item.artwork_url || item.shows?.artwork_url || null)}
                onNavigateShow={() => navigation.navigate('ShowDetail', { showId: item.show_id })}
              />
            )}
          />
        )
      )}

      {/* Queue */}
      {activeTab === 'queue' && (
        <View style={{ flex: 1 }}>
          {queue.length > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 }}>
              <TouchableOpacity onPress={() => Alert.alert('Clear Queue', 'Remove all episodes from queue?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => clearQueue.mutate() },
              ])}>
                <Text style={{ color: '#888', fontSize: 13 }}>Clear all</Text>
              </TouchableOpacity>
            </View>
          )}
          {queueLoading ? <ActivityIndicator color="#E53935" style={{ marginTop: 40 }} /> :
          queue.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>📋</Text>
              <Text style={{ color: '#888', fontSize: 15 }}>Your queue is empty</Text>
            </View>
          ) : (
            <FlatList
              data={queue}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 120 }}
              renderItem={({ item }) => {
                const ep = item.episodes;
                if (!ep) return null;
                const artwork = ep.artwork_url || ep.shows?.artwork_url;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <EpisodeItem
                        episode={ep}
                        showTitle={ep.shows?.title}
                        artwork={artwork}
                        onPress={() => handlePlayEpisode(ep, ep.shows?.title || '', artwork || null)}
                      />
                    </View>
                    <TouchableOpacity onPress={() => removeFromQueue.mutate(ep.id)} style={{ paddingHorizontal: 16 }}>
                      <Text style={{ color: '#555', fontSize: 18 }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
          )}
        </View>
      )}

      {/* History */}
      {activeTab === 'history' && (
        <View style={{ flex: 1 }}>
          {historyLoading ? <ActivityIndicator color="#E53935" style={{ marginTop: 40 }} /> :
          !historyGroups || Object.keys(historyGroups).length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🕐</Text>
              <Text style={{ color: '#888', fontSize: 15 }}>No listening history yet</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 }}>
                <TouchableOpacity onPress={() => Alert.alert('Clear History', 'Clear all listening history?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear', style: 'destructive', onPress: () => clearHistory.mutate() },
                ])}>
                  <Text style={{ color: '#888', fontSize: 13 }}>Clear all</Text>
                </TouchableOpacity>
              </View>
              {Object.entries(historyGroups).map(([group, items]) => (
                <View key={group}>
                  <SectionHeader title={group} />
                  {items.map((item: any) => {
                    const ep = item.episodes;
                    if (!ep) return null;
                    const artwork = ep.artwork_url || ep.shows?.artwork_url;
                    return (
                      <EpisodeItem
                        key={item.id}
                        episode={ep}
                        showTitle={ep.shows?.title}
                        artwork={artwork}
                        onPress={() => handlePlayEpisode(ep, ep.shows?.title || '', artwork || null)}
                      />
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Playlists */}
      {activeTab === 'playlists' && (
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 8 }}>
            <TouchableOpacity
              onPress={() => Alert.prompt('New Playlist', 'Enter playlist name', (name) => {
                if (name?.trim()) createPlaylist.mutate({ name: name.trim() });
              })}>
              <Text style={{ color: '#E53935', fontSize: 14, fontWeight: '600' }}>+ New Playlist</Text>
            </TouchableOpacity>
          </View>
          {playlistsLoading ? <ActivityIndicator color="#E53935" style={{ marginTop: 40 }} /> :
          playlists.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🎵</Text>
              <Text style={{ color: '#888', fontSize: 15 }}>No playlists yet</Text>
            </View>
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 120 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => navigation.navigate('PlaylistDetail', { playlistId: item.id })}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
                  {/* Artwork mosaic */}
                  <View style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
                    {item.artwork_urls[0] ? (
                      <Image source={{ uri: item.artwork_urls[0] }} style={{ width: 56, height: 56 }} contentFit="cover" />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 20 }}>🎵</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{item.name}</Text>
                    <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{item.item_count} episode{item.item_count !== 1 ? 's' : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => Alert.alert('Delete Playlist', `Delete "${item.name}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: () => deletePlaylist.mutate(item.id) },
                  ])}>
                    <Text style={{ color: '#555', fontSize: 14 }}>···</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      )}

      {/* Followed Shows */}
      {activeTab === 'shows' && (
        showsLoading ? <ActivityIndicator color="#E53935" style={{ marginTop: 40 }} /> :
        followedShows.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>🎙</Text>
            <Text style={{ color: '#888', fontSize: 15 }}>No followed shows yet</Text>
          </View>
        ) : (
          <FlatList
            data={followedShows}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 120 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => navigation.navigate('ShowDetail', { showId: item.id })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
                <View style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
                  {item.artwork_url ? <Image source={{ uri: item.artwork_url }} style={{ width: 56, height: 56 }} contentFit="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20 }}>🎙</Text></View>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
                  <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{item.publisher} · {item.episode_count} eps</Text>
                </View>
                <Text style={{ color: '#555', fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            )}
          />
        )
      )}

      {/* Saved Stories */}
      {activeTab === 'stories' && (
        storiesLoading ? <ActivityIndicator color="#E53935" style={{ marginTop: 40 }} /> :
        savedStories.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>📈</Text>
            <Text style={{ color: '#888', fontSize: 15 }}>No saved takes yet</Text>
          </View>
        ) : (
          <FlatList
            data={savedStories}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingBottom: 120 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => navigation.navigate('StoryDetail', { storyId: item.id })}
                style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 20 }} numberOfLines={2}>{item.headline}</Text>
                <Text style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
                  {[item.story_type?.replace(/_/g, ' '), formatRelativeDate(item.savedAt)].filter(Boolean).join(' · ')}
                </Text>
              </TouchableOpacity>
            )}
          />
        )
      )}
    </View>
  );
}
