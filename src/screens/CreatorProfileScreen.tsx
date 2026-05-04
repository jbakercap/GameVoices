import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { usePersonProfile, CreatorEpisode } from '../hooks/queries/usePersonProfile';
import { useFollowShow } from '../hooks/mutations/useFollowShow';
import { useAuth } from '../contexts/AuthContext';
import { EpisodeFeedPost, CommentsSheet, FeedEpisode } from '../components/EpisodeFeedPost';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortOption = 'newest' | 'oldest' | 'most_commented' | 'most_played';

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ value, label }: { value: number; label: string }) {
  const formatted = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value);
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>{formatted}</Text>
      <Text style={{ color: '#555', fontSize: 12, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

const FILTERS: { key: SortOption; label: string }[] = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'most_commented', label: 'Most Commented' },
  { key: 'most_played', label: 'Most Played' },
];

function FilterBar({ active, onChange }: { active: SortOption; onChange: (s: SortOption) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
    >
      {FILTERS.map(f => (
        <TouchableOpacity
          key={f.key}
          onPress={() => onChange(f.key)}
          style={{
            paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
            backgroundColor: active === f.key ? '#fff' : '#1E1E1E',
            borderWidth: 1, borderColor: active === f.key ? '#fff' : '#2A2A2A',
          }}
        >
          <Text style={{ color: active === f.key ? '#000' : '#888', fontSize: 13, fontWeight: '600' }}>
            {f.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CreatorProfileScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { showId } = route.params;
  const { user } = useAuth();

  const { data: profile, isLoading, refetch } = usePersonProfile(showId);
  const followShow = useFollowShow();

  const [sort, setSort] = useState<SortOption>('newest');
  const [commentsEpisode, setCommentsEpisode] = useState<FeedEpisode | null>(null);
  const [commentsColor, setCommentsColor] = useState('#333');
  const [refreshing, setRefreshing] = useState(false);

  const teamColor = profile?.team_color || '#333';

  const sortedEpisodes = useMemo((): CreatorEpisode[] => {
    if (!profile) return [];
    const eps = [...profile.episodes];
    if (sort === 'newest') return eps.sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
    if (sort === 'oldest') return eps.sort((a, b) => (a.published_at || '').localeCompare(b.published_at || ''));
    if (sort === 'most_commented') return eps.sort((a, b) => b.comment_count - a.comment_count);
    if (sort === 'most_played') return eps.sort((a, b) => b.play_count - a.play_count);
    return eps;
  }, [profile, sort]);

  const handleFollow = useCallback(() => {
    if (!user) {
      Alert.alert('Sign in', 'Sign in to follow shows');
      return;
    }
    followShow.mutate({ showId, isFollowing: profile?.is_following ?? false });
  }, [user, showId, profile?.is_following, followShow]);

  const handleOpenComments = useCallback((episode: FeedEpisode, color: string) => {
    setCommentsEpisode(episode);
    setCommentsColor(color);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', padding: 16 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: '#888', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: '#888', marginTop: 24 }}>Show not found.</Text>
      </View>
    );
  }

  const ListHeader = (
    <View>
      {/* Hero */}
      <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 24, paddingBottom: 20 }}>
        <View style={{
          width: 120, height: 120, borderRadius: 16, overflow: 'hidden',
          backgroundColor: '#2A2A2A', marginBottom: 16,
          shadowColor: teamColor, shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 4 },
        }}>
          {profile.show_artwork_url ? (
            <Image source={{ uri: profile.show_artwork_url }} style={{ width: 120, height: 120 }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="mic" size={48} color="#444" />
            </View>
          )}
        </View>

        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center', lineHeight: 28 }}>
          {profile.show_title}
        </Text>

        {profile.host_name && (
          <Text style={{ color: '#666', fontSize: 15, marginTop: 4, textAlign: 'center' }}>
            {profile.host_name}
            {profile.host_credentials ? ` · ${profile.host_credentials}` : ''}
          </Text>
        )}
      </View>

      {/* Stats bar */}
      <View style={{
        flexDirection: 'row', paddingHorizontal: 24, paddingVertical: 16,
        borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1A1A1A',
      }}>
        <StatPill value={profile.total_plays} label="Plays" />
        <View style={{ width: 1, backgroundColor: '#1A1A1A' }} />
        <StatPill value={profile.total_comments} label="Comments" />
        <View style={{ width: 1, backgroundColor: '#1A1A1A' }} />
        <StatPill value={profile.follower_count} label="Followers" />
      </View>

      {/* Follow button */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
        <TouchableOpacity
          onPress={handleFollow}
          disabled={followShow.isPending}
          style={{
            paddingVertical: 13, borderRadius: 12, alignItems: 'center',
            backgroundColor: profile.is_following ? '#1E1E1E' : '#fff',
            borderWidth: profile.is_following ? 1 : 0, borderColor: '#2A2A2A',
          }}
        >
          <Text style={{ color: profile.is_following ? '#aaa' : '#000', fontWeight: '700', fontSize: 15 }}>
            {profile.is_following ? '✓ Following' : '+ Follow'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Filter bar */}
      <View style={{ borderTopWidth: 1, borderColor: '#1A1A1A' }}>
        <FilterBar active={sort} onChange={setSort} />
      </View>

      <View style={{ height: 1, backgroundColor: '#1A1A1A' }} />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 4 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: '#888', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={sortedEpisodes}
        keyExtractor={ep => ep.id}
        ListHeaderComponent={ListHeader}
        renderItem={({ item }) => (
          <EpisodeFeedPost
            episode={item}
            teamColor={teamColor}
            onOpenComments={handleOpenComments}
            onNavigate={(screen, params) => navigation.navigate(screen, params)}
          />
        )}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Ionicons name="mic-outline" size={36} color="#333" style={{ marginBottom: 12 }} />
            <Text style={{ color: '#555', fontSize: 15 }}>No episodes yet</Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      />

      <CommentsSheet
        episode={commentsEpisode}
        teamColor={commentsColor}
        visible={!!commentsEpisode}
        onClose={() => setCommentsEpisode(null)}
      />
    </View>
  );
}
