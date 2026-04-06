import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { usePlayer } from '../contexts/PlayerContext';

function useDebounce(value: string, delay: number) {
    const [debounced, setDebounced] = useState(value);
    React.useEffect(() => {
      const timer = setTimeout(() => setDebounced(value), delay);
      return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
  }

// ─── Types ───────────────────────────────────────────────────────────────────

interface ShowResult {
  id: string;
  title: string;
  publisher: string | null;
  artwork_url: string | null;
}

interface EpisodeResult {
  id: string;
  title: string;
  audio_url: string;
  artwork_url: string | null;
  duration_seconds: number | null;
  show_id: string;
  show_title: string;
  show_artwork_url: string | null;
  matchReason: string;
}

interface PlayerResult {
  id: string;
  name: string;
  slug: string;
  headshot_url: string | null;
  position: string | null;
  team_name?: string;
  team_primary_color?: string;
}

interface StoryResult {
  id: string;
  headline: string;
  story_type: string;
  episode_count: number;
  show_count: number;
  team_slugs: string[];
}

interface TeamResult {
  id: string;
  name: string;
  slug: string;
  abbreviation: string;
  logo_url: string | null;
  primary_color: string | null;
  league_name: string | null;
  show_count: number;
}

type TabType = 'all' | 'shows' | 'episodes' | 'players';

const STORY_TYPE_COLORS: Record<string, string> = {
  game_result: '#4CAF50',
  game_preview: '#2196F3',
  trade: '#FF9800',
  injury: '#F44336',
  general: '#888',
  player_emergence: '#9C27B0',
  milestone: '#FFD700',
};

// ─── Hooks ───────────────────────────────────────────────────────────────────

function useSearch(query: string) {
    return useQuery({
      queryKey: ['search', query],
      queryFn: async () => {
        // Try RPC first, fall back to direct query
        const showRes = await supabase.rpc('search_shows', {
          search_query: query, result_limit: 20, p_user_id: null
        });
  
        let shows: ShowResult[] = [];
        if (showRes.error || !showRes.data) {
          // Fallback: direct ilike query
          const { data } = await supabase
            .from('shows')
            .select('id, title, publisher, artwork_url')
            .ilike('title', `%${query}%`)
            .in('status', ['active', 'stale'])
            .limit(20);
          shows = (data || []).map((s: any) => ({
            id: s.id, title: s.title, publisher: s.publisher, artwork_url: s.artwork_url,
          }));
        } else {
          shows = (showRes.data || []).map((s: any) => ({
            id: s.id, title: s.title, publisher: s.publisher, artwork_url: s.artwork_url,
          }));
        }
  
        const epRes = await supabase.rpc('search_episodes', {
          search_query: query, result_limit: 30, filter_show_id: null, p_user_id: null
        });
  
        let episodes: EpisodeResult[] = [];
        if (epRes.error || !epRes.data) {
          // Fallback: direct ilike query
          const { data } = await supabase
            .from('episodes')
            .select('id, title, audio_url, artwork_url, duration_seconds, show_id, shows!inner(title, artwork_url)')
            .ilike('title', `%${query}%`)
            .limit(30);
          episodes = (data || []).map((ep: any) => ({
            id: ep.id, title: ep.title, audio_url: ep.audio_url,
            artwork_url: ep.artwork_url, duration_seconds: ep.duration_seconds,
            show_id: ep.show_id, show_title: ep.shows?.title || '',
            show_artwork_url: ep.shows?.artwork_url || null, matchReason: '',
          }));
        } else {
          episodes = (epRes.data || []).map((ep: any) => ({
            id: ep.id, title: ep.title, audio_url: ep.audio_url,
            artwork_url: ep.artwork_url, duration_seconds: ep.duration_seconds,
            show_id: ep.show_id, show_title: ep.show_title,
            show_artwork_url: ep.show_artwork_url, matchReason: ep.match_reason || '',
          }));
        }
  
        return { shows, episodes };
      },
      enabled: query.trim().length >= 2,
      staleTime: 2 * 60 * 1000,
    });
  }
function useSearchPlayers(query: string) {
  return useQuery({
    queryKey: ['search-players', query],
    queryFn: async (): Promise<PlayerResult[]> => {
      const { data: players, error } = await supabase
        .from('players')
        .select('id, name, slug, headshot_url, position, team_slug, sport')
        .ilike('name', `%${query}%`)
        .neq('status', 'inactive')
        .limit(10);

      if (error || !players) return [];

      const teamSlugs = [...new Set(players.map((p: any) => p.team_slug).filter(Boolean))] as string[];
      let teamsMap: Record<string, any> = {};
      if (teamSlugs.length > 0) {
        const { data: teams } = await supabase
          .from('teams').select('slug, name, primary_color').in('slug', teamSlugs);
        if (teams) teamsMap = Object.fromEntries(teams.map((t: any) => [t.slug, t]));
      }

      return players.map((p: any) => ({
        id: p.id, name: p.name, slug: p.slug,
        headshot_url: p.headshot_url, position: p.position,
        team_name: p.team_slug ? teamsMap[p.team_slug]?.name : undefined,
        team_primary_color: p.team_slug ? teamsMap[p.team_slug]?.primary_color : undefined,
      }));
    },
    enabled: query.trim().length >= 2,
  });
}

function useSearchTeams(query: string) {
  return useQuery({
    queryKey: ['search-teams', query],
    queryFn: async (): Promise<TeamResult[]> => {
      const { data, error } = await supabase
        .from('teams')
        .select('id, name, short_name, city, abbreviation, slug, logo_url, primary_color, leagues:league_id(name)')
        .eq('is_active', true)
        .or(`name.ilike.%${query}%,short_name.ilike.%${query}%,city.ilike.%${query}%,abbreviation.ilike.${query}`)
        .limit(5);

      if (error || !data) return [];
      return data.map((t: any) => ({
        id: t.id, name: t.name, slug: t.slug,
        abbreviation: t.abbreviation, logo_url: t.logo_url,
        primary_color: t.primary_color,
        league_name: t.leagues?.name || null,
        show_count: 0,
      }));
    },
    enabled: query.trim().length >= 2,
  });
}

function useSearchStories(query: string) {
  return useQuery({
    queryKey: ['search-stories', query],
    queryFn: async (): Promise<StoryResult[]> => {
      const { data, error } = await supabase.rpc('search_stories', {
        search_query: query, result_limit: 5,
      });
      if (error) return [];
      return (data || []) as StoryResult[];
    },
    enabled: query.trim().length >= 2,
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={{ color: '#888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase',
      letterSpacing: 0.8, paddingHorizontal: 16, marginBottom: 8, marginTop: 4 }}>
      {title}
    </Text>
  );
}

function ShowRow({ show, onNavigate }: { show: ShowResult; onNavigate?: (screen: string, params: any) => void }) {
  return (
    <TouchableOpacity
      onPress={() => onNavigate?.('ShowDetail', { showId: show.id })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1A1A1A',
        marginHorizontal: 16, marginBottom: 8, borderRadius: 12 }}
    >
      <View style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
        {show.artwork_url ? (
          <Image source={{ uri: show.artwork_url }} style={{ width: 56, height: 56 }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#888', fontSize: 14, fontWeight: 'bold' }}>
              {show.title.slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{show.title}</Text>
        {show.publisher && (
          <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{show.publisher}</Text>
        )}
      </View>
      <Text style={{ color: '#555', fontSize: 16 }}>›</Text>
    </TouchableOpacity>
  );
}

function EpisodeRow({ episode, onNavigate }: { episode: EpisodeResult; onNavigate?: (screen: string, params: any) => void }) {
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();
  const isCurrent = currentEpisode?.id === episode.id;
  const artwork = episode.artwork_url || episode.show_artwork_url;

  const handlePlay = () => {
    if (isCurrent) {
      togglePlayPause();
    } else {
      playEpisode({
        id: episode.id, title: episode.title,
        showTitle: episode.show_title, showId: episode.show_id,
        artworkUrl: artwork || undefined, audioUrl: episode.audio_url,
        durationSeconds: episode.duration_seconds || undefined,
      });
    }
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1A1A1A',
      marginHorizontal: 16, marginBottom: 8, borderRadius: 12 }}>
      <TouchableOpacity onPress={handlePlay}>
        <View style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
          {artwork ? (
            <Image source={{ uri: artwork }} style={{ width: 48, height: 48 }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#888', fontSize: 12, fontWeight: 'bold' }}>🎙</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={{ color: isCurrent ? '#E53935' : '#fff', fontSize: 13, fontWeight: '600' }}
          numberOfLines={2}>{episode.title}</Text>
        <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }} numberOfLines={1}>{episode.show_title}</Text>
      </View>
      <TouchableOpacity onPress={handlePlay} style={{
        width: 36, height: 36, borderRadius: 18, backgroundColor: isCurrent ? '#E53935' : '#2A2A2A',
        alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 12 }}>{isCurrent && isPlaying ? '⏸' : '▶'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function PlayerRow({ player, onNavigate }: { player: PlayerResult; onNavigate?: (screen: string, params: any) => void }) {
  const borderColor = player.team_primary_color || '#444';
  return (
    <TouchableOpacity
      onPress={() => onNavigate?.('PlayerDetail', { playerSlug: player.slug })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1A1A1A',
        marginHorizontal: 16, marginBottom: 8, borderRadius: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden',
        backgroundColor: '#2A2A2A', borderWidth: 2, borderColor }}>
        {player.headshot_url ? (
          <Image source={{ uri: player.headshot_url }} style={{ width: 44, height: 44 }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#888', fontSize: 13, fontWeight: 'bold' }}>
              {player.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
            </Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{player.name}</Text>
        <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
          {[player.position, player.team_name].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={{ color: '#555', fontSize: 16 }}>›</Text>
    </TouchableOpacity>
  );
}

function TeamRow({ team, onNavigate }: { team: TeamResult; onNavigate?: (screen: string, params: any) => void }) {
  return (
    <TouchableOpacity
      onPress={() => onNavigate?.('TeamDetail', { teamSlug: team.slug })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1A1A1A',
        marginHorizontal: 16, marginBottom: 8, borderRadius: 12 }}>
      <View style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: '#fff',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        borderWidth: 2, borderColor: team.primary_color || '#333' }}>
        {team.logo_url ? (
          <Image source={{ uri: team.logo_url }} style={{ width: 40, height: 40 }} contentFit="contain" />
        ) : (
          <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 13 }}>{team.abbreviation.slice(0, 3)}</Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>{team.name}</Text>
        <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
          {[team.league_name, team.show_count > 0 ? `${team.show_count} shows` : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={{ color: '#555', fontSize: 16 }}>›</Text>
    </TouchableOpacity>
  );
}

function StoryRow({ story, onNavigate }: { story: StoryResult; onNavigate?: (screen: string, params: any) => void }) {
  const color = STORY_TYPE_COLORS[story.story_type] || '#888';
  return (
    <TouchableOpacity
      onPress={() => onNavigate?.('StoryDetail', { storyId: story.id })}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#1A1A1A',
        marginHorizontal: 16, marginBottom: 8, borderRadius: 12 }}>
      <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: color + '22',
        alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 20 }}>📈</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={2}>{story.headline}</Text>
        <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }}>
          {story.episode_count} eps · {story.show_count} shows
        </Text>
      </View>
      <Text style={{ color: '#555', fontSize: 16 }}>›</Text>
    </TouchableOpacity>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

function TabBar({ activeTab, onSelect, counts }: {
  activeTab: TabType;
  onSelect: (tab: TabType) => void;
  counts: { all: number; shows: number; episodes: number; players: number };
}) {
  const tabs: { key: TabType; label: string }[] = [
    { key: 'all', label: `All (${counts.all})` },
    { key: 'shows', label: `Shows (${counts.shows})` },
    { key: 'episodes', label: `Episodes (${counts.episodes})` },
    { key: 'players', label: `Players (${counts.players})` },
  ];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 4 }}>
      {tabs.map(tab => (
        <TouchableOpacity
          key={tab.key}
          onPress={() => onSelect(tab.key)}
          style={{
            paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
            backgroundColor: activeTab === tab.key ? '#E53935' : '#2A2A2A',
          }}>
          <Text style={{
            color: activeTab === tab.key ? '#fff' : '#aaa',
            fontSize: 13, fontWeight: '600',
          }}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function SearchScreen({ onNavigate }: { onNavigate?: (screen: string, params: any) => void }) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('all');

  const trimmed = useDebounce(query.trim(), 500);
  const isSearching = trimmed.length >= 2;

  const { data: searchData, isLoading: searchLoading } = useSearch(trimmed);
  const { data: players = [] } = useSearchPlayers(trimmed);
  const { data: teams = [] } = useSearchTeams(trimmed);
  const { data: stories = [] } = useSearchStories(trimmed);

  const shows = searchData?.shows || [];
  const episodes = searchData?.episodes || [];

  const counts = {
    all: shows.length + episodes.length + players.length + teams.length + stories.length,
    shows: shows.length,
    episodes: episodes.length,
    players: players.length,
  };

  const isLoading = searchLoading && isSearching;
  const hasResults = counts.all > 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#121212' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 12 }}>Search</Text>
        {/* Search Input */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E1E',
          borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
          <Text style={{ color: '#888', fontSize: 16 }}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Shows, episodes, players, teams..."
            placeholderTextColor="#555"
            style={{ flex: 1, color: '#fff', fontSize: 16 }}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Text style={{ color: '#888', fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Empty state */}
      {!isSearching ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🎙</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 }}>Search GameVoices</Text>
          <Text style={{ color: '#888', fontSize: 14, textAlign: 'center', paddingHorizontal: 32 }}>
            Find shows, episodes, players, teams, and stories
          </Text>
        </View>
      ) : isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#E53935" size="large" />
        </View>
      ) : !hasResults ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🔍</Text>
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 }}>No results</Text>
          <Text style={{ color: '#888', fontSize: 14 }}>Try different search terms</Text>
        </View>
      ) : (
        <>
          {/* Tab bar */}
          <View style={{ marginBottom: 12 }}>
            <TabBar activeTab={activeTab} onSelect={setActiveTab} counts={counts} />
          </View>

          {/* Results */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
            {(activeTab === 'all' || activeTab === 'shows') && shows.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <SectionHeader title="Shows" />
                {(activeTab === 'all' ? shows.slice(0, 4) : shows).map(show => (
                  <ShowRow key={show.id} show={show} onNavigate={onNavigate} />
                ))}
              </View>
            )}

            {activeTab === 'all' && teams.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <SectionHeader title="Teams" />
                {teams.map(team => (
                  <TeamRow key={team.id} team={team} onNavigate={onNavigate} />
                ))}
              </View>
            )}

            {(activeTab === 'all' || activeTab === 'players') && players.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <SectionHeader title="Players" />
                {(activeTab === 'all' ? players.slice(0, 3) : players).map(player => (
                  <PlayerRow key={player.id} player={player} onNavigate={onNavigate} />
                ))}
              </View>
            )}

            {activeTab === 'all' && stories.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <SectionHeader title="Takes" />
                {stories.slice(0, 3).map(story => (
                  <StoryRow key={story.id} story={story} onNavigate={onNavigate} />
                ))}
              </View>
            )}

            {(activeTab === 'all' || activeTab === 'episodes') && episodes.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <SectionHeader title="Episodes" />
                {(activeTab === 'all' ? episodes.slice(0, 6) : episodes).map(ep => (
                  <EpisodeRow key={ep.id} episode={ep} onNavigate={onNavigate} />
                ))}
              </View>
            )}
          </ScrollView>
        </>
      )}
    </KeyboardAvoidingView>
  );
}
