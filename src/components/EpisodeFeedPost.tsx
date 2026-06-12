import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, Share,
  ActivityIndicator, Dimensions, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../contexts/PlayerContext';
import { navigate } from '../lib/navigationRef';
import { useAddToQueue } from '../hooks/mutations/useAddToQueue';
import { useSaveEpisode } from '../hooks/mutations/useSaveEpisode';
import { useDownloads } from '../contexts/DownloadsContext';
import { useEpisodeLikes, useIsEpisodeLiked } from '../hooks/queries/useEpisodeLikes';
import { useToggleEpisodeLike } from '../hooks/mutations/useToggleEpisodeLike';
import { useEpisodeComments, useEpisodeCommentCount, EpisodeComment } from '../hooks/queries/useEpisodeComments';
import { useAddEpisodeComment } from '../hooks/mutations/useAddEpisodeComment';
import { useToggleCommentLike } from '../hooks/mutations/useToggleCommentLike';
import { useProfile } from '../hooks/useProfile';
import { useFriendsWhoListened, ListenerProfile } from '../hooks/queries/useFriendsWhoListened';
import { useEpisodePinnedCommentId, usePinComment } from '../hooks/mutations/usePinComment';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { formatDurationHuman } from '../lib/formatters';

// ─── Shared episode type ──────────────────────────────────────────────────────

export interface FeedEpisode {
  id: string;
  title: string;
  artwork_url: string | null;
  show_artwork_url: string | null;
  audio_url: string;
  duration_seconds: number;
  published_at: string | null;
  show_id: string;
  show_title: string | null;
  team_slug: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const hrs = Math.floor(diffMs / 3_600_000);
  if (hrs < 1) return 'now';
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function withAlpha(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return hex;
  const alphaHex = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `#${cleaned}${alphaHex}`;
}

export function darkenColor(hex: string, amount = 0.2): string {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return '#1E2A3A';
  const num = parseInt(cleaned, 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.floor((num & 0xff) * (1 - amount)));
  return `rgb(${r},${g},${b})`;
}

function shareEpisode(episode: FeedEpisode) {
  const show = episode.show_title || 'GameVoices';
  const duration = episode.duration_seconds ? ` · ${formatDurationHuman(episode.duration_seconds)}` : '';
  Share.share({
    title: episode.title,
    message: `🎙️ ${episode.title}\n${show}${duration}\n\nListen on GameVoices`,
  });
}

function renderCommentContent(content: string, accentColor: string) {
  const parts = content.split(/(@\w+)/g);
  return (
    <Text style={{ color: '#ccc', fontSize: 14, lineHeight: 20 }}>
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <Text key={i} style={{ color: accentColor, fontWeight: '600' }}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
}

// ─── Episode Card (audio player pill) ────────────────────────────────────────

interface EpisodeCardProps {
  episode: FeedEpisode;
  teamColor: string;
  isCurrentlyPlaying: boolean;
  isPlaying: boolean;
  onPress: () => void;
}

export function EpisodeCard({ episode, teamColor, isCurrentlyPlaying, isPlaying, onPress }: EpisodeCardProps) {
  const artwork = episode.artwork_url || episode.show_artwork_url;
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={{
        borderRadius: 14,
        backgroundColor: '#282828',
        borderWidth: 1,
        borderColor: withAlpha(teamColor, 0.75),
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        gap: 12,
      }}
    >
      <View style={{
        width: 72, height: 72, borderRadius: 10,
        backgroundColor: 'rgba(0,0,0,0.3)', overflow: 'hidden', flexShrink: 0,
      }}>
        {artwork ? (
          <Image source={{ uri: artwork }} style={{ width: 72, height: 72 }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="mic" size={26} color="rgba(255,255,255,0.4)" />
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', lineHeight: 20 }} numberOfLines={2}>
          {episode.title}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 3 }}>
          {formatDurationHuman(episode.duration_seconds)}
        </Text>
      </View>
      <View style={{
        width: 42, height: 42, borderRadius: 21,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Ionicons
          name={isCurrentlyPlaying && isPlaying ? 'pause' : 'play'}
          size={18} color="#fff"
          style={{ marginLeft: isCurrentlyPlaying && isPlaying ? 0 : 2 }}
        />
      </View>
    </TouchableOpacity>
  );
}

// ─── Friends Who Listened Avatar Stack ───────────────────────────────────────

const AVATAR_SIZE = 22;
const AVATAR_OVERLAP = 8;

function FriendsWhoListenedStack({ episodeId }: { episodeId: string }) {
  const { data: listeners = [] } = useFriendsWhoListened(episodeId);
  if (listeners.length === 0) return null;

  const shown = listeners.slice(0, 3);
  const overflow = listeners.length - shown.length;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 16 }}>
      <View style={{ flexDirection: 'row' }}>
        {shown.map((listener, i) => (
          <View
            key={listener.user_id}
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: AVATAR_SIZE / 2,
              backgroundColor: '#3A3A3A',
              borderWidth: 1.5,
              borderColor: '#121212',
              overflow: 'hidden',
              marginLeft: i === 0 ? 0 : -AVATAR_OVERLAP,
              zIndex: shown.length - i,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {listener.avatar_url ? (
              <Image
                source={{ uri: listener.avatar_url }}
                style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
                contentFit="cover"
              />
            ) : (
              <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                {(listener.display_name || '?').charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
        ))}
        {overflow > 0 && (
          <View
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              borderRadius: AVATAR_SIZE / 2,
              backgroundColor: '#3A3A3A',
              borderWidth: 1.5,
              borderColor: '#121212',
              marginLeft: -AVATAR_OVERLAP,
              zIndex: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#aaa', fontSize: 8, fontWeight: '700' }}>+{overflow}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Three-Dots Menu ──────────────────────────────────────────────────────────

interface EpisodeMenuProps {
  episode: FeedEpisode;
  visible: boolean;
  onClose: () => void;
  onNavigate?: (screen: string, params: any) => void;
}

function EpisodeMenu({ episode, visible, onClose, onNavigate }: EpisodeMenuProps) {
  const addToQueue = useAddToQueue();
  const saveEpisode = useSaveEpisode();
  const { downloadEpisode, getDownloadStatus } = useDownloads();
  const dlStatus = getDownloadStatus(episode.id);

  const items = [
    { icon: 'radio-outline' as const, label: 'Go to Episode',
      onPress: () => { onClose(); onNavigate?.('EpisodeDetail', { episodeId: episode.id }); } },
    { icon: (dlStatus === 'downloaded' ? 'checkmark-circle' : 'download-outline') as 'checkmark-circle' | 'download-outline',
      label: dlStatus === 'downloaded' ? 'Downloaded' : 'Download for Offline',
      onPress: () => {
        if (dlStatus === 'idle') {
          downloadEpisode({
            id: episode.id,
            title: episode.title,
            showTitle: episode.show_title || '',
            showId: episode.show_id,
            artworkUrl: episode.artwork_url || episode.show_artwork_url || undefined,
            audioUrl: episode.audio_url,
            durationSeconds: episode.duration_seconds,
          });
        }
        onClose();
      } },
    { icon: 'share-social-outline' as const, label: 'Share Episode',
      onPress: () => { onClose(); shareEpisode(episode); } },
    { icon: 'list-outline' as const, label: 'Add to Queue',
      onPress: () => { addToQueue.mutate(episode.id); onClose(); } },
    { icon: 'bookmark-outline' as const, label: 'Save Episode',
      onPress: () => { saveEpisode.mutate({ episodeId: episode.id, isSaved: false }); onClose(); } },
    { icon: 'radio-outline' as const, label: 'Go to Show',
      onPress: () => { onClose(); onNavigate?.('ShowDetail', { showId: episode.show_id }); } },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}
        activeOpacity={1} onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1}>
          <View style={{ backgroundColor: '#1E1E1E', borderRadius: 16, width: 280, overflow: 'hidden' }}>
            {items.map((item, i) => (
              <TouchableOpacity
                key={i} onPress={item.onPress}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 20, paddingVertical: 15,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: '#2A2A2A',
                }}
              >
                <Ionicons name={item.icon} size={20} color="#aaa" style={{ marginRight: 14, width: 24 }} />
                <Text style={{ color: '#fff', fontSize: 15 }}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Show claimed owner hook ──────────────────────────────────────────────────

function useShowClaimedOwner(showId: string | undefined) {
  return useQuery({
    queryKey: ['show-claimed-owner', showId],
    queryFn: async (): Promise<string | null> => {
      if (!showId) return null;
      const { data } = await supabase
        .from('shows')
        .select('claim_status, claimed_by_user_id')
        .eq('id', showId)
        .maybeSingle();
      if ((data as any)?.claim_status !== 'approved') return null;
      return (data as any)?.claimed_by_user_id ?? null;
    },
    enabled: !!showId,
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Comment Row ──────────────────────────────────────────────────────────────

interface CommentRowProps {
  comment: EpisodeComment;
  isReply?: boolean;
  teamColor: string;
  episodeId: string;
  onReply: () => void;
  claimedOwnerUserId?: string | null;
  isPinned?: boolean;
  onLongPress?: () => void;
}

function CommentRow({ comment, isReply = false, teamColor, episodeId, onReply, claimedOwnerUserId, isPinned, onLongPress }: CommentRowProps) {
  const isVerifiedCreator = !!claimedOwnerUserId && comment.user_id === claimedOwnerUserId;
  const displayName = comment.profile?.display_name || 'Anonymous';
  const initial = displayName.charAt(0).toUpperCase();
  const avatarSize = isReply ? 28 : 36;
  const toggleLike = useToggleCommentLike();
  const commentAuthorId = comment.user_id;

  return (
    <TouchableOpacity
      activeOpacity={onLongPress ? 0.7 : 1}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={{ paddingLeft: isReply ? 52 : 16, paddingRight: 16, paddingTop: isPinned ? 6 : 10, paddingBottom: 10 }}
    >
    {isPinned && (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <Ionicons name="pin" size={11} color="#888" />
        <Text style={{ color: '#888', fontSize: 11, fontWeight: '600' }}>Pinned</Text>
      </View>
    )}
    <View style={{
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    }}>
      <TouchableOpacity
        onPress={() => comment.user_id && navigate('PublicProfile', { userId: comment.user_id })}
        style={{
          width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2,
          backgroundColor: '#2A2A2A', overflow: 'hidden',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
        {comment.profile?.avatar_url ? (
          <Image source={{ uri: comment.profile.avatar_url }} style={{ width: avatarSize, height: avatarSize }} contentFit="cover" accessible={false} />
        ) : (
          <Text style={{ color: '#fff', fontSize: isReply ? 11 : 14, fontWeight: '700' }}>{initial}</Text>
        )}
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{displayName}</Text>
          {isVerifiedCreator && (
            <Ionicons name="checkmark-circle" size={13} color="#4CAF50" />
          )}
          <Text style={{ color: '#555', fontSize: 12 }}>{timeAgo(comment.created_at)}</Text>
        </View>
        {renderCommentContent(comment.content, teamColor)}
        <TouchableOpacity onPress={onReply} style={{ marginTop: 6 }}>
          <Text style={{ color: '#555', fontSize: 12, fontWeight: '600' }}>Reply</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={() => toggleLike.mutate({ commentId: comment.id, episodeId, isLiked: comment.is_liked, commentAuthorId })}
        style={{ alignItems: 'center', gap: 2, paddingTop: 2 }}
      >
        <Ionicons name={comment.is_liked ? 'heart' : 'heart-outline'} size={18}
          color={comment.is_liked ? '#e11d48' : '#555'} />
        {comment.like_count > 0 && (
          <Text style={{ color: comment.is_liked ? '#e11d48' : '#555', fontSize: 11 }}>{comment.like_count}</Text>
        )}
      </TouchableOpacity>
    </View>
    </TouchableOpacity>
  );
}

// ─── Comments Sheet ───────────────────────────────────────────────────────────

interface CommentsSheetProps {
  episode: FeedEpisode | null;
  teamColor: string;
  visible: boolean;
  onClose: () => void;
}

export function CommentsSheet({ episode, teamColor, visible, onClose }: CommentsSheetProps) {
  const { data: profile } = useProfile();
  const { data: claimedOwnerUserId } = useShowClaimedOwner(episode?.show_id);
  const { data: pinnedCommentId } = useEpisodePinnedCommentId(episode?.id ?? '');
  const pinComment = usePinComment();
  const [comment, setComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string; userId: string } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const isCreator = !!claimedOwnerUserId && !!profile?.id && profile.id === claimedOwnerUserId;

  const { data: allComments = [], isLoading: commentsLoading } = useEpisodeComments(episode?.id ?? '');
  const addComment = useAddEpisodeComment();

  const topLevel = useMemo(() => {
    const tl = allComments.filter((c) => !c.parent_id);
    if (!pinnedCommentId) return tl;
    return [...tl].sort((a, b) => {
      if (a.id === pinnedCommentId) return -1;
      if (b.id === pinnedCommentId) return 1;
      return 0;
    });
  }, [allComments, pinnedCommentId]);
  const repliesMap = useMemo(() => {
    const map = new Map<string, EpisodeComment[]>();
    for (const c of allComments) {
      if (c.parent_id) {
        const arr = map.get(c.parent_id) ?? [];
        arr.push(c);
        map.set(c.parent_id, arr);
      }
    }
    return map;
  }, [allComments]);

  const commenters = useMemo(() => {
    const seen = new Set<string>();
    return allComments
      .map((c) => c.profile?.display_name)
      .filter((name): name is string => !!name && !seen.has(name) && !!seen.add(name));
  }, [allComments]);

  if (!episode) return null;

  const mentionSuggestions = mentionQuery !== null
    ? commenters.filter((n) => n.toLowerCase().includes(mentionQuery))
    : [];

  const handleTextChange = (text: string) => {
    setComment(text);
    const lastWord = text.split(/\s/).pop() ?? '';
    if (lastWord.startsWith('@')) {
      setMentionQuery(lastWord.slice(1).toLowerCase());
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (name: string) => {
    const words = comment.split(/\s/);
    words[words.length - 1] = `@${name} `;
    setComment(words.join(' '));
    setMentionQuery(null);
  };

  const startReply = (parentComment: EpisodeComment) => {
    const name = parentComment.profile?.display_name || 'User';
    setReplyingTo({ id: parentComment.id, name, userId: parentComment.user_id });
    setComment(`@${name} `);
    setMentionQuery(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setComment('');
    setMentionQuery(null);
  };

  const handleSubmitComment = async () => {
    if (!comment.trim()) return;
    await addComment.mutateAsync({
      episodeId: episode.id,
      content: comment,
      parentId: replyingTo?.id,
      parentCommentUserId: replyingTo?.userId,
    });
    if (replyingTo) {
      setExpandedReplies((prev) => new Set([...prev, replyingTo.id]));
    }
    setComment('');
    setReplyingTo(null);
    setMentionQuery(null);
  };

  const toggleReplies = (commentId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      next.has(commentId) ? next.delete(commentId) : next.add(commentId);
      return next;
    });
  };

  const handleLongPressComment = (commentId: string) => {
    if (!isCreator || !episode) return;
    const isPinned = pinnedCommentId === commentId;
    Alert.alert(
      isPinned ? 'Unpin comment?' : 'Pin comment?',
      isPinned ? 'Remove this pinned comment from the top.' : 'Pin this comment to the top for all listeners.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isPinned ? 'Unpin' : 'Pin',
          onPress: () => pinComment.mutate({ episodeId: episode.id, commentId: isPinned ? null : commentId }),
        },
      ]
    );
  };

  const SHEET_HEIGHT = Dimensions.get('window').height * 0.75;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}
      presentationStyle="overFullScreen" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <TouchableOpacity
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          activeOpacity={1} onPress={onClose}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{
            backgroundColor: '#121212',
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            height: SHEET_HEIGHT,
          }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#444',
              alignSelf: 'center', marginTop: 12, marginBottom: 16 }} />
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700',
              paddingHorizontal: 20, marginBottom: 12 }}>
              Comments{allComments.length > 0 ? ` (${allComments.length})` : ''}
            </Text>
            <View style={{ height: 1, backgroundColor: '#1A1A1A' }} />

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled">
              {commentsLoading ? (
                <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
              ) : topLevel.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                  <Text style={{ color: '#555', fontSize: 15 }}>No comments yet</Text>
                  <Text style={{ color: '#444', fontSize: 13, marginTop: 4 }}>Be the first to share your take</Text>
                </View>
              ) : (
                topLevel.map((c) => {
                  const replies = repliesMap.get(c.id) ?? [];
                  const isExpanded = expandedReplies.has(c.id);
                  return (
                    <View key={c.id}>
                      <CommentRow
                        comment={c}
                        teamColor={teamColor}
                        episodeId={episode.id}
                        onReply={() => startReply(c)}
                        claimedOwnerUserId={claimedOwnerUserId}
                        isPinned={c.id === pinnedCommentId}
                        onLongPress={isCreator ? () => handleLongPressComment(c.id) : undefined}
                      />
                      {replies.length > 0 && (
                        <TouchableOpacity
                          onPress={() => toggleReplies(c.id)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 62, paddingBottom: 8 }}>
                          <View style={{ width: 20, height: 1, backgroundColor: '#444' }} />
                          <Text style={{ color: '#888', fontSize: 12, fontWeight: '600' }}>
                            {isExpanded ? 'Hide replies' : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                          </Text>
                        </TouchableOpacity>
                      )}
                      {isExpanded && replies.map((r) => (
                        <CommentRow key={r.id} comment={r} isReply teamColor={teamColor}
                          episodeId={episode.id} onReply={() => startReply(c)} claimedOwnerUserId={claimedOwnerUserId} />
                      ))}
                      <View style={{ height: 1, backgroundColor: '#1A1A1A', marginHorizontal: 16 }} />
                    </View>
                  );
                })
              )}
            </ScrollView>

            {mentionSuggestions.length > 0 && (
              <View style={{ backgroundColor: '#1E1E1E', borderTopWidth: 1, borderTopColor: '#2A2A2A', maxHeight: 120 }}>
                <ScrollView keyboardShouldPersistTaps="handled">
                  {mentionSuggestions.map((name) => (
                    <TouchableOpacity key={name} onPress={() => insertMention(name)}
                      style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}>
                      <Text style={{ color: '#fff', fontSize: 14 }}>@{name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {replyingTo && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#1A1A1A' }}>
                <Text style={{ color: '#888', fontSize: 13 }}>
                  Replying to <Text style={{ color: teamColor, fontWeight: '600' }}>@{replyingTo.name}</Text>
                </Text>
                <TouchableOpacity onPress={cancelReply}>
                  <Ionicons name="close" size={16} color="#888" />
                </TouchableOpacity>
              </View>
            )}

            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingHorizontal: 16, paddingTop: 12, paddingBottom: 34,
              borderTopWidth: 1, borderTopColor: '#1A1A1A', backgroundColor: '#121212',
            }}>
              {/* Current user avatar */}
              <View style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: '#2A2A2A', overflow: 'hidden',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={{ width: 32, height: 32 }} contentFit="cover" />
                ) : (
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                    {(profile?.display_name || 'U').charAt(0).toUpperCase()}
                  </Text>
                )}
              </View>
              <TextInput
                ref={inputRef}
                value={comment}
                onChangeText={handleTextChange}
                placeholder={replyingTo ? `Reply to @${replyingTo.name}...` : 'Add a comment...'}
                placeholderTextColor="#555"
                style={{
                  flex: 1, backgroundColor: '#1E1E1E', borderRadius: 20,
                  paddingHorizontal: 16, paddingVertical: 10, color: '#fff', fontSize: 14,
                }}
                returnKeyType="send"
                onSubmitEditing={handleSubmitComment}
              />
              <TouchableOpacity
                onPress={handleSubmitComment}
                disabled={!comment.trim() || addComment.isPending}
                style={{
                  width: 36, height: 36, borderRadius: 18,
                  backgroundColor: comment.trim() ? teamColor : '#2A2A2A',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Episode Feed Post ────────────────────────────────────────────────────────

interface EpisodeFeedPostProps {
  episode: FeedEpisode;
  teamColor: string;
  teamShortName?: string;
  onOpenComments: (episode: FeedEpisode, color: string) => void;
  onNavigate?: (screen: string, params: any) => void;
}

export function EpisodeFeedPost({ episode, teamColor, teamShortName, onOpenComments, onNavigate }: EpisodeFeedPostProps) {
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();
  const [menuOpen, setMenuOpen] = useState(false);

  const { data: likeCount = 0 } = useEpisodeLikes(episode.id);
  const { data: isLiked = false } = useIsEpisodeLiked(episode.id);
  const { data: commentCount = 0 } = useEpisodeCommentCount(episode.id);
  const toggleLike = useToggleEpisodeLike();
  const addToQueue = useAddToQueue();
  const saveEpisode = useSaveEpisode();

  const isCurrentlyPlaying = currentEpisode?.id === episode.id;

  const handlePlay = useCallback(() => {
    if (isCurrentlyPlaying) {
      togglePlayPause();
    } else {
      playEpisode({
        id: episode.id,
        title: episode.title,
        showTitle: episode.show_title || '',
        artworkUrl: episode.artwork_url || episode.show_artwork_url || undefined,
        audioUrl: episode.audio_url,
        durationSeconds: episode.duration_seconds,
        teamColor,
      });
    }
  }, [isCurrentlyPlaying, episode, teamColor, togglePlayPause, playEpisode]);

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: '#1A1A1A', paddingVertical: 12 }}>

      {/* Post header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
        <TouchableOpacity
          onPress={() => onNavigate?.('ShowDetail', { showId: episode.show_id })}
          style={{ flex: 1 }}
        >
          <Text style={{ color: '#888', fontSize: 13, fontWeight: '400' }} numberOfLines={1}>
            {(episode.show_title || 'Unknown Show').length > 35
              ? (episode.show_title || 'Unknown Show').slice(0, 35).trimEnd() + '…'
              : (episode.show_title || 'Unknown Show')}
          </Text>
          <Text style={{ color: '#555', fontSize: 12, marginTop: 2 }}>
            {teamShortName ? `${teamShortName} · ` : ''}{timeAgo(episode.published_at)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ paddingLeft: 12 }}
        >
          <Ionicons name="ellipsis-horizontal" size={20} color="#555" />
        </TouchableOpacity>
      </View>

      {/* Episode card */}
      <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
        <EpisodeCard
          episode={episode}
          teamColor={teamColor}
          isCurrentlyPlaying={isCurrentlyPlaying}
          isPlaying={isPlaying}
          onPress={handlePlay}
        />
      </View>

      {/* Action bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 8 }}>
        <TouchableOpacity
          onPress={() => toggleLike.mutate({ episodeId: episode.id, isLiked })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 24 }}
        >
          <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={22} color={isLiked ? '#e11d48' : '#555'} />
          {likeCount > 0 && <Text style={{ color: isLiked ? '#e11d48' : '#555', fontSize: 14 }}>{likeCount}</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigate('NowPlaying', { episodeId: episode.id, scrollTo: 'comments', autoplay: false })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Ionicons name="chatbubble-outline" size={21} color="#555" />
          {commentCount > 0 && <Text style={{ color: '#555', fontSize: 14 }}>{commentCount}</Text>}
        </TouchableOpacity>

        <FriendsWhoListenedStack episodeId={episode.id} />

        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <TouchableOpacity onPress={() => shareEpisode(episode)}>
            <Ionicons name="share-outline" size={22} color="#555" />
          </TouchableOpacity>
        </View>
      </View>

      <EpisodeMenu episode={episode} visible={menuOpen} onClose={() => setMenuOpen(false)} onNavigate={onNavigate} />
    </View>
  );
}
