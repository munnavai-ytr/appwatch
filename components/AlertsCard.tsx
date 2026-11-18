'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Bell,
  Check,
  ExternalLink,
  Loader2,
  Send,
  Unlink,
} from 'lucide-react';
import { formatSimpleError } from '@/lib/supabase';

interface AlertsCardProps {
  supabase: SupabaseClient;
  userId: string;
}

const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_MS = 60_000;

export default function AlertsCard({ supabase, userId }: AlertsCardProps) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);

  const [connecting, setConnecting] = useState(false);
  const [polling, setPolling] = useState(false);
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);

  const [sendingTest, setSendingTest] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPolling(false);
  }, []);

  const fetchSettings = useCallback(async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from('notification_settings')
      .select('telegram_chat_id, alerts_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return false;
    }

    const isLinked = Boolean(data?.telegram_chat_id);
    setConnected(isLinked);
    return isLinked;
  }, [supabase, userId]);

  useEffect(() => {
    let active = true;

    supabase
      .from('notification_settings')
      .select('telegram_chat_id, alerts_enabled')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (!error) {
          setConnected(Boolean(data?.telegram_chat_id));
        }
        setLoading(false);
      });

    return () => {
      active = false;
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [supabase, userId]);

  const getAccessToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const openExternalUrl = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConnect = async () => {
    if (connecting) return;
    setConnecting(true);
    setFeedback(null);
    stopPolling();

    try {
      const token = await getAccessToken();
      if (!token) {
        setFeedback({
          type: 'error',
          text: 'Please sign in again to connect Telegram.',
        });
        return;
      }

      const res = await fetch('/api/telegram/link', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };

      if (!res.ok || !body.url) {
        setFeedback({
          type: 'error',
          text: body.error || 'Could not create a Telegram link. Please try again.',
        });
        return;
      }

      setTelegramUrl(body.url);
      openExternalUrl(body.url);

      // Poll notification_settings every 3 seconds for up to 60 seconds
      setPolling(true);
      const startedAt = Date.now();
      pollTimerRef.current = setInterval(async () => {
        const isLinked = await fetchSettings();
        if (isLinked) {
          stopPolling();
          setTelegramUrl(null);
          setFeedback({
            type: 'success',
            text: 'Telegram connected. You will now receive live incident alerts.',
          });
          setTimeout(() => setFeedback(null), 4000);
          return;
        }

        if (Date.now() - startedAt >= POLL_MAX_MS) {
          stopPolling();
          setFeedback({
            type: 'error',
            text: 'Connection timed out. Press Start in Telegram, then click Connect Telegram again.',
          });
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: formatSimpleError(err, 'Could not connect Telegram. Please try again.'),
      });
    } finally {
      setConnecting(false);
    }
  };

  const handleSendTest = async () => {
    if (sendingTest) return;
    setSendingTest(true);
    setFeedback(null);

    try {
      const token = await getAccessToken();
      if (!token) {
        setFeedback({
          type: 'error',
          text: 'Please sign in again to send a test alert.',
        });
        return;
      }

      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setFeedback({
          type: 'error',
          text: body.error || 'Could not send test alert. Please try again.',
        });
        return;
      }

      setFeedback({
        type: 'success',
        text: 'Test alert sent to your Telegram chat.',
      });
      setTimeout(() => setFeedback(null), 3500);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: formatSimpleError(err, 'Could not send test alert. Please try again.'),
      });
    } finally {
      setSendingTest(false);
    }
  };

  const handleDisconnect = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    setFeedback(null);
    stopPolling();

    try {
      const token = await getAccessToken();
      if (!token) {
        setFeedback({
          type: 'error',
          text: 'Please sign in again to disconnect Telegram.',
        });
        return;
      }

      const res = await fetch('/api/telegram/disconnect', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const body = (await res.json().catch(() => ({}))) as { error?: string };

      if (!res.ok) {
        setFeedback({
          type: 'error',
          text: body.error || 'Could not disconnect Telegram. Please try again.',
        });
        return;
      }

      setConnected(false);
      setTelegramUrl(null);
      setFeedback({
        type: 'success',
        text: 'Telegram disconnected.',
      });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err) {
      setFeedback({
        type: 'error',
        text: formatSimpleError(err, 'Could not disconnect Telegram. Please try again.'),
      });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <motion.section
      aria-label="Alerts"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: 0.04, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl bg-[#0b1120]/75 backdrop-blur-xl border border-white/10 p-5 sm:p-6 space-y-4"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/30">
            <Bell className="h-5 w-5 text-[#00d4ff]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-base sm:text-lg font-semibold text-slate-100">
                Alerts
              </h2>
              {!loading && connected && (
                <span className="inline-flex items-center rounded-md border border-[#22c55e]/35 bg-[#22c55e]/15 px-2.5 py-0.5 text-xs font-semibold text-[#22c55e] whitespace-nowrap">
                  Connected
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs sm:text-sm text-slate-400">
              {connected
                ? 'Telegram alerts are active for new, escalated, and resolved incidents.'
                : 'Get instant Telegram alerts when your apps go down or hit errors.'}
            </p>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {loading ? (
            <div className="h-10 w-36 rounded-xl bg-white/10 animate-pulse" />
          ) : connected ? (
            <>
              <button
                type="button"
                onClick={handleSendTest}
                disabled={sendingTest || disconnecting}
                className="min-h-[42px] flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl bg-[#00d4ff]/15 border border-[#00d4ff]/30 px-4 py-2 text-xs sm:text-sm font-medium text-[#00d4ff] hover:bg-[#00d4ff]/25 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
              >
                {sendingTest ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span>Send test alert</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting || sendingTest}
                className="min-h-[42px] flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs sm:text-sm font-medium text-slate-300 hover:bg-[#ef4444]/15 hover:text-[#fca5a5] hover:border-[#ef4444]/35 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
              >
                {disconnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    <span>Disconnecting...</span>
                  </>
                ) : (
                  <>
                    <Unlink className="h-4 w-4" aria-hidden="true" />
                    <span>Disconnect</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              disabled={connecting}
              className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#00d4ff] px-5 py-2.5 text-sm font-semibold text-[#05070f] shadow-[0_0_24px_-4px_rgba(0,212,255,0.45)] hover:bg-[#33ddff] active:scale-[0.99] transition-all whitespace-nowrap cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
            >
              {connecting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>Preparing link...</span>
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  <span>Connect Telegram</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Waiting for confirmation state */}
      {polling && telegramUrl && !connected && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl bg-[#05070f]/80 border border-[#00d4ff]/25 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm text-slate-300"
        >
          <div className="flex items-center gap-2.5">
            <Loader2
              className="h-4 w-4 shrink-0 animate-spin text-[#00d4ff]"
              aria-hidden="true"
            />
            <span>
              Waiting for Telegram confirmation. Press <strong>Start</strong> in the bot chat.
            </span>
          </div>
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#00d4ff] hover:underline whitespace-nowrap shrink-0"
          >
            <span>Open Telegram</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
      )}

      {/* Status / Error feedback */}
      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`rounded-xl px-4 py-2.5 text-xs sm:text-sm flex items-start gap-2.5 border ${
            feedback.type === 'error'
              ? 'bg-[#ef4444]/10 border-[#ef4444]/30 text-[#fca5a5]'
              : 'bg-[#22c55e]/10 border-[#22c55e]/30 text-[#86efac]'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle
              className="h-4 w-4 shrink-0 text-[#ef4444] mt-0.5"
              aria-hidden="true"
            />
          ) : (
            <Check
              className="h-4 w-4 shrink-0 text-[#22c55e] mt-0.5"
              aria-hidden="true"
            />
          )}
          <span>{feedback.text}</span>
        </div>
      )}
    </motion.section>
  );
}
