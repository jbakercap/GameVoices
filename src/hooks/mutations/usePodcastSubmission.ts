import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface SubmissionData {
  rss_url: string;
  title: string;
  description: string | null;
  artwork_url: string | null;
  publisher: string | null;
  episode_count: number;
  primary_specialty?: string | null;
}

export function usePodcastSubmission() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: SubmissionData) => {
      if (!user) throw new Error('You must be logged in to submit a podcast');

      const { data: submission, error } = await supabase
        .from('podcast_submissions')
        .insert({
          user_id: user.id,
          rss_url: data.rss_url || null,
          title: data.title,
          description: data.description,
          artwork_url: data.artwork_url,
          publisher: data.publisher,
          episode_count: data.episode_count,
          primary_specialty: data.primary_specialty || null,
          status: 'pending',
        })
        .select('id')
        .single();

      if (error) throw error;
      return submission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-submissions'] });
    },
    onError: (error) => {
      console.error('Podcast submission error:', error);
    },
  });
}

export function useMySubmissions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-submissions', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('podcast_submissions')
        .select('id, rss_url, title, description, artwork_url, publisher, episode_count, status, admin_notes, submitted_at')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}
