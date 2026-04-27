import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTeam } from '../hooks/queries/useTeam';
import { useTeamShows } from '../hooks/queries/useTeamShows';
import { useTeamEpisodes } from '../hooks/queries/useTeamEpisodes';
import { useTeamRoster } from '../hooks/queries/useTeamRoster';
import { useTeamSchedule, ScheduleGame } from '../hooks/queries/useTeamSchedule';
import { useFollowShow } from '../hooks/mutations/useFollowShow';
import { useProfile } from '../hooks/useProfile';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { CompactScoreboard } from '../components/CompactScoreboard';
import { EpisodeFeedPost, CommentsSheet, FeedEpisode } from '../components/EpisodeFeedPost';

type Tab = 'today' | 'shows' | 'episodes';

// ─── Schedule helpers ─────────────────────────────────────────────────────────

function getGameResult(game: ScheduleGame): { result: 'W' | 'L' | 'T'; teamScore: number; oppScore: number } | null {
  if (game.homeScore == null || game.awayScore == null) return null;
  const teamScore = game.isHome ? game.homeScore : game.awayScore;
  const oppScore = game.isHome ? game.awayScore : game.homeScore;
  const result = teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'T';
  return { result, teamScore, oppScore };
}

function formatGameTime(game: ScheduleGame): string {
  try {
    const d = new Date(game.gameTime);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch { return game.gameTime; }
}

function formatScheduleDate(dateStr: string, isUpcoming = false): string {
  try {
    const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
    const gameStart = new Date(year, month - 1, day);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((gameStart.getTime() - todayStart.getTime()) / 86400000);
    if (diffDays === 0) return isUpcoming ? 'Tonight' : 'Today';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays === 1) return 'Tomorrow';
    return gameStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

// ─── Schedule Dropdown ────────────────────────────────────────────────────────

function ScheduleDropdown({ schedule }: { schedule: ReturnType<typeof useTeamSchedule> }) {
  const [expanded, setExpanded] = useState(false);
  const { lastGame, nextGame, liveGame, recentGames, upcomingGames, isOffseason, isLoading } = schedule;
  const hasData = recentGames.length > 0 || upcomingGames.length > 0 || !!liveGame;

  return (
    <View style={{ backgroundColor: '#0F0F0F', borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}>
      {!expanded ? (
        <TouchableOpacity onPress={() => setExpanded(true)} style={{ paddingHorizontal: 16, paddingVertical: 0 }}>
          {liveGame && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#F44336' }} />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>LIVE</Text>
              <Text style={{ color: '#ccc', fontSize: 13 }}>{liveGame.isHome ? 'vs' : '@'} {liveGame.opponent}</Text>
              {liveGame.homeScore != null && (
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginLeft: 'auto', marginRight: 8 }}>
                  {liveGame.isHome ? liveGame.homeScore : liveGame.awayScore}{' – '}{liveGame.isHome ? liveGame.awayScore : liveGame.homeScore}
                </Text>
              )}
              <Ionicons name="chevron-down" size={16} color="#555" />
            </View>
          )}
          {lastGame && !liveGame && (() => {
            const res = getGameResult(lastGame);
            if (!res) return null;
            const { result, teamScore, oppScore } = res;
            const color = result === 'W' ? '#4CAF50' : result === 'L' ? '#F44336' : '#888';
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingVertical: 10, borderBottomWidth: nextGame ? 1 : 0, borderBottomColor: '#2A2A2A' }}>
                <Text style={{ color, fontSize: 13, fontWeight: '700' }}>{result} {teamScore}-{oppScore}</Text>
                <Text style={{ color: '#888', fontSize: 13 }}>{lastGame.isHome ? 'vs' : '@'} {lastGame.opponent}</Text>
                <Text style={{ color: '#555', fontSize: 12, marginLeft: 4 }}>{formatScheduleDate(lastGame.gameDate)}</Text>
              </View>
            );
          })()}
          {nextGame && !liveGame && (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 }}>
                Next: {nextGame.isHome ? 'vs' : '@'} {nextGame.opponent}{'  '}
                <Text style={{ color: '#888', fontWeight: '400' }}>{formatGameTime(nextGame)}</Text>
              </Text>
              <Ionicons name="chevron-down" size={16} color="#555" />
            </View>
          )}
          {(isOffseason || !hasData) && !isLoading && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 }}>
              <Text style={{ color: '#555', fontSize: 13 }}>Schedule</Text>
              <Ionicons name="chevron-down" size={16} color="#555" />
            </View>
          )}
        </TouchableOpacity>
      ) : (
        <View>
          <TouchableOpacity onPress={() => setExpanded(false)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>SCHEDULE</Text>
            <Ionicons name="chevron-up" size={18} color="#888" />
          </TouchableOpacity>
          {isLoading ? (
            <ActivityIndicator color="#fff" style={{ marginBottom: 16 }} />
          ) : isOffseason || !hasData ? (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              <Text style={{ color: '#555', fontSize: 14 }}>This league is in the offseason</Text>
            </View>
          ) : (
            <>
              {liveGame && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#1A1A1A' }}>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#F44336' }} />
                  <Text style={{ color: '#F44336', fontSize: 13, fontWeight: '700', width: 76 }}>LIVE</Text>
                  <Text style={{ color: '#fff', fontSize: 14, flex: 1 }}>{liveGame.isHome ? 'vs' : '@'} {liveGame.opponent}</Text>
                  {liveGame.homeScore != null && (
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                      {liveGame.isHome ? liveGame.homeScore : liveGame.awayScore}{' – '}{liveGame.isHome ? liveGame.awayScore : liveGame.homeScore}
                    </Text>
                  )}
                </View>
              )}
              {recentGames.length > 0 && (
                <>
                  <Text style={{ color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
                    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>RECENT</Text>
                  {recentGames.map((game, i) => {
                    const res = getGameResult(game);
                    const color = res?.result === 'W' ? '#4CAF50' : res?.result === 'L' ? '#F44336' : '#888';
                    return (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center',
                        paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#1A1A1A' }}>
                        <Text style={{ color: '#888', fontSize: 13, width: 82 }}>{formatScheduleDate(game.gameDate)}</Text>
                        <Text style={{ color: '#ccc', fontSize: 14, flex: 1 }}>{game.isHome ? 'vs' : '@'} {game.opponent}</Text>
                        {res && <Text style={{ color, fontSize: 14, fontWeight: '700' }}>{res.result} {res.teamScore}-{res.oppScore}</Text>}
                      </View>
                    );
                  })}
                </>
              )}
              {upcomingGames.length > 0 && (
                <>
                  <Text style={{ color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
                    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>UPCOMING</Text>
                  {upcomingGames.map((game, i) => {
                    const isNext = i === 0 && !liveGame;
                    return (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center',
                        paddingHorizontal: 16, paddingVertical: 11, borderTopWidth: 1, borderTopColor: '#1A1A1A' }}>
                        <Text style={{ color: '#F44336', fontSize: 13, width: 16 }}>{isNext ? '→' : ''}</Text>
                        <Text style={{ color: '#888', fontSize: 13, width: 82, marginLeft: 4 }}>{formatScheduleDate(game.gameDate, true)}</Text>
                        <Text style={{ color: isNext ? '#fff' : '#ccc', fontSize: 14, fontWeight: isNext ? '700' : '400', flex: 1 }}>
                          {game.isHome ? 'vs' : '@'} {game.opponent}
                        </Text>
                        <Text style={{ color: '#888', fontSize: 13 }}>{formatGameTime(game)}</Text>
                      </View>
                    );
                  })}
                </>
              )}
              <View style={{ height: 12 }} />
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Roster Dropdown ──────────────────────────────────────────────────────────

function RosterDropdown({ teamSlug, teamColor, onNavigate }: {
  teamSlug: string; teamColor: string;
  onNavigate: (screen: string, params: any) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: roster = [], isLoading } = useTeamRoster(teamSlug);

  return (
    <View style={{ backgroundColor: '#0F0F0F', borderBottomWidth: 1, borderBottomColor: '#2A2A2A', marginBottom: 4 }}>
      <TouchableOpacity
        onPress={() => setExpanded(e => !e)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 14 }}>
        <Text style={{ color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>PLAYERS</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#888" />
      </TouchableOpacity>
      {expanded && (
        <>
          {isLoading ? (
            <ActivityIndicator color="#fff" style={{ marginBottom: 16 }} />
          ) : roster.length === 0 ? (
            <Text style={{ color: '#555', fontSize: 14, paddingHorizontal: 16, paddingBottom: 16 }}>No roster data available</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 16 }}>
              {roster.map(player => {
                const initials = player.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <View
                    key={player.id}
                    style={{ width: '33.3%', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 }}>
                    <View style={{ position: 'relative', marginBottom: 8 }}>
                      <View style={{ width: 80, height: 80, borderRadius: 40, borderWidth: 2.5,
                        borderColor: teamColor, backgroundColor: '#2A2A2A', overflow: 'hidden',
                        alignItems: 'center', justifyContent: 'center' }}>
                        {player.headshot_url ? (
                          <Image source={{ uri: player.headshot_url }} style={{ width: 80, height: 80 }} contentFit="cover" />
                        ) : (
                          <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>{initials}</Text>
                        )}
                      </View>
                      {player.jersey_number != null && (
                        <View style={{ position: 'absolute', top: 0, left: 0, minWidth: 22, height: 22,
                          borderRadius: 11, backgroundColor: teamColor, alignItems: 'center',
                          justifyContent: 'center', paddingHorizontal: 4 }}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{player.jersey_number}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 16 }}
                      numberOfLines={2}>{player.name}</Text>
                    {player.position && <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{player.position}</Text>}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ─── Today Tab ────────────────────────────────────────────────────────────────

function TodayTab({ teamSlug, teamColor, teamShortName, schedule, onNavigate, onOpenComments }: {
  teamSlug: string; teamColor: string; teamShortName: string;
  schedule: ReturnType<typeof useTeamSchedule>;
  onNavigate: (screen: string, params: any) => void;
  onOpenComments: (episode: FeedEpisode, color: string) => void;
}) {
  const { data: pages, isLoading } = useTeamEpisodes(teamSlug);

  const episodes: FeedEpisode[] = useMemo(() =>
    (pages?.pages.flatMap(p => p.episodes) || []).slice(0, 15).map(ep => ({
      id: ep.id,
      title: ep.title,
      artwork_url: ep.artwork_url,
      show_artwork_url: ep.shows?.artwork_url ?? null,
      audio_url: ep.audio_url,
      duration_seconds: ep.duration_seconds ?? 0,
      published_at: ep.published_at,
      show_id: ep.show_id,
      show_title: ep.shows?.title ?? null,
      team_slug: teamSlug,
    })),
  [pages, teamSlug]);

  const renderPost = useCallback(({ item }: { item: FeedEpisode }) => (
    <EpisodeFeedPost
      episode={item}
      teamColor={teamColor}
      teamShortName={teamShortName}
      onOpenComments={onOpenComments}
      onNavigate={onNavigate}
    />
  ), [teamColor, teamShortName, onOpenComments, onNavigate]);

  return (
    <FlatList
      data={episodes}
      keyExtractor={item => item.id}
      renderItem={renderPost}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <>
          {/* Compact scoreboard */}
          <CompactScoreboard teamSlugs={[teamSlug]} />
          {/* Schedule */}
          <ScheduleDropdown schedule={schedule} />
          {/* Roster */}
          <RosterDropdown teamSlug={teamSlug} teamColor={teamColor} onNavigate={onNavigate} />
        </>
      }
      ListEmptyComponent={
        isLoading
          ? <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
          : <Text style={{ color: '#555', textAlign: 'center', marginTop: 40 }}>No recent episodes</Text>
      }
    />
  );
}

// ─── Shows Tab ────────────────────────────────────────────────────────────────

function ShowsTab({ teamSlug, teamColor, onNavigate }: {
  teamSlug: string; teamColor: string;
  onNavigate: (screen: string, params: any) => void;
}) {
  const { data: shows = [], isLoading } = useTeamShows(teamSlug);
  const followShow = useFollowShow();

  return (
    <FlatList
      data={shows}
      keyExtractor={item => item.id}
      contentContainerStyle={{ paddingBottom: 120, paddingTop: 4 }}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => onNavigate('ShowDetail', { showId: item.id })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 16, paddingVertical: 12,
            borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
          <View style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
            {item.artwork_url
              ? <Image source={{ uri: item.artwork_url }} style={{ width: 56, height: 56 }} contentFit="cover" />
              : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="mic" size={20} color="#555" />
                </View>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
            <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
              {item.publisher} · {item.episode_count} eps
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => followShow.mutate({ showId: item.id, isFollowing: item.isFollowed })}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
              backgroundColor: item.isFollowed ? '#2A2A2A' : teamColor,
              borderWidth: item.isFollowed ? 1 : 0, borderColor: '#444' }}>
            <Text style={{ color: item.isFollowed ? '#aaa' : '#fff', fontSize: 12, fontWeight: '600' }}>
              {item.isFollowed ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
      ListEmptyComponent={() => isLoading
        ? <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
        : <Text style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>No shows found</Text>}
    />
  );
}

// ─── Episodes Tab ─────────────────────────────────────────────────────────────

function EpisodesTab({ teamSlug, teamColor, teamShortName, onNavigate, onOpenComments }: {
  teamSlug: string; teamColor: string; teamShortName: string;
  onNavigate: (screen: string, params: any) => void;
  onOpenComments: (episode: FeedEpisode, color: string) => void;
}) {
  const { data: pages, isLoading, fetchNextPage, hasNextPage } = useTeamEpisodes(teamSlug);

  const episodes: FeedEpisode[] = useMemo(() =>
    (pages?.pages.flatMap(p => p.episodes) || []).map(ep => ({
      id: ep.id,
      title: ep.title,
      artwork_url: ep.artwork_url,
      show_artwork_url: ep.shows?.artwork_url ?? null,
      audio_url: ep.audio_url,
      duration_seconds: ep.duration_seconds ?? 0,
      published_at: ep.published_at,
      show_id: ep.show_id,
      show_title: ep.shows?.title ?? null,
      team_slug: teamSlug,
    })),
  [pages, teamSlug]);

  const renderPost = useCallback(({ item }: { item: FeedEpisode }) => (
    <EpisodeFeedPost
      episode={item}
      teamColor={teamColor}
      teamShortName={teamShortName}
      onOpenComments={onOpenComments}
      onNavigate={onNavigate}
    />
  ), [teamColor, teamShortName, onOpenComments, onNavigate]);

  return (
    <FlatList
      data={episodes}
      keyExtractor={item => item.id}
      renderItem={renderPost}
      contentContainerStyle={{ paddingBottom: 120 }}
      showsVerticalScrollIndicator={false}
      onEndReached={() => hasNextPage && fetchNextPage()}
      onEndReachedThreshold={0.3}
      ListEmptyComponent={() => isLoading
        ? <ActivityIndicator color="#fff" style={{ marginTop: 40 }} />
        : <Text style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>No episodes yet</Text>}
    />
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TeamScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { teamSlug } = route.params;
  const [activeTab, setActiveTab] = useState<Tab>('today');
  const [commentsEpisode, setCommentsEpisode] = useState<FeedEpisode | null>(null);
  const [commentsColor, setCommentsColor] = useState('#333');

  const { data: team, isLoading: teamLoading } = useTeam(teamSlug);
  const { data: profile } = useProfile();
  const { data: shows = [] } = useTeamShows(teamSlug);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const schedule = useTeamSchedule(team);

  const teamColor = team?.primary_color || '#FFFFFF';
  const teamShortName = team?.short_name || '';
  const isFollowing = (profile?.topic_slugs || []).includes(teamSlug);

  const onNavigate = (screen: string, params: any) => navigation.navigate(screen, params);

  const handleOpenComments = useCallback((episode: FeedEpisode, color: string) => {
    setCommentsEpisode(episode);
    setCommentsColor(color);
  }, []);

  const toggleFollow = async () => {
    if (!user) return;
    const current = profile?.topic_slugs || [];
    const next = isFollowing ? current.filter(s => s !== teamSlug) : [...current, teamSlug];
    await supabase.from('profiles').update({ topic_slugs: next }).eq('user_id', user.id);
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  if (teamLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (!team) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', padding: 16 }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 56 }}>
          <Text style={{ color: '#888', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: '#888', marginTop: 16 }}>Team not found.</Text>
      </View>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'shows', label: `Shows (${shows.length})` },
    { key: 'episodes', label: 'Episodes' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>

      {/* Comments sheet (shared across tabs) */}
      <CommentsSheet
        episode={commentsEpisode}
        teamColor={commentsColor}
        visible={!!commentsEpisode}
        onClose={() => setCommentsEpisode(null)}
      />

      {/* ── Colored header ── */}
      <View style={{ backgroundColor: teamColor, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 16 }}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.25)',
            alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 60, height: 60, borderRadius: 12, backgroundColor: '#fff',
            alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {team.logo_url
              ? <Image source={{ uri: team.logo_url }} style={{ width: 48, height: 48 }} contentFit="contain" />
              : <Text style={{ color: '#333', fontWeight: 'bold', fontSize: 16 }}>{team.short_name?.slice(0, 2)}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 26 }}>{team.name}</Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 }}>
              {team.leagues?.short_name}{shows.length > 0 ? ` · ${shows.length} Show${shows.length !== 1 ? 's' : ''}` : ''}
            </Text>
            {team.record && (
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 }}>
                {team.record}{team.streak ? ` · ${team.streak}` : ''}
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={toggleFollow}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 24,
              paddingVertical: 8, paddingHorizontal: 14 }}>
            <Ionicons name={isFollowing ? 'heart' : 'heart-outline'} size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Tab bar ── */}
      <View style={{ backgroundColor: '#1A1A1A', borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity key={tab.key} onPress={() => setActiveTab(tab.key)}
                style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2,
                  borderBottomColor: isActive ? teamColor : 'transparent' }}>
                <Text style={{ color: isActive ? '#fff' : '#888', fontSize: 14,
                  fontWeight: isActive ? '700' : '500' }}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content ── */}
      {activeTab === 'today' && (
        <TodayTab
          teamSlug={teamSlug}
          teamColor={teamColor}
          teamShortName={teamShortName}
          schedule={schedule}
          onNavigate={onNavigate}
          onOpenComments={handleOpenComments}
        />
      )}
      {activeTab === 'shows' && (
        <ShowsTab teamSlug={teamSlug} teamColor={teamColor} onNavigate={onNavigate} />
      )}
      {activeTab === 'episodes' && (
        <EpisodesTab
          teamSlug={teamSlug}
          teamColor={teamColor}
          teamShortName={teamShortName}
          onNavigate={onNavigate}
          onOpenComments={handleOpenComments}
        />
      )}
    </View>
  );
}
