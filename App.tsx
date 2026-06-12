import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TrackPlayer from 'react-native-track-player';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { GameVoicesLogo } from './src/components/GameVoicesLogo';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { usePendingFriendRequestCount } from './src/hooks/queries/useFriendships';
import { navigationRef } from './src/lib/navigationRef';
import { PlayerProvider, usePlayer } from './src/contexts/PlayerContext';
import { DownloadsProvider } from './src/contexts/DownloadsContext';
import MiniPlayer from './src/components/MiniPlayer';
import NowPlayingScreen from './src/screens/NowPlayingScreen';
import AuthScreen from './src/screens/AuthScreen';
import WelcomeScreen from './src/screens/WelcomeScreen';
import ProfileSetupScreen from './src/screens/ProfileSetupScreen';
import NotificationsPermissionScreen from './src/screens/NotificationsPermissionScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import BrowseScreen from './src/screens/BrowseScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import StoryDetailScreen from './src/screens/StoryDetailScreen';

import EpisodeScreen from './src/screens/EpisodeScreen';
import TeamScreen from './src/screens/TeamScreen';
import PlaylistScreen from './src/screens/PlaylistScreen';
import SubmitShowScreen from './src/screens/SubmitShowScreen';
import PublicProfileScreen from './src/screens/PublicProfileScreen';
import FriendsScreen from './src/screens/FriendsScreen';
import CreatorProfileScreen from './src/screens/CreatorProfileScreen';
import GameFeedScreen from './src/screens/GameFeedScreen';
import PodcastClaimScreen from './src/screens/PodcastClaimScreen';
import SearchScreen from './src/screens/SearchScreen';

TrackPlayer.registerPlaybackService(() => require('./src/services/trackPlayerService').default);

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

function FriendsTabIcon({ color, size }: { color: string; size: number }) {
  const { data: count = 0 } = usePendingFriendRequestCount();
  return (
    <View style={{ width: size, height: size }}>
      <Ionicons name="people-outline" size={size} color={color} />
      {count > 0 && (
        <View style={{
          position: 'absolute', top: -3, right: -5,
          minWidth: 16, height: 16, borderRadius: 8,
          backgroundColor: '#e11d48',
          alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 3,
          borderWidth: 1.5, borderColor: '#121212',
        }}>
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>
            {count > 9 ? '9+' : count}
          </Text>
        </View>
      )}
    </View>
  );
}

function OwnProfileTab() {
  const { user } = useAuth();
  return <PublicProfileScreen overrideUserId={user?.id ?? ''} />;
}

function TabNavigator({ navigation }: any) {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: { backgroundColor: '#121212', borderTopColor: '#222', paddingBottom: 4 },
      tabBarActiveTintColor: '#FFFFFF',
      tabBarInactiveTintColor: '#555',
      tabBarIcon: ({ color, size }) => {
        const icons: Record<string, string> = {
          Home: 'home-outline',
          Discover: 'compass-outline',
          Friends: 'people-outline',
          Creator: 'mic-outline',
          Profile: 'person-outline',
        };
        return <Ionicons name={icons[route.name] as any} size={size} color={color} />;
      },
    })}>
      <Tab.Screen
        name="Home"
        children={() => <HomeScreen onNavigate={(screen: string, params: any) => navigation.navigate(screen, params)} />}
      />
      <Tab.Screen name="Discover" component={BrowseScreen} />
      <Tab.Screen
        name="Friends"
        component={FriendsScreen}
        options={{ tabBarIcon: ({ color, size }) => <FriendsTabIcon color={color} size={size} /> }}
      />
      <Tab.Screen name="Creator" component={PodcastClaimScreen} />
      <Tab.Screen name="Profile" component={OwnProfileTab} />
    </Tab.Navigator>
  );
}

function MainApp() {
  const { miniPlayerVisible } = usePlayer();

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={TabNavigator} />
        <Stack.Screen name="StoryDetail" component={StoryDetailScreen} />
        <Stack.Screen name="ShowDetail" component={CreatorProfileScreen} />
        <Stack.Screen name="EpisodeDetail" component={EpisodeScreen} />
        <Stack.Screen name="TeamDetail" component={TeamScreen} />
        <Stack.Screen name="PlaylistDetail" component={PlaylistScreen} />
        <Stack.Screen name="SubmitShow" component={SubmitShowScreen} />
        <Stack.Screen name="LibraryDetail" component={LibraryScreen} />
        <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
        <Stack.Screen name="Friends" component={FriendsScreen} />
        <Stack.Screen name="GameFeed" component={GameFeedScreen} />
        <Stack.Screen name="NowPlaying" component={NowPlayingScreen} />
        <Stack.Screen
          name="Search"
          children={({ navigation }: any) => (
            <SearchScreen onNavigate={(screen: string, params: any) => navigation.navigate(screen, params)} />
          )}
        />
      </Stack.Navigator>
      {miniPlayerVisible && <MiniPlayer />}
    </NavigationContainer>
  );
}

function SplashScreen({ isReady, onDone }: { isReady: boolean; onDone: () => void }) {
  const scale = useRef(new Animated.Value(0.35)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const mountTime = useRef(Date.now());
  const exitTriggered = useRef(false);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, tension: 120, friction: 8 }),
      Animated.timing(logoOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    if (!isReady || exitTriggered.current) return;
    exitTriggered.current = true;

    const elapsed = Date.now() - mountTime.current;
    const remaining = Math.max(0, 900 - elapsed);

    setTimeout(() => {
      Animated.parallel([
        Animated.timing(scale, {
          toValue: 30,
          duration: 380,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(containerOpacity, {
          toValue: 0,
          duration: 320,
          useNativeDriver: true,
        }),
      ]).start(() => onDone());
    }, remaining);
  }, [isReady]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        { backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center', opacity: containerOpacity },
      ]}
      pointerEvents="none"
    >
      <Animated.View style={{ transform: [{ scale }], opacity: logoOpacity }}>
        <GameVoicesLogo size={150} />
      </Animated.View>
    </Animated.View>
  );
}

function AppContent() {
  const {
    user, isLoading,
    needsProfileSetup, setNeedsProfileSetup,
    needsOnboarding, setNeedsOnboarding,
  } = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  const [notificationsDone, setNotificationsDone] = useState(false);
  usePushNotifications();

  const renderContent = () => {
    if (!user) return <WelcomeScreen />;
    if (needsProfileSetup) {
      return <ProfileSetupScreen onComplete={() => setNeedsProfileSetup(false)} />;
    }
    if (!notificationsDone && needsOnboarding) {
      return <NotificationsPermissionScreen onComplete={() => setNotificationsDone(true)} />;
    }
    if (needsOnboarding) {
      return <OnboardingScreen onComplete={() => setNeedsOnboarding(false)} />;
    }
    return <MainApp />;
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#121212' }}>
      {splashDone && renderContent()}
      {!splashDone && (
        <SplashScreen isReady={!isLoading} onDone={() => setSplashDone(true)} />
      )}
    </View>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DownloadsProvider>
          <PlayerProvider>
            <AppContent />
            <StatusBar style="light" />
          </PlayerProvider>
        </DownloadsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
