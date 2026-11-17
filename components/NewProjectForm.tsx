'use client';

import { useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { motion } from 'motion/react';
import { AlertCircle, Globe, Loader2, Plus, X } from 'lucide-react';
import type { Project } from '@/types/project';
import { formatSimpleError } from '@/lib/supabase';

interface NewProjectFormProps {
  supabase: SupabaseClient;
  userId: string;
  onCreated: (project: Project) => void;
  onCancel: () => void;
}

function normalizeSiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    if (!parsed.hostname || !parsed.hostname.includes('.')) {
      return null;
    }
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

export default function NewProjectForm({
  supabase,
  userId,
  onCreated,
  onCancel,
}: NewProjectFormProps) {
  const [name, setName] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('Please enter a name for your project.');
      return;
    }

    const normalizedUrl = normalizeSiteUrl(siteUrl);
    if (!normalizedUrl) {
      setErrorMessage('Please enter a valid website URL (for example, https://myapp.com).');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: trimmedName,
          site_url: normalizedUrl,
          user_id: userId,
        })
        .select()
        .single();

      if (error) {
        setErrorMessage(
          formatSimpleError(error, 'Could not create this project. Please try again.')
        );
        return;
      }

      if (data) {
        onCreated(data as Project);
        setName('');
        setSiteUrl('');
      }
    } catch (err) {
      setErrorMessage(
        formatSimpleError(err, 'Could not create this project. Please try again.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-2xl bg-[#0b1120]/80 backdrop-blur-xl border border-[#00d4ff]/30 shadow-[0_0_32px_-12px_rgba(0,212,255,0.28)] p-5 sm:p-6"
    >
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">New Project</h2>
          <p className="text-sm text-slate-400">
            Register an application to generate its monitoring key and script tag.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close new project form"
          className="h-10 w-10 shrink-0 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-100 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/30 px-4 py-3 text-sm text-[#fca5a5]"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-[#ef4444] mt-0.5" aria-hidden="true" />
          <p>{errorMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div>
          <label
            htmlFor="project-name"
            className="block text-sm font-medium text-slate-200 mb-1.5"
          >
            Project name
          </label>
          <input
            id="project-name"
            name="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Production Web App"
            disabled={submitting}
            className="w-full min-h-[44px] rounded-xl bg-[#05070f]/80 border border-white/15 px-4 py-2.5 text-base sm:text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:outline-none focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff] disabled:opacity-60"
          />
        </div>

        <div>
          <label
            htmlFor="project-url"
            className="block text-sm font-medium text-slate-200 mb-1.5"
          >
            Website URL
          </label>
          <div className="relative">
            <Globe
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="project-url"
              name="site_url"
              type="url"
              required
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://myapp.com"
              disabled={submitting}
              className="w-full min-h-[44px] rounded-xl bg-[#05070f]/80 border border-white/15 pl-10 pr-4 py-2.5 text-base sm:text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:outline-none focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff] disabled:opacity-60"
            />
          </div>
        </div>

        <div className="sm:col-span-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="min-h-[44px] rounded-xl border border-white/15 bg-transparent px-5 py-2 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-slate-100 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#00d4ff] px-5 py-2 text-sm font-semibold text-[#05070f] shadow-[0_0_24px_-4px_rgba(0,212,255,0.5)] hover:bg-[#33ddff] active:scale-[0.99] transition-all whitespace-nowrap cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                <span>Adding project...</span>
              </>
            ) : (
              <>
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>Create Project</span>
              </>
            )}
          </button>
        </div>
      </form>
    </motion.div>
  );
}
