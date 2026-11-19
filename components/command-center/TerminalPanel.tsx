'use client';

import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import {
  MODE_PALETTES,
  type ControlMode,
  type TerminalEntry,
  type TimeThemeStyle,
} from '@/lib/command-center';

interface TerminalPanelProps {
  entries: TerminalEntry[];
  mode: ControlMode;
  timeTheme: TimeThemeStyle;
  loading: boolean;
  isFocused: boolean;
}

function formatClock(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getKindColor(entry: TerminalEntry): string {
  if (entry.level === 'error') return 'text-[#ef4444]';
  if (entry.level === 'warn') return 'text-[#f59e0b]';
  if (entry.level === 'info') return 'text-amber-300';
  return 'text-[#22c55e]';
}

export default function TerminalPanel({
  entries,
  mode,
  timeTheme,
  loading,
  isFocused,
}: TerminalPanelProps) {
  const palette = MODE_PALETTES[mode];
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries.length, mode]);

  return (
    <div
      className={`relative overflow-hidden rounded-2xl ${timeTheme.panelBg} backdrop-blur-xl border ${
        isFocused ? `${palette.borderClass} ring-1 ${palette.ringClass}` : 'border-white/10'
      } transition-all duration-500 motion-reduce:transition-none p-5 flex flex-col justify-between gap-3 min-h-[260px]`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-[#22c55e] shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold tracking-wide text-slate-300">
            Terminal
          </span>
        </div>
        <span className="font-mono text-[11px] tabular-nums text-slate-400">
          {entries.length}/60 lines
        </span>
      </div>

      {/* Live Green Mono Log */}
      <div
        ref={scrollRef}
        className="flex-1 rounded-xl bg-[#03060c]/95 border border-[#22c55e]/20 p-3 overflow-y-auto max-h-[210px] font-mono text-[11px] sm:text-xs leading-relaxed text-[#86efac] space-y-1"
      >
        {loading ? (
          <p className="text-[#22c55e]/70">loading live stream...</p>
        ) : entries.length === 0 ? (
          <p className="text-[#22c55e]/75">
            No events or uptime checks yet. Waiting for incoming activity.
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 break-words">
              <span className="text-slate-500 tabular-nums shrink-0">
                {formatClock(entry.timestamp)}
              </span>
              <span className={`font-semibold shrink-0 ${getKindColor(entry)}`}>
                {entry.kind}
              </span>
              <span className="text-slate-400 shrink-0">[{entry.projectName}]</span>
              <span className="text-[#86efac] min-w-0 flex-1">{entry.text}</span>
            </div>
          ))
        )}

        {/* Prompt line with blinking cursor */}
        <div className="pt-1 flex items-center gap-1.5 text-[#22c55e]">
          <span>
            {mode === 'critical'
              ? 'appwatch@scan:~$ watching critical stream'
              : mode === 'recovered'
                ? 'appwatch@live:~$ incident resolved'
                : 'appwatch@live:~$ listening'}
          </span>
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-1.5 bg-[#22c55e] aw-cursor-blink"
          />
        </div>
      </div>

      {/* Footer note */}
      <p className="text-[11px] text-slate-400">
        Live feed from events, uptime checks, and incidents
      </p>
    </div>
  );
}
