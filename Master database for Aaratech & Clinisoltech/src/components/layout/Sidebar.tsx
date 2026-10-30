import React from 'react';
import {
  LayoutDashboard,
  UploadCloud,
  Users,
  Search,
  GitMerge,
  Layers,
  BarChart3,
  Briefcase,
  Settings,
  ShieldCheck,
  Building2,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';

export type ActivePage =
  | 'dashboard'
  | 'import'
  | 'candidates'
  | 'candidate-profile'
  | 'search'
  | 'possible-matches'
  | 'merge'
  | 'reports'
  | 'jobs'
  | 'jobs-aaratech'
  | 'jobs-clinisoltech'
  | 'incomplete'
  | 'settings';

import { UserSession } from '../../lib/authService';

interface SidebarProps {
  activePage: ActivePage;
  onNavigate: (page: ActivePage) => void;
  possibleMatchesCount: number;
  incompleteCount?: number;
  currentUser?: UserSession | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  onNavigate,
  possibleMatchesCount,
  incompleteCount = 0,
  currentUser,
}) => {
  const company = currentUser?.company || 'Both';

  return (
    <aside className="w-64 bg-slate-950 text-slate-300 flex flex-col shrink-0 border-r border-slate-800 min-h-screen">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800/80 bg-slate-950/60">
        <div className="flex items-center gap-2.5">
          <div
            className={`h-9 w-9 rounded-lg flex items-center justify-center text-white shadow-md ${
              company === 'AaraTech'
                ? 'bg-blue-600 shadow-blue-500/20'
                : company === 'ClinisolTech'
                ? 'bg-indigo-600 shadow-indigo-500/20'
                : 'bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-blue-500/20'
            }`}
          >
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="font-bold text-white tracking-tight text-sm flex items-center gap-1.5">
              {company === 'AaraTech' ? (
                <span className="text-blue-400">AaraTech</span>
              ) : company === 'ClinisolTech' ? (
                <span className="text-indigo-400">ClinisolTech</span>
              ) : (
                <>
                  <span>AaraTech</span>
                  <span className="text-slate-500">|</span>
                  <span className="text-blue-400">ClinisolTech</span>
                </>
              )}
            </div>
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {company === 'AaraTech'
                ? 'IT & Tech Recruiting'
                : company === 'ClinisolTech'
                ? 'Clinical Talent CRM'
                : 'Master Candidate DB'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Main Core
        </div>

        <button
          onClick={() => onNavigate('dashboard')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activePage === 'dashboard'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 text-slate-400 group-hover:text-white" />
          <span>Dashboard</span>
        </button>

        <button
          onClick={() => onNavigate('import')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activePage === 'import'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <UploadCloud className="w-4 h-4 text-slate-400" />
          <span>Manual Application Upload</span>
        </button>

        <button
          onClick={() => onNavigate('candidates')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activePage === 'candidates' || activePage === 'candidate-profile'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4 text-slate-400" />
          <span>Candidates</span>
        </button>

        <button
          onClick={() => onNavigate('search')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activePage === 'search'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <Search className="w-4 h-4 text-slate-400" />
          <span>Search</span>
        </button>

        <div className="px-3 pt-4 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Deduplication & Operations
        </div>

        <button
          onClick={() => onNavigate('possible-matches')}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activePage === 'possible-matches'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <Layers className="w-4 h-4 text-slate-400" />
            <span>Possible Matches</span>
          </div>
          {possibleMatchesCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {possibleMatchesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onNavigate('merge')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activePage === 'merge'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <GitMerge className="w-4 h-4 text-slate-400" />
          <span>Merge Candidates</span>
        </button>

        <button
          onClick={() => onNavigate('incomplete')}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activePage === 'incomplete'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>Incomplete Profiles</span>
          </div>
          {incompleteCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
              {incompleteCount}
            </span>
          )}
        </button>

        <button
          onClick={() => onNavigate('reports')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activePage === 'reports'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-slate-400" />
          <span>Reports</span>
        </button>

        <div className="px-3 pt-4 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Requisition Management
        </div>

        <button
          onClick={() => onNavigate('jobs')}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activePage === 'jobs' || activePage === 'jobs-aaratech' || activePage === 'jobs-clinisoltech'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <div className="flex items-center gap-3">
            <Briefcase className="w-4 h-4 text-slate-400" />
            <span>Requisitions &amp; Jobs</span>
          </div>
        </button>

        <div className="px-3 pt-4 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Administration
        </div>

        <button
          onClick={() => onNavigate('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            activePage === 'settings'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-300 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Settings & Supabase</span>
        </button>
      </nav>

      {/* Footer System Status Info */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/40">
        <div className="rounded-lg bg-slate-900/80 p-2.5 border border-slate-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-300">Phase 1: Active</span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <div className="text-[10px] text-slate-400">
            Master Candidate Database Engine
          </div>
        </div>
      </div>
    </aside>
  );
};
