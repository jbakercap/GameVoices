import { supabase } from '../../lib/supabase';

interface NextEpisode {
  id: string;
  title: string;
  audio_url: string;
  artwork_url: string | null;
  duration_seconds: number | null;
  show_id: string;
  shows: {
    title: string;
    teams: { primary_color: string | null } | null;
  } | null;
}

export async function fetchNextEpisode(
  currentEpisodeId: string,
  teamSlugs: string[],
): Promise<NextEpisode | null> {
  if (!teamSlugs.length) return null;

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 1. Resolve team IDs + league IDs from slugs
  const { data: teams } = await supabase
    .from('teams')
    .select('id, league_id')
    .in('slug', teamSlugs);

  if (!teams?.length) return null;

  const teamIds = teams.map((t: any) => t.id);
  const leagueIds = [...new Set(teams.map((t: any) => t.league_id).filter(Boolean))];

  // 2. Try shows from followed teams first
  const { data: teamShows } = await supabase
    .from('shows')
    .select('id')
    .in('team_id', teamIds)
    .eq('status', 'active');

  const teamShowIds = (teamShows || []).map((s: any) => s.id);

  if (teamShowIds.length > 0) {
    const { data: episodes } = await supabase
      .from('episodes')
      .select('id, title, audio_url, artwork_url, duration_seconds, show_id, shows(title, teams(primary_color))')
      .in('show_id', teamShowIds)
      .gte('published_at', cutoff)
      .neq('id', currentEpisodeId)
      .order('published_at', { ascending: false })
      .limit(20);

    if (episodes?.length) {
      return episodes[Math.floor(Math.random() * episodes.length)] as NextEpisode;
    }
  }

  // 3. Fallback: shows from followed leagues
  if (!leagueIds.length) return null;

  const { data: leagueShows } = await supabase
    .from('shows')
    .select('id')
    .in('league_id', leagueIds)
    .eq('status', 'active');

  const leagueShowIds = (leagueShows || []).map((s: any) => s.id);
  if (!leagueShowIds.length) return null;

  const { data: fallbackEpisodes } = await supabase
    .from('episodes')
    .select('id, title, audio_url, artwork_url, duration_seconds, show_id, shows(title, teams(primary_color))')
    .in('show_id', leagueShowIds)
    .gte('published_at', cutoff)
    .neq('id', currentEpisodeId)
    .order('published_at', { ascending: false })
    .limit(20);

  if (fallbackEpisodes?.length) {
    return fallbackEpisodes[Math.floor(Math.random() * fallbackEpisodes.length)] as NextEpisode;
  }

  return null;
}
