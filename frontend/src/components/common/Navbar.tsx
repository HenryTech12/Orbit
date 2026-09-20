import React from 'react';
import { NavLink } from 'react-router-dom';
import { MessageSquare, Calendar, UploadCloud, Shield, UserCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export const Navbar: React.FC = () => {
  // Local state to simulate Admin vs. Student role switching
const { isAdmin, loginAs } = useAuth();

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand & Project Identity */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold shadow-xs">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
              Sentinel <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900">UniPods</span>
            </h1>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-none">
              Knowledge Copilot & Operational Memory
            </p>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex items-center gap-1 sm:gap-2">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`
            }
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </NavLink>

          <NavLink
            to="/catch-up"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-zinc-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`
            }
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Catch Up</span>
          </NavLink>

          {/* Admin-only Ingestion Link */}
          {isAdmin && (
            <NavLink
              to="/upload"
              className={({ isActive }) =>
                `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400'
                    : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
                }`
              }
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Ingestion</span>
              <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 font-semibold">Admin</span>
            </NavLink>
          )}
        </nav>

        {/* Role Toggle Switch */}
        <div className="flex items-center gap-2 border-l border-zinc-200 dark:border-zinc-800 pl-3">
         <button
  type="button"
  onClick={() => loginAs(isAdmin ? 'student' : 'admin')}
  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
>
  <UserCheck className="w-3.5 h-3.5 text-indigo-500" />
  <span className="font-medium text-[11px]">
    {isAdmin ? 'Mode: Admin' : 'Mode: Student'}
  </span>
</button>
        </div>
      </div>
    </header>
  );
};