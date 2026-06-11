import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  KeyboardAvoidingView, Platform, SafeAreaView, StyleSheet,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { GameVoicesLogo } from '../components/GameVoicesLogo';

function generateSuggestion(name: string): string {
  // Like X: take the display name, strip non-alphanumeric, append random digits
  const base = name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const suffix = Math.floor(Math.random() * 9000 + 1000);
  return base ? `${base.slice(0, 11)}${suffix}` : '';
}

export default function ProfileSetupScreen({ onComplete }: { onComplete: () => void }) {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usernameInputRef = useRef<TextInput>(null);

  // Auto-suggest username when display name changes
  useEffect(() => {
    if (displayName.length >= 2 && !username) {
      setUsername(generateSuggestion(displayName));
    }
  }, [displayName]);

  const validateFormat = (value: string): boolean => {
    // Alphanumeric and underscores only, 3-15 chars (like X)
    return /^[a-zA-Z0-9_]{3,15}$/.test(value);
  };

  const checkAvailability = useCallback((value: string) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (!value) {
      setUsernameStatus('idle');
      return;
    }
    if (!validateFormat(value)) {
      setUsernameStatus('invalid');
      return;
    }

    setUsernameStatus('checking');
    debounceTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('username', value.toLowerCase())
        .maybeSingle();

      // If it's our own username (editing), it's available
      if (data && data.user_id === user?.id) {
        setUsernameStatus('available');
      } else {
        setUsernameStatus(data ? 'taken' : 'available');
      }
    }, 300);
  }, [user?.id]);

  const handleUsernameChange = (value: string) => {
    // Strip everything except alphanumeric + underscore as they type
    const cleaned = value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 15);
    setUsername(cleaned);
    checkAvailability(cleaned);
  };

  const handleSave = async () => {
    if (!user) return;
    if (!displayName.trim()) {
      setError('Display name is required');
      return;
    }
    if (usernameStatus !== 'available') {
      setError('Please choose an available username');
      return;
    }

    setSaving(true);
    setError('');
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        user_id: user.id,
        display_name: displayName.trim(),
        username: username.toLowerCase(),
      }, { onConflict: 'user_id' });

    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
    } else {
      onComplete();
    }
  };

  const canContinue = displayName.trim().length > 0 && usernameStatus === 'available';

  const statusColor =
    usernameStatus === 'available' ? '#22c55e' :
    usernameStatus === 'taken' ? '#ef4444' :
    usernameStatus === 'invalid' ? '#f59e0b' :
    '#666';

  const statusText =
    usernameStatus === 'checking' ? 'Checking...' :
    usernameStatus === 'available' ? 'Available' :
    usernameStatus === 'taken' ? 'Already taken' :
    usernameStatus === 'invalid' ? '3-15 characters, letters, numbers, underscores' :
    '';

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <GameVoicesLogo size={48} />
            <Text style={styles.title}>Set up your profile</Text>
            <Text style={styles.subtitle}>
              This is how other listeners will see you
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Display Name */}
            <View>
              <Text style={styles.label}>Display name</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Your name"
                placeholderTextColor="#555"
                autoCapitalize="words"
                autoFocus
                maxLength={50}
                returnKeyType="next"
                onSubmitEditing={() => usernameInputRef.current?.focus()}
                style={styles.input}
              />
            </View>

            {/* Username */}
            <View>
              <Text style={styles.label}>Username</Text>
              <View style={styles.usernameRow}>
                <Text style={styles.atSign}>@</Text>
                <TextInput
                  ref={usernameInputRef}
                  value={username}
                  onChangeText={handleUsernameChange}
                  placeholder="username"
                  placeholderTextColor="#555"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={15}
                  returnKeyType="done"
                  style={[styles.input, styles.usernameInput]}
                />
              </View>
              {/* Status indicator */}
              <View style={styles.statusRow}>
                {usernameStatus === 'checking' && (
                  <ActivityIndicator size="small" color="#666" style={{ marginRight: 6 }} />
                )}
                {statusText ? (
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {statusText}
                  </Text>
                ) : (
                  <Text style={styles.hint}>3-15 characters, letters, numbers, underscores</Text>
                )}
              </View>
            </View>
          </View>

          {/* Bottom area */}
          <View style={styles.bottom}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity
              style={[styles.continueButton, !canContinue && styles.continueDisabled]}
              onPress={handleSave}
              disabled={!canContinue || saving}
            >
              {saving ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={[styles.continueText, !canContinue && styles.continueTextDisabled]}>
                  Continue
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    marginTop: 16,
  },
  subtitle: {
    color: '#888',
    fontSize: 15,
    marginTop: 8,
  },
  form: {
    gap: 24,
  },
  label: {
    color: '#888',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 2,
  },
  input: {
    backgroundColor: '#1E1E1E',
    color: '#fff',
    fontSize: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  atSign: {
    color: '#666',
    fontSize: 18,
    fontWeight: '600',
    marginRight: 4,
  },
  usernameInput: {
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    minHeight: 18,
  },
  statusText: {
    fontSize: 13,
  },
  hint: {
    color: '#555',
    fontSize: 13,
  },
  bottom: {
    gap: 12,
  },
  error: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  continueButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueDisabled: {
    backgroundColor: '#333',
  },
  continueText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '700',
  },
  continueTextDisabled: {
    color: '#666',
  },
});
