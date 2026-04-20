import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  ActivityIndicator, Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { supabase } from '../lib/supabase';

interface TeamOption {
  slug: string;
  short_name: string;
  logo_url: string | null;
  primary_color: string | null;
  league_short_name: string;
}

interface League {
  id: string;
  name: string;
  short_name: string;
  slug: string;
}

export function TeamPickerModal({ visible, onClose, selectedTeams, onSave }: {
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
          .select('slug, short_name, logo_url, primary_color, leagues!inner(short_name)')
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
          primary_color: t.primary_color || null,
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
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '600' }}>
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
                    const accent = team.primary_color || '#FFFFFF';
                    return (
                      <TouchableOpacity
                        key={team.slug}
                        onPress={() => toggle(team.slug)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8,
                          paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
                          borderWidth: 1.5,
                          borderColor: isSelected ? accent : '#333',
                          backgroundColor: isSelected ? `${accent}1A` : '#1A1A1A',
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
                        {isSelected && <Text style={{ color: accent, fontSize: 14 }}>✓</Text>}
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
