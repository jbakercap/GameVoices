import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useLeagues, useAllTeams } from '../hooks/useLeagues';
import { useProfile } from '../hooks/useProfile';
import { useAuth } from '../contexts/AuthContext';
import { usePlayer } from '../contexts/PlayerContext';
import { supabase } from '../lib/supabase';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { useBrowseGameStories, GameStory } from '../hooks/queries/useBrowseGameStories';
import { useBrowseRegionalShows } from '../hooks/queries/useBrowseRegionalShows';
import { useBrowsePopularEpisodes, PopularEpisode } from '../hooks/queries/useBrowsePopularEpisodes';

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
      // Sport tab: shows with no team_id for this league (national coverage)
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

function ShowCard({ show, isFollowing, onToggle }: {
  show: any; isFollowing: boolean; onToggle: () => void;
}) {
  return (
    <TouchableOpacity onPress={onToggle} style={{ width: 110, marginRight: 12 }}>
      <View style={{
        width: 110, height: 110, borderRadius: 12,
        backgroundColor: '#2A2A2A', overflow: 'hidden', marginBottom: 6,
        borderWidth: isFollowing ? 2 : 0,
        borderColor: '#FFFFFF',
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
            backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{ color: '#000', fontSize: 11, fontWeight: 'bold' }}>✓</Text>
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

function TeamGrid({ teams, followedSlugs, onToggle }: {
  teams: any[]; followedSlugs: string[]; onToggle: (slug: string) => void;
}) {
  const byDivision = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    teams.forEach(team => {
      const conf = team.conference || '';
      const div = team.division || 'Other';
      const label = conf && !div.startsWith(conf) && !div.match(/^[A-Z]{2}\s/)
        ? `${conf} ${div}` : div;
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
          <Text style={{
            color: '#555', fontSize: 11, fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
          }}>
            {division}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {divTeams.map(team => (
              <TouchableOpacity key={team.id} onPress={() => onToggle(team.slug)}
                style={{ alignItems: 'center', width: 56 }}>
                <View style={{
                  width: 56, height: 56, borderRadius: 10, backgroundColor: '#fff',
                  borderWidth: followedSlugs.includes(team.slug) ? 3 : 1,
                  borderColor: followedSlugs.includes(team.slug) ? (team.primary_color || '#FFFFFF') : '#333',
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
                    backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Text style={{ color: '#000', fontSize: 9, fontWeight: 'bold' }}>✓</Text>
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

function ScoreboardCard({ story }: { story: GameStory }) {
  const navigation = useNavigation<any>();
  const hasScore = story.home_score !== null && story.away_score !== null;
  const homeWon = hasScore && story.home_score! > story.away_score!;
  const awayWon = hasScore && story.away_score! > story.home_score!;

  return (
    <TouchableOpacity
      onPress={() => navigation.navigate('StoryDetail', { storyId: story.id })}
      style={{
        width: 170, marginRight: 12,
        backgroundColor: '#1A1A1A', borderRadius: 12,
        borderWidth: 1, borderColor: '#2A2A2A',
        padding: 12,
      }}
      activeOpacity={0.8}
    >
      {/* Away team row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <View style={{
          width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 8,
        }}>
          {story.away_logo ? (
            <Image source={{ uri: story.away_logo }} style={{ width: 20, height: 20 }} contentFit="contain" />
          ) : (
            <Text style={{ color: '#000', fontSize: 9, fontWeight: 'bold' }}>
              {story.away_abbr?.slice(0, 3) || '?'}
            </Text>
          )}
        </View>
        <Text style={{
          color: awayWon ? '#fff' : '#888', fontSize: 13, fontWeight: '600', flex: 1,
        }} numberOfLines={1}>
          {story.away_abbr || 'AWAY'}
        </Text>
        {hasScore && (
          <Text style={{ color: awayWon ? '#fff' : '#888', fontSize: 16, fontWeight: 'bold' }}>
            {story.away_score}
          </Text>
        )}
      </View>

      {/* Home team row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <View style={{
          width: 26, height: 26, borderRadius: 13, backgroundColor: '#fff',
          alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 8,
        }}>
          {story.home_logo ? (
            <Image source={{ uri: story.home_logo }} style={{ width: 20, height: 20 }} contentFit="contain" />
          ) : (
            <Text style={{ color: '#000', fontSize: 9, fontWeight: 'bold' }}>
              {story.home_abbr?.slice(0, 3) || '?'}
            </Text>
          )}
        </View>
        <Text style={{
          color: homeWon ? '#fff' : '#888', fontSize: 13, fontWeight: '600', flex: 1,
        }} numberOfLines={1}>
          {story.home_abbr || 'HOME'}
        </Text>
        {hasScore && (
          <Text style={{ color: homeWon ? '#fff' : '#888', fontSize: 16, fontWeight: 'bold' }}>
            {story.home_score}
          </Text>
        )}
      </View>

      {/* Footer */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ color: '#555', fontSize: 11 }}>
          {story.episode_count} ep{story.episode_count !== 1 ? 's' : ''}
        </Text>
        {story.sport && (
          <Text style={{ color: '#444', fontSize: 11 }}>· {story.sport.toUpperCase()}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

function PopularEpisodeRow({ episode }: { episode: PopularEpisode }) {
  const { playEpisode } = usePlayer();
  const artwork = episode.artwork_url || episode.shows?.artwork_url;

  const formatDur = (secs: number | null) => {
    if (!secs) return '';
    const mins = Math.floor(secs / 60);
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  };

  const meta = [
    episode.shows?.title,
    formatDur(episode.duration_seconds),
  ].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      onPress={() => playEpisode({
        id: episode.id,
        title: episode.title,
        showTitle: episode.shows?.title || '',
        audioUrl: episode.audio_url,
        artworkUrl: artwork || undefined,
        durationSeconds: episode.duration_seconds ?? undefined,
      })}
      style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 10, gap: 12,
      }}
      activeOpacity={0.8}
    >
      <View style={{
        width: 52, height: 52, borderRadius: 8,
        backgroundColor: '#2A2A2A', overflow: 'hidden', flexShrink: 0,
      }}>
        {artwork ? (
          <Image source={{ uri: artwork }} style={{ width: 52, height: 52 }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 18 }}>🎙</Text>
          </View>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500', lineHeight: 19 }} numberOfLines={2}>
          {episode.title}
        </Text>
        {!!meta && (
          <Text style={{ color: '#666', fontSize: 12, marginTop: 2 }} numberOfLines={1}>{meta}</Text>
        )}
      </View>
      <View style={{
        width: 32, height: 32, borderRadius: 16,
        backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{ color: '#000', fontSize: 11, marginLeft: 2 }}>▶</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function BrowseScreen() {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const [selectedLeague, setSelectedLeague] = useState('all');

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

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: leagueShows, isLoading: loadingShows } = useShowsByLeague(selectedLeagueId);
  const { data: nationalShows, isLoading: loadingNational } = useNationalShows(selectedLeague);
  const { data: gameStories = [], isLoading: loadingScoreboard } = useBrowseGameStories(
    selectedLeague === 'all' ? undefined : selectedLeague
  );
  const { data: regionalShows = [], isLoading: loadingRegional } = useBrowseRegionalShows(
    selectedLeague === 'all' ? undefined : selectedLeague
  );
  const { data: popularEpisodes = [], isLoading: loadingPopular } = useBrowsePopularEpisodes(
    selectedLeague === 'all' ? undefined : selectedLeague
  );

  const leagueTeams = useMemo(() => {
    if (selectedLeague === 'all') return [];
    return (allTeams || []).filter((t: any) => leagueMap[t.league_id] === selectedLeague);
  }, [allTeams, selectedLeague, leagueMap]);

  // ── Handlers ───────────────────────────────────────────────────────────────
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
        .delete().eq('user_id', user.id).eq('show_id', showId).eq('item_type', 'follow');
    } else {
      await supabase.from('user_library')
        .insert({ user_id: user.id, show_id: showId, item_type: 'follow' });
    }
    refetchShows();
  };

  if (leaguesLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#FFFFFF" />
      </View>
    );
  }

  const leagueShortName = (leagues || []).find((l: any) => l.slug === selectedLeague)?.short_name || '';

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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        {selectedLeague === 'all' ? (
          // ── All tab ──────────────────────────────────────────────────────────
          <>
            {/* National Shows */}
            <SectionShelf
              title="National Shows"
              subtitle="The biggest voices in sports"
              loading={loadingNational}
            >
              {(nationalShows || []).map((show: any) => (
                <ShowCard
                  key={show.id} show={show}
                  isFollowing={followedShowIds.includes(show.id)}
                  onToggle={() => handleShowToggle(show.id)}
                />
              ))}
            </SectionShelf>

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
                          borderWidth: 3, borderColor: team.primary_color || '#FFFFFF',
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

            {/* Scoreboard */}
            {(loadingScoreboard || gameStories.length > 0) && (
              <SectionShelf
                title="Scoreboard"
                titleRight={
                  <TouchableOpacity onPress={() => navigation.navigate('Trending')}>
                    <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>See All</Text>
                  </TouchableOpacity>
                }
                loading={loadingScoreboard}
              >
                {gameStories.map(story => (
                  <ScoreboardCard key={story.id} story={story} />
                ))}
              </SectionShelf>
            )}

            {/* Regional Shows */}
            {(loadingRegional || regionalShows.length > 0) && (
              <SectionShelf title="Regional Shows" loading={loadingRegional}>
                {regionalShows.map((show: any) => (
                  <ShowCard
                    key={show.id} show={show}
                    isFollowing={followedShowIds.includes(show.id)}
                    onToggle={() => handleShowToggle(show.id)}
                  />
                ))}
              </SectionShelf>
            )}

            {/* Popular Episodes */}
            {(loadingPopular || popularEpisodes.length > 0) && (
              <View style={{ marginBottom: 28 }}>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 4 }}>
                  Popular Episodes
                </Text>
                <Text style={{ color: '#888', fontSize: 13, paddingHorizontal: 16, marginBottom: 12 }}>
                  What's dropping today
                </Text>
                {loadingPopular ? (
                  <ActivityIndicator color="#FFFFFF" style={{ padding: 20 }} />
                ) : (
                  <View style={{ borderTopWidth: 1, borderTopColor: '#1C1C1C' }}>
                    {popularEpisodes.map((ep, i) => (
                      <View key={ep.id}>
                        <PopularEpisodeRow episode={ep} />
                        {i < popularEpisodes.length - 1 && (
                          <View style={{ height: 1, backgroundColor: '#1C1C1C', marginLeft: 80 }} />
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        ) : (
          // ── Sport tab ─────────────────────────────────────────────────────
          <>
            {/* Teams grid */}
            <View style={{ marginBottom: 28 }}>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 16 }}>
                Teams
              </Text>
              <TeamGrid teams={leagueTeams} followedSlugs={followedSlugs} onToggle={handleTeamToggle} />
            </View>

            {/* Popular league shows */}
            <SectionShelf
              title={`Popular ${leagueShortName} Shows`}
              loading={loadingShows}
            >
              {(leagueShows || []).map((show: any) => (
                <ShowCard
                  key={show.id} show={show}
                  isFollowing={followedShowIds.includes(show.id)}
                  onToggle={() => handleShowToggle(show.id)}
                />
              ))}
            </SectionShelf>

            {/* National shows for this sport */}
            {(loadingNational || (nationalShows || []).length > 0) && (
              <SectionShelf
                title={`${leagueShortName} National Shows`}
                loading={loadingNational}
              >
                {(nationalShows || []).map((show: any) => (
                  <ShowCard
                    key={show.id} show={show}
                    isFollowing={followedShowIds.includes(show.id)}
                    onToggle={() => handleShowToggle(show.id)}
                  />
                ))}
              </SectionShelf>
            )}

            {/* Scoreboard */}
            {(loadingScoreboard || gameStories.length > 0) && (
              <SectionShelf title="Scoreboard" loading={loadingScoreboard}>
                {gameStories.map(story => (
                  <ScoreboardCard key={story.id} story={story} />
                ))}
              </SectionShelf>
            )}

            {/* Regional shows */}
            {(loadingRegional || regionalShows.length > 0) && (
              <SectionShelf title="Regional Shows" loading={loadingRegional}>
                {regionalShows.map((show: any) => (
                  <ShowCard
                    key={show.id} show={show}
                    isFollowing={followedShowIds.includes(show.id)}
                    onToggle={() => handleShowToggle(show.id)}
                  />
                ))}
              </SectionShelf>
            )}

            {/* Popular Episodes */}
            {(loadingPopular || popularEpisodes.length > 0) && (
              <View style={{ marginBottom: 28 }}>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', paddingHorizontal: 16, marginBottom: 12 }}>
                  Popular Episodes
                </Text>
                {loadingPopular ? (
                  <ActivityIndicator color="#FFFFFF" style={{ padding: 20 }} />
                ) : (
                  <View style={{ borderTopWidth: 1, borderTopColor: '#1C1C1C' }}>
                    {popularEpisodes.map((ep, i) => (
                      <View key={ep.id}>
                        <PopularEpisodeRow episode={ep} />
                        {i < popularEpisodes.length - 1 && (
                          <View style={{ height: 1, backgroundColor: '#1C1C1C', marginLeft: 80 }} />
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── SectionShelf helper ─────────────────────────────────────────────────────

function SectionShelf({
  title, subtitle, titleRight, loading, children,
}: {
  title: string;
  subtitle?: string;
  titleRight?: React.ReactNode;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginBottom: 28 }}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, marginBottom: subtitle ? 4 : 12,
      }}>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>{title}</Text>
        {titleRight}
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
