import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLeagues } from '../hooks/useLeagues';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { navigate } from '../lib/navigationRef';
import { useBrowseGameStories, GameStory } from '../hooks/queries/useBrowseGameStories';
import { useBrowseRegionalShows } from '../hooks/queries/useBrowseRegionalShows';
import { useUserTeams } from '../hooks/useUserTeams';
import { ShowDiscoverySections } from '../components/ShowDiscoverySections';
import { GameVoicesLogo } from '../components/GameVoicesLogo';

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useFollowedShows() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['followed-shows', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('user_library')
        .select('show_id')
        .eq('user_id', user.id)
        .eq('item_type', 'follow');
      if (error) throw error;
      return (data || []).map((r: any) => r.show_id);
    },
    staleTime: 2 * 60 * 1000,
  });
}

function useShowsByLeague(leagueId: string | null) {
  return useQuery({
    queryKey: ['shows-by-league', leagueId],
    queryFn: async () => {
      if (!leagueId) return [];
      const { data, error } = await supabase
        .from('shows')
        .select('id, title, artwork_url, episode_count, team_id, league_id')
        .eq('league_id', leagueId)
        .eq('status', 'active')
        .eq('is_fantasy_show', false)
        .eq('is_betting_show', false)
        .order('episode_count', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!leagueId,
    staleTime: 10 * 60 * 1000,
  });
}

function useNationalShows(sport = 'all') {
  return useQuery({
    queryKey: ['national-shows', sport],
    queryFn: async () => {
      if (sport === 'all') {
        const { data: league } = await supabase
          .from('leagues')
          .select('id')
          .eq('slug', 'general')
          .single();
        if (!league) return [];
        const { data, error } = await supabase
          .from('shows')
          .select('id, title, artwork_url, episode_count')
          .eq('league_id', (league as any).id)
          .eq('status', 'active')
          .order('episode_count', { ascending: false })
          .limit(20);
        if (error) return [];
        return data || [];
      }
      const { data: league } = await supabase
        .from('leagues')
        .select('id')
        .eq('slug', sport)
        .single();
      if (!league) return [];
      const { data, error } = await supabase
        .from('shows')
        .select('id, title, artwork_url, episode_count')
        .eq('league_id', (league as any).id)
        .is('team_id', null)
        .eq('status', 'active')
        .eq('is_fantasy_show', false)
        .eq('is_betting_show', false)
        .order('episode_count', { ascending: false })
        .limit(20);
      if (error) return [];
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ─── Components ──────────────────────────────────────────────────────────────

function SearchBar() {
  return (
    <TouchableOpacity
      onPress={() => navigate('Search', {})}
      style={{
        flexDirection: 'row', alignItems: 'center',
        marginHorizontal: 16, marginBottom: 20,
        backgroundColor: '#1E1E1E',
        borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
        borderWidth: 1, borderColor: '#2A2A2A',
        gap: 10,
      }}
      activeOpacity={0.7}
    >
      <Ionicons name="search" size={18} color="#555" />
      <Text style={{ color: '#555', fontSize: 15 }}>Shows, episodes, teams...</Text>
    </TouchableOpacity>
  );
}

function LeaguePill({ label, selected, onPress }: {
  label: string; selected: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        backgroundColor: selected ? '#fff' : 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: selected ? 'transparent' : 'rgba(255,255,255,0.25)',
      }}>
      <Text style={{ color: selected ? '#000' : '#888', fontWeight: '600', fontSize: 14 }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ShowCard({ show }: { show: any }) {
  return (
    <TouchableOpacity onPress={() => navigate('ShowDetail', { showId: show.id })} style={{ width: 110, marginRight: 12 }}>
      <View style={{
        width: 110, height: 110, borderRadius: 12,
        backgroundColor: '#2A2A2A', overflow: 'hidden', marginBottom: 6,
      }}>
        {show.artwork_url ? (
          <Image source={{ uri: show.artwork_url }} style={{ width: 110, height: 110 }} contentFit="cover" accessible={false} pointerEvents="none" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 32 }}>🎙</Text>
          </View>
        )}
      </View>
      <Text style={{ color: '#ccc', fontSize: 11, fontWeight: '500' }} numberOfLines={2}>
        {show.title}
      </Text>
      {show.episode_count > 0 && (
        <Text style={{ color: '#555', fontSize: 10, marginTop: 2 }}>{show.episode_count} eps</Text>
      )}
    </TouchableOpacity>
  );
}

/** Compact horizontal card used on the All tab scoreboard shelf */
function ScoreboardCard({ story }: { story: GameStory }) {
  const hasScore = story.home_score !== null && story.away_score !== null;
  const homeWon = hasScore && story.home_score! > story.away_score!;
  const awayWon = hasScore && story.away_score! > story.home_score!;

  return (
    <TouchableOpacity
      onPress={() => navigate('GameFeed', {
        storyIds: story.all_story_ids,
        title: story.away_short_name && story.home_short_name
          ? `${story.away_short_name} vs ${story.home_short_name}`
          : story.headline,
        homeTeamSlug: story.home_team_slug || '',
        awayTeamSlug: story.away_team_slug || '',
        homeColor: story.home_primary_color || '#333',
        awayColor: story.away_primary_color || '#333',
        homeShortName: story.home_short_name || story.home_abbr || '',
        awayShortName: story.away_short_name || story.away_abbr || '',
      })}
      style={{
        width: 160, marginRight: 10,
        backgroundColor: '#1A1A1A', borderRadius: 14,
        borderWidth: 1, borderColor: '#272727',
        padding: 13,
      }}
      activeOpacity={0.8}
    >
      {/* Away */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <View style={{
          width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 8,
        }}>
          {story.away_logo
            ? <Image source={{ uri: story.away_logo }} style={{ width: 20, height: 20 }} contentFit="contain" />
            : <Text style={{ color: '#000', fontSize: 9, fontWeight: 'bold' }}>{story.away_abbr?.slice(0, 3) || '?'}</Text>
          }
        </View>
        <Text style={{ color: awayWon ? '#fff' : '#666', fontSize: 13, fontWeight: awayWon ? '700' : '400', flex: 1 }} numberOfLines={1}>
          {story.away_abbr || 'AWAY'}
        </Text>
        {hasScore && (
          <Text style={{ color: awayWon ? '#fff' : '#555', fontSize: 16, fontWeight: '700' }}>
            {story.away_score}
          </Text>
        )}
      </View>

      {/* Home */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 11 }}>
        <View style={{
          width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 8,
        }}>
          {story.home_logo
            ? <Image source={{ uri: story.home_logo }} style={{ width: 20, height: 20 }} contentFit="contain" />
            : <Text style={{ color: '#000', fontSize: 9, fontWeight: 'bold' }}>{story.home_abbr?.slice(0, 3) || '?'}</Text>
          }
        </View>
        <Text style={{ color: homeWon ? '#fff' : '#666', fontSize: 13, fontWeight: homeWon ? '700' : '400', flex: 1 }} numberOfLines={1}>
          {story.home_abbr || 'HOME'}
        </Text>
        {hasScore && (
          <Text style={{ color: homeWon ? '#fff' : '#555', fontSize: 16, fontWeight: '700' }}>
            {story.home_score}
          </Text>
        )}
      </View>

      {/* Footer */}
      <View style={{ borderTopWidth: 1, borderTopColor: '#272727', paddingTop: 9, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {story.episode_count > 0 ? (
          <>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' }} />
            <Text style={{ color: '#22c55e', fontSize: 11, fontWeight: '600', flex: 1 }}>
              {story.episode_count} eps
            </Text>
          </>
        ) : (
          <Text style={{ color: '#3A3A3A', fontSize: 11, flex: 1 }}>No episodes</Text>
        )}
        {story.sport && (
          <Text style={{ color: '#444', fontSize: 10, fontWeight: '600', letterSpacing: 0.5 }}>
            {story.sport.toUpperCase()}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

/** Card used on sport-specific tabs */
function GameRow({ story }: { story: GameStory }) {
  const hasScore = story.home_score !== null && story.away_score !== null;
  const homeWon = hasScore && story.home_score! > story.away_score!;
  const awayWon = hasScore && story.away_score! > story.home_score!;
  const date = story.event_date
    ? new Date(story.event_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';

  return (
    <TouchableOpacity
      onPress={() => navigate('GameFeed', {
        storyIds: story.all_story_ids,
        title: story.away_short_name && story.home_short_name
          ? `${story.away_short_name} vs ${story.home_short_name}`
          : story.headline,
        homeTeamSlug: story.home_team_slug || '',
        awayTeamSlug: story.away_team_slug || '',
        homeColor: story.home_primary_color || '#333',
        awayColor: story.away_primary_color || '#333',
        homeShortName: story.home_short_name || story.home_abbr || '',
        awayShortName: story.away_short_name || story.away_abbr || '',
      })}
      style={{
        backgroundColor: '#1A1A1A',
        borderRadius: 14,
        borderWidth: 1, borderColor: '#272727',
        marginHorizontal: 16, marginBottom: 10,
        padding: 14,
      }}
      activeOpacity={0.75}
    >
      {/* Away */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 9 }}>
        <View style={{
          width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 10,
        }}>
          {story.away_logo
            ? <Image source={{ uri: story.away_logo }} style={{ width: 22, height: 22 }} contentFit="contain" />
            : <Text style={{ color: '#000', fontSize: 8, fontWeight: 'bold' }}>{story.away_abbr?.slice(0, 3)}</Text>
          }
        </View>
        <Text style={{ color: awayWon ? '#fff' : '#777', fontSize: 15, fontWeight: awayWon ? '700' : '400', flex: 1 }}>
          {story.away_abbr || 'AWAY'}
        </Text>
        {hasScore && (
          <Text style={{ color: awayWon ? '#fff' : '#555', fontSize: 17, fontWeight: '700', minWidth: 30, textAlign: 'right' }}>
            {story.away_score}
          </Text>
        )}
      </View>

      {/* Home */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <View style={{
          width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 10,
        }}>
          {story.home_logo
            ? <Image source={{ uri: story.home_logo }} style={{ width: 22, height: 22 }} contentFit="contain" />
            : <Text style={{ color: '#000', fontSize: 8, fontWeight: 'bold' }}>{story.home_abbr?.slice(0, 3)}</Text>
          }
        </View>
        <Text style={{ color: homeWon ? '#fff' : '#777', fontSize: 15, fontWeight: homeWon ? '700' : '400', flex: 1 }}>
          {story.home_abbr || 'HOME'}
        </Text>
        {hasScore && (
          <Text style={{ color: homeWon ? '#fff' : '#555', fontSize: 17, fontWeight: '700', minWidth: 30, textAlign: 'right' }}>
            {story.home_score}
          </Text>
        )}
      </View>

      {/* Footer: date left, episodes + chevron right */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        borderTopWidth: 1, borderTopColor: '#272727', paddingTop: 10,
      }}>
        <Text style={{ color: '#555', fontSize: 12, flex: 1 }}>
          {hasScore ? `FINAL · ${date}` : date}
        </Text>
        {story.episode_count > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#22c55e' }} />
            <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '600' }}>
              {story.episode_count} episode{story.episode_count !== 1 ? 's' : ''}
            </Text>
            <Ionicons name="chevron-forward" size={13} color="#22c55e" />
          </View>
        ) : (
          <Text style={{ color: '#3A3A3A', fontSize: 12 }}>No episodes yet</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function BrowseScreen() {
  const [selectedLeague, setSelectedLeague] = useState('all');

  const { data: leagues, isLoading: leaguesLoading } = useLeagues();
  const { data: userTeams = [] } = useUserTeams();
  const { data: followedShowIds = [] } = useFollowedShows();

  const leagueIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    (leagues || []).forEach((l: any) => { map[l.slug] = l.id; });
    return map;
  }, [leagues]);

  // Map league slug → league sport value (what the stories table uses)
  const leagueSportMap = useMemo(() => {
    const map: Record<string, string> = {};
    (leagues || []).forEach((l: any) => { if (l.sport) map[l.slug] = l.sport; });
    return map;
  }, [leagues]);

  // Hardcoded fallback: league slug → stories.sport value
  const SLUG_TO_SPORT: Record<string, string> = {
    mlb: 'baseball',
    nba: 'basketball',
    nfl: 'football',
    nhl: 'hockey',
    ncaaf: 'football',
    ncaab: 'basketball',
    wnba: 'basketball',
    mls: 'soccer',
  };

  const selectedLeagueId = selectedLeague !== 'all' ? leagueIdMap[selectedLeague] : null;
  const selectedSport = selectedLeague !== 'all'
    ? (leagueSportMap[selectedLeague] ?? SLUG_TO_SPORT[selectedLeague] ?? selectedLeague)
    : undefined;
  const leagueShortName = (leagues || []).find((l: any) => l.slug === selectedLeague)?.short_name || '';

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: gameStories = [], isLoading: loadingScoreboard } = useBrowseGameStories(selectedSport);
  const { data: leagueShows, isLoading: loadingShows } = useShowsByLeague(selectedLeagueId);
  const { data: nationalShows, isLoading: loadingNational } = useNationalShows(selectedLeague);
  const { data: regionalShows = [], isLoading: loadingRegional } = useBrowseRegionalShows(
    selectedLeague === 'all' ? undefined : selectedLeague
  );

  if (leaguesLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <GameVoicesLogo size={32} />
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>Discover</Text>
        </View>
        <SearchBar />
      </View>

      {/* League switcher */}
      <View style={{ marginBottom: 16 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4 }}>
          <LeaguePill label="All" selected={selectedLeague === 'all'} onPress={() => setSelectedLeague('all')} />
          {(leagues || []).map((league: any) => (
            <LeaguePill
              key={league.slug}
              label={league.short_name}
              selected={selectedLeague === league.slug}
              onPress={() => setSelectedLeague(league.slug)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {selectedLeague === 'all' ? (
          // ── All tab ──────────────────────────────────────────────────────────
          <>
            {/* For You — personalized shelves based on followed teams */}
            <ShowDiscoverySections
              userTeams={userTeams}
              followedShowIds={followedShowIds}
              onNavigate={(screen, params) => navigate(screen, params)}
            />

            {/* Recent Games — all sports mixed */}
            {(loadingScoreboard || gameStories.length > 0) && (
              <SectionShelf title="Recent Games" loading={loadingScoreboard}>
                {gameStories.map(story => (
                  <ScoreboardCard key={story.id} story={story} />
                ))}
              </SectionShelf>
            )}

            {/* Popular Shows — general/national content */}
            <SectionShelf
              title="Popular Shows"
              subtitle="The biggest voices in sports"
              loading={loadingNational}
            >
              {(nationalShows || []).map((show: any) => (
                <ShowCard key={show.id} show={show} />
              ))}
            </SectionShelf>
          </>
        ) : (
          // ── Sport tab ─────────────────────────────────────────────────────
          <>
            {/* Recent Games — card list */}
            {(loadingScoreboard || gameStories.length > 0) && (
              <View style={{ marginBottom: 28 }}>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 14 }}>
                  Recent {leagueShortName} Games
                </Text>
                {loadingScoreboard ? (
                  <ActivityIndicator color="#FFFFFF" style={{ padding: 20 }} />
                ) : (
                  gameStories.map(story => (
                    <GameRow key={story.id} story={story} />
                  ))
                )}
              </View>
            )}

            {/* Popular league shows */}
            <SectionShelf
              title={`Popular ${leagueShortName} Shows`}
              loading={loadingShows}
            >
              {(leagueShows || []).map((show: any) => (
                <ShowCard key={show.id} show={show} />
              ))}
            </SectionShelf>

            {/* National shows for this sport */}
            {(loadingNational || (nationalShows || []).length > 0) && (
              <SectionShelf
                title={`${leagueShortName} National Shows`}
                loading={loadingNational}
              >
                {(nationalShows || []).map((show: any) => (
                  <ShowCard key={show.id} show={show} />
                ))}
              </SectionShelf>
            )}

            {/* Regional shows */}
            {(loadingRegional || regionalShows.length > 0) && (
              <SectionShelf title="Regional Shows" loading={loadingRegional}>
                {regionalShows.map((show: any) => (
                  <ShowCard key={show.id} show={show} />
                ))}
              </SectionShelf>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── SectionShelf ─────────────────────────────────────────────────────────────

function SectionShelf({
  title, subtitle, loading, children,
}: {
  title: string;
  subtitle?: string;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{ paddingHorizontal: 16, marginBottom: subtitle ? 4 : 12 }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>{title}</Text>
      </View>
      {subtitle && (
        <Text style={{ color: '#888', fontSize: 13, paddingHorizontal: 16, marginBottom: 12 }}>
          {subtitle}
        </Text>
      )}
      {loading ? (
        <ActivityIndicator color="#FFFFFF" style={{ padding: 20 }} />
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}>
          {children}
        </ScrollView>
      )}
    </View>
  );
}
