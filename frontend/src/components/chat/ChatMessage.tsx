import React from 'react';
import type { CopilotAskResponse, StructuredFact } from '@/types/sentinel';
import { TrustBadge } from '../citations/TrustBadge';
import { CitationPill } from '../citations/CitationPill';
import { Bot, User, Calendar } from 'lucide-react';

export interface ChatMessageItem {
  id: string;
  sender: 'user' | 'assistant';
  text?: string;
  response?: CopilotAskResponse;
  timestamp: string;
}

interface ChatMessageProps {
  message: ChatMessageItem;
  onSelectCitation: (sourceId: string) => void;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, onSelectCitation }) => {
  const isUser = message.sender === 'user';

  if (isUser) {
    return (
      <div className="flex items-start justify-end gap-3 max-w-2xl ml-auto">
        <div className="p-3.5 rounded-2xl rounded-tr-xs bg-indigo-600 text-white text-sm leading-relaxed shadow-xs">
          {message.text}
        </div>
        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-indigo-700 dark:text-indigo-300 shrink-0">
          <User className="w-4 h-4" />
        </div>
      </div>
    );
  }

  const { answer, status, status_reason, citations, facts } = message.response || {};

  return (
    <div className="flex items-start gap-3 max-w-3xl mr-auto">
      <div className="w-8 h-8 rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 flex items-center justify-center shrink-0 shadow-xs">
        <Bot className="w-4 h-4" />
      </div>

      <div className="flex-1 space-y-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl rounded-tl-xs shadow-xs">
        {/* Trust Status Header */}
        {status && <TrustBadge status={status} reason={status_reason} />}

        {/* Answer Text */}
        <div className="text-zinc-800 dark:text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">
          {answer}
        </div>

        {/* Structured Facts Banner (Deadlines/Decisions) */}
        {facts && facts.length > 0 && (
          <div className="pt-2">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
              Extracted Directives
            </div>
            <div className="grid gap-1.5">
              {facts.map((fact: StructuredFact, idx: number) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-md bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/70 dark:border-zinc-700/60 text-xs"
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {fact.title}
                  </span>
                  {fact.due_date && (
                    <span className="flex items-center gap-1 font-mono text-zinc-500 text-[11px]">
                      <Calendar className="w-3 h-3" />
                      {new Date(fact.due_date).toLocaleString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Citations / Evidence Footnotes */}
        {citations && citations.length > 0 && (
          <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <div className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Verified Evidence Sources
            </div>
            <div className="flex flex-wrap gap-1.5">
              {citations.map((citation) => (
                <CitationPill
                  key={citation.citation_id}
                  citation={citation}
                  onClick={onSelectCitation}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};