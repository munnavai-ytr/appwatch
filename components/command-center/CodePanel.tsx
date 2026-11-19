'use client';

import { Code2 } from 'lucide-react';
import type { AppEvent, Incident } from '@/types/project';
import {
  MODE_PALETTES,
  normalizeEventPath,
  type ControlMode,
  type TimeThemeStyle,
} from '@/lib/command-center';

interface CodePanelProps {
  selectedIncident: Incident | null;
  selectedEvent: AppEvent | null;
  mode: ControlMode;
  timeTheme: TimeThemeStyle;
  loading: boolean;
  isFocused: boolean;
}

function getSeverityAccent(severity?: string | null): string {
  const s = String(severity || 'low').toLowerCase();
  if (s === 'high' || s === 'critical') return '#ef4444';
  if (s === 'medium') return '#f59e0b';
  return '#fbbf24';
}

function formatLocationHeader(event: AppEvent | null): string | null {
  if (!event) return null;
  const cleanFile = normalizeEventPath(event.file);
  if (!cleanFile) return null;
  if (typeof event.line === 'number') {
    if (typeof event.column === 'number') {
      return `${cleanFile}:${event.line}:${event.column}`;
    }
    return `${cleanFile}:${event.line}`;
  }
  return cleanFile;
}

function isStackFrameLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('at ') ||
    /:\d+(?::\d+)?\)?$/.test(trimmed) ||
    /@[^\s]+:\d+/.test(trimmed)
  );
}

export default function CodePanel({
  selectedIncident,
  selectedEvent,
  mode,
  timeTheme,
  loading,
  isFocused,
}: CodePanelProps) {
  const palette = MODE_PALETTES[mode];
  const incidentColor = selectedIncident
    ? getSeverityAccent(selectedIncident.severity)
    : palette.accentHex;

  const locationHeader = formatLocationHeader(selectedEvent);

  const lines: Array<{ text: string; isTopFrame: boolean }> = [];
  if (selectedIncident) {
    const messageLine = selectedEvent?.message || selectedIncident.title;
    lines.push({ text: messageLine, isTopFrame: false });

    const rawStack = selectedEvent?.stack?.trim();
    if (rawStack) {
      const stackLines = rawStack
        .split('\n')
        .map((l) => l.trimEnd())
        .filter((l) => l.trim().length > 0);

      // Avoid duplicating the first line if stack starts with the exact same message
      const startIndex =
        stackLines.length > 0 && stackLines[0].trim() === messageLine.trim()
          ? 1
          : 0;

      let markedTopFrame = false;
      for (let i = startIndex; i < stackLines.length; i++) {
        const current = stackLines[i];
        const isFrame = isStackFrameLine(current);
        const isTopFrame = !markedTopFrame && isFrame;
        if (isTopFrame) markedTopFrame = true;
        lines.push({ text: current, isTopFrame });
      }
    } else if (locationHeader) {
      lines.push({ text: `    at ${locationHeader}`, isTopFrame: true });
    }
  }

  return (
    <div
      className={`rounded-2xl ${timeTheme.panelBg} backdrop-blur-xl border ${
        isFocused ? `${palette.borderClass} ring-1 ${palette.ringClass}` : 'border-white/10'
      } transition-all duration-500 motion-reduce:transition-none p-5 flex flex-col justify-between gap-3 min-h-[260px]`}
    >
      {/* Editor Top Bar */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="h-3.5 w-3.5 text-[#00d4ff] shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold tracking-wide text-slate-300 whitespace-nowrap">
            Code
          </span>
        </div>
        {locationHeader && (
          <span
            className="font-mono text-[11px] truncate max-w-[230px]"
            style={{ color: incidentColor }}
            title={locationHeader}
          >
            {locationHeader}
          </span>
        )}
      </div>

      {/* Code Viewport */}
      <div className="flex-1 rounded-xl bg-[#040711]/90 border border-white/10 overflow-auto max-h-[210px] font-mono text-xs">
        {loading ? (
          <div className="p-3.5 space-y-2 animate-pulse">
            <div className="h-3.5 w-3/4 rounded bg-white/10" />
            <div className="h-3.5 w-5/6 rounded bg-white/5" />
            <div className="h-3.5 w-2/3 rounded bg-white/5" />
          </div>
        ) : !selectedIncident ? (
          <div className="h-full min-h-[140px] flex items-center justify-center px-4 text-center">
            <p className="font-sans text-xs text-slate-400">
              Select an open incident chip above to inspect its error message and stack trace.
            </p>
          </div>
        ) : (
          <div className="py-2">
            {lines.map((line, index) => (
              <div
                key={index}
                style={
                  line.isTopFrame
                    ? {
                        backgroundColor: `${incidentColor}22`,
                        color: incidentColor,
                      }
                    : undefined
                }
                className={`flex items-start gap-3 px-3 py-1 leading-relaxed ${
                  line.isTopFrame ? 'font-semibold' : 'text-slate-300'
                }`}
              >
                <span className="w-5 shrink-0 select-none text-right tabular-nums text-slate-600">
                  {index + 1}
                </span>
                <span className="whitespace-pre-wrap break-all flex-1">
                  {line.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer metadata */}
      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
        <span className="truncate">
          {selectedIncident
            ? `Occurrences: ${selectedIncident.event_count}`
            : 'Ready to inspect stack trace'}
        </span>
        {selectedEvent?.page_url && (
          <span className="font-mono truncate max-w-[180px]" title={selectedEvent.page_url}>
            {selectedEvent.page_url}
          </span>
        )}
      </div>
    </div>
  );
}
