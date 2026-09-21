  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';                                                    
                                                                                                                            
  const corsHeaders = {                                                                                                     
    'Access-Control-Allow-Origin': '*',                                                                                     
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',                                   
  };                                                                                                                        
   
  const MAX_EPISODES_PER_STORY = 10;                                                                                        
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;                                                                                
  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;                                                                         
   
  const MIN_RELEVANCE = 0.2;                                                                                                
                                                                                                                          
  const GAME_KEYWORDS = [                                                                                                   
    'postgame', 'post-game', 'post game',                                                                                 
    'recap', 'highlights', 'highlight',                                                                                     
    'preview', 'breakdown', 'reaction',
    'wrap', 'wrapup', 'wrap-up',                                                                                            
    'debrief', 'review', 'analysis',                                                                                        
    'postgame show', 'game day', 'gameday',
  ];                                                                                                                        
                                                                                                                          
  const EXCLUSION_PATTERNS = [                                                                                              
    'best of',                                                                                                            
    'week in review',
    'top 5', 'top 10', 'top five', 'top ten',                                                                               
    'weekly',                                                                                                               
    'mailbag',                                                                                                              
    'this week',                                                                                                            
    'month in review',                                                                                                    
    'season preview',
    'power rankings',                                                                                                       
  ];
                                                                                                                            
  const SCORE_PATTERN = /\b\d{1,2}[-–]\d{1,2}\b/;                                                                           
   
  function scoreEpisodeTitle(                                                                                               
    title: string,                                                                                                        
    showTeamSlug: string,                                                                                                   
    homeTeamSlug: string,                                                                                                 
    awayTeamSlug: string,                                                                                                   
    teamData: Map<string, { abbreviation: string; short_name: string; name: string }>,
  ): number {                                                                                                               
    const lower = title.toLowerCase();                                                                                      
   
    for (const pat of EXCLUSION_PATTERNS) {                                                                                 
      if (lower.includes(pat)) return 0;                                                                                  
    }

    let score = 0;                                                                                                          
   
    const opponentSlug = showTeamSlug === homeTeamSlug ? awayTeamSlug : homeTeamSlug;                                       
    const opponent = teamData.get(opponentSlug);                                                                          
    if (opponent) {                                                                                                         
      const abbr = (opponent.abbreviation || '').toLowerCase();                                                           
      const shortName = (opponent.short_name || '').toLowerCase();                                                          
      const fullName = (opponent.name || '').toLowerCase();
      if (                                                                                                                  
        (abbr && lower.includes(abbr)) ||                                                                                   
        (shortName && lower.includes(shortName)) ||
        (fullName && lower.includes(fullName))                                                                              
      ) {                                                                                                                   
        score += 0.5;
      }                                                                                                                     
    }                                                                                                                     

    for (const kw of GAME_KEYWORDS) {
      if (lower.includes(kw)) {
        score += 0.3;                                                                                                       
        break;
      }                                                                                                                     
    }                                                                                                                     

    if (SCORE_PATTERN.test(title)) {
      score += 0.2;
    }
                                                                                                                            
    return Math.min(score, 1.0);
  }                                                                                                                         
                                                                                                                          
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }                                                                                                                       
   
    const start = Date.now();                                                                                               
    console.log(`[match-episodes] ▶ STARTUP at ${new Date().toISOString()}`);                                             
                                                                                                                            
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;                                                                      
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;                                                  
    const supabase = createClient(supabaseUrl, supabaseServiceKey);                                                         
                                                                                                                            
    let body: any = {};
    try { body = await req.json(); } catch {}                                                                               
                                                                                                                            
    const backfillDays = body.backfill_days || 2;
    const mode = body.mode || 'incremental';                                                                                
                                                                                                                            
    console.log(`[match-episodes] mode=${mode}, backfill_days=${backfillDays}`);                                            
                                                                                                                            
    try {                                                                                                                   
      const since = new Date();                                                                                           
      since.setDate(since.getDate() - (mode === 'backfill' ? backfillDays : 2));
      since.setUTCHours(0, 0, 0, 0);                                                                                        
   
      const { data: episodes, error: epErr } = await supabase                                                               
        .from('episodes')                                                                                                 
        .select(`                                                                                                           
          id, title, published_at, show_id,                                                                               
          show:shows!inner(id, team_id, status)                                                                             
        `)                                                                                                                  
        .gte('published_at', since.toISOString())                                                                           
        .not('shows.team_id', 'is', null)                                                                                   
        .eq('shows.status', 'active')                                                                                       
        .order('published_at', { ascending: false })
        .limit(500);                                                                                                        
                                                                                                                          
      if (epErr) throw epErr;                                                                                               
      if (!episodes || episodes.length === 0) {
        console.log(`[match-episodes] ■ No episodes to process`);                                                           
        return new Response(JSON.stringify({ success: true, matched: 0, skipped: 0, message: 'No episodes to process',      
  duration_ms: Date.now() - start }),                                                                                       
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });                                             
      }                                                                                                                     
                                                                                                                          
      console.log(`[match-episodes] Processing ${episodes.length} episodes since ${since.toISOString()}`);                  
   
      const teamIds = [...new Set(episodes.map((e: any) => e.show?.team_id).filter(Boolean))];                              
      const { data: showTeams } = await supabase                                                                          
        .from('teams')                                                                                                      
        .select('id, slug')                                                                                               
        .in('id', teamIds);                                                                                                 
      const teamIdToSlug = new Map<string, string>();                                                                     
      for (const t of showTeams || []) teamIdToSlug.set(t.id, t.slug);                                                      
  
      const { data: gameStories, error: storyErr } = await supabase                                                         
        .from('stories')                                                                                                  
        .select('id, headline, team_slugs, event_date, game_id, source_type, expires_at')                                   
        .eq('source_type', 'espn_game')                                                                                     
        .eq('status', 'active')
        .gte('event_date', since.toISOString().slice(0, 10));                                                               
                                                                                                                            
      if (storyErr) throw storyErr;
                                                                                                                            
      const gameIds = [...new Set((gameStories || []).map(s => s.game_id).filter(Boolean))];                                
      const { data: gamesData } = await supabase
        .from('games')                                                                                                      
        .select('id, home_team_slug, away_team_slug, game_time')                                                          
        .in('id', gameIds.length > 0 ? gameIds : ['__none__']);                                                             
      const gameMap = new Map<string, any>();                                                                               
      for (const g of gamesData || []) gameMap.set(g.id, g);                                                                
                                                                                                                            
      const gameSlugs = new Set<string>();                                                                                  
      for (const g of gamesData || []) {
        if (g.home_team_slug) gameSlugs.add(g.home_team_slug);                                                              
        if (g.away_team_slug) gameSlugs.add(g.away_team_slug);                                                              
      }
      const { data: gameTeamsData } = await supabase                                                                        
        .from('teams')                                                                                                      
        .select('slug, abbreviation, short_name, name')
        .in('slug', gameSlugs.size > 0 ? [...gameSlugs] : ['__none__']);                                                    
      const teamSlugData = new Map<string, any>();                                                                          
      for (const t of gameTeamsData || []) teamSlugData.set(t.slug, t);                                                     
                                                                                                                            
      const nextGameCache = new Map<string, number>();                                                                      
      for (const game of gamesData || []) {                                                                               
        if (!game.game_time) continue;                                                                                      
        const { data: nextGames } = await supabase
          .from('games')                                                                                                    
          .select('game_time')                                                                                            
          .gt('game_time', game.game_time)                                                                                  
          .or(`home_team_slug.eq.${game.home_team_slug},away_team_slug.eq.${game.home_team_slug},home_team_slug.eq.${game.away_team_slug},away_team_slug.eq.${game.away_team_slug}`)
          .order('game_time', { ascending: true })
          .limit(1);                                                                                                        
        if (nextGames?.[0]?.game_time) {                                                                                  
          nextGameCache.set(game.id, new Date(nextGames[0].game_time).getTime());                                           
        }
      }                                                                                                                     
                                                                                                                          
      const storyIds = (gameStories || []).map(s => s.id);                                                                  
      const { data: existingLinks } = await supabase
        .from('episode_stories')                                                                                            
        .select('episode_id, story_id, episode:episodes(published_at, show:shows(team_id))')                                
        .in('story_id', storyIds.length > 0 ? storyIds : ['__none__']);                                                     
                                                                                                                            
      let pruned = 0;                                                                                                       
      const storyGameMap = new Map<string, any>();                                                                        
      for (const s of gameStories || []) {                                                                                  
        storyGameMap.set(s.id, s);                                                                                          
      }                                                                                                                     
                                                                                                                            
      for (const link of existingLinks || []) {                                                                           
        const story = storyGameMap.get(link.story_id);
        if (!story?.game_id) continue;
        const game = gameMap.get(story.game_id);                                                                            
        if (!game?.game_time) continue;
                                                                                                                            
        const epPub = (link as any).episode?.published_at;                                                                
        if (!epPub) continue;                                                                                               
        const epMs = new Date(epPub).getTime();                                                                             
        const gameMs = new Date(game.game_time).getTime();
        const windowStart = gameMs + TWO_HOURS_MS;                                                                          
        const maxDeadline = gameMs + FORTY_EIGHT_HOURS_MS;                                                                  
        const nextGameMs = nextGameCache.get(story.game_id);                                                                
        const windowEnd = nextGameMs && nextGameMs < maxDeadline ? nextGameMs : maxDeadline;                                
                                                                                                                            
        if (epMs < windowStart || epMs >= windowEnd) {                                                                      
          const { error: delErr } = await supabase                                                                          
            .from('episode_stories')                                                                                        
            .delete()                                                                                                     
            .eq('episode_id', link.episode_id)
            .eq('story_id', link.story_id);                                                                                 
          if (!delErr) {
            pruned++;                                                                                                       
            console.log(`[match-episodes] Pruned stale link: ep=${link.episode_id} story=${link.story_id}`);              
          }                                                                                                                 
        }
      }                                                                                                                     
      if (pruned > 0) console.log(`[match-episodes] Pruned ${pruned} stale links`);                                       
                                                                                                                            
      const storyEpCount = new Map<string, number>();                                                                       
      const linkedPairs = new Set<string>();                                                                                
      for (const link of existingLinks || []) {                                                                             
        const story = storyGameMap.get(link.story_id);                                                                    
        if (!story?.game_id) continue;                                                                                      
        const game = gameMap.get(story.game_id);
        if (!game?.game_time) continue;                                                                                     
        const epPub = (link as any).episode?.published_at;                                                                
        if (!epPub) continue;                                                                                               
        const epMs = new Date(epPub).getTime();
        const gameMs = new Date(game.game_time).getTime();                                                                  
        const windowStart = gameMs + TWO_HOURS_MS;                                                                          
        const maxDeadline = gameMs + FORTY_EIGHT_HOURS_MS;
        const nextGameMs = nextGameCache.get(story.game_id);                                                                
        const windowEnd = nextGameMs && nextGameMs < maxDeadline ? nextGameMs : maxDeadline;                                
  
        if (epMs >= windowStart && epMs < windowEnd) {                                                                      
          storyEpCount.set(link.story_id, (storyEpCount.get(link.story_id) || 0) + 1);                                    
          linkedPairs.add(`${link.episode_id}:${link.story_id}`);                                                           
        }                                                                                                                   
      }                                                                                                                     
                                                                                                                            
      let matched = 0;                                                                                                    
      let skipped = 0;
      let belowThreshold = 0;                                                                                               
      let alreadyLinked = 0;
      const storiesToUpdate = new Set<string>();                                                                            
      if (pruned > 0) {                                                                                                   
        for (const link of existingLinks || []) {                                                                           
          storiesToUpdate.add(link.story_id);                                                                             
        }                                                                                                                   
      }                                                                                                                   

      for (const ep of episodes) {                                                                                          
        const showTeamId = (ep as any).show?.team_id;
        if (!showTeamId) { skipped++; continue; }                                                                           
        const showTeamSlug = teamIdToSlug.get(showTeamId);                                                                  
        if (!showTeamSlug) { skipped++; continue; }
                                                                                                                            
        const epDate = ep.published_at ? new Date(ep.published_at) : null;                                                
        if (!epDate) { skipped++; continue; }                                                                               
        const epMs = epDate.getTime();                                                                                      
  
        const candidates = (gameStories || []).filter(s => {                                                                
          if (!s.team_slugs?.includes(showTeamSlug)) return false;                                                        
          const game = gameMap.get(s.game_id);                                                                              
          if (!game?.game_time) return false;                                                                               
  
          const gameMs = new Date(game.game_time).getTime();                                                                
          const windowStart = gameMs + TWO_HOURS_MS;                                                                      
          const maxDeadline = gameMs + FORTY_EIGHT_HOURS_MS;                                                                
          const nextGameMs = nextGameCache.get(s.game_id);
          const windowEnd = nextGameMs && nextGameMs < maxDeadline ? nextGameMs : maxDeadline;                              
                                                                                                                            
          return epMs >= windowStart && epMs < windowEnd;
        });                                                                                                                 
                                                                                                                          
        if (candidates.length === 0) { skipped++; continue; }

        let matchedStory: any = null;                                                                                       
        let bestScore = -1;
        let bestProximity = Infinity;                                                                                       
                                                                                                                            
        for (const story of candidates) {
          if (linkedPairs.has(`${ep.id}:${story.id}`)) continue;                                                            
          if ((storyEpCount.get(story.id) || 0) >= MAX_EPISODES_PER_STORY) continue;                                        
  
          const game = gameMap.get(story.game_id);                                                                          
          if (!game?.game_time) continue;                                                                                 
                                                                                                                            
          const titleScore = scoreEpisodeTitle(                                                                           
            ep.title,
            showTeamSlug,
            game.home_team_slug,
            game.away_team_slug,                                                                                            
            teamSlugData,
          );                                                                                                                
                                                                                                                          
          if (titleScore < MIN_RELEVANCE) continue;

          const proximity = epMs - new Date(game.game_time).getTime();                                                      
  
          if (titleScore > bestScore || (titleScore === bestScore && proximity < bestProximity)) {                          
            bestScore = titleScore;                                                                                       
            bestProximity = proximity;                                                                                      
            matchedStory = story;                                                                                         
          }
        }

        if (!matchedStory) {
          if (candidates.some(s => linkedPairs.has(`${ep.id}:${s.id}`))) {
            alreadyLinked++;                                                                                                
          } else {
            belowThreshold++;                                                                                               
            console.log(`[match-episodes] Below threshold: "${ep.title}"`);                                                 
          }
          continue;                                                                                                         
        }                                                                                                                 

        const { error: linkErr } = await supabase                                                                           
          .from('episode_stories')
          .insert({                                                                                                         
            episode_id: ep.id,                                                                                            
            story_id: matchedStory.id,
            relevance: bestScore,
          });                                                                                                               
  
        if (linkErr) {                                                                                                      
          if (linkErr.code === '23505') { alreadyLinked++; continue; }                                                    
          console.error(`[match-episodes] Link error:`, linkErr.message);
          continue;                                                                                                         
        }
                                                                                                                            
        matched++;                                                                                                        
        linkedPairs.add(`${ep.id}:${matchedStory.id}`);
        storyEpCount.set(matchedStory.id, (storyEpCount.get(matchedStory.id) || 0) + 1);                                    
        storiesToUpdate.add(matchedStory.id);                                                                               
        console.log(`[match-episodes] Linked (score=${bestScore.toFixed(2)}): "${ep.title}" → story ${matchedStory.id}`);   
      }                                                                                                                     
                                                                                                                          
      for (const storyId of storiesToUpdate) {                                                                              
        const { data: countData } = await supabase                                                                        
          .from('episode_stories')                                                                                          
          .select('episode:episodes(show_id)', { count: 'exact' })                                                          
          .eq('story_id', storyId);
                                                                                                                            
        const epCount = countData?.length || 0;                                                                           
        const showIds = new Set((countData || []).map((r: any) => r.episode?.show_id).filter(Boolean));                     
                                                                                                                            
        await supabase
          .from('stories')                                                                                                  
          .update({                                                                                                         
            episode_count: epCount,
            show_count: showIds.size,                                                                                       
            updated_at: new Date().toISOString(),                                                                         
          })                                                                                                                
          .eq('id', storyId);
      }                                                                                                                     
                                                                                                                          
      console.log(`[match-episodes] Game pass: ${matched} matched, ${skipped} skipped, ${belowThreshold} below threshold,   
  ${alreadyLinked} already linked`);
                                                                                                                            
      let playerStoryLinks = 0;                                                                                             
      if (storiesToUpdate.size > 0) {
        const updatedStoryIds = [...storiesToUpdate];                                                                       
        const { data: newEpStories } = await supabase                                                                       
          .from('episode_stories')
          .select('episode_id, story_id')                                                                                   
          .in('story_id', updatedStoryIds);                                                                                 
  
        if (newEpStories && newEpStories.length > 0) {                                                                      
          const epIds = [...new Set(newEpStories.map(es => es.episode_id))];                                              
                                                                                                                            
          const { data: playerEps } = await supabase                                                                      
            .from('player_episodes')                                                                                        
            .select('player_id, episode_id')                                                                              
            .in('episode_id', epIds);                                                                                       
  
          if (playerEps && playerEps.length > 0) {                                                                          
            const epToStories = new Map<string, string[]>();                                                              
            for (const es of newEpStories) {                                                                                
              const arr = epToStories.get(es.episode_id) || [];
              arr.push(es.story_id);                                                                                        
              epToStories.set(es.episode_id, arr);                                                                        
            }                                                                                                               
                                                                                                                          
            const psRows: { player_id: string; story_id: string }[] = [];                                                   
            for (const pe of playerEps) {
              const storyIds = epToStories.get(pe.episode_id) || [];                                                        
              for (const sid of storyIds) {                                                                                 
                psRows.push({ player_id: pe.player_id, story_id: sid });
              }                                                                                                             
            }                                                                                                             

            const seen = new Set<string>();                                                                                 
            const uniqueRows = psRows.filter(r => {
              const key = `${r.player_id}:${r.story_id}`;                                                                   
              if (seen.has(key)) return false;                                                                              
              seen.add(key);
              return true;                                                                                                  
            });                                                                                                           

            if (uniqueRows.length > 0) {                                                                                    
              for (let i = 0; i < uniqueRows.length; i += 200) {
                const batch = uniqueRows.slice(i, i + 200);                                                                 
                const { error: psErr } = await supabase                                                                     
                  .from('player_stories')
                  .upsert(batch, { onConflict: 'player_id,story_id', ignoreDuplicates: true });                             
                if (psErr) {                                                                                                
                  console.error(`[match-episodes] player_stories upsert error:`, psErr.message);
                } else {                                                                                                    
                  playerStoryLinks += batch.length;                                                                         
                }
              }                                                                                                             
              console.log(`[match-episodes] Second-pass: linked ${playerStoryLinks} player-story pairs`);                 
            }                                                                                                               
          }
        }                                                                                                                   
      }                                                                                                                   

      const result = {
        success: true,
        episodes_processed: episodes.length,                                                                                
        stale_links_pruned: pruned,
        game_matched: matched,                                                                                              
        game_skipped: skipped,                                                                                              
        game_below_threshold: belowThreshold,
        game_already_linked: alreadyLinked,                                                                                 
        game_stories_updated: storiesToUpdate.size,                                                                       
        player_story_links: playerStoryLinks,                                                                               
        duration_ms: Date.now() - start,
      };                                                                                                                    
                                                                                                                          
      console.log(`[match-episodes] ■ DONE:`, JSON.stringify(result));                                                      
  
      return new Response(JSON.stringify(result),                                                                           
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }                                  
      );                                                                                                                    
    } catch (err) {
      console.error('[match-episodes] ✖ FATAL:', err);                                                                      
      return new Response(                                                                                                  
        JSON.stringify({ success: false, error: String(err), duration_ms: Date.now() - start }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }                                    
      );                                                                                                                    
    }
  });   