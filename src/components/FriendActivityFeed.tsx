import React from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { usePlayer } from '../contexts/PlayerContext';
import { useFriendActivity, FriendActivity } from '../hooks/queries/useFriendActivity';
import { useFriends } from '../hooks/queries/useFriendships';
import { useAuth } from '../contexts/AuthContext';
import { timeAgo } from './EpisodeFeedPost';

function ActivityCard({
  item,
  onNavigate,
}: {
  item: FriendActivity;
  onNavigate?: (screen: string, params: any) => void;
}) {
  const { playEpisode } = usePlayer();
  const artwork = item.episode.artwork_url || item.episode.show_artwork_url;
  const initial = (item.display_name || 'U').charAt(0).toUpperCase();

  const handlePress = () => {
    playEpisode({
      id: item.episode.id,
      title: item.episode.title,
      showTitle: item.episode.show_title || '',
      artworkUrl: artwork || undefined,
      audioUrl: item.episode.audio_url,
      durationSeconds: item.episode.duration_seconds || undefined,
      showId: item.episode.show_id,
    });
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#1A1A1A',
        gap: 12,
      }}
    >
      {/* Avatar */}
      <TouchableOpacity
        onPress={() => onNavigate?.('PublicProfile', { userId: item.userId })}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          backgroundColor: '#2A2A2A',
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={{ width: 40, height: 40 }} contentFit="cover" />
        ) : (
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{initial}</Text>
        )}
      </TouchableOpacity>

      {/* Text content */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 14, lineHeight: 20 }}>
          <Text style={{ fontWeight: '700' }}>{item.display_name || 'Someone'}</Text>
          {' '}
          <Text style={{ color: '#888' }}>
            {item.type === 'listened' ? 'listened to' : 'commented on'}
          </Text>
        </Text>

        {/* Episode card */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#1A1A1A',
            borderRadius: 10,
            marginTop: 8,
            overflow: 'hidden',
            gap: 10,
          }}
        >
          <View style={{ width: 56, height: 56, backgroundColor: '#2A2A2A' }}>
            {artwork ? (
              <Image source={{ uri: artwork }} style={{ width: 56, height: 56 }} contentFit="cover" />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="mic" size={20} color="#555" />
              </View>
            )}
          </View>
          <View style={{ flex: 1, paddingVertical: 8, paddingRight: 10 }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 17 }} numberOfLines={2}>
              {item.episode.title}
            </Text>
            <Text style={{ color: '#666', fontSize: 11, marginTop: 2 }} numberOfLines={1}>
              {item.episode.show_title}
            </Text>
          </View>
        </View>

        {/* Comment preview */}
        {item.type === 'commented' && item.commentText && (
          <Text
            style={{
              color: '#999',
              fontSize: 13,
              fontStyle: 'italic',
              marginTop: 6,
              lineHeight: 18,
            }}
            numberOfLines={2}
          >
            "{item.commentText}"
          </Text>
        )}

        <Text style={{ color: '#555', fontSize: 11, marginTop: 6 }}>
          {timeAgo(item.timestamp)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function FriendActivityFeed({
  onNavigate,
}: {
  onNavigate?: (screen: string, params: any) => void;
}) {
  const { user } = useAuth();
  const { data: friends = [] } = useFriends(user?.id);
  const { data: activities = [], isLoading } = useFriendActivity();

  if (isLoading) {
    return <ActivityIndicator color="#fff" style={{ marginTop: 60 }} />;
  }

  if (friends.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: '#1E1E1E',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <Ionicons name="people-outline" size={36} color="#444" />
        </View>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 10 }}>
          Add friends
        </Text>
        <Text style={{ color: '#666', fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
          Add friends to see what they're listening to and commenting on.
        </Text>
      </View>
    );
  }

  if (activities.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32 }}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: '#1E1E1E',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <Ionicons name="chatbubbles-outline" size={36} color="#444" />
        </View>
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 10 }}>
          No activity yet
        </Text>
        <Text style={{ color: '#666', fontSize: 15, textAlign: 'center', lineHeight: 22 }}>
          When your friends listen to or comment on episodes, it'll show up here.
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={activities}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <ActivityCard item={item} onNavigate={onNavigate} />}
      scrollEnabled={false}
    />
  );
}
