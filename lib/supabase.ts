import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedSignature = '';

export function getSupabaseClient(url?: string, anonKey?: string): SupabaseClient | null {
  const resolvedUrl = (
    url ||
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim();

  const resolvedAnonKey = (
    anonKey ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  ).trim();

  if (!resolvedUrl || !resolvedAnonKey) {
    return null;
  }

  const signature = `${resolvedUrl}::${resolvedAnonKey}`;
  if (cachedClient && cachedSignature === signature) {
    return cachedClient;
  }

  cachedClient = createClient(resolvedUrl, resolvedAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  cachedSignature = signature;

  return cachedClient;
}

export function formatSimpleError(error: unknown, fallback: string): string {
  if (!error) return fallback;

  const rawMessage =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message: unknown }).message)
          : '';

  const msg = rawMessage.toLowerCase();

  if (!msg) return fallback;
  if (msg.includes('invalid login credentials')) {
    return 'Incorrect email or password. Please check and try again.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please verify your email address using the confirmation link we sent you.';
  }
  if (msg.includes('user already registered') || msg.includes('already been registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (msg.includes('password should be at least')) {
    return 'Your password needs to be at least 6 characters long.';
  }
  if (msg.includes('unable to validate email address') || msg.includes('invalid format')) {
    return 'Please enter a valid email address.';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Too many attempts right now. Please wait a moment and try again.';
  }
  if (msg.includes('row-level security') || msg.includes('permission denied')) {
    return 'You do not have permission to perform this action. Please sign in again.';
  }
  if (msg.includes('failed to fetch') || msg.includes('network')) {
    return 'Could not reach the server. Check your internet connection and try again.';
  }

  return rawMessage;
}
