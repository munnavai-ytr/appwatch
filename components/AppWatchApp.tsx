'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Loader2 } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase';
import AppWatchLogo from './AppWatchLogo';
import AuthPage from './AuthPage';
import Dashboard from './Dashboard';

interface AppWatchAppProps {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export default function AppWatchApp({
  supabaseUrl,
  supabaseAnonKey,
}: AppWatchAppProps) {
  const supabase = useMemo(
    () => getSupabaseClient(supabaseUrl, supabaseAnonKey),
    [supabaseUrl, supabaseAnonKey]
  );

  const [session, setSession] = useState<Session | null>(null);
  const [checkingSession, setCheckingSession] = useState(() => Boolean(supabase));

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session ?? null);
        setCheckingSession(false);
      })
      .catch(() => {
        if (!active) return;
        setCheckingSession(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession ?? null);
      setCheckingSession(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  if (checkingSession) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#05070f] px-4">
        <AppWatchLogo size="md" />
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-[#00d4ff]" aria-hidden="true" />
          <span>Checking your session...</span>
        </div>
      </div>
    );
  }

  if (!supabase || !session) {
    return <AuthPage supabase={supabase} />;
  }

  return <Dashboard supabase={supabase} user={session.user} />;
}
