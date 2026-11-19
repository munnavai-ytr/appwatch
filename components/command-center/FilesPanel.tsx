'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
} from 'lucide-react';
import {
  MODE_PALETTES,
  type ControlMode,
  type FileTreeNode,
  type TimeThemeStyle,
} from '@/lib/command-center';

interface FilesPanelProps {
  tree: FileTreeNode[];
  highlightedFile: string | null;
  mode: ControlMode;
  timeTheme: TimeThemeStyle;
  loading: boolean;
  isFocused: boolean;
  onUserInteract: () => void;
}

function getFileIconColor(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'text-[#38bdf8]';
  if (lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.mjs')) {
    return 'text-amber-300';
  }
  if (lower.endsWith('.json')) return 'text-emerald-300';
  return 'text-slate-400';
}

function FileIcon({ fileName }: { fileName: string }) {
  const lower = fileName.toLowerCase();
  const color = getFileIconColor(fileName);
  if (lower.endsWith('.json')) {
    return <FileJson className={`h-3.5 w-3.5 shrink-0 ${color}`} aria-hidden="true" />;
  }
  if (
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.mjs')
  ) {
    return <FileCode2 className={`h-3.5 w-3.5 shrink-0 ${color}`} aria-hidden="true" />;
  }
  return <FileText className={`h-3.5 w-3.5 shrink-0 ${color}`} aria-hidden="true" />;
}

interface TreeRowProps {
  node: FileTreeNode;
  depth: number;
  highlightedFile: string | null;
  highlightColor: string;
  collapsedFolders: Record<string, boolean>;
  onToggleFolder: (path: string) => void;
}

function TreeRow({
  node,
  depth,
  highlightedFile,
  highlightColor,
  collapsedFolders,
  onToggleFolder,
}: TreeRowProps) {
  const isFolder = node.type === 'folder';
  const containsHighlight =
    Boolean(highlightedFile) &&
    (highlightedFile === node.path ||
      (isFolder && highlightedFile!.startsWith(`${node.path}/`)));

  // Auto-open folders containing the highlighted file unless explicitly toggled
  const isCollapsed = collapsedFolders[node.path] === true;
  const isOpen = isFolder && (!isCollapsed || containsHighlight);
  const isHighlighted = !isFolder && highlightedFile === node.path;

  return (
    <li>
      {isFolder ? (
        <>
          <button
            type="button"
            onClick={() => onToggleFolder(node.path)}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
            className="w-full flex items-center gap-1.5 py-1.5 pr-2.5 rounded-lg text-left text-xs font-mono text-slate-300 hover:bg-white/5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00d4ff]"
          >
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
            )}
            {isOpen ? (
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#00d4ff]/80" aria-hidden="true" />
            ) : (
              <Folder className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            )}
            <span className="truncate">{node.name}</span>
          </button>

          {isOpen && node.children && node.children.length > 0 && (
            <ul className="space-y-0.5">
              {node.children.map((child) => (
                <TreeRow
                  key={child.path}
                  node={child}
                  depth={depth + 1}
                  highlightedFile={highlightedFile}
                  highlightColor={highlightColor}
                  collapsedFolders={collapsedFolders}
                  onToggleFolder={onToggleFolder}
                />
              ))}
            </ul>
          )}
        </>
      ) : (
        <div
          style={{
            paddingLeft: `${depth * 14 + 24}px`,
            ...(isHighlighted
              ? {
                  backgroundColor: `${highlightColor}22`,
                  borderColor: `${highlightColor}66`,
                }
              : undefined),
          }}
          className={`flex items-center justify-between gap-2 py-1.5 pr-2.5 rounded-lg text-xs font-mono border transition-colors ${
            isHighlighted
              ? 'text-slate-50 font-semibold motion-safe:animate-pulse'
              : 'border-transparent text-slate-300 hover:bg-white/5'
          }`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <FileIcon fileName={node.name} />
            <span className="truncate" title={node.path}>
              {node.name}
            </span>
          </div>
          <span className="text-[11px] tabular-nums text-slate-400 shrink-0">
            {node.eventCount}
          </span>
        </div>
      )}
    </li>
  );
}

export default function FilesPanel({
  tree,
  highlightedFile,
  mode,
  timeTheme,
  loading,
  isFocused,
  onUserInteract,
}: FilesPanelProps) {
  const palette = MODE_PALETTES[mode];
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});

  const handleToggleFolder = (path: string) => {
    onUserInteract();
    setCollapsedFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  return (
    <div
      className={`rounded-2xl ${timeTheme.panelBg} backdrop-blur-xl border ${
        isFocused ? `${palette.borderClass} ring-1 ${palette.ringClass}` : 'border-white/10'
      } transition-all duration-500 motion-reduce:transition-none p-5 flex flex-col justify-between gap-3 min-h-[260px]`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold tracking-wide text-slate-300">
          Files
        </span>
        {highlightedFile && (
          <span
            className="font-mono text-[11px] text-slate-400 truncate max-w-[200px]"
            title={highlightedFile}
          >
            {highlightedFile}
          </span>
        )}
      </div>

      {/* Tree Body */}
      <div className="flex-1 rounded-xl bg-[#05070f]/75 border border-white/10 p-2.5 overflow-y-auto max-h-[210px]">
        {loading ? (
          <div className="space-y-2 p-1 animate-pulse">
            <div className="h-4 w-32 rounded bg-white/10" />
            <div className="h-4 w-44 rounded bg-white/5 ml-4" />
            <div className="h-4 w-36 rounded bg-white/5 ml-4" />
          </div>
        ) : tree.length === 0 ? (
          <div className="h-full min-h-[140px] flex items-center justify-center px-3 text-center">
            <p className="text-xs text-slate-400">
              No error files recorded yet. File paths will appear here when errors arrive.
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5" aria-label="Error file explorer">
            {tree.map((node) => (
              <TreeRow
                key={node.path}
                node={node}
                depth={0}
                highlightedFile={highlightedFile}
                highlightColor={palette.accentHex}
                collapsedFolders={collapsedFolders}
                onToggleFolder={handleToggleFolder}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Footer note */}
      <p className="text-[11px] text-slate-400">
        Files seen in errors - GitHub tree coming soon
      </p>
    </div>
  );
}
