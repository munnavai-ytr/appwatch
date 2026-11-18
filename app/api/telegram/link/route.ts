import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerUser } from '@/lib/notify';

export const runtime = 'nodejs';

const CODE_TTL_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyBearerUser(req);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const botUsername = (process.env.TELEGRAM_BOT_USERNAME || '')
      .trim()
      .replace(/^@+/, '');

    if (!botUsername) {
      return NextResponse.json(
        { error: 'Telegram bot is not configured on the server yet.' },
        { status: 503 }
      );
    }

    const code = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

    const { error } = await auth.supabase
      .from('notification_settings')
      .upsert(
        {
          user_id: auth.user.id,
          link_code: code,
          link_code_expires_at: expiresAt,
          alerts_enabled: true,
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      return NextResponse.json(
        { error: 'Could not start Telegram linking. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { url: `https://t.me/${encodeURIComponent(botUsername)}?start=${code}` },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: 'Could not start Telegram linking. Please try again.' },
      { status: 500 }
    );
  }
}
