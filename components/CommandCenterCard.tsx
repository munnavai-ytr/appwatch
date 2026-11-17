'use client';

import { motion } from 'motion/react';
import { AlertOctagon, AlertTriangle, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { Incident } from '@/types/project';

interface CommandCenterCardProps {
  projectCount: number;
  openIncidents: Incident[];
  loading: boolean;
}

type CommandMode = 'secure' | 'minor' | 'attention' | 'critical';

interface ModeTheme {
  title: string;
  subtitle: string;
  statusLabel: string;
  cardBorder: string;
  cardShadow: string;
  glowBg: string;
  iconBox: string;
  iconColor: string;
  titleColor: string;
  statusColor: string;
  Icon: typeof ShieldCheck;
}

const MODE_THEMES: Record<CommandMode, ModeTheme> = {
  secure: {
    title: 'All Systems Secure',
    subtitle: '24/7 monitoring standing by across your connected applications.',
    statusLabel: 'Healthy',
    cardBorder: 'border-[#22c55e]/35',
    cardShadow: 'shadow-[0_0_40px_-10px_rgba(34,197,94,0.32)]',
    glowBg: 'bg-[#22c55e]/15',
    iconBox:
      'bg-[#22c55e]/15 border-[#22c55e]/40 shadow-[0_0_24px_-4px_rgba(34,197,94,0.5)]',
    iconColor: 'text-[#22c55e]',
    titleColor: 'text-[#22c55e]',
    statusColor: 'text-[#22c55e]',
    Icon: ShieldCheck,
  },
  minor: {
    title: 'Minor Issue Detected',
    subtitle: 'Low-severity errors were logged in your monitored applications.',
    statusLabel: 'Low',
    cardBorder: 'border-amber-400/35',
    cardShadow: 'shadow-[0_0_40px_-10px_rgba(251,191,36,0.30)]',
    glowBg: 'bg-amber-400/15',
    iconBox:
      'bg-amber-400/15 border-amber-400/40 shadow-[0_0_24px_-4px_rgba(251,191,36,0.45)]',
    iconColor: 'text-amber-400',
    titleColor: 'text-amber-400',
    statusColor: 'text-amber-400',
    Icon: ShieldAlert,
  },
  attention: {
    title: 'Attention Needed',
    subtitle: 'Repeated errors have been detected and should be reviewed soon.',
    statusLabel: 'Medium',
    cardBorder: 'border-[#f59e0b]/40',
    cardShadow: 'shadow-[0_0_40px_-10px_rgba(245,158,11,0.34)]',
    glowBg: 'bg-[#f59e0b]/18',
    iconBox:
      'bg-[#f59e0b]/15 border-[#f59e0b]/45 shadow-[0_0_24px_-4px_rgba(245,158,11,0.5)]',
    iconColor: 'text-[#f59e0b]',
    titleColor: 'text-[#f59e0b]',
    statusColor: 'text-[#f59e0b]',
    Icon: AlertTriangle,
  },
  critical: {
    title: 'Critical Incident',
    subtitle: 'High-severity errors are actively impacting your applications.',
    statusLabel: 'High',
    cardBorder: 'border-[#ef4444]/45',
    cardShadow: 'shadow-[0_0_44px_-10px_rgba(239,68,68,0.40)]',
    glowBg: 'bg-[#ef4444]/20',
    iconBox:
      'bg-[#ef4444]/15 border-[#ef4444]/50 shadow-[0_0_24px_-4px_rgba(239,68,68,0.55)]',
    iconColor: 'text-[#ef4444]',
    titleColor: 'text-[#ef4444]',
    statusColor: 'text-[#ef4444]',
    Icon: AlertOctagon,
  },
};

function resolveMode(openIncidents: Incident[]): CommandMode {
  if (!openIncidents.length) return 'secure';

  let highest = 0;
  for (const incident of openIncidents) {
    const sev = String(incident.severity || 'low').toLowerCase();
    if (sev === 'high' || sev === 'critical') {
      highest = Math.max(highest, 3);
    } else if (sev === 'medium') {
      highest = Math.max(highest, 2);
    } else {
      highest = Math.max(highest, 1);
    }
  }

  if (highest >= 3) return 'critical';
  if (highest === 2) return 'attention';
  return 'minor';
}

export default function CommandCenterCard({
  projectCount,
  openIncidents,
  loading,
}: CommandCenterCardProps) {
  const mode = resolveMode(openIncidents);
  const theme = MODE_THEMES[mode];
  const StatusIcon = theme.Icon;

  return (
    <motion.section
      aria-label="Command Center"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      className={`relative overflow-hidden rounded-2xl bg-[#0b1120]/75 backdrop-blur-xl border ${theme.cardBorder} ${theme.cardShadow} transition-all duration-500 p-6 sm:p-8`}
    >
      {/* Ambient status glow layer */}
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full ${theme.glowBg} blur-[80px] transition-colors duration-500`}
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start sm:items-center gap-4">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-all duration-500 ${theme.iconBox}`}
          >
            <StatusIcon
              className={`h-6 w-6 transition-colors duration-500 ${theme.iconColor}`}
              aria-hidden="true"
            />
          </div>

          <div>
            <p className="text-xs font-medium tracking-wide text-slate-400">
              Command Center
            </p>
            <h1
              className={`mt-1 text-2xl sm:text-3xl font-semibold tracking-tight transition-colors duration-500 ${theme.titleColor}`}
            >
              {theme.title}
            </h1>
            <p className="mt-1 text-sm text-slate-300">{theme.subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6 border-t border-white/10 pt-4 sm:border-t-0 sm:pt-0 sm:border-l sm:pl-6 shrink-0">
          <div>
            <p className="text-xs text-slate-400">Monitored projects</p>
            <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-slate-100">
              {loading ? '—' : projectCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Open incidents</p>
            <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-slate-100">
              {loading ? '—' : openIncidents.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Status</p>
            <p
              className={`mt-0.5 text-sm font-semibold transition-colors duration-500 ${theme.statusColor}`}
            >
              {theme.statusLabel}
            </p>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
