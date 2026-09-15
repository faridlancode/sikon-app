import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<unknown>;
  logout: () => Promise<void>;
  updateEmail: (newEmail: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function login(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  /**
   * Ganti email login owner TANPA alur konfirmasi email standar Supabase (bypass).
   * Dilakukan lewat RPC `update_owner_email` (SECURITY DEFINER, validasi auth.uid() di server).
   * Setelah berhasil, refresh session lokal supaya `user.email` di UI langsung ter-update.
   */
  async function updateEmail(newEmail: string) {
    const { error } = await supabase.rpc('update_owner_email', { p_new_email: newEmail });
    if (error) throw error;

    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (!refreshError && data.session) {
      setSession(data.session);
    }
  }

  /** Ganti password — jalur standar Supabase, tidak perlu konfirmasi karena user sudah login. */
  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    isAuthenticated: !!session,
    loading,
    login,
    logout,
    updateEmail,
    updatePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  }
  return ctx;
}
