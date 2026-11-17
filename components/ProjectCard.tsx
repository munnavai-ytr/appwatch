'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import type { Project } from '@/types/project';

interface ProjectCardProps {
  project: Project;
  appDomain: string;
  index: number;
}

export default function ProjectCard({ project, appDomain, index }: ProjectCardProps) {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const apiKeyValue = project.api_key || '';
  const scriptTag = `<script src="${appDomain}/appwatch.js" data-key="${apiKeyValue || 'API_KEY'}"></script>`;

  const copyText = async (text: string, target: 'key' | 'script') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (target === 'key') {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 2000);
      }
    } catch {
      // Fallback copy method if clipboard API is restricted
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      if (target === 'key') {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopiedScript(true);
        setTimeout(() => setCopiedScript(false), 2000);
      }
    }
  };

  const formattedDate = project.created_at
    ? new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date(project.created_at))
    : null;

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.22,
        delay: Math.min(index * 0.04, 0.2),
        ease: [0.16, 1, 0.3, 1],
      }}
      className="rounded-2xl bg-[#0b1120]/75 backdrop-blur-xl border border-white/10 hover:border-[#00d4ff]/35 transition-colors p-5 sm:p-6 flex flex-col gap-5 min-w-0"
    >
      {/* Header: Project Name & URL */}
      <div className="flex items-start justify-between gap-4 min-w-0">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-slate-50 truncate">
            {project.name}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400 min-w-0">
            <a
              href={project.site_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[#00d4ff] hover:underline truncate max-w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff] rounded"
            >
              <span className="truncate">{project.site_url}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </a>
            {formattedDate && (
              <>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  Added {formattedDate}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Hairline divider */}
      <div className="h-px bg-white/10" aria-hidden="true" />

      {/* API Key Row */}
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-400">API Key</span>
          <button
            type="button"
            onClick={() => copyText(apiKeyValue, 'key')}
            disabled={!apiKeyValue}
            className="inline-flex items-center gap-1.5 min-h-[36px] sm:min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium text-slate-200 bg-white/5 hover:bg-[#00d4ff]/15 hover:text-[#00d4ff] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
          >
            {copiedKey ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#22c55e]" aria-hidden="true" />
                <span className="text-[#22c55e]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copy key</span>
              </>
            )}
          </button>
        </div>
        <div className="rounded-xl bg-[#05070f]/90 border border-white/10 px-3.5 py-2.5 overflow-x-auto">
          <code className="font-mono text-xs sm:text-[13px] text-slate-200 whitespace-nowrap select-all">
            {apiKeyValue || 'Generating key...'}
          </code>
        </div>
      </div>

      {/* Ready-to-copy Script Tag */}
      <div className="space-y-1.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-400">Install Script Tag</span>
          <button
            type="button"
            onClick={() => copyText(scriptTag, 'script')}
            className="inline-flex items-center gap-1.5 min-h-[36px] sm:min-h-[32px] px-3 py-1 rounded-lg text-xs font-medium text-slate-200 bg-white/5 hover:bg-[#00d4ff]/15 hover:text-[#00d4ff] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
          >
            {copiedScript ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#22c55e]" aria-hidden="true" />
                <span className="text-[#22c55e]">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Copy script</span>
              </>
            )}
          </button>
        </div>
        <div className="rounded-xl bg-[#05070f]/90 border border-white/10 px-3.5 py-2.5 overflow-x-auto">
          <code className="font-mono text-xs text-[#00d4ff]/90 whitespace-nowrap select-all">
            {scriptTag}
          </code>
        </div>
      </div>
    </motion.article>
  );
}
