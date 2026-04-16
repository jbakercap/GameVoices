import { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, FlatList
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useProfile } from '../hooks/useProfile';
import { useAllTeams } from '../hooks/useLeagues';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';

function useRosterStories(teamSlugs: string[]) {
  return useQuery({
    queryKey: ['roster-stories', teamSlugs],
    queryFn: async () => {
      if (teamSlugs.length === 0) return [];
      const { data, error } = await supabase
        .from('stories')
        .select(`
          id, headline, story_type, team_slugs, episode_count, show_count, event_date,
          episode_stories(
            episode:episodes(
              id, title, artwork_url, duration_seconds,
              shows(id, title, artwork_url)
            )
          )
        `)
        .eq('status', 'active')
        .gte('expires_at', new Date().toISOString())
        .overlaps('team_slugs', teamSlugs)
        .gte('show_count', 1)
        .order('episode_count', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: teamSlugs.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

function EpisodeCard({ episode }: { episode: any }) {
  const artwork = episode.artwork_url || episode.shows?.artwork_url;
  return (
    <TouchableOpacity style={{ width: 140, marginRight: 12 }}>
      <View style={{
        width: 140, height: 140, borderRadius: 10,
        backgroundColor: '#2A2A2A', overflow: 'hidden', marginBottom: 6,
      }}>
        {artwork ? (
          <Image source={{ uri: artwork }} style={{ width: 140, height: 140 }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>
              {episode.shows?.title?.slice(0, 2).toUpperCase() || 'EP'}
            </Text>
          </View>
        )}
        <View style={{
          position: 'absolute', bottom: 6, right: 6,
          width: 30, height: 30, borderRadius: 15,
          backgroundColor: '#F0B429', alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: '#fff', fontSize: 11, marginLeft: 2 }}>▶</Text>
        </View>
      </View>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }} numberOfLines={2}>
        {episode.title}
      </Text>
      <Text style={{ color: '#888', fontSize: 10, marginTop: 2 }} numberOfLines={1}>
        {episode.shows?.title}
      </Text>
    </TouchableOpacity>
  );
}

function StoryCard({ story, allTeams }: { story: any, allTeams: any[] }) {
    const navigation = useNavigation<any>();
    const teams = (story.team_slugs || [])
    .map((slug: string) => allTeams.find(t => t.slug === slug))
    .filter(Boolean)
    .slice(0, 4);

  const episodes = (story.episode_stories || [])
    .map((es: any) => es.episode)
    .filter(Boolean)
    .slice(0, 8);

  if (episodes.length === 0) return null;

  const metaParts = [];
  if (story.show_count > 0) metaParts.push(`${story.show_count} show${story.show_count !== 1 ? 's' : ''}`);
  if (story.episode_count > 0) metaParts.push(`${story.episode_count} ep${story.episode_count !== 1 ? 's' : ''}`);

  return (
    <TouchableOpacity 
      onPress={() => navigation.navigate('StoryDetail', { storyId: story.id })}
      style={{ marginBottom: 24, paddingHorizontal: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', flex: 1, lineHeight: 22 }}>
          {story.headline}
        </Text>
        <Text style={{ color: '#888', fontSize: 16, marginLeft: 8 }}>›</Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        {teams.map((team: any, i: number) => (
          <View key={team.slug} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 6 }}>
            {i > 0 && <Text style={{ color: '#555', marginRight: 6 }}>·</Text>}
            <View style={{
              width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff',
              alignItems: 'center', justifyContent: 'center', marginRight: 3, overflow: 'hidden',
            }}>
              <Image source={{ uri: team.logo_url }} style={{ width: 12, height: 12 }} contentFit="contain" />
            </View>
            <Text style={{ color: '#888', fontSize: 12 }}>{team.short_name}</Text>
          </View>
        ))}
        {teams.length > 0 && <Text style={{ color: '#555', marginHorizontal: 4 }}>·</Text>}
        <Text style={{ color: '#888', fontSize: 12 }}>{metaParts.join(' · ')}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -16 }}
        contentContainerStyle={{ paddingHorizontal: 16 }}>
        {episodes.map((ep: any) => (
          <EpisodeCard key={ep.id} episode={ep} />
        ))}
      </ScrollView>

      <View style={{ height: 1, backgroundColor: '#222', marginTop: 16 }} />
    </TouchableOpacity>
  );
}

function TeamPill({ team, selected, onPress }: {
  team: any; selected: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        height: 36,
        backgroundColor: selected ? '#F0B429' : '#2A2A2A',
      }}>
      {team.logo_url && (
        <View style={{
          width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          marginRight: 6,
        }}>
          <Image source={{ uri: team.logo_url }} style={{ width: 14, height: 14 }} contentFit="contain" />
        </View>
      )}
      <Text style={{ color: selected ? '#fff' : '#aaa', fontWeight: '600', fontSize: 13, lineHeight: 16 }}>
        {team.short_name}
      </Text>
    </TouchableOpacity>
  );
}

export default function RosterScreen() {
  const { data: profile, isLoading: profileLoading } = useProfile();
  const { data: allTeams } = useAllTeams();
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  const teamSlugs = useMemo(() => profile?.topic_slugs || [], [profile]);

  const myTeams = useMemo(() => {
    return (allTeams || []).filter(t => teamSlugs.includes(t.slug));
  }, [allTeams, teamSlugs]);

  const filterSlugs = selectedTeam ? [selectedTeam] : teamSlugs;
  const { data: stories, isLoading: storiesLoading } = useRosterStories(filterSlugs);

  if (profileLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#F0B429" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12,
        flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginRight: 12, padding: 4 }}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>Followed Players</Text>
        <Text style={{ color: '#888', fontSize: 14, marginTop: 2 }}>
          What's trending for your teams
        </Text>
      </View>

      {teamSlugs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' }}>
            Follow your first team
          </Text>
          <Text style={{ color: '#888', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
            Go to Browse and follow your favorite teams to see trending stories here.
          </Text>
        </View>
      ) : (
        <>
          {/* Team filter pills */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              alignItems: 'center',
            }}>
            {/* All Teams pill */}
            <TouchableOpacity
              onPress={() => setSelectedTeam(null)}
              style={{
                height: 36,
                paddingHorizontal: 14,
                borderRadius: 20,
                marginRight: 8,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selectedTeam === null ? '#F0B429' : '#2A2A2A',
              }}>
              <Text style={{
                color: selectedTeam === null ? '#fff' : '#aaa',
                fontWeight: '600',
                fontSize: 13,
                lineHeight: 16,
              }}>
                All Teams
              </Text>
            </TouchableOpacity>

            {myTeams.map(team => (
              <TeamPill
                key={team.slug}
                team={team}
                selected={selectedTeam === team.slug}
                onPress={() => setSelectedTeam(selectedTeam === team.slug ? null : team.slug)}
              />
            ))}
          </ScrollView>

          {/* Stories */}
          {storiesLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#F0B429" />
            </View>
          ) : (
            <FlatList
              data={stories || []}
              keyExtractor={item => item.id}
              renderItem={({ item }) => <StoryCard story={item} allTeams={allTeams || []} />}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
              ListEmptyComponent={() => (
                <View style={{ padding: 32, alignItems: 'center' }}>
                  <Text style={{ color: '#888', fontSize: 15, textAlign: 'center' }}>
                    Nothing trending right now.{'\n'}Check back later!
                  </Text>
                </View>
              )}
            />
          )}
        </>
      )}
    </View>
  );
}