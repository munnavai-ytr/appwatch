import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const FRIENDLY_AI_ERROR = 'AI limit reached, please try again later';

interface GeminiAnalysisPayload {
  summary?: unknown;
  likely_cause?: unknown;
  fix_steps?: unknown;
  where_to_look?: unknown;
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

function extractBearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function parseGeminiJson(rawText: string): GeminiAnalysisPayload | null {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed: unknown = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as GeminiAnalysisPayload;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const supabase = getAdminSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Server database configuration is missing.' },
        { status: 503 }
      );
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const userId = authData.user.id;

    let body: { incident_id?: unknown };
    try {
      body = (await req.json()) as { incident_id?: unknown };
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }

    const incidentId =
      typeof body.incident_id === 'string' ? body.incident_id.trim() : '';
    if (!incidentId) {
      return NextResponse.json({ error: 'Incident ID is required.' }, { status: 400 });
    }

    // Load incident
    const { data: incident, error: incidentError } = await supabase
      .from('incidents')
      .select(
        'id, project_id, title, severity, status, event_count, fingerprint, ai_summary, ai_fix, created_at'
      )
      .eq('id', incidentId)
      .maybeSingle();

    if (incidentError || !incident) {
      return NextResponse.json({ error: 'Incident not found.' }, { status: 404 });
    }

    // Load owning project and verify ownership
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, user_id, name, site_url')
      .eq('id', incident.project_id)
      .maybeSingle();

    if (projectError || !project || project.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    // Return cached analysis without calling Gemini
    if (typeof incident.ai_summary === 'string' && incident.ai_summary.trim().length > 0) {
      return NextResponse.json(
        {
          ai_summary: incident.ai_summary,
          ai_fix: incident.ai_fix ?? '',
          cached: true,
        },
        { status: 200 }
      );
    }

    const geminiApiKey = (process.env.GEMINI_API_KEY || '').trim();
    const geminiModel = (process.env.GEMINI_MODEL || 'gemini-4-hydrogen').trim();

    if (!geminiApiKey) {
      return NextResponse.json({ error: FRIENDLY_AI_ERROR }, { status: 503 });
    }

    // Build context based on incident type
    let contextBlock = '';
    if (incident.fingerprint === 'uptime-down') {
      const { data: recentChecks } = await supabase
        .from('checks')
        .select('is_up, status_code, response_ms, created_at')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(10);

      contextBlock = JSON.stringify(
        {
          incident_type: 'uptime-down',
          project_name: project.name,
          site_url: project.site_url,
          incident_title: incident.title,
          severity: incident.severity,
          recent_checks: recentChecks ?? [],
        },
        null,
        2
      );
    } else {
      const { data: recentEvents } = await supabase
        .from('events')
        .select('message, stack, file, line, page_url, user_agent, created_at')
        .eq('project_id', project.id)
        .eq('fingerprint', incident.fingerprint ?? '')
        .order('created_at', { ascending: false })
        .limit(3);

      contextBlock = JSON.stringify(
        {
          incident_type: 'runtime-error',
          project_name: project.name,
          site_url: project.site_url,
          incident_title: incident.title,
          severity: incident.severity,
          event_count: incident.event_count,
          latest_events: recentEvents ?? [],
        },
        null,
        2
      );
    }

    const prompt = [
      'You are a friendly software debugging assistant helping a beginner developer.',
      'Analyze the monitoring incident data below and explain it clearly in simple Bengali.',
      'Keep code snippets, file names, URLs, HTTP status codes, and technical terms in English.',
      'Return ONLY a valid JSON object with these exact keys:',
      '- "summary": string (short beginner-friendly explanation in simple Bengali)',
      '- "likely_cause": string (most likely root cause in simple Bengali)',
      '- "fix_steps": array of strings (maximum 5 clear actionable steps in simple Bengali)',
      '- "where_to_look": string (specific file, line, server log, or setting to check first, in simple Bengali with English technical names)',
      '',
      'Incident Context:',
      contextBlock,
    ].join('\n');

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      geminiModel
    )}:generateContent`;

    let geminiResponse: Response;
    try {
      geminiResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey,
          'User-Agent': 'aistudio-build',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
          },
        }),
      });
    } catch {
      return NextResponse.json({ error: FRIENDLY_AI_ERROR }, { status: 503 });
    }

    if (geminiResponse.status === 429) {
      return NextResponse.json({ error: FRIENDLY_AI_ERROR }, { status: 429 });
    }

    if (!geminiResponse.ok) {
      return NextResponse.json({ error: FRIENDLY_AI_ERROR }, { status: 502 });
    }

    const geminiData = (await geminiResponse.json().catch(() => null)) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    } | null;

    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const parsed = parseGeminiJson(rawText);

    if (!parsed) {
      return NextResponse.json({ error: FRIENDLY_AI_ERROR }, { status: 502 });
    }

    const summary =
      typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim()
        : '';
    const likelyCause =
      typeof parsed.likely_cause === 'string' && parsed.likely_cause.trim()
        ? parsed.likely_cause.trim()
        : '';
    const fixSteps = Array.isArray(parsed.fix_steps)
      ? parsed.fix_steps
          .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          .slice(0, 5)
      : [];
    const whereToLook =
      typeof parsed.where_to_look === 'string' && parsed.where_to_look.trim()
        ? parsed.where_to_look.trim()
        : '';

    if (!summary) {
      return NextResponse.json({ error: FRIENDLY_AI_ERROR }, { status: 502 });
    }

    const aiSummary = likelyCause
      ? `${summary}\n\nসম্ভাব্য কারণ: ${likelyCause}`
      : summary;

    const numberedSteps = fixSteps
      .map((step, index) => `${index + 1}. ${step.trim()}`)
      .join('\n');

    const aiFix = [
      numberedSteps,
      whereToLook ? `কোথায় দেখবেন: ${whereToLook}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const { error: saveError } = await supabase
      .from('incidents')
      .update({
        ai_summary: aiSummary,
        ai_fix: aiFix,
      })
      .eq('id', incident.id);

    if (saveError) {
      return NextResponse.json(
        { error: 'Could not save AI analysis right now. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ai_summary: aiSummary,
        ai_fix: aiFix,
        cached: false,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: FRIENDLY_AI_ERROR }, { status: 500 });
  }
}
