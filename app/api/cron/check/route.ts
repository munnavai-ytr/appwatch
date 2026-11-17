import { timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const CHECK_TIMEOUT_MS = 8_000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

interface ProjectTarget {
  id: string;
  site_url: string;
}

function isAuthorizedCron(req: NextRequest): boolean {
  const expected = (process.env.CRON_SECRET || '').trim();
  const provided = (req.headers.get('x-cron-secret') || '').trim();
  if (!expected || !provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}

function getAdminSupabaseClient(): SupabaseClient | null {
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

async function checkSingleProject(
  supabase: SupabaseClient,
  project: ProjectTarget
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  const startedAt = Date.now();

  let isUp = false;
  let statusCode: number | null = null;
  let responseMs = 0;

  try {
    const res = await fetch(project.site_url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': 'AppWatch-UptimeMonitor/1.0',
      },
    });
    responseMs = Math.max(0, Date.now() - startedAt);
    statusCode = res.status;
    isUp = res.status >= 200 && res.status <= 399;
  } catch {
    responseMs = Math.max(0, Date.now() - startedAt);
    statusCode = null;
    isUp = false;
  } finally {
    clearTimeout(timer);
  }

  // Record check result
  await supabase.from('checks').insert({
    project_id: project.id,
    is_up: isUp,
    status_code: statusCode,
    response_ms: responseMs,
  });

  // Anti false-alarm incident handling
  if (!isUp) {
    const { data: recentChecks } = await supabase
      .from('checks')
      .select('is_up')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(2);

    const twoConsecutiveDowns =
      Array.isArray(recentChecks) &&
      recentChecks.length >= 2 &&
      recentChecks[0].is_up === false &&
      recentChecks[1].is_up === false;

    if (twoConsecutiveDowns) {
      const { data: existingIncident } = await supabase
        .from('incidents')
        .select('id')
        .eq('project_id', project.id)
        .eq('fingerprint', 'uptime-down')
        .eq('status', 'open')
        .maybeSingle();

      if (!existingIncident) {
        await supabase.from('incidents').insert({
          project_id: project.id,
          fingerprint: 'uptime-down',
          title: 'Website is down',
          severity: 'high',
          status: 'open',
          event_count: 1,
        });
      }
    }
  } else {
    await supabase
      .from('incidents')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      })
      .eq('project_id', project.id)
      .eq('fingerprint', 'uptime-down')
      .eq('status', 'open');
  }

  return true;
}

async function runCronChecks(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const supabase = getAdminSupabaseClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Server database configuration is missing.' },
      { status: 503 }
    );
  }

  try {
    const { data: projects, error: projectsError } = await supabase
      .from('projects')
      .select('id, site_url')
      .not('site_url', 'is', null);

    if (projectsError) {
      return NextResponse.json(
        { error: 'Could not load projects for uptime checks.' },
        { status: 500 }
      );
    }

    const targets: ProjectTarget[] = (projects ?? []).filter(
      (p): p is ProjectTarget =>
        typeof p.site_url === 'string' && p.site_url.trim().length > 0
    );

    const results = await Promise.allSettled(
      targets.map((project) => checkSingleProject(supabase, project))
    );

    const checked = results.filter((r) => r.status === 'fulfilled').length;

    // Cleanup old checks (> 7 days) and old events (> 14 days)
    const checksCutoff = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    const eventsCutoff = new Date(Date.now() - FOURTEEN_DAYS_MS).toISOString();

    await Promise.allSettled([
      supabase.from('checks').delete().lt('created_at', checksCutoff),
      supabase.from('events').delete().lt('created_at', eventsCutoff),
    ]);

    return NextResponse.json({ ok: true, checked }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: 'Something went wrong while running uptime checks.' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return runCronChecks(req);
}

export async function POST(req: NextRequest) {
  return runCronChecks(req);
}
