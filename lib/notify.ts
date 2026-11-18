import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';

const TELEGRAM_TIMEOUT_MS = 5_000;
const MAX_ALERTS_PER_PROJECT_PER_HOUR = 10;

export interface NotifyProject {
  id: string;
  user_id: string;
  name: string;
  site_url: string;
}

export interface NotifyIncident {
  id: string;
  project_id: string;
  title: string;
  severity: string;
  event_count: number;
  notified_severity?: string | null;
  notified_at?: string | null;
  resolve_notified?: boolean | null;
}

export type NotifyKind = 'opened' | 'escalated' | 'resolved';

export function getAdminSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = (
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    ''
  ).trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function verifyBearerUser(
  req: NextRequest
): Promise<{ user: User; supabase: SupabaseClient } | { error: string; status: number }> {
  const header = req.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) {
    return { error: 'Unauthorized.', status: 401 };
  }
  const token = header.slice(7).trim();
  if (!token) {
    return { error: 'Unauthorized.', status: 401 };
  }

  const supabase = getAdminSupabaseClient();
  if (!supabase) {
    return { error: 'Server database configuration is missing.', status: 503 };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return { error: 'Unauthorized.', status: 401 };
  }

  return { user: data.user, supabase };
}

export function escapeHtml(input: string): string {
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function severityRank(severity?: string | null): number {
  if (!severity) return 0;
  const s = severity.toLowerCase().trim();
  if (s === 'high' || s === 'critical') return 3;
  if (s === 'medium') return 2;
  if (s === 'low') return 1;
  return 0;
}

export async function sendTelegram(
  chatId: string | number,
  htmlText: string
): Promise<boolean> {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token || !chatId || !htmlText) {
    return false;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        chat_id: String(chatId),
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function resolveDashboardUrl(origin?: string): string {
  const envUrl = (process.env.APP_URL || '').trim();
  if (envUrl && envUrl !== 'MY_APP_URL') {
    return envUrl.replace(/\/$/, '');
  }
  if (origin) {
    return origin.replace(/\/$/, '');
  }
  return '';
}

function buildIncidentMessage(
  project: NotifyProject,
  incident: NotifyIncident,
  kind: NotifyKind,
  origin?: string
): string {
  const sev = (incident.severity || 'low').toLowerCase();

  let icon = '🟡';
  let heading = 'Low Alert';
  if (kind === 'resolved') {
    icon = '✅';
    heading = 'Incident Resolved';
  } else if (sev === 'high' || sev === 'critical') {
    icon = '🔴';
    heading = kind === 'escalated' ? 'Escalated to High' : 'High Alert';
  } else if (sev === 'medium') {
    icon = '🟠';
    heading = kind === 'escalated' ? 'Escalated to Medium' : 'Medium Alert';
  } else {
    icon = '🟡';
    heading = 'Low Alert';
  }

  const lines = [
    `${icon} <b>AppWatch — ${escapeHtml(heading)}</b>`,
    `<b>${escapeHtml(incident.title)}</b>`,
    `Project: ${escapeHtml(project.name)}`,
    `URL: ${escapeHtml(project.site_url)}`,
    `Events: ${escapeHtml(String(incident.event_count ?? 1))}`,
  ];

  const dashboardUrl = resolveDashboardUrl(origin);
  if (dashboardUrl) {
    lines.push(`<a href="${escapeHtml(dashboardUrl)}">Open Dashboard</a>`);
  }

  return lines.join('\n');
}

export async function notifyIncident(
  project: NotifyProject,
  incident: NotifyIncident,
  kind: NotifyKind,
  origin?: string
): Promise<void> {
  try {
    const supabase = getAdminSupabaseClient();
    if (!supabase) return;

    const { data: settings, error: settingsError } = await supabase
      .from('notification_settings')
      .select('telegram_chat_id, alerts_enabled')
      .eq('user_id', project.user_id)
      .maybeSingle();

    if (
      settingsError ||
      !settings ||
      !settings.telegram_chat_id ||
      settings.alerts_enabled === false
    ) {
      return;
    }

    if (kind === 'opened' || kind === 'escalated') {
      const currentRank = severityRank(incident.severity);
      const lastNotifiedRank = severityRank(incident.notified_severity);
      if (currentRank <= lastNotifiedRank) {
        return;
      }

      // Cap at 10 alerts per project per hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count: recentNotifiedCount, error: countError } = await supabase
        .from('incidents')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .gte('notified_at', oneHourAgo);

      if (
        !countError &&
        typeof recentNotifiedCount === 'number' &&
        recentNotifiedCount >= MAX_ALERTS_PER_PROJECT_PER_HOUR
      ) {
        return;
      }
    } else if (kind === 'resolved') {
      const wasNotified = Boolean(incident.notified_severity || incident.notified_at);
      if (!wasNotified || incident.resolve_notified === true) {
        return;
      }
    }

    const htmlText = buildIncidentMessage(project, incident, kind, origin);
    const sent = await sendTelegram(settings.telegram_chat_id, htmlText);
    if (!sent) return;

    const nowIso = new Date().toISOString();
    if (kind === 'resolved') {
      await supabase
        .from('incidents')
        .update({
          resolve_notified: true,
          notified_at: nowIso,
        })
        .eq('id', incident.id);
    } else {
      await supabase
        .from('incidents')
        .update({
          notified_severity: incident.severity,
          notified_at: nowIso,
        })
        .eq('id', incident.id);
    }
  } catch {
    // Never throw from notification helper
  }
}
