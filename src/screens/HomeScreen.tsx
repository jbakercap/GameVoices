import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal, ScrollView,
  TextInput, KeyboardAvoidingView, Platform, Share, ActivityIndicator,
  Dimensions, RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../contexts/PlayerContext';
import { useUserTeams } from '../hooks/useUserTeams';
import { useTeamsBySlug } from '../hooks/useTeamsBySlug';
import { useRecentTeamEpisodes, RecentEpisode } from '../hooks/useRecentTeamEpisodes';
import { useRecentGames } from '../hooks/useRecentGames';
import { TeamPickerModal } from '../components/TeamPickerModal';
import { formatDurationHuman } from '../lib/formatters';
import { useProfile } from '../hooks/useProfile';
import { useAuth } from '../contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAddToQueue } from '../hooks/mutations/useAddToQueue';
import { useSaveEpisode } from '../hooks/mutations/useSaveEpisode';
import { useEpisodeLikes, useIsEpisodeLiked } from '../hooks/queries/useEpisodeLikes';
import { useToggleEpisodeLike } from '../hooks/mutations/useToggleEpisodeLike';
import { useEpisodeComments, useEpisodeCommentCount, EpisodeComment } from '../hooks/queries/useEpisodeComments';
import { useAddEpisodeComment } from '../hooks/mutations/useAddEpisodeComment';
import { useToggleCommentLike } from '../hooks/mutations/useToggleCommentLike';
import { formatRelativeDate } from '../lib/formatters';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shareEpisode(episode: RecentEpisode) {
  const show = episode.show_title || 'GameVoices';
  const duration = episode.duration ? ` · ${formatDurationHuman(episode.duration)}` : '';
  Share.share({
    title: episode.title,
    message: `🎙️ ${episode.title}\n${show}${duration}\n\nListen on GameVoices`,
  });
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const hrs = Math.floor(diffMs / 3_600_000);
  if (hrs < 1) return 'now';
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}


function darkenColor(hex: string, amount = 0.2): string {
  const cleaned = hex.replace('#', '');
  if (cleaned.length !== 6) return '#1E2A3A';
  const num = parseInt(cleaned, 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.floor(((num >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.floor((num & 0xff) * (1 - amount)));
  return `rgb(${r},${g},${b})`;
}


// ─── Compact Scoreboard ───────────────────────────────────────────────────────

function CompactScoreboard({ teamSlugs }: { teamSlugs: string[] }) {
  const { data: games, isLoading } = useRecentGames(teamSlugs);
  if (isLoading || !games || games.length === 0) return null;

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: '#222' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {games.map((game, i) => {
          const followedIsHome = game.followedTeamSlug === game.home_team_slug;
          const myTeam = followedIsHome ? game.homeTeam : game.awayTeam;
          const oppTeam = followedIsHome ? game.awayTeam : game.homeTeam;
          const myScore = followedIsHome ? game.home_score : game.away_score;
          const oppScore = followedIsHome ? game.away_score : game.home_score;
          const myWon = myScore > oppScore;
          const date = game.event_date
            ? new Date(game.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
            : '';

          return (
            <View
              key={game.id}
              style={{
                borderRightWidth: i < games.length - 1 ? 1 : 0,
                borderRightColor: '#222',
                paddingHorizontal: 16,
                paddingVertical: 10,
                minWidth: 155,
              }}
            >
              <Text style={{ color: '#555', fontSize: 10, fontWeight: '600', marginBottom: 6 }}>
                FINAL · {date}
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                <View style={{
                  width: 20, height: 20, borderRadius: 10,
                  backgroundColor: myTeam?.primary_color || '#333',
                  alignItems: 'center', justifyContent: 'center', marginRight: 8,
                }}>
                  {myTeam?.logo_url ? (
                    <Image source={{ uri: myTeam.logo_url }} style={{ width: 14, height: 14 }} contentFit="contain" />
                  ) : (
                    <Text style={{ color: '#fff', fontSize: 8, fontWeight: 'bold' }}>
                      {myTeam?.short_name?.slice(0, 2) || '?'}
                    </Text>
                  )}
                </View>
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', flex: 1 }}>
                  {myTeam?.short_name || '—'}
                </Text>
                <Text style={{ color: myWon ? '#fff' : '#555', fontSize: 13, fontWeight: myWon ? '800' : '400' }}>
                  {myScore}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  width: 20, height: 20, borderRadius: 10,
                  backgroundColor: oppTeam?.primary_color || '#333',
                  alignItems: 'center', justifyContent: 'center', marginRight: 8,
                }}>
                  {oppTeam?.logo_url ? (
                    <Image source={{ uri: oppTeam.logo_url }} style={{ width: 14, height: 14 }} contentFit="contain" />
                  ) : (
                    <Text style={{ color: '#fff', fontSize: 8, fontWeight: 'bold' }}>
                      {oppTeam?.short_name?.slice(0, 2) || '?'}
                    </Text>
                  )}
                </View>
                <Text style={{ color: '#777', fontSize: 13, flex: 1 }}>
                  {oppTeam?.short_name || '—'}
                </Text>
                <Text style={{ color: myWon ? '#555' : '#fff', fontSize: 13, fontWeight: myWon ? '400' : '800' }}>
                  {oppScore}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Episode Card (iMessage music share style) ────────────────────────────────

interface EpisodeCardProps {
  episode: RecentEpisode;
  teamColor: string;
  isCurrentlyPlaying: boolean;
  isPlaying: boolean;
  onPress: () => void;
  compact?: boolean;
}

function EpisodeCard({ episode, teamColor, isCurrentlyPlaying, isPlaying, onPress, compact }: EpisodeCardProps) {
  const artwork = episode.artwork_url || episode.show_artwork_url;
  const artSize = compact ? 48 : 56;

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={{ borderRadius: 14, overflow: 'hidden' }}
    >
      <LinearGradient
        colors={[darkenColor(teamColor, 0.55), darkenColor(teamColor, 0.05)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 10, gap: 12 }}
      >
      {/* Podcast artwork */}
      <View style={{
        width: artSize, height: artSize, borderRadius: 9,
        backgroundColor: 'rgba(0,0,0,0.3)',
        overflow: 'hidden', flexShrink: 0,
      }}>
        {artwork ? (
          <Image source={{ uri: artwork }} style={{ width: artSize, height: artSize }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="mic" size={22} color="rgba(255,255,255,0.4)" />
          </View>
        )}
      </View>

      {/* Title + duration */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: compact ? 13 : 14, fontWeight: '700', lineHeight: 19 }} numberOfLines={2}>
          {episode.title}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 3 }}>
          {formatDurationHuman(episode.duration_seconds)}
        </Text>
      </View>

      {/* Play / Pause */}
      <View style={{
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Ionicons
          name={isCurrentlyPlaying && isPlaying ? 'pause' : 'play'}
          size={17} color="#fff"
          style={{ marginLeft: isCurrentlyPlaying && isPlaying ? 0 : 2 }}
        />
      </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

// ─── Three-Dots Menu ──────────────────────────────────────────────────────────

interface EpisodeMenuProps {
  episode: RecentEpisode;
  visible: boolean;
  onClose: () => void;
  onNavigate?: (screen: string, params: any) => void;
}

function EpisodeMenu({ episode, visible, onClose, onNavigate }: EpisodeMenuProps) {
  const addToQueue = useAddToQueue();
  const saveEpisode = useSaveEpisode();

  const items = [
    {
      icon: 'radio-outline' as const,
      label: 'Go to Episode',
      onPress: () => { onClose(); onNavigate?.('EpisodeDetail', { episodeId: episode.id }); },
    },
    {
      icon: 'share-social-outline' as const,
      label: 'Share Episode',
      onPress: () => { onClose(); shareEpisode(episode); },
    },
    {
      icon: 'list-outline' as const,
      label: 'Add to Queue',
      onPress: () => { addToQueue.mutate(episode.id); onClose(); },
    },
    {
      icon: 'musical-notes-outline' as const,
      label: 'Add to Playlist',
      onPress: () => { onClose(); },
    },
    {
      icon: 'bookmark-outline' as const,
      label: 'Save Episode',
      onPress: () => { saveEpisode.mutate({ episodeId: episode.id, isSaved: false }); onClose(); },
    },
    {
      icon: 'radio-outline' as const,
      label: 'Go to Show',
      onPress: () => { onClose(); onNavigate?.('ShowDetail', { showId: episode.show_id }); },
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1}>
          <View style={{ backgroundColor: '#1E1E1E', borderRadius: 16, width: 280, overflow: 'hidden' }}>
            {items.map((item, i) => (
              <TouchableOpacity
                key={i}
                onPress={item.onPress}
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

// ─── Comment Row ─────────────────────────────────────────────────────────────

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

interface CommentRowProps {
  comment: EpisodeComment;
  isReply?: boolean;
  teamColor: string;
  episodeId: string;
  onReply: () => void;
}

function CommentRow({ comment, isReply = false, teamColor, episodeId, onReply }: CommentRowProps) {
  const displayName = comment.profile?.display_name || 'Anonymous';
  const initial = displayName.charAt(0).toUpperCase();
  const avatarSize = isReply ? 28 : 36;
  const toggleLike = useToggleCommentLike();

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'flex-start', gap: 10,
      paddingLeft: isReply ? 52 : 16, paddingRight: 16, paddingVertical: 10,
    }}>
      {/* Avatar */}
      <View style={{
        width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2,
        backgroundColor: '#2A2A2A', overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {comment.profile?.avatar_url ? (
          <Image source={{ uri: comment.profile.avatar_url }} style={{ width: avatarSize, height: avatarSize }} contentFit="cover" />
        ) : (
          <Text style={{ color: '#fff', fontSize: isReply ? 11 : 14, fontWeight: '700' }}>{initial}</Text>
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{displayName}</Text>
          <Text style={{ color: '#555', fontSize: 12 }}>{timeAgo(comment.created_at)}</Text>
        </View>
        {renderCommentContent(comment.content, teamColor)}

        {/* Reply button */}
        <TouchableOpacity onPress={onReply} style={{ marginTop: 6 }}>
          <Text style={{ color: '#555', fontSize: 12, fontWeight: '600' }}>Reply</Text>
        </TouchableOpacity>
      </View>

      {/* Like button */}
      <TouchableOpacity
        onPress={() => toggleLike.mutate({ commentId: comment.id, episodeId, isLiked: comment.is_liked })}
        style={{ alignItems: 'center', gap: 2, paddingTop: 2 }}
      >
        <Ionicons
          name={comment.is_liked ? 'heart' : 'heart-outline'}
          size={18}
          color={comment.is_liked ? '#e11d48' : '#555'}
        />
        {comment.like_count > 0 && (
          <Text style={{ color: comment.is_liked ? '#e11d48' : '#555', fontSize: 11 }}>
            {comment.like_count}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Comments Sheet ───────────────────────────────────────────────────────────

interface CommentsSheetProps {
  episode: RecentEpisode | null;
  teamColor: string;
  visible: boolean;
  onClose: () => void;
}

function CommentsSheet({ episode, teamColor, visible, onClose }: CommentsSheetProps) {
  const [comment, setComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; name: string } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);

  const { data: allComments = [], isLoading: commentsLoading } = useEpisodeComments(episode?.id ?? '');
  const addComment = useAddEpisodeComment();

  // Build threaded structure (must be before early return to respect hooks order)
  const topLevel = useMemo(() => allComments.filter((c) => !c.parent_id), [allComments]);
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

  // Unique commenters for @mention autocomplete
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
    setReplyingTo({ id: parentComment.id, name });
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
    });
    // Auto-expand the thread we just replied to
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

  const SHEET_HEIGHT = Dimensions.get('window').height * 0.75;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} presentationStyle="overFullScreen" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <TouchableOpacity
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          activeOpacity={1}
          onPress={onClose}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{
            backgroundColor: '#121212',
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            height: SHEET_HEIGHT,
          }}>
            {/* Drag handle */}
            <View style={{
              width: 36, height: 4, borderRadius: 2,
              backgroundColor: '#444', alignSelf: 'center',
              marginTop: 12, marginBottom: 16,
            }} />

            {/* Header */}
            <Text style={{
              color: '#fff', fontSize: 18, fontWeight: '700',
              paddingHorizontal: 20, marginBottom: 12,
            }}>
              Comments{allComments.length > 0 ? ` (${allComments.length})` : ''}
            </Text>

            <View style={{ height: 1, backgroundColor: '#1A1A1A' }} />

            {/* Comments list */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
            >
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
                      />
                      {/* Replies toggle */}
                      {replies.length > 0 && (
                        <TouchableOpacity
                          onPress={() => toggleReplies(c.id)}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 62, paddingBottom: 8 }}
                        >
                          <View style={{ width: 20, height: 1, backgroundColor: '#444' }} />
                          <Text style={{ color: '#888', fontSize: 12, fontWeight: '600' }}>
                            {isExpanded ? 'Hide replies' : `View ${replies.length} ${replies.length === 1 ? 'reply' : 'replies'}`}
                          </Text>
                        </TouchableOpacity>
                      )}
                      {/* Replies */}
                      {isExpanded && replies.map((r) => (
                        <CommentRow
                          key={r.id}
                          comment={r}
                          isReply
                          teamColor={teamColor}
                          episodeId={episode.id}
                          onReply={() => startReply(c)}
                        />
                      ))}
                      <View style={{ height: 1, backgroundColor: '#1A1A1A', marginHorizontal: 16 }} />
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* @mention autocomplete */}
            {mentionSuggestions.length > 0 && (
              <View style={{
                backgroundColor: '#1E1E1E', borderTopWidth: 1, borderTopColor: '#2A2A2A',
                maxHeight: 120,
              }}>
                <ScrollView keyboardShouldPersistTaps="handled">
                  {mentionSuggestions.map((name) => (
                    <TouchableOpacity
                      key={name}
                      onPress={() => insertMention(name)}
                      style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}
                    >
                      <Text style={{ color: '#fff', fontSize: 14 }}>@{name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Replying-to banner */}
            {replyingTo && (
              <View style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 16, paddingVertical: 8,
                backgroundColor: '#1A1A1A',
              }}>
                <Text style={{ color: '#888', fontSize: 13 }}>
                  Replying to <Text style={{ color: teamColor, fontWeight: '600' }}>@{replyingTo.name}</Text>
                </Text>
                <TouchableOpacity onPress={cancelReply}>
                  <Ionicons name="close" size={16} color="#888" />
                </TouchableOpacity>
              </View>
            )}

            {/* Comment input */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              paddingHorizontal: 16, paddingTop: 12, paddingBottom: 34,
              borderTopWidth: 1, borderTopColor: '#1A1A1A',
              backgroundColor: '#121212',
            }}>
              <TextInput
                ref={inputRef}
                value={comment}
                onChangeText={handleTextChange}
                placeholder={replyingTo ? `Reply to @${replyingTo.name}...` : 'Add a comment...'}
                placeholderTextColor="#555"
                style={{
                  flex: 1, backgroundColor: '#1E1E1E', borderRadius: 20,
                  paddingHorizontal: 16, paddingVertical: 10,
                  color: '#fff', fontSize: 14,
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
  episode: RecentEpisode;
  teamColor: string;
  onOpenComments: (episode: RecentEpisode, color: string) => void;
  onNavigate?: (screen: string, params: any) => void;
}

function EpisodeFeedPost({ episode, teamColor, onOpenComments, onNavigate }: EpisodeFeedPostProps) {
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
    <View style={{ borderBottomWidth: 1, borderBottomColor: '#1A1A1A', paddingVertical: 14 }}>

      {/* Post header */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16 }}>
        {/* Show avatar */}
        <TouchableOpacity
          onPress={() => onNavigate?.('ShowDetail', { showId: episode.show_id })}
          style={{ marginRight: 12, marginTop: 2 }}
        >
          <View style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: teamColor,
            overflow: 'hidden',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {episode.show_artwork_url ? (
              <Image source={{ uri: episode.show_artwork_url }} style={{ width: 44, height: 44 }} contentFit="cover" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>
                {(episode.show_title || 'S').charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Show name + handle + time */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }} numberOfLines={1}>
              {episode.show_title || 'Unknown Show'}
            </Text>
            <Text style={{ color: '#555', fontSize: 13 }}>·</Text>
            <Text style={{ color: '#555', fontSize: 13 }}>{timeAgo(episode.published_at)}</Text>
          </View>
        </View>

        {/* Three dots */}
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ paddingLeft: 8, paddingTop: 2 }}
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
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 20, marginTop: 12,
      }}>
        {/* Like */}
        <TouchableOpacity
          onPress={() => toggleLike.mutate({ episodeId: episode.id, isLiked })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 24 }}
        >
          <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={22} color={isLiked ? '#e11d48' : '#555'} />
          {likeCount > 0 && (
            <Text style={{ color: isLiked ? '#e11d48' : '#555', fontSize: 14 }}>{likeCount}</Text>
          )}
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity
          onPress={() => onOpenComments(episode, teamColor)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
        >
          <Ionicons name="chatbubble-outline" size={21} color="#555" />
          {commentCount > 0 && (
            <Text style={{ color: '#555', fontSize: 14 }}>{commentCount}</Text>
          )}
        </TouchableOpacity>

        {/* Share — pushed to right */}
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <TouchableOpacity
            onPress={() => shareEpisode(episode)}
          >
            <Ionicons name="share-outline" size={22} color="#555" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Three-dots menu modal */}
      <EpisodeMenu
        episode={episode}
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNavigate={onNavigate}
      />
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function FeedEmpty({ hasTeams, onFollowTeams }: { hasTeams: boolean; onFollowTeams: () => void }) {
  if (!hasTeams) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32 }}>
        <View style={{
          width: 72, height: 72, borderRadius: 36,
          backgroundColor: '#1E1E1E', alignItems: 'center', justifyContent: 'center',
          marginBottom: 20,
        }}>
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
          style={{
            backgroundColor: '#fff', paddingHorizontal: 28, paddingVertical: 14,
            borderRadius: 24,
          }}
        >
          <Text style={{ color: '#000', fontSize: 15, fontWeight: '700' }}>Choose Teams</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32 }}>
      <View style={{
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: '#1E1E1E', alignItems: 'center', justifyContent: 'center',
        marginBottom: 20,
      }}>
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
  const { data: episodes = [], isLoading: feedLoading } = useRecentTeamEpisodes(teamSlugs);

  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [commentsEpisode, setCommentsEpisode] = useState<RecentEpisode | null>(null);
  const [commentsColor, setCommentsColor] = useState('#333');
  const [refreshing, setRefreshing] = useState(false);

  // team slug → primary color
  const teamColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const team of userTeams) {
      if (team.primary_color) map[team.slug] = team.primary_color;
    }
    return map;
  }, [userTeams]);

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

  const handleOpenComments = useCallback((episode: RecentEpisode, color: string) => {
    setCommentsEpisode(episode);
    setCommentsColor(color);
  }, []);

  const renderPost = useCallback(({ item }: { item: RecentEpisode }) => {
    const teamColor = teamColorMap[item.team_slug || ''] || '#1E2A3A';
    return (
      <EpisodeFeedPost
        episode={item}
        teamColor={teamColor}
        onOpenComments={handleOpenComments}
        onNavigate={onNavigate}
      />
    );
  }, [teamColorMap, handleOpenComments, onNavigate]);

  const ListHeader = useMemo(() => (
    <CompactScoreboard teamSlugs={teamSlugs} />
  ), [teamSlugs]);

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

      {/* ── Sticky team picker ── */}
      <View style={{
        paddingTop: 56, paddingBottom: 10, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#121212',
        borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
      }}>
        <TouchableOpacity
          onPress={() => setTeamPickerOpen(true)}
          style={{
            width: 42, height: 42, borderRadius: 12,
            backgroundColor: '#1E1E1E',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="options-outline" size={20} color="#fff" />
        </TouchableOpacity>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {(teams || []).map((team) => (
            <TouchableOpacity
              key={team.id}
              onPress={() => onNavigate?.('TeamDetail', { teamSlug: team.slug })}
              style={{
                width: 46, height: 46, borderRadius: 23,
                backgroundColor: '#fff', overflow: 'hidden',
                borderWidth: 3, borderColor: team.primary_color || '#333',
                alignItems: 'center', justifyContent: 'center',
              }}
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
      </View>

      {/* ── Social feed ── */}
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
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#fff"
            colors={['#fff']}
          />
        }
      />
    </View>
  );
}
