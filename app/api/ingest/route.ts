import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { notifyIncident, severityRank, type NotifyIncident } from '@/lib/notify';

export const runtime = 'nodejs';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

function getAdminSupabaseClient() {
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

function createFingerprint(message: string, file: string, line: number | null): string {
  const normalizedMessage = message
    .replace(/\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const raw = `${normalizedMessage}|${file.trim().toLowerCase()}|${line ?? ''}`;
  return createHash('sha256').update(raw).digest('hex');
}

function severityForCount(count: number): 'low' | 'medium' | 'high' {
  if (count >= 20) return 'high';
  if (count >= 5) return 'medium';
  return 'low';
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    if (!rawBody) {
      return jsonResponse({ error: 'Request body is empty.' }, 400);
    }

    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return jsonResponse({ error: 'Request body must be a JSON object.' }, 400);
      }
      payload = parsed as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: 'Invalid JSON payload.' }, 400);
    }

    const apiKey = typeof payload.api_key === 'string' ? payload.api_key.trim() : '';
    const rawMessage = typeof payload.message === 'string' ? payload.message.trim() : '';

    if (!apiKey || !apiKey.startsWith('wd_')) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    if (!rawMessage) {
      return jsonResponse({ error: 'Error message is required.' }, 400);
    }

    const supabase = getAdminSupabaseClient();
    if (!supabase) {
      return jsonResponse(
        { error: 'Monitoring ingest is not configured on the server yet.' },
        503
      );
    }

    // Look up project by api_key
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id, name, site_url')
      .eq('api_key', apiKey)
      .maybeSingle();

    if (projectError || !project) {
      return jsonResponse({ error: 'Unauthorized.' }, 401);
    }

    // Rate limit: more than 60 events in the last 60 seconds -> 429
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount, error: rateError } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .gte('created_at', oneMinuteAgo);

    if (!rateError && typeof recentCount === 'number' && recentCount > 60) {
      return jsonResponse(
        { error: 'Too many events sent. Please slow down and try again shortly.' },
        429
      );
    }

    const message = rawMessage.slice(0, 500);
    const stack =
      typeof payload.stack === 'string' ? payload.stack.slice(0, 4000) : null;
    const file =
      typeof payload.file === 'string' ? payload.file.slice(0, 500) : '';
    const line =
      typeof payload.line === 'number' && Number.isFinite(payload.line)
        ? Math.trunc(payload.line)
        : null;
    const column =
      typeof payload.column === 'number' && Number.isFinite(payload.column)
        ? Math.trunc(payload.column)
        : null;
    const pageUrl =
      typeof payload.page_url === 'string' ? payload.page_url.slice(0, 2000) : null;
    const userAgent =
      typeof payload.user_agent === 'string'
        ? payload.user_agent.slice(0, 500)
        : req.headers.get('user-agent')?.slice(0, 500) ?? null;

    const fingerprint = createFingerprint(message, file, line);

    // Insert event
    const { error: insertEventError } = await supabase.from('events').insert({
      project_id: project.id,
      message,
      stack,
      file: file || null,
      line,
      column,
      page_url: pageUrl,
      user_agent: userAgent,
      fingerprint,
    });

    if (insertEventError) {
      return jsonResponse({ error: 'Could not save event right now.' }, 500);
    }

    // Upsert open incident for project_id + fingerprint
    const { data: existingIncident, error: incidentLookupError } = await supabase
      .from('incidents')
      .select(
        'id, project_id, title, severity, event_count, notified_severity, notified_at, resolve_notified'
      )
      .eq('project_id', project.id)
      .eq('fingerprint', fingerprint)
      .eq('status', 'open')
      .maybeSingle();

    if (incidentLookupError) {
      return jsonResponse({ error: 'Could not check incidents right now.' }, 500);
    }

    const origin = req.nextUrl.origin;

    if (existingIncident) {
      const nextCount = (existingIncident.event_count ?? 1) + 1;
      const nextSeverity = severityForCount(nextCount);
      const escalated =
        severityRank(nextSeverity) > severityRank(existingIncident.severity);

      const { error: updateIncidentError } = await supabase
        .from('incidents')
        .update({
          event_count: nextCount,
          severity: nextSeverity,
        })
        .eq('id', existingIncident.id);

      if (updateIncidentError) {
        return jsonResponse({ error: 'Could not update incident right now.' }, 500);
      }

      if (escalated) {
        const updatedIncident: NotifyIncident = {
          ...(existingIncident as NotifyIncident),
          event_count: nextCount,
          severity: nextSeverity,
        };
        await notifyIncident(project, updatedIncident, 'escalated', origin);
      }
    } else {
      const { data: insertedIncident, error: insertIncidentError } = await supabase
        .from('incidents')
        .insert({
          project_id: project.id,
          fingerprint,
          title: message.slice(0, 120),
          severity: 'low',
          status: 'open',
          event_count: 1,
        })
        .select(
          'id, project_id, title, severity, event_count, notified_severity, notified_at, resolve_notified'
        )
        .single();

      if (insertIncidentError) {
        return jsonResponse({ error: 'Could not create incident right now.' }, 500);
      }

      if (insertedIncident) {
        await notifyIncident(
          project,
          insertedIncident as NotifyIncident,
          'opened',
          origin
        );
      }
    }

    return jsonResponse({ ok: true }, 200);
  } catch {
    return jsonResponse({ error: 'Something went wrong while recording this event.' }, 500);
  }
}
