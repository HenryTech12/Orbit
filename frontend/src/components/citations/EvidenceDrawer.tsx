import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { sentinelApi } from '@/services/api';
import type { SourceType } from '@/types/sentinel';
import { X, Calendar, User, ShieldCheck, FileText, MessageSquare, Video, Bell, Loader2 } from 'lucide-react';

interface EvidenceDrawerProps {
  sourceId: string | null;
  onClose: () => void;
}

export const EvidenceDrawer: React.FC<EvidenceDrawerProps> = ({ sourceId, onClose }) => {
  const { data: source, isLoading, isError } = useQuery({
    queryKey: ['source', sourceId],
    queryFn: () => (sourceId ? sentinelApi.getSource(sourceId) : null),
    enabled: !!sourceId,
  });

  if (!sourceId) return null;

  const getSourceIcon = (type?: SourceType) => {
    switch (type) {
      case 'whatsapp':
        return <MessageSquare className="w-4 h-4 text-emerald-500" />;
      case 'otter':
      case 'meeting_transcript':
        return <Video className="w-4 h-4 text-indigo-500" />;
      case 'announcement':
        return <Bell className="w-4 h-4 text-amber-500" />;
      case 'pdf':
      default:
        return <FileText className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 h-full shadow-2xl border-l border-zinc-200 dark:border-zinc-800 flex flex-col animate-in slide-in-from-right duration-200">
        
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-sm">
              Source Evidence & Provenance
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin mb-2" />
              <span className="text-xs">Loading source record...</span>
            </div>
          )}

          {isError && (
            <div className="p-3 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded-md border border-red-200 dark:border-red-900">
              Failed to retrieve source evidence. Please check network connection.
            </div>
          )}

          {source && (
            <>
              {/* Source Title & Meta Card */}
              <div className="p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/50 space-y-3">
                <div className="flex items-start gap-2.5">
                  <div className="mt-0.5 p-1.5 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                    {getSourceIcon(source.source_type)}
                  </div>
                  <div>
                    <h4 className="font-medium text-zinc-900 dark:text-zinc-100 text-sm leading-snug">
                      {source.title}
                    </h4>
                    <span className="text-xs font-mono text-zinc-400">
                      ID: {source.source_id}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-700/60 text-xs text-zinc-600 dark:text-zinc-400">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    <span>{new Date(source.source_timestamp).toLocaleString()}</span>
                  </div>
                  {source.author && (
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-zinc-400" />
                      <span className="truncate">{source.author}</span>
                    </div>
                  )}
                  <div className="col-span-2 flex items-center gap-2 pt-1">
                    <span className="px-2 py-0.5 rounded bg-zinc-200 dark:bg-zinc-700 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">
                      Scope: {source.access_scope}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 text-[10px] font-semibold border border-indigo-200 dark:border-indigo-800/50">
                      Authority Rating: {source.authority_score}/3
                    </span>
                  </div>
                </div>
              </div>

              {/* Exact Surrounding Context */}
              <div>
                <h5 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                  Grounding Context
                </h5>
                <div className="p-3.5 rounded-lg bg-zinc-900 text-zinc-200 text-xs font-mono leading-relaxed whitespace-pre-wrap border border-zinc-800">
                  {source.context_text}
                </div>
              </div>

              {/* Metadata Key-Value */}
              {source.metadata && Object.keys(source.metadata).length > 0 && (
                <div>
                  <h5 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                    Ingestion Metadata
                  </h5>
                  <div className="rounded-md border border-zinc-200 dark:border-zinc-800 divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
                    {Object.entries(source.metadata).map(([k, v]) => (
                      <div key={k} className="flex justify-between px-3 py-2">
                        <span className="text-zinc-500 font-medium capitalize">{k.replace('_', ' ')}</span>
                        <span className="text-zinc-800 dark:text-zinc-200 font-mono">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};