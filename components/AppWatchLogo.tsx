'use client';

import { ShieldCheck } from 'lucide-react';

interface AppWatchLogoProps {
  size?: 'sm' | 'md' | 'lg';
}

export default function AppWatchLogo({ size = 'md' }: AppWatchLogoProps) {
  const iconBoxClasses =
    size === 'lg'
      ? 'h-11 w-11 rounded-xl'
      : size === 'sm'
        ? 'h-8 w-8 rounded-lg'
        : 'h-9 w-9 rounded-xl';

  const iconClasses =
    size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  const textClasses =
    size === 'lg'
      ? 'text-2xl font-bold tracking-tight'
      : size === 'sm'
        ? 'text-base font-bold tracking-tight'
        : 'text-lg font-bold tracking-tight';

  return (
    <div className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <div
        className={`${iconBoxClasses} flex items-center justify-center bg-[#00d4ff]/10 border border-[#00d4ff]/35 shadow-[0_0_20px_-4px_rgba(0,212,255,0.45)]`}
      >
        <ShieldCheck className={`${iconClasses} text-[#00d4ff]`} aria-hidden="true" />
      </div>
      <span className={`${textClasses} text-slate-50`}>
        App<span className="text-[#00d4ff]">Watch</span>
      </span>
    </div>
  );
}
