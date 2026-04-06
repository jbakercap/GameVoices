import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './src/lib/supabase';
import { Session } from '@supabase/supabase-js';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import BrowseScreen from './src/screens/BrowseScreen';
import RosterScreen from './src/screens/RosterScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import StoryDetailScreen from './src/screens/StoryDetailScreen';
import PlayerDetailScreen from './src/screens/PlayerDetailScreen';
import TrackPlayer from 'react-native-track-player';
import { PlayerProvider } from './src/contexts/PlayerContext';
import MiniPlayer from './src/components/MiniPlayer';
import FullPlayerScreen from './src/screens/FullPlayerScreen';
import { View, Text, Modal } from 'react-native';
import { usePlayer } from './src/contexts/PlayerContext';
import SearchScreen from './src/screens/SearchScreen';
import ProfileScreen from './src/screens/ProfileScreen';

TrackPlayer.registerPlaybackService(() => require('./src/services/trackPlayerService').default);

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

function MainApp({ onSignOut }: { onSignOut: () => void }) {
  const { isFullPlayerOpen, openFullPlayer, closeFullPlayer } = usePlayer();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Tabs" component={TabNavigator} />
        <Stack.Screen name="StoryDetail" component={StoryDetailScreen} />
        <Stack.Screen name="PlayerDetail" component={PlayerDetailScreen} />
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

function TabNavigator({ navigation }: any) {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarStyle: { backgroundColor: '#121212', borderTopColor: '#222', paddingBottom: 4 },
      tabBarActiveTintColor: '#E53935',
      tabBarInactiveTintColor: '#555',
      tabBarIcon: ({ color, size }) => {
        const icons: Record<string, string> = {
          Home: 'home',
          Browse: 'compass-outline',
          Search: 'search-outline',
          'My Roster': 'people-outline',
          Profile: 'person-outline',
        };
        return <Ionicons name={icons[route.name] as any} size={size} color={color} />;
      },
    })}>
      <Tab.Screen
        name="Home"
        children={() => <HomeScreen onNavigate={(screen: string, params: any) => navigation.navigate(screen, params)} />}
      />
      <Tab.Screen name="Browse" component={BrowseScreen} />
      <Tab.Screen
        name="Search"
        children={() => <SearchScreen onNavigate={(screen: string, params: any) => navigation.navigate(screen, params)} />}
      />
      <Tab.Screen name="My Roster" component={RosterScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);

      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('topic_slugs')
          .eq('user_id', session.user.id)
          .single();
        setNeedsOnboarding(!profile?.topic_slugs || profile.topic_slugs.length === 0);
      }

      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);

      if (session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('topic_slugs')
          .eq('user_id', session.user.id)
          .single();
        setNeedsOnboarding(!profile?.topic_slugs || profile.topic_slugs.length === 0);
      } else {
        setNeedsOnboarding(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#E53935', fontSize: 28, fontWeight: 'bold' }}>GameVoices</Text>
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <PlayerProvider>
        {!session ? (
          <AuthScreen onAuth={() => {}} />
        ) : needsOnboarding ? (
          <OnboardingScreen onComplete={() => setNeedsOnboarding(false)} />
        ) : (
          <MainApp onSignOut={() => supabase.auth.signOut()} />
        )}
        <StatusBar style="light" />
      </PlayerProvider>
    </QueryClientProvider>
  );
}
