import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

interface Speaker {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  credentials: string | null;
  primary_affiliation: string | null;
  photo_url: string | null;
}

interface League {
  id: string;
  name: string;
  short_name: string;
  primary_color: string | null;
  secondary_color: string | null;
}

interface Show {
  id: string;
  title: string;
  artwork_url: string | null;
  publisher: string | null;
  episode_count: number | null;
  league_id?: string | null;
  leagues?: League | null;
}

interface Episode {
  id: string;
  title: string;
  artwork_url: string | null;
  published_at: string | null;
  show_id: string;
  shows: Show | null;
}

export interface PersonAppearances {
  name: string;
  speaker: Speaker | null;
  hostedShows: Show[];
  episodeAppearances: Array<Episode & { role: string }>;
  totalAppearances: number;
  isHost: boolean;
  credentials: string | null;
  affiliation: string | null;
  primaryLeague?: League | null;
}

export function usePersonAppearances(name: string | undefined) {
  return useQuery({
    queryKey: ['person-appearances', name],
    queryFn: async (): Promise<PersonAppearances> => {
      if (!name) {
        return { name: '', speaker: null, hostedShows: [], episodeAppearances: [], totalAppearances: 0, isHost: false, credentials: null, affiliation: null, primaryLeague: null };
      }

      // Try speakers table first
      const { data: speakers } = await supabase
        .from('speakers')
        .select('id, full_name, first_name, last_name, credentials, primary_affiliation, photo_url')
        .ilike('full_name', name)
        .limit(1);

      const speaker = speakers?.[0] || null;

      if (speaker) {
        const { data: showHosts } = await supabase
          .from('show_hosts')
          .select(`show_id, is_primary, shows (id, title, artwork_url, publisher, episode_count, league_id, leagues (id, name, short_name, primary_color, secondary_color))`)
          .eq('speaker_id', speaker.id);

        const hostedShows = (showHosts || []).filter((sh: any) => sh.shows).map((sh: any) => sh.shows as Show);
        const hostedShowIds = hostedShows.map(s => s.id);

        const leagueCounts = new Map<string, { league: League; count: number }>();
        for (const show of hostedShows) {
          if (show.leagues?.id) {
            const entry = leagueCounts.get(show.leagues.id);
            if (entry) entry.count++;
            else leagueCounts.set(show.leagues.id, { league: show.leagues, count: 1 });
          }
        }

        let hostedEpisodes: Array<Episode & { role: string }> = [];
        if (hostedShowIds.length > 0) {
          const { data: eps } = await supabase
            .from('episodes')
            .select(`id, title, artwork_url, published_at, show_id, shows (id, title, artwork_url, publisher, episode_count)`)
            .in('show_id', hostedShowIds)
            .order('published_at', { ascending: false });
          hostedEpisodes = (eps || []).map((ep: any) => ({ ...ep, shows: ep.shows, role: 'host' }));
        }

        const { data: episodeSpeakers } = await supabase
          .from('episode_speakers')
          .select(`episode_id, role, episodes (id, title, artwork_url, published_at, show_id, shows (id, title, artwork_url, publisher, episode_count, league_id, leagues (id, name, short_name, primary_color, secondary_color)))`)
          .eq('speaker_id', speaker.id)
          .order('created_at', { ascending: false })
          .limit(100);

        const guestAppearances = (episodeSpeakers || [])
          .filter((es: any) => es.episodes)
          .filter((es: any) => !hostedShowIds.includes(es.episodes.show_id))
          .map((es: any) => ({ ...es.episodes, shows: es.episodes.shows, role: es.role || 'guest' }));

        const episodeAppearances = [...hostedEpisodes, ...guestAppearances];

        let primaryLeague: League | null = null;
        let maxCount = 0;
        for (const { league, count } of leagueCounts.values()) {
          if (count > maxCount) { maxCount = count; primaryLeague = league; }
        }

        return {
          name: speaker.full_name,
          speaker,
          hostedShows,
          episodeAppearances,
          totalAppearances: hostedShows.length + episodeAppearances.length,
          isHost: hostedShows.length > 0,
          credentials: speaker.credentials,
          affiliation: speaker.primary_affiliation,
          primaryLeague,
        };
      }

      // Fallback: hosts_json search
      const { data: allShows } = await supabase.from('shows').select('id, title, artwork_url, publisher, episode_count, hosts_json').not('hosts_json', 'is', null);
      const hostedShows = (allShows || []).filter((show: any) => {
        const hosts = show.hosts_json;
        if (!hosts || !Array.isArray(hosts)) return false;
        return hosts.some((h: any) => h.name?.toLowerCase() === name.toLowerCase());
      }).map((show: any) => ({ id: show.id, title: show.title, artwork_url: show.artwork_url, publisher: show.publisher, episode_count: show.episode_count }));

      const hostedShowIds = hostedShows.map(s => s.id);
      let hostedEpisodes: Array<Episode & { role: string }> = [];
      if (hostedShowIds.length > 0) {
        const { data: eps } = await supabase
          .from('episodes')
          .select(`id, title, artwork_url, published_at, show_id, shows (id, title, artwork_url, publisher, episode_count)`)
          .in('show_id', hostedShowIds)
          .order('published_at', { ascending: false });
        hostedEpisodes = (eps || []).map((ep: any) => ({ ...ep, role: 'host' }));
      }

      const { data: allEpisodes } = await supabase
        .from('episodes')
        .select('id, title, artwork_url, published_at, show_id, shows(id, title, artwork_url, publisher, episode_count)')
        .not('extracted_tags', 'is', null)
        .order('published_at', { ascending: false })
        .limit(100);

      const guestAppearances = (allEpisodes || []).filter((ep: any) => {
        if (hostedShowIds.includes(ep.show_id)) return false;
        const tags = ep.extracted_tags as { people?: string[] } | null;
        return tags?.people?.some((p: string) => p.toLowerCase() === name.toLowerCase());
      }).map((ep: any) => ({ ...ep, role: 'guest' as const }));

      return {
        name,
        speaker: null,
        hostedShows,
        episodeAppearances: [...hostedEpisodes, ...guestAppearances],
        totalAppearances: hostedShows.length + hostedEpisodes.length + guestAppearances.length,
        isHost: hostedShows.length > 0,
        credentials: null,
        affiliation: null,
        primaryLeague: null,
      };
    },
    enabled: !!name,
    staleTime: 5 * 60 * 1000,
  });
}
