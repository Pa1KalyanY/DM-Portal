import React, { useState } from 'react';
import { Search, Database, Bell, User, LogOut, KeyRound, ChevronDown } from 'lucide-react';
import { UserSession } from '../../lib/authService';

interface HeaderProps {
  onSearch: (query: string) => void;
  onOpenSettings: () => void;
  supabaseConnected: boolean;
  searchQuery: string;
  currentUser: UserSession | null;
  onSignOut: () => void;
  onChangePassword: () => void;
  selectedCompany?: 'Both' | 'AaraTech' | 'ClinisolTech';
  onSelectCompany?: (company: 'Both' | 'AaraTech' | 'ClinisolTech') => void;
}

export const Header: React.FC<HeaderProps> = ({
  onSearch,
  onOpenSettings,
  supabaseConnected,
  searchQuery,
  currentUser,
  onSignOut,
  onChangePassword,
  selectedCompany = 'Both',
  onSelectCompany,
}) => {
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(localSearch);
  };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Global Search Bar */}
      <form onSubmit={handleSubmit} className="flex-1 max-w-2xl relative">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
          <input
            type="text"
            value={localSearch}
            onChange={(e) => {
              setLocalSearch(e.target.value);
              onSearch(e.target.value);
            }}
            placeholder="Search by name, email, phone, LinkedIn or Person ID (e.g. P-000123)..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all shadow-inner"
          />
          {localSearch && (
            <button
              type="button"
              onClick={() => {
                setLocalSearch('');
                onSearch('');
              }}
              className="absolute right-3 text-xs text-slate-400 hover:text-slate-600 font-medium"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Company Switcher Pill: Instant AaraTech vs ClinisolTech Isolation */}
      {onSelectCompany && (
        <div className="hidden md:flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold mx-3 shrink-0 shadow-2xs">
          <button
            type="button"
            onClick={() => onSelectCompany('Both')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              selectedCompany === 'Both'
                ? 'bg-white text-slate-900 shadow-xs font-bold'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            All Companies
          </button>
          <button
            type="button"
            onClick={() => onSelectCompany('AaraTech')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              selectedCompany === 'AaraTech'
                ? 'bg-blue-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-blue-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-300"></span>
            AaraTech
          </button>
          <button
            type="button"
            onClick={() => onSelectCompany('ClinisolTech')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              selectedCompany === 'ClinisolTech'
                ? 'bg-indigo-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-indigo-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-indigo-300"></span>
            ClinisolTech
          </button>
        </div>
      )}

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Supabase Status Indicator */}
        <button
          onClick={onOpenSettings}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
            supabaseConnected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
          }`}
          title="Click to view database connection status"
        >
          <Database className="w-3.5 h-3.5" />
          <span>{supabaseConnected ? 'Supabase: Connected' : 'Supabase: Seed/Offline Mode'}</span>
          <span
            className={`w-2 h-2 rounded-full ${
              supabaseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            }`}
          />
        </button>

        {/* Notifications */}
        <button
          className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors relative"
          title="Notifications"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-600 rounded-full" />
        </button>

        {/* User Dropdown Pill */}
        <div className="relative pl-2 border-l border-slate-200">
          <button
            onClick={() => setUserMenuOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
              {getInitials(currentUser?.name)}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-slate-800 leading-tight">
                {currentUser?.name || 'Digital Marketing Team'}
              </div>
              <div className="text-[10px] text-slate-500 leading-tight">
                {currentUser?.email || 'marketing@aaratech.com'}
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* User Menu Dropdown */}
          {userMenuOpen && (
            <div className="absolute right-0 top-12 w-56 bg-white rounded-xl border border-slate-200 shadow-xl py-2 z-50 space-y-1">
              <div className="px-4 py-2 border-b border-slate-100">
                <div className="text-xs font-bold text-slate-900">{currentUser?.name || 'Digital Marketing Team'}</div>
                <div className="text-[11px] text-slate-500 truncate">{currentUser?.email}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 uppercase">
                    Marketing Team
                  </span>
                  <span className="text-[10px] text-slate-400">
                    AaraTech &amp; ClinisolTech
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  onChangePassword();
                }}
                className="w-full px-4 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                <span>Reset / Change Password</span>
              </button>

              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  onSignOut();
                }}
                className="w-full px-4 py-2 text-left text-xs font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2 border-t border-slate-100"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
