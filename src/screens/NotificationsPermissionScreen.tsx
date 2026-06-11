import { useState } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, StyleSheet,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export default function NotificationsPermissionScreen({ onComplete }: { onComplete: () => void }) {
  const { user } = useAuth();
  const [enabling, setEnabling] = useState(false);

  const handleEnable = async () => {
    setEnabling(true);

    if (Device.isDevice) {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'GameVoices',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FFFFFF',
        });
      }

      const { status } = await Notifications.requestPermissionsAsync();

      if (status === 'granted' && user) {
        try {
          const projectId =
            Constants.expoConfig?.extra?.eas?.projectId ??
            Constants.easConfig?.projectId;
          const tokenData = await Notifications.getExpoPushTokenAsync(
            projectId ? { projectId } : undefined
          );
          await supabase
            .from('profiles')
            .update({ push_token: tokenData.data })
            .eq('user_id', user.id);
        } catch (err) {
          console.warn('Could not get push token:', err);
        }
      }
    }

    setEnabling(false);
    onComplete();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Illustration area */}
        <View style={styles.hero}>
          <View style={styles.iconCircle}>
            <Ionicons name="notifications" size={48} color="#FFFFFF" />
          </View>
          <Text style={styles.title}>Don't miss what's happening</Text>
          <Text style={styles.subtitle}>
            Get notified when your favorite shows drop new episodes, when someone replies to your comments, and more.
          </Text>
        </View>

        {/* Buttons */}
        <View style={styles.buttons}>
          <TouchableOpacity
            style={styles.enableButton}
            onPress={handleEnable}
            disabled={enabling}
          >
            <Text style={styles.enableText}>
              {enabling ? 'Enabling...' : 'Turn on notifications'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={onComplete}
            disabled={enabling}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
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
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
    marginTop: 40,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#1E1E1E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 8,
  },
  buttons: {
    gap: 12,
  },
  enableButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  enableText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '700',
  },
  skipButton: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 28,
    paddingVertical: 16,
    alignItems: 'center',
  },
  skipText: {
    color: '#888',
    fontSize: 17,
    fontWeight: '600',
  },
});
