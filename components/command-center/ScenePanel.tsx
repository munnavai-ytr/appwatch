'use client';

import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import type { Check } from '@/types/project';
import {
  MODE_PALETTES,
  type ControlMode,
  type TimeThemeStyle,
} from '@/lib/command-center';

interface ScenePanelProps {
  mode: ControlMode;
  timeTheme: TimeThemeStyle;
  projectCount: number;
  openIncidentCount: number;
  checks: Check[];
  loading: boolean;
  isFocused: boolean;
}

function getUptimeSummary(checks: Check[]): {
  label: string;
  detail: string;
} {
  if (!checks.length) {
    return { label: 'Waiting', detail: 'No checks yet' };
  }

  const latestByProject = new Map<string, Check>();
  for (const ch of checks) {
    const prev = latestByProject.get(ch.project_id);
    if (!prev || Date.parse(ch.created_at) > Date.parse(prev.created_at)) {
      latestByProject.set(ch.project_id, ch);
    }
  }

  const latestList = Array.from(latestByProject.values());
  const upCount = latestList.filter((c) => c.is_up).length;
  const responseTimes = latestList
    .map((c) => c.response_ms)
    .filter((ms): ms is number => typeof ms === 'number' && Number.isFinite(ms));

  const avgMs = responseTimes.length
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : null;

  return {
    label: `${upCount}/${latestList.length} up`,
    detail: avgMs !== null ? `${avgMs} ms avg` : 'Uptime active',
  };
}

export default function ScenePanel({
  mode,
  timeTheme,
  projectCount,
  openIncidentCount,
  checks,
  loading,
  isFocused,
}: ScenePanelProps) {
  const palette = MODE_PALETTES[mode];
  const uptime = getUptimeSummary(checks);

  const StatusIcon =
    mode === 'critical'
      ? AlertOctagon
      : mode === 'warning'
        ? AlertTriangle
        : mode === 'watch'
          ? ShieldAlert
          : mode === 'recovered'
            ? CheckCircle2
            : ShieldCheck;

  const spinClass =
    mode === 'critical' ? 'aw-radar-spin-fast' : 'aw-radar-spin';

  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${timeTheme.panelBg} backdrop-blur-xl border ${palette.borderClass} ${
        isFocused ? `ring-1 ${palette.ringClass}` : ''
      } transition-all duration-500 motion-reduce:transition-none p-5 flex flex-col justify-between gap-5 min-h-[260px]`}
    >
      {/* Critical scanning sweep */}
      {mode === 'critical' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-transparent via-[#ef4444]/15 to-transparent aw-scan-sweep"
        />
      )}

      {/* Panel Header */}
      <div className="relative flex items-center justify-between gap-3">
        <span className="text-xs font-semibold tracking-wide text-slate-300">
          Scene
        </span>
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors duration-500 ${palette.badgeClass}`}
        >
          {palette.statusLabel}
        </span>
      </div>

      {/* Animated Shield / Radar Orb */}
      <div className="relative flex flex-col sm:flex-row items-center gap-5">
        <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
          {/* Outer status ring & radar sweep (pure SVG) */}
          <svg
            viewBox="0 0 120 120"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={`radar-grad-${mode}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={palette.accentHex} stopOpacity="0.85" />
                <stop offset="50%" stopColor={palette.accentHex} stopOpacity="0.15" />
                <stop offset="100%" stopColor={palette.accentHex} stopOpacity="0" />
              </linearGradient>
            </defs>
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke={palette.accentHex}
              strokeOpacity="0.22"
              strokeWidth="1.5"
            />
            <circle
              cx="60"
              cy="60"
              r="40"
              fill="none"
              stroke={palette.accentHex}
              strokeOpacity="0.16"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <g className={spinClass} style={{ transformOrigin: '60px 60px' }}>
              <path
                d="M 60 60 L 60 6 A 54 54 0 0 1 108 34 Z"
                fill={`url(#radar-grad-${mode})`}
                opacity="0.35"
              />
              <circle
                cx="60"
                cy="60"
                r="54"
                fill="none"
                stroke={palette.accentHex}
                strokeWidth="2.5"
                strokeDasharray="64 280"
                strokeLinecap="round"
              />
            </g>
          </svg>

          {/* Center Orb */}
          <div
            className={`relative flex h-16 w-16 items-center justify-center rounded-full border transition-all duration-500 motion-reduce:transition-none ${
              mode === 'critical'
                ? 'bg-[#ef4444]/15 border-[#ef4444]/60 motion-safe:animate-pulse'
                : mode === 'recovered'
                  ? 'bg-[#22c55e]/20 border-[#22c55e]/60'
                  : 'bg-[#05070f]/80 border-white/15'
            }`}
            style={{
              boxShadow: `0 0 28px -6px ${palette.accentHex}80`,
            }}
          >
            <StatusIcon
              className={`h-7 w-7 transition-colors duration-500 ${palette.textClass}`}
              aria-hidden="true"
            />
          </div>
        </div>

        <div className="text-center sm:text-left min-w-0 flex-1">
          <h2
            className={`text-xl sm:text-2xl font-semibold tracking-tight transition-colors duration-500 text-balance ${palette.textClass}`}
          >
            {palette.title}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-300 leading-relaxed">
            {palette.subtitle}
          </p>
        </div>
      </div>

      {/* Bottom Stats Strip */}
      <div className="relative grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
        <div className="min-w-0">
          <p className="text-[11px] text-slate-400 truncate">Open incidents</p>
          <p
            className={`mt-0.5 font-mono text-lg sm:text-xl font-semibold tabular-nums ${
              openIncidentCount > 0 ? palette.textClass : 'text-slate-100'
            }`}
          >
            {loading ? '—' : openIncidentCount}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-[11px] text-slate-400 truncate">Projects</p>
          <p className="mt-0.5 font-mono text-lg sm:text-xl font-semibold tabular-nums text-slate-100">
            {loading ? '—' : projectCount}
          </p>
        </div>

        <div className="min-w-0">
          <p className="text-[11px] text-slate-400 truncate">Uptime</p>
          <p className="mt-0.5 font-mono text-sm sm:text-base font-semibold tabular-nums text-slate-100 truncate">
            {loading ? '—' : uptime.label}
          </p>
          {!loading && (
            <p className="font-mono text-[11px] tabular-nums text-slate-400 truncate">
              {uptime.detail}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
