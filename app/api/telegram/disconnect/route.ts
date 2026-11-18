import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerUser } from '@/lib/notify';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyBearerUser(req);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { error } = await auth.supabase
      .from('notification_settings')
      .update({
        telegram_chat_id: null,
        link_code: null,
        link_code_expires_at: null,
      })
      .eq('user_id', auth.user.id);

    if (error) {
      return NextResponse.json(
        { error: 'Could not disconnect Telegram. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: 'Could not disconnect Telegram. Please try again.' },
      { status: 500 }
    );
  }
}
