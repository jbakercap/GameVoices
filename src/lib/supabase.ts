import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = 'https://mcrgcbbqfnbtfuiypcic.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jcmdjYmJxZm5idGZ1aXlwY2ljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MzUzODcsImV4cCI6MjA4NTMxMTM4N30.e-HPHYYIFAro5XV6Y2lOH0lW0r4O5Vyjg2yUPCOWy4M';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
