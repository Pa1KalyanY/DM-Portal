import React, { useState, useEffect } from 'react';
import { Sidebar, MainNavSection } from './components/Sidebar';
import { Header } from './components/Header';
import { DmPortalHomeView } from './views/portal/DmPortalHomeView';
import { RecruitmentOverviewView } from './views/recruitment/RecruitmentOverviewView';
import { ApplicationFilterWorkspaceView } from './views/filter/ApplicationFilterWorkspaceView';
import { PeriodicReportsView } from './views/reports/PeriodicReportsView';
import { TeamSettingsView } from './views/settings/TeamSettingsView';
import { DmPortalSettingsView } from './views/settings/DmPortalSettingsView';
import { MarketingWorkspaceView } from './views/marketing/MarketingWorkspaceView';
import { CandidatesListView } from './views/candidates/CandidatesListView';
import { CandidateProfileView } from './views/candidates/CandidateProfileView';
import { TestCasesModal } from './views/TestCasesModal';
import { ExportModal } from './components/ExportModal';
import { ErrorBoundary } from './components/ErrorBoundary';

// Auth & Workspace Selection
import { AuthView } from './views/auth/AuthView';
import { WorkspaceSelectorModal } from './views/auth/WorkspaceSelectorModal';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';

import { DashboardStats } from './types';
import { api } from './api/client';
import { dbService } from './services/masterDbService';
import {
  readNavigationStateFromUrl,
  syncNavigationToUrlAndStorage,
  VALID_SECTIONS,
} from './shared/navigationState';

function MainAppContent() {
  const { user, activeCompany, setRecruitmentCompany, hasSelectedWorkspace, isDualCompany, activeArea, setActiveArea } = useWorkspace();
  const [currentSection, setCurrentSection] = useState<MainNavSection>(() => {
    const urlState = readNavigationStateFromUrl();
    if (urlState.section && VALID_SECTIONS.includes(urlState.section)) {
      return urlState.section;
    }
    const saved = localStorage.getItem('aat_nav_section');
    if (saved && VALID_SECTIONS.includes(saved as MainNavSection)) {
      return saved as MainNavSection;
    }
    return activeArea === 'recruitment' ? 'recruitment-overview' : 'home';
  });
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(() => {
    const urlState = readNavigationStateFromUrl();
    return urlState.candidateId || null;
  });

  const handleSelectSection = (sec: MainNavSection) => {
    setSelectedCandidateId(null);
    setCurrentSection(sec);
    localStorage.setItem('aat_nav_section', sec);
    if (sec === 'home' || sec === 'marketing' || sec === 'settings') {
      setActiveArea('portal');
    } else {
      setActiveArea('recruitment');
    }
    syncNavigationToUrlAndStorage({
      section: sec,
      company: activeCompany,
      candidateId: null,
    }, 'push');
  };

  const handleOpenCandidate = (personId: string) => {
    setSelectedCandidateId(personId);
    syncNavigationToUrlAndStorage({
      section: currentSection,
      company: activeCompany,
      candidateId: personId,
    }, 'push');
  };

  const handleCloseCandidate = () => {
    setSelectedCandidateId(null);
    syncNavigationToUrlAndStorage({
      section: currentSection,
      company: activeCompany,
      candidateId: null,
    }, 'push');
  };

  // Sync navigation on browser back/forward buttons (popstate)
  useEffect(() => {
    const handlePopState = () => {
      const urlState = readNavigationStateFromUrl();
      if (urlState.section && VALID_SECTIONS.includes(urlState.section)) {
        setCurrentSection(urlState.section);
        if (urlState.section === 'home' || urlState.section === 'marketing' || urlState.section === 'settings') {
          setActiveArea('portal');
        } else {
          setActiveArea('recruitment');
        }
      }
      if (urlState.company && (urlState.company === 'AaraTech' || urlState.company === 'ClinisolTech')) {
        setRecruitmentCompany(urlState.company);
      }
      if (urlState.candidateId !== undefined) {
        setSelectedCandidateId(urlState.candidateId);
      } else {
        setSelectedCandidateId(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setRecruitmentCompany, setActiveArea]);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isGeneratingSamples, setIsGeneratingSamples] = useState(false);

  // Master DB Badge Count
  const [masterCandidateCount, setMasterCandidateCount] = useState<number>(0);

  const loadDashboardStats = async () => {
    try {
      setLoadingStats(true);
      const data = await api.getDashboardStats(activeCompany);
      setStats(data);
    } catch (err) {
      console.error('Error fetching dashboard stats:', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadMasterBadges = async () => {
    try {
      const candidatesRes = await dbService.getCandidates({ page: 1, pageSize: 1, company: activeCompany });
      setMasterCandidateCount(candidatesRes.totalCount || 0);
    } catch (err) {
      console.warn('Could not load master candidate count:', err);
    }
  };

  useEffect(() => {
    loadDashboardStats();
    loadMasterBadges();

    const handleDataUpdate = () => {
      loadDashboardStats();
      loadMasterBadges();
    };

    window.addEventListener('workspace-data-updated', handleDataUpdate);
    return () => {
      window.removeEventListener('workspace-data-updated', handleDataUpdate);
    };
  }, [activeCompany]);

  // Auth Gate
  if (!user) {
    return <AuthView onLoginSuccess={() => loadMasterBadges()} />;
  }

  // Workspace Selection Gate (for users with dual-company access who haven't selected yet)
  if (isDualCompany && !hasSelectedWorkspace) {
    return <WorkspaceSelectorModal />;
  }

  const handleGlobalSearch = (query: string) => {
    setGlobalSearch(query);
    if (query && currentSection !== 'filter' && currentSection !== 'master-candidates') {
      setCurrentSection('filter');
    }
  };

  const handleGenerateSamples = async () => {
    setIsGeneratingSamples(true);
    try {
      const res = await api.generateSamples();
      alert(`Success! Generated sample files in: ${res.directory}\n\nFiles:\n• ${res.files.join('\n• ')}\n\nYou can now upload them on the LinkedIn Application Filter!`);
      loadDashboardStats();
    } catch (err: any) {
      alert(`Error generating samples: ${err.message}`);
    } finally {
      setIsGeneratingSamples(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#F1F4F9] text-[#18243A] overflow-hidden font-sans">
      {/* 12 Engine Tests Modal */}
      {isTestModalOpen && (
        <TestCasesModal onClose={() => setIsTestModalOpen(false)} />
      )}

      {/* Multiple Options Export Modal */}
      {isExportModalOpen && (
        <ExportModal
          defaultStatus="PASS"
          onClose={() => setIsExportModalOpen(false)}
        />
      )}

      {/* Clean Light-Theme Sidebar with Independent Portals */}
      <Sidebar
        currentSection={currentSection}
        onSelectSection={handleSelectSection}
        badgeCounts={{
          totalApplications: stats?.applicantsProcessed || 0,
          passed: stats?.passedCount || 0,
          manualReview: stats?.manualReviewCount || 0,
          masterCandidates: masterCandidateCount,
        }}
      />

      {/* Main Workspace Area (Soft Platinum Canvas) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F1F4F9]">
        {/* Top Header */}
        <Header
          currentSection={currentSection}
          onSearch={handleGlobalSearch}
          onOpenTestCases={() => setIsTestModalOpen(true)}
          onGenerateSamples={handleGenerateSamples}
          onExportClick={() => setIsExportModalOpen(true)}
          isGeneratingSamples={isGeneratingSamples}
        />

        {/* Dynamic Section Router */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* SECTION 1: DM Portal Home (Shared Portal) */}
          {currentSection === 'home' && (
            <DmPortalHomeView onNavigate={(sec) => handleSelectSection(sec as MainNavSection)} />
          )}

          {/* SECTION 1B: Recruitment Overview (Company Workspace) */}
          {currentSection === 'recruitment-overview' && (
            <RecruitmentOverviewView onNavigate={(sec) => handleSelectSection(sec as MainNavSection)} />
          )}

          {/* SECTION 2: LinkedIn Application Filter (8-Step Daily Process) */}
          {currentSection === 'filter' && (
            <ApplicationFilterWorkspaceView />
          )}

          {/* SECTION 3: Master Candidate Database (CRM) */}
          {currentSection === 'master-candidates' && (
            <CandidatesListView
              onSelectCandidate={handleOpenCandidate}
              initialSearchQuery={globalSearch}
              currentUserCompany={activeCompany}
            />
          )}

          {/* SECTION 4: Daily/Weekly/Monthly Reports */}
          {currentSection === 'reports' && (
            <PeriodicReportsView />
          )}

          {/* SECTION 5: Digital Marketing Operations (Shared Portal) */}
          {currentSection === 'marketing' && (
            <MarketingWorkspaceView />
          )}

          {/* SECTION 6: DM Portal Settings (Shared Portal) */}
          {currentSection === 'settings' && (
            <DmPortalSettingsView />
          )}

          {/* SECTION 7: Company Recruitment Settings (Company Workspace) */}
          {currentSection === 'company-settings' && (
            <TeamSettingsView />
          )}
        </main>
      </div>

      {/* Candidate Profile Modal / Drawer */}
      {selectedCandidateId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-5xl max-h-[92vh] bg-white border border-slate-200 rounded-xl shadow-xl overflow-y-auto p-6">
            <ErrorBoundary fallbackTitle="Could not load candidate profile" onReset={handleCloseCandidate}>
              <CandidateProfileView
                personId={selectedCandidateId}
                onBack={handleCloseCandidate}
                onNavigateCandidate={(id) => handleOpenCandidate(id)}
              />
            </ErrorBoundary>
          </div>
        </div>
      )}
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary fallbackTitle="Application Error">
      <WorkspaceProvider>
        <MainAppContent />
      </WorkspaceProvider>
    </ErrorBoundary>
  );
}

export default App;
