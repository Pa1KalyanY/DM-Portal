import React, { useState, useEffect } from 'react';
import { Sidebar, ActivePage } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardView } from './components/dashboard/DashboardView';
import { ImportView } from './components/import/ImportView';
import { CandidatesListView } from './components/candidates/CandidatesListView';
import { CandidateProfileView } from './components/candidates/CandidateProfileView';
import { PossibleMatchesView } from './components/matches/PossibleMatchesView';
import { MergeCandidatesView } from './components/merge/MergeCandidatesView';
import { JobsView } from './components/jobs/JobsView';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';
import { GlobalSearchView } from './components/search/GlobalSearchView';
import { IncompleteProfilesView } from './components/incomplete/IncompleteProfilesView';
import { AuthView } from './components/auth/AuthView';
import { checkSupabaseHealth } from './lib/supabase';
import { dbService } from './lib/dbService';
import { authService, UserSession } from './lib/authService';
import { KeyRound, Lock, CheckCircle2, AlertCircle, X } from 'lucide-react';

export const App: React.FC = () => {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<UserSession | null>(() =>
    authService.getCurrentSession()
  );

  const [activePage, setActivePage] = useState<ActivePage>('dashboard');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const [possibleMatchesCount, setPossibleMatchesCount] = useState(0);
  const [incompleteCount, setIncompleteCount] = useState(0);
  const [selectedCompany, setSelectedCompany] = useState<'Both' | 'AaraTech' | 'ClinisolTech'>(
    currentUser?.company || 'Both'
  );

  // Password Reset Modal inside active session
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    checkConnection();
    refreshBadges();

    // Auto-resolve any pending incomplete profiles in the background on app launch
    const backgroundAutoResolve = async () => {
      try {
        if (dbService.getIncompleteCount() > 0) {
          const res = await dbService.autoRecoverIncompleteRecords();
          if (res.promotedCount > 0) {
            refreshBadges();
          }
        }
      } catch (e) {
        console.warn('Background auto-resolve error:', e);
      }
    };
    backgroundAutoResolve();
  }, []);

  const checkConnection = async () => {
    const health = await checkSupabaseHealth();
    setSupabaseConnected(health.connected);
  };

  const refreshBadges = async () => {
    const [list] = await Promise.all([
      dbService.getPossibleMatches(),
    ]);
    setPossibleMatchesCount(list.length);
    setIncompleteCount(dbService.getIncompleteCount());
  };

  const refreshPossibleMatchesBadge = async () => {
    refreshBadges();
  };

  const handleGlobalSearch = (query: string) => {
    setGlobalSearchQuery(query);
    if (query.trim()) {
      setActivePage('search');
    }
  };

  const handleSelectCandidate = (personId: string) => {
    setSelectedPersonId(personId);
    setActivePage('candidate-profile');
  };

  const handleNavigate = (page: ActivePage) => {
    setActivePage(page);
    if (page !== 'candidate-profile') {
      setSelectedPersonId(null);
    }
  };

  const handleSignOut = async () => {
    await authService.signOut();
    setCurrentUser(null);
    setActivePage('dashboard');
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPasswordInput.length < 6) {
      setPasswordError('Password must be at least 6 characters long.');
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordError('Passwords do not match.');
      return;
    }

    const res = await authService.updatePassword(newPasswordInput);
    if (res.success) {
      setPasswordSuccess(res.message);
      setTimeout(() => {
        setChangePasswordModalOpen(false);
        setNewPasswordInput('');
        setConfirmPasswordInput('');
        setPasswordSuccess(null);
      }, 2000);
    } else {
      setPasswordError(res.message);
    }
  };

  // If not authenticated, display Enterprise Auth Portal
  if (!currentUser) {
    return <AuthView onLoginSuccess={(user) => setCurrentUser(user)} />;
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden text-slate-900 font-sans">
      {/* Dark Navy Enterprise Left Navigation */}
      <Sidebar
        activePage={activePage}
        onNavigate={handleNavigate}
        possibleMatchesCount={possibleMatchesCount}
        incompleteCount={incompleteCount}
        currentUser={currentUser}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <Header
          onSearch={handleGlobalSearch}
          onOpenSettings={() => setActivePage('settings')}
          supabaseConnected={supabaseConnected}
          searchQuery={globalSearchQuery}
          currentUser={currentUser}
          onSignOut={handleSignOut}
          onChangePassword={() => setChangePasswordModalOpen(true)}
          selectedCompany={selectedCompany}
          onSelectCompany={setSelectedCompany}
        />

        {/* Scrollable View Content */}
        <main className="flex-1 overflow-y-auto bg-slate-50/70">
          {activePage === 'dashboard' && (
            <DashboardView
              onNavigate={handleNavigate}
              onSelectCandidate={handleSelectCandidate}
              currentUser={currentUser}
            />
          )}

          {activePage === 'import' && (
            <ImportView
              onImportComplete={() => {
                refreshBadges();
              }}
              onNavigateCandidates={() => handleNavigate('candidates')}
              onNavigateIncomplete={() => handleNavigate('incomplete')}
              defaultCompany={selectedCompany !== 'Both' ? selectedCompany : (currentUser?.company !== 'Both' ? currentUser?.company : 'AaraTech')}
            />
          )}

          {activePage === 'candidates' && (
            <CandidatesListView
              onSelectCandidate={handleSelectCandidate}
              initialSearchQuery={globalSearchQuery}
              currentUserCompany={selectedCompany !== 'Both' ? selectedCompany : currentUser?.company}
            />
          )}

          {activePage === 'candidate-profile' && selectedPersonId && (
            <CandidateProfileView
              personId={selectedPersonId}
              onBack={() => handleNavigate('candidates')}
              onNavigateCandidate={handleSelectCandidate}
            />
          )}

          {activePage === 'search' && (
            <GlobalSearchView
              initialQuery={globalSearchQuery}
              onSelectCandidate={handleSelectCandidate}
            />
          )}

          {activePage === 'possible-matches' && (
            <PossibleMatchesView
              onSelectCandidate={handleSelectCandidate}
              onRefreshBadge={refreshPossibleMatchesBadge}
              initialCompany={selectedCompany === 'Both' ? 'All' : selectedCompany}
            />
          )}

          {activePage === 'merge' && <MergeCandidatesView />}

          {(activePage === 'jobs' ||
            activePage === 'jobs-aaratech' ||
            activePage === 'jobs-clinisoltech') && (
            <JobsView
              initialCompany={
                activePage === 'jobs-aaratech'
                  ? 'AaraTech'
                  : activePage === 'jobs-clinisoltech'
                  ? 'ClinisolTech'
                  : selectedCompany !== 'Both'
                  ? selectedCompany
                  : currentUser?.company !== 'Both'
                  ? currentUser?.company || 'All'
                  : 'All'
              }
            />
          )}

          {activePage === 'reports' && <ReportsView />}

          {activePage === 'incomplete' && (
            <IncompleteProfilesView
              currentUserCompany={selectedCompany !== 'Both' ? selectedCompany : currentUser?.company}
              onCandidatePromoted={() => {
                refreshBadges();
              }}
              onRecordsChanged={() => {
                refreshBadges();
              }}
              onNavigateCompleted={() => handleNavigate('candidates')}
            />
          )}

          {activePage === 'settings' && (
            <SettingsView
              onHealthStatusChanged={(connected) => setSupabaseConnected(connected)}
            />
          )}
        </main>
      </div>

      {/* In-App Change Password Modal */}
      {changePasswordModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Update Account Password
                </h3>
              </div>
              <button
                onClick={() => setChangePasswordModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Update password for <strong className="text-slate-700">{currentUser.email}</strong>.
            </p>

            {passwordError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{passwordSuccess}</span>
              </div>
            )}

            <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setChangePasswordModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                >
                  Save New Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
