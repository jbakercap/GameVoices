import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  ActivityIndicator, Modal, KeyboardAvoidingView, Platform,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useStartClaim, useMyClaims } from '../hooks/mutations/usePodcastClaim';
import { GameVoicesLogo } from '../components/GameVoicesLogo';

// ─── Debounce ─────────────────────────────────────────────────────────────────

function useDebounce(value: string, delay: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Show {
  id: string;
  title: string;
  publisher: string | null;
  artwork_url: string | null;
  episode_count: number | null;
  claim_status: string | null;
  claimed_by_user_id: string | null;
}

type ClaimStatus = 'none' | 'pending' | 'approved' | 'rejected';

// ─── Shows hook ───────────────────────────────────────────────────────────────

function useShowsSearch(query: string) {
  return useQuery({
    queryKey: ['shows-claim-search', query],
    queryFn: async (): Promise<Show[]> => {
      const { data, error } = await supabase
        .from('shows')
        .select('id, title, publisher, artwork_url, episode_count, claim_status, claimed_by_user_id')
        .ilike('title', `%${query.trim()}%`)
        .order('title', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data as Show[]) || [];
    },
    enabled: query.trim().length > 0,
    staleTime: 60 * 1000,
  });
}

// ─── Claim Sheet ──────────────────────────────────────────────────────────────

interface ClaimSheetProps {
  show: Show | null;
  onClose: () => void;
  onSuccess: () => void;
}

function ClaimSheet({ show, onClose, onSuccess }: ClaimSheetProps) {
  const [email, setEmail] = useState('');
  const startClaim = useStartClaim();

  const handleSubmit = async () => {
    if (!email.trim() || !show) return;
    try {
      await startClaim.mutateAsync({
        show_id: show.id,
        verification_method: 'email',
        manual_explanation: email.trim(),
      });
      onSuccess();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit claim. Please try again.');
    }
  };

  if (!show) return null;

  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <TouchableOpacity
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          activeOpacity={1} onPress={onClose}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ backgroundColor: '#1A1A1A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 }}>
            {/* Handle */}
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#444', alignSelf: 'center', marginBottom: 24 }} />

            {/* Show preview */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24, backgroundColor: '#282828', borderRadius: 12, padding: 12 }}>
              <View style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', backgroundColor: '#333' }}>
                {show.artwork_url ? (
                  <Image source={{ uri: show.artwork_url }} style={{ width: 52, height: 52 }} contentFit="cover" />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="mic" size={20} color="#555" />
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{show.title}</Text>
                {show.publisher && <Text style={{ color: '#666', fontSize: 13, marginTop: 2 }} numberOfLines={1}>{show.publisher}</Text>}
              </View>
            </View>

            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 6 }}>Claim this podcast</Text>
            <Text style={{ color: '#666', fontSize: 14, lineHeight: 20, marginBottom: 24 }}>
              Enter the email address associated with your podcast. Our team will review your claim and send a confirmation to that email.
            </Text>

            <Text style={{ color: '#888', fontSize: 13, marginBottom: 8 }}>Contact email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor="#444"
              autoCapitalize="none"
              keyboardType="email-address"
              style={{
                backgroundColor: '#282828', color: '#fff', fontSize: 15,
                borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#333', marginBottom: 24,
              }}
            />

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!email.trim() || startClaim.isPending}
              style={{
                backgroundColor: !email.trim() || startClaim.isPending ? '#333' : '#fff',
                borderRadius: 12, padding: 16, alignItems: 'center',
              }}
            >
              {startClaim.isPending
                ? <ActivityIndicator color="#000" />
                : <Text style={{ color: '#000', fontSize: 16, fontWeight: '700' }}>Submit Claim</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Success Sheet ────────────────────────────────────────────────────────────

function SuccessSheet({ show, onClose }: { show: Show | null; onClose: () => void }) {
  if (!show) return null;
  return (
    <Modal visible animationType="slide" transparent presentationStyle="overFullScreen" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#1A1A1A', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44, alignItems: 'center' }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#1E3A2A', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Ionicons name="checkmark" size={32} color="#4CAF50" />
          </View>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>Claim Submitted!</Text>
          <Text style={{ color: '#666', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
            We've received your claim for {show.title}. Our team will review it and send a confirmation email within 1–2 business days.
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={{ backgroundColor: '#fff', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 }}
          >
            <Text style={{ color: '#000', fontSize: 16, fontWeight: '700' }}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Show Row ─────────────────────────────────────────────────────────────────

interface ShowRowProps {
  show: Show;
  myClaimStatus: ClaimStatus;
  isMyShow: boolean;
  onClaim: () => void;
}

function ShowRow({ show, myClaimStatus, isMyShow, onClaim }: ShowRowProps) {
  const claimButton = () => {
    // Already approved and owned by this user
    if (isMyShow && show.claim_status === 'approved') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1E3A2A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Ionicons name="checkmark-circle" size={13} color="#4CAF50" />
          <Text style={{ color: '#4CAF50', fontSize: 12, fontWeight: '700' }}>Claimed</Text>
        </View>
      );
    }
    // Claimed by someone else
    if (show.claim_status === 'approved' && !isMyShow) {
      return (
        <View style={{ backgroundColor: '#222', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ color: '#555', fontSize: 12, fontWeight: '600' }}>Claimed</Text>
        </View>
      );
    }
    // User has a pending claim
    if (myClaimStatus === 'pending') {
      return (
        <View style={{ backgroundColor: '#2A2410', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ color: '#FF9800', fontSize: 12, fontWeight: '700' }}>Pending</Text>
        </View>
      );
    }
    // Available to claim
    return (
      <TouchableOpacity
        onPress={onClaim}
        style={{ backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
      >
        <Text style={{ color: '#000', fontSize: 12, fontWeight: '700' }}>Claim</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: '#1A1A1A',
    }}>
      {/* Artwork */}
      <View style={{ width: 46, height: 46, borderRadius: 8, overflow: 'hidden', backgroundColor: '#2A2A2A', flexShrink: 0 }}>
        {show.artwork_url ? (
          <Image source={{ uri: show.artwork_url }} style={{ width: 46, height: 46 }} contentFit="cover" />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="mic" size={18} color="#555" />
          </View>
        )}
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{show.title}</Text>
        <Text style={{ color: '#555', fontSize: 12, marginTop: 2 }} numberOfLines={1}>
          {[show.publisher, show.episode_count != null ? `${show.episode_count} eps` : null].filter(Boolean).join(' · ')}
        </Text>
      </View>

      {/* CTA */}
      {claimButton()}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PodcastClaimScreen() {
  const { user } = useAuth();
  const route = useRoute<any>();
  const preselectedShowId: string | undefined = route.params?.preselectedShowId;

  const [search, setSearch] = useState('');
  const [claimingShow, setClaimingShow] = useState<Show | null>(null);
  const [successShow, setSuccessShow] = useState<Show | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const { data: preselectedShow } = useQuery({
    queryKey: ['show-preselect', preselectedShowId],
    queryFn: async (): Promise<Show | null> => {
      const { data } = await supabase
        .from('shows')
        .select('id, title, publisher, artwork_url, episode_count, claim_status, claimed_by_user_id')
        .eq('id', preselectedShowId!)
        .maybeSingle();
      return (data as Show) ?? null;
    },
    enabled: !!preselectedShowId,
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (preselectedShow && !claimingShow) {
      setClaimingShow(preselectedShow);
    }
  }, [preselectedShow]);

  const { data: shows = [], isLoading } = useShowsSearch(debouncedSearch);
  const { data: myClaims = [] } = useMyClaims();

  const myClaimsMap = useMemo(() => {
    const map = new Map<string, ClaimStatus>();
    for (const claim of myClaims as any[]) {
      map.set(claim.show_id, claim.status as ClaimStatus);
    }
    return map;
  }, [myClaims]);

  const handleClaimSuccess = useCallback(() => {
    setSuccessShow(claimingShow);
    setClaimingShow(null);
  }, [claimingShow]);

  const renderShow = useCallback(({ item }: { item: Show }) => (
    <ShowRow
      show={item}
      myClaimStatus={myClaimsMap.get(item.id) ?? 'none'}
      isMyShow={!!user && item.claimed_by_user_id === user.id}
      onClaim={() => setClaimingShow(item)}
    />
  ), [myClaimsMap, user]);

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {/* Header */}
      <View style={{ paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <GameVoicesLogo size={32} />
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800' }}>Creator Hub</Text>
        </View>
        <Text style={{ color: '#666', fontSize: 14, lineHeight: 20 }}>
          Are you a podcast creator? Search for your show and claim it today to unlock analytics, a verified badge, and more.
        </Text>
      </View>

      {/* Search */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E1E1E', borderRadius: 10, paddingHorizontal: 12, gap: 8 }}>
          <Ionicons name="search" size={16} color="#555" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search podcasts..."
            placeholderTextColor="#444"
            style={{ flex: 1, color: '#fff', fontSize: 15, paddingVertical: 12 }}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#555" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Column headers — only shown when there are results */}
      {debouncedSearch.trim().length > 0 && shows.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' }}>
          <Text style={{ color: '#444', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, flex: 1 }}>
            Podcast · {isLoading ? '…' : `${shows.length} results`}
          </Text>
          <Text style={{ color: '#444', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 }}>Status</Text>
        </View>
      )}

      {/* List */}
      {!debouncedSearch.trim() ? (
        <View style={{ alignItems: 'center', paddingVertical: 80, paddingHorizontal: 40 }}>
          <Ionicons name="search-outline" size={40} color="#333" style={{ marginBottom: 16 }} />
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
            Search for your podcast
          </Text>
          <Text style={{ color: '#555', fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
            Type the name of your show above to find and claim it.
          </Text>
        </View>
      ) : isLoading ? (
        <ActivityIndicator color="#fff" style={{ marginTop: 60 }} />
      ) : shows.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 80, paddingHorizontal: 32 }}>
          <Ionicons name="mic-off-outline" size={40} color="#333" style={{ marginBottom: 12 }} />
          <Text style={{ color: '#555', fontSize: 15, textAlign: 'center' }}>
            No podcasts found for "{debouncedSearch}"
          </Text>
        </View>
      ) : (
        <FlatList
          data={shows}
          keyExtractor={(item) => item.id}
          renderItem={renderShow}
          contentContainerStyle={{ paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}

      {/* Claim sheet */}
      {claimingShow && (
        <ClaimSheet
          show={claimingShow}
          onClose={() => setClaimingShow(null)}
          onSuccess={handleClaimSuccess}
        />
      )}

      {/* Success sheet */}
      {successShow && (
        <SuccessSheet
          show={successShow}
          onClose={() => setSuccessShow(null)}
        />
      )}
    </View>
  );
}
