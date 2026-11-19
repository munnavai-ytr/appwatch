'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Code2,
  Eye,
  FolderTree,
  Radar,
  SlidersHorizontal,
  Terminal,
  X,
} from 'lucide-react';
import type { AppEvent, Check, Incident, Project } from '@/types/project';
import {
  buildFileTree,
  buildTerminalEntries,
  computeMode,
  extractPathsFromEvent,
  getAutoFocusPanel,
  getLocalTimeTheme,
  getPreviewDataset,
  MODE_PALETTES,
  normalizeEventPath,
  TIME_THEMES,
  type ControlMode,
  type PanelId,
  type TimeTheme,
} from '@/lib/command-center';
import ScenePanel from './command-center/ScenePanel';
import FilesPanel from './command-center/FilesPanel';
import CodePanel from './command-center/CodePanel';
import TerminalPanel from './command-center/TerminalPanel';

interface CommandCenterCardProps {
  supabase: SupabaseClient;
  projects: Project[];
  openIncidents: Incident[];
  loading: boolean;
}

const PANEL_TABS: Array<{ id: PanelId; label: string; Icon: typeof Radar }> = [
  { id: 'scene', label: 'Scene', Icon: Radar },
  { id: 'files', label: 'Files', Icon: FolderTree },
  { id: 'code', label: 'Code', Icon: Code2 },
  { id: 'terminal', label: 'Terminal', Icon: Terminal },
];

const PREVIEW_MODES: Array<{ id: ControlMode; label: string }> = [
  { id: 'secure', label: 'Secure' },
  { id: 'watch', label: 'Watch' },
  { id: 'warning', label: 'Warning' },
  { id: 'critical', label: 'Critical' },
  { id: 'recovered', label: 'Recovered' },
];

const PREVIEW_TIMES: Array<{ id: TimeTheme; label: string }> = [
  { id: 'day', label: 'Day' },
  { id: 'evening', label: 'Evening' },
  { id: 'night', label: 'Night' },
];

const AUTO_FOCUS_PAUSE_MS = 15_000;
const RECOVERED_DURATION_MS = 8_000;

function getChipSeverityDot(severity?: string | null): string {
  const s = String(severity || 'low').toLowerCase();
  if (s === 'high' || s === 'critical') return 'text-[#ef4444] border-[#ef4444]/40 bg-[#ef4444]/10';
  if (s === 'medium') return 'text-[#f59e0b] border-[#f59e0b]/40 bg-[#f59e0b]/10';
  return 'text-amber-300 border-amber-400/35 bg-amber-400/10';
}

export default function CommandCenterCard({
  supabase,
  projects,
  openIncidents,
  loading,
}: CommandCenterCardProps) {
  // Live telemetry state from Supabase
  const [liveEvents, setLiveEvents] = useState<AppEvent[]>([]);
  const [liveChecks, setLiveChecks] = useState<Check[]>([]);
  const [liveIncidents, setLiveIncidents] = useState<Incident[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);

  // Filters & selection
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  // Mobile tab & desktop focus
  const [activePanel, setActivePanel] = useState<PanelId>('scene');
  const lastInteractionRef = useRef<number>(0);
  const touchStartXRef = useRef<number | null>(null);

  // Recovery celebration state (8 seconds after an incident resolves)
  const [recentlyRecovered, setRecentlyRecovered] = useState(false);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevOpenCountRef = useRef<number>(0);

  // Local time-of-day theme
  const [localTimeTheme, setLocalTimeTheme] = useState<TimeTheme>(() =>
    getLocalTimeTheme()
  );

  // Collapsed Preview control (off by default)
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [previewMode, setPreviewMode] = useState<ControlMode>('secure');
  const [previewTime, setPreviewTime] = useState<TimeTheme>(() =>
    getLocalTimeTheme()
  );

  const markUserInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now();
  }, []);

  const triggerRecoveryWindow = useCallback(() => {
    setRecentlyRecovered(true);
    if (recoveryTimerRef.current) {
      clearTimeout(recoveryTimerRef.current);
    }
    recoveryTimerRef.current = setTimeout(() => {
      setRecentlyRecovered(false);
      recoveryTimerRef.current = null;
    }, RECOVERED_DURATION_MS);
  }, []);

  // Refresh local time theme periodically
  useEffect(() => {
    const id = setInterval(() => {
      setLocalTimeTheme(getLocalTimeTheme());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Cleanup recovery timer on unmount
  useEffect(() => {
    return () => {
      if (recoveryTimerRef.current) {
        clearTimeout(recoveryTimerRef.current);
      }
    };
  }, []);

  // Detect when open incidents drop from >0 to 0
  useEffect(() => {
    if (prevOpenCountRef.current > 0 && openIncidents.length === 0) {
      const timer = setTimeout(() => {
        triggerRecoveryWindow();
      }, 0);
      prevOpenCountRef.current = openIncidents.length;
      return () => clearTimeout(timer);
    }
    prevOpenCountRef.current = openIncidents.length;
  }, [openIncidents.length, triggerRecoveryWindow]);

  const fetchFeedData = useCallback(async () => {
    const [eventsRes, checksRes, incidentsRes] = await Promise.all([
      supabase
        .from('events')
        .select(
          'id, project_id, message, stack, file, line, column, page_url, user_agent, fingerprint, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('checks')
        .select('id, project_id, is_up, status_code, response_ms, created_at')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('incidents')
        .select(
          'id, project_id, title, severity, status, event_count, fingerprint, resolved_at, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (!eventsRes.error && eventsRes.data) {
      setLiveEvents(eventsRes.data as AppEvent[]);
    }
    if (!checksRes.error && checksRes.data) {
      setLiveChecks(checksRes.data as Check[]);
    }
    if (!incidentsRes.error && incidentsRes.data) {
      setLiveIncidents(incidentsRes.data as Incident[]);
    }
    setLoadingFeed(false);
  }, [supabase]);

  // Initial load + Realtime subscriptions on events, incidents, checks
  useEffect(() => {
    let active = true;

    Promise.all([
      supabase
        .from('events')
        .select(
          'id, project_id, message, stack, file, line, column, page_url, user_agent, fingerprint, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('checks')
        .select('id, project_id, is_up, status_code, response_ms, created_at')
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('incidents')
        .select(
          'id, project_id, title, severity, status, event_count, fingerprint, resolved_at, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(30),
    ]).then(([eventsRes, checksRes, incidentsRes]) => {
      if (!active) return;
      if (!eventsRes.error && eventsRes.data) {
        setLiveEvents(eventsRes.data as AppEvent[]);
      }
      if (!checksRes.error && checksRes.data) {
        setLiveChecks(checksRes.data as Check[]);
      }
      if (!incidentsRes.error && incidentsRes.data) {
        setLiveIncidents(incidentsRes.data as Incident[]);
      }
      setLoadingFeed(false);
    });

    const channel = supabase
      .channel('control-room-live-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => {
          if (active) fetchFeedData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'checks' },
        () => {
          if (active) fetchFeedData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'incidents' },
        (payload) => {
          if (!active) return;
          const nextRow = payload.new as { status?: string } | null;
          const oldRow = payload.old as { status?: string } | null;
          if (nextRow?.status === 'resolved' && oldRow?.status !== 'resolved') {
            triggerRecoveryWindow();
          }
          fetchFeedData();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchFeedData, triggerRecoveryWindow]);

  // Effective dataset (either Preview fake data or Live filtered data)
  const previewDataset = useMemo(
    () => (previewEnabled ? getPreviewDataset(previewMode) : null),
    [previewEnabled, previewMode]
  );

  const effectiveProjects = useMemo(
    () => (previewDataset ? previewDataset.projects : projects),
    [previewDataset, projects]
  );

  const validProjectFilter = useMemo(() => {
    if (projectFilter === 'all') return 'all';
    return effectiveProjects.some((p) => p.id === projectFilter)
      ? projectFilter
      : 'all';
  }, [projectFilter, effectiveProjects]);

  const effectiveOpenIncidents = useMemo(() => {
    const base = previewDataset ? previewDataset.openIncidents : openIncidents;
    if (validProjectFilter === 'all') return base;
    return base.filter((i) => i.project_id === validProjectFilter);
  }, [previewDataset, openIncidents, validProjectFilter]);

  const effectiveIncidents = useMemo(() => {
    const base = previewDataset ? previewDataset.incidents : liveIncidents;
    if (validProjectFilter === 'all') return base;
    return base.filter((i) => i.project_id === validProjectFilter);
  }, [previewDataset, liveIncidents, validProjectFilter]);

  const effectiveEvents = useMemo(() => {
    const base = previewDataset ? previewDataset.events : liveEvents;
    if (validProjectFilter === 'all') return base;
    return base.filter((e) => e.project_id === validProjectFilter);
  }, [previewDataset, liveEvents, validProjectFilter]);

  const effectiveChecks = useMemo(() => {
    const base = previewDataset ? previewDataset.checks : liveChecks;
    if (validProjectFilter === 'all') return base;
    return base.filter((c) => c.project_id === validProjectFilter);
  }, [previewDataset, liveChecks, validProjectFilter]);

  const projectsById = useMemo(() => {
    const map = new Map<string, Project>();
    for (const p of effectiveProjects) map.set(p.id, p);
    return map;
  }, [effectiveProjects]);

  // Situation Engine mode & Time Theme
  const activeMode: ControlMode = useMemo(() => {
    if (previewEnabled) return previewMode;
    return computeMode(effectiveOpenIncidents, effectiveChecks, recentlyRecovered);
  }, [previewEnabled, previewMode, effectiveOpenIncidents, effectiveChecks, recentlyRecovered]);

  const activeTimeTheme = TIME_THEMES[previewEnabled ? previewTime : localTimeTheme];
  const palette = MODE_PALETTES[activeMode];

  // Auto-focus panel when mode changes, unless user interacted in the last 15s
  useEffect(() => {
    const targetPanel = getAutoFocusPanel(activeMode);
    const msSinceInteract = Date.now() - lastInteractionRef.current;
    if (!previewEnabled && msSinceInteract < AUTO_FOCUS_PAUSE_MS) {
      return;
    }
    const timer = setTimeout(() => {
      setActivePanel(targetPanel);
    }, 0);
    return () => clearTimeout(timer);
  }, [activeMode, previewEnabled]);

  // Selected incident & matching latest event
  const selectedIncident = useMemo(() => {
    if (!effectiveOpenIncidents.length) return null;
    if (selectedIncidentId) {
      const match = effectiveOpenIncidents.find((i) => i.id === selectedIncidentId);
      if (match) return match;
    }
    return effectiveOpenIncidents[0];
  }, [effectiveOpenIncidents, selectedIncidentId]);

  const selectedEvent = useMemo(() => {
    if (!selectedIncident) return null;
    if (selectedIncident.fingerprint) {
      const exact = effectiveEvents.find(
        (ev) =>
          ev.project_id === selectedIncident.project_id &&
          ev.fingerprint === selectedIncident.fingerprint
      );
      if (exact) return exact;
    }
    return (
      effectiveEvents.find(
        (ev) =>
          ev.project_id === selectedIncident.project_id &&
          ev.message.startsWith(selectedIncident.title.slice(0, 40))
      ) ?? null
    );
  }, [selectedIncident, effectiveEvents]);

  const highlightedFile = useMemo(() => {
    if (!selectedEvent) return null;
    const direct = normalizeEventPath(selectedEvent.file);
    if (direct) return direct;
    const extracted = extractPathsFromEvent(selectedEvent);
    return extracted[0] ?? null;
  }, [selectedEvent]);

  const fileTree = useMemo(() => buildFileTree(effectiveEvents), [effectiveEvents]);

  const terminalEntries = useMemo(
    () =>
      buildTerminalEntries(
        effectiveEvents,
        effectiveChecks,
        effectiveIncidents,
        projectsById
      ),
    [effectiveEvents, effectiveChecks, effectiveIncidents, projectsById]
  );

  // Mobile swipe handlers
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartXRef.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
    const deltaX = endX - touchStartXRef.current;
    touchStartXRef.current = null;

    if (Math.abs(deltaX) < 45) return;
    markUserInteraction();

    const currentIndex = PANEL_TABS.findIndex((t) => t.id === activePanel);
    if (deltaX < 0 && currentIndex < PANEL_TABS.length - 1) {
      setActivePanel(PANEL_TABS[currentIndex + 1].id);
    } else if (deltaX > 0 && currentIndex > 0) {
      setActivePanel(PANEL_TABS[currentIndex - 1].id);
    }
  };

  const handleTabClick = (panelId: PanelId) => {
    markUserInteraction();
    setActivePanel(panelId);
  };

  const handleChipClick = (incidentId: string) => {
    markUserInteraction();
    setSelectedIncidentId(incidentId);
  };

  const isDataLoading = !previewEnabled && (loading || loadingFeed);

  return (
    <section
      aria-label="Command Center Control Room"
      className={`relative overflow-hidden rounded-2xl ${activeTimeTheme.shellBg} backdrop-blur-xl border ${palette.borderClass} ${palette.glowClass} transition-all duration-500 motion-reduce:transition-none p-4 sm:p-6 space-y-4`}
    >
      {/* Critical pulsing outer border overlay */}
      {activeMode === 'critical' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-[#ef4444]/60 motion-safe:animate-pulse"
        />
      )}

      {/* Time-of-day ambient glow */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={`absolute -top-24 -left-20 h-56 w-72 rounded-full ${activeTimeTheme.ambientA} blur-[95px] transition-colors duration-700`}
        />
        <div
          className={`absolute -bottom-24 -right-16 h-56 w-72 rounded-full ${activeTimeTheme.ambientB} blur-[95px] transition-colors duration-700`}
        />
      </div>

      {/* Top Bar: Title, Project Filter, Preview Switch */}
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          <h1 className="text-base sm:text-lg font-semibold tracking-tight text-slate-50 whitespace-nowrap">
            Command Center
          </h1>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <span
            className={`text-xs font-medium whitespace-nowrap ${activeTimeTheme.accentText}`}
          >
            {activeTimeTheme.label} theme
          </span>
          {previewEnabled && (
            <span className="inline-flex items-center gap-1 rounded-md border border-[#00d4ff]/40 bg-[#00d4ff]/15 px-2 py-0.5 text-[11px] font-semibold text-[#00d4ff] whitespace-nowrap">
              <Eye className="h-3 w-3" aria-hidden="true" />
              <span>Preview Mode</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Project Filter */}
          <label className="sr-only" htmlFor="command-center-project-filter">
            Filter by project
          </label>
          <select
            id="command-center-project-filter"
            value={validProjectFilter}
            onChange={(e) => {
              markUserInteraction();
              setProjectFilter(e.target.value);
            }}
            className="min-h-[38px] rounded-xl bg-[#05070f]/80 border border-white/15 px-3 py-1.5 text-xs font-medium text-slate-200 focus:outline-none focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff] max-w-[200px]"
          >
            <option value="all">All projects</option>
            {effectiveProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          {/* Collapsed Preview Control Toggle */}
          <button
            type="button"
            onClick={() => setPreviewExpanded((prev) => !prev)}
            aria-expanded={previewExpanded}
            className={`min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff] ${
              previewEnabled || previewExpanded
                ? 'border-[#00d4ff]/45 bg-[#00d4ff]/15 text-[#00d4ff]'
                : 'border-white/15 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-slate-100'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Preview</span>
          </button>
        </div>
      </div>

      {/* Collapsible Preview Controls Bar */}
      {previewExpanded && (
        <div className="relative rounded-xl bg-[#05070f]/85 border border-[#00d4ff]/30 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-[#00d4ff]">Preview Mode</span>
              <span className="text-slate-400">
                Simulate any status and time theme using sample data.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPreviewEnabled((prev) => !prev);
                  setSelectedIncidentId(null);
                }}
                className={`min-h-[32px] rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  previewEnabled
                    ? 'bg-[#00d4ff] text-[#05070f]'
                    : 'bg-white/10 text-slate-200 hover:bg-white/15'
                }`}
              >
                {previewEnabled ? 'Preview: On' : 'Turn Preview On'}
              </button>
              <button
                type="button"
                onClick={() => setPreviewExpanded(false)}
                aria-label="Collapse preview controls"
                className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/10 cursor-pointer"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 mr-1">Mode:</span>
              {PREVIEW_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setPreviewEnabled(true);
                    setPreviewMode(m.id);
                    setSelectedIncidentId(null);
                  }}
                  className={`min-h-[30px] rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                    previewEnabled && previewMode === m.id
                      ? 'bg-[#00d4ff]/20 border-[#00d4ff]/50 text-[#00d4ff]'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400 mr-1">Time:</span>
              {PREVIEW_TIMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setPreviewEnabled(true);
                    setPreviewTime(t.id);
                  }}
                  className={`min-h-[30px] rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                    previewEnabled && previewTime === t.id
                      ? 'bg-[#00d4ff]/20 border-[#00d4ff]/50 text-[#00d4ff]'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Open Incident Chips Row */}
      {effectiveOpenIncidents.length > 0 && (
        <div className="relative flex items-center gap-2 overflow-x-auto pb-1">
          <span className="text-[11px] font-medium text-slate-400 whitespace-nowrap shrink-0">
            Open incidents:
          </span>
          {effectiveOpenIncidents.slice(0, 8).map((incident) => {
            const isSelected = selectedIncident?.id === incident.id;
            const chipColor = getChipSeverityDot(incident.severity);
            return (
              <button
                key={incident.id}
                type="button"
                onClick={() => handleChipClick(incident.id)}
                className={`min-h-[34px] inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all whitespace-nowrap shrink-0 max-w-[240px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff] ${chipColor} ${
                  isSelected
                    ? 'ring-1 ring-[#00d4ff] brightness-110'
                    : 'opacity-80 hover:opacity-100'
                }`}
                title={incident.title}
              >
                <span className="truncate">{incident.title}</span>
                <span className="font-mono text-[11px] tabular-nums opacity-85 shrink-0">
                  ×{incident.event_count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Mobile Tab Bar (< lg) */}
      <div
        role="tablist"
        aria-label="Control room panels"
        className="relative grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#05070f]/80 border border-white/10 lg:hidden"
      >
        {PANEL_TABS.map(({ id, label, Icon }) => {
          const isActive = activePanel === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleTabClick(id)}
              className={`min-h-[42px] flex items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff] ${
                isActive
                  ? 'bg-[#00d4ff]/15 text-[#00d4ff] border border-[#00d4ff]/35'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Mobile Swipeable Single-Panel Viewport (< lg) */}
      <div
        className="relative lg:hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {activePanel === 'scene' && (
          <ScenePanel
            mode={activeMode}
            timeTheme={activeTimeTheme}
            projectCount={effectiveProjects.length}
            openIncidentCount={effectiveOpenIncidents.length}
            checks={effectiveChecks}
            loading={isDataLoading}
            isFocused
          />
        )}
        {activePanel === 'files' && (
          <FilesPanel
            tree={fileTree}
            highlightedFile={highlightedFile}
            mode={activeMode}
            timeTheme={activeTimeTheme}
            loading={isDataLoading}
            isFocused
            onUserInteract={markUserInteraction}
          />
        )}
        {activePanel === 'code' && (
          <CodePanel
            selectedIncident={selectedIncident}
            selectedEvent={selectedEvent}
            mode={activeMode}
            timeTheme={activeTimeTheme}
            loading={isDataLoading}
            isFocused
          />
        )}
        {activePanel === 'terminal' && (
          <TerminalPanel
            entries={terminalEntries}
            mode={activeMode}
            timeTheme={activeTimeTheme}
            loading={isDataLoading}
            isFocused
          />
        )}
      </div>

      {/* Desktop 2x2 Control Room Grid (lg+) */}
      <div className="relative hidden lg:grid lg:grid-cols-2 gap-4">
        <div onClick={() => handleTabClick('scene')}>
          <ScenePanel
            mode={activeMode}
            timeTheme={activeTimeTheme}
            projectCount={effectiveProjects.length}
            openIncidentCount={effectiveOpenIncidents.length}
            checks={effectiveChecks}
            loading={isDataLoading}
            isFocused={activePanel === 'scene'}
          />
        </div>
        <div onClick={() => handleTabClick('files')}>
          <FilesPanel
            tree={fileTree}
            highlightedFile={highlightedFile}
            mode={activeMode}
            timeTheme={activeTimeTheme}
            loading={isDataLoading}
            isFocused={activePanel === 'files'}
            onUserInteract={markUserInteraction}
          />
        </div>
        <div onClick={() => handleTabClick('code')}>
          <CodePanel
            selectedIncident={selectedIncident}
            selectedEvent={selectedEvent}
            mode={activeMode}
            timeTheme={activeTimeTheme}
            loading={isDataLoading}
            isFocused={activePanel === 'code'}
          />
        </div>
        <div onClick={() => handleTabClick('terminal')}>
          <TerminalPanel
            entries={terminalEntries}
            mode={activeMode}
            timeTheme={activeTimeTheme}
            loading={isDataLoading}
            isFocused={activePanel === 'terminal'}
          />
        </div>
      </div>
    </section>
  );
}
