import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

export const NotFound: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
      </div>
      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
        Page Not Found
      </h2>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mt-1 mb-6">
        The route you are looking for does not exist or has been relocated within Sentinel.
      </p>
      <Link
        to="/"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium hover:opacity-90 transition-opacity"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Return to Chat</span>
      </Link>
    </div>
  );
};