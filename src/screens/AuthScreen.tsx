import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function AuthScreen({ onAuth }: { onAuth: () => void }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleAuth = async () => {
    setLoading(true);
    setError('');
    setMessage('');

    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
      else onAuth();
    } else {
      const { error } = await signUp(email, password);
      if (error) setError(error.message);
      else setMessage('Check your email to confirm your account!');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#121212' }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>

        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: 48 }}>
          <Text style={{ color: '#F0B429', fontSize: 36, fontWeight: 'bold', letterSpacing: -1 }}>
            GameVoices
          </Text>
          <Text style={{ color: '#888', fontSize: 15, marginTop: 6 }}>
            Sports podcasts, curated for your teams
          </Text>
        </View>

        {/* Toggle */}
        <View style={{
          flexDirection: 'row', backgroundColor: '#1E1E1E',
          borderRadius: 10, padding: 4, marginBottom: 28
        }}>
          {(['login', 'signup'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => { setMode(m); setError(''); setMessage(''); }}
              style={{
                flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center',
                backgroundColor: mode === m ? '#F0B429' : 'transparent',
              }}
            >
              <Text style={{ color: mode === m ? '#fff' : '#888', fontWeight: '600', fontSize: 15 }}>
                {m === 'login' ? 'Sign In' : 'Sign Up'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Email */}
        <Text style={{ color: '#888', fontSize: 13, marginBottom: 6, marginLeft: 2 }}>EMAIL</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="#444"
          autoCapitalize="none"
          keyboardType="email-address"
          style={{
            backgroundColor: '#1E1E1E', color: '#fff', borderRadius: 10,
            padding: 14, fontSize: 16, marginBottom: 16,
            borderWidth: 1, borderColor: '#333'
          }}
        />

        {/* Password */}
        <Text style={{ color: '#888', fontSize: 13, marginBottom: 6, marginLeft: 2 }}>PASSWORD</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          placeholderTextColor="#444"
          secureTextEntry
          style={{
            backgroundColor: '#1E1E1E', color: '#fff', borderRadius: 10,
            padding: 14, fontSize: 16, marginBottom: 24,
            borderWidth: 1, borderColor: '#333'
          }}
        />

        {/* Error / Message */}
        {error ? (
          <Text style={{ color: '#F0B429', textAlign: 'center', marginBottom: 16, fontSize: 14 }}>
            {error}
          </Text>
        ) : null}
        {message ? (
          <Text style={{ color: '#4CAF50', textAlign: 'center', marginBottom: 16, fontSize: 14 }}>
            {message}
          </Text>
        ) : null}

        {/* Submit button */}
        <TouchableOpacity
          onPress={handleAuth}
          disabled={loading || !email || !password}
          style={{
            backgroundColor: loading || !email || !password ? '#444' : '#F0B429',
            borderRadius: 12, padding: 16, alignItems: 'center',
          }}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                {mode === 'login' ? 'Sign In' : 'Create Account'}
              </Text>
          }
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}
