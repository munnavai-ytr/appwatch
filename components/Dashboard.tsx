'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { AnimatePresence } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  FolderPlus,
  Loader2,
  LogOut,
  Plus,
  RefreshCw,
} from 'lucide-react';
import type { Incident, Project } from '@/types/project';
import { formatSimpleError } from '@/lib/supabase';
import AppWatchLogo from './AppWatchLogo';
import CommandCenterCard from './CommandCenterCard';
import AlertsCard from './AlertsCard';
import NewProjectForm from './NewProjectForm';
import ProjectCard from './ProjectCard';

interface DashboardProps {
  supabase: SupabaseClient;
  user: User;
}

const subscribeNoop = () => () => {};

function getAppDomain(): string {
  if (typeof window === 'undefined') return 'https://YOUR-APP-DOMAIN';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'https://YOUR-APP-DOMAIN';
  }
  return window.location.origin;
}

export default function Dashboard({ supabase, user }: DashboardProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [openIncidents, setOpenIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  const appDomain = useSyncExternalStore(
    subscribeNoop,
    getAppDomain,
    () => 'https://YOUR-APP-DOMAIN'
  );

  const fetchOpenIncidents = useCallback(async () => {
    const { data, error } = await supabase
      .from('incidents')
      .select('id, project_id, title, severity, status, event_count, created_at')
      .eq('status', 'open');

    if (!error && data) {
      setOpenIncidents(data as Incident[]);
    }
  }, [supabase]);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const [projectsRes, incidentsRes] = await Promise.all([
        supabase
          .from('projects')
          .select('id, user_id, name, site_url, api_key, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('incidents')
          .select('id, project_id, title, severity, status, event_count, created_at')
          .eq('status', 'open'),
      ]);

      if (projectsRes.error) {
        setErrorMessage(
          formatSimpleError(
            projectsRes.error,
            'Could not load your projects. Please try again.'
          )
        );
        return;
      }

      setProjects((projectsRes.data ?? []) as Project[]);
      if (!incidentsRes.error && incidentsRes.data) {
        setOpenIncidents(incidentsRes.data as Incident[]);
      }
    } catch (err) {
      setErrorMessage(
        formatSimpleError(err, 'Could not load your projects. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  }, [supabase, user.id]);

  useEffect(() => {
    let active = true;

    Promise.all([
      supabase
        .from('projects')
        .select('id, user_id, name, site_url, api_key, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('incidents')
        .select('id, project_id, title, severity, status, event_count, created_at')
        .eq('status', 'open'),
    ]).then(([projectsRes, incidentsRes]) => {
      if (!active) return;
      if (projectsRes.error) {
        setErrorMessage(
          formatSimpleError(
            projectsRes.error,
            'Could not load your projects. Please try again.'
          )
        );
      } else {
        setProjects((projectsRes.data ?? []) as Project[]);
      }
      if (!incidentsRes.error && incidentsRes.data) {
        setOpenIncidents(incidentsRes.data as Incident[]);
      }
      setLoading(false);
    });

    const channel = supabase
      .channel(`command-center-incidents-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incidents',
        },
        () => {
          if (!active) return;
          fetchOpenIncidents();
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, user.id, fetchOpenIncidents]);

  const handleProjectCreated = (newProject: Project) => {
    setProjects((prev) => [newProject, ...prev]);
    setShowNewForm(false);
  };

  const handleProjectDeleted = (deletedProject: Project) => {
    setProjects((prev) => prev.filter((item) => item.id !== deletedProject.id));
    setOpenIncidents((prev) =>
      prev.filter((incident) => incident.project_id !== deletedProject.id)
    );
    fetchOpenIncidents();
    setDeleteNotice(`Project "${deletedProject.name}" was deleted.`);
    setTimeout(() => {
      setDeleteNotice((current) =>
        current === `Project "${deletedProject.name}" was deleted.` ? null : current
      );
    }, 3500);
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="relative min-h-screen flex flex-col">
      {/* Ambient background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute -top-48 left-1/4 h-[380px] w-[560px] rounded-full bg-[#00d4ff]/8 blur-[130px]" />
        <div className="absolute top-1/3 -right-32 h-[320px] w-[420px] rounded-full bg-[#22c55e]/6 blur-[130px]" />
      </div>

      {/* Top Navigation Bar (3-zone contract) */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#05070f]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          <a
            href="#top"
            className="whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff] rounded-lg"
          >
            <AppWatchLogo size="sm" />
          </a>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400"
          >
            <a
              href="#command-center"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Command Center
            </a>
            <a
              href="#projects"
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Projects
            </a>
          </nav>

          <div className="flex items-center gap-4 shrink-0">
            {user.email && (
              <span className="hidden sm:inline-block text-xs text-slate-400 truncate max-w-[200px]">
                {user.email}
              </span>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="inline-flex items-center justify-center gap-2 min-h-[40px] rounded-xl border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
            >
              {signingOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        id="top"
        className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 space-y-8"
      >
        {/* Command Center Card */}
        <div id="command-center">
          <CommandCenterCard
            projectCount={projects.length}
            openIncidents={openIncidents}
            loading={loading}
          />
        </div>

        {/* Telegram Alerts Card */}
        <AlertsCard supabase={supabase} userId={user.id} />

        {/* Projects Section */}
        <section id="projects" aria-labelledby="projects-heading" className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2
                id="projects-heading"
                className="text-xl font-semibold tracking-tight text-slate-50"
              >
                Your Projects
              </h2>
              <p className="text-sm text-slate-400">
                Manage API keys and embed scripts for your monitored websites.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowNewForm((prev) => !prev)}
              className="min-h-[44px] w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#00d4ff] px-5 py-2.5 text-sm font-semibold text-[#05070f] shadow-[0_0_24px_-4px_rgba(0,212,255,0.5)] hover:bg-[#33ddff] active:scale-[0.99] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{showNewForm ? 'Hide Form' : 'New Project'}</span>
            </button>
          </div>

          {/* Collapsible New Project Form */}
          <AnimatePresence>
            {showNewForm && (
              <NewProjectForm
                supabase={supabase}
                userId={user.id}
                onCreated={handleProjectCreated}
                onCancel={() => setShowNewForm(false)}
              />
            )}
          </AnimatePresence>

          {/* Project Delete Success Message */}
          {deleteNotice && (
            <div
              role="status"
              className="rounded-xl bg-[#22c55e]/10 border border-[#22c55e]/30 px-4 py-3 text-sm text-[#86efac] flex items-center gap-2.5"
            >
              <CheckCircle2
                className="h-4 w-4 shrink-0 text-[#22c55e]"
                aria-hidden="true"
              />
              <span>{deleteNotice}</span>
            </div>
          )}

          {/* Error State */}
          {errorMessage && (
            <div
              role="alert"
              className="rounded-2xl bg-[#ef4444]/10 border border-[#ef4444]/30 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                <AlertCircle
                  className="h-5 w-5 shrink-0 text-[#ef4444] mt-0.5"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    Unable to load projects
                  </p>
                  <p className="mt-0.5 text-sm text-[#fca5a5]">{errorMessage}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={fetchProjects}
                className="min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#ef4444]/40 bg-[#ef4444]/15 px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-[#ef4444]/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Try Again</span>
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading && !errorMessage && (
            <div
              aria-label="Loading projects"
              className="grid grid-cols-1 gap-5 lg:grid-cols-2"
            >
              {[0, 1].map((skeleton) => (
                <div
                  key={skeleton}
                  className="rounded-2xl bg-[#0b1120]/65 backdrop-blur-xl border border-white/10 p-5 sm:p-6 space-y-5 animate-pulse"
                >
                  <div className="space-y-2">
                    <div className="h-5 w-44 rounded bg-white/10" />
                    <div className="h-4 w-60 rounded bg-white/5" />
                  </div>
                  <div className="h-px bg-white/10" />
                  <div className="space-y-2">
                    <div className="h-3 w-16 rounded bg-white/10" />
                    <div className="h-10 w-full rounded-xl bg-white/5" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-3 w-24 rounded bg-white/10" />
                    <div className="h-10 w-full rounded-xl bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && !errorMessage && projects.length === 0 && (
            <div className="rounded-2xl bg-[#0b1120]/65 backdrop-blur-xl border border-white/10 p-8 sm:p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#00d4ff]/10 border border-[#00d4ff]/30">
                <FolderPlus className="h-6 w-6 text-[#00d4ff]" aria-hidden="true" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-100">
                No projects yet
              </h3>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-400">
                Add your first website or web app to get an API key and a one-line
                monitoring script.
              </p>
              {!showNewForm && (
                <button
                  type="button"
                  onClick={() => setShowNewForm(true)}
                  className="mt-6 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#00d4ff] px-5 py-2.5 text-sm font-semibold text-[#05070f] shadow-[0_0_24px_-4px_rgba(0,212,255,0.5)] hover:bg-[#33ddff] transition-all whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00d4ff]"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  <span>Add Your First Project</span>
                </button>
              )}
            </div>
          )}

          {/* Populated Projects Grid */}
          {!loading && !errorMessage && projects.length > 0 && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {projects.map((project, index) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  supabase={supabase}
                  appDomain={appDomain}
                  index={index}
                  onIncidentActivity={fetchOpenIncidents}
                  onDeleted={handleProjectDeleted}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
