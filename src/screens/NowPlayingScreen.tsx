import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, TextInput,
  KeyboardAvoidingView, Platform, Share, Modal, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { usePlayer } from '../contexts/PlayerContext';
import { useEpisode } from '../hooks/queries/useEpisode';
import { useEpisodeComments, useEpisodeCommentCount, EpisodeComment } from '../hooks/queries/useEpisodeComments';
import { useAddEpisodeComment } from '../hooks/mutations/useAddEpisodeComment';
import { useToggleCommentLike } from '../hooks/mutations/useToggleCommentLike';
import { useProfile } from '../hooks/useProfile';
import { useAddToQueue } from '../hooks/mutations/useAddToQueue';
import { navigate } from '../lib/navigationRef';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const hrs = Math.floor(diffMs / 3_600_000);
  if (hrs < 1) return 'now';
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function renderCommentContent(content: string, accentColor: string) {
  const parts = content.split(/(@\w+)/g);
  return (
    <Text style={{ color: '#E0E0E0', fontSize: 14, lineHeight: 20 }}>
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

// ─── Comment Row ──────────────────────────────────────────────────────────────

interface CommentRowProps {
  comment: EpisodeComment;
  isReply?: boolean;
  accentColor: string;
  episodeId: string;
  isHighlighted: boolean;
  isCurrentEpisode: boolean;
  onReply: (comment: EpisodeComment) => void;
  onSeek: (seconds: number) => void;
}

function CommentRow({ comment, isReply = false, accentColor, episodeId, isHighlighted, isCurrentEpisode, onReply, onSeek }: CommentRowProps) {
  const displayName = comment.profile?.display_name || 'Anonymous';
  const initial = displayName.charAt(0).toUpperCase();
  const avatarSize = isReply ? 28 : 36;
  const toggleLike = useToggleCommentLike();

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'flex-start',
      paddingLeft: isReply ? 52 : 16, paddingRight: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
      backgroundColor: isHighlighted ? 'rgba(255,255,255,0.06)' : 'transparent',
    }}>
      <TouchableOpacity
        onPress={() => comment.user_id && navigate('PublicProfile', { userId: comment.user_id })}
        style={{
          width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2,
          backgroundColor: '#2A2A2A', overflow: 'hidden',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
        {comment.profile?.avatar_url ? (
          <Image source={{ uri: comment.profile.avatar_url }} style={{ width: avatarSize, height: avatarSize }} contentFit="cover" />
        ) : (
          <Text style={{ color: '#fff', fontSize: isReply ? 11 : 13, fontWeight: '700' }}>{initial}</Text>
        )}
      </TouchableOpacity>

      <View style={{ flex: 1, marginLeft: 10 }}>
        {/* Name + timestamp chip */}
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{displayName}</Text>
          <Text style={{ color: '#555', fontSize: 12 }}>·</Text>
          <Text style={{ color: '#555', fontSize: 12 }}>{timeAgo(comment.created_at)}</Text>
          {comment.timestamp_seconds != null && (
            <TouchableOpacity
              onPress={() => isCurrentEpisode && onSeek(comment.timestamp_seconds!)}
              style={{
                backgroundColor: hexToRgba(accentColor, 0.15),
                borderWidth: 1,
                borderColor: hexToRgba(accentColor, 0.3),
                borderRadius: 4,
                paddingHorizontal: 6,
                paddingVertical: 2,
              }}
            >
              <Text style={{ color: accentColor, fontSize: 11, fontWeight: '600' }}>
                {formatTime(comment.timestamp_seconds)}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Comment text */}
        {renderCommentContent(comment.content, accentColor)}

        {/* Actions */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
          <TouchableOpacity
            onPress={() => toggleLike.mutate({ commentId: comment.id, episodeId, isLiked: comment.is_liked, commentAuthorId: comment.user_id })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Ionicons name={comment.is_liked ? 'heart' : 'heart-outline'} size={16}
              color={comment.is_liked ? '#e11d48' : '#555'} />
            {comment.like_count > 0 && (
              <Text style={{ color: comment.is_liked ? '#e11d48' : '#555', fontSize: 12 }}>{comment.like_count}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onReply(comment)}>
            <Text style={{ color: '#555', fontSize: 12, fontWeight: '600' }}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface RouteParams {
  episodeId: string;
  scrollTo?: 'top' | 'comments' | string;
  autoplay?: boolean;
  highlight?: boolean;
}

export default function NowPlayingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { episodeId, scrollTo = 'top', autoplay = true, highlight = false } = route.params as RouteParams;
  const insets = useSafeAreaInsets();

  const {
    currentEpisode, isPlaying, isLoading: playerLoading,
    progress, togglePlayPause, seekTo, skipForward, skipBack,
    setMiniPlayerVisible, playEpisode,
  } = usePlayer();

  const { data: episode } = useEpisode(episodeId);
  const { data: allComments = [], isLoading: commentsLoading } = useEpisodeComments(episodeId);
  const { data: commentCount = 0 } = useEpisodeCommentCount(episodeId);
  const { data: profile } = useProfile();
  const addComment = useAddEpisodeComment();
  const addToQueue = useAddToQueue();

  const flatListRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const [trackWidth, setTrackWidth] = useState(1);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string; userId: string } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const isCurrentEpisode = currentEpisode?.id === episodeId;

  // Derived display values — prefer live player data, fall back to fetched episode
  const title = currentEpisode?.title || episode?.title || '';
  const showTitle = currentEpisode?.showTitle || episode?.shows?.title || '';
  const artworkUrl = currentEpisode?.artworkUrl || episode?.artwork_url || null;
  const accentColor = currentEpisode?.teamColor || episode?.shows?.teams?.primary_color || '#fff';
  const progressPercent = isCurrentEpisode && progress.duration > 0
    ? Math.min(1, progress.position / progress.duration) : 0;

  // Hide mini player while this screen is focused
  useFocusEffect(useCallback(() => {
    setMiniPlayerVisible(false);
    return () => setMiniPlayerVisible(true);
  }, [setMiniPlayerVisible]));

  // Auto-play if needed
  useEffect(() => {
    if (!isCurrentEpisode && autoplay && episode) {
      playEpisode({
        id: episode.id,
        title: episode.title,
        showTitle: episode.shows?.title || '',
        artworkUrl: episode.artwork_url || undefined,
        audioUrl: episode.audio_url,
        durationSeconds: episode.duration_seconds || undefined,
        teamColor: episode.shows?.teams?.primary_color || undefined,
        showId: episode.show_id,
      });
    }
  }, [episode?.id, autoplay]);

  // scrollTo handling after comments load
  useEffect(() => {
    if (commentsLoading || allComments.length === 0) return;
    if (scrollTo === 'top' || scrollTo === 'comments') return;
    // scrollTo is a commentId
    const topLevel = allComments.filter(c => !c.parent_id);
    const idx = topLevel.findIndex(c => c.id === scrollTo);
    if (idx >= 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0 });
      }, 400);
      if (highlight) {
        setHighlightedCommentId(scrollTo);
        setTimeout(() => setHighlightedCommentId(null), 2000);
      }
    }
  }, [commentsLoading, scrollTo, allComments.length]);

  const topLevel = useMemo(() => allComments.filter(c => !c.parent_id), [allComments]);
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
      .map(c => c.profile?.display_name)
      .filter((n): n is string => !!n && !seen.has(n) && !!seen.add(n));
  }, [allComments]);

  const mentionSuggestions = mentionQuery !== null
    ? commenters.filter(n => n.toLowerCase().includes(mentionQuery))
    : [];

  const handleSeek = (locationX: number) => {
    if (!isCurrentEpisode || trackWidth <= 0) return;
    const position = Math.max(0, Math.min(1, locationX / trackWidth)) * progress.duration;
    seekTo(position);
  };

  const handleTextChange = (text: string) => {
    setCommentText(text);
    const lastWord = text.split(/\s/).pop() ?? '';
    setMentionQuery(lastWord.startsWith('@') ? lastWord.slice(1).toLowerCase() : null);
  };

  const insertMention = (name: string) => {
    const words = commentText.split(/\s/);
    words[words.length - 1] = `@${name} `;
    setCommentText(words.join(' '));
    setMentionQuery(null);
  };

  const startReply = (parent: EpisodeComment) => {
    const name = parent.profile?.display_name || 'User';
    setReplyingTo({ id: parent.id, name, userId: parent.user_id });
    setCommentText(`@${name} `);
    setMentionQuery(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const cancelReply = () => { setReplyingTo(null); setCommentText(''); };

  const handleSubmit = async () => {
    if (!commentText.trim()) return;
    await addComment.mutateAsync({
      episodeId,
      content: commentText,
      parentId: replyingTo?.id,
      parentCommentUserId: replyingTo?.userId,
      timestampSeconds: isCurrentEpisode ? progress.position : undefined,
    });
    if (replyingTo) {
      setExpandedReplies(prev => new Set([...prev, replyingTo.id]));
    }
    setCommentText('');
    setReplyingTo(null);
    setMentionQuery(null);
  };

  const handleShare = () => Share.share({ message: `${title} — ${showTitle}` });

  // ── Render comment item ──
  const renderComment = useCallback(({ item }: { item: EpisodeComment }) => {
    const replies = repliesMap.get(item.id) ?? [];
    const isExpanded = expandedReplies.has(item.id);
    return (
      <View>
        <CommentRow
          comment={item}
          accentColor={accentColor}
          episodeId={episodeId}
          isHighlighted={highlightedCommentId === item.id}
          isCurrentEpisode={isCurrentEpisode}
          onReply={startReply}
          onSeek={seekTo}
        />
        {replies.length > 0 && (
          <TouchableOpacity
            onPress={() => setExpandedReplies(prev => {
              const next = new Set(prev);
              next.has(item.id) ? next.delete(item.id) : next.add(item.id);
              return next;
            })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 62, paddingVertical: 8 }}
          >
            <View style={{ width: 20, height: 1, backgroundColor: '#333' }} />
            <Text style={{ color: '#666', fontSize: 12, fontWeight: '600' }}>
              {isExpanded ? 'Hide replies' : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
            </Text>
          </TouchableOpacity>
        )}
        {isExpanded && replies.map(r => (
          <CommentRow
            key={r.id}
            comment={r}
            isReply
            accentColor={accentColor}
            episodeId={episodeId}
            isHighlighted={highlightedCommentId === r.id}
            isCurrentEpisode={isCurrentEpisode}
            onReply={() => startReply(item)}
            onSeek={seekTo}
          />
        ))}
      </View>
    );
  }, [repliesMap, expandedReplies, accentColor, highlightedCommentId, isCurrentEpisode]);

  const dotLeft = trackWidth * progressPercent;

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >

        {/* ── Header ── */}
        <View style={{
          paddingTop: insets.top + 8,
          height: insets.top + 56,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 12,
          backgroundColor: '#0A0A0A', borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
        }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={{ color: '#888', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Now Playing
          </Text>
          <TouchableOpacity
            onPress={() => setShowOptions(true)}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* ── Player Section (sticky) ── */}
        <View style={{
          backgroundColor: '#0A0A0A',
          borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
          paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16,
        }}>
          {/* Artwork + title row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 80, height: 80, borderRadius: 10, overflow: 'hidden', backgroundColor: '#1A1A1A', flexShrink: 0 }}>
              {artworkUrl ? (
                <Image source={{ uri: artworkUrl }} style={{ width: 80, height: 80 }} contentFit="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="mic" size={30} color="#555" />
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 20 }} numberOfLines={2}>
                {title || 'Loading...'}
              </Text>
              <Text style={{ color: '#888', fontSize: 13, fontWeight: '500', marginTop: 4 }} numberOfLines={1}>
                {showTitle}
              </Text>
            </View>
          </View>

          {/* Scrubber */}
          <View style={{ marginTop: 16 }}>
            <View
              style={{ height: 3, backgroundColor: '#2A2A2A', borderRadius: 2, marginBottom: 6, position: 'relative' }}
              onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}
              onStartShouldSetResponder={() => true}
              onResponderRelease={e => handleSeek(e.nativeEvent.locationX)}
              onResponderMove={e => handleSeek(e.nativeEvent.locationX)}
            >
              <View style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: dotLeft, backgroundColor: '#fff', borderRadius: 2,
              }} />
              <View style={{
                position: 'absolute', top: -5,
                left: Math.max(0, dotLeft - 7),
                width: 14, height: 14, borderRadius: 7,
                backgroundColor: '#fff',
              }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#888', fontSize: 12 }}>
                {isCurrentEpisode ? formatTime(progress.position) : '0:00'}
              </Text>
              <Text style={{ color: '#888', fontSize: 12 }}>
                {isCurrentEpisode && progress.duration > 0
                  ? `-${formatTime(Math.max(0, progress.duration - progress.position))}`
                  : episode?.duration_seconds ? formatTime(episode.duration_seconds) : '--:--'}
              </Text>
            </View>
          </View>

          {/* Controls */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingHorizontal: 8 }}>
            <TouchableOpacity onPress={() => isCurrentEpisode && skipBack()}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-undo" size={28} color={isCurrentEpisode ? '#fff' : '#555'} />
              <Text style={{ color: isCurrentEpisode ? '#888' : '#444', fontSize: 10, marginTop: 1 }}>15</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (isCurrentEpisode) {
                  togglePlayPause();
                } else if (episode) {
                  playEpisode({
                    id: episode.id,
                    title: episode.title,
                    showTitle: episode.shows?.title || '',
                    artworkUrl: episode.artwork_url || undefined,
                    audioUrl: episode.audio_url,
                    durationSeconds: episode.duration_seconds || undefined,
                    teamColor: episode.shows?.teams?.primary_color || undefined,
                    showId: episode.show_id,
                  });
                }
              }}
              style={{
                width: 52, height: 52, borderRadius: 26,
                backgroundColor: '#fff',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              {playerLoading && isCurrentEpisode ? (
                <ActivityIndicator size="small" color="#000" />
              ) : (
                <Ionicons
                  name={isCurrentEpisode && isPlaying ? 'pause' : 'play'}
                  size={24} color="#000"
                  style={{ marginLeft: isCurrentEpisode && isPlaying ? 0 : 2 }}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => isCurrentEpisode && skipForward()}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-redo" size={28} color={isCurrentEpisode ? '#fff' : '#555'} />
              <Text style={{ color: isCurrentEpisode ? '#888' : '#444', fontSize: 10, marginTop: 1 }}>30</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleShare}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="share-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Comments Header (sticky) ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 12,
          backgroundColor: '#0A0A0A', borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
        }}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Comments</Text>
          {commentCount > 0 && (
            <Text style={{ color: '#555', fontSize: 14, fontWeight: '500', marginLeft: 6 }}>· {commentCount}</Text>
          )}
        </View>

        {/* ── Comments List ── */}
        {mentionSuggestions.length > 0 && (
          <View style={{ backgroundColor: '#1A1A1A', borderBottomWidth: 1, borderBottomColor: '#2A2A2A', maxHeight: 120 }}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {mentionSuggestions.map(name => (
                <TouchableOpacity key={name} onPress={() => insertMention(name)}
                  style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}>
                  <Text style={{ color: '#fff', fontSize: 14 }}>@{name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        <FlatList
          ref={flatListRef}
          data={topLevel}
          keyExtractor={item => item.id}
          renderItem={renderComment}
          style={{ flex: 1, backgroundColor: '#0A0A0A' }}
          keyboardShouldPersistTaps="handled"
          onScrollToIndexFailed={() => {}}
          ListEmptyComponent={
            commentsLoading
              ? <ActivityIndicator color="#555" style={{ marginTop: 40 }} />
              : (
                <View style={{ alignItems: 'center', paddingVertical: 60 }}>
                  <Ionicons name="chatbubble-outline" size={36} color="#2A2A2A" style={{ marginBottom: 12 }} />
                  <Text style={{ color: '#555', fontSize: 15 }}>No comments yet</Text>
                  <Text style={{ color: '#444', fontSize: 13, marginTop: 4 }}>Be the first to share your take</Text>
                </View>
              )
          }
          contentContainerStyle={{ paddingBottom: 8 }}
        />

        {/* ── Reply banner ── */}
        {replyingTo && (
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#1A1A1A',
            borderTopWidth: 1, borderTopColor: '#2A2A2A',
          }}>
            <Text style={{ color: '#888', fontSize: 13 }}>
              Replying to <Text style={{ color: accentColor, fontWeight: '600' }}>@{replyingTo.name}</Text>
            </Text>
            <TouchableOpacity onPress={cancelReply}>
              <Ionicons name="close" size={16} color="#888" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Comment Input ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 16, paddingTop: 10,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 16,
          borderTopWidth: 1, borderTopColor: '#1A1A1A',
          backgroundColor: '#0A0A0A',
        }}>
          <View style={{
            width: 28, height: 28, borderRadius: 14,
            backgroundColor: '#2A2A2A', overflow: 'hidden',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={{ width: 28, height: 28 }} contentFit="cover" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                {(profile?.display_name || 'U').charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <TextInput
            ref={inputRef}
            value={commentText}
            onChangeText={handleTextChange}
            placeholder={replyingTo ? `Reply to @${replyingTo.name}...` : 'Add a comment...'}
            placeholderTextColor="#555"
            style={{
              flex: 1, backgroundColor: '#1A1A1A', borderRadius: 20,
              paddingHorizontal: 14, paddingVertical: 10,
              color: '#fff', fontSize: 14,
            }}
            returnKeyType="send"
            onSubmitEditing={handleSubmit}
          />
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!commentText.trim() || addComment.isPending}
            style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: commentText.trim() ? '#fff' : '#2A2A2A',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="arrow-forward" size={16} color={commentText.trim() ? '#000' : '#fff'} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Options Modal ── */}
      <Modal visible={showOptions} transparent animationType="fade" onRequestClose={() => setShowOptions(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
          activeOpacity={1} onPress={() => setShowOptions(false)} />
        <View style={{
          backgroundColor: '#1A1A1A', borderTopLeftRadius: 20, borderTopRightRadius: 20,
          paddingTop: 20, paddingBottom: insets.bottom + 16,
        }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#444', alignSelf: 'center', marginBottom: 16 }} />
          {[
            { icon: 'share-social-outline', label: 'Share Episode', onPress: () => { setShowOptions(false); handleShare(); } },
            { icon: 'list-outline', label: 'Add to Queue', onPress: () => { addToQueue.mutate(episodeId); setShowOptions(false); } },
            { icon: 'radio-outline', label: 'Go to Show', onPress: () => {
              setShowOptions(false);
              const showId = episode?.show_id;
              if (showId) setTimeout(() => navigation.navigate('ShowDetail', { showId }), 300);
            }},
            { icon: 'document-text-outline', label: 'Go to Episode', onPress: () => {
              setShowOptions(false);
              setTimeout(() => navigation.navigate('EpisodeDetail', { episodeId }), 300);
            }},
          ].map((item, i) => (
            <TouchableOpacity key={i} onPress={item.onPress}
              style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: 24, paddingVertical: 16,
                borderTopWidth: i === 0 ? 0 : 1, borderTopColor: '#2A2A2A',
              }}>
              <Ionicons name={item.icon as any} size={22} color="#888" style={{ marginRight: 16 }} />
              <Text style={{ color: '#fff', fontSize: 15 }}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Modal>
    </View>
  );
}
