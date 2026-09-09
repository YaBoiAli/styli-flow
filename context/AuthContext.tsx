import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';
import { syncNotificationUser } from '@/lib/notifications';
import type { Outfit } from '@/types';

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  pendingSaveOutfit: Outfit | null;
  setPendingSaveOutfit: (outfit: Outfit | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const FRIENDLY_AUTH_ERROR = 'Couldn’t sign in. Check your email and password.';

function toFriendlyAuthError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('already') || lower.includes('registered')) {
    return 'An account with that email already exists. Try signing in.';
  }
  if (lower.includes('invalid login') || lower.includes('invalid_grant')) {
    return 'That email or password doesn’t look right.';
  }
  if (lower.includes('password')) {
    return 'Use a password with at least 6 characters.';
  }
  return FRIENDLY_AUTH_ERROR;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingSaveOutfit, setPendingSaveOutfit] = useState<Outfit | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
        setUser(nextSession?.user ?? null);
        setLoading(false);
      },
    );

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    void syncNotificationUser(user?.id ?? null);
  }, [user?.id]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      throw new Error(toFriendlyAuthError(error.message));
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
    });
    if (error) {
      throw new Error(toFriendlyAuthError(error.message));
    }
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await getSupabase().auth.signOut();
    if (error) {
      throw new Error("Couldn't sign out. Try again.");
    }
    setPendingSaveOutfit(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      isAuthenticated: Boolean(user),
      signIn,
      signUp,
      signOut,
      pendingSaveOutfit,
      setPendingSaveOutfit,
    }),
    [
      user,
      session,
      loading,
      signIn,
      signUp,
      signOut,
      pendingSaveOutfit,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
