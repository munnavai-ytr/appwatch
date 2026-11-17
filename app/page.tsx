import AppWatchApp from '@/components/AppWatchApp';

export const dynamic = 'force-dynamic';

export default function HomePage() {
  const supabaseUrl =
    process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  return (
    <AppWatchApp
      supabaseUrl={supabaseUrl}
      supabaseAnonKey={supabaseAnonKey}
    />
  );
}
