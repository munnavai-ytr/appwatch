'use client';

import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import AppWatchLogo from './AppWatchLogo';
import { formatSimpleError } from '@/lib/supabase';

interface AuthPageProps {
  supabase: SupabaseClient | null;
}

type AuthMode = 'signin' | 'signup';

export default function AuthPage({ supabase }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!supabase) {
      setErrorMessage(
        'AppWatch is not connected to Supabase yet. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your environment variables.'
      );
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setErrorMessage('Please choose a password that is at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) {
          setErrorMessage(formatSimpleError(error, 'Could not sign in. Please try again.'));
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (error) {
          setErrorMessage(
            formatSimpleError(error, 'Could not create your account. Please try again.')
          );
        } else if (!data.session) {
          setSuccessMessage(
            'Account created. Check your inbox for a confirmation link before signing in.'
          );
          setMode('signin');
          setPassword('');
        }
      }
    } catch (err) {
      setErrorMessage(formatSimpleError(err, 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col justify-center items-center px-4 py-10 sm:px-6">
      {/* Ambient cyber backdrop glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[420px] w-[720px] rounded-full bg-[#00d4ff]/10 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[320px] w-[420px] rounded-full bg-[#22c55e]/5 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-[440px]"
      >
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <AppWatchLogo size="lg" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-50 text-balance">
            24/7 AI-powered monitoring for developers
          </h1>
          <p className="mt-2.5 text-sm sm:text-base text-slate-400">
            Watch uptime, errors, and live incidents from one secure command center.
          </p>
        </div>

        {/* Auth Glass Card */}
        <div className="rounded-2xl bg-[#0b1120]/75 backdrop-blur-xl border border-[#00d4ff]/20 shadow-[0_0_40px_-12px_rgba(0,212,255,0.2)] p-6 sm:p-8">
          {/* Segmented Mode Toggle */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#05070f]/80 border border-white/10 mb-6"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signin'}
              onClick={() => switchMode('signin')}
              className={`min-h-[44px] rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff] ${
                mode === 'signin'
                  ? 'bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              onClick={() => switchMode('signup')}
              className={`min-h-[44px] rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff] ${
                mode === 'signup'
                  ? 'bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/30'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              Create Account
            </button>
          </div>

          {!supabase && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-xl bg-[#f59e0b]/10 border border-[#f59e0b]/30 px-4 py-3 text-sm text-[#f59e0b]"
            >
              <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
              <p>
                Supabase environment keys are missing. Add{' '}
                <code className="font-mono text-xs text-slate-100">VITE_SUPABASE_URL</code> and{' '}
                <code className="font-mono text-xs text-slate-100">VITE_SUPABASE_ANON_KEY</code> to
                enable login.
              </p>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 px-4 py-3 text-sm text-[#fca5a5]"
            >
              <AlertCircle className="h-5 w-5 shrink-0 text-[#ef4444] mt-0.5" aria-hidden="true" />
              <p>{errorMessage}</p>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="mb-5 flex items-start gap-3 rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/30 px-4 py-3 text-sm text-[#86efac]"
            >
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[#22c55e] mt-0.5" aria-hidden="true" />
              <p>{successMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label
                htmlFor="auth-email"
                className="block text-sm font-medium text-slate-200 mb-1.5"
              >
                Email address
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  disabled={loading}
                  className="w-full min-h-[44px] rounded-xl bg-[#05070f]/80 border border-white/15 pl-10 pr-4 py-2.5 text-base sm:text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:outline-none focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff] disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-sm font-medium text-slate-200 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signin' ? 'Enter your password' : 'At least 6 characters'}
                  disabled={loading}
                  className="w-full min-h-[44px] rounded-xl bg-[#05070f]/80 border border-white/15 pl-10 pr-12 py-2.5 text-base sm:text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:outline-none focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff] disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !supabase}
              className="mt-2 w-full min-h-[46px] flex items-center justify-center gap-2 rounded-xl bg-[#00d4ff] px-5 py-2.5 text-sm font-semibold text-[#05070f] shadow-[0_0_24px_-4px_rgba(0,212,255,0.55)] hover:bg-[#33ddff] active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070f]"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>{mode === 'signin' ? 'Signing in...' : 'Creating account...'}</span>
                </>
              ) : (
                <span>{mode === 'signin' ? 'Sign In to AppWatch' : 'Create Account'}</span>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Protected by Supabase Authentication and Row Level Security
        </p>
      </motion.div>
    </div>
  );
}
