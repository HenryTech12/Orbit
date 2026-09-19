import React from 'react';
import type { TrustStatus } from '@/types/sentinel';
import { CheckCircle2, AlertTriangle, History, HelpCircle } from 'lucide-react';

interface TrustBadgeProps {
  status: TrustStatus;
  reason?: string;
}

export const TrustBadge: React.FC<TrustBadgeProps> = ({ status, reason }) => {
  const config = {
    CONFIRMED: {
      label: 'Confirmed',
      bgColor: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400',
      icon: CheckCircle2,
    },
    DISPUTED: {
      label: 'Disputed',
      bgColor: 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400',
      icon: AlertTriangle,
    },
    SUPERSEDED: {
      label: 'Superseded',
      bgColor: 'bg-blue-500/10 text-blue-600 border-blue-500/20 dark:text-blue-400',
      icon: History,
    },
    UNKNOWN: {
      label: 'Unknown / Insufficient Data',
      bgColor: 'bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-400',
      icon: HelpCircle,
    },
  }[status];

  const Icon = config.icon;

  return (
    <div className="flex flex-col gap-1 items-start">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${config.bgColor}`}
      >
        <Icon className="w-3.5 h-3.5" />
        {config.label}
      </span>
      {reason && (
        <span className="text-xs text-zinc-500 dark:text-zinc-400 italic pl-1">
          {reason}
        </span>
      )}
    </div>
  );
};