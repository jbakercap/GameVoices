import React, { useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useGameRecaps } from '../hooks/queries/useGameRecaps';
import { EpisodeFeedPost, FeedEpisode } from '../components/EpisodeFeedPost';

interface GameFeedParams {
  storyId?: string;
  storyIds?: string[];
  title: string;
  homeTeamSlug: string;
  awayTeamSlug: string;
  homeColor: string;
  awayColor: string;
  homeShortName: string;
  awayShortName: string;
}

export default function GameFeedScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const {
    storyId,
    storyIds,
    title,
    homeTeamSlug,
    awayTeamSlug,
    homeColor,
    awayColor,
    homeShortName,
    awayShortName,
  } = route.params as GameFeedParams;

  const effectiveIds = storyIds ?? (storyId ? [storyId] : []);
  const { data: recaps = [], isLoading } = useGameRecaps(effectiveIds.length > 0 ? effectiveIds : undefined);

  // Map GameRecapEpisode → FeedEpisode
  const episodes: FeedEpisode[] = useMemo(() =>
    recaps.map(ep => ({
      id: ep.id,
      title: ep.title,
      artwork_url: ep.artwork_url,
      show_artwork_url: ep.show_artwork_url,
      audio_url: ep.audio_url,
      duration_seconds: ep.duration_seconds,
      published_at: ep.published_at,
      show_id: ep.show_id,
      show_title: ep.show_title,
      team_slug: ep.show_team_slugs?.[0] ?? null,
    })),
  [recaps]);

  function colorForEpisode(ep: FeedEpisode): string {
    const slugs = recaps.find(r => r.id === ep.id)?.show_team_slugs || [];
    if (slugs.includes(homeTeamSlug)) return homeColor;
    if (slugs.includes(awayTeamSlug)) return awayColor;
    return homeColor;
  }

  function shortNameForEpisode(ep: FeedEpisode): string | undefined {
    const slugs = recaps.find(r => r.id === ep.id)?.show_team_slugs || [];
    if (slugs.includes(homeTeamSlug)) return homeShortName;
    if (slugs.includes(awayTeamSlug)) return awayShortName;
    return homeShortName;
  }

  const renderPost = useCallback(({ item }: { item: FeedEpisode }) => (
    <EpisodeFeedPost
      episode={item}
      teamColor={colorForEpisode(item)}
      teamShortName={shortNameForEpisode(item)}
      onOpenComments={() => {}}
      onNavigate={(screen, params) => navigation.navigate(screen, params)}
    />
  ), [recaps, navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Header */}
      <View style={{
        paddingTop: 56, paddingBottom: 12, paddingHorizontal: 16,
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: '#121212', borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
      }}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#888', fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Recaps
          </Text>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', marginTop: 1 }}>
            {title}
          </Text>
        </View>
      </View>

      <FlatList
        data={episodes}
        keyExtractor={item => item.id}
        renderItem={renderPost}
        ListEmptyComponent={
          isLoading
            ? <ActivityIndicator color="#fff" style={{ marginTop: 60 }} />
            : (
              <View style={{ alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32 }}>
                <Ionicons name="mic-off-outline" size={36} color="#333" style={{ marginBottom: 12 }} />
                <Text style={{ color: '#555', fontSize: 15, textAlign: 'center' }}>No recaps found for this game.</Text>
              </View>
            )
        }
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
