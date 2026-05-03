import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useFriends, usePendingFriendRequests } from '../hooks/queries/useFriendships';
import { useAcceptFriendRequest, useDeclineFriendRequest, useRemoveFriend } from '../hooks/mutations/useFriendshipMutations';
import { useTeamsBySlug } from '../hooks/queries/useTeamsBySlug';
import { navigate } from '../lib/navigationRef';

// ─── Pending request card ─────────────────────────────────────────────────────

function PendingCard({ request }: { request: any }) {
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const initial = (request.display_name || 'U').charAt(0).toUpperCase();

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
    }}>
      <TouchableOpacity
        onPress={() => navigate('PublicProfile', { userId: request.requesterId })}
        style={{
          width: 48, height: 48, borderRadius: 24,
          backgroundColor: '#2a2a2a', overflow: 'hidden',
          alignItems: 'center', justifyContent: 'center',
        }}>
        {request.avatar_url ? (
          <Image source={{ uri: request.avatar_url }}
            style={{ width: 48, height: 48 }} contentFit="cover" accessible={false} />
        ) : (
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>{initial}</Text>
        )}
      </TouchableOpacity>

      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
          {request.display_name || 'GameVoices User'}
        </Text>
        <Text style={{ color: '#555', fontSize: 12, marginTop: 2 }}>Wants to be friends</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          onPress={() => accept.mutate({ friendshipId: request.friendshipId, requesterId: request.requesterId })}
          disabled={accept.isPending}
          style={{
            backgroundColor: '#fff', borderRadius: 18,
            paddingVertical: 8, paddingHorizontal: 16,
          }}>
          <Text style={{ color: '#000', fontSize: 13, fontWeight: '700' }}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => decline.mutate({ friendshipId: request.friendshipId, requesterId: request.requesterId })}
          disabled={decline.isPending}
          style={{
            backgroundColor: '#1e1e1e', borderRadius: 18,
            paddingVertical: 8, paddingHorizontal: 14,
            borderWidth: 1, borderColor: '#333',
          }}>
          <Text style={{ color: '#888', fontSize: 13, fontWeight: '600' }}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Friend row ───────────────────────────────────────────────────────────────

function FriendRow({ friend }: { friend: any }) {
  const remove = useRemoveFriend();
  const { data: teams = [] } = useTeamsBySlug(friend.topic_slugs);
  const initial = (friend.display_name || 'U').charAt(0).toUpperCase();

  return (
    <TouchableOpacity
      onPress={() => navigate('PublicProfile', { userId: friend.userId })}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
      }}>
      {/* Avatar */}
      <View style={{
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: '#2a2a2a', overflow: 'hidden',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        {friend.avatar_url ? (
          <Image source={{ uri: friend.avatar_url }}
            style={{ width: 52, height: 52 }} contentFit="cover" accessible={false} />
        ) : (
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>{initial}</Text>
        )}
      </View>

      {/* Info */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {friend.display_name || 'GameVoices User'}
        </Text>
        {/* Team chips */}
        {teams.length > 0 && (
          <View style={{ flexDirection: 'row', marginTop: 5, gap: 0 }}>
            {teams.slice(0, 5).map((team, i) => (
              <View key={team.slug} style={{
                width: 22, height: 22, borderRadius: 11,
                backgroundColor: team.primary_color || '#2a2a2a',
                borderWidth: 1.5, borderColor: '#121212',
                marginLeft: i === 0 ? 0 : -5,
                alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {team.logo_url ? (
                  <Image source={{ uri: team.logo_url }}
                    style={{ width: 16, height: 16 }} contentFit="contain" accessible={false} />
                ) : null}
              </View>
            ))}
            {teams.length > 5 && (
              <View style={{
                width: 22, height: 22, borderRadius: 11,
                backgroundColor: '#2a2a2a', marginLeft: -5,
                borderWidth: 1.5, borderColor: '#121212',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ color: '#888', fontSize: 8, fontWeight: '700' }}>+{teams.length - 5}</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <Ionicons name="chevron-forward" size={16} color="#333" />
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const userId = route.params?.userId;
  const [search, setSearch] = useState('');

  const { data: pendingRequests = [], isLoading: pendingLoading } = usePendingFriendRequests();
  const { data: friends = [], isLoading: friendsLoading } = useFriends(userId);

  const filtered = friends.filter((f) =>
    !search || (f.display_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const isLoading = pendingLoading || friendsLoading;

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Nav */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8,
      }}>
        <TouchableOpacity onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700',
          flex: 1, textAlign: 'center' }}>Friends</Text>
        <View style={{ width: 26 }} />
      </View>

      {isLoading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

          {/* Pending requests */}
          {pendingRequests.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <Text style={{
                color: '#555', fontSize: 12, fontWeight: '600',
                textTransform: 'uppercase', letterSpacing: 1,
                paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
              }}>
                Friend Requests · {pendingRequests.length}
              </Text>
              {pendingRequests.map((req) => (
                <PendingCard key={req.friendshipId} request={req} />
              ))}
            </View>
          )}

          {/* Search */}
          {friends.length > 0 && (
            <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>
              <View style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                backgroundColor: '#1a1a1a', borderRadius: 12,
                paddingHorizontal: 14, paddingVertical: 10,
              }}>
                <Ionicons name="search" size={16} color="#555" />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search friends..."
                  placeholderTextColor="#555"
                  style={{ flex: 1, color: '#fff', fontSize: 14 }}
                />
              </View>
            </View>
          )}

          {/* Friends list */}
          <Text style={{
            color: '#555', fontSize: 12, fontWeight: '600',
            textTransform: 'uppercase', letterSpacing: 1,
            paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
          }}>
            {friends.length > 0 ? `Friends · ${friends.length}` : 'Friends'}
          </Text>

          {filtered.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 40, gap: 8 }}>
              <Ionicons name="people-outline" size={40} color="#333" />
              <Text style={{ color: '#555', fontSize: 15 }}>
                {search ? 'No results' : 'No friends yet'}
              </Text>
              {!search && (
                <Text style={{ color: '#444', fontSize: 13, textAlign: 'center',
                  paddingHorizontal: 40, marginTop: 4 }}>
                  Add friends by tapping their avatar in the comments
                </Text>
              )}
            </View>
          ) : (
            filtered.map((friend) => (
              <FriendRow key={friend.userId} friend={friend} />
            ))
          )}

        </ScrollView>
      )}
    </View>
  );
}
