import React from 'react';
import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { usePlayer } from '../contexts/PlayerContext';
import { GameWithTeams } from '../hooks/useRecentGames';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.72;

interface RecapStory {
  id: string;
  headline: string;
  story_type: string;
  team_slugs: string[];
  event_date: string | null;
  episode_count: number;
  showArtworks?: string[];
  episodes?: any[];
}

interface Props {
  story: RecapStory;
  teamColor: string;
  opponentTeam?: any;
  matchedTeam?: any;
  onNavigate?: (screen: string, params: any) => void;
  compact?: boolean;
}

function parseHeadline(headline: string) {
  const wonPattern = /^(.+?)\s+(beat|defeat|edge|top|down|outlast|outscor|nip|blank|rout|crush|stun|overcome|hold off|hold on)\s+(.+?)\s+(\d+-\d+)/i;
  const lostPattern = /^(.+?)\s+(lost? to|fell? to|drop|edged by|fall to|drops? to|beaten by|defeated by)\s+(.+?)\s+(\d+-\d+)/i;
  const wonMatch = headline.match(wonPattern);
  const lostMatch = headline.match(lostPattern);
  if (wonMatch) return { team1: wonMatch[1].trim(), team2: wonMatch[3].trim(), score: wonMatch[4], won: true };
  if (lostMatch) return { team1: lostMatch[1].trim(), team2: lostMatch[3].trim(), score: lostMatch[4], won: false };
  return null;
}

function formatEventDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return '';
  }
}

function TeamLogoBox({ team, fallbackLabel }: { team?: any; fallbackLabel: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      {team?.logo_url ? (
        <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#fff',
          alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
          <Image source={{ uri: team.logo_url }} style={{ width: 36, height: 36 }} contentFit="contain" />
        </View>
      ) : (
        <View style={{ width: 44, height: 44, borderRadius: 8, backgroundColor: '#2A2A2A',
          alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
            {fallbackLabel}
          </Text>
        </View>
      )}
      <Text style={{ color: '#888', fontSize: 10 }} numberOfLines={1}>
        {team?.short_name?.slice(0, 3).toUpperCase() || fallbackLabel}
      </Text>
    </View>
  );
}

export function ScoreboardCard({ story, teamColor, opponentTeam, matchedTeam, onNavigate, compact }: Props) {
  const color = teamColor || '#FFFFFF';
  const opponentColor = opponentTeam?.primary_color || '#444';
  const parsed = parseHeadline(story.headline);
  const dateStr = formatEventDate(story.event_date);
  const artworks = story.showArtworks || [];

  if (compact) {
    // Lovable-style compact horizontal card
    const scores = parsed?.score?.split('-') || [];
    const score1 = scores[0] || '';
    const score2 = scores[1] || '';

    // team1 = winner (or first named), team2 = loser (or second named)
    // matchedTeam may be either; show matchedTeam on left, opponentTeam on right
    const leftTeam = matchedTeam;
    const rightTeam = opponentTeam;
    const leftLabel = parsed?.team1.split(' ').pop()?.slice(0, 3).toUpperCase() || '---';
    const rightLabel = parsed?.team2.split(' ').pop()?.slice(0, 3).toUpperCase() || '---';

    // Determine if matchedTeam is team1 in the headline
    const matchedIsTeam1 = parsed
      ? parsed.team1.toLowerCase().includes(matchedTeam?.short_name?.toLowerCase() || '~~~')
      : true;
    // score1 is always team1's score, score2 is always team2's score (regardless of won/lost)
    const leftScore = matchedIsTeam1 ? score1 : score2;
    const rightScore = matchedIsTeam1 ? score2 : score1;
    const leftWon = parsed ? (matchedIsTeam1 ? parsed.won : !parsed.won) : false;

    return (
      <TouchableOpacity
        onPress={() => onNavigate?.('StoryDetail', { storyId: story.id })}
        style={{
          width: CARD_WIDTH, backgroundColor: '#1E1E1E',
          borderRadius: 14, overflow: 'hidden',
        }}
      >
        {/* Split team-color top bar */}
        <View style={{ height: 3, flexDirection: 'row' }}>
          <View style={{ flex: 1, backgroundColor: color }} />
          <View style={{ flex: 1, backgroundColor: opponentColor }} />
        </View>

        <View style={{ padding: 14 }}>
          {/* FINAL + date */}
          <Text style={{ color: '#888', fontSize: 11, fontWeight: '600',
            textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>
            FINAL{dateStr ? ` · ${dateStr}` : ''}
          </Text>

          {/* Score display */}
          {parsed ? (
            <View style={{ flexDirection: 'row', alignItems: 'center',
              justifyContent: 'space-between', marginBottom: 14 }}>
              <TeamLogoBox team={leftTeam} fallbackLabel={leftLabel} />

              {/* Score */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1.5, justifyContent: 'center' }}>
                <Text style={{ color: leftWon ? '#fff' : '#888', fontSize: 28, fontWeight: '800' }}>
                  {leftScore}
                </Text>
                <Text style={{ color: '#555', fontSize: 14 }}>▶</Text>
                <Text style={{ color: leftWon ? '#888' : '#fff', fontSize: 28, fontWeight: '800' }}>
                  {rightScore}
                </Text>
              </View>

              <TeamLogoBox team={rightTeam} fallbackLabel={rightLabel} />
            </View>
          ) : (
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600',
              marginBottom: 14, lineHeight: 18 }} numberOfLines={2}>
              {story.headline}
            </Text>
          )}

          {/* Show artwork thumbnails */}
          {artworks.length > 0 && (
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              {artworks.slice(0, 3).map((url, i) => (
                <View key={i} style={{ width: 38, height: 38, borderRadius: 6, overflow: 'hidden',
                  backgroundColor: '#2A2A2A' }}>
                  <Image source={{ uri: url }} style={{ width: 38, height: 38 }} contentFit="cover" />
                </View>
              ))}
            </View>
          )}

          {/* Play All Takes button */}
          <TouchableOpacity
            onPress={() => onNavigate?.('StoryDetail', { storyId: story.id })}
            style={{
              borderWidth: 1.5, borderColor: '#444', borderRadius: 10,
              paddingVertical: 10, alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
              ▶  Play All Takes
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  // Legacy full-width card (kept for any other usages)
  return (
    <TouchableOpacity
      onPress={() => onNavigate?.('StoryDetail', { storyId: story.id })}
      style={{ marginHorizontal: 16, marginBottom: 16, borderRadius: 16,
        overflow: 'hidden', backgroundColor: '#1A1A1A' }}
    >
      <View style={{ height: 3, backgroundColor: color }} />
      <View style={{ padding: 16 }}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700',
          lineHeight: 22, marginBottom: 12 }}>
          {story.headline}
        </Text>
        {artworks.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
            {artworks.slice(0, 4).map((url, i) => (
              <View key={i} style={{ width: 36, height: 36, borderRadius: 6,
                overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
                <Image source={{ uri: url }} style={{ width: 36, height: 36 }} contentFit="cover" />
              </View>
            ))}
          </View>
        )}
        <TouchableOpacity
          onPress={() => onNavigate?.('StoryDetail', { storyId: story.id })}
          style={{ backgroundColor: color, borderRadius: 24, paddingVertical: 12,
            alignItems: 'center' }}
        >
          <Text style={{ color: '#fff', fontSize: 14, fontWeight: 'bold' }}>▶  Play All Takes</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function formatGameDate(dateStr: string): string {
  try {
    const [, month, day] = dateStr.split('-');
    return `${parseInt(month)}/${parseInt(day)}`;
  } catch { return ''; }
}

export function GameScoreCard({ game, onNavigate }: {
  game: GameWithTeams;
  onNavigate?: (screen: string, params: any) => void;
}) {
  const userFollowsHome = game.followedTeamSlug === game.home_team_slug;
  const leftTeam = userFollowsHome ? game.homeTeam : game.awayTeam;
  const rightTeam = userFollowsHome ? game.awayTeam : game.homeTeam;
  const leftScore = userFollowsHome ? game.home_score : game.away_score;
  const rightScore = userFollowsHome ? game.away_score : game.home_score;
  const leftWon = leftScore > rightScore;

  const leftColor = leftTeam?.primary_color || '#888';
  const rightColor = rightTeam?.primary_color || '#444';
  const dateStr = formatGameDate(game.event_date);

  const leftLabel = leftTeam?.short_name?.split(' ').pop()?.slice(0, 3).toUpperCase() || '---';
  const rightLabel = rightTeam?.short_name?.split(' ').pop()?.slice(0, 3).toUpperCase() || '---';

  return (
    <TouchableOpacity
      onPress={() => game.storyId && onNavigate?.('StoryDetail', { storyId: game.storyId })}
      activeOpacity={game.storyId ? 0.7 : 1}
      style={{ width: CARD_WIDTH, backgroundColor: '#1E1E1E', borderRadius: 14, overflow: 'hidden' }}
    >
      {/* Split team-color top bar */}
      <View style={{ height: 3, flexDirection: 'row' }}>
        <View style={{ flex: 1, backgroundColor: leftColor }} />
        <View style={{ flex: 1, backgroundColor: rightColor }} />
      </View>

      <View style={{ padding: 14 }}>
        <Text style={{ color: '#888', fontSize: 11, fontWeight: '600',
          textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12 }}>
          FINAL{dateStr ? ` · ${dateStr}` : ''}
        </Text>

        {/* Score row */}
        <View style={{ flexDirection: 'row', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 14 }}>
          <TeamLogoBox team={leftTeam} fallbackLabel={leftLabel} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1.5, justifyContent: 'center' }}>
            <Text style={{ color: leftWon ? '#fff' : '#888', fontSize: 28, fontWeight: '800' }}>
              {leftScore}
            </Text>
            <Text style={{ color: '#555', fontSize: 14 }}>▶</Text>
            <Text style={{ color: leftWon ? '#888' : '#fff', fontSize: 28, fontWeight: '800' }}>
              {rightScore}
            </Text>
          </View>

          <TeamLogoBox team={rightTeam} fallbackLabel={rightLabel} />
        </View>

        {/* Play All Takes if story exists, otherwise placeholder */}
        {game.storyId ? (
          <TouchableOpacity
            onPress={() => onNavigate?.('StoryDetail', { storyId: game.storyId })}
            style={{ borderWidth: 1.5, borderColor: '#444', borderRadius: 10,
              paddingVertical: 10, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
              ▶  Play All Takes
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={{ borderWidth: 1.5, borderColor: '#2A2A2A', borderRadius: 10,
            paddingVertical: 10, alignItems: 'center' }}>
            <Text style={{ color: '#555', fontSize: 13, fontWeight: '600' }}>
              No podcast coverage yet
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}
