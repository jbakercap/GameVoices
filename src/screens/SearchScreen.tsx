import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { usePlayer } from '../contexts/PlayerContext';
import { useEpisodesPlayback } from '../hooks/queries/useEpisodesPlayback';

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
  description: string | null;
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
  matchSource: string;
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

interface RelatedTags {
  people: string[];
  topics: string[];
}

type TabType = 'all' | 'shows' | 'episodes' | 'players' | 'stories';

const STORY_TYPE_COLORS: Record<string, string> = {
  game_result: '#4CAF50',
  game_preview: '#2196F3',
  trade: '#FF9800',
  injury: '#F44336',
  general: '#888',
  player_emergence: '#9C27B0',
  milestone: '#FFD700',
};

const EPISODES_PER_PAGE = 20;

// ─── Hooks ───────────────────────────────────────────────────────────────────

function extractRelatedTags(episodes: any[]): RelatedTags {
  const people = new Map<string, number>();
  const topics = new Map<string, number>();
  episodes.forEach(ep => {
    const tags = ep.extracted_tags;
    if (!tags) return;
    (tags.people || []).forEach((t: string) => people.set(t, (people.get(t) || 0) + 1));
    (tags.topics || []).forEach((t: string) => topics.set(t, (topics.get(t) || 0) + 1));
  });
  const sort = (m: Map<string, number>) =>
    Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
  return { people: sort(people), topics: sort(topics) };
}

function useSearchData(query: string, episodeLimit: number) {
  return useQuery({
    queryKey: ['search', query, episodeLimit],
    queryFn: async () => {
      const [showRes, epRes] = await Promise.all([
        supabase.rpc('search_shows', { search_query: query, result_limit: 20, p_user_id: null }),
        supabase.rpc('search_episodes', { search_query: query, result_limit: episodeLimit, filter_show_id: null, p_user_id: null }),
      ]);

      let shows: ShowResult[] = [];
      if (showRes.error || !showRes.data) {
        const { data } = await supabase
          .from('shows').select('id, title, publisher, description, artwork_url')
          .ilike('title', `%${query}%`).in('status', ['active', 'stale']).limit(20);
        shows = (data || []).map((s: any) => ({
          id: s.id, title: s.title, publisher: s.publisher,
          description: s.description || null, artwork_url: s.artwork_url,
        }));
      } else {
        shows = (showRes.data || []).map((s: any) => ({
          id: s.id, title: s.title, publisher: s.publisher,
          description: s.description || null, artwork_url: s.artwork_url,
        }));
      }

      let episodes: EpisodeResult[] = [];
      if (epRes.error || !epRes.data) {
        const { data } = await supabase
          .from('episodes')
          .select('id, title, audio_url, artwork_url, duration_seconds, show_id, shows!inner(title, artwork_url)')
          .ilike('title', `%${query}%`).limit(episodeLimit);
        episodes = (data || []).map((ep: any) => ({
          id: ep.id, title: ep.title, audio_url: ep.audio_url,
          artwork_url: ep.artwork_url, duration_seconds: ep.duration_seconds,
          show_id: ep.show_id, show_title: ep.shows?.title || '',
          show_artwork_url: ep.shows?.artwork_url || null,
          matchReason: '', matchSource: 'title',
        }));
      } else {
        episodes = (epRes.data || []).map((ep: any) => ({
          id: ep.id, title: ep.title, audio_url: ep.audio_url,
          artwork_url: ep.artwork_url, duration_seconds: ep.duration_seconds,
          show_id: ep.show_id, show_title: ep.show_title,
          show_artwork_url: ep.show_artwork_url || null,
          matchReason: ep.match_reason || '', matchSource: ep.match_source || 'title',
        }));
      }

      const relatedTags = extractRelatedTags(epRes.data || []);
      return { shows, episodes, relatedTags, totalEpisodes: episodes.length };
    },
    enabled: query.trim().length >= 2,
    staleTime: 2 * 60 * 1000,
  });
}

function useSearchSuggestions(query: string) {
  return useQuery({
    queryKey: ['search-suggestions', query],
    queryFn: async (): Promise<{ suggestion: string; suggestionType: string }[]> => {
      const { data, error } = await supabase.rpc('search_suggestions', {
        query_prefix: query.trim(), max_results: 5,
      });
      if (error) return [];
      return (data || []).map((item: any) => ({
        suggestion: item.suggestion,
        suggestionType: item.suggestion_type,
      }));
    },
    enabled: query.trim().length >= 2,
    staleTime: 60 * 1000,
  });
}

function useSearchPlayers(query: string) {
  return useQuery({
    queryKey: ['search-players', query],
    queryFn: async (): Promise<PlayerResult[]> => {
      const { data: players, error } = await supabase
        .from('players')
        .select('id, name, slug, headshot_url, position, team_slug')
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
        {show.description && (
          <Text style={{ color: '#666', fontSize: 11, marginTop: 2 }} numberOfLines={1}>{show.description}</Text>
        )}
      </View>
      <Text style={{ color: '#555', fontSize: 16 }}>›</Text>
    </TouchableOpacity>
  );
}

function EpisodeRow({
  episode, onNavigate, isPlayed,
}: {
  episode: EpisodeResult;
  onNavigate?: (screen: string, params: any) => void;
  isPlayed?: boolean;
}) {
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
      marginHorizontal: 16, marginBottom: 8, borderRadius: 12,
      opacity: isPlayed && !isCurrent ? 0.65 : 1 }}>
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ color: isCurrent ? '#F0B429' : '#fff', fontSize: 13, fontWeight: '600', flexShrink: 1 }}
            numberOfLines={2}>{episode.title}</Text>
          {episode.matchSource === 'fuzzy' && (
            <View style={{ backgroundColor: '#333', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
              <Text style={{ color: '#aaa', fontSize: 10 }}>Similar</Text>
            </View>
          )}
        </View>
        <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }} numberOfLines={1}>{episode.show_title}</Text>
      </View>
      <TouchableOpacity onPress={handlePlay} style={{
        width: 36, height: 36, borderRadius: 18, backgroundColor: isCurrent ? '#F0B429' : '#2A2A2A',
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
  counts: { all: number; shows: number; episodes: number; players: number; stories: number };
}) {
  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'shows', label: 'Shows', count: counts.shows },
    { key: 'episodes', label: 'Episodes', count: counts.episodes },
    { key: 'players', label: 'Players', count: counts.players },
    { key: 'stories', label: 'Takes', count: counts.stories },
  ].filter(t => t.key === 'all' || t.count > 0) as { key: TabType; label: string; count: number }[];

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 4 }}>
      {tabs.map(tab => (
        <TouchableOpacity
          key={tab.key}
          onPress={() => onSelect(tab.key)}
          style={{
            paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
            backgroundColor: activeTab === tab.key ? '#F0B429' : '#2A2A2A',
          }}>
          <Text style={{
            color: activeTab === tab.key ? '#fff' : '#aaa',
            fontSize: 13, fontWeight: '600',
          }}>
            {tab.label}{tab.count > 0 ? ` (${tab.count})` : ''}
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
  const [episodeLimit, setEpisodeLimit] = useState(EPISODES_PER_PAGE);

  const trimmed = useDebounce(query.trim(), 500);
  const isSearching = trimmed.length >= 2;

  const { data: searchData, isLoading: searchLoading } = useSearchData(trimmed, episodeLimit);
  const { data: players = [] } = useSearchPlayers(trimmed);
  const { data: teams = [] } = useSearchTeams(trimmed);
  const { data: stories = [] } = useSearchStories(trimmed);
  const { data: suggestions = [] } = useSearchSuggestions(trimmed);

  const shows = searchData?.shows || [];
  const episodes = searchData?.episodes || [];
  const relatedTags = searchData?.relatedTags;

  // Collect episode IDs for playback state
  const episodeIds = useMemo(() => episodes.map(e => e.id), [episodes]);
  const { data: playbackMap = {} } = useEpisodesPlayback(episodeIds);

  // "Did you mean" — only show when most results are fuzzy
  const hasFuzzyMatches = useMemo(
    () => episodes.length > 0 && episodes.every(ep => ep.matchSource === 'fuzzy'),
    [episodes]
  );
  const didYouMeanSuggestion = useMemo(() => {
    if (!hasFuzzyMatches || suggestions.length === 0) return null;
    return suggestions.find(s => s.suggestion.toLowerCase() !== trimmed.toLowerCase())?.suggestion || null;
  }, [hasFuzzyMatches, suggestions, trimmed]);

  const allRelatedTags = useMemo(() => {
    if (!relatedTags) return [];
    return [
      ...relatedTags.people.map(t => ({ tag: t, type: 'person' })),
      ...relatedTags.topics.map(t => ({ tag: t, type: 'topic' })),
    ].slice(0, 8);
  }, [relatedTags]);

  const counts = {
    all: shows.length + episodes.length + players.length + teams.length + stories.length,
    shows: shows.length,
    episodes: episodes.length,
    players: players.length,
    stories: stories.length,
  };

  const isLoading = searchLoading && isSearching;
  const hasResults = counts.all > 0;
  const hasMoreEpisodes = episodes.length >= episodeLimit;

  const handleTagPress = useCallback((tag: string) => {
    setQuery(tag);
    setEpisodeLimit(EPISODES_PER_PAGE);
  }, []);

  const handleLoadMore = useCallback(() => {
    setEpisodeLimit(prev => prev + EPISODES_PER_PAGE);
  }, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#121212' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold', marginBottom: 12 }}>Search</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E1E',
          borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
          <Text style={{ color: '#888', fontSize: 16 }}>🔍</Text>
          <TextInput
            value={query}
            onChangeText={text => { setQuery(text); setEpisodeLimit(EPISODES_PER_PAGE); }}
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
          <ActivityIndicator color="#F0B429" size="large" />
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

            {/* "Did you mean" banner */}
            {didYouMeanSuggestion && (activeTab === 'all' || activeTab === 'episodes') && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6,
                marginHorizontal: 16, marginBottom: 12, backgroundColor: '#1E1E1E',
                borderRadius: 10, padding: 12 }}>
                <Text style={{ color: '#888', fontSize: 13 }}>✨ Did you mean:</Text>
                <TouchableOpacity onPress={() => handleTagPress(didYouMeanSuggestion)}>
                  <Text style={{ color: '#F0B429', fontSize: 13, fontWeight: '600' }}>
                    {didYouMeanSuggestion}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Related tags */}
            {allRelatedTags.length > 0 && (activeTab === 'all') && (
              <View style={{ marginBottom: 16 }}>
                <SectionHeader title="Related" />
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
                  {allRelatedTags.map(({ tag, type }) => (
                    <TouchableOpacity
                      key={`${type}-${tag}`}
                      onPress={() => handleTagPress(tag)}
                      style={{ backgroundColor: '#2A2A2A', borderRadius: 16,
                        paddingHorizontal: 12, paddingVertical: 6 }}>
                      <Text style={{ color: '#ccc', fontSize: 13 }}>{tag}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

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

            {(activeTab === 'all' || activeTab === 'stories') && stories.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <SectionHeader title="Takes" />
                {(activeTab === 'all' ? stories.slice(0, 3) : stories).map(story => (
                  <StoryRow key={story.id} story={story} onNavigate={onNavigate} />
                ))}
              </View>
            )}

            {(activeTab === 'all' || activeTab === 'episodes') && episodes.length > 0 && (
              <View style={{ marginBottom: 16 }}>
                <SectionHeader title="Episodes" />
                {(activeTab === 'all' ? episodes.slice(0, 6) : episodes).map(ep => (
                  <EpisodeRow
                    key={ep.id}
                    episode={ep}
                    onNavigate={onNavigate}
                    isPlayed={!!(playbackMap[ep.id]?.position_seconds > 0 || playbackMap[ep.id]?.completed)}
                  />
                ))}
                {activeTab === 'episodes' && hasMoreEpisodes && (
                  <TouchableOpacity
                    onPress={handleLoadMore}
                    style={{ marginHorizontal: 16, marginTop: 4, paddingVertical: 12,
                      backgroundColor: '#1E1E1E', borderRadius: 10, alignItems: 'center' }}>
                    <Text style={{ color: '#aaa', fontSize: 14, fontWeight: '500' }}>Load more episodes</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

          </ScrollView>
        </>
      )}
    </KeyboardAvoidingView>
  );
}
