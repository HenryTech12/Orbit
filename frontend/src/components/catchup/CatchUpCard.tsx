import React from 'react';
import type { Citation } from '@/types/sentinel';
import { CitationPill } from '@/components/citations/CitationPill';
import { Bell, CheckSquare, Clock, HelpCircle, type LucideIcon } from 'lucide-react';

interface CatchUpCardProps {
  type: 'announcement' | 'decision' | 'deadline' | 'action_item';
  title: string;
  description?: string;
  extraInfo?: string;
  citation: Citation;
  onSelectCitation: (sourceId: string) => void;
}

export const CatchUpCard: React.FC<CatchUpCardProps> = ({
  type,
  title,
  description,
  extraInfo,
  citation,
  onSelectCitation,
}) => {
  const config: Record<string, { icon: LucideIcon; border: string; iconColor: string }> = {
    announcement: {
      icon: Bell,
      border: 'border-l-amber-500',
      iconColor: 'text-amber-500',
    },
    decision: {
      icon: CheckSquare,
      border: 'border-l-indigo-500',
      iconColor: 'text-indigo-500',
    },
    deadline: {
      icon: Clock,
      border: 'border-l-rose-500',
      iconColor: 'text-rose-500',
    },
    action_item: {
      icon: HelpCircle,
      border: 'border-l-emerald-500',
      iconColor: 'text-emerald-500',
    },
  };

  const itemConfig = config[type] || config.announcement;
  const Icon = itemConfig.icon;

  return (
    <div
      className={`p-4 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 border-l-4 ${itemConfig.border} shadow-xs space-y-2`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${itemConfig.iconColor}`} />
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h4>
        </div>
        {extraInfo && (
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shrink-0">
            {extraInfo}
          </span>
        )}
      </div>

      {description && (
        <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed pl-6">
          {description}
        </p>
      )}

      <div className="pt-2 pl-6 flex items-center justify-between">
        <CitationPill citation={citation} onClick={onSelectCitation} />
      </div>
    </div>
  );
};