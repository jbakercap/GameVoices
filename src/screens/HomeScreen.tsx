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
import { EpisodeFeedPost, CommentsSheet, FeedEpisode, timeAgo } from '../components/EpisodeFeedPost';
import { useNotifications, useUnreadNotificationCount, AppNotification } from '../hooks/queries/useNotifications';
import { useMarkNotificationsRead } from '../hooks/mutations/useMarkNotificationsRead';

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

  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [commentsEpisode, setCommentsEpisode] = useState<FeedEpisode | null>(null);
  const [commentsColor, setCommentsColor] = useState('#333');
  const [refreshing, setRefreshing] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

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
    await queryClient.invalidateQueries({ queryKey: ['recent-team-episodes'] });
    await queryClient.invalidateQueries({ queryKey: ['recent-games'] });
    setRefreshing(false);
  }, [queryClient]);

  const handleOpenComments = useCallback((episode: FeedEpisode, color: string) => {
    setCommentsEpisode(episode);
    setCommentsColor(color);
  }, []);

  const renderPost = useCallback(({ item }: { item: FeedEpisode }) => {
    const teamColor = teamColorMap[item.team_slug || ''] || '#1E2A3A';
    const teamShortName = teamNameMap[item.team_slug || ''];
    return (
      <EpisodeFeedPost
        episode={item}
        teamColor={teamColor}
        teamShortName={teamShortName}
        onOpenComments={handleOpenComments}
        onNavigate={onNavigate}
      />
    );
  }, [teamColorMap, teamNameMap, handleOpenComments, onNavigate]);

  const ListHeader = useMemo(() => <CompactScoreboard teamSlugs={teamSlugs} />, [teamSlugs]);

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
      <CommentsSheet
        episode={commentsEpisode}
        teamColor={commentsColor}
        visible={!!commentsEpisode}
        onClose={() => setCommentsEpisode(null)}
      />
      <NotificationsSheet
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onNavigate={onNavigate}
      />

      {/* ── Sticky header ── */}
      <View style={{
        paddingTop: 56, paddingBottom: 10, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#121212', borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
      }}>
        <TouchableOpacity
          onPress={() => setTeamPickerOpen(true)}
          style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#1E1E1E',
            alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="options-outline" size={20} color="#fff" />
        </TouchableOpacity>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
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

        {/* Bell */}
        <TouchableOpacity
          onPress={handleBellPress}
          style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}
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

      {/* ── Feed ── */}
      <FlatList
        data={episodes}
        keyExtractor={(item) => item.id}
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
    </View>
  );
}
