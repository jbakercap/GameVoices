import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  isLoading: boolean;
  needsOnboarding: boolean;
  setNeedsOnboarding: (value: boolean) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  const clearLocalAuth = async () => {
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Ignore — still clear in-memory state below
    }
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    setNeedsOnboarding(false);
  };

  const validateSessionOrClear = async (nextSession: Session | null) => {
    if (!nextSession?.user) return;
    const { error } = await supabase.auth.getUser();
    if (error) {
      const message = (error as any)?.message ?? '';
      const status = (error as any)?.status;
      const code = (error as any)?.code;
      const isMissingUser =
        status === 403 ||
        code === 'user_not_found' ||
        /user.*does not exist/i.test(message) ||
        /user_not_found/i.test(message);
      if (isMissingUser) {
        await clearLocalAuth();
      }
    }
  };

  const checkOnboarding = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('topic_slugs')
      .eq('user_id', userId)
      .single();
    setNeedsOnboarding(!profile?.topic_slugs || profile.topic_slugs.length === 0);
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(() => {
            validateSessionOrClear(session);
            checkAdminRole(session.user.id);
            checkOnboarding(session.user.id);
          }, 0);
        } else {
          setIsAdmin(false);
          setNeedsOnboarding(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdminRole(session.user.id);
        validateSessionOrClear(session);
        checkOnboarding(session.user.id);
      }
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAdminRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('role', 'admin')
        .maybeSingle();
      if (error) {
        setIsAdmin(false);
      } else {
        setIsAdmin(!!data);
      }
    } catch {
      setIsAdmin(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    // Fire-and-forget welcome email
    if (!error && data?.user?.id) {
      supabase.functions.invoke('send-transactional-email', {
        body: { email_type: 'welcome', user_id: data.user.id }
      }).catch(console.error);
    }
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await clearLocalAuth();
  };

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, isLoading, needsOnboarding, setNeedsOnboarding, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
