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
import { PlayerProvider, usePlayer } from './src/contexts/PlayerContext';
import MiniPlayer from './src/components/MiniPlayer';
import FullPlayerScreen from './src/screens/FullPlayerScreen';
import AuthScreen from './src/screens/AuthScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import BrowseScreen from './src/screens/BrowseScreen';
import SearchScreen from './src/screens/SearchScreen';
import RosterScreen from './src/screens/RosterScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import LibraryScreen from './src/screens/LibraryScreen';
import WatchScreen from './src/screens/WatchScreen';
import StoryDetailScreen from './src/screens/StoryDetailScreen';
import PlayerDetailScreen from './src/screens/PlayerDetailScreen';
import ShowScreen from './src/screens/ShowScreen';
import EpisodeScreen from './src/screens/EpisodeScreen';
import TeamScreen from './src/screens/TeamScreen';
import PersonScreen from './src/screens/PersonScreen';
import PlaylistScreen from './src/screens/PlaylistScreen';
import SubmitShowScreen from './src/screens/SubmitShowScreen';
import TrendingScreen from './src/screens/TrendingScreen';

TrackPlayer.registerPlaybackService(() => require('./src/services/trackPlayerService').default);

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

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
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function MainApp() {
  const { isFullPlayerOpen, openFullPlayer, closeFullPlayer } = usePlayer();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={TabNavigator} />
        <Stack.Screen name="StoryDetail" component={StoryDetailScreen} />
        <Stack.Screen name="PlayerDetail" component={PlayerDetailScreen} />
        <Stack.Screen name="ShowDetail" component={ShowScreen} />
        <Stack.Screen name="EpisodeDetail" component={EpisodeScreen} />
        <Stack.Screen name="TeamDetail" component={TeamScreen} />
        <Stack.Screen name="PersonDetail" component={PersonScreen} />
        <Stack.Screen name="PlaylistDetail" component={PlaylistScreen} />
        <Stack.Screen name="SubmitShow" component={SubmitShowScreen} />
        <Stack.Screen name="Trending" component={TrendingScreen} />
        <Stack.Screen name="LibraryDetail" component={LibraryScreen} />
        <Stack.Screen name="MyRoster" component={RosterScreen} />
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
