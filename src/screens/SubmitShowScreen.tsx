import React, { useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { usePodcastSubmission, useMySubmissions } from '../hooks/mutations/usePodcastSubmission';
import { useAuth } from '../contexts/AuthContext';

const STATUS_COLOR: Record<string, string> = {
  pending: '#FF9800',
  approved: '#4CAF50',
  rejected: '#FFFFFF',
  in_review: '#2196F3',
};

export default function SubmitShowScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [rssUrl, setRssUrl] = useState('');
  const [title, setTitle] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const submission = usePodcastSubmission();
  const { data: mySubmissions = [], isLoading: submissionsLoading } = useMySubmissions();

  const handleSubmit = async () => {
    if (!rssUrl.trim() && !title.trim()) {
      Alert.alert('Error', 'Please enter an RSS URL or show title');
      return;
    }
    try {
      await submission.mutateAsync({
        rss_url: rssUrl.trim(),
        title: title.trim() || rssUrl.trim(),
        description: null,
        artwork_url: null,
        publisher: null,
        episode_count: 0,
      });
      setSubmitted(true);
      setRssUrl('');
      setTitle('');
      Alert.alert('Submitted!', 'Thank you! We\'ll review your submission and add it to GameVoices.');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to submit. Please try again.');
    }
  };

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ color: '#888', textAlign: 'center', fontSize: 15 }}>Sign in to submit a podcast</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#121212' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ paddingTop: 60, paddingHorizontal: 16, paddingBottom: 8 }}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ color: '#888', fontSize: 16 }}>← Back</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold', marginBottom: 6 }}>Submit a Show</Text>
        <Text style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
          Know a sports podcast that should be on GameVoices? Submit it below.
        </Text>

        {/* RSS URL */}
        <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>RSS Feed URL</Text>
        <TextInput
          value={rssUrl}
          onChangeText={setRssUrl}
          placeholder="https://feeds.example.com/podcast.rss"
          placeholderTextColor="#444"
          autoCapitalize="none"
          keyboardType="url"
          style={{ backgroundColor: '#1A1A1A', color: '#fff', fontSize: 15, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#333', marginBottom: 16 }}
        />

        {/* Show title */}
        <Text style={{ color: '#888', fontSize: 13, marginBottom: 6 }}>Show Name (if no RSS)</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Show name (optional if RSS provided)"
          placeholderTextColor="#444"
          style={{ backgroundColor: '#1A1A1A', color: '#fff', fontSize: 15, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#333', marginBottom: 24 }}
        />

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submission.isPending || (!rssUrl.trim() && !title.trim())}
          style={{ backgroundColor: submission.isPending || (!rssUrl.trim() && !title.trim()) ? '#444' : '#FFFFFF', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 32 }}>
          {submission.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#000', fontSize: 16, fontWeight: 'bold' }}>Submit Show</Text>
          }
        </TouchableOpacity>

        {/* My submissions */}
        {mySubmissions.length > 0 && (
          <View>
            <Text style={{ color: '#888', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
              My Submissions
            </Text>
            {mySubmissions.map((sub: any) => (
              <View key={sub.id} style={{ backgroundColor: '#1A1A1A', borderRadius: 10, padding: 14, marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', flex: 1 }} numberOfLines={1}>{sub.title}</Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: (STATUS_COLOR[sub.status] || '#888') + '22' }}>
                    <Text style={{ color: STATUS_COLOR[sub.status] || '#888', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' }}>{sub.status}</Text>
                  </View>
                </View>
                {sub.rss_url && <Text style={{ color: '#666', fontSize: 12 }} numberOfLines={1}>{sub.rss_url}</Text>}
                {sub.admin_notes && <Text style={{ color: '#888', fontSize: 12, marginTop: 6 }}>Note: {sub.admin_notes}</Text>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
