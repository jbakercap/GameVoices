import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, RefreshControl, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import {
  useFriends,
  usePendingFriendRequests,
  useOutgoingFriendRequests,
  useFriendshipStatus,
} from '../hooks/queries/useFriendships';
import { useSearchProfiles, SearchResult } from '../hooks/queries/useSearchProfiles';
import {
  useSendFriendRequest,
  useCancelFriendRequest,
  useAcceptFriendRequest,
  useDeclineFriendRequest,
} from '../hooks/mutations/useFriendshipMutations';
import { useTeamsBySlug } from '../hooks/queries/useTeamsBySlug';
import { navigate } from '../lib/navigationRef';

// ─── Avatar helper ───────────────────────────────────────────────────────────

function Avatar({ uri, name, size = 48 }: { uri?: string | null; name?: string | null; size?: number }) {
  const initial = (name || 'U').charAt(0).toUpperCase();
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: '#2a2a2a', overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center',
    }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} contentFit="cover" accessible={false} />
      ) : (
        <Text style={{ color: '#fff', fontSize: size * 0.38, fontWeight: '700' }}>{initial}</Text>
      )}
    </View>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────

function SectionLabel({ label, count }: { label: string; count?: number }) {
  return (
    <Text style={{
      color: '#555', fontSize: 12, fontWeight: '600',
      textTransform: 'uppercase', letterSpacing: 1,
      paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    }}>
      {label}{count !== undefined ? ` · ${count}` : ''}
    </Text>
  );
}

// ─── Search result row ───────────────────────────────────────────────────────

function SearchResultRow({ result }: { result: SearchResult }) {
  const { data: status = 'none' } = useFriendshipStatus(result.user_id);
  const send = useSendFriendRequest();
  const cancel = useCancelFriendRequest();

  const handleAdd = () => {
    send.mutate(result.user_id, {
      onError: (err: any) => {
        console.warn('Send friend request error:', err);
        Alert.alert('Error', err?.message || 'Could not send friend request');
      },
    });
  };

  return (
    <TouchableOpacity
      onPress={() => navigate('PublicProfile', { userId: result.user_id })}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 20, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
      }}>
      <Avatar uri={result.avatar_url} name={result.display_name} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {result.display_name || 'GameVoices User'}
        </Text>
        {result.username && (
          <Text style={{ color: '#666', fontSize: 13, marginTop: 1 }}>@{result.username}</Text>
        )}
      </View>
      {status === 'none' && (
        <TouchableOpacity
          onPress={handleAdd}
          disabled={send.isPending}
          style={{
            backgroundColor: '#fff', borderRadius: 18,
            paddingVertical: 7, paddingHorizontal: 16,
          }}>
          <Text style={{ color: '#000', fontSize: 13, fontWeight: '700' }}>
            {send.isPending ? '...' : 'Add'}
          </Text>
        </TouchableOpacity>
      )}
      {status === 'pending_sent' && (
        <TouchableOpacity
          onPress={() => cancel.mutate(result.user_id)}
          style={{
            backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333',
            borderRadius: 18, paddingVertical: 7, paddingHorizontal: 14,
          }}>
          <Text style={{ color: '#888', fontSize: 13, fontWeight: '600' }}>Pending</Text>
        </TouchableOpacity>
      )}
      {status === 'friends' && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 4,
          paddingVertical: 7, paddingHorizontal: 14,
        }}>
          <Ionicons name="checkmark" size={14} color="#22c55e" />
          <Text style={{ color: '#22c55e', fontSize: 13, fontWeight: '600' }}>Friends</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Incoming request card ───────────────────────────────────────────────────

function IncomingCard({ request }: { request: any }) {
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
    }}>
      <TouchableOpacity onPress={() => navigate('PublicProfile', { userId: request.requesterId })}>
        <Avatar uri={request.avatar_url} name={request.display_name} />
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

// ─── Outgoing request card ───────────────────────────────────────────────────

function OutgoingCard({ request }: { request: any }) {
  const cancel = useCancelFriendRequest();

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 20, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
    }}>
      <TouchableOpacity onPress={() => navigate('PublicProfile', { userId: request.requesterId })}>
        <Avatar uri={request.avatar_url} name={request.display_name} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
          {request.display_name || 'GameVoices User'}
        </Text>
        <Text style={{ color: '#555', fontSize: 12, marginTop: 2 }}>Request sent</Text>
      </View>
      <TouchableOpacity
        onPress={() => cancel.mutate(request.requesterId)}
        disabled={cancel.isPending}
        style={{
          backgroundColor: '#1e1e1e', borderRadius: 18,
          paddingVertical: 8, paddingHorizontal: 14,
          borderWidth: 1, borderColor: '#333',
        }}>
        <Text style={{ color: '#888', fontSize: 13, fontWeight: '600' }}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Friend row ──────────────────────────────────────────────────────────────

function FriendRow({ friend }: { friend: any }) {
  const { data: teams = [] } = useTeamsBySlug(friend.topic_slugs);

  return (
    <TouchableOpacity
      onPress={() => navigate('PublicProfile', { userId: friend.userId })}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 20, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
      }}>
      <Avatar uri={friend.avatar_url} name={friend.display_name} size={52} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
          {friend.display_name || 'GameVoices User'}
        </Text>
        {teams.length > 0 && (
          <View style={{ flexDirection: 'row', marginTop: 5 }}>
            {teams.slice(0, 5).map((team, i) => (
              <View key={team.slug} style={{
                width: 22, height: 22, borderRadius: 11,
                backgroundColor: '#fff',
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

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function FriendsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // When rendered as a tab, no userId param — use current user
  // When pushed as stack screen (viewing someone else's friends), userId is passed
  const viewingUserId = route.params?.userId;
  const isTab = !viewingUserId;
  const listUserId = viewingUserId || user?.id;

  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data: friends = [], isLoading: friendsLoading } = useFriends(listUserId);
  const { data: incomingRequests = [], isLoading: incomingLoading } = usePendingFriendRequests();
  const { data: outgoingRequests = [] } = useOutgoingFriendRequests();
  const { data: searchResults = [], isLoading: searchLoading } = useSearchProfiles(search);

  const isSearching = search.trim().length >= 2;

  const filteredFriends = friends.filter((f) =>
    !search || (f.display_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['friends', listUserId] }),
      queryClient.invalidateQueries({ queryKey: ['friend-requests-pending'] }),
      queryClient.invalidateQueries({ queryKey: ['friend-requests-outgoing'] }),
    ]);
    setRefreshing(false);
  }, [listUserId, queryClient]);

  const isLoading = friendsLoading || incomingLoading;

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Nav bar */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingTop: 56, paddingHorizontal: 16, paddingBottom: 8,
      }}>
        {isTab ? (
          <View style={{ width: 26 }} />
        ) : (
          <TouchableOpacity onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color="#fff" />
          </TouchableOpacity>
        )}
        <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' }}>
          Friends
        </Text>
        <View style={{ width: 26 }} />
      </View>

      {/* Search bar — always visible on tab */}
      {isTab && (
        <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 8 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 10,
            backgroundColor: '#1a1a1a', borderRadius: 12,
            paddingHorizontal: 14, paddingVertical: 10,
          }}>
            <Ionicons name="search" size={16} color="#555" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or username..."
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoCorrect={false}
              style={{ flex: 1, color: '#fff', fontSize: 14 }}
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch('')}>
                <Ionicons name="close-circle" size={18} color="#555" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />
          }
        >
          {/* ── Search Results ── */}
          {isSearching && (
            <>
              <SectionLabel label="Search Results" />
              {searchLoading ? (
                <ActivityIndicator color="#fff" style={{ marginVertical: 20 }} />
              ) : searchResults.length === 0 ? (
                <Text style={{ color: '#444', fontSize: 14, paddingHorizontal: 20, paddingBottom: 16 }}>
                  No users found
                </Text>
              ) : (
                searchResults.map((result) => (
                  <SearchResultRow key={result.user_id} result={result} />
                ))
              )}
            </>
          )}

          {/* ── Incoming Requests ── */}
          {!isSearching && isTab && incomingRequests.length > 0 && (
            <>
              <SectionLabel label="Friend Requests" count={incomingRequests.length} />
              {incomingRequests.map((req) => (
                <IncomingCard key={req.friendshipId} request={req} />
              ))}
            </>
          )}

          {/* ── Outgoing Requests ── */}
          {!isSearching && isTab && outgoingRequests.length > 0 && (
            <>
              <SectionLabel label="Sent Requests" count={outgoingRequests.length} />
              {outgoingRequests.map((req) => (
                <OutgoingCard key={req.friendshipId} request={req} />
              ))}
            </>
          )}

          {/* ── Friends List ── */}
          {!isSearching && (
            <>
              <SectionLabel label="Friends" count={friends.length} />
              {filteredFriends.length === 0 ? (
                <View style={{ alignItems: 'center', paddingTop: 40, gap: 8 }}>
                  <Ionicons name="people-outline" size={40} color="#333" />
                  <Text style={{ color: '#555', fontSize: 15 }}>No friends yet</Text>
                  <Text style={{ color: '#444', fontSize: 13, textAlign: 'center',
                    paddingHorizontal: 40, marginTop: 4 }}>
                    Search for people above to add them as friends
                  </Text>
                </View>
              ) : (
                filteredFriends.map((friend) => (
                  <FriendRow key={friend.userId} friend={friend} />
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
