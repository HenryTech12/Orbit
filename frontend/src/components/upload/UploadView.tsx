import React, { useState, useRef } from 'react';
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
  Bell,
  Upload,
  PlusCircle,
  ArrowRight,
  Database
} from 'lucide-react';

function sanitizeRawText(input: string): string {
  return input
    .replace(/\x00/g, '')
    .replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, ' ')
    .replace(/\r\n/g, '\n')
    .trim();
}

export const UploadView: React.FC = () => {
  const [sourceType, setSourceType] = useState<SourceType>('whatsapp');
  const [title, setTitle] = useState('');
  const [rawText, setRawText] = useState('');
  const [author, setAuthor] = useState('');
  const [accessScope, setAccessScope] = useState('cohort_1');
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append('source_type', sourceType);
      formData.append('title', title.trim());
      formData.append('raw_text', sanitizeRawText(rawText));
      formData.append('access_scope', accessScope);
      if (author.trim()) {
        formData.append('author', author.trim());
      }
      return sentinelApi.uploadSource(formData);
    },
  });

  const handleFileChange = async (file: File) => {
    setFileName(file.name);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''));
    }

    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let extractedText = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum);
          const textContent = await page.getTextContent();
          const pageStrings = textContent.items
            .map((item: any) => ('str' in item ? item.str : ''))
            .join(' ');
          extractedText += `\n--- Page ${pageNum} ---\n` + pageStrings;
        }

        setRawText(sanitizeRawText(extractedText));
        return;
      } catch (err) {
        console.error('PDF extraction failed:', err);
      }
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setRawText(sanitizeRawText(content));
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = sanitizeRawText(rawText);
    if (!title.trim() || !cleanText || uploadMutation.isPending) return;
    uploadMutation.mutate();
  };

  const handleResetForm = () => {
    setTitle('');
    setRawText('');
    setAuthor('');
    setFileName(null);
    setSourceType('whatsapp');
    setAccessScope('cohort_1');
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
      {/* Header */}
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

      {/* Standard Full-Page Receipt Card on Success */}
      {uploadMutation.isSuccess ? (
        <div className="p-8 rounded-xl bg-white dark:bg-zinc-900 border border-emerald-200 dark:border-emerald-900/60 shadow-xs space-y-6 text-center">
          <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-6 h-6" />
          </div>

          <div className="space-y-1">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Source Successfully Vectorized
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              Your source has been sanitized, embedded, and added to the Sentinel grounded knowledge base.
            </p>
          </div>

          {/* Metadata Receipt */}
          <div className="max-w-md mx-auto p-4 rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Source Title:</span>
              <span className="font-semibold text-zinc-800 dark:text-zinc-200">{title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Access Scope:</span>
              <span className="font-mono bg-zinc-200 dark:bg-zinc-700 px-1.5 py-0.5 rounded text-[11px]">{accessScope}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Source ID:</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">{uploadMutation.data?.source_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Status:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Ready for Grounded Retrieval</span>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={handleResetForm}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 text-xs font-semibold transition-colors"
            >
              <PlusCircle className="w-4 h-4" />
              Ingest Another Source
            </button>
            <a
              href="/"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors"
            >
              <span>Test in Copilot Chat</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      ) : (
        /* Ingestion Form */
        <form onSubmit={handleSubmit} className="p-6 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-5">
          {uploadMutation.isError && (
            <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                  Ingestion Failed
                </h4>
                <p className="text-xs text-rose-700 dark:text-rose-400 mt-0.5">
                  Could not process and embed the source text. Check backend logs or connection.
                </p>
              </div>
            </div>
          )}

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

          {/* File Dropzone Area */}
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Attach Document / Export File (Optional)
            </label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-indigo-500 rounded-lg p-5 text-center cursor-pointer transition-colors bg-zinc-50/50 dark:bg-zinc-800/40"
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".txt,.md,.json,.csv,.log,.pdf"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileChange(e.target.files[0]);
                  }
                }}
              />
              <Upload className="w-6 h-6 mx-auto text-indigo-500 mb-1" />
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
                {fileName ? (
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">{fileName}</span>
                ) : (
                  'Drop text / markdown / PDF export file here, or click to browse'
                )}
              </p>
              <p className="text-[10px] text-zinc-400 mt-1">Supports .pdf, .txt, .md, .json, .csv, .log</p>
            </div>
          </div>

          {/* Content Body */}
          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Raw Content / Chat Log / Transcript Text
            </label>
            <textarea
              required
              rows={7}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste text, meeting notes, or chat messages here..."
              className="w-full px-3.5 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 text-sm font-mono text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={uploadMutation.isPending || !title.trim() || !rawText.trim()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sanitizing & Indexing...</span>
                </>
              ) : (
                <>
                  <Database className="w-4 h-4" />
                  <span>Ingest & Vectorize</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
