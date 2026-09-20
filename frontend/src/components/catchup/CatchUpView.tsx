import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { sentinelApi } from '@/services/api';
import { CatchUpCard } from './CatchUpCard';
import { EvidenceDrawer } from '@/components/citations/EvidenceDrawer';
import { RefreshCw, Loader2, Sparkles } from 'lucide-react';

export const CatchUpView: React.FC = () => {
  const [selectedDays, setSelectedDays] = useState<number>(10);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);

  // Compute ISO dates based on selection
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(toDate.getDate() - selectedDays);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['catchup', selectedDays],
    queryFn: () =>
      sentinelApi.catchUp({
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
        scope: 'cohort_1',
      }),
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Top Banner & Control Bar */}
      <div className="p-6 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Catch Me Up
            </h2>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Synthesized organizational memory across UniPods announcements, meetings, and discussions.
          </p>
        </div>

        {/* Range Selector Buttons */}
        <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
          {[3, 7, 10].map((days) => (
            <button
              key={days}
              onClick={() => setSelectedDays(days)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                selectedDays === days
                  ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              Last {days} Days
            </button>
          ))}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 ml-1 rounded-md text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors"
            title="Refresh updates"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
          <span className="text-sm">Synthesizing updates from recent days...</span>
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-600 text-sm">
          Failed to fetch catch-up data. Verify your backend or mock connection.
        </div>
      )}

      {/* Structured Content Grid */}
      {data && (
        <div className="space-y-8">
          {/* 1. Announcements */}
          {data.announcements && data.announcements.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <span>📢</span> Key Announcements
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.announcements.map((ann) => (
                  <CatchUpCard
                    key={ann.id}
                    type="announcement"
                    title={ann.title}
                    description={ann.summary}
                    extraInfo={new Date(ann.timestamp).toLocaleDateString()}
                    citation={ann.citation}
                    onSelectCitation={(id) => setSelectedSourceId(id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 2. Upcoming Deadlines */}
          {data.deadlines && data.deadlines.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <span>⏰</span> Upcoming Deadlines
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.deadlines.map((dl) => (
                  <CatchUpCard
                    key={dl.id}
                    type="deadline"
                    title={dl.title}
                    extraInfo={`Due: ${new Date(dl.due_date).toLocaleDateString()}`}
                    citation={dl.citation}
                    onSelectCitation={(id) => setSelectedSourceId(id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 3. Decisions Made */}
          {data.decisions && data.decisions.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <span>🧠</span> Confirmed Decisions
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.decisions.map((dec) => (
                  <CatchUpCard
                    key={dec.id}
                    type="decision"
                    title={dec.title}
                    description={dec.summary}
                    citation={dec.citation}
                    onSelectCitation={(id) => setSelectedSourceId(id)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 4. Action Items */}
          {data.action_items && data.action_items.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                <span>✅</span> Action Items
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.action_items.map((act) => (
                  <CatchUpCard
                    key={act.id}
                    type="action_item"
                    title={act.task}
                    extraInfo={act.assignee ? `Assignee: ${act.assignee}` : undefined}
                    citation={act.citation}
                    onSelectCitation={(id) => setSelectedSourceId(id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Shared Evidence Slide-Over Drawer */}
      <EvidenceDrawer
        sourceId={selectedSourceId}
        onClose={() => setSelectedSourceId(null)}
      />
    </div>
  );
};