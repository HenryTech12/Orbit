import React from 'react';
import type { Citation, SourceType } from '@/types/sentinel';
import { FileText, MessageSquare, Video, Bell } from 'lucide-react';

interface CitationPillProps {
  citation: Citation;
  onClick: (sourceId: string) => void;
}

export const CitationPill: React.FC<CitationPillProps> = ({ citation, onClick }) => {
  const getSourceIcon = (type: SourceType) => {
    switch (type) {
      case 'whatsapp':
        return <MessageSquare className="w-3 h-3 text-emerald-500" />;
      case 'otter':
      case 'meeting_transcript':
        return <Video className="w-3 h-3 text-indigo-500" />;
      case 'announcement':
        return <Bell className="w-3 h-3 text-amber-500" />;
      case 'pdf':
      default:
        return <FileText className="w-3 h-3 text-blue-500" />;
    }
  };

  const formattedDate = new Date(citation.date).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <button
      type="button"
      onClick={() => onClick(citation.source_id)}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer text-left"
    >
      {getSourceIcon(citation.source_type)}
      <span className="truncate max-w-[140px]">{citation.title}</span>
      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 border-l border-zinc-300 dark:border-zinc-600 pl-1.5">
        {formattedDate}
      </span>
    </button>
  );
};