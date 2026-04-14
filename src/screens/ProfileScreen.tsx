import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, Modal, FlatList,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useProfile } from '../hooks/useProfile';
import { useQueryClient } from '@tanstack/react-query';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TeamOption {
  slug: string;
  short_name: string;
  logo_url: string | null;
  league_short_name: string;
}

interface League {
  id: string;
  name: string;
  short_name: string;
  slug: string;
}

// ─── Team Picker Modal ────────────────────────────────────────────────────────

function TeamPickerModal({ visible, onClose, selectedTeams, onSave }: {
  visible: boolean;
  onClose: () => void;
  selectedTeams: string[];
  onSave: (teams: string[]) => void;
}) {
  const [allTeams, setAllTeams] = useState<TeamOption[]>([]);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [selected, setSelected] = useState<string[]>(selectedTeams);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setSelected(selectedTeams);

    async function load() {
      const [teamsRes, leaguesRes] = await Promise.all([
        supabase.from('teams')
          .select('slug, short_name, logo_url, leagues!inner(short_name)')
          .eq('is_active', true)
          .order('display_order'),
        supabase.from('leagues')
          .select('id, name, short_name, slug')
          .neq('slug', 'general')
          .order('display_order'),
      ]);
      if (teamsRes.data) {
        setAllTeams(teamsRes.data.map((t: any) => ({
          slug: t.slug, short_name: t.short_name, logo_url: t.logo_url,
          league_short_name: t.leagues?.short_name || '',
        })));
      }
      if (leaguesRes.data) setLeagues(leaguesRes.data);
    }
    load();
  }, [visible]);

  const toggle = (slug: string) => {
    setSelected(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(selected);
    setSaving(false);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: '#121212' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 20, paddingHorizontal: 16, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: '#222' }}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: '#888', fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>Favorite Teams</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#E53935" size="small" />
            ) : (
              <Text style={{ color: '#E53935', fontSize: 16, fontWeight: '600' }}>
                Save ({selected.length})
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {leagues.map(league => {
            const leagueTeams = allTeams.filter(t => t.league_short_name === league.short_name);
            if (leagueTeams.length === 0) return null;
            return (
              <View key={league.id} style={{ paddingHorizontal: 16, marginTop: 20 }}>
                <Text style={{ color: '#888', fontSize: 12, fontWeight: '600',
                  textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
                  {league.short_name}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {leagueTeams.map(team => {
                    const isSelected = selected.includes(team.slug);
                    return (
                      <TouchableOpacity
                        key={team.slug}
                        onPress={() => toggle(team.slug)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                          borderWidth: 1.5,
                          borderColor: isSelected ? '#E53935' : '#333',
                          backgroundColor: isSelected ? '#E5393520' : '#1A1A1A',
                          width: '47%' }}
                      >
                        {team.logo_url && (
                          <View style={{ width: 28, height: 28, borderRadius: 14,
                            backgroundColor: '#fff', overflow: 'hidden',
                            alignItems: 'center', justifyContent: 'center' }}>
                            <Image source={{ uri: team.logo_url }}
                              style={{ width: 22, height: 22 }} contentFit="contain" />
                          </View>
                        )}
                        <Text style={{ color: isSelected ? '#fff' : '#aaa',
                          fontSize: 13, fontWeight: '500', flex: 1 }} numberOfLines={1}>
                          {team.short_name}
                        </Text>
                        {isSelected && <Text style={{ color: '#E53935', fontSize: 14 }}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Edit Profile Modal ───────────────────────────────────────────────────────

function EditProfileModal({ visible, onClose, profile, userId, onSaved }: {
  visible: boolean;
  onClose: () => void;
  profile: any;
  userId: string;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [twitter, setTwitter] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && profile) {
      setDisplayName(profile.display_name || '');
      setBio(profile.bio || '');
      setTwitter(profile.twitter_handle || '');
    }
  }, [visible, profile]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        twitter_handle: twitter.trim().replace(/^@/, '') || null,
      }).eq('user_id', userId);

      if (error) throw error;
      onSaved();
      onClose();
    } catch (e) {
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: '#121212' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 20, paddingHorizontal: 16, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: '#222' }}>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: '#888', fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>Edit Profile</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#E53935" size="small" />
            ) : (
              <Text style={{ color: '#E53935', fontSize: 16, fontWeight: '600' }}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          <View>
            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Display Name</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your name"
              placeholderTextColor="#555"
              style={{ backgroundColor: '#1A1A1A', color: '#fff', fontSize: 15,
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                borderWidth: 1, borderColor: '#333' }}
            />
          </View>
          <View>
            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Bio</Text>
            <TextInput
              value={bio}
              onChangeText={t => setBio(t.slice(0, 160))}
              placeholder="Short bio (160 chars)"
              placeholderTextColor="#555"
              multiline
              maxLength={160}
              style={{ backgroundColor: '#1A1A1A', color: '#fff', fontSize: 15,
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                borderWidth: 1, borderColor: '#333', minHeight: 80 }}
            />
            <Text style={{ color: '#555', fontSize: 11, textAlign: 'right', marginTop: 4 }}>
              {bio.length}/160
            </Text>
          </View>
          <View>
            <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Twitter / X Handle</Text>
            <TextInput
              value={twitter}
              onChangeText={setTwitter}
              placeholder="@username"
              placeholderTextColor="#555"
              autoCapitalize="none"
              style={{ backgroundColor: '#1A1A1A', color: '#fff', fontSize: 15,
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
                borderWidth: 1, borderColor: '#333' }}
            />
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Settings Sheet Modal ─────────────────────────────────────────────────────

function SettingsModal({ visible, onClose, profile, user, userTeams, onEditProfile, onEditTeams, onSignOut }: {
  visible: boolean;
  onClose: () => void;
  profile: any;
  user: any;
  userTeams: string[];
  onEditProfile: () => void;
  onEditTeams: () => void;
  onSignOut: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={{ flex: 1, backgroundColor: '#121212' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 20, paddingHorizontal: 16, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: '#222' }}>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>Settings</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#888" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
          {/* Avatar + user info */}
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, overflow: 'hidden',
              backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center',
              marginBottom: 12, borderWidth: 3, borderColor: '#E53935' }}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={{ width: 80, height: 80 }} contentFit="cover" />
              ) : (
                <Text style={{ color: '#fff', fontSize: 26, fontWeight: 'bold' }}>
                  {(profile?.display_name || user?.email || 'G').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                </Text>
              )}
            </View>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 2 }}>
              {profile?.display_name || user?.email || 'Guest'}
            </Text>
            {profile?.display_name && (
              <Text style={{ color: '#888', fontSize: 13 }}>{user?.email}</Text>
            )}
            {profile?.bio && (
              <Text style={{ color: '#aaa', fontSize: 13, textAlign: 'center',
                marginTop: 6, paddingHorizontal: 32 }}>
                {profile.bio}
              </Text>
            )}
          </View>

          {/* Account */}
          <Text style={{ color: '#888', fontSize: 12, fontWeight: '600',
            textTransform: 'uppercase', letterSpacing: 0.8,
            paddingHorizontal: 16, marginBottom: 8 }}>Account</Text>
          <View style={{ backgroundColor: '#1A1A1A', borderRadius: 14,
            marginHorizontal: 16, marginBottom: 24, overflow: 'hidden' }}>
            <TouchableOpacity onPress={() => { onClose(); setTimeout(onEditProfile, 300); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 16, paddingVertical: 14,
                borderBottomWidth: 1, borderBottomColor: '#222' }}>
              <Text style={{ color: '#fff', fontSize: 15 }}>Edit Profile</Text>
              <Ionicons name="chevron-forward" size={16} color="#555" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { onClose(); setTimeout(onEditTeams, 300); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ color: '#fff', fontSize: 15 }}>Favorite Teams</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: '#888', fontSize: 14 }}>
                  {userTeams.length > 0 ? `${userTeams.length} teams` : 'None'}
                </Text>
                <Ionicons name="chevron-forward" size={16} color="#555" />
              </View>
            </TouchableOpacity>
          </View>

          {/* Playback */}
          <Text style={{ color: '#888', fontSize: 12, fontWeight: '600',
            textTransform: 'uppercase', letterSpacing: 0.8,
            paddingHorizontal: 16, marginBottom: 8 }}>Playback</Text>
          <View style={{ backgroundColor: '#1A1A1A', borderRadius: 14,
            marginHorizontal: 16, marginBottom: 24, overflow: 'hidden' }}>
            {[
              { label: 'Default Speed', value: '1.0×' },
              { label: 'Skip Forward', value: '30 sec' },
              { label: 'Skip Back', value: '15 sec' },
            ].map((item, i, arr) => (
              <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center',
                justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
                borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: '#222' }}>
                <Text style={{ color: '#fff', fontSize: 15 }}>{item.label}</Text>
                <Text style={{ color: '#888', fontSize: 14 }}>{item.value}</Text>
              </View>
            ))}
          </View>

          {/* Sign out */}
          <View style={{ backgroundColor: '#1A1A1A', borderRadius: 14,
            marginHorizontal: 16, marginBottom: 24, overflow: 'hidden' }}>
            <TouchableOpacity onPress={onSignOut}
              style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ color: '#E53935', fontSize: 15 }}>Sign Out</Text>
            </TouchableOpacity>
          </View>

          <View style={{ alignItems: 'center', paddingBottom: 16 }}>
            <Text style={{ color: '#444', fontSize: 12 }}>GameVoices v0.1</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Locker Row ───────────────────────────────────────────────────────────────

function LockerRow({ icon, label, count, onPress }: {
  icon: string;
  label: string;
  count?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress}
      style={{ flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 16,
        borderRadius: 12, backgroundColor: '#1E1E1E', marginBottom: 8 }}>
      <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: '#2A0A0A',
        alignItems: 'center', justifyContent: 'center', marginRight: 14 }}>
        <Ionicons name={icon as any} size={18} color="#E53935" />
      </View>
      <Text style={{ color: '#fff', fontSize: 16, flex: 1 }}>{label}</Text>
      {count !== undefined && count > 0 && (
        <Text style={{ color: '#888', fontSize: 14, marginRight: 8 }}>{count}</Text>
      )}
      <Ionicons name="chevron-forward" size={16} color="#555" />
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { user, signOut } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const queryClient = useQueryClient();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [userTeams, setUserTeams] = useState<string[]>([]);

  useEffect(() => {
    if (profile?.topic_slugs) setUserTeams(profile.topic_slugs);
  }, [profile]);

  const handleSignOut = () => {
    setSettingsOpen(false);
    setTimeout(() => {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: async () => { await signOut(); } },
      ]);
    }, 300);
  };

  const handleSaveTeams = async (teams: string[]) => {
    if (!user) return;
    const { error } = await supabase.from('profiles')
      .update({ topic_slugs: teams }).eq('user_id', user.id);
    if (!error) {
      setUserTeams(teams);
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setTeamPickerOpen(false);
    } else {
      Alert.alert('Error', 'Failed to save teams');
    }
  };

  const goToLibrary = (initialTab: string) => {
    navigation.navigate('LibraryDetail', { initialTab });
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E53935" />
      </View>
    );
  }

  const displayName = profile?.display_name || user?.email || 'Guest';

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 60, paddingHorizontal: 16, paddingBottom: 20 }}>
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>My Locker</Text>
          <TouchableOpacity onPress={() => setSettingsOpen(true)}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#E53935',
              alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Locker items */}
        <View style={{ paddingHorizontal: 16 }}>
          <LockerRow icon="radio-outline" label="Shows" onPress={() => goToLibrary('shows')} />
          <LockerRow icon="people-outline" label="Followed Players" onPress={() => navigation.navigate('MyRoster')} />
          <LockerRow icon="bookmark-outline" label="Saved Episodes" onPress={() => goToLibrary('saved')} />
          <LockerRow icon="heart-outline" label="Saved Takes" onPress={() => goToLibrary('stories')} />
          <LockerRow icon="sparkles-outline" label="Saved Moments" onPress={() => goToLibrary('moments')} />
          <LockerRow icon="list-outline" label="Playlists" onPress={() => goToLibrary('playlists')} />
          <LockerRow icon="time-outline" label="History" onPress={() => goToLibrary('history')} />
          <LockerRow icon="musical-notes-outline" label="Up Next" onPress={() => goToLibrary('queue')} />
        </View>
      </ScrollView>

      {/* Settings modal */}
      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        profile={profile}
        user={user}
        userTeams={userTeams}
        onEditProfile={() => setEditProfileOpen(true)}
        onEditTeams={() => setTeamPickerOpen(true)}
        onSignOut={handleSignOut}
      />

      <TeamPickerModal
        visible={teamPickerOpen}
        onClose={() => setTeamPickerOpen(false)}
        selectedTeams={userTeams}
        onSave={handleSaveTeams}
      />
      {user && (
        <EditProfileModal
          visible={editProfileOpen}
          onClose={() => setEditProfileOpen(false)}
          profile={profile}
          userId={user.id}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['profile'] })}
        />
      )}
    </View>
  );
}
