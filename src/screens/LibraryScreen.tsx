import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, FlatList,
  ActivityIndicator, Alert, Modal, TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useFollowedShows, useSavedEpisodes } from '../hooks/queries/useUserLibrary';
import { useQueue } from '../hooks/queries/useQueue';
import { useGroupedListenHistory } from '../hooks/queries/useListenHistory';
import { usePlaylists } from '../hooks/queries/usePlaylists';
import { useSavedStories } from '../hooks/queries/useSavedStories';
import { useBookmarks, Bookmark } from '../hooks/queries/useBookmarks';
import { useRemoveFromQueue, useClearQueue } from '../hooks/mutations/useRemoveFromQueue';
import { useClearHistory } from '../hooks/mutations/useClearHistory';
import { useCreatePlaylist } from '../hooks/mutations/useCreatePlaylist';
import { useDeletePlaylist } from '../hooks/mutations/useDeletePlaylist';
import { useDeletePearl } from '../hooks/mutations/useDeletePearl';
import { useUpdatePearl } from '../hooks/mutations/useUpdatePearl';
import { usePlayer } from '../contexts/PlayerContext';
import { useAuth } from '../contexts/AuthContext';
import { formatDurationHuman, formatRelativeDate } from '../lib/formatters';

type LibraryTab = 'saved' | 'queue' | 'history' | 'playlists' | 'shows' | 'stories' | 'moments';

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ─── Shared components ────────────────────────────────────────────────────────

function Artwork({ uri, size = 52 }: { uri?: string | null; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: 8,
      overflow: 'hidden', backgroundColor: '#1e1e1e',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {uri
        ? <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" accessible={false} />
        : <Ionicons name="mic-outline" size={size * 0.4} color="#444" />}
    </View>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
      <Ionicons name={icon as any} size={44} color="#333" />
      <Text style={{ color: '#555', fontSize: 15 }}>{message}</Text>
    </View>
  );
}

function GroupHeader({ title }: { title: string }) {
  return (
    <Text style={{ color: '#555', fontSize: 11, fontWeight: '700',
      textTransform: 'uppercase', letterSpacing: 1,
      paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
      {title}
    </Text>
  );
}

function Row({ artwork, title, subtitle, onPress, right }: {
  artwork?: string | null;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <TouchableOpacity onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 20, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
      <Artwork uri={artwork} size={52} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 19 }}
          numberOfLines={2}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: '#555', fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={16} color="#333" />}
    </TouchableOpacity>
  );
}

// ─── Episode row (with play state) ───────────────────────────────────────────

function EpisodeRow({ episode, showTitle, artwork, onPress, right }: {
  episode: any; showTitle?: string; artwork?: string | null;
  onPress?: () => void; right?: React.ReactNode;
}) {
  const { currentEpisode, isPlaying } = usePlayer();
  const isCurrent = currentEpisode?.id === episode.id;
  const subtitle = [showTitle, episode.duration_seconds
    ? formatDurationHuman(episode.duration_seconds) : null].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 20, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
      <View style={{ position: 'relative' }}>
        <Artwork uri={artwork} size={52} />
        {isCurrent && (
          <View style={{ position: 'absolute', inset: 0, borderRadius: 8,
            backgroundColor: 'rgba(0,0,0,0.5)',
            alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={18} color="#fff" />
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: isCurrent ? '#fff' : '#fff', fontSize: 14,
          fontWeight: '600', lineHeight: 19 }} numberOfLines={2}>
          {episode.title}
        </Text>
        {subtitle ? (
          <Text style={{ color: '#555', fontSize: 12, marginTop: 3 }} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? null}
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function LibraryScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<LibraryTab>(route.params?.initialTab || 'shows');
  const [createPlaylistOpen, setCreatePlaylistOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [editMomentModal, setEditMomentModal] = useState<{ pearl: Bookmark; note: string } | null>(null);

  const { data: savedEpisodes = [], isLoading: savedLoading } = useSavedEpisodes();
  const { data: queue = [], isLoading: queueLoading } = useQueue();
  const { data: historyGroups, isLoading: historyLoading } = useGroupedListenHistory();
  const { data: playlists = [], isLoading: playlistsLoading } = usePlaylists();
  const { data: followedShows = [], isLoading: showsLoading } = useFollowedShows();
  const { data: savedStories = [], isLoading: storiesLoading } = useSavedStories();
  const { data: bookmarks = [], isLoading: bookmarksLoading } = useBookmarks();

  const removeFromQueue = useRemoveFromQueue();
  const clearQueue = useClearQueue();
  const clearHistory = useClearHistory();
  const createPlaylist = useCreatePlaylist();
  const deletePlaylist = useDeletePlaylist();
  const deletePearl = useDeletePearl();
  const updatePearl = useUpdatePearl();

  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();

  const handlePlayEpisode = (ep: any, showTitle: string, artwork: string | null) => {
    if (currentEpisode?.id === ep.id) togglePlayPause();
    else playEpisode({ id: ep.id, title: ep.title, showTitle, artworkUrl: artwork || undefined, audioUrl: ep.audio_url, durationSeconds: ep.duration_seconds });
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Ionicons name="library-outline" size={48} color="#333" />
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginTop: 16, marginBottom: 8 }}>My Library</Text>
        <Text style={{ color: '#555', fontSize: 14, textAlign: 'center' }}>Sign in to access your saved episodes, queue, and playlists</Text>
      </View>
    );
  }

  const tabs: { key: LibraryTab; label: string; count?: number }[] = [
    { key: 'shows',    label: 'Shows',    count: followedShows.length },
    { key: 'saved',    label: 'Saved',    count: savedEpisodes.length },
    { key: 'history',  label: 'History' },
    { key: 'queue',    label: 'Up Next',  count: queue.length },
    { key: 'playlists',label: 'Playlists',count: playlists.length },
    { key: 'stories',  label: 'Takes',    count: savedStories.length },
    { key: 'moments',  label: 'Moments',  count: bookmarks.length },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>

      {/* Header */}
      <View style={{ paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
        flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ marginRight: 12 }}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>My Library</Text>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 12, alignItems: 'center' }}>
        {tabs.map(tab => {
          const active = activeTab === tab.key;
          return (
            <TouchableOpacity key={tab.key} onPress={() => setActiveTab(tab.key)}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                backgroundColor: active ? '#fff' : '#1e1e1e',
                borderWidth: 1, borderColor: active ? '#fff' : '#2a2a2a' }}>
              <Text style={{ color: active ? '#000' : '#888', fontSize: 13, fontWeight: '600' }}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={{ height: 1, backgroundColor: '#1a1a1a' }} />

      <View style={{ flex: 1 }}>

      {/* ── Shows ── */}
      {activeTab === 'shows' && (
        showsLoading ? <ActivityIndicator color="#fff" style={{ marginTop: 40 }} /> :
        followedShows.length === 0
          ? <EmptyState icon="headset-outline" message="No followed shows yet" />
          : <FlatList style={{ flex: 1 }} data={followedShows} keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 120 }}
              renderItem={({ item }) => (
                <Row
                  artwork={item.artwork_url}
                  title={item.title}
                  subtitle={[item.publisher, item.episode_count ? `${item.episode_count} eps` : null].filter(Boolean).join(' · ')}
                  onPress={() => navigation.navigate('ShowDetail', { showId: item.id })}
                />
              )}
            />
      )}

      {/* ── Saved Episodes ── */}
      {activeTab === 'saved' && (
        savedLoading ? <ActivityIndicator color="#fff" style={{ marginTop: 40 }} /> :
        savedEpisodes.length === 0
          ? <EmptyState icon="bookmark-outline" message="No saved episodes yet" />
          : <FlatList style={{ flex: 1 }} data={savedEpisodes} keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 120 }}
              renderItem={({ item }) => (
                <EpisodeRow
                  episode={item}
                  showTitle={item.shows?.title}
                  artwork={item.artwork_url || item.shows?.artwork_url}
                  onPress={() => handlePlayEpisode(item, item.shows?.title || '', item.artwork_url || item.shows?.artwork_url || null)}
                />
              )}
            />
      )}

      {/* ── History ── */}
      {activeTab === 'history' && (
        historyLoading ? <ActivityIndicator color="#fff" style={{ marginTop: 40 }} /> :
        !historyGroups || Object.keys(historyGroups).length === 0
          ? <EmptyState icon="time-outline" message="No listening history yet" />
          : <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
              <TouchableOpacity onPress={() => Alert.alert('Clear History', 'Clear all listening history?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => clearHistory.mutate() },
              ])} style={{ alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 10 }}>
                <Text style={{ color: '#555', fontSize: 13 }}>Clear all</Text>
              </TouchableOpacity>
              {Object.entries(historyGroups).map(([group, items]) => (
                <View key={group}>
                  <GroupHeader title={group} />
                  {(items as any[]).map((item: any) => {
                    const ep = item.episodes;
                    if (!ep) return null;
                    const artwork = ep.artwork_url || ep.shows?.artwork_url;
                    return (
                      <EpisodeRow key={item.id} episode={ep} showTitle={ep.shows?.title}
                        artwork={artwork}
                        onPress={() => handlePlayEpisode(ep, ep.shows?.title || '', artwork || null)} />
                    );
                  })}
                </View>
              ))}
            </ScrollView>
      )}

      {/* ── Queue ── */}
      {activeTab === 'queue' && (
        queueLoading ? <ActivityIndicator color="#fff" style={{ marginTop: 40 }} /> :
        queue.length === 0
          ? <EmptyState icon="list-outline" message="Your queue is empty" />
          : <FlatList style={{ flex: 1 }} data={queue} keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 120 }}
              ListHeaderComponent={
                <TouchableOpacity onPress={() => Alert.alert('Clear Queue', 'Remove all episodes?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Clear', style: 'destructive', onPress: () => clearQueue.mutate() },
                ])} style={{ alignSelf: 'flex-end', paddingHorizontal: 20, paddingVertical: 10 }}>
                  <Text style={{ color: '#555', fontSize: 13 }}>Clear all</Text>
                </TouchableOpacity>
              }
              renderItem={({ item }) => {
                const ep = item.episodes;
                if (!ep) return null;
                const artwork = ep.artwork_url || ep.shows?.artwork_url;
                return (
                  <EpisodeRow episode={ep} showTitle={ep.shows?.title} artwork={artwork}
                    onPress={() => handlePlayEpisode(ep, ep.shows?.title || '', artwork || null)}
                    right={
                      <TouchableOpacity onPress={() => removeFromQueue.mutate(ep.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons name="close" size={18} color="#555" />
                      </TouchableOpacity>
                    }
                  />
                );
              }}
            />
      )}

      {/* ── Playlists ── */}
      {activeTab === 'playlists' && (
        playlistsLoading ? <ActivityIndicator color="#fff" style={{ marginTop: 40 }} /> :
        <FlatList
          style={{ flex: 1 }}
          data={playlists}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListEmptyComponent={<EmptyState icon="musical-notes-outline" message="No playlists yet" />}
          ListHeaderComponent={
            <TouchableOpacity
              onPress={() => setCreatePlaylistOpen(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                paddingHorizontal: 20, paddingVertical: 16,
                borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
              <View style={{ width: 36, height: 36, borderRadius: 8,
                backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#2a2a2a',
                alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="add" size={20} color="#fff" />
              </View>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>New Playlist</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => (
            <Row
              artwork={item.artwork_urls?.[0]}
              title={item.name}
              subtitle={`${item.item_count} episode${item.item_count !== 1 ? 's' : ''}`}
              onPress={() => navigation.navigate('PlaylistDetail', { playlistId: item.id })}
              right={
                <TouchableOpacity onPress={() => Alert.alert('Delete Playlist', `Delete "${item.name}"?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => deletePlaylist.mutate(item.id) },
                ])} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="ellipsis-horizontal" size={18} color="#555" />
                </TouchableOpacity>
              }
            />
          )}
        />
      )}

      {/* ── Saved Takes ── */}
      {activeTab === 'stories' && (
        storiesLoading ? <ActivityIndicator color="#fff" style={{ marginTop: 40 }} /> :
        savedStories.length === 0
          ? <EmptyState icon="heart-outline" message="No saved takes yet" />
          : <FlatList style={{ flex: 1 }} data={savedStories} keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 120 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => navigation.navigate('StoryDetail', { storyId: item.id })}
                  style={{ paddingHorizontal: 20, paddingVertical: 14,
                    borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 20 }}
                    numberOfLines={2}>{item.headline}</Text>
                  <Text style={{ color: '#555', fontSize: 12, marginTop: 4 }}>
                    {[item.story_type?.replace(/_/g, ' '), formatRelativeDate(item.savedAt)].filter(Boolean).join(' · ')}
                  </Text>
                </TouchableOpacity>
              )}
            />
      )}

      {/* ── Saved Moments ── */}
      {activeTab === 'moments' && (
        bookmarksLoading ? <ActivityIndicator color="#fff" style={{ marginTop: 40 }} /> :
        bookmarks.length === 0
          ? <EmptyState icon="sparkles-outline" message="No saved moments yet" />
          : <FlatList style={{ flex: 1 }} data={bookmarks} keyExtractor={item => item.id}
              contentContainerStyle={{ paddingBottom: 120 }}
              renderItem={({ item }) => {
                const episode = item.episodes;
                const show = episode?.shows;
                const artwork = episode?.artwork_url || show?.artwork_url;
                return (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
                    paddingHorizontal: 20, paddingVertical: 12,
                    borderBottomWidth: 1, borderBottomColor: '#1a1a1a' }}>
                    <TouchableOpacity onPress={() => {
                      if (!episode) return;
                      playEpisode({ id: episode.id, title: episode.title,
                        showTitle: show?.title || '', showId: episode.show_id,
                        artworkUrl: artwork || undefined, audioUrl: episode.audio_url,
                        startTime: item.timestamp_seconds });
                    }}>
                      <Artwork uri={artwork} size={52} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 19 }}
                        numberOfLines={2}>{item.note || episode?.title || 'Saved moment'}</Text>
                      <Text style={{ color: '#555', fontSize: 12, marginTop: 3 }}>
                        {[show?.title, formatTime(item.timestamp_seconds)].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => Alert.alert('Saved Moment', item.note ? `"${item.note}"` : 'No note', [
                        { text: 'Edit Note', onPress: () => setEditMomentModal({ pearl: item, note: item.note || '' }) },
                        { text: 'Delete', style: 'destructive', onPress: () => Alert.alert('Delete?', 'Remove this moment?', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Delete', style: 'destructive', onPress: () => deletePearl.mutate(item.id) },
                        ])},
                        { text: 'Cancel', style: 'cancel' },
                      ])}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="ellipsis-horizontal" size={18} color="#555" />
                    </TouchableOpacity>
                  </View>
                );
              }}
            />
      )}

      </View>{/* end flex:1 content */}

      {/* ── Create playlist modal ── */}
      <Modal visible={createPlaylistOpen} transparent animationType="slide"
        onRequestClose={() => setCreatePlaylistOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <View style={{ backgroundColor: '#1a1a1a', borderTopLeftRadius: 20,
            borderTopRightRadius: 20, padding: 24, paddingBottom: 40 }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 16 }}>
              New Playlist
            </Text>
            <TextInput
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
              placeholder="Playlist name"
              placeholderTextColor="#555"
              autoFocus
              style={{ backgroundColor: '#2a2a2a', color: '#fff', borderRadius: 10,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 16,
                borderWidth: 1, borderColor: '#333' }}
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => { setCreatePlaylistOpen(false); setNewPlaylistName(''); }}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12,
                  backgroundColor: '#2a2a2a', alignItems: 'center' }}>
                <Text style={{ color: '#888', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (newPlaylistName.trim()) {
                    createPlaylist.mutate({ name: newPlaylistName.trim() });
                    setCreatePlaylistOpen(false);
                    setNewPlaylistName('');
                  }
                }}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12,
                  backgroundColor: '#fff', alignItems: 'center' }}>
                <Text style={{ color: '#000', fontSize: 15, fontWeight: '600' }}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Edit moment note modal ── */}
      <Modal visible={!!editMomentModal} transparent animationType="slide"
        onRequestClose={() => setEditMomentModal(null)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <View style={{ backgroundColor: '#1a1a1a', borderTopLeftRadius: 20,
            borderTopRightRadius: 20, padding: 24, paddingBottom: 40 }}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginBottom: 16 }}>
              Edit Note
            </Text>
            <TextInput
              value={editMomentModal?.note || ''}
              onChangeText={text => setEditMomentModal(prev => prev ? { ...prev, note: text } : null)}
              placeholder="Add a note…"
              placeholderTextColor="#555"
              style={{ backgroundColor: '#2a2a2a', color: '#fff', borderRadius: 10,
                paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 16,
                borderWidth: 1, borderColor: '#333' }}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity onPress={() => setEditMomentModal(null)}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12,
                  backgroundColor: '#2a2a2a', alignItems: 'center' }}>
                <Text style={{ color: '#888', fontSize: 15, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (!editMomentModal) return;
                  updatePearl.mutate({ pearlId: editMomentModal.pearl.id, note: editMomentModal.note.trim() || null });
                  setEditMomentModal(null);
                }}
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12,
                  backgroundColor: '#fff', alignItems: 'center' }}>
                <Text style={{ color: '#000', fontSize: 15, fontWeight: '600' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}
