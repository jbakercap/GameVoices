import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, FlatList, Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useTeam } from '../hooks/queries/useTeam';
import { useTeamShows } from '../hooks/queries/useTeamShows';
import { useTeamEpisodes } from '../hooks/queries/useTeamEpisodes';
import { useTeamRoster } from '../hooks/queries/useTeamRoster';
import { useTeamSchedule } from '../hooks/queries/useTeamSchedule';
import { useTeamGameStories } from '../hooks/queries/useTeamGameStories';
import { useTeamBuzzFeed, BuzzPost, hasVideo } from '../hooks/queries/useTeamBuzzFeed';
import { useSyncBuzz } from '../hooks/queries/useSyncBuzz';
import { useFollowShow } from '../hooks/mutations/useFollowShow';
import { usePlayer } from '../contexts/PlayerContext';
import { formatDurationHuman, formatRelativeDate } from '../lib/formatters';

type Tab = 'episodes' | 'shows' | 'roster' | 'scores' | 'buzz';
type BuzzFilter = 'all' | 'video';

function cleanBuzzText(text: string) {
  return text
    .replace(/https?:\/\/t\.co\/\w+/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .trim();
}

function BuzzPostCard({ post, teamColor }: { post: BuzzPost; teamColor: string }) {
  const author = post.postData?.author || { name: post.handle, username: post.handle };
  const media = post.postData?.media || [];
  const videoMedia = media.find((m: any) => m.type === 'video' || m.type === 'animated_gif');
  const imageMedia = media.find((m: any) => m.type === 'photo');
  const thumbnail = videoMedia?.preview_image_url || videoMedia?.url || imageMedia?.url;
  const cleanText = cleanBuzzText(post.text);
  const openOnX = () => Linking.openURL(`https://x.com/${author.username}/status/${post.postId}`);

  return (
    <View style={{ backgroundColor: '#1A1A1A', borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 10 }}>
      {/* Author row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {author.profileImageUrl ? (
          <Image source={{ uri: author.profileImageUrl }} style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#888', fontSize: 13, fontWeight: 'bold' }}>{(author.name || post.handle)[0]?.toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{author.name || post.handle}</Text>
          <Text style={{ color: '#666', fontSize: 12 }}>@{author.username || post.handle}</Text>
        </View>
        <TouchableOpacity onPress={openOnX} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#000', borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>𝕏</Text>
        </TouchableOpacity>
      </View>

      {/* Text */}
      {cleanText.length > 0 && (
        <Text style={{ color: '#ddd', fontSize: 14, lineHeight: 20, marginBottom: thumbnail ? 10 : 0 }} numberOfLines={6}>
          {cleanText}
        </Text>
      )}

      {/* Media thumbnail */}
      {thumbnail && (
        <TouchableOpacity onPress={openOnX}>
          <View style={{ borderRadius: 8, overflow: 'hidden', aspectRatio: 16 / 9, backgroundColor: '#000' }}>
            <Image source={{ uri: thumbnail }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            {videoMedia && (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 18 }}>▶</Text>
                </View>
              </View>
            )}
          </View>
        </TouchableOpacity>
      )}

      {/* Timestamp */}
      <Text style={{ color: '#555', fontSize: 11, marginTop: 8 }}>{formatRelativeDate(post.postedAt)}</Text>
    </View>
  );
}

function GameScoreCard({ story }: { story: any }) {
  const navigation = useNavigation<any>();
  const hasScore = story.home_score !== null && story.away_score !== null;
  const teams = story.teams || [];
  const homeTeam = teams.find((t: any) => t.slug === story.team_slugs?.[0]);
  const awayTeam = teams.find((t: any) => t.slug === story.team_slugs?.[1]);

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('StoryDetail', { storyId: story.id })}
      style={{ backgroundColor: '#1E1E1E', borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 10 }}>
      {/* Score row */}
      {hasScore ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {(story.away_logo || awayTeam?.logo_url) && (
              <Image source={{ uri: story.away_logo || awayTeam?.logo_url }} style={{ width: 28, height: 28 }} contentFit="contain" />
            )}
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{story.away_abbr || story.away_score}</Text>
            <Text style={{ color: '#888', fontSize: 20, marginHorizontal: 4 }}>–</Text>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{story.home_abbr || story.home_score}</Text>
            {(story.home_logo || homeTeam?.logo_url) && (
              <Image source={{ uri: story.home_logo || homeTeam?.logo_url }} style={{ width: 28, height: 28 }} contentFit="contain" />
            )}
          </View>
          <Text style={{ color: '#666', fontSize: 12 }}>{story.event_date}</Text>
        </View>
      ) : (
        <Text style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>{story.event_date}</Text>
      )}
      <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', lineHeight: 20 }} numberOfLines={2}>
        {story.headline}
      </Text>
      <Text style={{ color: '#888', fontSize: 12, marginTop: 6 }}>
        {story.episode_count} episodes · {story.show_count} shows
      </Text>
    </TouchableOpacity>
  );
}

export default function TeamScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { teamSlug } = route.params;
  const [activeTab, setActiveTab] = useState<Tab>('episodes');
  const [buzzFilter, setBuzzFilter] = useState<BuzzFilter>('all');

  const { data: team, isLoading: teamLoading } = useTeam(teamSlug);
  const { data: shows = [], isLoading: showsLoading } = useTeamShows(teamSlug);
  const { data: episodesPages, isLoading: episodesLoading, fetchNextPage, hasNextPage } = useTeamEpisodes(teamSlug);
  const { data: roster = [], isLoading: rosterLoading } = useTeamRoster(teamSlug);
  const scheduleData = useTeamSchedule(team);
  const { data: gameStories = [] } = useTeamGameStories(teamSlug);
  const followShow = useFollowShow();
  const { playEpisode, currentEpisode, isPlaying, togglePlayPause } = usePlayer();

  const episodes = episodesPages?.pages.flatMap(p => p.episodes) || [];
  const teamColor = team?.primary_color || '#E53935';

  const {
    posts: buzzPosts, isLoading: buzzLoading, isEmpty: buzzEmpty,
    refresh: refreshBuzz, isRefreshing: buzzRefreshing,
    fetchNextPage: fetchNextBuzz, hasNextPage: hasNextBuzz, isFetchingNextPage: fetchingNextBuzz,
  } = useTeamBuzzFeed(team?.id, buzzFilter);
  useSyncBuzz(team?.id);

  const filteredBuzz = buzzFilter === 'video' ? buzzPosts.filter(hasVideo) : buzzPosts;

  if (teamLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E53935" />
      </View>
    );
  }

  if (!team) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', padding: 16 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: '#888', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: '#888', marginTop: 16 }}>Team not found.</Text>
      </View>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'episodes', label: 'Episodes' },
    { key: 'buzz', label: 'Buzz' },
    { key: 'shows', label: `Shows (${shows.length})` },
    { key: 'scores', label: `Scores (${gameStories.length})` },
    { key: 'roster', label: 'Roster' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Back */}
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: '#888', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
      </View>

      {/* Team header */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        {team.logo_url ? (
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#fff', overflow: 'hidden', borderWidth: 3, borderColor: teamColor, alignItems: 'center', justifyContent: 'center' }}>
            <Image source={{ uri: team.logo_url }} style={{ width: 56, height: 56 }} contentFit="contain" />
          </View>
        ) : (
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: teamColor, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>{team.short_name?.slice(0, 2)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>{team.name}</Text>
          <Text style={{ color: '#888', fontSize: 14, marginTop: 2 }}>
            {[team.leagues?.name, team.record].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>

      {/* Live game banner */}
      {scheduleData.liveGame && (
        <View style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: '#E5393520', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E53935' }}>
          <Text style={{ color: '#E53935', fontWeight: '700', fontSize: 13 }}>🔴 LIVE: vs {scheduleData.liveGame.opponent}</Text>
          {scheduleData.liveGame.homeScore !== undefined && (
            <Text style={{ color: '#fff', fontSize: 12, marginTop: 2 }}>
              {scheduleData.liveGame.homeScore} – {scheduleData.liveGame.awayScore}
              {scheduleData.liveGame.period ? `  Q${scheduleData.liveGame.period} ${scheduleData.liveGame.clock}` : ''}
            </Text>
          )}
        </View>
      )}

      {/* Next game */}
      {scheduleData.nextGame && !scheduleData.liveGame && (
        <View style={{ marginHorizontal: 16, marginBottom: 12, backgroundColor: '#1A1A1A', borderRadius: 10, padding: 10 }}>
          <Text style={{ color: '#888', fontSize: 12 }}>Next: vs {scheduleData.nextGame.opponent} · {scheduleData.nextGame.gameDate}</Text>
        </View>
      )}

      {/* Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: activeTab === tab.key ? teamColor : '#2A2A2A' }}>
            <Text style={{ color: activeTab === tab.key ? '#fff' : '#aaa', fontSize: 13, fontWeight: '600' }}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      {activeTab === 'episodes' && (
        <FlatList
          data={episodes}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          renderItem={({ item }) => {
            const isCurrent = currentEpisode?.id === item.id;
            const artwork = item.artwork_url || item.shows?.artwork_url;
            return (
              <TouchableOpacity
                onPress={() => { isCurrent ? togglePlayPause() : playEpisode({ id: item.id, title: item.title, showTitle: item.shows?.title || '', artworkUrl: artwork || undefined, audioUrl: item.audio_url, durationSeconds: item.duration_seconds ?? undefined }); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
                <View style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
                  {artwork ? <Image source={{ uri: artwork }} style={{ width: 52, height: 52 }} contentFit="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18 }}>🎙</Text></View>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: isCurrent ? '#E53935' : '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={2}>{item.title}</Text>
                  <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{item.shows?.title} · {formatRelativeDate(item.published_at)}</Text>
                </View>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isCurrent ? '#E53935' : '#2A2A2A', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 10 }}>{isCurrent && isPlaying ? '⏸' : '▶'}</Text>
                </View>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={() => episodesLoading ? <ActivityIndicator color="#E53935" style={{ marginTop: 40 }} /> : <Text style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>No episodes yet</Text>}
        />
      )}

      {activeTab === 'shows' && (
        <FlatList
          data={shows}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => navigation.navigate('ShowDetail', { showId: item.id })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
              <View style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
                {item.artwork_url ? <Image source={{ uri: item.artwork_url }} style={{ width: 56, height: 56 }} contentFit="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 20 }}>🎙</Text></View>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{item.title}</Text>
                <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{item.publisher} · {item.episode_count} eps</Text>
              </View>
              <TouchableOpacity
                onPress={() => followShow.mutate({ showId: item.id, isFollowing: item.isFollowed })}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: item.isFollowed ? '#2A2A2A' : '#E53935', borderWidth: item.isFollowed ? 1 : 0, borderColor: '#444' }}>
                <Text style={{ color: item.isFollowed ? '#aaa' : '#fff', fontSize: 12, fontWeight: '600' }}>{item.isFollowed ? '✓' : '+'}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ListEmptyComponent={() => showsLoading ? <ActivityIndicator color="#E53935" style={{ marginTop: 40 }} /> : <Text style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>No shows found</Text>}
        />
      )}

      {activeTab === 'scores' && (
        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          {gameStories.length === 0 ? (
            <Text style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>No game scores yet</Text>
          ) : (
            gameStories.map(story => <GameScoreCard key={story.id} story={story} />)
          )}
        </ScrollView>
      )}

      {activeTab === 'buzz' && (
        <View style={{ flex: 1 }}>
          {/* Filter + Refresh row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
            {(['all', 'video'] as BuzzFilter[]).map(f => (
              <TouchableOpacity
                key={f}
                onPress={() => setBuzzFilter(f)}
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: buzzFilter === f ? teamColor : '#2A2A2A' }}
              >
                <Text style={{ color: buzzFilter === f ? '#fff' : '#aaa', fontSize: 13, fontWeight: '600' }}>
                  {f === 'all' ? 'All' : 'Video'}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={refreshBuzz}
              disabled={buzzRefreshing}
              style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 16, backgroundColor: '#2A2A2A', alignItems: 'center', justifyContent: 'center', opacity: buzzRefreshing ? 0.4 : 1 }}
            >
              <Text style={{ color: '#fff', fontSize: 16 }}>↻</Text>
            </TouchableOpacity>
          </View>

          {buzzLoading ? (
            <ActivityIndicator color="#E53935" style={{ marginTop: 40 }} />
          ) : filteredBuzz.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#888', fontSize: 15 }}>
                {buzzFilter === 'video' ? 'No video posts right now' : 'No posts right now'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredBuzz}
              keyExtractor={item => item.id}
              contentContainerStyle={{ paddingTop: 4, paddingBottom: 120 }}
              onEndReached={() => hasNextBuzz && fetchNextBuzz()}
              onEndReachedThreshold={0.4}
              renderItem={({ item }) => <BuzzPostCard post={item} teamColor={teamColor} />}
              ListFooterComponent={fetchingNextBuzz ? <ActivityIndicator color="#E53935" style={{ marginVertical: 16 }} /> : null}
            />
          )}
        </View>
      )}

      {activeTab === 'roster' && (
        <FlatList
          data={roster}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingBottom: 120 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => navigation.navigate('PlayerDetail', { playerSlug: item.slug })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: '#2A2A2A', borderWidth: item.isFeatured ? 2 : 0, borderColor: teamColor }}>
                {item.headshot_url ? <Image source={{ uri: item.headshot_url }} style={{ width: 44, height: 44 }} contentFit="cover" /> : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#888', fontSize: 12, fontWeight: 'bold' }}>{item.name.split(' ').map(n => n[0]).join('')}</Text></View>}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: item.isFeatured ? '700' : '400' }}>{item.name}</Text>
                  {item.isFeatured && <Text style={{ color: '#E53935', fontSize: 10 }}>🔥</Text>}
                </View>
                <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                  {[item.position, item.jersey_number ? `#${item.jersey_number}` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={{ color: '#555', fontSize: 18 }}>›</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={() => rosterLoading ? <ActivityIndicator color="#E53935" style={{ marginTop: 40 }} /> : <Text style={{ color: '#888', textAlign: 'center', marginTop: 40 }}>No roster data</Text>}
        />
      )}
    </View>
  );
}
