import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export function useFollowShow() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ showId, isFollowing }: { showId: string; isFollowing: boolean }) => {
      if (!user) throw new Error('Must be logged in');

      if (isFollowing) {
        const { error } = await supabase
          .from('user_library')
          .delete()
          .eq('user_id', user.id)
          .eq('show_id', showId)
          .eq('item_type', 'follow');
        if (error) throw error;
        return { action: 'unfollowed' as const, teamAdded: null };
      } else {
        const { error } = await supabase
          .from('user_library')
          .insert({ user_id: user.id, show_id: showId, item_type: 'follow' });
        if (error) throw error;

        // Auto-add team to user's favorites if show has a team
        let teamAdded: string | null = null;
        const { data: show } = await supabase
          .from('shows')
          .select('team_id, teams!left(slug, short_name)')
          .eq('id', showId)
          .maybeSingle();

        if (show?.team_id && (show as any).teams) {
          const teamSlug = (show as any).teams.slug;
          const teamName = (show as any).teams.short_name;
          const { data: profile } = await supabase
            .from('profiles')
            .select('topic_slugs')
            .eq('user_id', user.id)
            .maybeSingle();

          const currentSlugs = profile?.topic_slugs || [];
          if (teamSlug && !currentSlugs.includes(teamSlug)) {
            await supabase.from('profiles').update({ topic_slugs: [...currentSlugs, teamSlug] }).eq('user_id', user.id);
            teamAdded = teamName;
          }
        }

        return { action: 'followed' as const, teamAdded };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userLibrary'] });
      queryClient.invalidateQueries({ queryKey: ['show'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['user-teams'] });
    },
    onError: (error) => {
      console.error('Follow show error:', error);
    },
  });
}
