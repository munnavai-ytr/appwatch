import { NextRequest, NextResponse } from 'next/server';
import { escapeHtml, sendTelegram, verifyBearerUser } from '@/lib/notify';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyBearerUser(req);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { data: settings, error } = await auth.supabase
      .from('notification_settings')
      .select('telegram_chat_id')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (error || !settings?.telegram_chat_id) {
      return NextResponse.json(
        { error: 'Telegram is not connected yet.' },
        { status: 400 }
      );
    }

    const envUrl = (process.env.APP_URL || '').trim();
    const dashboardUrl =
      envUrl && envUrl !== 'MY_APP_URL'
        ? envUrl.replace(/\/$/, '')
        : req.nextUrl.origin;

    const lines = [
      '🔔 <b>AppWatch Test Alert</b>',
      'Your Telegram alerts are connected and working properly.',
      dashboardUrl ? `<a href="${escapeHtml(dashboardUrl)}">Open Dashboard</a>` : '',
    ].filter(Boolean);

    const sent = await sendTelegram(settings.telegram_chat_id, lines.join('\n'));
    if (!sent) {
      return NextResponse.json(
        { error: 'Could not send test alert. Please check your Telegram bot settings.' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: 'Could not send test alert. Please try again.' },
      { status: 500 }
    );
  }
}
