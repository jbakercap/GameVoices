import { useQuery } from '@tanstack/react-query';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, SafeAreaView, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { supabase } from '../lib/supabase';
import { usePlayer } from '../contexts/PlayerContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

function useStoryDetail(storyId: string) {
  return useQuery({
    queryKey: ['story-detail', storyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stories')
        .select(`
          id, headline, story_type, sport, event_date, show_count, episode_count, people, team_slugs,
          episode_stories(
            relevance, created_at,
            episode:episodes(
              id, title, duration_seconds, audio_url, published_at, artwork_url,
              shows(id, title, artwork_url, status)
            )
          )
        `)
        .eq('id', storyId)
        .single();

      if (error) throw error;
      if (!data) return null;

      const episodes = (data.episode_stories || [])
        .filter((es: any) => es.episode)
        .map((es: any) => es.episode)
        .filter((ep: any) => ep.shows?.status === 'active' || !ep.shows?.status)
        .sort((a: any, b: any) =>
          new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime()
        );

      // Get top show artworks
      const showMap = new Map<string, string>();
      for (const ep of episodes) {
        if (ep.shows?.id && !showMap.has(ep.shows.id)) {
          showMap.set(ep.shows.id, ep.shows.artwork_url || ep.artwork_url);
        }
      }
      const showArtworks = [...showMap.values()].filter(Boolean).slice(0, 4);

      const totalDuration = episodes.reduce(
        (sum: number, ep: any) => sum + (ep.duration_seconds || 0), 0
      );

      return {
        id: data.id,
        headline: data.headline,
        story_type: data.story_type,
        sport: data.sport,
        event_date: data.event_date,
        show_count: data.show_count || 0,
        episode_count: data.episode_count || 0,
        people: data.people || [],
        team_slugs: data.team_slugs || [],
        showArtworks,
        totalDuration,
        episodes,
      };
    },
    enabled: !!storyId,
    staleTime: 5 * 60 * 1000,
  });
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function EpisodeRow({ episode }: { episode: any }) {
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();
  const artwork = episode.artwork_url || episode.shows?.artwork_url;
  const duration = episode.duration_seconds
    ? formatDuration(episode.duration_seconds)
    : null;
  const date = episode.published_at
    ? formatDate(episode.published_at)
    : null;

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
      paddingVertical: 12, paddingHorizontal: 16,
      borderBottomWidth: 1, borderBottomColor: '#1E1E1E',
    }}>
      {/* Artwork */}
      <View style={{
        width: 64, height: 64, borderRadius: 8,
        backgroundColor: '#2A2A2A', overflow: 'hidden',
        marginRight: 12, flexShrink: 0,
      }}>
        {artwork ? (
          <Image source={{ uri: artwork }} style={{ width: 64, height: 64 }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>
              {episode.shows?.title?.slice(0, 2).toUpperCase() || 'EP'}
            </Text>
          </View>
        )}
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 18, marginBottom: 3 }}
          numberOfLines={2}>
          {episode.title}
        </Text>
        <Text style={{ color: '#888', fontSize: 12, marginBottom: 3 }} numberOfLines={1}>
          {episode.shows?.title}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {date && <Text style={{ color: '#555', fontSize: 11 }}>{date}</Text>}
          {duration && <Text style={{ color: '#555', fontSize: 11 }}>· {duration}</Text>}
        </View>
      </View>

      {/* Play button */}
      <TouchableOpacity
        onPress={handlePlay}
        style={{
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: isCurrentEpisode && isPlaying ? '#fff' : '#F0B429',
          alignItems: 'center', justifyContent: 'center',
          marginLeft: 10, flexShrink: 0,
        }}>
        <Text style={{ color: isCurrentEpisode && isPlaying ? '#F0B429' : '#fff', fontSize: 12, marginLeft: 2 }}>
          {isCurrentEpisode && isPlaying ? '⏸' : '▶'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function StoryDetailScreen({ route, navigation }: any) {
    const { storyId } = route.params;
    const onBack = () => navigation.goBack();
    const { data: story, isLoading } = useStoryDetail(storyId);

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#F0B429" size="large" />
      </SafeAreaView>
    );
  }

  if (!story) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#888' }}>Story not found</Text>
      </SafeAreaView>
    );
  }

  const typeColor = STORY_TYPE_COLORS[story.story_type] || '#888';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Header */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: '#1E1E1E',
      }}>
        <TouchableOpacity onPress={onBack} style={{ marginRight: 12, padding: 4 }}>
          <Text style={{ color: '#fff', fontSize: 24 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600', flex: 1 }} numberOfLines={1}>
          Story
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Show artwork collage */}
        {story.showArtworks.length > 0 && (
          <View style={{
            flexDirection: 'row', flexWrap: 'wrap',
            height: 180, overflow: 'hidden',
          }}>
            {story.showArtworks.slice(0, 4).map((url, i) => (
              <Image
                key={i}
                source={{ uri: url }}
                style={{
                  width: story.showArtworks.length === 1 ? SCREEN_WIDTH : SCREEN_WIDTH / 2,
                  height: story.showArtworks.length <= 2 ? 180 : 90,
                }}
                contentFit="cover"
              />
            ))}
          </View>
        )}

        {/* Story info */}
        <View style={{ padding: 16 }}>
          {/* Type badge */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', marginBottom: 12,
          }}>
            <View style={{
              backgroundColor: typeColor + '22', borderRadius: 6,
              paddingHorizontal: 10, paddingVertical: 4,
            }}>
              <Text style={{ color: typeColor, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
                {story.story_type.replace(/_/g, ' ')}
              </Text>
            </View>
            {story.event_date && (
              <Text style={{ color: '#555', fontSize: 12, marginLeft: 10 }}>
                {formatDate(story.event_date)}
              </Text>
            )}
          </View>

          {/* Headline */}
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', lineHeight: 30, marginBottom: 16 }}>
            {story.headline}
          </Text>

          {/* Stats row */}
          <View style={{
            flexDirection: 'row', gap: 20, paddingVertical: 14,
            borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#1E1E1E',
            marginBottom: 8,
          }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>{story.show_count}</Text>
              <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }}>Shows</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>{story.episode_count}</Text>
              <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }}>Episodes</Text>
            </View>
            {story.totalDuration > 0 && (
              <View style={{ alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
                  {formatDuration(story.totalDuration)}
                </Text>
                <Text style={{ color: '#888', fontSize: 11, marginTop: 2 }}>Total Audio</Text>
              </View>
            )}
          </View>

          {/* People mentioned */}
          {story.people?.length > 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ color: '#555', fontSize: 12, fontWeight: '600',
                textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                People Mentioned
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {story.people.map((person: string) => (
                  <View key={person} style={{
                    backgroundColor: '#1E1E1E', borderRadius: 8,
                    paddingHorizontal: 10, paddingVertical: 5,
                  }}>
                    <Text style={{ color: '#ccc', fontSize: 13 }}>
                      {person.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Episodes section */}
        <View>
          <Text style={{
            color: '#555', fontSize: 12, fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: 0.8,
            paddingHorizontal: 16, paddingBottom: 8,
          }}>
            {story.episodes.length} Episodes Covering This Story
          </Text>
          {story.episodes.map((ep: any) => (
            <EpisodeRow key={ep.id} episode={ep} />
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
