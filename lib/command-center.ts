import type { AppEvent, Check, Incident, Project } from '@/types/project';

export type ControlMode = 'secure' | 'watch' | 'warning' | 'critical' | 'recovered';
export type TimeTheme = 'day' | 'evening' | 'night';
export type PanelId = 'scene' | 'files' | 'code' | 'terminal';

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  eventCount: number;
  children?: FileTreeNode[];
}

export interface TerminalEntry {
  id: string;
  timestamp: string;
  kind: 'ERROR' | 'CHECK' | 'INCIDENT';
  level: 'ok' | 'info' | 'warn' | 'error';
  projectName: string;
  text: string;
}

export interface ModePalette {
  mode: ControlMode;
  title: string;
  subtitle: string;
  statusLabel: string;
  accentHex: string;
  borderClass: string;
  glowClass: string;
  textClass: string;
  badgeClass: string;
  ringClass: string;
}

export const MODE_PALETTES: Record<ControlMode, ModePalette> = {
  secure: {
    mode: 'secure',
    title: 'All Systems Secure',
    subtitle: '24/7 monitoring is calm across all connected applications.',
    statusLabel: 'Secure',
    accentHex: '#22c55e',
    borderClass: 'border-[#22c55e]/30',
    glowClass: 'shadow-[0_0_38px_-12px_rgba(34,197,94,0.28)]',
    textClass: 'text-[#22c55e]',
    badgeClass: 'bg-[#22c55e]/15 text-[#22c55e] border-[#22c55e]/35',
    ringClass: 'ring-[#00d4ff]/45',
  },
  watch: {
    mode: 'watch',
    title: 'Minor Issue Detected',
    subtitle: 'Low-severity errors logged. Inspect affected files.',
    statusLabel: 'Watch',
    accentHex: '#fbbf24',
    borderClass: 'border-amber-400/35',
    glowClass: 'shadow-[0_0_38px_-12px_rgba(251,191,36,0.32)]',
    textClass: 'text-amber-400',
    badgeClass: 'bg-amber-400/15 text-amber-300 border-amber-400/35',
    ringClass: 'ring-amber-400/50',
  },
  warning: {
    mode: 'warning',
    title: 'Attention Needed',
    subtitle: 'Medium-severity errors repeating. Review the stack trace.',
    statusLabel: 'Warning',
    accentHex: '#f59e0b',
    borderClass: 'border-[#f59e0b]/45',
    glowClass: 'shadow-[0_0_40px_-10px_rgba(245,158,11,0.36)]',
    textClass: 'text-[#f59e0b]',
    badgeClass: 'bg-[#f59e0b]/15 text-[#fcd34d] border-[#f59e0b]/40',
    ringClass: 'ring-[#f59e0b]/55',
  },
  critical: {
    mode: 'critical',
    title: 'Critical Incident',
    subtitle: 'High-severity incident or downtime detected. Live scan active.',
    statusLabel: 'Critical',
    accentHex: '#ef4444',
    borderClass: 'border-[#ef4444]/55',
    glowClass: 'shadow-[0_0_46px_-8px_rgba(239,68,68,0.45)]',
    textClass: 'text-[#ef4444]',
    badgeClass: 'bg-[#ef4444]/15 text-[#fca5a5] border-[#ef4444]/45',
    ringClass: 'ring-[#ef4444]/60',
  },
  recovered: {
    mode: 'recovered',
    title: 'Resolved — Systems Recovered',
    subtitle: 'Incident cleared and monitoring is back to normal.',
    statusLabel: 'Resolved',
    accentHex: '#22c55e',
    borderClass: 'border-[#22c55e]/50',
    glowClass: 'shadow-[0_0_48px_-8px_rgba(34,197,94,0.48)]',
    textClass: 'text-[#22c55e]',
    badgeClass: 'bg-[#22c55e]/20 text-[#86efac] border-[#22c55e]/50',
    ringClass: 'ring-[#22c55e]/60',
  },
};

export interface TimeThemeStyle {
  id: TimeTheme;
  label: string;
  shellBg: string;
  panelBg: string;
  ambientA: string;
  ambientB: string;
  accentText: string;
}

export const TIME_THEMES: Record<TimeTheme, TimeThemeStyle> = {
  day: {
    id: 'day',
    label: 'Day',
    shellBg: 'bg-[#0b152a]/85',
    panelBg: 'bg-[#0f1d38]/70',
    ambientA: 'bg-[#38bdf8]/16',
    ambientB: 'bg-[#00d4ff]/10',
    accentText: 'text-[#38bdf8]',
  },
  evening: {
    id: 'evening',
    label: 'Evening',
    shellBg: 'bg-[#110e26]/85',
    panelBg: 'bg-[#171233]/72',
    ambientA: 'bg-indigo-500/18',
    ambientB: 'bg-fuchsia-500/12',
    accentText: 'text-indigo-300',
  },
  night: {
    id: 'night',
    label: 'Night',
    shellBg: 'bg-[#060913]/90',
    panelBg: 'bg-[#090f1e]/80',
    ambientA: 'bg-[#00d4ff]/14',
    ambientB: 'bg-[#22c55e]/10',
    accentText: 'text-[#00d4ff]',
  },
};

export function getLocalTimeTheme(now: Date = new Date()): TimeTheme {
  const hour = now.getHours();
  if (hour >= 6 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'evening';
  return 'night';
}

/**
 * Single Situation Engine function computing the active control room mode
 * from open incidents, latest per-project checks, and recent recovery state.
 */
export function computeMode(
  openIncidents: Incident[],
  checks: Check[],
  recentlyRecovered = false
): ControlMode {
  // Find latest check per project
  const latestByProject = new Map<string, Check>();
  for (const check of checks) {
    const prev = latestByProject.get(check.project_id);
    if (!prev || Date.parse(check.created_at) > Date.parse(prev.created_at)) {
      latestByProject.set(check.project_id, check);
    }
  }

  for (const check of latestByProject.values()) {
    if (check.is_up === false) {
      return 'critical';
    }
  }

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
  if (highest === 2) return 'warning';
  if (highest === 1) return 'watch';
  if (recentlyRecovered) return 'recovered';
  return 'secure';
}

export function getAutoFocusPanel(mode: ControlMode): PanelId {
  if (mode === 'watch') return 'files';
  if (mode === 'warning') return 'code';
  if (mode === 'critical') return 'terminal';
  return 'scene';
}

export function normalizeEventPath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw.trim();
  if (!cleaned) return null;

  // Strip surrounding parentheses
  cleaned = cleaned.replace(/^\(+/, '').replace(/\)+$/, '').trim();

  // Strip trailing :line:col or :line
  cleaned = cleaned.replace(/:\d+(?::\d+)?$/, '');

  // Strip protocol + origin if URL
  try {
    if (/^https?:\/\//i.test(cleaned)) {
      const url = new URL(cleaned);
      cleaned = url.pathname;
    }
  } catch {
    // Keep as-is if URL parsing fails
  }

  // Strip query strings and hashes
  cleaned = cleaned.split('?')[0].split('#')[0];

  // Normalize slashes and strip leading slashes/dots
  cleaned = cleaned.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');

  if (!cleaned || cleaned === '/' || cleaned.length > 240) return null;
  return cleaned;
}

export function extractPathsFromEvent(event: AppEvent): string[] {
  const found = new Set<string>();
  const direct = normalizeEventPath(event.file);
  if (direct) found.add(direct);

  if (event.stack) {
    const lines = event.stack.split('\n');
    for (const rawLine of lines) {
      // Match Chrome/V8 "(path:line:col)" or "at path:line:col" or Firefox "@path:line:col"
      const match =
        rawLine.match(/\(([^)\s]+?):\d+(?::\d+)?\)/) ||
        rawLine.match(/(?:at\s+|@)([^\s()]+?):\d+(?::\d+)?/);
      if (match?.[1]) {
        const normalized = normalizeEventPath(match[1]);
        if (normalized) found.add(normalized);
      }
    }
  }

  return Array.from(found);
}

export function buildFileTree(events: AppEvent[]): FileTreeNode[] {
  const pathCounts = new Map<string, number>();

  for (const event of events) {
    const paths = extractPathsFromEvent(event);
    for (const p of paths) {
      pathCounts.set(p, (pathCounts.get(p) ?? 0) + 1);
    }
  }

  const rootChildren: FileTreeNode[] = [];

  for (const [fullPath, count] of pathCounts.entries()) {
    const segments = fullPath.split('/').filter(Boolean);
    let currentList = rootChildren;
    let currentPath = '';

    segments.forEach((segment, idx) => {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const isFile = idx === segments.length - 1;

      let node = currentList.find(
        (item) => item.name === segment && item.type === (isFile ? 'file' : 'folder')
      );

      if (!node) {
        node = {
          name: segment,
          path: currentPath,
          type: isFile ? 'file' : 'folder',
          eventCount: 0,
          children: isFile ? undefined : [],
        };
        currentList.push(node);
      }

      if (isFile) {
        node.eventCount += count;
      } else if (node.children) {
        node.eventCount += count;
        currentList = node.children;
      }
    });
  }

  const sortNodes = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children) sortNodes(n.children);
    }
  };

  sortNodes(rootChildren);
  return rootChildren;
}

export function buildTerminalEntries(
  events: AppEvent[],
  checks: Check[],
  incidents: Incident[],
  projectsById: Map<string, Project>
): TerminalEntry[] {
  const entries: TerminalEntry[] = [];

  for (const ev of events) {
    const proj = projectsById.get(ev.project_id)?.name ?? 'Project';
    const loc = normalizeEventPath(ev.file);
    const locSuffix = loc
      ? ` (${loc}${ev.line ? `:${ev.line}` : ''})`
      : '';
    entries.push({
      id: `ev-${ev.id}`,
      timestamp: ev.created_at,
      kind: 'ERROR',
      level: 'error',
      projectName: proj,
      text: `${ev.message}${locSuffix}`,
    });
  }

  for (const ch of checks) {
    const proj = projectsById.get(ch.project_id)?.name ?? 'Project';
    const ms = typeof ch.response_ms === 'number' ? `${ch.response_ms}ms` : 'timeout';
    const status = ch.status_code ? ` HTTP ${ch.status_code}` : '';
    entries.push({
      id: `ch-${ch.id}`,
      timestamp: ch.created_at,
      kind: 'CHECK',
      level: ch.is_up ? 'ok' : 'error',
      projectName: proj,
      text: ch.is_up ? `ok ${ms}${status}` : `down ${ms}${status}`,
    });
  }

  for (const inc of incidents) {
    const proj = projectsById.get(inc.project_id)?.name ?? 'Project';
    const isResolved = inc.status === 'resolved';
    const action = isResolved
      ? 'resolved'
      : inc.event_count >= 5
        ? `escalated (${inc.severity})`
        : `opened (${inc.severity})`;
    entries.push({
      id: `inc-${inc.id}-${inc.status}`,
      timestamp: isResolved && inc.resolved_at ? inc.resolved_at : inc.created_at,
      kind: 'INCIDENT',
      level: isResolved
        ? 'ok'
        : inc.severity === 'high'
          ? 'error'
          : inc.severity === 'medium'
            ? 'warn'
            : 'info',
      projectName: proj,
      text: `${action}: ${inc.title} [x${inc.event_count}]`,
    });
  }

  entries.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return entries.slice(-60);
}

export function getPreviewDataset(mode: ControlMode): {
  projects: Project[];
  incidents: Incident[];
  openIncidents: Incident[];
  events: AppEvent[];
  checks: Check[];
} {
  const now = Date.now();
  const ago = (sec: number) => new Date(now - sec * 1000).toISOString();

  const projects: Project[] = [
    {
      id: 'preview-p1',
      user_id: 'preview',
      name: 'Storefront Web',
      site_url: 'https://shop.example.com',
      api_key: 'wd_preview_storefront',
      created_at: ago(86400 * 5),
    },
    {
      id: 'preview-p2',
      user_id: 'preview',
      name: 'Billing API',
      site_url: 'https://api.example.com',
      api_key: 'wd_preview_billing',
      created_at: ago(86400 * 12),
    },
  ];

  const baseChecks: Check[] = [
    {
      id: 'preview-c1',
      project_id: 'preview-p1',
      is_up: true,
      status_code: 200,
      response_ms: 118,
      created_at: ago(95),
    },
    {
      id: 'preview-c2',
      project_id: 'preview-p2',
      is_up: mode !== 'critical',
      status_code: mode === 'critical' ? 503 : 200,
      response_ms: mode === 'critical' ? 4120 : 142,
      created_at: ago(30),
    },
    {
      id: 'preview-c3',
      project_id: 'preview-p1',
      is_up: true,
      status_code: 200,
      response_ms: 109,
      created_at: ago(12),
    },
  ];

  if (mode === 'secure') {
    return {
      projects,
      incidents: [],
      openIncidents: [],
      events: [],
      checks: baseChecks,
    };
  }

  if (mode === 'recovered') {
    const resolvedIncident: Incident = {
      id: 'preview-inc-resolved',
      project_id: 'preview-p2',
      title: 'Website is down',
      severity: 'high',
      status: 'resolved',
      event_count: 2,
      fingerprint: 'uptime-down',
      resolved_at: ago(4),
      created_at: ago(180),
    };
    return {
      projects,
      incidents: [resolvedIncident],
      openIncidents: [],
      events: [],
      checks: baseChecks,
    };
  }

  const severity =
    mode === 'critical' ? 'high' : mode === 'warning' ? 'medium' : 'low';
  const count = mode === 'critical' ? 24 : mode === 'warning' ? 9 : 2;

  const primaryIncident: Incident = {
    id: `preview-inc-${mode}-1`,
    project_id: 'preview-p1',
    title:
      mode === 'critical'
        ? "TypeError: Cannot read properties of null (reading 'chargeId')"
        : mode === 'warning'
          ? 'UnhandledPromiseRejection: Checkout session request timed out'
          : "ReferenceError: analyticsTracker is not defined",
    severity,
    status: 'open',
    event_count: count,
    fingerprint: `preview-fp-${mode}`,
    created_at: ago(45),
  };

  const secondaryIncident: Incident = {
    id: `preview-inc-${mode}-2`,
    project_id: 'preview-p2',
    title: 'RangeError: Invalid currency format in invoice summary',
    severity: 'low',
    status: 'open',
    event_count: 3,
    fingerprint: 'preview-fp-secondary',
    created_at: ago(240),
  };

  const events: AppEvent[] = [
    {
      id: 'preview-ev-1',
      project_id: 'preview-p1',
      message: primaryIncident.title,
      file:
        mode === 'critical'
          ? 'https://shop.example.com/src/payments/checkout.ts?v=42'
          : mode === 'warning'
            ? 'https://shop.example.com/src/hooks/useSession.ts?t=9'
            : 'https://shop.example.com/src/lib/analytics.js',
      line: mode === 'critical' ? 84 : mode === 'warning' ? 51 : 19,
      column: 22,
      stack:
        mode === 'critical'
          ? "TypeError: Cannot read properties of null (reading 'chargeId')\n    at confirmPayment (https://shop.example.com/src/payments/checkout.ts:84:22)\n    at submitOrder (https://shop.example.com/src/components/OrderForm.tsx:132:11)\n    at onClick (https://shop.example.com/src/app/checkout/page.tsx:48:7)"
          : mode === 'warning'
            ? 'Error: Checkout session request timed out\n    at refreshSession (https://shop.example.com/src/hooks/useSession.ts:51:14)\n    at CheckoutGuard (https://shop.example.com/src/components/CheckoutGuard.tsx:27:5)'
            : 'ReferenceError: analyticsTracker is not defined\n    at trackPageView (https://shop.example.com/src/lib/analytics.js:19:9)\n    at AppShell (https://shop.example.com/src/app/layout.tsx:31:4)',
      page_url: 'https://shop.example.com/checkout',
      user_agent: 'Mozilla/5.0',
      fingerprint: primaryIncident.fingerprint,
      created_at: ago(18),
    },
    {
      id: 'preview-ev-2',
      project_id: 'preview-p2',
      message: secondaryIncident.title,
      file: 'https://api.example.com/src/billing/formatInvoice.ts',
      line: 63,
      column: 12,
      stack:
        'RangeError: Invalid currency format in invoice summary\n    at formatInvoice (https://api.example.com/src/billing/formatInvoice.ts:63:12)\n    at renderReceipt (https://api.example.com/src/billing/receipt.ts:29:8)',
      page_url: 'https://api.example.com/invoices',
      user_agent: 'Mozilla/5.0',
      fingerprint: secondaryIncident.fingerprint,
      created_at: ago(210),
    },
  ];

  const openIncidents =
    mode === 'watch' ? [primaryIncident] : [primaryIncident, secondaryIncident];

  return {
    projects,
    incidents: openIncidents,
    openIncidents,
    events,
    checks: baseChecks,
  };
}
