import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Show alerts even when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotifications(userId: string) {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'GameVoices',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFFFFF',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission denied');
    return;
  }

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenData.data;

    await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('user_id', userId);
  } catch (err) {
    console.warn('Could not get push token:', err);
  }
}

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    registerForPushNotifications(user.id);

    // Handle notification tapped while app is backgrounded/closed
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      // Future: navigate to the relevant comment thread
      console.log('Notification tapped:', response.notification.request.content);
    });

    return () => sub.remove();
  }, [user?.id]);
}
