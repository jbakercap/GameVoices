import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Modal, Alert, Dimensions, TextInput, RefreshControl,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Circle, Path } from 'react-native-svg';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { usePublicProfile } from '../hooks/queries/usePublicProfile';
import { useTeamsBySlug } from '../hooks/queries/useTeamsBySlug';
import { TeamPickerModal } from '../components/TeamPickerModal';
import { useUserComments } from '../hooks/queries/useUserComments';
import {
  usePublicListenHistory,
  usePublicFollowedShows,
  usePublicListenCount,
  usePublicCommentCount,
} from '../hooks/queries/usePublicUserData';
import { useFriends, useFriendshipStatus, usePendingFriendRequests } from '../hooks/queries/useFriendships';
import {
  useSendFriendRequest,
  useCancelFriendRequest,
  useAcceptFriendRequest,
  useDeclineFriendRequest,
  useRemoveFriend,
} from '../hooks/mutations/useFriendshipMutations';
import { LinearGradient } from 'expo-linear-gradient';
import { timeAgo, darkenColor, CommentsSheet, FeedEpisode } from '../components/EpisodeFeedPost';
import { usePlayer } from '../contexts/PlayerContext';
import { navigate } from '../lib/navigationRef';

const SCREEN_WIDTH = Dimensions.get('window').width;

// ─── Gradient Ring (SVG conic simulation) ────────────────────────────────────

function GradientRing({ colors, size = 100, strokeWidth = 7 }: {
  colors: string[];
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;

  if (colors.length === 0) {
    return (
      <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Circle cx={cx} cy={cy} r={radius} stroke="#2a2a2a"
          strokeWidth={strokeWidth} fill="none" />
      </Svg>
    );
  }

  const n = colors.length;
  const segments = colors.map((color, i) => {
    const startAngle = (i / n) * 2 * Math.PI - Math.PI / 2;
    const endAngle = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    const d = `M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${radius} ${radius} 0 ${largeArc} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}`;
    return {
      d, id: `seg${i}`, color, nextColor: colors[(i + 1) % n],
      gx1: `${((x1 / size) * 100).toFixed(1)}%`, gy1: `${((y1 / size) * 100).toFixed(1)}%`,
      gx2: `${((x2 / size) * 100).toFixed(1)}%`, gy2: `${((y2 / size) * 100).toFixed(1)}%`,
    };
  });

  return (
    <Svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0 }}>
      <Defs>
        {segments.map((seg) => (
          <SvgLinearGradient key={seg.id} id={seg.id}
            x1={seg.gx1} y1={seg.gy1} x2={seg.gx2} y2={seg.gy2}>
            <Stop offset="0" stopColor={seg.color} stopOpacity="1" />
            <Stop offset="1" stopColor={seg.nextColor} stopOpacity="1" />
          </SvgLinearGradient>
        ))}
      </Defs>
      {segments.map((seg) => (
        <Path key={seg.id} d={seg.d}
          stroke={`url(#${seg.id})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
        />
      ))}
    </Svg>
  );
}

// ─── Avatar with ring ─────────────────────────────────────────────────────────

function ProfileHeroAvatar({ avatarUrl, displayName, teamColors, size = 96 }: {
  avatarUrl: string | null | undefined;
  displayName: string | null | undefined;
  teamColors: string[];
  size?: number;
}) {
  const ringSize = size + 8;
  const initial = (displayName || 'G')
    .trim().split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center' }}>
      <GradientRing colors={teamColors} size={ringSize} strokeWidth={3} />
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: '#1e1e1e', overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={{ width: size, height: size }}
            contentFit="cover" accessible={false} />
        ) : (
          <Text style={{ color: '#fff', fontSize: size * 0.34, fontWeight: '800' }}>{initial}</Text>
        )}
      </View>
    </View>
  );
}

// ─── Team chips ───────────────────────────────────────────────────────────────

function TeamChips({ teams }: { teams: { primary_color: string | null; logo_url: string | null; slug: string }[] }) {
  const MAX_VISIBLE = 5;
  const visible = teams.slice(0, MAX_VISIBLE);
  const overflow = teams.length - MAX_VISIBLE;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 6 }}>
      {visible.map((team, i) => (
        <View key={team.slug} style={{
          width: 34, height: 34, borderRadius: 17,
          backgroundColor: team.primary_color || '#2a2a2a',
          borderWidth: 2.5, borderColor: '#121212',
          marginLeft: i === 0 ? 0 : -8,
          alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {team.logo_url ? (
            <Image source={{ uri: team.logo_url }} style={{ width: 24, height: 24 }}
              contentFit="contain" accessible={false} />
          ) : null}
        </View>
      ))}
      {overflow > 0 && (
        <View style={{
          width: 34, height: 34, borderRadius: 17,
          backgroundColor: '#2a2a2a', borderWidth: 2.5, borderColor: '#121212',
          marginLeft: -8, alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: '#aaa', fontSize: 10, fontWeight: '700' }}>+{overflow}</Text>
        </View>
      )}
      <Text style={{ color: '#555', fontSize: 11, letterSpacing: 1.2,
        textTransform: 'uppercase', marginLeft: 10 }}>
        {teams.length} {teams.length === 1 ? 'team' : 'teams'}
      </Text>
    </View>
  );
}

// ─── Friend button ────────────────────────────────────────────────────────────

function FriendButton({ targetUserId }: { targetUserId: string }) {
  const { data: status = 'none', isLoading } = useFriendshipStatus(targetUserId);
  const send = useSendFriendRequest();
  const cancel = useCancelFriendRequest();
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const remove = useRemoveFriend();
  const { data: friends = [] } = useFriends(undefined); // current user friends for friendshipId lookup
  const friendship = friends.find((f) => f.userId === targetUserId);

  const handleRemove = () => {
    if (!friendship) return;
    Alert.alert('Remove Friend', 'Remove this person from your friends?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: () => remove.mutate({ friendshipId: friendship.friendshipId, otherUserId: targetUserId }),
      },
    ]);
  };

  if (isLoading) return null;

  if (status === 'friends') {
    return (
      <TouchableOpacity onPress={handleRemove} style={{
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333',
        borderRadius: 22, paddingVertical: 10, paddingHorizontal: 20,
      }}>
        <Ionicons name="checkmark" size={16} color="#22c55e" />
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>Friends</Text>
      </TouchableOpacity>
    );
  }

  if (status === 'pending_sent') {
    return (
      <TouchableOpacity onPress={() => cancel.mutate(targetUserId)} style={{
        backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333',
        borderRadius: 22, paddingVertical: 10, paddingHorizontal: 20,
      }}>
        <Text style={{ color: '#888', fontSize: 14, fontWeight: '700' }}>Request Sent</Text>
      </TouchableOpacity>
    );
  }

  if (status === 'pending_received') {
    // Need friendshipId — query pending requests
    return (
      <PendingReceivedButtons targetUserId={targetUserId} accept={accept} decline={decline} />
    );
  }

  return (
    <TouchableOpacity onPress={() => send.mutate(targetUserId)} style={{
      backgroundColor: '#fff', borderRadius: 22,
      paddingVertical: 10, paddingHorizontal: 24,
    }}>
      <Text style={{ color: '#000', fontSize: 14, fontWeight: '700' }}>+ Add Friend</Text>
    </TouchableOpacity>
  );
}

function PendingReceivedButtons({ targetUserId, accept, decline }: any) {
  const { data: requests = [] } = usePendingFriendRequests();
  const request = requests.find((r: any) => r.requesterId === targetUserId);
  if (!request) return null;

  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <TouchableOpacity
        onPress={() => accept.mutate({ friendshipId: request.friendshipId, requesterId: targetUserId })}
        style={{ backgroundColor: '#fff', borderRadius: 22, paddingVertical: 10, paddingHorizontal: 20 }}>
        <Text style={{ color: '#000', fontSize: 14, fontWeight: '700' }}>Accept</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => decline.mutate({ friendshipId: request.friendshipId, requesterId: targetUserId })}
        style={{ backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333',
          borderRadius: 22, paddingVertical: 10, paddingHorizontal: 20 }}>
        <Text style={{ color: '#888', fontSize: 14, fontWeight: '700' }}>Decline</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────

function SectionHeader({ title, icon, count, onSeeAll }: {
  title: string; icon?: string; count?: number; onSeeAll?: () => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 20, paddingBottom: 14 }}>
      {icon && (
        <Ionicons name={icon as any} size={16} color="#fff" style={{ marginRight: 7 }} />
      )}
      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 }}>{title}</Text>
      {onSeeAll && (
        <TouchableOpacity onPress={onSeeAll} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>See all</Text>
          <Ionicons name="chevron-forward" size={13} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Comments bottom sheet ────────────────────────────────────────────────────

function AllCommentsSheet({ userId, title, displayName, visible, onClose }: {
  userId: string; title: string; displayName: string; visible: boolean; onClose: () => void;
}) {
  const { data: comments = [], isLoading } = useUserComments(userId, 50);
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();
  const [commentsEpisode, setCommentsEpisode] = useState<FeedEpisode | null>(null);
  const [commentsColor, setCommentsColor] = useState('#1E2A3A');

  return (
    <Modal visible={visible} animationType="slide" transparent
      presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ position: 'absolute', inset: 0 } as any}
          activeOpacity={1} onPress={onClose} />
        <View style={{ backgroundColor: '#121212', borderTopLeftRadius: 20,
          borderTopRightRadius: 20, height: '90%' }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#444',
            alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700',
            paddingHorizontal: 20, marginBottom: 12 }}>{title}</Text>
          <View style={{ height: 1, backgroundColor: '#1a1a1a' }} />
          {isLoading ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
              {comments.map((c) => {
                const dur = c.duration_seconds;
                const durationLabel = dur
                  ? dur >= 3600
                    ? `${Math.floor(dur / 3600)}h ${Math.floor((dur % 3600) / 60)}m`
                    : `${Math.floor(dur / 60)}m`
                  : null;
                const cardColor = c.team_color || '#1E2A3A';
                const isCurrentlyPlaying = currentEpisode?.id === c.episode_id;
                const feedEpisode: FeedEpisode | null = c.audio_url && c.show_id ? {
                  id: c.episode_id,
                  title: c.episode_title || '',
                  artwork_url: c.artwork_url,
                  show_artwork_url: c.show_artwork_url,
                  audio_url: c.audio_url,
                  duration_seconds: c.duration_seconds || 0,
                  published_at: c.created_at,
                  show_id: c.show_id,
                  show_title: c.show_title,
                  team_slug: null,
                } : null;

                const handlePlay = () => {
                  if (!feedEpisode) return;
                  if (isCurrentlyPlaying) { togglePlayPause(); }
                  else {
                    playEpisode({
                      id: feedEpisode.id,
                      title: feedEpisode.title,
                      showTitle: feedEpisode.show_title || '',
                      artworkUrl: feedEpisode.artwork_url || feedEpisode.show_artwork_url || undefined,
                      audioUrl: feedEpisode.audio_url,
                      durationSeconds: feedEpisode.duration_seconds,
                      teamColor: cardColor,
                    });
                  }
                };

                return (
                  <View key={c.id} style={{ paddingHorizontal: 20, paddingTop: 16 }}>
                    {/* Show name */}
                    <TouchableOpacity activeOpacity={0.7}
                      onPress={() => { if (c.show_id) { onClose(); setTimeout(() => navigate('ShowDetail', { showId: c.show_id }), 300); } }}>
                      <Text style={{ color: '#555', fontSize: 11, fontWeight: '600',
                        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                        {c.show_title}
                      </Text>
                    </TouchableOpacity>

                    {/* Episode card */}
                    <TouchableOpacity activeOpacity={0.85} onPress={handlePlay}
                      style={{ borderRadius: 12, overflow: 'hidden' }}>
                      <LinearGradient
                        colors={[darkenColor(cardColor, 0.55), darkenColor(cardColor, 0.05)]}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }}>
                        <View style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                          {(c.show_artwork_url || c.artwork_url) ? (
                            <Image source={{ uri: c.show_artwork_url || c.artwork_url! }}
                              style={{ width: 48, height: 48 }} contentFit="cover" accessible={false} />
                          ) : <View style={{ width: 48, height: 48, backgroundColor: '#333' }} />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', lineHeight: 16 }}
                            numberOfLines={2}>{c.episode_title}</Text>
                          {durationLabel && (
                            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 3 }}>{durationLabel}</Text>
                          )}
                        </View>
                        <View style={{ width: 32, height: 32, borderRadius: 16,
                          backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Ionicons
                            name={isCurrentlyPlaying && isPlaying ? 'pause' : 'play'}
                            size={14} color="#000"
                            style={{ marginLeft: isCurrentlyPlaying && isPlaying ? 0 : 2 }}
                          />
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>

                    {/* Connector + comment */}
                    <TouchableOpacity activeOpacity={0.7} onPress={() => {
                      if (feedEpisode) { setCommentsColor(cardColor); setCommentsEpisode(feedEpisode); }
                    }}>
                      <View style={{ flexDirection: 'row', marginTop: 4 }}>
                        <View style={{ width: 20, alignItems: 'center', paddingTop: 4, paddingBottom: 4 }}>
                          <View style={{ width: 2, flex: 1, backgroundColor: '#2a2a2a', borderRadius: 1 }} />
                        </View>
                        <View style={{ flex: 1, paddingLeft: 10, paddingTop: 10, paddingBottom: 10 }}>
                          <Text style={{ color: '#555', fontSize: 11, marginBottom: 6 }}>
                            {displayName} · {timeAgo(c.created_at)}
                          </Text>
                          <Text style={{ color: '#fff', fontSize: 14, lineHeight: 20 }}>
                            {c.content}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 18, marginTop: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              <Ionicons name="heart-outline" size={15} color="#555" />
                              <Text style={{ color: '#555', fontSize: 12 }}>{c.like_count}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                              <Ionicons name="chatbubble-outline" size={15} color="#555" />
                              <Text style={{ color: '#555', fontSize: 12 }}>{c.reply_count}</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>

                    <View style={{ height: 1, backgroundColor: '#1a1a1a', marginTop: 4 }} />
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>

      <CommentsSheet
        episode={commentsEpisode}
        teamColor={commentsColor}
        visible={!!commentsEpisode}
        onClose={() => setCommentsEpisode(null)}
      />
    </Modal>
  );
}

// ─── Edit Profile Modal (own profile only) ───────────────────────────────────

function EditProfileModal({ visible, onClose, profile, userId, onSaved }: {
  visible: boolean; onClose: () => void;
  profile: any; userId: string; onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && profile) {
      setDisplayName(profile.display_name || '');
      setBio(profile.bio || '');
      setAvatarUri(null); // reset local pick on open
    }
  }, [visible, profile]);

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const uploadAvatar = async (uri: string): Promise<string> => {
    const ext = (uri.split('.').pop()?.split('?')[0]?.toLowerCase()) ?? 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const path = `${userId}/avatar.${ext}`;

    // Use FileSystem.uploadAsync — sends the file natively, no blob/base64 conversion needed
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const uploadUrl = `https://mcrgcbbqfnbtfuiypcic.supabase.co/storage/v1/object/avatars/${path}`;
    const result = await FileSystem.uploadAsync(uploadUrl, uri, {
      httpMethod: 'POST',
      uploadType: 0, // FileSystemUploadType.BINARY_CONTENT
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
    });

    if (result.status !== 200) {
      throw new Error(`Upload failed (${result.status}): ${result.body}`);
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let avatarUrl = profile?.avatar_url ?? null;
      if (avatarUri) {
        avatarUrl = await uploadAvatar(avatarUri);
      }
      const { error } = await supabase.from('profiles').update({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
      }).eq('user_id', userId);
      if (error) throw error;
      onSaved();
      onClose();
    } catch (e: any) {
      console.error('Save profile error:', JSON.stringify(e), e);
      Alert.alert('Error', e?.message || e?.error || JSON.stringify(e) || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const currentAvatar = avatarUri ?? profile?.avatar_url;
  const initial = (displayName || 'G').trim().split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: '#121212' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 20, paddingHorizontal: 16, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: '#222' }}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: '#888', fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>Edit Profile</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Save</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          {/* Avatar picker */}
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <TouchableOpacity onPress={pickAvatar}>
              <View style={{ width: 88, height: 88, borderRadius: 44,
                backgroundColor: '#1e1e1e', overflow: 'hidden',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: '#333' }}>
                {currentAvatar ? (
                  <Image source={{ uri: currentAvatar }}
                    style={{ width: 88, height: 88 }} contentFit="cover" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>{initial}</Text>
                )}
              </View>
              <View style={{ position: 'absolute', bottom: 0, right: 0,
                width: 28, height: 28, borderRadius: 14,
                backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: '#121212' }}>
                <Ionicons name="camera" size={14} color="#000" />
              </View>
            </TouchableOpacity>
            <Text style={{ color: '#555', fontSize: 12, marginTop: 8 }}>Tap to change photo</Text>
          </View>

          <View>
            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Display Name</Text>
            <TextInput value={displayName} onChangeText={setDisplayName}
              placeholder="Your name" placeholderTextColor="#555"
              style={{ backgroundColor: '#1A1A1A', color: '#fff', fontSize: 15,
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                borderWidth: 1, borderColor: '#333' }} />
          </View>
          <View>
            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Bio</Text>
            <TextInput value={bio} onChangeText={(t) => setBio(t.slice(0, 160))}
              placeholder="Short bio (160 chars)" placeholderTextColor="#555"
              multiline maxLength={160}
              style={{ backgroundColor: '#1A1A1A', color: '#fff', fontSize: 15,
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                borderWidth: 1, borderColor: '#333', minHeight: 80 }} />
            <Text style={{ color: '#555', fontSize: 11, textAlign: 'right', marginTop: 4 }}>
              {bio.length}/160
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Settings sheet (own profile only) ───────────────────────────────────────

function OwnProfileMenu({ visible, onClose, onEditProfile, onEditTeams, onSignOut }: {
  visible: boolean; onClose: () => void;
  onEditProfile: () => void; onEditTeams: () => void; onSignOut: () => void;
}) {
  const items = [
    { label: 'Edit Profile', icon: 'person-outline' as const, onPress: () => { onClose(); setTimeout(onEditProfile, 300); } },
    { label: 'Favorite Teams', icon: 'shirt-outline' as const, onPress: () => { onClose(); setTimeout(onEditTeams, 300); } },
    { label: 'My Library', icon: 'bookmark-outline' as const, onPress: () => { onClose(); navigate('LibraryDetail', { initialTab: 'shows' }); } },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end' }} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1}>
          <View style={{ backgroundColor: '#1a1a1a', borderTopLeftRadius: 20,
            borderTopRightRadius: 20, paddingBottom: 40, overflow: 'hidden' }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#444',
              alignSelf: 'center', marginTop: 12, marginBottom: 8 }} />
            {items.map((item, i) => (
              <TouchableOpacity key={item.label} onPress={item.onPress}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
                  paddingHorizontal: 20, paddingVertical: 16,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: '#222' }}>
                <Ionicons name={item.icon} size={20} color="#aaa" />
                <Text style={{ color: '#fff', fontSize: 16 }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => { onClose(); setTimeout(onSignOut, 300); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14,
                paddingHorizontal: 20, paddingVertical: 16,
                borderTopWidth: 1, borderTopColor: '#222', marginTop: 8 }}>
              <Ionicons name="log-out-outline" size={20} color="#e11d48" />
              <Text style={{ color: '#e11d48', fontSize: 16 }}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PublicProfileScreen({ overrideUserId }: { overrideUserId?: string } = {}) {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();

  // When rendered as the Profile tab, overrideUserId is passed directly.
  // When pushed as a stack screen, userId comes from route params.
  const userId: string = overrideUserId ?? route.params?.userId ?? user?.id ?? '';
  const isTabRoot = !!overrideUserId;

  const scrollRef = useRef<ScrollView>(null);
  const voiceY = useRef(0);
  const listeningY = useRef(0);
  const recentY = useRef(0);

  const [allCommentsOpen, setAllCommentsOpen] = useState(false);
  const [commentsEpisode, setCommentsEpisode] = useState<FeedEpisode | null>(null);
  const [commentsColor, setCommentsColor] = useState('#1E2A3A');
  const [refreshing, setRefreshing] = useState(false);
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();
  const [ownMenuOpen, setOwnMenuOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['public-profile', userId] });
    await queryClient.invalidateQueries({ queryKey: ['user-comments', userId] });
    await queryClient.invalidateQueries({ queryKey: ['public-listen-history', userId] });
    await queryClient.invalidateQueries({ queryKey: ['public-followed-shows', userId] });
    await queryClient.invalidateQueries({ queryKey: ['public-listen-count', userId] });
    await queryClient.invalidateQueries({ queryKey: ['public-comment-count', userId] });
    await queryClient.invalidateQueries({ queryKey: ['friends', userId] });
    setRefreshing(false);
  }, [userId, queryClient]);

  const handleSignOut = () => {
    setOwnMenuOpen(false);
    setTimeout(() => {
      Alert.alert('Sign Out', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: async () => { await signOut(); } },
      ]);
    }, 300);
  };

  const handleSaveTeams = async (teams: string[]) => {
    if (!user) return;
    const { error } = await supabase.from('profiles')
      .update({ topic_slugs: teams }).eq('user_id', user.id);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setTeamPickerOpen(false);
    } else {
      Alert.alert('Error', 'Failed to save teams');
    }
  };

  const { data: profile, isLoading: profileLoading } = usePublicProfile(userId);
  const { data: teams = [] } = useTeamsBySlug(profile?.topic_slugs);
  const { data: comments = [], isLoading: commentsLoading } = useUserComments(userId, 3);
  const { data: history = [], isLoading: historyLoading } = usePublicListenHistory(userId);
  const { data: followedShows = [] } = usePublicFollowedShows(userId);
  const { data: listenCount = 0 } = usePublicListenCount(userId);
  const { data: commentCount = 0 } = usePublicCommentCount(userId);
  const { data: friends = [] } = useFriends(userId);

  const teamColors = teams.map((t) => t.primary_color || '#2a2a2a');

  const isOwnProfile = user?.id === userId;

  const scrollTo = useCallback((y: number) => {
    scrollRef.current?.scrollTo({ y, animated: true });
  }, []);

  if (profileLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#555' }}>Profile not found</Text>
      </View>
    );
  }

  const displayName = profile.display_name || 'GameVoices User';
  const firstName = displayName.trim().split(' ')[0];
  const voiceSectionTitle = isOwnProfile ? 'My Voice' : `${firstName}'s Voice`;

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Nav bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center',
        paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8 }}>
        {isTabRoot ? (
          <View style={{ width: 36 }} />
        ) : (
          <TouchableOpacity onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        {isOwnProfile && (
          <TouchableOpacity onPress={() => setOwnMenuOpen(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />}>

        {/* ── Hero ── */}
        <View style={{ alignItems: 'center', paddingHorizontal: 20,
          paddingTop: 16, paddingBottom: 24, gap: 8 }}>

          <ProfileHeroAvatar
            avatarUrl={profile.avatar_url}
            displayName={displayName}
            teamColors={teamColors}
            size={96}
          />

          <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', marginTop: 4 }}>
            {displayName}
          </Text>

          {profile.bio ? (
            <Text style={{ color: '#888', fontSize: 13, textAlign: 'center',
              paddingHorizontal: 24, lineHeight: 18 }}>
              {profile.bio}
            </Text>
          ) : null}

          {teams.length > 0 && <TeamChips teams={teams} />}

          {/* Stats row */}
          <View style={{ flexDirection: 'row', width: '100%',
            backgroundColor: '#1a1a1a', borderRadius: 16,
            overflow: 'hidden', marginTop: 8 }}>
            <TouchableOpacity style={{ flex: 1, alignItems: 'center', paddingVertical: 14,
              borderRightWidth: 1, borderRightColor: '#222' }}
              onPress={() => scrollTo(recentY.current)}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>
                {listenCount || '—'}
              </Text>
              <Text style={{ color: '#555', fontSize: 10, marginTop: 2 }}>Plays</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, alignItems: 'center', paddingVertical: 14,
              borderRightWidth: 1, borderRightColor: '#222' }}
              onPress={() => scrollTo(voiceY.current)}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>
                {commentCount || '—'}
              </Text>
              <Text style={{ color: '#555', fontSize: 10, marginTop: 2 }}>Comments</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1, alignItems: 'center', paddingVertical: 14 }}
              onPress={() => navigate('Friends', { userId })}>
              <Text style={{ color: '#fff', fontSize: 17, fontWeight: '800' }}>
                {friends.length}
              </Text>
              <Text style={{ color: '#555', fontSize: 10, marginTop: 2 }}>Friends</Text>
            </TouchableOpacity>
          </View>

          {isOwnProfile ? (
            <TouchableOpacity
              onPress={() => navigate('LibraryDetail', { initialTab: 'shows' })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333',
                borderRadius: 22, paddingVertical: 10, paddingHorizontal: 22 }}>
              <Ionicons name="bookmark-outline" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>My Library</Text>
            </TouchableOpacity>
          ) : (
            <FriendButton targetUserId={userId} />
          )}
        </View>

        <View style={{ height: 1, backgroundColor: '#1a1a1a' }} />

        {/* ── Their Voice ── */}
        <View style={{ paddingTop: 20 }}
          onLayout={(e) => { voiceY.current = e.nativeEvent.layout.y; }}>
          <SectionHeader
            title={voiceSectionTitle} icon="mic-outline"
            count={comments.length}
            onSeeAll={comments.length > 0 ? () => setAllCommentsOpen(true) : undefined}
          />
          {commentsLoading ? (
            <ActivityIndicator color="#fff" style={{ marginBottom: 20 }} />
          ) : comments.length === 0 ? (
            <Text style={{ color: '#444', fontSize: 14, paddingHorizontal: 20, paddingBottom: 20 }}>
              No comments yet
            </Text>
          ) : (
            comments.map((c) => {
              const dur = c.duration_seconds;
              const durationLabel = dur
                ? dur >= 3600
                  ? `${Math.floor(dur / 3600)}h ${Math.floor((dur % 3600) / 60)}m`
                  : `${Math.floor(dur / 60)}m`
                : null;
              const cardColor = c.team_color || '#1E2A3A';
              const isCurrentlyPlaying = currentEpisode?.id === c.episode_id;
              const feedEpisode: FeedEpisode | null = c.audio_url && c.show_id ? {
                id: c.episode_id,
                title: c.episode_title || '',
                artwork_url: c.artwork_url,
                show_artwork_url: c.show_artwork_url,
                audio_url: c.audio_url,
                duration_seconds: c.duration_seconds || 0,
                published_at: c.created_at,
                show_id: c.show_id,
                show_title: c.show_title,
                team_slug: null,
              } : null;

              const handlePlay = () => {
                if (!feedEpisode) return;
                if (isCurrentlyPlaying) { togglePlayPause(); }
                else {
                  playEpisode({
                    id: feedEpisode.id,
                    title: feedEpisode.title,
                    showTitle: feedEpisode.show_title || '',
                    artworkUrl: feedEpisode.artwork_url || feedEpisode.show_artwork_url || undefined,
                    audioUrl: feedEpisode.audio_url,
                    durationSeconds: feedEpisode.duration_seconds,
                    teamColor: cardColor,
                  });
                }
              };

              const handleOpenThread = () => {
                if (feedEpisode) {
                  setCommentsColor(cardColor);
                  setCommentsEpisode(feedEpisode);
                }
              };

              return (
                <View key={c.id} style={{ paddingHorizontal: 20, paddingTop: 16 }}>
                  {/* Show name — taps to show page */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => c.show_id && navigate('ShowDetail', { showId: c.show_id })}>
                    <Text style={{ color: '#555', fontSize: 11, fontWeight: '600',
                      textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
                      {c.show_title}
                    </Text>
                  </TouchableOpacity>

                  {/* Episode card — taps to play */}
                  <TouchableOpacity activeOpacity={0.85} onPress={handlePlay}
                    style={{ borderRadius: 12, overflow: 'hidden' }}>
                    <LinearGradient
                      colors={[darkenColor(cardColor, 0.55), darkenColor(cardColor, 0.05)]}
                      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10 }}>
                      <View style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                        {(c.show_artwork_url || c.artwork_url) ? (
                          <Image source={{ uri: c.show_artwork_url || c.artwork_url! }}
                            style={{ width: 48, height: 48 }} contentFit="cover" accessible={false} />
                        ) : <View style={{ width: 48, height: 48, backgroundColor: '#333' }} />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', lineHeight: 16 }}
                          numberOfLines={2}>{c.episode_title}</Text>
                        {durationLabel && (
                          <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 3 }}>{durationLabel}</Text>
                        )}
                      </View>
                      <View style={{ width: 32, height: 32, borderRadius: 16,
                        backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Ionicons
                          name={isCurrentlyPlaying && isPlaying ? 'pause' : 'play'}
                          size={14} color="#000"
                          style={{ marginLeft: isCurrentlyPlaying && isPlaying ? 0 : 2 }}
                        />
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* Connector + comment — taps to open thread */}
                  <TouchableOpacity activeOpacity={0.7} onPress={handleOpenThread}>
                    <View style={{ flexDirection: 'row', marginTop: 4 }}>
                      <View style={{ width: 20, alignItems: 'center', paddingTop: 4, paddingBottom: 4 }}>
                        <View style={{ width: 2, flex: 1, backgroundColor: '#2a2a2a', borderRadius: 1 }} />
                      </View>
                      <View style={{ flex: 1, paddingLeft: 10, paddingTop: 10, paddingBottom: 10 }}>
                        <Text style={{ color: '#555', fontSize: 11, marginBottom: 6 }}>
                          {displayName} · {timeAgo(c.created_at)}
                        </Text>
                        <Text style={{ color: '#fff', fontSize: 14, lineHeight: 20 }}>
                          {c.content}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 18, marginTop: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <Ionicons name="heart-outline" size={15} color="#555" />
                            <Text style={{ color: '#555', fontSize: 12 }}>{c.like_count}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                            <Ionicons name="chatbubble-outline" size={15} color="#555" />
                            <Text style={{ color: '#555', fontSize: 12 }}>{c.reply_count}</Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>

                  <View style={{ height: 1, backgroundColor: '#1a1a1a', marginTop: 4 }} />
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 8, backgroundColor: '#0d0d0d' }} />

        {/* ── Listening To ── */}
        <View style={{ paddingTop: 20 }}
          onLayout={(e) => { listeningY.current = e.nativeEvent.layout.y; }}>
          <SectionHeader
            title="Followed Shows" icon="headset-outline"
            count={followedShows.length}
          />
          {followedShows.length === 0 ? (
            <Text style={{ color: '#444', fontSize: 14,
              paddingHorizontal: 20, paddingBottom: 20 }}>No followed shows</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 4 }}>
              {followedShows.slice(0, 12).map((show: any) => (
                <TouchableOpacity key={show.id || show.show_id}
                  onPress={() => navigate('ShowDetail', { showId: show.id || show.show_id })}
                  style={{ width: 80 }}>
                  <View style={{ width: 80, height: 80, borderRadius: 10,
                    backgroundColor: '#1e1e1e', overflow: 'hidden', marginBottom: 5 }}>
                    {show.artwork_url ? (
                      <Image source={{ uri: show.artwork_url }}
                        style={{ width: 80, height: 80 }} contentFit="cover"
                        accessible={false} pointerEvents="none" />
                    ) : null}
                  </View>
                  <Text style={{ color: '#888', fontSize: 10, lineHeight: 13 }} numberOfLines={2}>
                    {show.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={{ height: 8, backgroundColor: '#0d0d0d', marginTop: 16 }} />

        {/* ── Recently Played ── */}
        <View style={{ paddingTop: 20 }}
          onLayout={(e) => { recentY.current = e.nativeEvent.layout.y; }}>
          <SectionHeader
            title="Recently Played" icon="time-outline"
            count={history.length}
          />
          {historyLoading ? (
            <ActivityIndicator color="#fff" style={{ marginBottom: 20 }} />
          ) : history.length === 0 ? (
            <Text style={{ color: '#444', fontSize: 14,
              paddingHorizontal: 20, paddingBottom: 20 }}>No history yet</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12, paddingBottom: 4 }}>
              {history.map((ep) => (
                <TouchableOpacity key={ep.episode_id}
                  onPress={() => navigate('EpisodeDetail', { episodeId: ep.episode_id })}
                  style={{ width: 150, backgroundColor: '#1a1a1a',
                    borderRadius: 12, overflow: 'hidden' }}>
                  <View style={{ width: 150, height: 84, backgroundColor: '#1e1e1e' }}>
                    {(ep.artwork_url || ep.show_artwork_url) ? (
                      <Image source={{ uri: ep.artwork_url || ep.show_artwork_url! }}
                        style={{ width: 150, height: 84 }} contentFit="cover"
                        accessible={false} pointerEvents="none" />
                    ) : null}
                  </View>
                  <View style={{ padding: 10 }}>
                    <Text style={{ color: '#555', fontSize: 10, marginBottom: 2 }} numberOfLines={1}>
                      {ep.show_title}
                    </Text>
                    <Text style={{ color: '#ccc', fontSize: 12,
                      fontWeight: '600', lineHeight: 16 }} numberOfLines={2}>
                      {ep.title}
                    </Text>
                    <Text style={{ color: '#444', fontSize: 10, marginTop: 4 }}>
                      {timeAgo(ep.listened_at)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={{ height: 8, backgroundColor: '#0d0d0d', marginTop: 16 }} />

        {/* ── Friends ── */}
        <View style={{ paddingTop: 20, paddingBottom: 8 }}>
          <SectionHeader
            title="Friends" icon="people-outline"
            count={friends.length}
            onSeeAll={friends.length > 0
              ? () => navigate('Friends', { userId })
              : undefined}
          />
          {friends.length === 0 ? (
            <Text style={{ color: '#444', fontSize: 14,
              paddingHorizontal: 20, paddingBottom: 20 }}>No friends yet</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingBottom: 4 }}>
              {friends.slice(0, 12).map((friend) => {
                const initial = (friend.display_name || 'U')
                  .trim().split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <TouchableOpacity key={friend.userId}
                    onPress={() => navigate('PublicProfile', { userId: friend.userId })}
                    style={{ alignItems: 'center', gap: 5, width: 56 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24,
                      backgroundColor: '#2a2a2a', overflow: 'hidden',
                      alignItems: 'center', justifyContent: 'center' }}>
                      {friend.avatar_url ? (
                        <Image source={{ uri: friend.avatar_url }}
                          style={{ width: 48, height: 48 }} contentFit="cover" accessible={false} />
                      ) : (
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{initial}</Text>
                      )}
                    </View>
                    <Text style={{ color: '#666', fontSize: 10, textAlign: 'center' }} numberOfLines={1}>
                      {friend.display_name || 'User'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

      </ScrollView>

      <AllCommentsSheet userId={userId} title={voiceSectionTitle} displayName={displayName}
        visible={allCommentsOpen} onClose={() => setAllCommentsOpen(false)} />

      <CommentsSheet
        episode={commentsEpisode}
        teamColor={commentsColor}
        visible={!!commentsEpisode}
        onClose={() => setCommentsEpisode(null)}
      />

      {isOwnProfile && (
        <>
          <OwnProfileMenu
            visible={ownMenuOpen}
            onClose={() => setOwnMenuOpen(false)}
            onEditProfile={() => setEditProfileOpen(true)}
            onEditTeams={() => setTeamPickerOpen(true)}
            onSignOut={handleSignOut}
          />
          <EditProfileModal
            visible={editProfileOpen}
            onClose={() => setEditProfileOpen(false)}
            profile={profile}
            userId={userId}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ['profile'] });
              queryClient.invalidateQueries({ queryKey: ['public-profile', userId] });
            }}
          />
          <TeamPickerModal
            visible={teamPickerOpen}
            onClose={() => setTeamPickerOpen(false)}
            selectedTeams={profile?.topic_slugs ?? []}
            onSave={handleSaveTeams}
          />
        </>
      )}
    </View>
  );
}
