import { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, FlatList
} from 'react-native';
import { Image } from 'expo-image';
import { useLeagues, useAllTeams } from '../hooks/useLeagues';
import { useProfile } from '../hooks/useProfile';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';

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

function useTrendingStories() {
  return useQuery({
    queryKey: ['trending-stories-browse'],
    queryFn: async () => {
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
        .gte('show_count', 2)
        .order('episode_count', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

function useNationalShows() {
  return useQuery({
    queryKey: ['national-shows'],
    queryFn: async () => {
      // Get the 'general' league ID first
      const { data: league } = await supabase
        .from('leagues')
        .select('id')
        .eq('slug', 'general')
        .single();

      if (!league) return [];

      const { data, error } = await supabase
        .from('shows')
        .select('id, title, artwork_url, episode_count, team_id, league_id')
        .eq('league_id', league.id)
        .eq('status', 'active')
        .order('episode_count', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });
}

// ─── Components ──────────────────────────────────────────────────────────────

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
      <Text style={{
        color: selected ? '#000' : '#888',
        fontWeight: '600', 
        fontSize: 14,
      }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ShowCard({ show, isFollowing, onToggle }: {
  show: any; isFollowing: boolean; onToggle: () => void;
}) {
  return (
    <TouchableOpacity onPress={onToggle} style={{ width: 110, marginRight: 12 }}>
      <View style={{
        width: 110, height: 110, borderRadius: 12,
        backgroundColor: '#2A2A2A', overflow: 'hidden', marginBottom: 6,
        borderWidth: isFollowing ? 2 : 0,
        borderColor: '#E53935',
      }}>
        {show.artwork_url ? (
          <Image source={{ uri: show.artwork_url }} style={{ width: 110, height: 110 }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 32 }}>🎙</Text>
          </View>
        )}
        {isFollowing && (
          <View style={{
            position: 'absolute', top: 6, right: 6,
            width: 20, height: 20, borderRadius: 10,
            backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>✓</Text>
          </View>
        )}
      </View>
      <Text style={{ color: '#ccc', fontSize: 11, fontWeight: '500' }} numberOfLines={2}>
        {show.title}
      </Text>
      {show.episode_count > 0 && (
        <Text style={{ color: '#555', fontSize: 10, marginTop: 2 }}>
          {show.episode_count} eps
        </Text>
      )}
    </TouchableOpacity>
  );
}

function TeamGrid({ teams, followedSlugs, onToggle }: {
  teams: any[]; followedSlugs: string[]; onToggle: (slug: string) => void;
}) {
  // Group teams by division
  const byDivision = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    teams.forEach(team => {
      const conf = team.conference || '';
      const div = team.division || 'Other';
      const label = conf && !div.startsWith(conf) && !div.match(/^[A-Z]{2}\s/)
        ? `${conf} ${div}`
        : div;
      if (!grouped[label]) grouped[label] = [];
      grouped[label].push(team);
    });
    return Object.keys(grouped).sort().map(div => ({ division: div, teams: grouped[div] }));
  }, [teams]);

  if (byDivision.length === 0) return null;

  return (
    <View style={{ paddingHorizontal: 16 }}>
      {byDivision.map(({ division, teams: divTeams }) => (
        <View key={division} style={{ marginBottom: 24 }}>
          {/* Division header */}
          <Text style={{
            color: '#555', fontSize: 11, fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: 1,
            marginBottom: 12,
          }}>
            {division}
          </Text>
          {/* Team logos */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {divTeams.map(team => (
              <TouchableOpacity key={team.id} onPress={() => onToggle(team.slug)}
                style={{ alignItems: 'center', width: 56 }}>
                <View style={{
                  width: 56, height: 56, borderRadius: 10,
                  backgroundColor: '#fff',
                  borderWidth: followedSlugs.includes(team.slug) ? 3 : 1,
                  borderColor: followedSlugs.includes(team.slug)
                    ? (team.primary_color || '#E53935') : '#333',
                  overflow: 'hidden', marginBottom: 4,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {team.logo_url ? (
                    <Image source={{ uri: team.logo_url }} style={{ width: 42, height: 42 }} contentFit="contain" />
                  ) : (
                    <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 12 }}>
                      {team.short_name?.slice(0, 3)}
                    </Text>
                  )}
                </View>
                {followedSlugs.includes(team.slug) && (
                  <View style={{
                    position: 'absolute', top: 0, right: 0,
                    width: 16, height: 16, borderRadius: 8,
                    backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: 'bold' }}>✓</Text>
                  </View>
                )}
                <Text style={{ color: '#aaa', fontSize: 10, textAlign: 'center' }} numberOfLines={1}>
                  {team.abbreviation || team.short_name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

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

function EpisodeCard({ episode }: { episode: any }) {
  const artwork = episode.artwork_url || episode.shows?.artwork_url;
  return (
    <TouchableOpacity style={{ width: 160, marginRight: 12, flexShrink: 0 }}>
      <View style={{
        width: 160, height: 160, borderRadius: 12,
        backgroundColor: '#2A2A2A', overflow: 'hidden', marginBottom: 8,
      }}>
        {artwork ? (
          <Image source={{ uri: artwork }} style={{ width: 160, height: 160 }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>
              {episode.shows?.title?.slice(0, 2).toUpperCase() || 'EP'}
            </Text>
          </View>
        )}
        {/* Play button */}
        <View style={{
          position: 'absolute', bottom: 8, right: 8,
          width: 36, height: 36, borderRadius: 18,
          backgroundColor: '#E53935',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: '#fff', fontSize: 12, marginLeft: 2 }}>▶</Text>
        </View>
      </View>
      <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', lineHeight: 16 }}
        numberOfLines={3}>{episode.title}</Text>
      <Text style={{ color: '#888', fontSize: 11, marginTop: 3 }}
        numberOfLines={1}>{episode.shows?.title}</Text>
    </TouchableOpacity>
  );
}

function TrendingStoryRow({ story, allTeams }: { story: any, allTeams: any[] }) {
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
      style={{ marginBottom: 28, paddingHorizontal: 16 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', flex: 1, lineHeight: 22 }}>
          {story.headline}
        </Text>
        <Text style={{ color: '#888', fontSize: 16, marginLeft: 8 }}>›</Text>
      </View>

      {/* Meta line — team logos + counts */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, flexWrap: 'nowrap' }}>
        {teams.map((team: any, i: number) => (
          <View key={team.slug} style={{ flexDirection: 'row', alignItems: 'center', marginRight: 6 }}>
            {i > 0 && <Text style={{ color: '#555', marginRight: 6 }}>·</Text>}
            <View style={{
              width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff',
              alignItems: 'center', justifyContent: 'center', marginRight: 4, overflow: 'hidden',
            }}>
              <Image source={{ uri: team.logo_url }} style={{ width: 14, height: 14 }} contentFit="contain" />
            </View>
            <Text style={{ color: '#888', fontSize: 12 }}>{team.short_name}</Text>
          </View>
        ))}
        {teams.length > 0 && metaParts.length > 0 && (
          <Text style={{ color: '#555', marginHorizontal: 6 }}>·</Text>
        )}
        <Text style={{ color: '#888', fontSize: 12 }}>{metaParts.join(' · ')}</Text>
      </View>

      {/* Episode horizontal scroll */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingRight: 16 }}
        style={{ marginHorizontal: -16 }}
      >
        <View style={{ paddingLeft: 16, flexDirection: 'row' }}>
          {episodes.map((ep: any) => (
            <EpisodeCard key={ep.id} episode={ep} />
          ))}
        </View>
      </ScrollView>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: '#222', marginTop: 20 }} />
    </TouchableOpacity>
  );
}

export default function BrowseScreen() {
  const { user } = useAuth();
  const [selectedLeague, setSelectedLeague] = useState('all');
  const { data: trendingStories, isLoading: loadingTrending } = useTrendingStories();
  const { data: leagues, isLoading: leaguesLoading } = useLeagues();
  const { data: allTeams } = useAllTeams();
  const { data: profile } = useProfile();
  const { data: followedShowIds = [], refetch: refetchShows } = useFollowedShows();
  const queryClient = useQueryClient();

  const [followedSlugs, setFollowedSlugs] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  if (profile && !initialized) {
    setFollowedSlugs(profile.topic_slugs || []);
    setInitialized(true);
  }

  // Build league id -> slug map
  const leagueMap = useMemo(() => {
    const map: Record<string, string> = {};
    (leagues || []).forEach((l: any) => { map[l.id] = l.slug; });
    return map;
  }, [leagues]);

  const leagueIdMap = useMemo(() => {
    const map: Record<string, string> = {};
    (leagues || []).forEach((l: any) => { map[l.slug] = l.id; });
    return map;
  }, [leagues]);

  const selectedLeagueId = selectedLeague !== 'all' ? leagueIdMap[selectedLeague] : null;
  const { data: leagueShows, isLoading: loadingShows } = useShowsByLeague(selectedLeagueId);
  const { data: nationalShows, isLoading: loadingNational } = useNationalShows();

  const leagueTeams = useMemo(() => {
    if (selectedLeague === 'all') return [];
    const filtered = (allTeams || []).filter((t: any) => leagueMap[t.league_id] === selectedLeague);
    return filtered;
  }, [allTeams, selectedLeague, leagueMap]);

  const handleTeamToggle = async (slug: string) => {
    if (!user) return;
    const isFollowing = followedSlugs.includes(slug);
    const updated = isFollowing ? followedSlugs.filter(s => s !== slug) : [...followedSlugs, slug];
    setFollowedSlugs(updated);
    await supabase.from('profiles').update({ topic_slugs: updated }).eq('user_id', user.id);
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  const handleShowToggle = async (showId: string) => {
    if (!user) return;
    const isFollowing = followedShowIds.includes(showId);
    if (isFollowing) {
      await supabase.from('user_library')
        .delete()
        .eq('user_id', user!.id)
        .eq('show_id', showId)
        .eq('item_type', 'follow');
    } else {
      await supabase.from('user_library')
        .insert({ user_id: user!.id, show_id: showId, item_type: 'follow' });
    }
    refetchShows();
  };

  const allLeaguePills = [{ slug: 'all', short_name: 'All', icon: '🏆', primary_color: '#E53935' }, ...(leagues || [])];

  if (leaguesLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E53935" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Header */}
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 12 }}>
        <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>Discover</Text>
        <Text style={{ color: '#888', fontSize: 14, marginTop: 2 }}>Find your next favorite podcast</Text>
      </View>

{/* League switcher */}
<View style={{ marginBottom: 16 }}>
  <ScrollView 
    horizontal 
    showsHorizontalScrollIndicator={false}
    bounces={true}
    contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}>
    <LeaguePill label="All" selected={selectedLeague === 'all'} onPress={() => setSelectedLeague('all')} />
    {(leagues || []).map(league => (
      <LeaguePill
        key={league.slug}
        label={league.short_name}
        selected={selectedLeague === league.slug}
        onPress={() => setSelectedLeague(league.slug)}
      />
    ))}
  </ScrollView>
</View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

        {selectedLeague === 'all' ? (
          // ── All tab ──────────────────────────────────────────────
          <>
            {/* National Shows shelf */}
            <View style={{ marginBottom: 12, marginTop: 12 }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 12 }}>
                National Shows
              </Text>
              <Text style={{ color: '#888', fontSize: 13, paddingHorizontal: 16, marginBottom: 12, marginTop: -8 }}>
                The biggest voices in sports
              </Text>
              {loadingNational ? (
                <ActivityIndicator color="#E53935" style={{ padding: 20 }} />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16 }}>
                  {(nationalShows || []).map((show: any) => (
                    <ShowCard
                      key={show.id}
                      show={show}
                      isFollowing={followedShowIds.includes(show.id)}
                      onToggle={() => handleShowToggle(show.id)}
                    />
                  ))}
                </ScrollView>
              )}
            </View>

            {/* My Teams */}
            <View style={{ marginBottom: 28 }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 12 }}>
                My Teams
              </Text>
              {followedSlugs.length === 0 ? (
                <Text style={{ color: '#888', fontSize: 14, paddingHorizontal: 16 }}>
                  Pick a sport above to follow teams.
                </Text>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                  {(allTeams || [])
                    .filter((t: any) => followedSlugs.includes(t.slug))
                    .map((team: any) => (
                      <TouchableOpacity key={team.id} onPress={() => handleTeamToggle(team.slug)}
                        style={{ alignItems: 'center', width: 72 }}>
                        <View style={{
                          width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff',
                          borderWidth: 3, borderColor: team.primary_color || '#E53935',
                          overflow: 'hidden', marginBottom: 6,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Image source={{ uri: team.logo_url }} style={{ width: 52, height: 52 }} contentFit="contain" />
                        </View>
                        <Text style={{ color: '#ccc', fontSize: 11, textAlign: 'center' }} numberOfLines={1}>
                          {team.short_name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </ScrollView>
              )}
            </View>

            {/* Trending Now */}
            <View style={{ marginBottom: 28 }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 12 }}>
                Trending Now
              </Text>
              {loadingTrending
                ? <ActivityIndicator color="#E53935" style={{ padding: 20 }} />
                : (trendingStories || []).map((story: any) => (
                    <TrendingStoryRow key={story.id} story={story} allTeams={allTeams || []} />
                  ))
              }
            </View>
          </>
        ) : (
          // ── Sport tab ─────────────────────────────────────────────
          <>
            {/* Teams grid */}
            <View style={{ marginBottom: 28 }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 16 }}>
                Teams
              </Text>
              <TeamGrid
                teams={leagueTeams}
                followedSlugs={followedSlugs}
                onToggle={handleTeamToggle}
              />
            </View>

            {/* League shows */}
            <View style={{ marginBottom: 28 }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 12 }}>
                Popular {(leagues || []).find((l: any) => l.slug === selectedLeague)?.short_name} Shows
              </Text>
              {loadingShows ? (
                <ActivityIndicator color="#E53935" style={{ padding: 20 }} />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 16 }}>
                  {(leagueShows || []).map((show: any) => (
                    <ShowCard
                      key={show.id}
                      show={show}
                      isFollowing={followedShowIds.includes(show.id)}
                      onToggle={() => handleShowToggle(show.id)}
                    />
                  ))}
                </ScrollView>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}