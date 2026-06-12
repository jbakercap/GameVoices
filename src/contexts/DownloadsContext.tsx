import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { File, Directory, Paths } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DOWNLOADS_DIR = new Directory(Paths.document, 'downloads');
const STORAGE_KEY = '@gamevoices_downloads';

export interface DownloadedEpisode {
  id: string;
  title: string;
  showTitle: string;
  showId?: string;
  artworkUrl?: string;
  audioUrl: string;
  localUri: string;
  durationSeconds?: number;
  teamColor?: string;
  downloadedAt: string;
}

export type DownloadStatus = 'idle' | 'downloading' | 'downloaded' | 'error';

interface DownloadsContextValue {
  downloads: DownloadedEpisode[];
  activeDownloads: Map<string, number>;
  getDownloadStatus: (episodeId: string) => DownloadStatus;
  getDownloadProgress: (episodeId: string) => number;
  getLocalUri: (episodeId: string) => string | null;
  downloadEpisode: (episode: {
    id: string;
    title: string;
    showTitle: string;
    showId?: string;
    artworkUrl?: string;
    audioUrl: string;
    durationSeconds?: number;
    teamColor?: string;
  }) => Promise<void>;
  removeDownload: (episodeId: string) => Promise<void>;
  isInitialized: boolean;
}

const DownloadsContext = createContext<DownloadsContextValue | null>(null);

export function DownloadsProvider({ children }: { children: React.ReactNode }) {
  const [downloads, setDownloads] = useState<DownloadedEpisode[]>([]);
  const [activeDownloads, setActiveDownloads] = useState<Map<string, number>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);

  // Load saved downloads on mount
  useEffect(() => {
    (async () => {
      try {
        // Ensure downloads directory exists
        if (!DOWNLOADS_DIR.exists) {
          DOWNLOADS_DIR.create();
        }

        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed: DownloadedEpisode[] = JSON.parse(stored);
          // Verify files still exist
          const valid: DownloadedEpisode[] = [];
          for (const ep of parsed) {
            const file = new File(ep.localUri);
            if (file.exists) {
              valid.push(ep);
            }
          }
          setDownloads(valid);
          if (valid.length !== parsed.length) {
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(valid));
          }
        }
      } catch (e) {
        console.error('Failed to load downloads:', e);
      }
      setIsInitialized(true);
    })();
  }, []);

  const persistDownloads = useCallback(async (updated: DownloadedEpisode[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const getDownloadStatus = useCallback((episodeId: string): DownloadStatus => {
    if (activeDownloads.has(episodeId)) return 'downloading';
    if (downloads.some(d => d.id === episodeId)) return 'downloaded';
    return 'idle';
  }, [activeDownloads, downloads]);

  const getDownloadProgress = useCallback((episodeId: string): number => {
    return activeDownloads.get(episodeId) ?? 0;
  }, [activeDownloads]);

  const getLocalUri = useCallback((episodeId: string): string | null => {
    const dl = downloads.find(d => d.id === episodeId);
    return dl?.localUri ?? null;
  }, [downloads]);

  const downloadEpisode = useCallback(async (episode: {
    id: string;
    title: string;
    showTitle: string;
    showId?: string;
    artworkUrl?: string;
    audioUrl: string;
    durationSeconds?: number;
    teamColor?: string;
  }) => {
    if (downloads.some(d => d.id === episode.id)) return;
    if (activeDownloads.has(episode.id)) return;

    setActiveDownloads(prev => {
      const next = new Map(prev);
      next.set(episode.id, 0);
      return next;
    });

    try {
      const destFile = new File(DOWNLOADS_DIR, `${episode.id}.mp3`);
      const downloaded = await File.downloadFileAsync(episode.audioUrl, destFile);

      setActiveDownloads(prev => {
        const next = new Map(prev);
        next.set(episode.id, 1);
        return next;
      });

      const newDownload: DownloadedEpisode = {
        id: episode.id,
        title: episode.title,
        showTitle: episode.showTitle,
        showId: episode.showId,
        artworkUrl: episode.artworkUrl,
        audioUrl: episode.audioUrl,
        localUri: downloaded.uri,
        durationSeconds: episode.durationSeconds,
        teamColor: episode.teamColor,
        downloadedAt: new Date().toISOString(),
      };

      setDownloads(prev => {
        const updated = [...prev, newDownload];
        persistDownloads(updated);
        return updated;
      });
    } catch (e) {
      console.error('Download failed:', e);
    } finally {
      setActiveDownloads(prev => {
        const next = new Map(prev);
        next.delete(episode.id);
        return next;
      });
    }
  }, [downloads, activeDownloads, persistDownloads]);

  const removeDownload = useCallback(async (episodeId: string) => {
    const dl = downloads.find(d => d.id === episodeId);
    if (dl) {
      try {
        const file = new File(dl.localUri);
        if (file.exists) file.delete();
      } catch {}
    }

    setDownloads(prev => {
      const updated = prev.filter(d => d.id !== episodeId);
      persistDownloads(updated);
      return updated;
    });
  }, [downloads, persistDownloads]);

  return (
    <DownloadsContext.Provider value={{
      downloads,
      activeDownloads,
      getDownloadStatus,
      getDownloadProgress,
      getLocalUri,
      downloadEpisode,
      removeDownload,
      isInitialized,
    }}>
      {children}
    </DownloadsContext.Provider>
  );
}

export function useDownloads() {
  const context = useContext(DownloadsContext);
  if (!context) throw new Error('useDownloads must be used within DownloadsProvider');
  return context;
}
