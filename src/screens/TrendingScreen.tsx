import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, ScrollView,
  ActivityIndicator, StyleSheet, SafeAreaView, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { useTrendingSignals, TrendingSignal, EpisodeData } from '../hooks/queries/useTrendingSignals';
import { useTrendingPlayers, TrendingPlayer } from '../hooks/useTrendingPlayers';
import { useUserTeams } from '../hooks/useUserTeams';
import { useAllTeams } from '../hooks/useLeagues';
import { useFollowedPlayers } from '../hooks/useFollowedPlayers';
import { useToggleFollowPlayer } from '../hooks/mutations/useToggleFollowPlayer';

const LEAGUE_FILTERS: { value: string | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'nfl', label: 'NFL' },
  { value: 'nba', label: 'NBA' },
  { value: 'mlb', label: 'MLB' },
  { value: 'nhl', label: 'NHL' },
];

const STORY_TYPE_COLORS: Record<string, string> = {
  game_result: '#4CAF50',
  game_preview: '#2196F3',
  trade: '#FF9800',
  signing: '#FF9800',
  injury: '#F44336',
  player_emergence: '#9C27B0',
  award_candidacy: '#FFD700',
  coaching: '#00BCD4',
  milestone: '#FFD700',
};

const STORY_TYPE_LABELS: Record<string, string> = {
  game_result: 'Game',
  game_preview: 'Preview',
  trade: 'Trade',
  signing: 'Signing',
  injury: 'Injury',
  player_emergence: 'Rising',
  award_candidacy: 'Award',
  coaching: 'Coaching',
  milestone: 'Milestone',
};

type ScreenTab = 'topics' | 'players';
type PlayerFilter = 'my-teams' | 'all' | 'nfl' | 'nba' | 'mlb' | 'nhl';

// ── Topic Card ────────────────────────────────────────────────────────────────

function TopicCard({ signal }: { signal: TrendingSignal }) {
  const navigation = useNavigation<any>();
  const { playEpisode } = usePlayer();
  const typeColor = STORY_TYPE_COLORS[signal.signal_type] || '#888';
  const typeLabel = STORY_TYPE_LABELS[signal.signal_type] || signal.signal_type;
  const recentEp: EpisodeData | undefined = signal.recent_episodes[0];

  const handlePlay = () => {
    if (!recentEp) return;
    playEpisode({
      id: recentEp.id,
      title: recentEp.title,
      showTitle: recentEp.show?.title || '',
      audioUrl: recentEp.audio_url,
      artworkUrl: recentEp.artwork_url || recentEp.show?.artwork_url || undefined,
      durationSeconds: recentEp.duration_seconds ?? undefined,
    });
  };

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('StoryDetail', { storyId: signal.id })}
      style={styles.topicCard}
      activeOpacity={0.8}
    >
      {/* Type badge + date */}
      <View style={styles.topicMeta}>
        <View style={[styles.typePill, { backgroundColor: typeColor + '22', borderColor: typeColor + '55' }]}>
          <Text style={[styles.typePillText, { color: typeColor }]}>{typeLabel}</Text>
        </View>
        {signal.event_date && (
          <Text style={styles.eventDate}>
            {new Date(signal.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </Text>
        )}
      </View>

      {/* Headline */}
      <Text style={styles.topicHeadline} numberOfLines={2}>{signal.entity_name}</Text>

      {/* Teams row */}
      {signal.teams.length > 0 && (
        <View style={styles.topicTeamsRow}>
          {signal.teams.slice(0, 4).map((team, i) => (
            <View key={team.slug} style={styles.topicTeamChip}>
              {i > 0 && <Text style={styles.dot}> · </Text>}
              {team.logo_url ? (
                <View style={styles.miniLogoWrap}>
                  <Image source={{ uri: team.logo_url }} style={styles.miniLogo} contentFit="contain" />
                </View>
              ) : null}
              <Text style={styles.topicTeamName}>{team.short_name}</Text>
            </View>
          ))}
          {signal.mention_count > 0 && (
            <Text style={styles.mentionCount}> · {signal.mention_count} eps</Text>
          )}
        </View>
      )}

      {/* Most recent episode mini-card */}
      {recentEp && (
        <TouchableOpacity onPress={handlePlay} style={styles.episodeMini} activeOpacity={0.85}>
          <View style={styles.episodeMiniArtWrap}>
            {(recentEp.artwork_url || recentEp.show?.artwork_url) ? (
              <Image
                source={{ uri: (recentEp.artwork_url || recentEp.show?.artwork_url)! }}
                style={styles.episodeMiniArt}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.episodeMiniArt, { backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' }]}>
                <Ionicons name="mic" size={18} color="#555" />
              </View>
            )}
            <View style={styles.episodeMiniPlayBtn}>
              <Ionicons name="play" size={10} color="#fff" />
            </View>
          </View>
          <View style={styles.episodeMiniInfo}>
            <Text style={styles.episodeMiniTitle} numberOfLines={2}>{recentEp.title}</Text>
            {recentEp.show && (
              <Text style={styles.episodeMiniShow} numberOfLines={1}>{recentEp.show.title}</Text>
            )}
          </View>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ── Player Card ───────────────────────────────────────────────────────────────

function PlayerCard({
  player,
  isFollowed,
  onToggleFollow,
}: {
  player: TrendingPlayer;
  isFollowed: boolean;
  onToggleFollow: () => void;
}) {
  const navigation = useNavigation<any>();
  const [imgFailed, setImgFailed] = useState(false);
  const initials = player.name.split(' ').map(n => n[0] || '').join('').slice(0, 2).toUpperCase();
  const spaceIdx = player.name.indexOf(' ');
  const firstName = spaceIdx > 0 ? player.name.slice(0, spaceIdx) : player.name;
  const lastName = spaceIdx > 0 ? player.name.slice(spaceIdx + 1) : '';

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('PlayerDetail', { playerSlug: player.slug })}
      style={styles.playerCard}
      activeOpacity={0.8}
    >
      {/* Headshot */}
      <View style={[styles.headshotRing, { borderColor: player.primary_color || '#444' }]}>
        {player.headshot_url && !imgFailed ? (
          <Image
            source={{ uri: player.headshot_url }}
            style={styles.headshot}
            contentFit="cover"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <View style={[styles.headshotFallback, { backgroundColor: player.primary_color || '#333' }]}>
            <Text style={styles.headshotInitials}>{initials}</Text>
          </View>
        )}
      </View>

      {/* Follow heart */}
      <TouchableOpacity
        onPress={e => { e.stopPropagation(); onToggleFollow(); }}
        style={[styles.followHeart, isFollowed && styles.followHeartActive]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isFollowed ? 'heart' : 'heart-outline'} size={10} color={isFollowed ? '#fff' : '#666'} />
      </TouchableOpacity>

      {/* Info */}
      <Text style={styles.playerFirst} numberOfLines={1}>{firstName}</Text>
      {!!lastName && <Text style={styles.playerLast} numberOfLines={1}>{lastName}</Text>}
      <Text style={styles.playerMeta} numberOfLines={1}>
        {[player.position, player.team_name].filter(Boolean).join(' · ')}
      </Text>
      <Text style={styles.playerEps}>
        {player.episode_count} ep{player.episode_count !== 1 ? 's' : ''}
      </Text>
    </TouchableOpacity>
  );
}

// ── Filter Pills Row ──────────────────────────────────────────────────────────

function PillsRow({
  pills,
  selected,
  onSelect,
}: {
  pills: { value: string | null; label: string; logoUrl?: string | null; color?: string | null }[];
  selected: string | null;
  onSelect: (v: string | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.pillsRow}
    >
      {pills.map(p => {
        const isActive = selected === p.value;
        return (
          <TouchableOpacity
            key={p.value ?? '__all__'}
            onPress={() => onSelect(p.value)}
            style={[
              styles.pill,
              isActive && (p.color ? { backgroundColor: p.color, borderColor: 'transparent' } : styles.pillActive),
            ]}
          >
            {p.logoUrl ? (
              <View style={styles.pillLogo}>
                <Image source={{ uri: p.logoUrl }} style={{ width: 14, height: 14 }} contentFit="contain" />
              </View>
            ) : null}
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>{p.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function TrendingScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [tab, setTab] = useState<ScreenTab>('topics');

  // Topics filters
  const [topicsLeague, setTopicsLeague] = useState<string | null>(null);
  const [topicsTeam, setTopicsTeam] = useState<string | null>(null);

  // Players filters
  const [playersFilter, setPlayersFilter] = useState<PlayerFilter | null>(null);
  const [playersTeam, setPlayersTeam] = useState<string | null>(null);

  const { data: userTeams = [] } = useUserTeams();
  const { data: allTeams = [] } = useAllTeams();
  const { data: followedPlayers = [] } = useFollowedPlayers();
  const toggleFollow = useToggleFollowPlayer();

  const followedTeamSlugs = userTeams.map(t => t.slug);
  const followedPlayerIds = new Set(followedPlayers.map(p => p.id));
  const followedPlayerIdsArr = followedPlayers.map(p => p.id);

  const activePlayerFilter: PlayerFilter =
    playersFilter ?? (followedTeamSlugs.length > 0 ? 'my-teams' : 'all');
  const isLeagueFilter = ['nfl', 'nba', 'mlb', 'nhl'].includes(activePlayerFilter);

  // ── Topics team pills ──────────────────────────────────────────────────────
  const topicsTeamPills = useMemo(() => {
    const followedSet = new Set(userTeams.map(t => t.slug));
    if (!topicsLeague) return userTeams;
    const followedInLeague = userTeams.filter(t => t.league_slug === topicsLeague);
    const others = allTeams
      .filter(t => t.league_slug === topicsLeague && !followedSet.has(t.slug))
      .sort((a, b) => a.short_name.localeCompare(b.short_name));
    return [...followedInLeague, ...others];
  }, [topicsLeague, userTeams, allTeams]);

  // ── Players team pills ─────────────────────────────────────────────────────
  const playersTeamPills = useMemo(() => {
    if (!isLeagueFilter) return [];
    return allTeams
      .filter(t => t.league_slug === activePlayerFilter)
      .sort((a, b) => a.short_name.localeCompare(b.short_name));
  }, [isLeagueFilter, activePlayerFilter, allTeams]);

  // ── Player filter pills ────────────────────────────────────────────────────
  const playerFilterPills = useMemo(() => {
    const pills: { value: PlayerFilter; label: string }[] = [];
    if (followedTeamSlugs.length > 0) pills.push({ value: 'my-teams', label: 'My Teams' });
    pills.push({ value: 'all', label: 'All' });
    (['nfl', 'nba', 'mlb', 'nhl'] as PlayerFilter[]).forEach(v =>
      pills.push({ value: v, label: v.toUpperCase() }),
    );
    return pills;
  }, [followedTeamSlugs.length]);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: signals = [], isLoading: signalsLoading } = useTrendingSignals({
    league: topicsLeague || undefined,
    teamSlugs: topicsTeam ? [topicsTeam] : undefined,
    limit: 20,
    enabled: tab === 'topics',
  });

  const { data: players = [], isLoading: playersLoading } = useTrendingPlayers({
    sport: isLeagueFilter ? activePlayerFilter : null,
    teamSlug: playersTeam,
    teamSlugs: activePlayerFilter === 'my-teams' ? followedTeamSlugs : null,
    followedIds: followedPlayerIdsArr,
    limit: 200,
    enabled: tab === 'players',
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleTopicsLeagueChange = (v: string | null) => {
    setTopicsLeague(v);
    setTopicsTeam(null);
  };

  const handlePlayersFilterChange = (f: PlayerFilter) => {
    setPlayersFilter(f);
    setPlayersTeam(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trending</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {(['topics', 'players'] as ScreenTab[]).map(t => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tabItem, tab === t && styles.tabItemActive]}
          >
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {t === 'topics' ? 'Topics' : 'Players'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'topics' ? (
        <View style={{ flex: 1 }}>
          {/* League filter */}
          <View style={styles.filtersArea}>
            <PillsRow
              pills={LEAGUE_FILTERS}
              selected={topicsLeague}
              onSelect={handleTopicsLeagueChange}
            />
            {topicsTeamPills.length > 0 && (
              <PillsRow
                pills={[
                  { value: null, label: 'All Teams' },
                  ...topicsTeamPills.map(t => ({
                    value: t.slug,
                    label: t.short_name,
                    logoUrl: t.logo_url,
                    color: topicsTeam === t.slug ? (t.primary_color || '#F0B429') : null,
                  })),
                ]}
                selected={topicsTeam}
                onSelect={setTopicsTeam}
              />
            )}
          </View>

          {signalsLoading ? (
            <ActivityIndicator color="#F0B429" style={{ marginTop: 40 }} />
          ) : signals.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="flame-outline" size={48} color="#444" />
              <Text style={styles.emptyText}>No trending topics right now</Text>
            </View>
          ) : (
            <FlatList
              data={signals}
              keyExtractor={item => item.id}
              renderItem={({ item }) => <TopicCard signal={item} />}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Player filters */}
          <View style={styles.filtersArea}>
            <PillsRow
              pills={playerFilterPills.map(p => ({ value: p.value, label: p.label }))}
              selected={activePlayerFilter}
              onSelect={v => handlePlayersFilterChange((v as PlayerFilter) ?? 'all')}
            />
            {isLeagueFilter && playersTeamPills.length > 0 && (
              <PillsRow
                pills={[
                  { value: null, label: 'All' },
                  ...playersTeamPills.map(t => ({
                    value: t.slug,
                    label: t.short_name,
                    logoUrl: t.logo_url,
                  })),
                ]}
                selected={playersTeam}
                onSelect={setPlayersTeam}
              />
            )}
          </View>

          {playersLoading ? (
            <ActivityIndicator color="#F0B429" style={{ marginTop: 40 }} />
          ) : players.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={48} color="#444" />
              <Text style={styles.emptyText}>No trending players for this filter</Text>
            </View>
          ) : (
            <FlatList
              data={players}
              keyExtractor={item => item.id}
              numColumns={3}
              renderItem={({ item }) => (
                <PlayerCard
                  player={item}
                  isFollowed={followedPlayerIds.has(item.id)}
                  onToggleFollow={() => {
                    if (!user) {
                      Alert.alert('Sign in to follow players');
                      return;
                    }
                    toggleFollow.mutate({
                      playerId: item.id,
                      isFollowing: followedPlayerIds.has(item.id),
                    });
                  }}
                />
              )}
              columnWrapperStyle={styles.playerRow}
              contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 32, paddingTop: 8 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: '#F0B429',
  },
  tabLabel: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#fff',
  },
  filtersArea: {
    paddingTop: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1C',
    gap: 6,
  },
  pillsRow: {
    paddingHorizontal: 16,
    gap: 8,
    flexDirection: 'row',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 4,
  },
  pillActive: {
    backgroundColor: '#F0B429',
    borderColor: 'transparent',
  },
  pillText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: '#fff',
  },
  pillLogo: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Topic card
  topicCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  topicMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  typePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  typePillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  eventDate: {
    color: '#666',
    fontSize: 12,
  },
  topicHeadline: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 8,
  },
  topicTeamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    marginBottom: 10,
  },
  topicTeamChip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    color: '#444',
    fontSize: 12,
  },
  miniLogoWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    overflow: 'hidden',
  },
  miniLogo: {
    width: 14,
    height: 14,
  },
  topicTeamName: {
    color: '#888',
    fontSize: 12,
  },
  mentionCount: {
    color: '#555',
    fontSize: 12,
  },
  episodeMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#242424',
    borderRadius: 10,
    padding: 10,
    marginTop: 4,
  },
  episodeMiniArtWrap: {
    position: 'relative',
    width: 44,
    height: 44,
    borderRadius: 8,
    overflow: 'hidden',
    flexShrink: 0,
  },
  episodeMiniArt: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  episodeMiniPlayBtn: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F0B429',
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeMiniInfo: {
    flex: 1,
  },
  episodeMiniTitle: {
    color: '#ddd',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 17,
  },
  episodeMiniShow: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  // Player card
  playerRow: {
    justifyContent: 'flex-start',
  },
  playerCard: {
    flex: 1 / 3,
    alignItems: 'center',
    padding: 10,
    paddingBottom: 14,
    position: 'relative',
  },
  headshotRing: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2.5,
    overflow: 'hidden',
    marginBottom: 8,
  },
  headshot: {
    width: '100%',
    height: '100%',
  },
  headshotFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headshotInitials: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  followHeart: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(30,30,30,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  followHeartActive: {
    backgroundColor: '#F0B429',
    borderColor: 'transparent',
  },
  playerFirst: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 17,
  },
  playerLast: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 17,
  },
  playerMeta: {
    color: '#666',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
  },
  playerEps: {
    color: '#F0B429',
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 3,
  },
  // Empty
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  emptyText: {
    color: '#555',
    fontSize: 15,
    marginTop: 12,
  },
});
