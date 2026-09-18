import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { sentinelApi } from '@/services/api';
import type { SourceType } from '@/types/sentinel';
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  MessageSquare, 
  Video, 
  FileText, 
  Bell 
} from 'lucide-react';

export const UploadView: React.FC = () => {
  const [sourceType, setSourceType] = useState<SourceType>('whatsapp');
  const [title, setTitle] = useState('');
  const [rawText, setRawText] = useState('');
  const [author, setAuthor] = useState('');
  const [accessScope, setAccessScope] = useState('cohort_1');

  const uploadMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append('source_type', sourceType);
      formData.append('title', title.trim());
      formData.append('raw_text', rawText.trim());
      formData.append('access_scope', accessScope);
      if (author.trim()) {
        formData.append('author', author.trim());
      }
      return sentinelApi.uploadSource(formData);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !rawText.trim() || uploadMutation.isPending) return;
    uploadMutation.mutate();
  };

  const resetForm = () => {
    setTitle('');
    setRawText('');
    setAuthor('');
    uploadMutation.reset();
  };

  const sourceTypes: { type: SourceType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { type: 'whatsapp', label: 'WhatsApp Chat', icon: MessageSquare },
    { type: 'otter', label: 'Otter / Transcript', icon: Video },
    { type: 'pdf', label: 'Document / PDF', icon: FileText },
    { type: 'announcement', label: 'Official Announcement', icon: Bell },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* View Header */}
      <div className="p-6 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs">
        <div className="flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Ingest Knowledge Source
          </h2>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
          Import conversations, transcripts, and official updates into Sentinel's grounded vector index.
        </p>
      </div>

      {/* Success Notification */}
      {uploadMutation.isSuccess && (
        <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start justify-between">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                Source Successfully Ingested
              </h4>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                Created source <code className="font-mono">{uploadMutation.data?.source_id}</code> with {(uploadMutation.data as any)?.chunks_count ?? (uploadMutation.data as any)?.chunks_created ?? 'indexed'} vector chunks.
              </p>
            </div>
          </div>
          <button
            onClick={resetForm}
            className="text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
          >
            Import Another
          </button>
        </div>
      )}

      {/* Error Notification */}
      {uploadMutation.isError && (
        <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
              Ingestion Failed
            </h4>
            <p className="text-xs text-rose-700 dark:text-rose-400 mt-0.5">
              Could not process and embed the source text. Check backend logs or mock network.
            </p>
          </div>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-6 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-5">
        {/* Source Type Selector */}
        <div>
          <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wider mb-2">
            Source Channel Type
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {sourceTypes.map((item) => {
              const Icon = item.icon;
              const isSelected = sourceType === item.type;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setSourceType(item.type)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-lg border text-xs font-medium transition-all ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                      : 'border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Title Input */}
        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Source Title / Reference Name
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., WhatsApp General Chat Export - Sept 18"
            className="w-full px-3.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Author / Scope Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Author / Originator (Optional)
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g., Program Lead, Student Rep"
              className="w-full px-3.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Access Scope
            </label>
            <select
              value={accessScope}
              onChange={(e) => setAccessScope(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="cohort_1">cohort_1 (UniPods)</option>
              <option value="leads">leads (Faculty / Coordinators)</option>
              <option value="public">public</option>
            </select>
          </div>
        </div>

        {/* Content Body */}
        <div>
          <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
            Raw Content / Chat Log / Transcript Text
          </label>
          <textarea
            required
            rows={8}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder="Paste text, meeting notes, or chat messages here..."
            className="w-full px-3.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Submit */}
        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={uploadMutation.isPending || !title.trim() || !rawText.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {uploadMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Indexing Chunks...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4" />
                <span>Ingest & Vectorize</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};