import { timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
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

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

function isPrivateOrInternalIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT / metadata
  return false;
}

function isPrivateOrInternalIP(rawIp: string): boolean {
  const ip = rawIp.toLowerCase().trim();
  const version = isIP(ip);
  if (version === 4) {
    return isPrivateOrInternalIPv4(ip);
  }
  if (version === 6) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // Unique local & AWS EC2 IPv6 metadata (fd00:ec2::254)
    if (
      ip.startsWith('fe8') ||
      ip.startsWith('fe9') ||
      ip.startsWith('fea') ||
      ip.startsWith('feb')
    ) {
      return true; // Link-local fe80::/10
    }
    if (ip.startsWith('::ffff:')) {
      const mapped = ip.slice(7);
      if (isIP(mapped) === 4) return isPrivateOrInternalIPv4(mapped);
    }
    return false;
  }
  return true;
}

async function isSafePublicUrl(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!host) return false;

  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return false;
  }

  if (isIP(host) !== 0) {
    return !isPrivateOrInternalIP(host);
  }

  try {
    const records = await lookup(host, { all: true });
    if (!records.length) return false;
    for (const record of records) {
      if (isPrivateOrInternalIP(record.address)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
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
  let isUp = false;
  let statusCode: number | null = null;
  let responseMs = 0;

  const safeToFetch = await isSafePublicUrl(project.site_url);

  if (safeToFetch) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
    const startedAt = Date.now();

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
