import React from 'react';
import {
  Search,
  Sparkles,
  CheckSquare,
  Download,
  Building2,
  Stethoscope,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { MainNavSection } from './Sidebar';
import { useWorkspace } from '../context/WorkspaceContext';

interface HeaderProps {
  currentSection: MainNavSection;
  onSearch: (query: string) => void;
  onOpenTestCases: () => void;
  onGenerateSamples: () => void;
  onExportClick?: () => void;
  isGeneratingSamples?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentSection,
  onSearch,
  onOpenTestCases,
  onGenerateSamples,
  onExportClick,
  isGeneratingSamples,
}) => {
  const { recruitmentCompany, setRecruitmentCompany, isDualCompany, supabaseStatus, refreshSupabase } = useWorkspace();

  const isSharedSection =
    currentSection === 'home' ||
    currentSection === 'marketing' ||
    currentSection === 'settings';

  const getSectionTitle = () => {
    switch (currentSection) {
      case 'home':
        return {
          title: 'DM Portal Home',
          subtitle: 'Executive operations summary: attendance status, pending approvals, and urgent tasks',
        };
      case 'marketing':
        return {
          title: 'Digital Marketing Operations',
          subtitle: 'Team attendance, break compliance, task execution, content pipeline, and daily reports',
        };
      case 'settings':
        return {
          title: 'DM Portal Settings',
          subtitle: 'Marketing team roster, break compliance rules, and operational preferences',
        };
      case 'recruitment-overview':
        return {
          title: 'Recruitment Overview',
          subtitle: `Active recruitment requisitions, screening pipeline & volume for ${recruitmentCompany}`,
        };
      case 'filter':
        return {
          title: 'LinkedIn Application Filter',
          subtitle: `Daily screening, duplicate verification, and Copy Center for ${recruitmentCompany}`,
        };
      case 'master-candidates':
        return {
          title: 'Master Candidate Database',
          subtitle: `Unified Candidate CRM: single profile identity across multiple applications in ${recruitmentCompany}`,
        };
      case 'reports':
        return {
          title: 'Periodic Recruitment Reports',
          subtitle: `Daily, weekly, and monthly recruitment analytics for ${recruitmentCompany}`,
        };
      case 'company-settings':
        return {
          title: `${recruitmentCompany} Recruitment Settings`,
          subtitle: `Baseline requisitions (${recruitmentCompany === 'AaraTech' ? 21 : 10} slots) and company database configuration`,
        };
      default:
        return {
          title: 'DM Portal',
          subtitle: 'Enterprise Operations & Recruitment Platform',
        };
    }
  };

  const { title, subtitle } = getSectionTitle();

  return (
    <header className="bg-white border-b border-[#E0E6EF] sticky top-0 z-20 px-6 py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
      {/* Title & Context Badge */}
      <div className="flex items-center gap-3 min-w-0">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-base font-bold text-[#18243A] tracking-tight leading-none">{title}</h1>
            {isSharedSection ? (
              <span className="badge-info uppercase tracking-wider text-[10px]">
                Shared DM Portal
              </span>
            ) : (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                  recruitmentCompany === 'AaraTech'
                    ? 'bg-[#E8EDFA] text-[#2948BC] border-[#D0DBF5]'
                    : 'bg-[#E6F5F1] text-[#16836B] border-[#A3DCD0]'
                }`}
              >
                {recruitmentCompany} ({recruitmentCompany === 'AaraTech' ? '21 Slots' : '10 Slots'})
              </span>
            )}
          </div>
          <p className="text-xs text-[#65738B] mt-1 truncate">{subtitle}</p>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center flex-wrap gap-2 shrink-0">
        {/* Recruitment Company Pill Switcher (Shown ONLY in Recruitment Views) */}
        {!isSharedSection && isDualCompany && (
          <div className="bg-[#F1F4F9] border border-[#E0E6EF] p-0.5 rounded-lg flex items-center text-xs">
            <button
              type="button"
              onClick={() => setRecruitmentCompany('AaraTech')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all text-xs cursor-pointer ${
                recruitmentCompany === 'AaraTech'
                  ? 'bg-white text-[#3659D9] shadow-xs border border-[#CBD5E1] font-bold'
                  : 'text-[#65738B] hover:text-[#18243A]'
              }`}
              title="Switch to AaraTech recruitment workspace"
            >
              <Building2 className="w-3.5 h-3.5 text-[#3659D9]" />
              <span>AaraTech</span>
            </button>
            <button
              type="button"
              onClick={() => setRecruitmentCompany('ClinisolTech')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all text-xs cursor-pointer ${
                recruitmentCompany === 'ClinisolTech'
                  ? 'bg-white text-[#16836B] shadow-xs border border-[#CBD5E1] font-bold'
                  : 'text-[#65738B] hover:text-[#18243A]'
              }`}
              title="Switch to ClinisolTech recruitment workspace"
            >
              <Stethoscope className="w-3.5 h-3.5 text-[#16836B]" />
              <span>ClinisolTech</span>
            </button>
          </div>
        )}

        {/* Real Verified Database Health Indicator */}
        <button
          type="button"
          onClick={() => refreshSupabase()}
          title={supabaseStatus?.message || `${recruitmentCompany} Database Status (Click to re-verify)`}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
            supabaseStatus?.connected
              ? 'bg-[#E6F5F1] text-[#16836B] border-[#A3DCD0] hover:bg-[#D6EDE7]'
              : 'bg-[#FEF6E9] text-[#A66B19] border-[#F8D8A8] hover:bg-[#FDF0D5]'
          }`}
        >
          {supabaseStatus?.connected ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[#16836B]" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 text-[#A66B19]" />
          )}
          <span>
            {supabaseStatus?.connected
              ? isSharedSection
                ? 'Portal DB Online'
                : `${recruitmentCompany} DB Online`
              : 'Standalone Storage'}
          </span>
        </button>

        {/* Global Search Bar */}
        <div className="relative min-w-[160px] md:min-w-[190px]">
          <Search className="w-3.5 h-3.5 text-[#8995A8] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search records, rules..."
            onChange={(e) => onSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1 text-xs bg-[#F1F4F9] border border-[#E0E6EF] rounded-lg text-[#18243A] placeholder-[#8995A8] focus:outline-none focus:border-[#3659D9] focus:bg-white focus:ring-1 focus:ring-[#3659D9]/20 transition-all"
          />
        </div>

        {/* 12 Legal Screening Tests Modal Trigger (Secondary Sapphire Action) */}
        <button
          type="button"
          onClick={onOpenTestCases}
          className="btn-secondary !py-1 !px-2.5 !text-xs shadow-2xs"
          title="Verify Legal Screening Engine 12 Test Cases"
        >
          <CheckSquare className="w-3.5 h-3.5 text-[#3659D9]" />
          <span>12 Tests</span>
        </button>

        {/* Quick Sample XLSX Generator (Tertiary Neutral Action) */}
        <button
          type="button"
          onClick={onGenerateSamples}
          disabled={isGeneratingSamples}
          className="btn-tertiary !py-1 !px-2.5 !text-xs shadow-2xs disabled:opacity-50"
          title="Generate sample Excel spreadsheets for testing"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#3659D9]" />
          <span>{isGeneratingSamples ? 'Generating...' : 'Samples'}</span>
        </button>

        {/* Export Modal Trigger (Primary Sapphire Action) */}
        {onExportClick && (
          <button
            type="button"
            onClick={onExportClick}
            className="btn-primary !py-1 !px-3 !text-xs shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        )}
      </div>
    </header>
  );
};
