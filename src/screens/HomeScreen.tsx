import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal, ScrollView,
  ActivityIndicator, Dimensions, RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../contexts/PlayerContext';
import { useUserTeams } from '../hooks/useUserTeams';
import { useTeamsBySlug } from '../hooks/useTeamsBySlug';
import { useRecentTeamEpisodes } from '../hooks/useRecentTeamEpisodes';
import { TeamPickerModal } from '../components/TeamPickerModal';
import { useProfile } from '../hooks/useProfile';
import { useAuth } from '../contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { CompactScoreboard } from '../components/CompactScoreboard';
import { EpisodeFeedPost, FeedEpisode, timeAgo } from '../components/EpisodeFeedPost';
import { useNotifications, useUnreadNotificationCount, AppNotification } from '../hooks/queries/useNotifications';
import { useMarkNotificationsRead } from '../hooks/mutations/useMarkNotificationsRead';
import { useListenHistory } from '../hooks/queries/useListenHistory';
import { useEpisodesPlayback } from '../hooks/queries/useEpisodesPlayback';
import { useFollowedShows } from '../hooks/queries/useUserLibrary';
import { useMyClaims } from '../hooks/mutations/usePodcastClaim';
import { useRelatedEpisodes, RelatedEpisode } from '../hooks/queries/useRelatedEpisodes';
import FriendActivityFeed from '../components/FriendActivityFeed';

// ─── Notifications Sheet ──────────────────────────────────────────────────────

function notificationText(n: AppNotification): string {
  const actor = n.actor?.display_name || 'Someone';
  if (n.type === 'comment_reply') return `${actor} replied to your comment`;
  if (n.type === 'comment_like') return `${actor} liked your comment`;
  return `${actor} interacted with your content`;
}

interface NotificationsSheetProps {
  visible: boolean;
  onClose: () => void;
  onNavigate?: (screen: string, params: any) => void;
}

function NotificationsSheet({ visible, onClose, onNavigate }: NotificationsSheetProps) {
  const { data: notifications = [], isLoading } = useNotifications();
  const { data: myClaims = [] } = useMyClaims();
  const hasApprovedClaim = (myClaims as any[]).some((c) => c.status === 'approved');
  const SHEET_HEIGHT = Dimensions.get('window').height * 0.75;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}
      presentationStyle="overFullScreen" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <TouchableOpacity
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          activeOpacity={1} onPress={onClose}
        />
        <View style={{
          backgroundColor: '#121212',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          height: SHEET_HEIGHT,
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#444',
            alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700',
            paddingHorizontal: 20, marginBottom: 12 }}>
            Notifications
          </Text>
          <View style={{ height: 1, backgroundColor: '#1A1A1A' }} />

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
            {/* Creator CTA — shown until user has an approved claim */}
            {!hasApprovedClaim && (
              <TouchableOpacity
                onPress={() => { onClose(); setTimeout(() => onNavigate?.('Tabs', { screen: 'Creator' }), 300); }}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingHorizontal: 20, paddingVertical: 16,
                  borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E1E1E', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ionicons name="mic-outline" size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>Are you a podcast creator?</Text>
                  <Text style={{ color: '#555', fontSize: 12, marginTop: 2 }}>Claim your show on GameVoices to unlock analytics and a verified badge.</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#444" />
              </TouchableOpacity>
            )}
            {isLoading ? (
              <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
            ) : notifications.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                <Ionicons name="notifications-outline" size={40} color="#333" style={{ marginBottom: 12 }} />
                <Text style={{ color: '#555', fontSize: 15 }}>No notifications yet</Text>
              </View>
            ) : (
              notifications.map((n) => {
                const avatarSize = 40;
                const initial = (n.actor?.display_name || 'U').charAt(0).toUpperCase();
                return (
                  <TouchableOpacity
                    key={n.id}
                    onPress={() => {
                      if (n.episode_id) { onClose(); onNavigate?.('EpisodeDetail', { episodeId: n.episode_id }); }
                    }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 12,
                      paddingHorizontal: 20, paddingVertical: 14,
                      borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
                      backgroundColor: n.read ? 'transparent' : 'rgba(255,255,255,0.03)',
                    }}
                  >
                    <View style={{
                      width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2,
                      backgroundColor: '#2A2A2A', overflow: 'hidden',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      {n.actor?.avatar_url ? (
                        <Image source={{ uri: n.actor.avatar_url }} style={{ width: avatarSize, height: avatarSize }} contentFit="cover" />
                      ) : (
                        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }}>{initial}</Text>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontSize: 14, lineHeight: 20 }}>{notificationText(n)}</Text>
                      {n.episode_title && (
                        <Text style={{ color: '#555', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{n.episode_title}</Text>
                      )}
                      <Text style={{ color: '#444', fontSize: 11, marginTop: 3 }}>{timeAgo(n.created_at)}</Text>
                    </View>
                    {!n.read && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff', flexShrink: 0 }} />
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Recently Played Shelf ────────────────────────────────────────────────────

function RecentlyPlayedShelf({ onNavigate }: { onNavigate?: (screen: string, params: any) => void }) {
  const { data: history = [] } = useListenHistory({ limit: 10 });
  const { playEpisode } = usePlayer();

  // Deduplicate by episode ID, keeping the most recent listen (already sorted by listened_at DESC)
  const items = useMemo(() => {
    const seen = new Set<string>();
    return history.filter(h => {
      if (!h.episodes) return false;
      if (seen.has(h.episodes.id)) return false;
      seen.add(h.episodes.id);
      return true;
    });
  }, [history]);
  const episodeIds = items.map(h => h.episodes!.id);
  const { data: playbackMap = {} } = useEpisodesPlayback(episodeIds);

  if (items.length === 0) return null;

  return (
    <View style={{ paddingTop: 16, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', paddingHorizontal: 16, marginBottom: 12 }}>
        Recently Played
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 16 }}>
        {items.map((item) => {
          const ep = item.episodes!;
          const artwork = ep.artwork_url || ep.shows?.artwork_url;
          const playback = playbackMap[ep.id];
          const duration = ep.duration_seconds || 0;
          const position = playback?.position_seconds || 0;
          const isUnfinished = duration > 0 && position > 0 && !playback?.completed;
          const progressPct = isUnfinished ? Math.min(1, position / duration) : 0;

          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => playEpisode({
                id: ep.id,
                title: ep.title,
                showTitle: ep.shows?.title || '',
                artworkUrl: artwork || undefined,
                audioUrl: ep.audio_url,
                durationSeconds: ep.duration_seconds || undefined,
                startTime: position > 10 ? position : undefined,
              })}
              style={{ width: 140 }}
            >
              <View style={{ width: 140, height: 140, borderRadius: 12, overflow: 'hidden', backgroundColor: '#2A2A2A', marginBottom: 8 }}>
                {artwork ? (
                  <Image source={{ uri: artwork }} style={{ width: 140, height: 140 }} contentFit="cover" />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="mic" size={32} color="#555" />
                  </View>
                )}
                <View style={{
                  position: 'absolute', bottom: 8, right: 8,
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: 'rgba(0,0,0,0.65)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name="play" size={14} color="#fff" style={{ marginLeft: 2 }} />
                </View>
                {/* Progress bar overlay */}
                {isUnfinished && (
                  <View style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: 3, backgroundColor: 'rgba(255,255,255,0.2)',
                  }}>
                    <View style={{
                      height: 3, backgroundColor: '#fff',
                      width: `${progressPct * 100}%` as any,
                      borderRadius: 1.5,
                    }} />
                  </View>
                )}
              </View>
              <Text style={{ color: '#666', fontSize: 11, marginBottom: 2 }} numberOfLines={1}>
                {ep.shows?.title}
              </Text>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 17 }} numberOfLines={2}>
                {ep.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Followed Shows Shelf ─────────────────────────────────────────────────────

function FollowedShowsShelf({ onNavigate }: { onNavigate?: (screen: string, params: any) => void }) {
  const { data: shows = [] } = useFollowedShows();
  if (shows.length === 0) return null;

  return (
    <View style={{ paddingTop: 16, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', paddingHorizontal: 16, marginBottom: 12 }}>
        Following
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 14, paddingBottom: 16 }}>
        {shows.map((show) => (
          <TouchableOpacity
            key={show.id}
            onPress={() => onNavigate?.('ShowDetail', { showId: show.id })}
            style={{ width: 100, alignItems: 'center' }}
          >
            <View style={{ width: 90, height: 90, borderRadius: 12, overflow: 'hidden', backgroundColor: '#2A2A2A', marginBottom: 8 }}>
              {show.artwork_url ? (
                <Image source={{ uri: show.artwork_url }} style={{ width: 90, height: 90 }} contentFit="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="mic" size={28} color="#555" />
                </View>
              )}
            </View>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 16 }} numberOfLines={2}>
              {show.title}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Related Shows Shelf ──────────────────────────────────────────────────────

function RelatedShowsShelf({ episodes, onNavigate }: { episodes: RelatedEpisode[]; onNavigate?: (screen: string, params: any) => void }) {
  const { playEpisode } = usePlayer();

  if (episodes.length === 0) return null;

  return (
    <View style={{ paddingTop: 16, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', paddingHorizontal: 16, marginBottom: 12 }}>
        For You
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12, paddingBottom: 16 }}>
        {episodes.map((ep) => {
          const artwork = ep.artwork_url || ep.shows?.artwork_url;
          return (
            <TouchableOpacity
              key={ep.id}
              onPress={() => playEpisode({
                id: ep.id,
                title: ep.title,
                showTitle: ep.shows?.title || '',
                artworkUrl: artwork || undefined,
                audioUrl: ep.audio_url,
                durationSeconds: ep.duration_seconds || undefined,
                teamColor: ep.shows?.teams?.primary_color || undefined,
                showId: ep.show_id,
              })}
              style={{ width: 140 }}
            >
              <View style={{ width: 140, height: 140, borderRadius: 12, overflow: 'hidden', backgroundColor: '#2A2A2A', marginBottom: 8 }}>
                {artwork ? (
                  <Image source={{ uri: artwork }} style={{ width: 140, height: 140 }} contentFit="cover" />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="mic" size={32} color="#555" />
                  </View>
                )}
                <View style={{
                  position: 'absolute', bottom: 8, right: 8,
                  width: 32, height: 32, borderRadius: 16,
                  backgroundColor: 'rgba(0,0,0,0.65)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name="play" size={14} color="#fff" style={{ marginLeft: 2 }} />
                </View>
              </View>
              <Text style={{ color: '#666', fontSize: 11, marginBottom: 2 }} numberOfLines={1}>
                {ep.shows?.title}
              </Text>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 17 }} numberOfLines={2}>
                {ep.title}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function FeedEmpty({ hasTeams, onFollowTeams }: { hasTeams: boolean; onFollowTeams: () => void }) {
  if (!hasTeams) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32 }}>
        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#1E1E1E',
          alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          <Ionicons name="people-outline" size={36} color="#444" />
        </View>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 10 }}>
          Follow your teams
        </Text>
        <Text style={{ color: '#666', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
          Pick the teams you follow and we'll fill your feed with their best podcast content.
        </Text>
        <TouchableOpacity
          onPress={onFollowTeams}
          style={{ backgroundColor: '#fff', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24 }}>
          <Text style={{ color: '#000', fontSize: 15, fontWeight: '700' }}>Choose Teams</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={{ alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#1E1E1E',
        alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
        <Ionicons name="checkmark-circle-outline" size={36} color="#444" />
      </View>
      <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 10 }}>
        You're all caught up
      </Text>
      <Text style={{ color: '#666', fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
        No new episodes from your teams yet. Pull down to refresh.
      </Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HomeScreen({ onNavigate }: {
  onNavigate?: (screen: string, params: any) => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const teamSlugs = useMemo(() => profile?.topic_slugs || [], [profile]);

  const { data: teams } = useTeamsBySlug(teamSlugs);
  const { data: userTeams = [] } = useUserTeams();
  const { data: rawEpisodes = [], isLoading: feedLoading } = useRecentTeamEpisodes(teamSlugs);
  const { data: relatedEpisodes = [] } = useRelatedEpisodes(teamSlugs);

  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'following' | 'friends'>('following');

  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const markRead = useMarkNotificationsRead();

  const handleBellPress = useCallback(() => {
    setNotificationsOpen(true);
    markRead.mutate();
  }, []);

  // team slug → color / short name
  const teamColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const team of userTeams) { if (team.primary_color) map[team.slug] = team.primary_color; }
    return map;
  }, [userTeams]);

  const teamNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const team of userTeams) { if (team.short_name) map[team.slug] = team.short_name; }
    return map;
  }, [userTeams]);

  // Map RecentEpisode → FeedEpisode
  const episodes: FeedEpisode[] = useMemo(() =>
    rawEpisodes.map(ep => ({
      id: ep.id,
      title: ep.title,
      artwork_url: ep.artwork_url,
      show_artwork_url: ep.show_artwork_url,
      audio_url: ep.audio_url,
      duration_seconds: ep.duration_seconds,
      published_at: ep.published_at,
      show_id: ep.show_id,
      show_title: ep.show_title,
      team_slug: ep.team_slug,
    })),
  [rawEpisodes]);

  const handleSaveTeams = async (slugs: string[]) => {
    if (!user) return;
    await supabase.from('profiles').update({ topic_slugs: slugs }).eq('user_id', user.id);
    await queryClient.invalidateQueries({ queryKey: ['profile'] });
    setTeamPickerOpen(false);
  };

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'friends') {
      await queryClient.invalidateQueries({ queryKey: ['friend-activity'] });
    } else {
      await queryClient.invalidateQueries({ queryKey: ['recent-team-episodes'] });
      await queryClient.invalidateQueries({ queryKey: ['recent-games'] });
      await queryClient.invalidateQueries({ queryKey: ['listenHistory'] });
      await queryClient.invalidateQueries({ queryKey: ['episodesPlayback'] });
    }
    setRefreshing(false);
  }, [queryClient, activeTab]);

  type FeedItem = { type: 'episode'; data: FeedEpisode } | { type: 'followed-shows-shelf' } | { type: 'related-shows-shelf' };

  const feedItems = useMemo((): FeedItem[] => {
    const episodeItems: FeedItem[] = episodes.map(ep => ({ type: 'episode' as const, data: ep }));
    // Insert FollowedShowsShelf after 4th episode
    const followedPos = Math.min(4, episodeItems.length);
    episodeItems.splice(followedPos, 0, { type: 'followed-shows-shelf' as const });
    // Insert RelatedShowsShelf 4 episodes after FollowedShowsShelf
    const relatedPos = Math.min(followedPos + 5, episodeItems.length);
    episodeItems.splice(relatedPos, 0, { type: 'related-shows-shelf' as const });
    return episodeItems;
  }, [episodes]);

  const renderPost = useCallback(({ item }: { item: FeedItem }) => {
    if (item.type === 'followed-shows-shelf') {
      return <FollowedShowsShelf onNavigate={onNavigate} />;
    }
    if (item.type === 'related-shows-shelf') {
      return <RelatedShowsShelf episodes={relatedEpisodes} onNavigate={onNavigate} />;
    }
    const teamColor = teamColorMap[item.data.team_slug || ''] || '#1E2A3A';
    const teamShortName = teamNameMap[item.data.team_slug || ''];
    return (
      <EpisodeFeedPost
        episode={item.data}
        teamColor={teamColor}
        teamShortName={teamShortName}
        onOpenComments={() => {}}
        onNavigate={onNavigate}
      />
    );
  }, [teamColorMap, teamNameMap, onNavigate, relatedEpisodes]);

  const ListHeader = useMemo(() => (
    <>
      {/* ── Header row: hamburger + bell ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 56, paddingBottom: 8,
      }}>
        <TouchableOpacity
          onPress={() => setTeamPickerOpen(true)}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="menu" size={28} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleBellPress}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="notifications-outline" size={22} color="#fff" />
          {unreadCount > 0 && (
            <View style={{
              position: 'absolute', top: 4, right: 4,
              minWidth: 16, height: 16, borderRadius: 8,
              backgroundColor: '#e11d48',
              alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
            }}>
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Team circles row ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10, paddingBottom: 12 }}>
        {(teams || []).map((team) => (
          <TouchableOpacity
            key={team.id}
            onPress={() => onNavigate?.('TeamDetail', { teamSlug: team.slug })}
            style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff',
              overflow: 'hidden', borderWidth: 3, borderColor: team.primary_color || '#333',
              alignItems: 'center', justifyContent: 'center' }}
          >
            {team.logo_url ? (
              <Image source={{ uri: team.logo_url }} style={{ width: 36, height: 36 }} contentFit="contain" />
            ) : (
              <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 11 }}>
                {team.short_name?.slice(0, 3)}
              </Text>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={{ height: 1, backgroundColor: '#1A1A1A' }} />

      {/* ── Tab pills: Following / Friends ── */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
        {(['following', 'friends'] as const).map((tab) => {
          const isActive = activeTab === tab;
          return (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: isActive ? '#fff' : '#1E1E1E',
              }}
            >
              <Text style={{
                color: isActive ? '#000' : '#888',
                fontSize: 14,
                fontWeight: '600',
              }}>
                {tab === 'following' ? 'For You' : 'Friends'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 'following' && (
        <>
          <CompactScoreboard teamSlugs={teamSlugs} onNavigate={onNavigate} />
          <RecentlyPlayedShelf onNavigate={onNavigate} />
        </>
      )}
    </>
  ), [teamSlugs, onNavigate, teams, unreadCount, activeTab]);

  if (profileLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <TeamPickerModal
        visible={teamPickerOpen}
        onClose={() => setTeamPickerOpen(false)}
        selectedTeams={teamSlugs}
        onSave={handleSaveTeams}
      />
      <NotificationsSheet
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onNavigate={onNavigate}
      />

      {/* ── Feed ── */}
      {activeTab === 'following' ? (
        <FlatList
          data={feedItems}
          keyExtractor={(item) => item.type === 'followed-shows-shelf' ? 'followed-shows-shelf' : item.type === 'related-shows-shelf' ? 'related-shows-shelf' : item.data.id}
          renderItem={renderPost}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={
            feedLoading
              ? <ActivityIndicator color="#fff" style={{ marginTop: 60 }} />
              : <FeedEmpty hasTeams={teamSlugs.length > 0} onFollowTeams={() => setTeamPickerOpen(true)} />
          }
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          windowSize={8}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" colors={['#fff']} />
          }
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" colors={['#fff']} />
          }
        >
          {ListHeader}
          <FriendActivityFeed onNavigate={onNavigate} />
        </ScrollView>
      )}
    </View>
  );
}
