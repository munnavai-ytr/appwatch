'use client';

import { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Check as CheckIcon,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Loader2,
  Send,
  Sparkles,
  Terminal,
  Trash2,
} from 'lucide-react';
import type { Check, Incident, Project } from '@/types/project';
import { formatSimpleError } from '@/lib/supabase';

interface ProjectCardProps {
  project: Project;
  supabase: SupabaseClient;
  appDomain: string;
  index: number;
  onIncidentActivity?: () => void;
  onDeleted?: (project: Project) => void;
}

function formatTimeAgo(isoDate: string): string {
  const timestamp = Date.parse(isoDate);
  if (Number.isNaN(timestamp)) return '';

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSeconds < 60) return 'Just now';

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

function getSeverityStyle(severity: string): {
  label: string;
  textColor: string;
  countBg: string;
} {
  const normalized = String(severity || 'low').toLowerCase();
  if (normalized === 'high' || normalized === 'critical') {
    return {
      label: 'High',
      textColor: 'text-[#ef4444]',
      countBg: 'bg-[#ef4444]/15 text-[#fca5a5] border-[#ef4444]/35',
    };
  }
  if (normalized === 'medium') {
    return {
      label: 'Medium',
      textColor: 'text-[#f59e0b]',
      countBg: 'bg-[#f59e0b]/15 text-[#fcd34d] border-[#f59e0b]/35',
    };
  }
  return {
    label: 'Low',
    textColor: 'text-amber-400',
    countBg: 'bg-amber-400/15 text-amber-300 border-amber-400/35',
  };
}

function ResponseSparkline({
  checks,
  isUp,
}: {
  checks: Check[];
  isUp: boolean | null;
}) {
  const width = 120;
  const height = 28;
  const padY = 4;

  const ordered = [...checks].reverse();
  const values = ordered.map((c) =>
    typeof c.response_ms === 'number' && Number.isFinite(c.response_ms)
      ? Math.max(0, c.response_ms)
      : 0
  );

  if (values.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-label="No response time history yet"
        className="shrink-0 overflow-visible"
      >
        <line
          x1={2}
          y1={height / 2}
          x2={width - 2}
          y2={height / 2}
          stroke="rgba(148,163,184,0.28)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }

  const strokeColor =
    isUp === false ? '#ef4444' : isUp === true ? '#22c55e' : '#00d4ff';

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = maxVal - minVal;

  const coords = values.map((v, idx) => {
    const x =
      values.length === 1
        ? width / 2
        : 2 + (idx / (values.length - 1)) * (width - 4);
    const ratio = span === 0 ? 0.5 : (v - minVal) / span;
    const y = height - padY - ratio * (height - padY * 2);
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  });

  const pointsAttr = coords.map((p) => `${p.x},${p.y}`).join(' ');
  const lastPoint = coords[coords.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={`Sparkline of last ${values.length} response times`}
      className="shrink-0 overflow-visible"
    >
      {coords.length > 1 ? (
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={pointsAttr}
        />
      ) : (
        <line
          x1={2}
          y1={lastPoint.y}
          x2={width - 2}
          y2={lastPoint.y}
          stroke={strokeColor}
          strokeWidth={1.5}
          strokeOpacity={0.5}
        />
      )}
      <circle cx={lastPoint.x} cy={lastPoint.y} r={2.5} fill={strokeColor} />
    </svg>
  );
}

const INCIDENT_COLUMNS =
  'id, project_id, title, severity, status, event_count, fingerprint, ai_summary, ai_fix, created_at';

export default function ProjectCard({
  project,
  supabase,
  appDomain,
  index,
  onIncidentActivity,
  onDeleted,
}: ProjectCardProps) {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const [checks, setChecks] = useState<Check[]>([]);
  const [loadingChecks, setLoadingChecks] = useState(true);

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loadingIncidents, setLoadingIncidents] = useState(true);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [analysisErrors, setAnalysisErrors] = useState<Record<string, string>>({});
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({});
  const [freshlyAnalyzedIds, setFreshlyAnalyzedIds] = useState<Record<string, boolean>>({});

  const [sendingTest, setSendingTest] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteProject = async () => {
    if (deletingProject) return;
    setDeletingProject(true);
    setDeleteError(null);

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', project.id);

      if (error) {
        setDeleteError(
          formatSimpleError(error, 'Could not delete this project. Please try again.')
        );
        return;
      }

      setShowDeleteModal(false);
      onDeleted?.(project);
    } catch (err) {
      setDeleteError(
        formatSimpleError(err, 'Could not delete this project. Please try again.')
      );
    } finally {
      setDeletingProject(false);
    }
  };

  const apiKeyValue = project.api_key || '';
  const scriptTag = `<script src="${appDomain}/appwatch.js" data-key="${apiKeyValue || 'API_KEY'}"></script>`;

  const loadChecks = useCallback(async () => {
    const { data, error } = await supabase
      .from('checks')
      .select('id, project_id, is_up, status_code, response_ms, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(30);

    if (!error && data) {
      setChecks(data as Check[]);
    }
    setLoadingChecks(false);
  }, [supabase, project.id]);

  const loadIncidents = useCallback(async () => {
    const { data, error } = await supabase
      .from('incidents')
      .select(INCIDENT_COLUMNS)
      .eq('project_id', project.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      setIncidentsError(
        formatSimpleError(error, 'Could not load recent errors right now.')
      );
    } else {
      setIncidents((data ?? []) as Incident[]);
      setIncidentsError(null);
    }
    setLoadingIncidents(false);
  }, [supabase, project.id]);

  useEffect(() => {
    let active = true;

    Promise.all([
      supabase
        .from('checks')
        .select('id, project_id, is_up, status_code, response_ms, created_at')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase
        .from('incidents')
        .select(INCIDENT_COLUMNS)
        .eq('project_id', project.id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(5),
    ]).then(([checksRes, incidentsRes]) => {
      if (!active) return;
      if (!checksRes.error && checksRes.data) {
        setChecks(checksRes.data as Check[]);
      }
      setLoadingChecks(false);

      if (incidentsRes.error) {
        setIncidentsError(
          formatSimpleError(
            incidentsRes.error,
            'Could not load recent errors right now.'
          )
        );
      } else {
        setIncidents((incidentsRes.data ?? []) as Incident[]);
        setIncidentsError(null);
      }
      setLoadingIncidents(false);
    });

    const incidentsChannel = supabase
      .channel(`incidents-project-${project.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incidents',
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          if (!active) return;
          loadIncidents();
          onIncidentActivity?.();
        }
      )
      .subscribe();

    const checksChannel = supabase
      .channel(`checks-project-${project.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'checks',
          filter: `project_id=eq.${project.id}`,
        },
        () => {
          if (!active) return;
          loadChecks();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(incidentsChannel);
      supabase.removeChannel(checksChannel);
    };
  }, [supabase, project.id, loadChecks, loadIncidents, onIncidentActivity]);

  const handleMarkResolved = async (incidentId: string) => {
    if (resolvingId) return;
    setResolvingId(incidentId);
    setIncidentsError(null);

    try {
      const { error } = await supabase
        .from('incidents')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', incidentId);

      if (error) {
        setIncidentsError(
          formatSimpleError(
            error,
            'Could not mark this error as resolved. Please try again.'
          )
        );
        return;
      }

      setIncidents((prev) => prev.filter((item) => item.id !== incidentId));
      onIncidentActivity?.();
    } catch (err) {
      setIncidentsError(
        formatSimpleError(
          err,
          'Could not mark this error as resolved. Please try again.'
        )
      );
    } finally {
      setResolvingId(null);
    }
  };

  const handleExplainWithAI = async (incident: Incident) => {
    if (analyzingId) return;

    // If already analyzed, expand the panel
    if (incident.ai_summary) {
      setCollapsedPanels((prev) => ({ ...prev, [incident.id]: false }));
      return;
    }

    setAnalyzingId(incident.id);
    setAnalysisErrors((prev) => {
      const next = { ...prev };
      delete next[incident.id];
      return next;
    });

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setAnalysisErrors((prev) => ({
          ...prev,
          [incident.id]: 'Please sign in again to use AI analysis.',
        }));
        return;
      }

      const response = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ incident_id: incident.id }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        ai_summary?: string;
        ai_fix?: string;
        cached?: boolean;
        error?: string;
      };

      if (!response.ok || !result.ai_summary) {
        setAnalysisErrors((prev) => ({
          ...prev,
          [incident.id]:
            result.error || 'AI limit reached, please try again later',
        }));
        return;
      }

      setIncidents((prev) =>
        prev.map((item) =>
          item.id === incident.id
            ? {
                ...item,
                ai_summary: result.ai_summary ?? item.ai_summary,
                ai_fix: result.ai_fix ?? item.ai_fix,
              }
            : item
        )
      );

      if (!result.cached) {
        setFreshlyAnalyzedIds((prev) => ({ ...prev, [incident.id]: true }));
      }
      setCollapsedPanels((prev) => ({ ...prev, [incident.id]: false }));
    } catch {
      setAnalysisErrors((prev) => ({
        ...prev,
        [incident.id]: 'AI limit reached, please try again later',
      }));
    } finally {
      setAnalyzingId(null);
    }
  };

  const toggleAnalysisPanel = (incidentId: string) => {
    setCollapsedPanels((prev) => ({
      ...prev,
      [incidentId]: !prev[incidentId],
    }));
  };

  const handleSendTestEvent = async () => {
    if (!apiKeyValue || sendingTest) return;

    setSendingTest(true);
    setTestFeedback(null);
    try {
      const response = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          api_key: apiKeyValue,
          message: `Test error from ${project.name}: Cannot read properties of undefined (reading 'status')`,
          file: '/src/app.js',
          line: 42,
          column: 18,
          stack: `TypeError: Cannot read properties of undefined (reading 'status')\n    at checkHealth (${project.site_url}/src/app.js:42:18)`,
          page_url: project.site_url,
          user_agent:
            typeof navigator !== 'undefined' ? navigator.userAgent : 'AppWatch Test',
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        setTestFeedback({
          type: 'error',
          text:
            typeof result.error === 'string'
              ? result.error
              : 'Could not send the test event. Please try again.',
        });
        return;
      }

      setTestFeedback({
        type: 'success',
        text: 'Test event sent.',
      });
      await loadIncidents();
      onIncidentActivity?.();
      setTimeout(() => setTestFeedback(null), 3000);
    } catch {
      setTestFeedback({
        type: 'error',
        text: 'Could not reach the ingest endpoint. Please check your connection.',
      });
    } finally {
      setSendingTest(false);
    }
  };

  const copyText = async (text: string, target: 'key' | 'script') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (target === 'key') {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 2000);
      }
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      if (target === 'key') {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 2000);
      }
    }
  };

  const formattedDate = project.created_at
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(project.created_at))
    : null;

  const latestCheck = checks[0] ?? null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.22,
        delay: Math.min(index * 0.04, 0.2),
        ease: [0.16, 1, 0.3, 1],
      }}
      className="rounded-2xl bg-[#0b1120]/75 backdrop-blur-xl border border-white/10 hover:border-[#00d4ff]/35 transition-colors p-5 sm:p-6 flex flex-col gap-5 min-w-0"
    >
      {/* Header: Project Name & URL */}
      <div className="flex items-start justify-between gap-4 min-w-0">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-slate-50 truncate">
            {project.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400 min-w-0">
            <a
              href={project.site_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[#00d4ff] hover:underline truncate max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff] rounded"
            >
              <span className="truncate">{project.site_url}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </a>
            {formattedDate && (
              <>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  Added {formattedDate}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Uptime Row */}
      <div className="rounded-xl bg-[#05070f]/75 border border-white/10 px-3.5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0">
          {loadingChecks ? (
            <div className="h-6 w-28 rounded-md bg-white/10 animate-pulse" />
          ) : latestCheck === null ? (
            <span className="inline-flex items-center rounded-md border border-white/15 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-slate-400 whitespace-nowrap">
              Waiting for first check
            </span>
          ) : latestCheck.is_up ? (
            <span className="inline-flex items-center rounded-md border border-[#22c55e]/35 bg-[#22c55e]/15 px-2.5 py-0.5 text-xs font-semibold text-[#22c55e] whitespace-nowrap">
              Up
            </span>
          ) : (
            <span className="inline-flex items-center rounded-md border border-[#ef4444]/40 bg-[#ef4444]/15 px-2.5 py-0.5 text-xs font-semibold text-[#ef4444] whitespace-nowrap">
              Down
            </span>
          )}

          {!loadingChecks && latestCheck && (
            <div className="flex items-center gap-2 text-xs text-slate-400 whitespace-nowrap">
              <span className="font-mono font-medium tabular-nums text-slate-200">
                {typeof latestCheck.response_ms === 'number'
                  ? `${latestCheck.response_ms} ms`
                  : '—'}
              </span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="tabular-nums">
                Checked {formatTimeAgo(latestCheck.created_at)}
              </span>
            </div>
          )}
        </div>

        <ResponseSparkline
          checks={checks}
          isUp={latestCheck ? latestCheck.is_up : null}
        />
      </div>

      {/* Hairline divider */}
      <div className="h-px bg-white/10" aria-hidden="true" />

      {/* API Key Row */}
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-400">API Key</span>
          <button
            type="button"
            onClick={() => copyText(apiKeyValue, 'key')}
            disabled={!apiKeyValue}
            className="inline-flex items-center gap-1.5 min-h-[36px] sm:min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium text-slate-200 bg-white/5 hover:bg-[#00d4ff]/15 hover:text-[#00d4ff] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
          >
            {copiedKey ? (
              <>
                <CheckIcon className="h-3.5 w-3.5 text-[#22c55e]" aria-hidden="true" />
                <span className="text-[#22c55e]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copy key</span>
              </>
            )}
          </button>
        </div>
        <div className="rounded-xl bg-[#05070f]/90 border border-white/10 px-3.5 py-2.5 overflow-x-auto">
          <code className="font-mono text-xs sm:text-[13px] text-slate-200 whitespace-nowrap select-all">
            {apiKeyValue || 'Generating key...'}
          </code>
        </div>
      </div>

      {/* Ready-to-copy Script Tag */}
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-400">Install Script Tag</span>
          <button
            type="button"
            onClick={() => copyText(scriptTag, 'script')}
            className="inline-flex items-center gap-1.5 min-h-[36px] sm:min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium text-slate-200 bg-white/5 hover:bg-[#00d4ff]/15 hover:text-[#00d4ff] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
          >
            {copiedScript ? (
              <>
                <CheckIcon className="h-3.5 w-3.5 text-[#22c55e]" aria-hidden="true" />
                <span className="text-[#22c55e]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copy script</span>
              </>
            )}
          </button>
        </div>
        <div className="rounded-xl bg-[#05070f]/90 border border-white/10 px-3.5 py-2.5 overflow-x-auto">
          <code className="font-mono text-xs text-[#00d4ff]/90 whitespace-nowrap select-all">
            {scriptTag}
          </code>
        </div>
      </div>

      {/* Hairline divider */}
      <div className="h-px bg-white/10" aria-hidden="true" />

      {/* Recent Errors Section */}
      <div className="space-y-3 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-slate-100">Recent Errors</h4>
          <button
            type="button"
            onClick={handleSendTestEvent}
            disabled={!apiKeyValue || sendingTest}
            className="inline-flex items-center justify-center gap-1.5 min-h-[38px] sm:min-h-[34px] px-3.5 py-1.5 rounded-lg text-xs font-medium text-[#00d4ff] bg-[#00d4ff]/10 border border-[#00d4ff]/25 hover:bg-[#00d4ff]/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
          >
            {sendingTest ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Send test event</span>
              </>
            )}
          </button>
        </div>

        {testFeedback && (
          <div
            role={testFeedback.type === 'error' ? 'alert' : 'status'}
            className={`rounded-xl px-3.5 py-2 text-xs flex items-center gap-2 border ${
              testFeedback.type === 'error'
                ? 'bg-[#ef4444]/10 border-[#ef4444]/30 text-[#fca5a5]'
                : 'bg-[#22c55e]/10 border-[#22c55e]/30 text-[#86efac]'
            }`}
          >
            {testFeedback.type === 'error' ? (
              <AlertCircle
                className="h-3.5 w-3.5 shrink-0 text-[#ef4444]"
                aria-hidden="true"
              />
            ) : (
              <CheckIcon
                className="h-3.5 w-3.5 shrink-0 text-[#22c55e]"
                aria-hidden="true"
              />
            )}
            <span>{testFeedback.text}</span>
          </div>
        )}

        {loadingIncidents ? (
          <div className="space-y-2 animate-pulse" aria-label="Loading recent errors">
            <div className="h-11 rounded-xl bg-white/5" />
            <div className="h-11 rounded-xl bg-white/5" />
          </div>
        ) : incidentsError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/25 px-3.5 py-2.5 text-xs text-[#fca5a5]"
          >
            <AlertCircle
              className="h-4 w-4 shrink-0 text-[#ef4444] mt-0.5"
              aria-hidden="true"
            />
            <span>{incidentsError}</span>
          </div>
        ) : incidents.length === 0 ? (
          <p className="rounded-xl bg-[#05070f]/60 border border-white/5 px-4 py-4 text-xs sm:text-sm text-slate-400 text-center">
            No errors yet. Everything looks quiet.
          </p>
        ) : (
          <ul className="divide-y divide-white/10 rounded-xl bg-[#05070f]/65 border border-white/10 overflow-hidden">
            {incidents.map((incident) => {
              const sev = getSeverityStyle(incident.severity);
              const isResolving = resolvingId === incident.id;
              const isAnalyzing = analyzingId === incident.id;
              const hasAnalysis = Boolean(incident.ai_summary);
              const isPanelOpen = !collapsedPanels[incident.id];
              const aiError = analysisErrors[incident.id];
              const isSavedLabel = hasAnalysis && !freshlyAnalyzedIds[incident.id];

              return (
                <li key={incident.id} className="px-3.5 py-3 space-y-2.5 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 min-w-0">
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-xs sm:text-sm font-medium text-slate-100 truncate"
                        title={incident.title}
                      >
                        {incident.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
                        <span className={`font-medium ${sev.textColor}`}>
                          {sev.label}
                        </span>
                        <span aria-hidden="true" className="text-slate-600">
                          ·
                        </span>
                        <span className="tabular-nums whitespace-nowrap">
                          {formatTimeAgo(incident.created_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <span
                        className={`inline-flex items-center justify-center rounded-md border px-2 py-0.5 font-mono text-xs font-medium tabular-nums shrink-0 ${sev.countBg}`}
                        title={`${incident.event_count} occurrences`}
                      >
                        {incident.event_count}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          hasAnalysis
                            ? toggleAnalysisPanel(incident.id)
                            : handleExplainWithAI(incident)
                        }
                        disabled={isAnalyzing}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[34px] sm:min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-medium text-[#00d4ff] bg-[#00d4ff]/10 border border-[#00d4ff]/25 hover:bg-[#00d4ff]/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
                      >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>
                          {hasAnalysis
                            ? isPanelOpen
                              ? 'Hide AI'
                              : 'Explain with AI'
                            : 'Explain with AI'}
                        </span>
                      </button>

                      {incident.status === 'open' && (
                        <button
                          type="button"
                          onClick={() => handleMarkResolved(incident.id)}
                          disabled={isResolving}
                          className="inline-flex items-center justify-center gap-1.5 min-h-[34px] sm:min-h-[30px] px-2.5 py-1 rounded-lg text-xs font-medium text-slate-200 bg-white/5 border border-white/10 hover:bg-[#22c55e]/15 hover:text-[#22c55e] hover:border-[#22c55e]/35 transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
                        >
                          {isResolving ? (
                            <>
                              <Loader2
                                className="h-3.5 w-3.5 animate-spin"
                                aria-hidden="true"
                              />
                              <span>Resolving...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                              <span>Mark resolved</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Terminal-style AI Loading Box */}
                  {isAnalyzing && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="rounded-xl bg-[#03060c] border border-[#22c55e]/30 px-3.5 py-3 font-mono text-xs text-[#22c55e] space-y-1 shadow-[0_0_24px_-10px_rgba(34,197,94,0.35)]"
                    >
                      <div className="flex items-center gap-2">
                        <Terminal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          {incident.fingerprint === 'uptime-down'
                            ? 'analyzing recent uptime checks...'
                            : 'analyzing stack trace...'}
                        </span>
                      </div>
                      <p className="text-[#22c55e]/75 pl-5 animate-pulse">
                        preparing beginner-friendly explanation...
                      </p>
                    </div>
                  )}

                  {/* AI Error Feedback */}
                  {aiError && !isAnalyzing && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/25 px-3 py-2 text-xs text-[#fca5a5]"
                    >
                      <AlertCircle
                        className="h-3.5 w-3.5 shrink-0 text-[#ef4444] mt-0.5"
                        aria-hidden="true"
                      />
                      <span>{aiError}</span>
                    </div>
                  )}

                  {/* Collapsible Glass AI Analysis Panel */}
                  {hasAnalysis && !isAnalyzing && (
                    <div className="rounded-xl bg-[#0b1120]/80 backdrop-blur-md border border-[#00d4ff]/25 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleAnalysisPanel(incident.id)}
                        aria-expanded={isPanelOpen}
                        className="w-full min-h-[38px] px-3.5 py-2 flex items-center justify-between gap-2 text-left hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Sparkles
                            className="h-3.5 w-3.5 text-[#00d4ff] shrink-0"
                            aria-hidden="true"
                          />
                          <span className="text-xs font-semibold text-slate-100 whitespace-nowrap">
                            AI Explanation
                          </span>
                          {isSavedLabel && (
                            <>
                              <span aria-hidden="true" className="text-slate-600">
                                ·
                              </span>
                              <span className="text-xs text-slate-400 whitespace-nowrap">
                                Saved analysis
                              </span>
                            </>
                          )}
                        </div>
                        {isPanelOpen ? (
                          <ChevronUp
                            className="h-4 w-4 text-slate-400 shrink-0"
                            aria-hidden="true"
                          />
                        ) : (
                          <ChevronDown
                            className="h-4 w-4 text-slate-400 shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </button>

                      <AnimatePresence initial={false}>
                        {isPanelOpen && (
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="border-t border-white/10 px-3.5 py-3 space-y-3 text-xs sm:text-[13px] leading-relaxed text-slate-200"
                          >
                            <div className="space-y-1">
                              <p className="text-[11px] font-semibold tracking-wide text-[#00d4ff]">
                                Summary
                              </p>
                              <p className="whitespace-pre-line text-slate-200">
                                {incident.ai_summary}
                              </p>
                            </div>

                            {incident.ai_fix && (
                              <div className="space-y-1 border-t border-white/10 pt-2.5">
                                <p className="text-[11px] font-semibold tracking-wide text-[#22c55e]">
                                  Fix Steps
                                </p>
                                <p className="whitespace-pre-line text-slate-200">
                                  {incident.ai_fix}
                                </p>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Footer: Delete project */}
      <div className="pt-2 border-t border-white/10 flex justify-end">
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setShowDeleteModal(true);
          }}
          className="inline-flex items-center justify-center gap-1.5 min-h-[36px] sm:min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium text-[#fca5a5] bg-transparent border border-[#ef4444]/35 hover:bg-[#ef4444]/15 hover:border-[#ef4444]/60 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef4444]"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Delete project</span>
        </button>
      </div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => {
              if (!deletingProject) setShowDeleteModal(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={`delete-project-title-${project.id}`}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-[#0b1120]/95 backdrop-blur-xl border border-[#ef4444]/35 shadow-[0_0_40px_-10px_rgba(239,68,68,0.4)] p-6 space-y-5"
            >
              <div className="space-y-2">
                <h3
                  id={`delete-project-title-${project.id}`}
                  className="text-lg font-semibold text-slate-50"
                >
                  Delete {project.name}?
                </h3>
                <p className="text-sm leading-relaxed text-slate-300">
                  Delete {project.name}? This permanently removes its API key,
                  errors, incidents and uptime history.
                </p>
              </div>

              {deleteError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 px-3.5 py-2.5 text-xs text-[#fca5a5]"
                >
                  <AlertCircle
                    className="h-4 w-4 shrink-0 text-[#ef4444] mt-0.5"
                    aria-hidden="true"
                  />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deletingProject}
                  className="min-h-[42px] rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteProject}
                  disabled={deletingProject}
                  className="min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#ef4444] px-4 py-2 text-sm font-semibold text-white shadow-[0_0_24px_-6px_rgba(239,68,68,0.6)] hover:bg-[#dc2626] transition-colors whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ef4444]"
                >
                  {deletingProject ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Delete</span>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
}
