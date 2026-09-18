import React from 'react';
import { NavLink } from 'react-router-dom';
import { ShieldCheck, MessageSquare, Compass, UploadCloud } from 'lucide-react';

export const Navbar: React.FC = () => {
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400'
        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
    }`;

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xs sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-indigo-600 text-white shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-zinc-900 dark:text-zinc-100 text-base leading-none">
              Sentinel
            </div>
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
              UniPods Knowledge Copilot
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <NavLink to="/" className={navLinkClass}>
            <MessageSquare className="w-4 h-4" />
            <span>Ask Sentinel</span>
          </NavLink>
          <NavLink to="/catch-up" className={navLinkClass}>
            <Compass className="w-4 h-4" />
            <span>Catch Me Up</span>
          </NavLink>
          <NavLink to="/upload" className={navLinkClass}>
            <UploadCloud className="w-4 h-4" />
            <span>Import</span>
          </NavLink>
        </nav>
      </div>
    </header>
  );
};