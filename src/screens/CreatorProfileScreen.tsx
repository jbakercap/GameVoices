import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { usePersonProfile, CreatorEpisode, PersonProfileData } from '../hooks/queries/usePersonProfile';
import { useFollowShow } from '../hooks/mutations/useFollowShow';
import { useAuth } from '../contexts/AuthContext';
import { EpisodeFeedPost, CommentsSheet, FeedEpisode } from '../components/EpisodeFeedPost';
import { formatDurationHuman } from '../lib/formatters';

// ─── Types ────────────────────────────────────────────────────────────────────

type SortOption = 'newest' | 'oldest' | 'most_commented' | 'most_played';
type TabOption = 'episodes' | 'stats';

// ─── Stats Tab ────────────────────────────────────────────────────────────────

function StatsTab({ profile }: { profile: PersonProfileData }) {
  const topByPlays = [...profile.episodes]
    .sort((a, b) => b.play_count - a.play_count)
    .slice(0, 5);

  const topByComments = [...profile.episodes]
    .sort((a, b) => b.comment_count - a.comment_count)
    .slice(0, 5);

  const StatCard = ({ label, value }: { label: string; value: string | number }) => (
    <View style={{ flex: 1, backgroundColor: '#1A1A1A', borderRadius: 12, padding: 16, alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: '#555', fontSize: 12, marginTop: 4, textAlign: 'center' }}>{label}</Text>
    </View>
  );

  const EpisodeStatRow = ({ ep, metric, value }: { ep: CreatorEpisode; metric: string; value: number }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
      <View style={{ width: 36, height: 36, borderRadius: 6, overflow: 'hidden', backgroundColor: '#2A2A2A', flexShrink: 0 }}>
        {(ep.artwork_url || ep.show_artwork_url) ? (
          <Image source={{ uri: ep.artwork_url || ep.show_artwork_url! }} style={{ width: 36, height: 36 }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="mic" size={14} color="#555" />
          </View>
        )}
      </View>
      <Text style={{ color: '#fff', fontSize: 13, flex: 1 }} numberOfLines={1}>{ep.title}</Text>
      <Text style={{ color: '#888', fontSize: 13, fontWeight: '700' }}>{value.toLocaleString()}</Text>
    </View>
  );

  return (
    <View style={{ padding: 16 }}>
      {/* Summary cards */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
        <StatCard label="Total Plays" value={profile.total_plays.toLocaleString()} />
        <StatCard label="Total Comments" value={profile.total_comments.toLocaleString()} />
        <StatCard label="Followers" value={profile.follower_count.toLocaleString()} />
      </View>

      {/* Top by plays */}
      {topByPlays.length > 0 && (
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: '#888', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
            Top Episodes by Plays
          </Text>
          {topByPlays.map(ep => (
            <EpisodeStatRow key={ep.id} ep={ep} metric="plays" value={ep.play_count} />
          ))}
        </View>
      )}

      {/* Top by comments */}
      {topByComments.length > 0 && (
        <View>
          <Text style={{ color: '#888', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
            Top Episodes by Comments
          </Text>
          {topByComments.map(ep => (
            <EpisodeStatRow key={ep.id} ep={ep} metric="comments" value={ep.comment_count} />
          ))}
        </View>
      )}
    </View>
  );
}

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
  const [activeTab, setActiveTab] = useState<TabOption>('episodes');
  const [commentsEpisode, setCommentsEpisode] = useState<FeedEpisode | null>(null);
  const [commentsColor, setCommentsColor] = useState('#333');
  const [refreshing, setRefreshing] = useState(false);

  const teamColor = profile?.team_color || '#333';
  const isClaimedOwner = !!user && profile?.claimed_by_user_id === user.id && profile?.claim_status === 'approved';

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
          profile.claimed_by_user_id ? (
            <TouchableOpacity
              onPress={() => navigation.navigate('PublicProfile', { userId: profile.claimed_by_user_id })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}
            >
              <Text style={{ color: '#666', fontSize: 15, textAlign: 'center' }}>
                {profile.host_name}{profile.host_credentials ? ` · ${profile.host_credentials}` : ''}
              </Text>
              {profile.claim_status === 'approved' && (
                <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
              )}
            </TouchableOpacity>
          ) : (
            <Text style={{ color: '#666', fontSize: 15, marginTop: 4, textAlign: 'center' }}>
              {profile.host_name}{profile.host_credentials ? ` · ${profile.host_credentials}` : ''}
            </Text>
          )
        )}

        {profile.claim_status === 'approved' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, backgroundColor: '#1A2A1A', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }}>
            <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
            <Text style={{ color: '#4CAF50', fontSize: 12, fontWeight: '700' }}>Verified on GameVoices</Text>
          </View>
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

      {/* Claim CTA — shown when show is not yet approved */}
      {profile.claim_status !== 'approved' && (
        <TouchableOpacity
          onPress={() => navigation.navigate('Tabs', { screen: 'Creator', params: { preselectedShowId: showId } })}
          style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginHorizontal: 16, marginBottom: 16, paddingVertical: 12, paddingHorizontal: 16,
            backgroundColor: '#1A1A1A', borderRadius: 12,
            borderWidth: 1, borderColor: '#2A2A2A',
          }}
        >
          <Ionicons name="mic-outline" size={16} color="#888" />
          <Text style={{ color: '#888', fontSize: 14 }}>
            Is this your podcast?{' '}
            <Text style={{ color: '#fff', fontWeight: '700' }}>Claim it.</Text>
          </Text>
        </TouchableOpacity>
      )}

      {/* Tab switcher — only shown to the claimed owner */}
      {isClaimedOwner ? (
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: '#1A1A1A' }}>
          {(['episodes', 'stats'] as TabOption[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1, paddingVertical: 13, alignItems: 'center',
                borderBottomWidth: 2,
                borderBottomColor: activeTab === tab ? '#fff' : 'transparent',
              }}
            >
              <Text style={{ color: activeTab === tab ? '#fff' : '#555', fontSize: 14, fontWeight: '600', textTransform: 'capitalize' }}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <View style={{ borderTopWidth: 1, borderColor: '#1A1A1A' }} />
      )}

      {activeTab === 'episodes' && isClaimedOwner && (
        <FilterBar active={sort} onChange={setSort} />
      )}
      {!isClaimedOwner && (
        <FilterBar active={sort} onChange={setSort} />
      )}

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
        data={activeTab === 'stats' && isClaimedOwner ? [] : sortedEpisodes}
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
          activeTab === 'stats' && isClaimedOwner ? (
            <StatsTab profile={profile} />
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 60 }}>
              <Ionicons name="mic-outline" size={36} color="#333" style={{ marginBottom: 12 }} />
              <Text style={{ color: '#555', fontSize: 15 }}>No episodes yet</Text>
            </View>
          )
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
