import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient, sendTelegram } from '@/lib/notify';

export const runtime = 'nodejs';

function isValidWebhookSecret(req: NextRequest): boolean {
  const expected = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  const provided = (req.headers.get('x-telegram-bot-api-secret-token') || '').trim();
  if (!expected || !provided) return false;

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}

interface TelegramUpdate {
  message?: {
    chat?: { id?: number | string };
    text?: string;
  };
  edited_message?: {
    chat?: { id?: number | string };
    text?: string;
  };
}

export async function POST(req: NextRequest) {
  if (!isValidWebhookSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
    const msg = update?.message || update?.edited_message;
    const chatId = msg?.chat?.id;
    const text = typeof msg?.text === 'string' ? msg.text.trim() : '';

    if (!chatId || !text) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const supabase = getAdminSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const parts = text.split(/\s+/);
    const command = (parts[0] || '').toLowerCase().split('@')[0];

    if (command === '/start') {
      const code = (parts[1] || '').trim();
      if (!code) {
        await sendTelegram(
          chatId,
          'Please open AppWatch and click <b>Connect Telegram</b> to link your account.'
        );
        return NextResponse.json({ ok: true }, { status: 200 });
      }

      const nowIso = new Date().toISOString();
      const { data: setting } = await supabase
        .from('notification_settings')
        .select('user_id')
        .eq('link_code', code)
        .gt('link_code_expires_at', nowIso)
        .maybeSingle();

      if (!setting) {
        await sendTelegram(
          chatId,
          '⚠️ This link code is invalid or expired. Please click <b>Connect Telegram</b> in AppWatch to try again.'
        );
        return NextResponse.json({ ok: true }, { status: 200 });
      }

      const { error: updateError } = await supabase
        .from('notification_settings')
        .update({
          telegram_chat_id: String(chatId),
          alerts_enabled: true,
          link_code: null,
          link_code_expires_at: null,
        })
        .eq('user_id', setting.user_id);

      if (!updateError) {
        await sendTelegram(
          chatId,
          '✅ AppWatch connected. You will get alerts here.'
        );
      }

      return NextResponse.json({ ok: true }, { status: 200 });
    }

    if (command === '/stop') {
      await supabase
        .from('notification_settings')
        .update({
          telegram_chat_id: null,
          link_code: null,
          link_code_expires_at: null,
        })
        .eq('telegram_chat_id', String(chatId));

      await sendTelegram(chatId, '🔕 AppWatch alerts disconnected.');
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
