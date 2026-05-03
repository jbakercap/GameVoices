import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

interface DiscoveryShow {
  id: string;
  title: string;
  artwork_url: string | null;
}

interface Props {
  title: string;
  shows: DiscoveryShow[];
  accentColor?: string | null;
  onNavigate?: (screen: string, params: any) => void;
  maxItems?: number;
}

export function ShowDiscoveryShelf({ title, shows, accentColor, onNavigate, maxItems = 10 }: Props) {
  const displayShows = shows.slice(0, maxItems);
  if (displayShows.length === 0) return null;

  return (
    <View style={{ marginBottom: 28 }}>
      {/* Section header with › arrow */}
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
          paddingHorizontal: 16, marginBottom: 14 }}
      >
        <Text style={{
          color: accentColor || '#fff',
          fontSize: 22, fontWeight: 'bold',
        }}>
          {title}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={accentColor || '#fff'}
          style={{ marginTop: 2 }}
        />
      </TouchableOpacity>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 14 }}
      >
        {displayShows.map((show) => (
          <TouchableOpacity
            key={show.id}
            onPress={() => onNavigate?.('ShowDetail', { showId: show.id })}
            style={{ width: 110 }}
          >
            <View style={{
              width: 110, height: 110, borderRadius: 12,
              backgroundColor: '#2A2A2A', overflow: 'hidden', marginBottom: 7,
            }}>
              {show.artwork_url ? (
                <Image
                  source={{ uri: show.artwork_url }}
                  style={{ width: 110, height: 110 }}
                  contentFit="cover"
                  accessible={false}
                  pointerEvents="none"
                />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#888', fontSize: 16, fontWeight: 'bold' }}>
                    {show.title.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ color: '#aaa', fontSize: 11, lineHeight: 15 }} numberOfLines={2}>
              {show.title}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
