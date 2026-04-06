import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
 
interface LineupEpisode {
  id: string;
  episodeId: string;
  title: string;
  artwork_url: string | null;
  audio_url: string;
  duration_seconds: number;
  position_seconds: number;
  show_name: string | null;
  show_id: string;
  progress: number;
  time_remaining: number;
}
 
export function useYourLineup() {
  return useQuery({
    queryKey: ['your-lineup'],
    queryFn: async (): Promise<LineupEpisode[]> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return [];
 
      const { data, error } = await supabase
        .from('user_playback')
        .select(`
          id,
          episode_id,
          position_seconds,
          completed,
          updated_at,
          episodes(
            id,
            title,
            artwork_url,
            audio_url,
            duration_seconds,
            show_id,
            shows(id, title)
          )
        `)
        .eq('user_id', session.user.id)
        .eq('completed', false)
        .order('updated_at', { ascending: false })
        .limit(10);
 
      if (error) throw error;
      if (!data) return [];
 
      return data
        .filter((row: any) => row.episodes)
        .map((row: any) => {
          const ep = row.episodes;
          const duration = ep.duration_seconds || 1;
          const position = row.position_seconds || 0;
          return {
            id: row.id,
            episodeId: row.episode_id,
            title: ep.title,
            artwork_url: ep.artwork_url,
            audio_url: ep.audio_url,
            duration_seconds: duration,
            position_seconds: position,
            show_name: ep.shows?.title || null,
            show_id: ep.show_id,
            progress: Math.min(position / duration, 1),
            time_remaining: Math.max(duration - position, 0),
          };
        });
    },
    staleTime: 2 * 60 * 1000,
  });
}