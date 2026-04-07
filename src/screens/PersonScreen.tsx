import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation, useRoute } from '@react-navigation/native';
import { usePersonAppearances } from '../hooks/queries/usePersonAppearances';
import { useFollowSpeaker } from '../hooks/mutations/useFollowSpeaker';
import { useIsFollowingSpeaker } from '../hooks/queries/useFollowedSpeakers';
import { useAuth } from '../contexts/AuthContext';
import { formatRelativeDate } from '../lib/formatters';

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

export default function PersonScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { personName } = route.params;
  const { user } = useAuth();
  const decodedName = personName ? decodeURIComponent(personName) : '';

  const { data, isLoading, error } = usePersonAppearances(decodedName);
  const speakerId = data?.speaker?.id;
  const isFollowing = useIsFollowingSpeaker(speakerId);
  const followSpeaker = useFollowSpeaker();

  const handleFollowToggle = () => {
    if (!user) {
      Alert.alert('Sign in', 'Sign in to follow speakers');
      return;
    }
    if (!speakerId) return;
    followSpeaker.mutate({ speakerId, isFollowing });
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E53935" />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', padding: 16 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: '#888', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
        <Text style={{ color: '#888', marginTop: 16 }}>Person not found.</Text>
      </View>
    );
  }

  const { hostedShows, episodeAppearances, totalAppearances, isHost, credentials, affiliation, speaker, primaryLeague } = data;
  const avatarBg = primaryLeague?.primary_color || '#374151';

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Back */}
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: '#888', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
          {speaker?.photo_url ? (
            <Image source={{ uri: speaker.photo_url }} style={{ width: 80, height: 80, borderRadius: 40 }} contentFit="cover" />
          ) : (
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: avatarBg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>{getInitials(decodedName)}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold' }}>{decodedName}</Text>
                {credentials && <Text style={{ color: '#E53935', fontSize: 13, fontWeight: '600', marginTop: 2 }}>{credentials}</Text>}
                {affiliation && <Text style={{ color: '#888', fontSize: 13, marginTop: 2 }}>{affiliation}</Text>}
              </View>
              {user && speakerId && (
                <TouchableOpacity
                  onPress={handleFollowToggle}
                  disabled={followSpeaker.isPending}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                    backgroundColor: isFollowing ? '#2A2A2A' : '#E53935',
                    borderWidth: isFollowing ? 1 : 0, borderColor: '#444',
                    marginLeft: 12,
                  }}>
                  <Text style={{ color: isFollowing ? '#aaa' : '#fff', fontSize: 13, fontWeight: '600' }}>
                    {isFollowing ? '✓ Following' : '+ Follow'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              {isHost && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, backgroundColor: '#1E1E1E' }}>
                  <Text style={{ color: '#aaa', fontSize: 12 }}>🎙 Host</Text>
                </View>
              )}
              <Text style={{ color: '#666', fontSize: 13 }}>{totalAppearances} appearance{totalAppearances !== 1 ? 's' : ''}</Text>
            </View>
          </View>
        </View>

        {/* Shows Hosted */}
        {hostedShows.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
              Shows Hosted ({hostedShows.length})
            </Text>
            {hostedShows.map((show: any) => (
              <TouchableOpacity
                key={show.id}
                onPress={() => navigation.navigate('ShowDetail', { showId: show.id })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' }}>
                <View style={{ width: 56, height: 56, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
                  {show.artwork_url ? (
                    <Image source={{ uri: show.artwork_url }} style={{ width: 56, height: 56 }} contentFit="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 20 }}>🎙</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{show.title}</Text>
                  <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                    {[show.publisher, show.episode_count ? `${show.episode_count} eps` : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={{ color: '#555', fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Episode Appearances */}
        {episodeAppearances.length > 0 && (
          <View>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
              Episode Appearances ({episodeAppearances.length})
            </Text>
            {episodeAppearances.slice(0, 20).map((ep: any) => (
              <TouchableOpacity
                key={ep.id}
                onPress={() => navigation.navigate('EpisodeDetail', { episodeId: ep.id })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1E1E1E' }}>
                <View style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A' }}>
                  {(ep.artwork_url || ep.shows?.artwork_url) ? (
                    <Image source={{ uri: ep.artwork_url || ep.shows?.artwork_url }} style={{ width: 52, height: 52 }} contentFit="cover" />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 18 }}>🎙</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={2}>{ep.title}</Text>
                  <Text style={{ color: '#888', fontSize: 12, marginTop: 2 }}>
                    {[ep.shows?.title, ep.published_at ? formatRelativeDate(ep.published_at) : null].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Text style={{ color: '#555', fontSize: 18 }}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {totalAppearances === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ fontSize: 40, marginBottom: 12 }}>👤</Text>
            <Text style={{ color: '#888', fontSize: 15 }}>No appearances found for {decodedName}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
