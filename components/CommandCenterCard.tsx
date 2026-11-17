'use client';

import { motion } from 'motion/react';
import { ShieldCheck } from 'lucide-react';

interface CommandCenterCardProps {
  projectCount: number;
  loading: boolean;
}

export default function CommandCenterCard({ projectCount, loading }: CommandCenterCardProps) {
  return (
    <motion.section
      aria-label="Command Center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl bg-[#0b1120]/75 backdrop-blur-xl border border-[#22c55e]/35 shadow-[0_0_40px_-10px_rgba(34,197,94,0.32)] p-6 sm:p-8"
    >
      {/* Ambient green glow layer */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-[#22c55e]/15 blur-[80px]"
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start sm:items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/40 shadow-[0_0_24px_-4px_rgba(34,197,94,0.5)]">
            <ShieldCheck className="h-6 w-6 text-[#22c55e]" aria-hidden="true" />
          </div>

          <div>
            <p className="text-xs font-medium tracking-wide text-slate-400">
              Command Center
            </p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-[#22c55e]">
              All Systems Secure
            </h1>
            <p className="mt-1 text-sm text-slate-300">
              24/7 monitoring standing by across your connected applications.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6 border-t border-white/10 pt-4 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-6 shrink-0">
          <div>
            <p className="text-xs text-slate-400">Monitored projects</p>
            <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-slate-100">
              {loading ? '—' : projectCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Status</p>
            <p className="mt-0.5 text-sm font-semibold text-[#22c55e]">
              Healthy
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
