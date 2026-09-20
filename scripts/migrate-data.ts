/**
 * Data Migration Script: Lovable Cloud → Own Supabase
 *
 * Reads all data from old project via Edge Function (export-data),
 * then writes to new project using service role key.
 *
 * Usage: npx tsx scripts/migrate-data.ts
 *
 * Re-run safe: uses upsert with ignoreDuplicates, so already-migrated
 * rows are skipped.
 */

import { createClient } from '@supabase/supabase-js';

// Old Lovable Cloud project
const OLD_URL = 'https://mcrgcbbqfnbtfuiypcic.supabase.co';

// New Supabase project
const NEW_URL = 'https://xcxfkuclwhwtvtdfmshv.supabase.co';
const NEW_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjeGZrdWNsd2h3dHZ0ZGZtc2h2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjM5MDI4OCwiZXhwIjoyMDg3OTY2Mjg4fQ.MB-S0jYk9k21SXkXSWXHuG6UOXe0LhFPx1RHzIGnw1U';

const EXPORT_FUNCTION_URL = `${OLD_URL}/functions/v1/export-data`;
const EXPORT_SECRET = 'gamevoices-migrate-2026';

const newSupabase = createClient(NEW_URL, NEW_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Columns to strip from exported data (exist in old DB but not new)
const STRIP_COLUMNS: Record<string, string[]> = {
  stories: ['headline_embedding'],
};

// Tables in FK-safe insertion order
const CONTENT_TABLES = [
  'leagues',
  'teams',
  'games',
  'players',
  'speakers',
  'shows',
  'episodes',
  'stories',
  'show_hosts',
  'episode_speakers',
  'episode_stories',
  'episode_signals',
  'episode_subtopics',
  'episode_downloads',
  'episode_stats',
  'player_stories',
  'x_feed_cache',
];

const USER_TABLES = [
  'profiles',
  'user_roles',
  'user_library',
  'user_listen_history',
  'user_playback',
  'user_queue',
  'playlists',
  'playlist_items',
  'bookmarks',
  'user_follows',
  'friendships',
  'episode_likes',
  'episode_comments',
  'episode_comment_likes',
  'notifications',
  'podcast_claims',
  'podcast_submissions',
];

function cleanRows(table: string, rows: any[]): any[] {
  const cols = STRIP_COLUMNS[table];
  if (!cols) return rows;
  return rows.map((row) => {
    const clean = { ...row };
    for (const col of cols) delete clean[col];
    return clean;
  });
}

// Small pages to avoid Lovable Cloud statement timeouts
const PAGE_SIZES: Record<string, number> = {
  episodes: 50,
  speakers: 50,
  episode_speakers: 50,
  episode_stories: 50,
  episode_signals: 50,
  episode_subtopics: 50,
  episode_downloads: 50,
  episode_stats: 50,
  player_stories: 50,
  games: 100,
  players: 100,
  stories: 100,
};
const DEFAULT_PAGE_SIZE = 200;

async function fetchFromOld(table: string): Promise<any[]> {
  const allRows: any[] = [];
  let offset = 0;
  const pageSize = PAGE_SIZES[table] || DEFAULT_PAGE_SIZE;

  while (true) {
    const url = `${EXPORT_FUNCTION_URL}?table=${table}&offset=${offset}&limit=${pageSize}&order=id&secret=${EXPORT_SECRET}`;
    const res = await fetch(url);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch ${table}: ${res.status} ${text}`);
    }

    const json = await res.json();
    if (json.error) {
      throw new Error(`Error fetching ${table}: ${JSON.stringify(json.error)}`);
    }

    const rows = json.data || [];
    allRows.push(...rows);

    if (rows.length < pageSize) break;
    offset += pageSize;
  }

  return cleanRows(table, allRows);
}

async function fetchAuthUsers(): Promise<any[]> {
  const url = `${EXPORT_FUNCTION_URL}?table=_auth_users&secret=${EXPORT_SECRET}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch auth users: ${res.status} ${text}`);
  }

  const json = await res.json();
  if (json.error) {
    throw new Error(`Error fetching auth users: ${JSON.stringify(json.error)}`);
  }

  return json.data || [];
}

async function insertBatch(table: string, rows: any[]): Promise<void> {
  if (rows.length === 0) return;

  // Insert in batches of 500 to avoid payload limits
  const batchSize = 500;
  let inserted = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await newSupabase.from(table).upsert(batch, {
      onConflict: 'id',
      ignoreDuplicates: true,
    });

    if (error) {
      // Try one-by-one for failed batch
      for (const row of batch) {
        const { error: rowError } = await newSupabase.from(table).upsert(row, {
          onConflict: 'id',
          ignoreDuplicates: true,
        });
        if (rowError) {
          skipped++;
        } else {
          inserted++;
        }
      }
    } else {
      inserted += batch.length;
    }
  }

  if (skipped > 0) {
    console.log(`  ✓ done (${inserted} inserted, ${skipped} skipped)`);
  } else {
    console.log(`  ✓ done (${inserted} rows)`);
  }
}

async function migrateAuthUsers(users: any[]): Promise<void> {
  console.log(`\nMigrating ${users.length} auth users...`);

  for (const user of users) {
    try {
      const { error } = await newSupabase.auth.admin.createUser({
        email: user.email,
        phone: user.phone || undefined,
        email_confirm: true,
        phone_confirm: !!user.phone,
        user_metadata: user.user_metadata || {},
        app_metadata: user.app_metadata || {},
        id: user.id,
      });

      if (error) {
        if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
          console.log(`  User ${user.email} already exists, skipping`);
        } else {
          console.error(`  Error creating user ${user.email}:`, error.message);
        }
      } else {
        console.log(`  Created user: ${user.email}`);
      }
    } catch (err: any) {
      console.error(`  Exception creating user ${user.email}:`, err.message);
    }
  }
}

async function migrateTables(label: string, tables: string[]): Promise<void> {
  console.log(`\n--- ${label} ---`);
  for (const table of tables) {
    try {
      const rows = await fetchFromOld(table);
      console.log(`${table}: ${rows.length} rows`);
      if (rows.length === 0) {
        console.log(`  ✓ empty, skipping`);
        continue;
      }
      await insertBatch(table, rows);
    } catch (err: any) {
      console.error(`  ✗ ${table}: ${err.message}`);
    }
  }
}

async function main() {
  console.log('=== GameVoices Data Migration ===');
  console.log(`From: ${OLD_URL}`);
  console.log(`To:   ${NEW_URL}\n`);

  // Step 1: Migrate auth users first (profiles reference auth.users)
  console.log('--- Step 1: Auth Users ---');
  try {
    const authUsers = await fetchAuthUsers();
    await migrateAuthUsers(authUsers);
  } catch (err: any) {
    console.error('Failed to migrate auth users:', err.message);
    console.log('Continuing with table migration...\n');
  }

  // Step 2: Content tables
  await migrateTables('Step 2: Content Tables', CONTENT_TABLES);

  // Step 3: User tables
  await migrateTables('Step 3: User Tables', USER_TABLES);

  console.log('\n=== Migration Complete ===');
  console.log('NOTE: Users will need to reset their passwords or re-authenticate via OAuth.');
  console.log('REMINDER: Delete the export-data Edge Function on Lovable when done.');
}

main().catch(console.error);
