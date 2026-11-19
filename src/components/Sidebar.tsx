import React from 'react';
import {
  Home,
  Filter,
  Users,
  FileBarChart2,
  Sparkles,
  Settings,
  Building2,
  Stethoscope,
  LogOut,
  Layers,
  ShieldCheck,
  Briefcase
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { APP_VERSION_CODE } from '../shared/version';

export type MainNavSection =
  | 'home'
  | 'marketing'
  | 'settings'
  | 'recruitment-overview'
  | 'filter'
  | 'master-candidates'
  | 'reports'
  | 'company-settings';

export type NavTab =
  | MainNavSection
  | 'dashboard'
  | 'jobs'
  | 'applicants'
  | 'applicants-all'
  | 'applicants-pass'
  | 'applicants-fail'
  | 'applicants-review'
  | 'imports'
  | 'upload'
  | 'audit'
  | 'candidates'
  | 'settings';

interface SidebarProps {
  currentSection: MainNavSection;
  onSelectSection: (section: MainNavSection) => void;
  badgeCounts?: {
    totalApplications?: number;
    passed?: number;
    manualReview?: number;
    masterCandidates?: number;
  };
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentSection,
  onSelectSection,
  badgeCounts,
}) => {
  const { user, recruitmentCompany, setRecruitmentCompany, isDualCompany, logout } = useWorkspace();

  const isSharedSection =
    currentSection === 'home' ||
    currentSection === 'marketing' ||
    currentSection === 'settings';

  const sharedNavItems: Array<{
    id: MainNavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string;
    badgeColor?: string;
  }> = [
    {
      id: 'home',
      label: 'DM Portal Home',
      icon: Home,
    },
    {
      id: 'marketing',
      label: 'Digital Marketing Operations',
      icon: Sparkles,
      badge: 'Active',
      badgeColor: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60',
    },
    {
      id: 'settings',
      label: 'DM Team & Settings',
      icon: Settings,
    },
  ];

  const recruitmentNavItems: Array<{
    id: MainNavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string;
    badgeColor?: string;
  }> = [
    {
      id: 'recruitment-overview',
      label: 'Recruitment Overview',
      icon: Briefcase,
    },
    {
      id: 'filter',
      label: 'LinkedIn Application Filter',
      icon: Filter,
      badge: badgeCounts?.totalApplications,
      badgeColor: 'bg-[#25334C] text-[#6E8BFF] border-[#34415A]',
    },
    {
      id: 'master-candidates',
      label: 'Master Candidate Database',
      icon: Users,
      badge: badgeCounts?.masterCandidates,
      badgeColor: 'bg-[#25334C] text-[#B9C5D9] border-[#34415A]',
    },
    {
      id: 'reports',
      label: 'Recruitment Reports',
      icon: FileBarChart2,
    },
    {
      id: 'company-settings',
      label: 'Company Recruitment Settings',
      icon: ShieldCheck,
    },
  ];

  const renderNavGroup = (
    title: string,
    items: typeof sharedNavItems
  ) => (
    <div className="space-y-0.5">
      <div className="px-3 pt-2 pb-1 text-[10px] font-bold text-[#8995A8] uppercase tracking-wider">
        {title}
      </div>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentSection === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectSection(item.id)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all text-left group cursor-pointer ${
              isActive
                ? 'bg-[#2A3852] text-[#F7F9FD] font-semibold border-l-[3px] border-[#6E8BFF] pl-2.5 shadow-xs'
                : 'text-[#B9C5D9] hover:text-[#F7F9FD] hover:bg-[#25334C] font-medium'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-[#6E8BFF]' : 'text-[#8995A8] group-hover:text-[#F7F9FD]'}`} />
              <span className="truncate">{item.label}</span>
            </div>
            {item.badge !== undefined && (
              <span
                className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded font-bold ml-1.5 shrink-0 border ${
                  isActive
                    ? 'bg-[#18243A] text-[#6E8BFF] border-[#6E8BFF]/40'
                    : item.badgeColor || 'bg-[#25334C] text-[#B9C5D9] border-[#34415A]'
                }`}
              >
                {typeof item.badge === 'number' ? item.badge.toLocaleString() : item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <aside className="w-64 bg-[#18243A] border-r border-[#34415A] text-[#F7F9FD] flex flex-col shrink-0 min-h-screen select-none">
      {/* Portal Brand Header */}
      <div className="p-4 border-b border-[#34415A] bg-[#18243A]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#3659D9] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
            <Layers className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-[#F7F9FD] tracking-tight leading-tight">
                DM Portal
              </span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#25334C] text-[#B9C5D9] border border-[#34415A]">
                2026
              </span>
            </div>
            <p className="text-[10px] text-[#B9C5D9] font-medium truncate mt-0.5">
              Operations &amp; Talent Platform
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {/* GROUP 1: SHARED DM PORTAL */}
        {renderNavGroup('Shared DM Portal', sharedNavItems)}

        {/* GROUP 2: RECRUITMENT WORKSPACE */}
        <div className="space-y-2 pt-2 border-t border-[#34415A]">
          <div className="px-3 pt-1 flex items-center justify-between">
            <span className="text-[10px] font-bold text-[#8995A8] uppercase tracking-wider">
              Recruitment Workspace
            </span>
          </div>

          {/* Authoritative Single Company Switcher */}
          {isDualCompany && (
            <div className="mx-1 bg-[#202D45] p-0.5 rounded-lg border border-[#34415A] flex items-center text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setRecruitmentCompany('AaraTech')}
                className={`flex-1 py-1 px-1 rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  recruitmentCompany === 'AaraTech'
                    ? 'bg-[#2A3852] text-[#F7F9FD] border border-[#485B80] font-bold shadow-xs'
                    : 'text-[#B9C5D9] hover:text-[#F7F9FD] hover:bg-[#25334C]'
                }`}
                title="AaraTech: 21 Requisition Slots"
              >
                <Building2 className={`w-3 h-3 shrink-0 ${recruitmentCompany === 'AaraTech' ? 'text-[#6E8BFF]' : 'text-[#8995A8]'}`} />
                <span>AaraTech (21 Slots)</span>
              </button>
              <button
                type="button"
                onClick={() => setRecruitmentCompany('ClinisolTech')}
                className={`flex-1 py-1 px-1 rounded flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  recruitmentCompany === 'ClinisolTech'
                    ? 'bg-[#2A3852] text-[#F7F9FD] border border-[#485B80] font-bold shadow-xs'
                    : 'text-[#B9C5D9] hover:text-[#F7F9FD] hover:bg-[#25334C]'
                }`}
                title="ClinisolTech: 10 Requisition Slots"
              >
                <Stethoscope className={`w-3 h-3 shrink-0 ${recruitmentCompany === 'ClinisolTech' ? 'text-[#10B981]' : 'text-[#8995A8]'}`} />
                <span>ClinisolTech (10 Slots)</span>
              </button>
            </div>
          )}

          {renderNavGroup(`${recruitmentCompany} Workspace`, recruitmentNavItems)}
        </div>
      </nav>

      {/* Scope Status Indicator */}
      <div className="p-3 border-t border-[#34415A] bg-[#141E30]/80 text-xs text-[#B9C5D9]">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-semibold text-[#8995A8]">Active Context:</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
            isSharedSection
              ? 'bg-[#25334C] text-[#C4D1FA] border-[#34415A]'
              : recruitmentCompany === 'AaraTech'
              ? 'bg-[#25334C] text-[#6E8BFF] border-[#34415A]'
              : 'bg-[#25334C] text-[#10B981] border-[#34415A]'
          }`}>
            {isSharedSection ? 'Shared Operations' : `${recruitmentCompany} Recruitment`}
          </span>
        </div>
        <div className="text-[11px] text-[#8995A8] flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className={`w-3.5 h-3.5 shrink-0 ${isSharedSection ? 'text-[#6E8BFF]' : 'text-[#10B981]'}`} />
            <span>
              {isSharedSection
                ? 'Independent team operations'
                : 'Isolated company database'}
            </span>
          </div>
          <span className="font-mono text-[9px] font-bold text-[#6E8BFF] bg-[#1E293B] px-1.5 py-0.5 rounded border border-[#34415A]">
            {APP_VERSION_CODE}
          </span>
        </div>
      </div>

      {/* User Footer with Sign Out */}
      <div className="p-3 border-t border-[#34415A] flex items-center justify-between text-xs text-[#B9C5D9] bg-[#141E30]">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-[#2A3852] text-[#F7F9FD] border border-[#34415A] flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
            {user?.name ? user.name[0].toUpperCase() : 'U'}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-[#F7F9FD] truncate leading-tight">
              {user?.name || 'Recruiter Admin'}
            </div>
            <div className="text-[10px] text-[#10B981] font-medium">● Authorized</div>
          </div>
        </div>
        <button
          onClick={logout}
          title="Sign Out"
          className="p-1.5 rounded-lg text-[#8995A8] hover:text-[#FDF0F1] hover:bg-[#25334C] transition-colors shrink-0 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
