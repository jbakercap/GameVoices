import { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, SafeAreaView, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TEAM_TILE_SIZE = (SCREEN_WIDTH - 48) / 4; // 4 columns with padding

type Step = 'welcome' | 'leagues' | 'teams' | 'shows';

const LEAGUES = [
  { slug: 'nfl', name: 'NFL', emoji: '🏈' },
  { slug: 'nba', name: 'NBA', emoji: '🏀' },
  { slug: 'mlb', name: 'MLB', emoji: '⚾' },
  { slug: 'nhl', name: 'NHL', emoji: '🏒' },
  { slug: 'wnba', name: 'WNBA', emoji: '🏀' },
];

function useTeamsByLeagueSlugs(leagueSlugs: string[]) {
  return useQuery({
    queryKey: ['onboarding-teams', leagueSlugs],
    queryFn: async () => {
      if (leagueSlugs.length === 0) return [];

      const { data: leagues } = await supabase
        .from('leagues')
        .select('id, slug')
        .in('slug', leagueSlugs);

      if (!leagues?.length) return [];

      const leagueIds = leagues.map(l => l.id);
      const leagueMap: Record<string, string> = {};
      leagues.forEach(l => { leagueMap[l.id] = l.slug; });

      const { data, error } = await supabase
        .from('teams')
        .select('id, name, short_name, slug, logo_url, primary_color, league_id, division, conference')
        .in('league_id', leagueIds)
        .order('short_name');

      if (error) throw error;
      return (data || []).map(t => ({ ...t, league_slug: leagueMap[t.league_id] }));
    },
    enabled: leagueSlugs.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

function useSuggestedShows(teamSlugs: string[]) {
  return useQuery({
    queryKey: ['onboarding-shows', teamSlugs],
    queryFn: async () => {
      if (teamSlugs.length === 0) return [];

      const { data: teams } = await supabase
        .from('teams')
        .select('id, slug, league_id')
        .in('slug', teamSlugs);

      if (!teams?.length) return [];

      const teamIds = teams.map(t => t.id);

      const { data, error } = await supabase
        .from('shows')
        .select('id, title, artwork_url, episode_count, team_id')
        .in('team_id', teamIds)
        .eq('status', 'active')
        .order('episode_count', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    enabled: teamSlugs.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}

// Progress bar at the top
function ProgressBar({ step }: { step: Step }) {
  const steps: Step[] = ['welcome', 'leagues', 'teams', 'shows'];
  const current = steps.indexOf(step);
  return (
    <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
      {steps.map((s, i) => (
        <View key={s} style={{
          flex: 1, height: 3, borderRadius: 2,
          backgroundColor: i <= current ? '#FFFFFF' : '#333',
        }} />
      ))}
    </View>
  );
}

export default function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('welcome');
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [followedShows, setFollowedShows] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const { data: teams, isLoading: teamsLoading } = useTeamsByLeagueSlugs(selectedLeagues);
  const { data: shows, isLoading: showsLoading } = useSuggestedShows(selectedTeams);

  const toggleLeague = (slug: string) => {
    setSelectedLeagues(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  };

  const toggleTeam = (slug: string) => {
    setSelectedTeams(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    );
  };

  const toggleShow = (id: string) => {
    setFollowedShows(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  // Group teams by league then division
  const teamsByLeague = useMemo(() => {
    const grouped: Record<string, Record<string, any[]>> = {};
    (teams || []).forEach(team => {
      const league = team.league_slug || 'other';
      const div = team.division || 'Other';
      if (!grouped[league]) grouped[league] = {};
      if (!grouped[league][div]) grouped[league][div] = [];
      grouped[league][div].push(team);
    });
    return grouped;
  }, [teams]);

  const handleComplete = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      // Save selected teams to profile topic_slugs
      await supabase
        .from('profiles')
        .upsert({ user_id: user.id, topic_slugs: selectedTeams }, { onConflict: 'user_id' });

      // Save followed shows to user_library
      if (followedShows.length > 0) {
        await supabase.from('user_library').insert(
          followedShows.map(showId => ({
            user_id: user.id,
            show_id: showId,
            item_type: 'follow',
          }))
        );
      }

      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      onComplete();
    } catch (error) {
      console.error('Onboarding save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#121212' }}>
      <ProgressBar step={step} />

      {/* STEP: WELCOME */}
      {step === 'welcome' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{
            width: 80, height: 80, borderRadius: 20,
            backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center',
            marginBottom: 24,
          }}>
            <Text style={{ fontSize: 40 }}>🎙</Text>
          </View>
          <Text style={{ color: '#fff', fontSize: 30, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 }}>
            Welcome to GameVoices
          </Text>
          <Text style={{ color: '#888', fontSize: 16, textAlign: 'center', lineHeight: 24, marginBottom: 40 }}>
            Personalize your sports podcast experience in a few quick steps
          </Text>
          <TouchableOpacity
            onPress={() => setStep('leagues')}
            style={{
              backgroundColor: '#FFFFFF', paddingHorizontal: 48, paddingVertical: 16,
              borderRadius: 28, flexDirection: 'row', alignItems: 'center', gap: 8,
            }}>
            <Text style={{ color: '#000', fontSize: 17, fontWeight: '700' }}>Get Started</Text>
            <Text style={{ color: '#000', fontSize: 17 }}>›</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* STEP: LEAGUES */}
      {step === 'leagues' && (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: 'bold', marginBottom: 6 }}>
              Which leagues do you follow?
            </Text>
            <Text style={{ color: '#888', fontSize: 14 }}>Select all that apply</Text>
          </View>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
            {LEAGUES.map(league => {
              const selected = selectedLeagues.includes(league.slug);
              return (
                <TouchableOpacity
                  key={league.slug}
                  onPress={() => toggleLeague(league.slug)}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    backgroundColor: selected ? 'rgba(255,255,255,0.10)' : '#1E1E1E',
                    borderWidth: 2, borderColor: selected ? '#FFFFFF' : '#333',
                    borderRadius: 14, padding: 18, marginBottom: 10,
                  }}>
                  <Text style={{ fontSize: 28, marginRight: 16 }}>{league.emoji}</Text>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600', flex: 1 }}>
                    {league.name}
                  </Text>
                  {selected && (
                    <View style={{
                      width: 26, height: 26, borderRadius: 13,
                      backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{ color: '#000', fontSize: 14, fontWeight: 'bold' }}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Bottom button */}
          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: 16, backgroundColor: '#121212',
            borderTopWidth: 1, borderTopColor: '#222',
          }}>
            <TouchableOpacity
              onPress={() => setStep('teams')}
              disabled={selectedLeagues.length === 0}
              style={{
                backgroundColor: selectedLeagues.length > 0 ? '#FFFFFF' : '#333',
                paddingVertical: 16, borderRadius: 28, alignItems: 'center',
              }}>
              <Text style={{ color: selectedLeagues.length > 0 ? '#000' : '#fff', fontSize: 17, fontWeight: '700' }}>
                Continue {selectedLeagues.length > 0 ? `(${selectedLeagues.length})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* STEP: TEAMS */}
      {step === 'teams' && (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: 'bold', marginBottom: 6 }}>
              Pick your teams
            </Text>
            <Text style={{ color: '#888', fontSize: 14 }}>
              Tap to follow — your feed will be built around these
            </Text>
          </View>

          {teamsLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#FFFFFF" size="large" />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
              {Object.entries(teamsByLeague).map(([leagueSlug, divisions]) => (
                <View key={leagueSlug} style={{ marginBottom: 24 }}>
                  <Text style={{
                    color: '#FFFFFF', fontSize: 13, fontWeight: '700',
                    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12,
                  }}>
                    {LEAGUES.find(l => l.slug === leagueSlug)?.name || leagueSlug.toUpperCase()}
                  </Text>
                  {Object.entries(divisions).sort().map(([division, divTeams]) => (
                    <View key={division} style={{ marginBottom: 16 }}>
                      <Text style={{
                        color: '#555', fontSize: 11, fontWeight: '600',
                        textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10,
                      }}>
                        {division}
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                        {divTeams.map(team => {
                          const selected = selectedTeams.includes(team.slug);
                          return (
                            <TouchableOpacity
                              key={team.id}
                              onPress={() => toggleTeam(team.slug)}
                              style={{ alignItems: 'center', width: TEAM_TILE_SIZE }}>
                              <View style={{
                                width: TEAM_TILE_SIZE - 8, height: TEAM_TILE_SIZE - 8,
                                borderRadius: 12, backgroundColor: '#fff',
                                borderWidth: selected ? 3 : 1,
                                borderColor: selected ? (team.primary_color || '#FFFFFF') : '#333',
                                alignItems: 'center', justifyContent: 'center',
                                overflow: 'hidden', marginBottom: 6,
                              }}>
                                {team.logo_url ? (
                                  <Image
                                    source={{ uri: team.logo_url }}
                                    style={{ width: '72%', height: '72%' }}
                                    contentFit="contain"
                                  />
                                ) : (
                                  <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 11 }}>
                                    {team.short_name?.slice(0, 3)}
                                  </Text>
                                )}
                              </View>
                              {selected && (
                                <View style={{
                                  position: 'absolute', top: 0, right: 4,
                                  width: 18, height: 18, borderRadius: 9,
                                  backgroundColor: '#FFFFFF',
                                  alignItems: 'center', justifyContent: 'center',
                                }}>
                                  <Text style={{ color: '#000', fontSize: 10, fontWeight: 'bold' }}>✓</Text>
                                </View>
                              )}
                              <Text style={{
                                color: selected ? '#fff' : '#aaa',
                                fontSize: 10, textAlign: 'center', fontWeight: selected ? '600' : '400',
                              }} numberOfLines={1}>
                                {team.short_name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
          )}

          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: 16, backgroundColor: '#121212',
            borderTopWidth: 1, borderTopColor: '#222',
          }}>
            <TouchableOpacity
              onPress={() => setStep('shows')}
              disabled={selectedTeams.length === 0}
              style={{
                backgroundColor: selectedTeams.length > 0 ? '#FFFFFF' : '#333',
                paddingVertical: 16, borderRadius: 28, alignItems: 'center',
              }}>
              <Text style={{ color: selectedTeams.length > 0 ? '#000' : '#fff', fontSize: 17, fontWeight: '700' }}>
                Continue {selectedTeams.length > 0 ? `(${selectedTeams.length} teams)` : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* STEP: SHOWS */}
      {step === 'shows' && (
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }}>
            <Text style={{ color: '#fff', fontSize: 26, fontWeight: 'bold', marginBottom: 6 }}>
              Follow some shows
            </Text>
            <Text style={{ color: '#888', fontSize: 14 }}>
              New episodes will appear in your feed
            </Text>
          </View>

          {showsLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#FFFFFF" size="large" />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {(shows || []).map(show => {
                  const selected = followedShows.includes(show.id);
                  const tileSize = (SCREEN_WIDTH - 56) / 3;
                  return (
                    <TouchableOpacity
                      key={show.id}
                      onPress={() => toggleShow(show.id)}
                      style={{ width: tileSize, borderRadius: 12, overflow: 'hidden' }}>
                      <View style={{
                        width: tileSize, height: tileSize,
                        backgroundColor: '#2A2A2A', borderRadius: 12, overflow: 'hidden',
                        borderWidth: selected ? 3 : 0,
                        borderColor: '#FFFFFF',
                      }}>
                        {show.artwork_url ? (
                          <Image source={{ uri: show.artwork_url }}
                            style={{ width: '100%', height: '100%' }} contentFit="cover" />
                        ) : (
                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 32 }}>🎙</Text>
                          </View>
                        )}
                        {selected && (
                          <View style={{
                            position: 'absolute', inset: 0,
                            backgroundColor: 'rgba(255,255,255,0.25)',
                            alignItems: 'center', justifyContent: 'center',
                          }}>
                            <View style={{
                              width: 36, height: 36, borderRadius: 18,
                              backgroundColor: '#FFFFFF',
                              alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Text style={{ color: '#000', fontSize: 18, fontWeight: 'bold' }}>✓</Text>
                            </View>
                          </View>
                        )}
                        {/* Title overlay */}
                        <View style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0,
                          padding: 8, paddingTop: 24,
                          backgroundColor: 'transparent',
                        }}>
                        </View>
                      </View>
                      <Text style={{ color: '#ccc', fontSize: 11, marginTop: 5, fontWeight: '500' }}
                        numberOfLines={2}>
                        {show.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          <View style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: 16, backgroundColor: '#121212',
            borderTopWidth: 1, borderTopColor: '#222',
            flexDirection: 'row', gap: 12,
          }}>
            <TouchableOpacity
              onPress={handleComplete}
              disabled={isSaving}
              style={{
                flex: 1, paddingVertical: 16, borderRadius: 28,
                borderWidth: 1, borderColor: '#444',
                alignItems: 'center',
              }}>
              <Text style={{ color: '#aaa', fontSize: 17, fontWeight: '600' }}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleComplete}
              disabled={isSaving}
              style={{
                flex: 2, backgroundColor: '#FFFFFF',
                paddingVertical: 16, borderRadius: 28, alignItems: 'center',
              }}>
              {isSaving ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={{ color: '#000', fontSize: 17, fontWeight: '700' }}>
                  Done {followedShows.length > 0 ? `(${followedShows.length})` : ''}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}