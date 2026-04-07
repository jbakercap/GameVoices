import React, {
  useState, useRef, useCallback, useEffect, useMemo,
} from 'react';
import {
  View, Text, TouchableOpacity, FlatList, Dimensions,
  ActivityIndicator, Linking, StyleSheet, ViewToken,
  StatusBar as RNStatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useNavigation } from '@react-navigation/native';
import { useWatchXVideos, WatchVideoPost } from '../hooks/queries/useWatchXVideos';
import { useUserTeams } from '../hooks/useUserTeams';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useQuery } from '@tanstack/react-query';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Full screen height accounting for status bar so snap is pixel-perfect
const ITEM_HEIGHT = SCREEN_H;

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoClip {
  id: string;
  title: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  team_id: string | null;
  player_id: string | null;
  sort_order: number | null;
  created_by: string | null;
  created_at: string | null;
  teams: { short_name: string; logo_url: string | null; slug: string } | null;
  players: { name: string; slug: string } | null;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useVideoClips() {
  return useQuery({
    queryKey: ['watch-clips'],
    queryFn: async (): Promise<VideoClip[]> => {
      const { data, error } = await supabase
        .from('video_clips')
        .select('id, title, video_url, thumbnail_url, caption, team_id, player_id, sort_order, created_by, created_at, teams(short_name, logo_url, slug), players(name, slug)')
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as unknown as VideoClip[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// ─── Single video card (self-contained player) ────────────────────────────────

interface VideoCardProps {
  videoUrl: string;
  thumbnailUrl?: string | null;
  isActive: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
  overlay: React.ReactNode;
  topOverlay?: React.ReactNode;
}

function VideoCard({
  videoUrl, thumbnailUrl, isActive, isMuted, onMuteToggle, overlay, topOverlay,
}: VideoCardProps) {
  const [ended, setEnded] = useState(false);
  const [ready, setReady] = useState(false);

  const player = useVideoPlayer(videoUrl, p => {
    p.loop = false;
    p.muted = isMuted;
  });

  // Sync mute state
  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted]);

  // Autoplay / pause based on visibility
  useEffect(() => {
    if (!ready) return;
    if (isActive) {
      setEnded(false);
      player.currentTime = 0;
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, ready]);

  // Listen for playback end
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => setEnded(true));
    return () => sub.remove();
  }, [player]);

  // Listen for ready state
  useEffect(() => {
    const sub = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay') setReady(true);
    });
    return () => sub.remove();
  }, [player]);

  const handleTap = () => {
    if (ended) return;
    if (player.playing) {
      player.pause();
    } else {
      player.play();
    }
  };

  const handleReplay = () => {
    setEnded(false);
    player.currentTime = 0;
    player.play();
  };

  return (
    <View style={styles.card}>
      {/* Thumbnail shown until video is ready */}
      {thumbnailUrl && !ready && (
        <Image
          source={{ uri: thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      )}

      {/* Video */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={handleTap}
      >
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          nativeControls={false}
        />
      </TouchableOpacity>

      {/* Top overlay (e.g. tweet author / team link) */}
      {topOverlay}

      {/* Bottom gradient overlay */}
      <View style={styles.bottomOverlay} pointerEvents="box-none">
        {overlay}
        {/* Mute button */}
        <TouchableOpacity style={styles.muteBtn} onPress={onMuteToggle}>
          <Text style={styles.muteBtnText}>{isMuted ? '🔇' : '🔊'}</Text>
        </TouchableOpacity>
      </View>

      {/* Loading indicator */}
      {!ready && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}

      {/* Play Again overlay */}
      {ended && (
        <TouchableOpacity style={styles.playAgainOverlay} onPress={handleReplay}>
          <View style={styles.playAgainBtn}>
            <Text style={styles.playAgainIcon}>↺</Text>
            <Text style={styles.playAgainText}>Play Again</Text>
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── X / Buzz card ────────────────────────────────────────────────────────────

function BuzzCard({ post, isActive, isMuted, onMuteToggle }: {
  post: WatchVideoPost;
  isActive: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cleanText = post.text
    .replace(/https?:\/\/t\.co\/\w+/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

  const openOnX = () =>
    Linking.openURL(`https://x.com/${post.author.username}/status/${post.postId}`);

  const overlay = (
    <View style={styles.buzzMeta}>
      <View style={styles.buzzAuthorRow}>
        {post.author.profileImageUrl ? (
          <Image
            source={{ uri: post.author.profileImageUrl }}
            style={styles.buzzAvatar}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.buzzAvatar, { backgroundColor: '#444', alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>
              {post.author.name[0]?.toUpperCase()}
            </Text>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.buzzAuthorName} numberOfLines={1}>{post.author.name}</Text>
          <Text style={styles.buzzHandle}>@{post.author.username}</Text>
        </View>
        <TouchableOpacity onPress={openOnX} style={styles.xBtn}>
          <Text style={styles.xBtnText}>𝕏</Text>
        </TouchableOpacity>
      </View>

      {cleanText.length > 0 && (
        <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.9}>
          <Text style={styles.buzzText} numberOfLines={expanded ? undefined : 2}>
            {cleanText}
          </Text>
          {!expanded && cleanText.length > 80 && (
            <Text style={styles.moreText}>more</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <VideoCard
      videoUrl={post.videoUrl}
      thumbnailUrl={post.thumbnailUrl}
      isActive={isActive}
      isMuted={isMuted}
      onMuteToggle={onMuteToggle}
      overlay={overlay}
    />
  );
}

// ─── Clips card ───────────────────────────────────────────────────────────────

function ClipCard({ clip, isActive, isMuted, onMuteToggle }: {
  clip: VideoClip;
  isActive: boolean;
  isMuted: boolean;
  onMuteToggle: () => void;
}) {
  const navigation = useNavigation<any>();
  const [expanded, setExpanded] = useState(false);

  const overlay = (
    <View style={styles.clipMeta}>
      {/* Team badge */}
      {clip.teams && (
        <TouchableOpacity
          style={styles.teamBadge}
          onPress={() => navigation.navigate('TeamDetail', { teamSlug: clip.teams!.slug })}
        >
          {clip.teams.logo_url && (
            <Image source={{ uri: clip.teams.logo_url }} style={styles.teamLogo} contentFit="contain" />
          )}
          <Text style={styles.teamName}>{clip.teams.short_name}</Text>
        </TouchableOpacity>
      )}

      {/* Player name */}
      {clip.players && (
        <TouchableOpacity
          onPress={() => navigation.navigate('PlayerDetail', { playerSlug: clip.players!.slug })}
        >
          <Text style={styles.clipPlayer}>{clip.players.name}</Text>
        </TouchableOpacity>
      )}

      {/* Title */}
      <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.9}>
        <Text style={styles.clipTitle} numberOfLines={expanded ? undefined : 2}>
          {clip.title}
        </Text>
        {!expanded && clip.title.length > 80 && (
          <Text style={styles.moreText}>more</Text>
        )}
      </TouchableOpacity>

      {/* Caption */}
      {clip.caption && (
        <Text style={styles.clipCaption} numberOfLines={1}>{clip.caption}</Text>
      )}
    </View>
  );

  return (
    <VideoCard
      videoUrl={clip.video_url}
      thumbnailUrl={clip.thumbnail_url}
      isActive={isActive}
      isMuted={isMuted}
      onMuteToggle={onMuteToggle}
      overlay={overlay}
    />
  );
}

// ─── Empty states ─────────────────────────────────────────────────────────────

function EmptyBuzz({ hasTeams }: { hasTeams: boolean }) {
  const navigation = useNavigation<any>();
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>📺</Text>
      <Text style={styles.emptyTitle}>
        {hasTeams ? 'No videos right now' : 'Follow teams to see videos'}
      </Text>
      <Text style={styles.emptySubtitle}>
        {hasTeams
          ? 'Check back later for new clips from your teams'
          : 'Add favorite teams from your profile to see their latest content here'}
      </Text>
      {!hasTeams && (
        <TouchableOpacity
          style={styles.emptyBtn}
          onPress={() => navigation.navigate('Browse')}
        >
          <Text style={styles.emptyBtnText}>Browse Teams</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function EmptyClips() {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyIcon}>🎬</Text>
      <Text style={styles.emptyTitle}>No clips yet</Text>
      <Text style={styles.emptySubtitle}>Check back soon for highlight clips</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type Tab = 'buzz' | 'clips';

export default function WatchScreen() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('buzz');
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  const { data: userTeams = [] } = useUserTeams();
  const teamIds = userTeams.map(t => t.id);

  const { posts, isLoading: buzzLoading, isEmpty: buzzEmpty } = useWatchXVideos(
    activeTab === 'buzz' ? teamIds : []
  );
  const { data: clips = [], isLoading: clipsLoading } = useVideoClips();

  const isLoading = activeTab === 'buzz' ? buzzLoading : clipsLoading;

  // Reset active index when switching tabs
  useEffect(() => {
    setActiveIndex(0);
  }, [activeTab]);

  const viewabilityConfig = useRef({
    waitForInteraction: false,
    viewAreaCoveragePercentThreshold: 80,
    minimumViewTime: 100,
  });

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  );

  const renderBuzzItem = useCallback(({ item, index }: { item: WatchVideoPost; index: number }) => (
    <BuzzCard
      post={item}
      isActive={index === activeIndex}
      isMuted={isMuted}
      onMuteToggle={() => setIsMuted(m => !m)}
    />
  ), [activeIndex, isMuted]);

  const renderClipItem = useCallback(({ item, index }: { item: VideoClip; index: number }) => (
    <ClipCard
      clip={item}
      isActive={index === activeIndex}
      isMuted={isMuted}
      onMuteToggle={() => setIsMuted(m => !m)}
    />
  ), [activeIndex, isMuted]);

  const buzzKey = useCallback((item: WatchVideoPost) => item.id, []);
  const clipKey = useCallback((item: VideoClip) => item.id, []);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  }), []);

  return (
    <View style={styles.container}>
      <RNStatusBar barStyle="light-content" />

      {/* Tab bar — floats over video */}
      <View style={styles.tabBar}>
        <Text style={styles.tabTitle}>Watch</Text>
        <View style={styles.tabPills}>
          <TouchableOpacity
            style={[styles.pill, activeTab === 'buzz' && styles.pillActive]}
            onPress={() => setActiveTab('buzz')}
          >
            <Text style={[styles.pillText, activeTab === 'buzz' && styles.pillTextActive]}>
              The Buzz
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pill, activeTab === 'clips' && styles.pillActiveClips]}
            onPress={() => setActiveTab('clips')}
          >
            <Text style={[styles.pillText, activeTab === 'clips' && styles.pillTextActive]}>
              Clips
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#E53935" size="large" />
        </View>
      ) : activeTab === 'buzz' ? (
        buzzEmpty ? (
          <EmptyBuzz hasTeams={teamIds.length > 0} />
        ) : (
          <FlatList
            data={posts}
            renderItem={renderBuzzItem}
            keyExtractor={buzzKey}
            pagingEnabled
            snapToInterval={ITEM_HEIGHT}
            snapToAlignment="start"
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            getItemLayout={getItemLayout}
            viewabilityConfig={viewabilityConfig.current}
            onViewableItemsChanged={onViewableItemsChanged.current}
            removeClippedSubviews
            windowSize={3}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
          />
        )
      ) : (
        clips.length === 0 ? (
          <EmptyClips />
        ) : (
          <FlatList
            data={clips}
            renderItem={renderClipItem}
            keyExtractor={clipKey}
            pagingEnabled
            snapToInterval={ITEM_HEIGHT}
            snapToAlignment="start"
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            getItemLayout={getItemLayout}
            viewabilityConfig={viewabilityConfig.current}
            onViewableItemsChanged={onViewableItemsChanged.current}
            removeClippedSubviews
            windowSize={3}
            initialNumToRender={2}
            maxToRenderPerBatch={2}
          />
        )
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  card: {
    width: SCREEN_W,
    height: ITEM_HEIGHT,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  // Tab bar
  tabBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  tabTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  tabPills: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  pillActive: {
    backgroundColor: '#fff',
  },
  pillActiveClips: {
    backgroundColor: '#7C3AED',
  },
  pillText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#000',
  },
  // Overlays
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 90,
    paddingHorizontal: 16,
    paddingTop: 80,
    // Gradient-like fade using nested views
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  playAgainOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  playAgainBtn: {
    alignItems: 'center',
    gap: 8,
  },
  playAgainIcon: {
    color: '#fff',
    fontSize: 52,
  },
  playAgainText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  muteBtn: {
    position: 'absolute',
    right: 16,
    bottom: 0,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteBtnText: {
    fontSize: 20,
  },
  // Buzz card
  buzzMeta: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  buzzAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  buzzAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  buzzAuthorName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  buzzHandle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  xBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  xBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  buzzText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
  },
  moreText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 2,
  },
  // Clip card
  clipMeta: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  teamBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  teamLogo: {
    width: 24,
    height: 24,
  },
  teamName: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  clipPlayer: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    marginBottom: 4,
  },
  clipTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 4,
  },
  clipCaption: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  // Empty states
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#E53935',
    borderRadius: 24,
  },
  emptyBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
