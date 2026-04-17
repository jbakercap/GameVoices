import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, SafeAreaView,
} from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { usePlayer } from '../contexts/PlayerContext';

const STORY_TYPE_COLORS: Record<string, string> = {
  game_result: '#4CAF50',
  game_preview: '#2196F3',
  trade: '#FF9800',
  signing: '#FF9800',
  injury: '#F44336',
  general: '#888',
  player_emergence: '#9C27B0',
  award_candidacy: '#FFD700',
  coaching: '#00BCD4',
  milestone: '#FFD700',
  draft: '#888',
  offseason: '#888',
};

// ── Hooks ──

async function resolveLinkedPlayerIds(playerId: string): Promise<string[]> {
  const { data: player } = await supabase
    .from('players')
    .select('id, name, sport')
    .eq('id', playerId)
    .single();
  if (!player) return [playerId];

  const { data: linked } = await supabase
    .from('players')
    .select('id')
    .eq('name', player.name)
    .eq('sport', player.sport)
    .eq('role', 'player');

  if (!linked?.length) return [playerId];
  return [...new Set(linked.map((p: any) => p.id))];
}

function usePlayerProfile(slug: string) {
  return useQuery({
    queryKey: ['player-profile', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('players')
        .select('id, name, slug, position, jersey_number, role, headshot_url, status, team_slug, sport')
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      let teamInfo = null;
      if (data.team_slug) {
        const { data: team } = await supabase
          .from('teams')
          .select('name, primary_color, logo_url')
          .eq('slug', data.team_slug)
          .maybeSingle();
        teamInfo = team;
      }

      return {
        ...data,
        team_name: teamInfo?.name ?? null,
        team_primary_color: teamInfo?.primary_color ?? null,
        team_logo_url: teamInfo?.logo_url ?? null,
      };
    },
    enabled: !!slug,
    staleTime: 15 * 60 * 1000,
  });
}

function usePlayerStories(playerId: string | undefined) {
  return useQuery({
    queryKey: ['player-stories', playerId],
    queryFn: async () => {
      const linkedIds = await resolveLinkedPlayerIds(playerId!);
      const { data, error } = await supabase
        .from('player_stories')
        .select('story_id, stories!inner(id, headline, story_type, sport, team_slugs, people, episode_count, show_count, event_date, expires_at, status)')
        .in('player_id', linkedIds)
        .gt('stories.expires_at', new Date().toISOString())
        .eq('stories.status', 'active')
        .limit(20);
      if (error) throw error;

      const seen = new Set<string>();
      return (data || [])
        .map((row: any) => row.stories)
        .filter((s: any) => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });
    },
    enabled: !!playerId,
    staleTime: 5 * 60 * 1000,
  });
}

function usePlayerEpisodes(playerId: string | undefined) {
  return useQuery({
    queryKey: ['player-episodes', playerId],
    queryFn: async () => {
      const linkedIds = await resolveLinkedPlayerIds(playerId!);
      const { data, error } = await supabase
        .from('player_episodes')
        .select('episode_id, episodes!inner(id, title, audio_url, artwork_url, duration_seconds, published_at, show_id, shows!inner(id, title, artwork_url))')
        .in('player_id', linkedIds)
        .order('published_at', { referencedTable: 'episodes', ascending: false })
        .limit(20);
      if (error) throw error;

      const seen = new Set<string>();
      return (data || [])
        .map((row: any) => ({ ...row.episodes, shows: row.episodes.shows }))
        .filter((ep: any) => {
          if (seen.has(ep.id)) return false;
          seen.add(ep.id);
          return true;
        });
    },
    enabled: !!playerId,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Helper ──
function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Sub-components ──

function PlayerInitials({ name, size = 100 }: { name: string; size?: number }) {
  const initials = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ color: '#888', fontSize: size * 0.3, fontWeight: 'bold' }}>{initials}</Text>
    </View>
  );
}

function StoryRow({ story, onPress }: { story: any; onPress: () => void }) {
  const typeColor = STORY_TYPE_COLORS[story.story_type] || '#888';
  return (
    <TouchableOpacity onPress={onPress} style={{
      backgroundColor: '#1E1E1E', borderRadius: 12,
      padding: 14, marginBottom: 10,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <View style={{
          backgroundColor: typeColor + '22', borderRadius: 4,
          paddingHorizontal: 8, paddingVertical: 3,
        }}>
          <Text style={{ color: typeColor, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>
            {story.story_type.replace(/_/g, ' ')}
          </Text>
        </View>
        {story.event_date && (
          <Text style={{ color: '#555', fontSize: 11, marginLeft: 8 }}>
            {formatDate(story.event_date)}
          </Text>
        )}
      </View>
      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600', lineHeight: 22, marginBottom: 8 }}>
        {story.headline}
      </Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Text style={{ color: '#888', fontSize: 12 }}>📻 {story.show_count} shows</Text>
        <Text style={{ color: '#888', fontSize: 12 }}>🎙 {story.episode_count} eps</Text>
      </View>
    </TouchableOpacity>
  );
}

function EpisodeRow({ episode }: { episode: any }) {
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();
  const artwork = episode.artwork_url || episode.shows?.artwork_url;
  const isCurrentEpisode = currentEpisode?.id === episode.id;

  const handlePlay = () => {
    if (isCurrentEpisode) {
      togglePlayPause();
    } else {
      playEpisode({
        id: episode.id,
        title: episode.title,
        showTitle: episode.shows?.title || '',
        showId: episode.show_id,
        artworkUrl: artwork,
        audioUrl: episode.audio_url,
        durationSeconds: episode.duration_seconds,
      });
    }
  };

  return (
    <TouchableOpacity style={{
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: '#1E1E1E',
    }}>
      <View style={{
        width: 56, height: 56, borderRadius: 8,
        backgroundColor: '#2A2A2A', overflow: 'hidden',
        marginRight: 12, flexShrink: 0,
      }}>
        {artwork ? (
          <Image source={{ uri: artwork }} style={{ width: 56, height: 56 }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
              {episode.shows?.title?.slice(0, 2).toUpperCase() || 'EP'}
            </Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 18 }}
          numberOfLines={2}>{episode.title}</Text>
        <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }} numberOfLines={1}>
          {episode.shows?.title}
          {episode.duration_seconds ? ` · ${formatDuration(episode.duration_seconds)}` : ''}
        </Text>
        {episode.published_at && (
          <Text style={{ color: '#555', fontSize: 11, marginTop: 2 }}>
            {formatDate(episode.published_at)}
          </Text>
        )}
      </View>
      <TouchableOpacity
        onPress={handlePlay}
        style={{
          width: 34, height: 34, borderRadius: 17,
          backgroundColor: '#FFFFFF',
          alignItems: 'center', justifyContent: 'center',
          marginLeft: 10, flexShrink: 0,
        }}>
        <Text style={{ color: '#000', fontSize: 11, marginLeft: 2 }}>
          {isCurrentEpisode && isPlaying ? '⏸' : '▶'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Main Screen ──

export default function PlayerDetailScreen({ route, navigation }: any) {
  const { playerSlug } = route.params;
  const [activeTab, setActiveTab] = useState<'stories' | 'episodes'>('stories');

  const { data: player, isLoading } = usePlayerProfile(playerSlug);
  const { data: stories, isLoading: storiesLoading } = usePlayerStories(player?.id);
  const { data: episodes, isLoading: episodesLoading } = usePlayerEpisodes(player?.id);

  const teamColor = player?.team_primary_color || '#FFFFFF';

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#FFFFFF" size="large" />
      </SafeAreaView>
    );
  }

  if (!player) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#888', fontSize: 16 }}>Player not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#FFFFFF' }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: '#1E1E1E',
      }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12, padding: 4 }}>
          <Text style={{ color: '#fff', fontSize: 24 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600', flex: 1 }} numberOfLines={1}>
          Player
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Hero section */}
        <View style={{
          paddingHorizontal: 16, paddingTop: 24, paddingBottom: 20,
          alignItems: 'center',
          backgroundColor: teamColor + '18',
        }}>
          {/* Headshot */}
          {player.headshot_url ? (
            <Image
              source={{ uri: player.headshot_url }}
              style={{ width: 110, height: 110, borderRadius: 55, marginBottom: 12 }}
              contentFit="cover"
            />
          ) : (
            <View style={{ marginBottom: 12 }}>
              <PlayerInitials name={player.name} size={110} />
            </View>
          )}

          {/* Name */}
          <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center' }}>
            {player.name}
          </Text>

          {/* Team row */}
          {player.team_name && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 }}>
              {player.team_logo_url && (
                <Image source={{ uri: player.team_logo_url }}
                  style={{ width: 20, height: 20 }} contentFit="contain" />
              )}
              <Text style={{ color: teamColor, fontSize: 14, fontWeight: '600' }}>
                {player.team_name}
              </Text>
            </View>
          )}

          {/* Position / Jersey */}
          <Text style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            {[
              player.position,
              player.jersey_number != null ? `#${player.jersey_number}` : null,
            ].filter(Boolean).join(' · ')}
          </Text>

          {/* Status badge */}
          {player.status === 'active' && (
            <View style={{
              marginTop: 8, backgroundColor: '#4CAF5022',
              borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ color: '#4CAF50', fontSize: 12, fontWeight: '600' }}>Active</Text>
            </View>
          )}
          {player.status === 'free_agent' && (
            <View style={{
              marginTop: 8, backgroundColor: '#33333',
              borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ color: '#888', fontSize: 12, fontWeight: '600' }}>Free Agent</Text>
            </View>
          )}
        </View>

        {/* Tabs */}
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#222' }}>
          {(['stories', 'episodes'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              onPress={() => setActiveTab(tab)}
              style={{
                flex: 1, paddingVertical: 14, alignItems: 'center',
                borderBottomWidth: 2,
                borderBottomColor: activeTab === tab ? teamColor : 'transparent',
              }}>
              <Text style={{
                color: activeTab === tab ? '#fff' : '#888',
                fontSize: 14, fontWeight: '600',
              }}>
                {tab === 'stories' ? 'Stories' : 'Episodes'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        <View style={{ padding: 16 }}>
          {activeTab === 'stories' && (
            <>
              {storiesLoading ? (
                <ActivityIndicator color="#FFFFFF" style={{ padding: 24 }} />
              ) : !stories?.length ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <Text style={{ color: '#888', fontSize: 14 }}>No recent stories for this player</Text>
                </View>
              ) : (
                stories.map((story: any) => (
                  <StoryRow
                    key={story.id}
                    story={story}
                    onPress={() => navigation.navigate('StoryDetail', { storyId: story.id })}
                  />
                ))
              )}
            </>
          )}

          {activeTab === 'episodes' && (
            <>
              {episodesLoading ? (
                <ActivityIndicator color="#FFFFFF" style={{ padding: 24 }} />
              ) : !episodes?.length ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                  <Text style={{ color: '#888', fontSize: 14 }}>No recent episodes for this player</Text>
                </View>
              ) : (
                episodes.map((ep: any) => (
                  <EpisodeRow key={ep.id} episode={ep} />
                ))
              )}
            </>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
