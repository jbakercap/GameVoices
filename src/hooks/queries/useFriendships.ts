import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

export interface Friend {
  friendshipId: string;
  userId: string;
  display_name: string | null;
  avatar_url: string | null;
  topic_slugs: string[] | null;
  since: string;
}

export interface FriendRequest {
  friendshipId: string;
  requesterId: string;
  display_name: string | null;
  avatar_url: string | null;
  sentAt: string;
}

// ── Status of relationship between current user and a target user ─────────────

export function useFriendshipStatus(targetUserId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['friendship-status', user?.id, targetUserId],
    queryFn: async (): Promise<FriendshipStatus> => {
      if (!user || !targetUserId) return 'none';

      const { data, error } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, status')
        .or(
          `and(requester_id.eq.${user.id},addressee_id.eq.${targetUserId}),` +
          `and(requester_id.eq.${targetUserId},addressee_id.eq.${user.id})`
        )
        .maybeSingle();

      if (error) throw error;
      if (!data) return 'none';
      if (data.status === 'accepted') return 'friends';
      if (data.status === 'pending') {
        return data.requester_id === user.id ? 'pending_sent' : 'pending_received';
      }
      return 'none';
    },
    enabled: !!user && !!targetUserId,
    staleTime: 30 * 1000,
  });
}

// ── Accepted friends list for any user ───────────────────────────────────────

export function useFriends(userId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['friends', userId],
    queryFn: async (): Promise<Friend[]> => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('friendships')
        .select('id, requester_id, addressee_id, created_at')
        .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
        .eq('status', 'accepted');

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // The "friend" is whichever side isn't the profile owner
      const friendIds = data.map((row) =>
        row.requester_id === userId ? row.addressee_id : row.requester_id
      );

      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, topic_slugs')
        .in('user_id', friendIds);

      if (profileError) throw profileError;

      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

      return data.map((row) => {
        const friendId = row.requester_id === userId ? row.addressee_id : row.requester_id;
        const profile = profileMap.get(friendId);
        return {
          friendshipId: row.id,
          userId: friendId,
          display_name: profile?.display_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
          topic_slugs: profile?.topic_slugs ?? null,
          since: row.created_at,
        };
      });
    },
    enabled: !!userId,
    staleTime: 60 * 1000,
  });
}

// ── Incoming pending requests for the current user ────────────────────────────

export function usePendingFriendRequests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['friend-requests-pending', user?.id],
    queryFn: async (): Promise<FriendRequest[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('friendships')
        .select('id, requester_id, created_at')
        .eq('addressee_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      const requesterIds = data.map((r) => r.requester_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', requesterIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));

      return data.map((row) => {
        const profile = profileMap.get(row.requester_id);
        return {
          friendshipId: row.id,
          requesterId: row.requester_id,
          display_name: profile?.display_name ?? null,
          avatar_url: profile?.avatar_url ?? null,
          sentAt: row.created_at,
        };
      });
    },
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// ── Unread friend request count (for badge) ───────────────────────────────────

export function usePendingFriendRequestCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['friend-requests-count', user?.id],
    queryFn: async (): Promise<number> => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from('friendships')
        .select('*', { count: 'exact', head: true })
        .eq('addressee_id', user.id)
        .eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}
