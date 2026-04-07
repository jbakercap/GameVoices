import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface SavedStory {
  id: string;
  headline: string;
  story_type: string;
  team_slugs: string[] | null;
  sport: string | null;
  slug: string | null;
  status: string | null;
  savedAt: string;
}

export function useSavedStories() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['savedStories', user?.id],
    queryFn: async (): Promise<SavedStory[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('user_library')
        .select('id, story_id, created_at')
        .eq('user_id', user.id)
        .eq('item_type', 'story_save')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      const storyIds = (data as any[]).map(d => d.story_id);
      const { data: stories, error: storiesError } = await supabase
        .from('stories')
        .select('id, headline, story_type, team_slugs, sport, slug, status')
        .in('id', storyIds);

      if (storiesError) throw storiesError;

      const storyMap = new Map((stories || []).map(s => [s.id, s]));
      return (data as any[])
        .map(item => {
          const story = storyMap.get(item.story_id);
          if (!story) return null;
          return { ...story, savedAt: item.created_at };
        })
        .filter(Boolean) as SavedStory[];
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}
