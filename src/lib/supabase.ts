import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://xcxfkuclwhwtvtdfmshv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjeGZrdWNsd2h3dHZ0ZGZtc2h2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTAyODgsImV4cCI6MjA4Nzk2NjI4OH0._AllRGyAW1EUHgha9XQHEO9osuKomrH9E2Q5jHDx_l0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
