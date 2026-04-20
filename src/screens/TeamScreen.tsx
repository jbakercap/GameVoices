import React, { useState } from 'react';
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
import { useFollowedPlayers } from '../hooks/useFollowedPlayers';
import { useToggleFollowPlayer } from '../hooks/mutations/useToggleFollowPlayer';
import { usePlayer } from '../contexts/PlayerContext';
import { useProfile } from '../hooks/useProfile';
import { useAuth } from '../contexts/AuthContext';
import { useRecentGames } from '../hooks/useRecentGames';
import { GameScoreCard } from '../components/ScoreboardCard';
import { supabase } from '../lib/supabase';
import { formatDurationHuman, formatRelativeDate } from '../lib/formatters';

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
    // Split the date string directly to avoid UTC-offset shifting
    // new Date("2026-04-19") parses as UTC midnight, which in ET is Apr 18 — wrong
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
        /* ── Collapsed: compact summary row ── */
        <TouchableOpacity
          onPress={() => setExpanded(true)}
          style={{ paddingHorizontal: 16, paddingVertical: 0 }}>

          {/* Live game banner */}
          {liveGame && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
              paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}>
              <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#F44336' }} />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>LIVE</Text>
              <Text style={{ color: '#ccc', fontSize: 13 }}>
                {liveGame.isHome ? 'vs' : '@'} {liveGame.opponent}
              </Text>
              {liveGame.homeScore != null && (
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginLeft: 'auto', marginRight: 8 }}>
                  {liveGame.isHome ? liveGame.homeScore : liveGame.awayScore}
                  {' – '}
                  {liveGame.isHome ? liveGame.awayScore : liveGame.homeScore}
                </Text>
              )}
              <Ionicons name="chevron-down" size={16} color="#555" />
            </View>
          )}

          {/* Last game */}
          {lastGame && !liveGame && (() => {
            const res = getGameResult(lastGame);
            if (!res) return null;
            const { result, teamScore, oppScore } = res;
            const color = result === 'W' ? '#4CAF50' : result === 'L' ? '#F44336' : '#888';
            return (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                paddingVertical: 10, borderBottomWidth: nextGame ? 1 : 0, borderBottomColor: '#2A2A2A' }}>
                <Text style={{ color, fontSize: 13, fontWeight: '700' }}>
                  {result} {teamScore}-{oppScore}
                </Text>
                <Text style={{ color: '#888', fontSize: 13 }}>
                  {lastGame.isHome ? 'vs' : '@'} {lastGame.opponent}
                </Text>
                <Text style={{ color: '#555', fontSize: 12, marginLeft: 4 }}>
                  {formatScheduleDate(lastGame.gameDate)}
                </Text>
              </View>
            );
          })()}

          {/* Next game */}
          {nextGame && !liveGame && (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 }}>
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 }}>
                Next: {nextGame.isHome ? 'vs' : '@'} {nextGame.opponent}{'  '}
                <Text style={{ color: '#888', fontWeight: '400' }}>{formatGameTime(nextGame)}</Text>
              </Text>
              <Ionicons name="chevron-down" size={16} color="#555" />
            </View>
          )}

          {/* Offseason or no data collapsed */}
          {(isOffseason || !hasData) && !isLoading && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingVertical: 12 }}>
              <Text style={{ color: '#555', fontSize: 13 }}>Schedule</Text>
              <Ionicons name="chevron-down" size={16} color="#555" />
            </View>
          )}
        </TouchableOpacity>
      ) : (
        /* ── Expanded: full schedule ── */
        <View>
          {/* Header */}
          <TouchableOpacity
            onPress={() => setExpanded(false)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 16, paddingVertical: 14 }}>
            <Text style={{ color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>
              SCHEDULE
            </Text>
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
              {/* Live game */}
              {liveGame && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingHorizontal: 16, paddingVertical: 12,
                  borderTopWidth: 1, borderTopColor: '#1A1A1A' }}>
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#F44336' }} />
                  <Text style={{ color: '#F44336', fontSize: 13, fontWeight: '700', width: 76 }}>LIVE</Text>
                  <Text style={{ color: '#fff', fontSize: 14, flex: 1 }}>
                    {liveGame.isHome ? 'vs' : '@'} {liveGame.opponent}
                  </Text>
                  {liveGame.homeScore != null && (
                    <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                      {liveGame.isHome ? liveGame.homeScore : liveGame.awayScore}
                      {' – '}
                      {liveGame.isHome ? liveGame.awayScore : liveGame.homeScore}
                    </Text>
                  )}
                </View>
              )}

              {/* RECENT */}
              {recentGames.length > 0 && (
                <>
                  <Text style={{ color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
                    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 }}>
                    RECENT
                  </Text>
                  {recentGames.map((game, i) => {
                    const res = getGameResult(game);
                    const color = res?.result === 'W' ? '#4CAF50' : res?.result === 'L' ? '#F44336' : '#888';
                    return (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center',
                        paddingHorizontal: 16, paddingVertical: 11,
                        borderTopWidth: 1, borderTopColor: '#1A1A1A' }}>
                        <Text style={{ color: '#888', fontSize: 13, width: 82 }}>
                          {formatScheduleDate(game.gameDate)}
                        </Text>
                        <Text style={{ color: '#ccc', fontSize: 14, flex: 1 }}>
                          {game.isHome ? 'vs' : '@'} {game.opponent}
                        </Text>
                        {res && (
                          <Text style={{ color, fontSize: 14, fontWeight: '700' }}>
                            {res.result} {res.teamScore}-{res.oppScore}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </>
              )}

              {/* UPCOMING */}
              {upcomingGames.length > 0 && (
                <>
                  <Text style={{ color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 0.8,
                    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
                    UPCOMING
                  </Text>
                  {upcomingGames.map((game, i) => {
                    const isNext = i === 0 && !liveGame;
                    return (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center',
                        paddingHorizontal: 16, paddingVertical: 11,
                        borderTopWidth: 1, borderTopColor: '#1A1A1A' }}>
                        <Text style={{ color: '#F44336', fontSize: 13, width: 16 }}>
                          {isNext ? '→' : ''}
                        </Text>
                        <Text style={{ color: '#888', fontSize: 13, width: 82, marginLeft: 4 }}>
                          {formatScheduleDate(game.gameDate, true)}
                        </Text>
                        <Text style={{ color: isNext ? '#fff' : '#ccc',
                          fontSize: 14, fontWeight: isNext ? '700' : '400', flex: 1 }}>
                          {game.isHome ? 'vs' : '@'} {game.opponent}
                        </Text>
                        <Text style={{ color: '#888', fontSize: 13 }}>
                          {formatGameTime(game)}
                        </Text>
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
  const { data: followedPlayers = [] } = useFollowedPlayers();
  const toggleFollow = useToggleFollowPlayer();
  const followedIds = followedPlayers.map(p => p.id);

  return (
    <View style={{ backgroundColor: '#0F0F0F', borderBottomWidth: 1, borderBottomColor: '#2A2A2A', marginBottom: 24 }}>
      {/* Header */}
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
            <Text style={{ color: '#555', fontSize: 14, paddingHorizontal: 16, paddingBottom: 16 }}>
              No roster data available
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingBottom: 16 }}>
              {roster.map(player => {
                const isFollowed = followedIds.includes(player.id);
                const initials = player.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <TouchableOpacity
                    key={player.id}
                    onPress={() => onNavigate('PlayerDetail', { playerSlug: player.slug })}
                    style={{ width: '33.3%', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4 }}>
                    {/* Headshot with jersey number badge */}
                    <View style={{ position: 'relative', marginBottom: 8 }}>
                      <View style={{
                        width: 80, height: 80, borderRadius: 40,
                        borderWidth: 2.5, borderColor: teamColor,
                        backgroundColor: '#2A2A2A', overflow: 'hidden',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {player.headshot_url ? (
                          <Image source={{ uri: player.headshot_url }}
                            style={{ width: 80, height: 80 }} contentFit="cover" />
                        ) : (
                          <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>{initials}</Text>
                        )}
                      </View>

                      {/* Jersey number badge */}
                      {player.jersey_number != null && (
                        <View style={{
                          position: 'absolute', top: 0, left: 0,
                          minWidth: 22, height: 22, borderRadius: 11,
                          backgroundColor: teamColor,
                          alignItems: 'center', justifyContent: 'center',
                          paddingHorizontal: 4,
                        }}>
                          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>
                            {player.jersey_number}
                          </Text>
                        </View>
                      )}

                      {/* Follow heart */}
                      <TouchableOpacity
                        onPress={() => toggleFollow.mutate({ playerId: player.id, isFollowing: isFollowed })}
                        style={{
                          position: 'absolute', bottom: 0, right: 0,
                          width: 24, height: 24, borderRadius: 12,
                          backgroundColor: isFollowed ? '#fff' : '#1A1A1A',
                          borderWidth: 1.5, borderColor: '#444',
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                        <Ionicons name={isFollowed ? 'heart' : 'heart-outline'}
                          size={12} color={isFollowed ? '#e11d48' : '#888'} />
                      </TouchableOpacity>
                    </View>

                    {/* Name */}
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600',
                      textAlign: 'center', lineHeight: 16 }} numberOfLines={2}>
                      {player.name}
                    </Text>
                    {/* Position */}
                    {player.position && (
                      <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
                        {player.position}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ─── Today's Episodes ─────────────────────────────────────────────────────────

function TodaysEpisodes({ teamSlug, teamColor, onNavigate }: {
  teamSlug: string; teamColor: string;
  onNavigate: (screen: string, params: any) => void;
}) {
  const { data: pages, isLoading } = useTeamEpisodes(teamSlug);
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();
  const episodes = pages?.pages.flatMap(p => p.episodes).slice(0, 10) || [];

  if (isLoading) return <ActivityIndicator color="#fff" style={{ marginVertical: 24 }} />;
  if (episodes.length === 0) return null;

  return (
    <View style={{ marginBottom: 24 }}>
      <TouchableOpacity
        onPress={() => onNavigate('TeamDetail', { teamSlug })}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 14 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>Today's Episodes</Text>
        <Ionicons name="chevron-forward" size={18} color="#fff" style={{ marginLeft: 4 }} />
      </TouchableOpacity>

      {episodes.map(ep => {
        const isCurrent = currentEpisode?.id === ep.id;
        const artwork = ep.artwork_url || ep.shows?.artwork_url;
        const mins = ep.duration_seconds ? Math.round(ep.duration_seconds / 60) : null;

        return (
          <View key={ep.id} style={{
            marginHorizontal: 16, marginBottom: 12,
            backgroundColor: '#1A1A1A', borderRadius: 14, overflow: 'hidden',
          }}>
            {/* Show name + time */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
              <Text style={{ color: '#888', fontSize: 12, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                {ep.shows?.title || ''}
              </Text>
              <Text style={{ color: '#555', fontSize: 12 }}>{formatRelativeDate(ep.published_at)}</Text>
            </View>

            {/* Artwork */}
            <View style={{ marginHorizontal: 14, borderRadius: 10, overflow: 'hidden',
              backgroundColor: '#2A2A2A', aspectRatio: 1, maxHeight: 200, marginBottom: 10 }}>
              {artwork ? (
                <Image source={{ uri: artwork }}
                  style={{ width: '100%', height: '100%' }} contentFit="cover" />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 40 }}>🎙</Text>
                </View>
              )}
              {mins && (
                <View style={{
                  position: 'absolute', bottom: 8, right: 8,
                  backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 6,
                  paddingHorizontal: 8, paddingVertical: 3,
                }}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{mins} min</Text>
                </View>
              )}
            </View>

            {/* Title */}
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 20,
              paddingHorizontal: 14, marginBottom: 12 }} numberOfLines={2}>
              {ep.title}
            </Text>

            {/* Actions */}
            <View style={{ flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 14, paddingBottom: 14, gap: 12 }}>
              <Ionicons name="share-outline" size={20} color="#666" />
              <Ionicons name="bookmark-outline" size={20} color="#666" />
              <TouchableOpacity
                onPress={() => {
                  if (isCurrent) { togglePlayPause(); }
                  else { playEpisode({ id: ep.id, title: ep.title, showTitle: ep.shows?.title || '',
                    artworkUrl: artwork || undefined, audioUrl: ep.audio_url,
                    durationSeconds: ep.duration_seconds ?? undefined, teamColor }); }
                }}
                style={{
                  marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: teamColor, borderRadius: 24,
                  paddingVertical: 10, paddingHorizontal: 20,
                }}>
                <Ionicons name={isCurrent && isPlaying ? 'pause' : 'play'} size={14} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                  {isCurrent && isPlaying ? 'Pause' : 'Play'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Today Tab ────────────────────────────────────────────────────────────────

function TodayTab({ team, teamSlug, teamColor, schedule, onNavigate }: {
  team: any; teamSlug: string; teamColor: string;
  schedule: ReturnType<typeof useTeamSchedule>;
  onNavigate: (screen: string, params: any) => void;
}) {
  const { data: games = [], isLoading: gamesLoading } = useRecentGames([teamSlug]);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
      {/* Schedule dropdown */}
      <ScheduleDropdown schedule={schedule} />

      {/* Roster dropdown */}
      <RosterDropdown teamSlug={teamSlug} teamColor={teamColor} onNavigate={onNavigate} />

      {/* Scoreboard */}
      {(gamesLoading || games.length > 0) && (
        <View style={{ marginBottom: 24 }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold',
            paddingHorizontal: 16, marginBottom: 14 }}>
            Scoreboard
          </Text>
          {gamesLoading ? (
            <ActivityIndicator color="#fff" style={{ marginLeft: 16 }} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
              {games.map(game => (
                <GameScoreCard key={game.id} game={game} onNavigate={onNavigate} />
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Today's Episodes */}
      <TodaysEpisodes teamSlug={teamSlug} teamColor={teamColor} onNavigate={onNavigate} />
    </ScrollView>
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
              : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20 }}>🎙</Text></View>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
            <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
              {item.publisher} · {item.episode_count} eps
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => followShow.mutate({ showId: item.id, isFollowing: item.isFollowed })}
            style={{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
              backgroundColor: item.isFollowed ? '#2A2A2A' : teamColor,
              borderWidth: item.isFollowed ? 1 : 0, borderColor: '#444',
            }}>
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

function EpisodesTab({ teamSlug, teamColor }: { teamSlug: string; teamColor: string }) {
  const { data: pages, isLoading, fetchNextPage, hasNextPage } = useTeamEpisodes(teamSlug);
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();
  const episodes = pages?.pages.flatMap(p => p.episodes) || [];

  return (
    <FlatList
      data={episodes}
      keyExtractor={item => item.id}
      contentContainerStyle={{ paddingBottom: 120, paddingTop: 4 }}
      onEndReached={() => hasNextPage && fetchNextPage()}
      onEndReachedThreshold={0.3}
      renderItem={({ item }) => {
        const isCurrent = currentEpisode?.id === item.id;
        const artwork = item.artwork_url || item.shows?.artwork_url;
        return (
          <TouchableOpacity
            onPress={() => { isCurrent ? togglePlayPause() : playEpisode({
              id: item.id, title: item.title, showTitle: item.shows?.title || '',
              artworkUrl: artwork || undefined, audioUrl: item.audio_url,
              durationSeconds: item.duration_seconds ?? undefined, teamColor,
            }); }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingHorizontal: 16, paddingVertical: 12,
              borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
            <View style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
              {artwork
                ? <Image source={{ uri: artwork }} style={{ width: 52, height: 52 }} contentFit="cover" />
                : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18 }}>🎙</Text></View>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={2}>{item.title}</Text>
              <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                {item.shows?.title} · {formatRelativeDate(item.published_at)}
              </Text>
            </View>
            <View style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: isCurrent ? teamColor : '#2A2A2A',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name={isCurrent && isPlaying ? 'pause' : 'play'}
                size={12} color={isCurrent ? '#fff' : '#fff'} style={{ marginLeft: isCurrent && isPlaying ? 0 : 1 }} />
            </View>
          </TouchableOpacity>
        );
      }}
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

  const { data: team, isLoading: teamLoading } = useTeam(teamSlug);
  const { data: profile } = useProfile();
  const { data: shows = [] } = useTeamShows(teamSlug);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const schedule = useTeamSchedule(team);

  const teamColor = team?.primary_color || '#FFFFFF';
  const isFollowing = (profile?.topic_slugs || []).includes(teamSlug);

  const onNavigate = (screen: string, params: any) => navigation.navigate(screen, params);

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

      {/* ── Colored header ─────────────────────────────────────────── */}
      <View style={{ backgroundColor: teamColor, paddingTop: 56, paddingBottom: 20, paddingHorizontal: 16 }}>
        {/* Back button */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: 'rgba(0,0,0,0.25)', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
          <Ionicons name="chevron-back" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Logo + name row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          {/* Logo box */}
          <View style={{
            width: 60, height: 60, borderRadius: 12,
            backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {team.logo_url
              ? <Image source={{ uri: team.logo_url }} style={{ width: 48, height: 48 }} contentFit="contain" />
              : <Text style={{ color: '#333', fontWeight: 'bold', fontSize: 16 }}>{team.short_name?.slice(0, 2)}</Text>}
          </View>

          {/* Name + meta */}
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 26 }}>
              {team.name}
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 }}>
              {team.leagues?.short_name}
              {shows.length > 0 ? ` · ${shows.length} Show${shows.length !== 1 ? 's' : ''}` : ''}
            </Text>
            {team.record && (
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 }}>
                {team.record}{team.streak ? ` · ${team.streak}` : ''}
              </Text>
            )}
          </View>

          {/* Follow button */}
          <TouchableOpacity
            onPress={toggleFollow}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 24,
              paddingVertical: 8, paddingHorizontal: 14,
            }}>
            <Ionicons name={isFollowing ? 'heart' : 'heart-outline'} size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
              {isFollowing ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Tab bar ────────────────────────────────────────────────── */}
      <View style={{ backgroundColor: '#1A1A1A', borderBottomWidth: 1, borderBottomColor: '#2A2A2A' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 0 }}>
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={{
                  paddingHorizontal: 16, paddingVertical: 14,
                  borderBottomWidth: 2,
                  borderBottomColor: isActive ? teamColor : 'transparent',
                }}>
                <Text style={{
                  color: isActive ? '#fff' : '#888',
                  fontSize: 14, fontWeight: isActive ? '700' : '500',
                }}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content ────────────────────────────────────────────────── */}
      {activeTab === 'today' && (
        <TodayTab
          team={team}
          teamSlug={teamSlug}
          teamColor={teamColor}
          schedule={schedule}
          onNavigate={onNavigate}
        />
      )}
      {activeTab === 'shows' && (
        <ShowsTab teamSlug={teamSlug} teamColor={teamColor} onNavigate={onNavigate} />
      )}
      {activeTab === 'episodes' && (
        <EpisodesTab teamSlug={teamSlug} teamColor={teamColor} />
      )}
    </View>
  );
}
