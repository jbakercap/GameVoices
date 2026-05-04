import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import TrackPlayer from 'react-native-track-player';
import { View, Text, Modal } from 'react-native';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import { usePendingFriendRequestCount } from './src/hooks/queries/useFriendships';
import { navigationRef } from './src/lib/navigationRef';
import { PlayerProvider, usePlayer } from './src/contexts/PlayerContext';
import MiniPlayer from './src/components/MiniPlayer';
import FullPlayerScreen from './src/screens/FullPlayerScreen';
import AuthScreen from './src/screens/AuthScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import BrowseScreen from './src/screens/BrowseScreen';
import SearchScreen from './src/screens/SearchScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import WatchScreen from './src/screens/WatchScreen';
import StoryDetailScreen from './src/screens/StoryDetailScreen';

import EpisodeScreen from './src/screens/EpisodeScreen';
import TeamScreen from './src/screens/TeamScreen';
import PlaylistScreen from './src/screens/PlaylistScreen';
import SubmitShowScreen from './src/screens/SubmitShowScreen';
import PublicProfileScreen from './src/screens/PublicProfileScreen';
import FriendsScreen from './src/screens/FriendsScreen';
import CreatorProfileScreen from './src/screens/CreatorProfileScreen';

TrackPlayer.registerPlaybackService(() => require('./src/services/trackPlayerService').default);

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

function ProfileTabIcon({ color, size }: { color: string; size: number }) {
  const { data: count = 0 } = usePendingFriendRequestCount();
  return (
    <View style={{ width: size, height: size }}>
      <Ionicons name="person-outline" size={size} color={color} />
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
          Home: 'home',
          Clips: 'film-outline',
          Discover: 'compass-outline',
          Search: 'search-outline',
          Profile: 'person-outline',
        };
        return <Ionicons name={icons[route.name] as any} size={size} color={color} />;
      },
    })}>
      <Tab.Screen
        name="Home"
        children={() => <HomeScreen onNavigate={(screen: string, params: any) => navigation.navigate(screen, params)} />}
      />
      <Tab.Screen name="Clips" component={WatchScreen} />
      <Tab.Screen name="Discover" component={BrowseScreen} />
      <Tab.Screen
        name="Search"
        children={() => <SearchScreen onNavigate={(screen: string, params: any) => navigation.navigate(screen, params)} />}
      />
      <Tab.Screen
        name="Profile"
        component={OwnProfileTab}
        options={{ tabBarIcon: ({ color, size }) => <ProfileTabIcon color={color} size={size} /> }}
      />
    </Tab.Navigator>
  );
}

function MainApp() {
  const { isFullPlayerOpen, openFullPlayer, closeFullPlayer } = usePlayer();

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
      </Stack.Navigator>
      <MiniPlayer onPress={openFullPlayer} />
      <Modal
        visible={isFullPlayerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeFullPlayer}
      >
        <FullPlayerScreen onClose={closeFullPlayer} />
      </Modal>
    </NavigationContainer>
  );
}

function AppContent() {
  const { user, isLoading, needsOnboarding, setNeedsOnboarding } = useAuth();
  usePushNotifications();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 28, fontWeight: 'bold' }}>GameVoices</Text>
      </View>
    );
  }

  if (!user) {
    return <AuthScreen onAuth={() => {}} />;
  }

  if (needsOnboarding) {
    return <OnboardingScreen onComplete={() => setNeedsOnboarding(false)} />;
  }

  return <MainApp />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PlayerProvider>
          <AppContent />
          <StatusBar style="light" />
        </PlayerProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
