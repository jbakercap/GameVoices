import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, Alert, Modal, FlatList,
} from 'react-native';
import { Image } from 'expo-image';
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

// ─── Section components ───────────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return (
    <Text style={{ color: '#888', fontSize: 12, fontWeight: '600',
      textTransform: 'uppercase', letterSpacing: 0.8,
      paddingHorizontal: 16, marginBottom: 8, marginTop: 4 }}>
      {title}
    </Text>
  );
}

function SettingsRow({ label, value, onPress, danger }: {
  label: string; value?: string; onPress?: () => void; danger?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: '#222' }}
    >
      <Text style={{ color: danger ? '#E53935' : '#fff', fontSize: 15 }}>{label}</Text>
      {value && <Text style={{ color: '#888', fontSize: 14 }}>{value}</Text>}
      {onPress && !value && <Text style={{ color: '#555', fontSize: 18 }}>›</Text>}
    </TouchableOpacity>
  );
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
        {/* Header */}
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

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const { data: profile, isLoading } = useProfile();
  const queryClient = useQueryClient();
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [userTeams, setUserTeams] = useState<string[]>([]);

  useEffect(() => {
    if (profile?.topic_slugs) setUserTeams(profile.topic_slugs);
  }, [profile]);

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => { await signOut(); },
      },
    ]);
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

  const handleProfileSaved = () => {
    queryClient.invalidateQueries({ queryKey: ['profile'] });
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#E53935" />
      </View>
    );
  }

  const displayName = profile?.display_name || user?.email || 'Guest';
  const avatarUrl = profile?.avatar_url;
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Header */}
        <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 20 }}>
          <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>Profile</Text>
        </View>

        {/* Avatar + user info */}
        <View style={{ alignItems: 'center', paddingHorizontal: 16, marginBottom: 24 }}>
          <View style={{ width: 88, height: 88, borderRadius: 44, overflow: 'hidden',
            backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center',
            marginBottom: 12, borderWidth: 3, borderColor: '#E53935' }}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={{ width: 88, height: 88 }} contentFit="cover" />
            ) : (
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>{initials}</Text>
            )}
          </View>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 4 }}>
            {displayName}
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

        {/* Account actions */}
        <View style={{ backgroundColor: '#1A1A1A', borderRadius: 14,
          marginHorizontal: 16, marginBottom: 24, overflow: 'hidden' }}>
          <SettingsRow label="✏️  Edit Profile" onPress={() => setEditProfileOpen(true)} />
          <SettingsRow label="❤️  Favorite Teams" onPress={() => setTeamPickerOpen(true)}
            value={userTeams.length > 0 ? `${userTeams.length} teams` : 'None'} />
        </View>

        {/* Playback settings */}
        <SectionLabel title="Playback" />
        <View style={{ backgroundColor: '#1A1A1A', borderRadius: 14,
          marginHorizontal: 16, marginBottom: 24, overflow: 'hidden' }}>
          <SettingsRow label="Default Speed" value="1.0×" />
          <SettingsRow label="Skip Forward" value="30 sec" />
          <SettingsRow label="Skip Back" value="15 sec" />
        </View>

        {/* Storage */}
        <SectionLabel title="Storage" />
        <View style={{ backgroundColor: '#1A1A1A', borderRadius: 14,
          marginHorizontal: 16, marginBottom: 24, overflow: 'hidden' }}>
          <SettingsRow label="💾  Offline Storage" value="0 MB" />
        </View>

        {/* Sign out */}
        <View style={{ backgroundColor: '#1A1A1A', borderRadius: 14,
          marginHorizontal: 16, marginBottom: 24, overflow: 'hidden' }}>
          <SettingsRow label="Sign Out" onPress={handleSignOut} danger />
        </View>

        {/* App info */}
        <View style={{ alignItems: 'center', paddingBottom: 16 }}>
          <Text style={{ color: '#444', fontSize: 12 }}>GameVoices v0.1</Text>
          <Text style={{ color: '#444', fontSize: 12, marginTop: 2 }}>Your Sports Podcast Hub</Text>
        </View>
      </ScrollView>

      {/* Modals */}
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
          onSaved={handleProfileSaved}
        />
      )}
    </View>
  );
}
