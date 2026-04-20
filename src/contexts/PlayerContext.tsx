import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import TrackPlayer, {
  usePlaybackState,
  useProgress,
  State,
  Capability,
} from 'react-native-track-player';

export interface Episode {
  id: string;
  title: string;
  showTitle: string;
  showId?: string;
  artworkUrl?: string;
  audioUrl: string;
  durationSeconds?: number;
  startTime?: number;
  teamColor?: string;
}

interface PlayerContextValue {
  currentEpisode: Episode | null;
  isPlaying: boolean;
  isLoading: boolean;
  progress: { position: number; duration: number };
  playEpisode: (episode: Episode) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  skipForward: () => Promise<void>;
  skipBack: () => Promise<void>;
  isFullPlayerOpen: boolean;
  openFullPlayer: () => void;
  closeFullPlayer: () => void;
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  sleepTimerMinutes: number | null;
  setSleepTimer: (minutes: number | null) => void;
  sleepTimerSecondsLeft: number | null;
  dismissPlayer: () => Promise<void>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

let isSetup = false;

async function setupPlayer() {
  if (isSetup) return;
  try {
    await TrackPlayer.setupPlayer();
    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.SkipToNext,
        Capability.SkipToPrevious,
        Capability.JumpForward,
        Capability.JumpBackward,
        Capability.SeekTo,
      ],
      compactCapabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.JumpForward,
        Capability.JumpBackward,
      ],
    });
    isSetup = true;
  } catch (error: any) {
    if (error.message?.includes('already been initialized')) {
      isSetup = true;
      return;
    }
    throw error;
  }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [sleepTimerEndTime, setSleepTimerEndTime] = useState<number | null>(null);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerSecondsLeft, setSleepTimerSecondsLeft] = useState<number | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const playbackState = usePlaybackState();
  const progress = useProgress(500);

  const [playbackRate, setPlaybackRateState] = useState(1);

  const setPlaybackRate = useCallback(async (rate: number) => {
    setPlaybackRateState(rate);
    await TrackPlayer.setRate(rate);
  }, []);

  const isPlaying = playbackState.state === State.Playing;
  const isLoading = playbackState.state === State.Loading ||
    playbackState.state === State.Buffering;

  useEffect(() => {
    setupPlayer().catch(console.error);
  }, []);

  // Sleep timer countdown
  useEffect(() => {
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }

    if (!sleepTimerEndTime) {
      setSleepTimerSecondsLeft(null);
      return;
    }

    const tick = () => {
      const remaining = Math.round((sleepTimerEndTime - Date.now()) / 1000);
      if (remaining <= 0) {
        TrackPlayer.pause().catch(console.error);
        setSleepTimerEndTime(null);
        setSleepTimerMinutes(null);
        setSleepTimerSecondsLeft(null);
        if (sleepTimerRef.current) {
          clearInterval(sleepTimerRef.current);
          sleepTimerRef.current = null;
        }
      } else {
        setSleepTimerSecondsLeft(remaining);
      }
    };

    tick();
    sleepTimerRef.current = setInterval(tick, 1000);
    return () => {
      if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
    };
  }, [sleepTimerEndTime]);

  const setSleepTimer = useCallback((minutes: number | null) => {
    if (minutes === null) {
      setSleepTimerEndTime(null);
      setSleepTimerMinutes(null);
    } else {
      setSleepTimerEndTime(Date.now() + minutes * 60 * 1000);
      setSleepTimerMinutes(minutes);
    }
  }, []);

  const playEpisode = useCallback(async (episode: Episode) => {
    try {
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: episode.id,
        url: episode.audioUrl,
        title: episode.title,
        artist: episode.showTitle,
        artwork: episode.artworkUrl,
        duration: episode.durationSeconds,
      });
      await TrackPlayer.play();
      if (episode.startTime && episode.startTime > 0) {
        await TrackPlayer.seekTo(episode.startTime);
      }
      setCurrentEpisode(episode);
    } catch (error) {
      console.error('Error playing episode:', error);
    }
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (isPlaying) {
      await TrackPlayer.pause();
    } else {
      await TrackPlayer.play();
    }
  }, [isPlaying]);

  const seekTo = useCallback(async (position: number) => {
    await TrackPlayer.seekTo(position);
  }, []);

  const skipForward = useCallback(async () => {
    await TrackPlayer.seekBy(30);
  }, []);

  const skipBack = useCallback(async () => {
    await TrackPlayer.seekBy(-15);
  }, []);

  const dismissPlayer = useCallback(async () => {
    try {
      await TrackPlayer.reset();
    } catch {}
    setCurrentEpisode(null);
  }, []);

  return (
    <PlayerContext.Provider value={{
      currentEpisode,
      isPlaying,
      isLoading,
      progress: { position: progress.position, duration: progress.duration },
      playEpisode,
      togglePlayPause,
      seekTo,
      skipForward,
      skipBack,
      isFullPlayerOpen,
      playbackRate,
      setPlaybackRate,
      openFullPlayer: () => setIsFullPlayerOpen(true),
      closeFullPlayer: () => setIsFullPlayerOpen(false),
      sleepTimerMinutes,
      setSleepTimer,
      sleepTimerSecondsLeft,
      dismissPlayer,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error('usePlayer must be used within PlayerProvider');
  return context;
}
