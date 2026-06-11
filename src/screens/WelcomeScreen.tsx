import { useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  SafeAreaView, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { GameVoicesLogo } from '../components/GameVoicesLogo';
import AuthScreen from './AuthScreen';

export default function WelcomeScreen() {
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [showEmailAuth, setShowEmailAuth] = useState(false);
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState('');

  if (showEmailAuth) {
    return <AuthScreen onAuth={() => {}} onBack={() => setShowEmailAuth(false)} />;
  }

  const handleGoogle = async () => {
    setLoading('google');
    setError('');
    const { error } = await signInWithGoogle();
    if (error) setError(error.message);
    setLoading(null);
  };

  const handleApple = async () => {
    setLoading('apple');
    setError('');
    const { error } = await signInWithApple();
    if (error) setError(error.message);
    setLoading(null);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo + tagline — upper portion */}
        <View style={styles.hero}>
          <GameVoicesLogo size={120} />
          <Text style={styles.tagline}>Sports podcasts,{'\n'}curated for your teams</Text>
        </View>

        {/* Auth buttons — lower portion */}
        <View style={styles.buttons}>
          {/* Google */}
          <TouchableOpacity
            style={styles.oauthButton}
            onPress={handleGoogle}
            disabled={loading !== null}
          >
            {loading === 'google' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#fff" />
                <Text style={styles.oauthText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Apple */}
          <TouchableOpacity
            style={styles.oauthButton}
            onPress={handleApple}
            disabled={loading !== null}
          >
            {loading === 'apple' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="logo-apple" size={20} color="#fff" />
                <Text style={styles.oauthText}>Continue with Apple</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Create account (email) */}
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => setShowEmailAuth(true)}
            disabled={loading !== null}
          >
            <Text style={styles.createText}>Create account</Text>
          </TouchableOpacity>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Sign in link */}
          <View style={styles.signInRow}>
            <Text style={styles.signInLabel}>Already have an account? </Text>
            <TouchableOpacity onPress={() => setShowEmailAuth(true)}>
              <Text style={styles.signInLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    marginTop: 40,
  },
  tagline: {
    color: '#888',
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 26,
    marginTop: 16,
  },
  buttons: {
    gap: 12,
  },
  oauthButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 28,
    paddingVertical: 15,
  },
  oauthText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#333',
  },
  dividerText: {
    color: '#666',
    fontSize: 14,
  },
  createButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 15,
    alignItems: 'center',
  },
  createText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center',
  },
  signInRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  signInLabel: {
    color: '#666',
    fontSize: 14,
  },
  signInLink: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
