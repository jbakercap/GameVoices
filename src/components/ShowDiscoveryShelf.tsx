import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Image } from 'expo-image';

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
    <View style={{ marginBottom: 24 }}>
      <Text style={{
        color: accentColor || '#fff',
        fontSize: 20, fontWeight: 'bold',
        paddingHorizontal: 16, marginBottom: 12,
      }}>
        {title}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {displayShows.map((show) => (
          <TouchableOpacity
            key={show.id}
            onPress={() => onNavigate?.('ShowDetail', { showId: show.id })}
            style={{ width: 96 }}
          >
            <View style={{
              width: 96, height: 96, borderRadius: 10,
              backgroundColor: '#2A2A2A', overflow: 'hidden', marginBottom: 6,
            }}>
              {show.artwork_url ? (
                <Image
                  source={{ uri: show.artwork_url }}
                  style={{ width: 96, height: 96 }}
                  contentFit="cover"
                />
              ) : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#888', fontSize: 14, fontWeight: 'bold' }}>
                    {show.title.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ color: '#888', fontSize: 11, lineHeight: 15 }} numberOfLines={2}>
              {show.title}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}