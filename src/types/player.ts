export interface FollowedPlayer {
    id: string;
    name: string;
    slug: string;
    headshot_url: string | null;
    team_slug: string | null;
    position: string | null;
    jersey_number: number | null;
    followed_at: string;
    recent_story_count: number;
  }