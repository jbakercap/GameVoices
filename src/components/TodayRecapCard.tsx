import React, { useState } from 'react';
import {
    View, Text, TouchableOpacity,
  } from 'react-native';
  import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Ionicons } from '@expo/vector-icons';

interface RecapStory {
  id: string;
  headline: string;
  story_type: string;
  team_slugs: string[];
  event_date: string | null;
  episode_count: number;
}

const LEAGUE_HOURS: Record<string, number> = {
  mlb: 36,
  nba: 48,
  nfl: 144, // 6 days
  nhl: 48,
  wnba: 48,
};
const DEFAULT_HOURS = 48;
const MAX_HOURS = 144;

export function useTodayRecap(teamSlugs: string[]) {
  return useQuery({
    queryKey: ['today-recap', teamSlugs],
    queryFn: async (): Promise<RecapStory[]> => {
      if (teamSlugs.length === 0) return [];

      // Fetch league slugs for followed teams
      const { data: teamsData } = await supabase
        .from('teams')
        .select('slug, leagues!inner(slug)')
        .in('slug', teamSlugs);

      const teamLeagueMap: Record<string, string> = {};
      for (const t of teamsData || []) {
        teamLeagueMap[t.slug] = (t.leagues as any)?.slug || '';
      }

      // Fetch with the maximum window, filter per-league client-side
      const maxCutoff = new Date(Date.now() - MAX_HOURS * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('stories')
        .select('id, headline, story_type, team_slugs, event_date, episode_count, created_at')
        .eq('status', 'active')
        .eq('story_type', 'game_result')
        .overlaps('team_slugs', teamSlugs)
        .gt('expires_at', new Date().toISOString())
        .gte('created_at', maxCutoff)
        .order('event_date', { ascending: false })
        .limit(20);

      if (error) throw error;

      const now = Date.now();
      return (data || []).filter(story => {
        // Find the league for this story via the first matching followed team
        const matchedSlug = (story.team_slugs || []).find((s: string) => teamLeagueMap[s]);
        const leagueSlug = matchedSlug ? teamLeagueMap[matchedSlug] : '';
        const hours = LEAGUE_HOURS[leagueSlug] ?? DEFAULT_HOURS;
        const cutoff = now - hours * 60 * 60 * 1000;
        return new Date(story.created_at).getTime() >= cutoff;
      });
    },
    enabled: teamSlugs.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

function parseHeadline(headline: string): {
    teamName: string;
    won: boolean;
    opponent: string;
    score: string;
  } {
    const wonPattern = /^(.+?)\s+(beat|defeat|edge|top|down|outlast|outscor|nip|blank|rout|crush|stun|overcome|hold off|hold on)\s+(.+?)\s+(\d+-\d+)/i;
    const lostPattern = /^(.+?)\s+(lost? to|fell? to|drop|edged by|fall to|drops? to|beaten by|defeated by)\s+(.+?)\s+(\d+-\d+)/i;
  
    const wonMatch = headline.match(wonPattern);
    const lostMatch = headline.match(lostPattern);
  
    if (wonMatch) {
      return { teamName: wonMatch[1].trim(), won: true, opponent: wonMatch[3].trim(), score: wonMatch[4] };
    }
    if (lostMatch) {
      return { teamName: lostMatch[1].trim(), won: false, opponent: lostMatch[3].trim(), score: lostMatch[4] };
    }
  
    return { teamName: '', won: false, opponent: headline, score: '' };
  }

interface TodayRecapCardProps {
  teamSlugs: string[];
  teams: any[];
  onNavigate?: (screen: string, params: any) => void;
}

export function TodayRecapCard({ teamSlugs, teams, onNavigate }: TodayRecapCardProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { data: stories, isLoading } = useTodayRecap(teamSlugs);

  if (isLoading || !stories || stories.length === 0) return null;

  return (
    <View style={{
      marginHorizontal: 16, marginBottom: 24,
      backgroundColor: '#1E1E1E', borderRadius: 16,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <TouchableOpacity
        onPress={() => setCollapsed(!collapsed)}
        style={{
          flexDirection: 'row', alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16, paddingVertical: 14,
        }}>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: 'bold' }}>
          Today's Recap
        </Text>
        <Text style={{ color: '#888', fontSize: 14 }}>
          {collapsed ? 'Expand' : 'Collapse'}
        </Text>
      </TouchableOpacity>

      {/* Game rows */}
      {!collapsed && stories.map((story) => {
        const parsed = parseHeadline(story.headline);

        // Find matching team for logo
        const matchedTeam = teams.find(t =>
          story.team_slugs.includes(t.slug)
        );

        return (
          <TouchableOpacity
            key={story.id}
            onPress={() => onNavigate?.('StoryDetail', { storyId: story.id })}
            style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: 16, paddingVertical: 12,
              borderTopWidth: 1, borderTopColor: '#2A2A2A',
            }}>
            {/* Team logo */}
            <View style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: '#2A2A2A',
              alignItems: 'center', justifyContent: 'center',
              marginRight: 12, overflow: 'hidden',
            }}>
              {matchedTeam?.logo_url ? (
                <Image
                  source={{ uri: matchedTeam.logo_url }}
                  style={{ width: 28, height: 28 }}
                  contentFit="contain"
                />
              ) : (
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                  {matchedTeam?.abbreviation?.slice(0, 2) || '?'}
                </Text>
              )}
            </View>

            {/* Headline */}
            <View style={{ flex: 1 }}>
              {parsed.teamName ? (
                <Text style={{ fontSize: 14, fontWeight: '600' }} numberOfLines={2}>
                  <Text style={{ color: '#fff' }}>{parsed.teamName} </Text>
                  <Text style={{ color: parsed.won ? '#4CAF50' : '#888' }}>
                    {parsed.won ? 'beat' : 'lost to'}
                  </Text>
                  <Text style={{ color: '#fff' }}> {parsed.opponent} </Text>
                  <Text style={{ color: parsed.won ? '#4CAF50' : '#888' }}>
                    {parsed.score}
                  </Text>
                </Text>
              ) : (
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={2}>
                  {story.headline}
                </Text>
              )}
            </View>

            <Ionicons name="chevron-forward" size={16} color="#555" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}