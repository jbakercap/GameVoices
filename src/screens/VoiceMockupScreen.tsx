import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

// ─── Fake data ────────────────────────────────────────────────────────────────

const COMMENTS = [
  {
    id: '1',
    show_title: 'First To The Floor',
    episode_title: 'Just like that, the season is over | Reactions to a painful Game 7',
    duration: '1h 29m',
    artwork_url: 'https://picsum.photos/seed/celtics/80/80',
    content: 'The Celtics blow',
    like_count: 0,
    reply_count: 1,
    created_at: new Date(Date.now() - 1000 * 60 * 3).toISOString(),
  },
  {
    id: '2',
    show_title: 'The Pesky Report',
    episode_title: 'Red Sox bullpen breakdown: 3 moves to make before the deadline',
    duration: '48m',
    artwork_url: 'https://picsum.photos/seed/redsox/80/80',
    content: 'Test',
    like_count: 0,
    reply_count: 0,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
  },
  {
    id: '3',
    show_title: 'The Pesky Report',
    episode_title: 'Red Sox bullpen breakdown: 3 moves to make before the deadline',
    duration: '48m',
    artwork_url: 'https://picsum.photos/seed/redsox/80/80',
    content: 'Hello world',
    like_count: 1,
    reply_count: 0,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
  },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

// ─── Episode card (mini player style) ────────────────────────────────────────

function EpisodeCard({ artwork, title, duration }: {
  artwork: string; title: string; duration: string;
}) {
  return (
    <TouchableOpacity activeOpacity={0.85} style={{
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: '#1a1a1a', borderRadius: 12,
      padding: 10, borderWidth: 1, borderColor: '#2a2a2a',
    }}>
      <View style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
        <Image source={{ uri: artwork }} style={{ width: 48, height: 48 }} contentFit="cover" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600', lineHeight: 16 }}
          numberOfLines={2}>{title}</Text>
        <Text style={{ color: '#555', fontSize: 11, marginTop: 3 }}>{duration}</Text>
      </View>
      <View style={{ width: 32, height: 32, borderRadius: 16,
        backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Ionicons name="play" size={14} color="#000" style={{ marginLeft: 2 }} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Single voice comment card ────────────────────────────────────────────────

function VoiceComment({ comment }: { comment: typeof COMMENTS[0] }) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>

      {/* Show name */}
      <Text style={{ color: '#555', fontSize: 11, fontWeight: '600',
        textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
        {comment.show_title}
      </Text>

      {/* Episode card */}
      <EpisodeCard
        artwork={comment.artwork_url}
        title={comment.episode_title}
        duration={comment.duration}
      />

      {/* Thread connector + comment */}
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        {/* Vertical line */}
        <View style={{ width: 20, alignItems: 'center', paddingTop: 4, paddingBottom: 4 }}>
          <View style={{ width: 2, flex: 1, backgroundColor: '#2a2a2a', borderRadius: 1 }} />
        </View>

        {/* Comment content */}
        <View style={{ flex: 1, paddingLeft: 10, paddingTop: 10, paddingBottom: 10 }}>
          <Text style={{ color: '#555', fontSize: 11, marginBottom: 6 }}>
            Jack Baker · {timeAgo(comment.created_at)}
          </Text>
          <Text style={{ color: '#fff', fontSize: 14, lineHeight: 20 }}>
            {comment.content}
          </Text>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 18, marginTop: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="heart-outline" size={15} color="#555" />
              <Text style={{ color: '#555', fontSize: 12 }}>{comment.like_count}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="chatbubble-outline" size={15} color="#555" />
              <Text style={{ color: '#555', fontSize: 12 }}>{comment.reply_count}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Separator */}
      <View style={{ height: 1, backgroundColor: '#1a1a1a', marginTop: 4 }} />
    </View>
  );
}

// ─── Mockup screen ────────────────────────────────────────────────────────────

export default function VoiceMockupScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      <View style={{ paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16 }}>
        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>
          My Voice — Mockup
        </Text>
        <Text style={{ color: '#555', fontSize: 13, marginTop: 4 }}>
          This is a preview. Nothing here is real data.
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: '#1a1a1a' }} />

      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Section header */}
        <View style={{ flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 }}>
          <Ionicons name="mic-outline" size={16} color="#fff" style={{ marginRight: 7 }} />
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 }}>My Voice</Text>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>See all</Text>
            <Ionicons name="chevron-forward" size={13} color="#fff" />
          </TouchableOpacity>
        </View>

        {COMMENTS.map(c => <VoiceComment key={c.id} comment={c} />)}
      </ScrollView>
    </View>
  );
}
