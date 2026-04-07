import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface FollowedSpeaker {
  id: string;
  full_name: string;
  credentials: string | null;
  photo_url: string | null;
  primary_affiliation: string | null;
  episode_count: number;
  followed_at: string;
}

export function useFollowedSpeakers() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['followedSpeakers', user?.id],
    queryFn: async (): Promise<FollowedSpeaker[]> => {
      if (!user) return [];

      const { data: libraryData, error } = await supabase
        .from('user_library')
        .select('speaker_id, created_at')
        .eq('user_id', user.id)
        .eq('item_type', 'follow_speaker')
        .not('speaker_id', 'is', null);

      if (error) throw error;
      if (!libraryData || libraryData.length === 0) return [];

      const speakerIds = (libraryData as any[]).map(item => item.speaker_id).filter(Boolean);
      const followDates = new Map((libraryData as any[]).map(item => [item.speaker_id, item.created_at]));

      const { data: speakersData, error: speakersError } = await supabase
        .from('speakers')
        .select('id, full_name, credentials, photo_url, primary_affiliation')
        .in('id', speakerIds);

      if (speakersError) throw speakersError;
      if (!speakersData) return [];

      const { data: episodeCounts } = await supabase
        .from('episode_speakers')
        .select('speaker_id')
        .in('speaker_id', speakerIds);

      const countMap = new Map<string, number>();
      for (const row of episodeCounts || []) {
        countMap.set((row as any).speaker_id, (countMap.get((row as any).speaker_id) || 0) + 1);
      }

      return speakersData.map((speaker: any) => ({
        id: speaker.id,
        full_name: speaker.full_name,
        credentials: speaker.credentials,
        photo_url: speaker.photo_url,
        primary_affiliation: speaker.primary_affiliation,
        episode_count: countMap.get(speaker.id) || 0,
        followed_at: followDates.get(speaker.id) || '',
      }));
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}

export function useIsFollowingSpeaker(speakerId: string | undefined) {
  const { data: followedSpeakers = [] } = useFollowedSpeakers();
  return speakerId ? followedSpeakers.some(s => s.id === speakerId) : false;
}
