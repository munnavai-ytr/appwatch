import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminSupabaseClient, sendTelegram } from '@/lib/notify';

export const runtime = 'nodejs';

const DEFAULT_REPLY = 'Open AppWatch and press Connect Telegram to link this chat.';

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

async function replySafely(chatId: number | string, htmlText: string, context: string) {
  const ok = await sendTelegram(chatId, htmlText);
  if (!ok) {
    console.error(`[telegram-webhook] Failed to send reply (${context})`);
  }
}

export async function POST(req: NextRequest) {
  if (!isValidWebhookSecret(req)) {
    console.error('[telegram-webhook] Rejected request with invalid or missing secret header');
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  try {
    const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
    if (!update) {
      console.error('[telegram-webhook] Failed to parse incoming JSON update');
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const msg = update.message || update.edited_message;
    const chatId = msg?.chat?.id;
    const text = typeof msg?.text === 'string' ? msg.text.trim() : '';

    if (!chatId || !text) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    const parts = text.split(/\s+/);
    const command = (parts[0] || '').toLowerCase().split('@')[0];
    const startCode = command === '/start' ? (parts[1] || '').trim() : '';

    // Handle "/start <code>"
    if (command === '/start' && startCode) {
      const supabase = getAdminSupabaseClient();
      if (!supabase) {
        console.error('[telegram-webhook] Server Supabase admin client is not configured');
        return NextResponse.json({ ok: true }, { status: 200 });
      }

      const nowIso = new Date().toISOString();
      const { data: setting, error: lookupError } = await supabase
        .from('notification_settings')
        .select('user_id')
        .eq('link_code', startCode)
        .gt('link_code_expires_at', nowIso)
        .maybeSingle();

      if (lookupError) {
        console.error('[telegram-webhook] Failed to look up link code:', lookupError.message);
        await replySafely(
          chatId,
          '⚠️ Something went wrong while linking your account. Please try again.',
          'lookup-error'
        );
        return NextResponse.json({ ok: true }, { status: 200 });
      }

      if (!setting) {
        await replySafely(
          chatId,
          '⚠️ This link code is invalid or expired. Please open AppWatch and press Connect Telegram again.',
          'invalid-or-expired-code'
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

      if (updateError) {
        console.error('[telegram-webhook] Failed to save linked chat:', updateError.message);
        await replySafely(
          chatId,
          '⚠️ Could not finish connecting your account. Please try again.',
          'save-chat-error'
        );
        return NextResponse.json({ ok: true }, { status: 200 });
      }

      await replySafely(
        chatId,
        '✅ AppWatch connected. You will get alerts here.',
        'connected'
      );
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Handle "/stop"
    if (command === '/stop') {
      const supabase = getAdminSupabaseClient();
      if (!supabase) {
        console.error('[telegram-webhook] Server Supabase admin client is not configured');
        return NextResponse.json({ ok: true }, { status: 200 });
      }

      const { error: stopError } = await supabase
        .from('notification_settings')
        .update({
          telegram_chat_id: null,
          link_code: null,
          link_code_expires_at: null,
        })
        .eq('telegram_chat_id', String(chatId));

      if (stopError) {
        console.error('[telegram-webhook] Failed to disconnect chat:', stopError.message);
      }

      await replySafely(chatId, '🔕 AppWatch alerts disconnected.', 'disconnected');
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Any other message (including "/start" without a code)
    await replySafely(chatId, DEFAULT_REPLY, 'default-help');
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error(
      '[telegram-webhook] Unexpected error:',
      err instanceof Error ? err.message : 'Unknown error'
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  }
}
