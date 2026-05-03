import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

// ── Send a friend request ─────────────────────────────────────────────────────

export function useSendFriendRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (addresseeId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('friendships')
        .insert({ requester_id: user.id, addressee_id: addresseeId, status: 'pending' });
      if (error) throw error;

      // Notify the addressee (fire-and-forget)
      supabase.functions.invoke('send-notification', {
        body: {
          userId: addresseeId,
          actorId: user.id,
          type: 'friend_request',
        },
      }).catch(console.warn);
    },
    onSuccess: (_data, addresseeId) => {
      queryClient.invalidateQueries({ queryKey: ['friendship-status', user?.id, addresseeId] });
    },
  });
}

// ── Cancel an outgoing request ────────────────────────────────────────────────

export function useCancelFriendRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (addresseeId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('requester_id', user.id)
        .eq('addressee_id', addresseeId)
        .eq('status', 'pending');
      if (error) throw error;
    },
    onSuccess: (_data, addresseeId) => {
      queryClient.invalidateQueries({ queryKey: ['friendship-status', user?.id, addresseeId] });
    },
  });
}

// ── Accept a friend request ───────────────────────────────────────────────────

export function useAcceptFriendRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ friendshipId, requesterId }: { friendshipId: string; requesterId: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'accepted' })
        .eq('id', friendshipId)
        .eq('addressee_id', user.id);
      if (error) throw error;
    },
    onSuccess: (_data, { requesterId }) => {
      queryClient.invalidateQueries({ queryKey: ['friendship-status', user?.id, requesterId] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests-pending', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests-count', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['friends', user?.id] });
    },
  });
}

// ── Decline a friend request ──────────────────────────────────────────────────

export function useDeclineFriendRequest() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ friendshipId, requesterId }: { friendshipId: string; requesterId: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('friendships')
        .update({ status: 'declined' })
        .eq('id', friendshipId)
        .eq('addressee_id', user.id);
      if (error) throw error;
    },
    onSuccess: (_data, { requesterId }) => {
      queryClient.invalidateQueries({ queryKey: ['friendship-status', user?.id, requesterId] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests-pending', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['friend-requests-count', user?.id] });
    },
  });
}

// ── Remove an existing friend ─────────────────────────────────────────────────

export function useRemoveFriend() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ friendshipId, otherUserId }: { friendshipId: string; otherUserId: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('id', friendshipId);
      if (error) throw error;
    },
    onSuccess: (_data, { otherUserId }) => {
      queryClient.invalidateQueries({ queryKey: ['friendship-status', user?.id, otherUserId] });
      queryClient.invalidateQueries({ queryKey: ['friends', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['friends', otherUserId] });
    },
  });
}
