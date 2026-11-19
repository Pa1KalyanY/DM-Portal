import React, { useState, useEffect } from 'react';
import {
  Layers,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  GitMerge,
  AlertTriangle,
  Mail,
  Phone,
  Briefcase,
  FileText,
  Building,
  ShieldCheck,
  Search,
  Download,
  Zap,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Info,
  Check,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { dbService } from '../../services/masterDbService';
import { PossibleMatch, Person, CompanyName } from '../../types/masterDatabase';
import { GeminiMatchModal } from './GeminiMatchModal';
import { formatDateDisplay } from '../../shared/dateFormat';

interface PossibleMatchesViewProps {
  onSelectCandidate: (personId: string) => void;
  onRefreshBadge: () => void;
  initialCompany?: 'AaraTech' | 'ClinisolTech' | 'All';
}

export const PossibleMatchesView: React.FC<PossibleMatchesViewProps> = ({
  onSelectCandidate,
  onRefreshBadge,
  initialCompany = 'All',
}) => {
  const [matches, setMatches] = useState<PossibleMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState<'All' | 'AaraTech' | 'ClinisolTech'>(initialCompany);
  
  // Auto-Merge configuration state
  const [autoMergeEnabled, setAutoMergeEnabled] = useState<boolean>(dbService.isAutoMergeEnabled());

  // Dry-run modal state
  const [dryRunRunning, setDryRunRunning] = useState(false);
  const [dryRunModalOpen, setDryRunModalOpen] = useState(false);
  const [dryRunResults, setDryRunResults] = useState<{
    totalPairsEvaluated: number;
    eligibleForAutoMergeCount: number;
    autoMergedCount: number;
    manualReviewCount: number;
    noMatchCount: number;
    details: any[];
  } | null>(null);

  // Merge confirmation modal state
  const [pendingMergeMatch, setPendingMergeMatch] = useState<PossibleMatch | null>(null);
  const [executingMerge, setExecutingMerge] = useState(false);
  const [geminiModalOpen, setGeminiModalOpen] = useState(false);

  useEffect(() => {
    loadMatches();
  }, []);

  const loadMatches = async () => {
    setLoading(true);
    try {
      const data = await dbService.getPossibleMatches();
      setMatches(data);
      setAutoMergeEnabled(dbService.isAutoMergeEnabled());
    } catch (err) {
      console.error('Failed to load possible matches:', err);
    } finally {
      setLoading(false);
    }
  };

  const getCandidateCompany = (person?: Person): CompanyName | null => {
    if (!person) return null;
    if (person.current_company === 'AaraTech' || person.current_company === 'ClinisolTech') {
      return person.current_company as CompanyName;
    }
    const app = person.applications?.find(a => a.company);
    return (app?.company as CompanyName) || null;
  };

  const filteredMatches = matches.filter(match => {
    if (selectedCompanyFilter === 'All') return true;
    const compA = getCandidateCompany(match.candidate_a);
    const compB = getCandidateCompany(match.candidate_b);
    return compA === selectedCompanyFilter || compB === selectedCompanyFilter;
  });

  const aaraTechCount = matches.filter(m => {
    const comp = getCandidateCompany(m.candidate_a) || getCandidateCompany(m.candidate_b);
    return comp === 'AaraTech';
  }).length;

  const clinisolTechCount = matches.filter(m => {
    const comp = getCandidateCompany(m.candidate_a) || getCandidateCompany(m.candidate_b);
    return comp === 'ClinisolTech';
  }).length;

  const handleToggleAutoMerge = () => {
    const newVal = !autoMergeEnabled;
    dbService.setAutoMergeEnabled(newVal);
    setAutoMergeEnabled(newVal);
    setActionSuccessMessage(
      newVal
        ? 'Automatic merging is now ENABLED. Verified exact matches with matching verified contacts will auto-merge safely.'
        : 'Automatic merging is now DISABLED. All detected duplicates will be routed exclusively to Manual Review.'
    );
  };

  const handleRunDryRunScan = async () => {
    setDryRunRunning(true);
    setErrorMessage(null);
    try {
      const targetCompany = selectedCompanyFilter === 'ClinisolTech' ? 'ClinisolTech' : 'AaraTech';
      const results = await dbService.runDuplicateScan({
        company: targetCompany as any,
        dryRun: true,
      });
      setDryRunResults(results);
      setDryRunModalOpen(true);
    } catch (err: any) {
      setErrorMessage(`Dry run scan failed: ${err.message || 'Unknown error'}`);
    } finally {
      setDryRunRunning(false);
    }
  };

  const handleExecuteBatchAutoMerge = async () => {
    if (!window.confirm('Execute safe auto-merging for all verified eligible duplicate pairs in AaraTech? Profiles will be consolidated into primary master profiles with 100% historical data preserved.')) {
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const results = await dbService.runDuplicateScan({
        company: 'AaraTech',
        dryRun: false,
        autoMerge: true,
      });
      setActionSuccessMessage(
        `Safe Auto-Merge Completed! Successfully merged ${results.autoMergedCount} candidate profile(s) into primary masters. ${results.manualReviewCount} pair(s) remain in manual review.`
      );
      onRefreshBadge();
      await loadMatches();
    } catch (err: any) {
      setErrorMessage(`Auto-merge failed: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmMerge = async () => {
    if (!pendingMergeMatch || !pendingMergeMatch.candidate_a || !pendingMergeMatch.candidate_b) return;
    const match = pendingMergeMatch;
    const candA = match.candidate_a;
    const candB = match.candidate_b;
    if (!candA || !candB) return;
    setExecutingMerge(true);

    const compA = getCandidateCompany(candA);
    const compB = getCandidateCompany(candB);

    if (compA && compB && compA !== compB) {
      alert(`Cross-company merging is strictly blocked! Candidate A belongs to ${compA} and Candidate B belongs to ${compB}. AaraTech and ClinisolTech databases are completely isolated.`);
      setExecutingMerge(false);
      setPendingMergeMatch(null);
      return;
    }

    const targetCompany = compA || compB || 'Company';

    const success = await dbService.mergeCandidates(
      candA.id,
      candB.id,
      'Recruiter Verification',
      {
        rule: match.rule_triggered || 'MANUAL_RECRUITER_VERIFICATION',
        reason: match.match_reason || 'Verified and merged by recruiter in Review Queue',
        isAutomatic: false,
      }
    );

    if (success) {
      await dbService.resolvePossibleMatch(match.id, 'merged', 'Recruiter Verification');
      setActionSuccessMessage(
        `Successfully merged ${candB.full_name} (${candB.person_id}) into primary master profile ${candA.person_id} within ${targetCompany}. All historical applications, emails, phones, and verbatim notes have been preserved.`
      );
      setPendingMergeMatch(null);
      onRefreshBadge();
      loadMatches();
    } else {
      setErrorMessage('Merge operation could not be completed. Check company isolation and profile statuses.');
    }
    setExecutingMerge(false);
  };

  const handleReject = async (match: PossibleMatch) => {
    await dbService.resolvePossibleMatch(match.id, 'rejected', 'Recruiter Verification');
    setActionSuccessMessage(
      `Marked Match #${match.match_code} as "Not The Same Person". The decision has been recorded and these profiles will NEVER automatically merge again.`
    );
    onRefreshBadge();
    loadMatches();
  };

  const handleReviewLater = async (match: PossibleMatch) => {
    await dbService.resolvePossibleMatch(match.id, 'reviewed_later', 'Recruiter Verification');
    onRefreshBadge();
    loadMatches();
  };

  const downloadDryRunCsv = () => {
    if (!dryRunResults || !dryRunResults.details.length) return;
    const headers = [
      'Pair ID',
      'Candidate A ID',
      'Candidate A Name',
      'Candidate A Email',
      'Candidate A Phone',
      'Candidate B ID',
      'Candidate B Name',
      'Candidate B Email',
      'Candidate B Phone',
      'Decision',
      'Name Match Status',
      'Email Match Status',
      'Phone Match Status',
      'Rule Triggered',
      'Reason',
      'Conflicts',
    ];

    const rows = dryRunResults.details.map(d => [
      d.pairId,
      d.candidateA.personId,
      `"${(d.candidateA.name || '').replace(/"/g, '""')}"`,
      d.candidateA.email || '',
      d.candidateA.phone || '',
      d.candidateB.personId,
      `"${(d.candidateB.name || '').replace(/"/g, '""')}"`,
      d.candidateB.email || '',
      d.candidateB.phone || '',
      d.decision,
      d.nameMatchStatus,
      d.emailMatchStatus,
      d.phoneMatchStatus,
      d.ruleTriggered,
      `"${(d.reason || '').replace(/"/g, '""')}"`,
      `"${(d.conflicts || []).join('; ').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `aaratech_duplicate_dryrun_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const eligibleForAutoMergeCount = filteredMatches.filter(m => m.decision_category === 'Eligible for auto-merge').length;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Title & Status Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Company-Isolated Deduplication
            </span>
            <span className="text-xs text-slate-400 font-medium">
              • AaraTech &amp; ClinisolTech Pools Strictly Separated
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Possible Matches &amp; Candidate Duplicate Review Queue
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Confidence-based duplicate detection engine. Candidate pairs are evaluated strictly within the <strong>AaraTech</strong> candidate database according to the 10-row decision table.
          </p>
        </div>

        {/* Company Queue Filter Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => setSelectedCompanyFilter('All')}
            className={`px-3 py-1.5 rounded-lg transition-all ${
              selectedCompanyFilter === 'All'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Queues ({matches.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCompanyFilter('AaraTech')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              selectedCompanyFilter === 'AaraTech'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-blue-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400"></span>
            AaraTech ({aaraTechCount})
          </button>
          <button
            type="button"
            onClick={() => setSelectedCompanyFilter('ClinisolTech')}
            className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all ${
              selectedCompanyFilter === 'ClinisolTech'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-indigo-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
            ClinisolTech ({clinisolTechCount})
          </button>
        </div>
      </div>

      {/* Control Toolbar: Auto-Merge Toggle, Dry-Run Scan, Batch Merge */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
        {/* Left: Auto-Merge Switch */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleToggleAutoMerge}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
              autoMergeEnabled
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
            title="Toggle whether verified high-confidence matches auto-merge automatically"
          >
            {autoMergeEnabled ? (
              <ToggleRight className="w-5 h-5 text-emerald-600" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-slate-400" />
            )}
            <span>Auto-Merge: {autoMergeEnabled ? 'ENABLED' : 'DISABLED'}</span>
          </button>
          <span className="text-xs text-slate-500 hidden sm:inline">
            {autoMergeEnabled
              ? 'Exact names + matching contact auto-merge during scan & import'
              : 'All duplicates require manual human confirmation'}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {eligibleForAutoMergeCount > 0 && autoMergeEnabled && (
            <button
              type="button"
              onClick={handleExecuteBatchAutoMerge}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>⚡ Run Safe Auto-Merge ({eligibleForAutoMergeCount} Eligible)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setGeminiModalOpen(true)}
            className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            title="Use Google Gemini AI to deeply evaluate and re-verify all possible duplicate matches"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Gemini AI Re-Verify ({matches.length})</span>
          </button>

          <button
            type="button"
            onClick={handleRunDryRunScan}
            disabled={dryRunRunning}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-800 border border-slate-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
          >
            <Search className="w-3.5 h-3.5 text-slate-600" />
            <span>{dryRunRunning ? 'Scanning...' : 'Dry-Run Duplicate Scan'}</span>
          </button>

          <button
            type="button"
            onClick={loadMatches}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh review queue"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {actionSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-700 font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-rose-700 font-bold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-400">Loading possible matches...</div>
      ) : filteredMatches.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            {selectedCompanyFilter === 'All'
              ? 'Review Queue is Clear'
              : `${selectedCompanyFilter} Queue is Clear`}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No ambiguous duplicate profiles detected for this queue. Run a <strong>Dry-Run Duplicate Scan</strong> above to re-evaluate all profiles against the 10-row decision table.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredMatches.map((match) => {
            const compA = getCandidateCompany(match.candidate_a) || 'AaraTech';
            const compB = getCandidateCompany(match.candidate_b) || 'AaraTech';
            const isAara = compA === 'AaraTech';

            // Match status helpers
            const nameStatus = match.name_match_status || 'Similar';
            const emailStatus = match.email_match_status || (match.candidate_a?.primary_email && match.candidate_b?.primary_email && match.candidate_a.primary_email.toLowerCase() === match.candidate_b.primary_email.toLowerCase() ? 'Match' : 'Different');
            const phoneStatus = match.phone_match_status || (match.candidate_a?.primary_phone && match.candidate_b?.primary_phone && match.candidate_a.primary_phone === match.candidate_b.primary_phone ? 'Match' : 'Different');
            const isEligibleAuto = match.decision_category === 'Eligible for auto-merge';

            return (
              <div
                key={match.id}
                className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-5"
              >
                {/* Header: Review Item ID, Detection Timestamp, Badges */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                      {match.match_code}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400">
                      ID: {match.id.slice(0, 8)}...
                    </span>
                    <span
                      className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                        isAara
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      }`}
                    >
                      {compA} Database
                    </span>

                    {/* Section 6 Decision Category Badge */}
                    {isEligibleAuto ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-emerald-600" />
                        Eligible for Auto-Merge
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-300">
                        Manual Review Required
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-400 font-mono">
                    Detected: {formatDateDisplay(match.created_at, '—')}
                  </div>
                </div>

                {/* Section 9 Match Status Badges Strip */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {/* Name Match Status */}
                  <span
                    className={`px-2.5 py-1 rounded-md font-semibold border ${
                      nameStatus === 'Exact'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : nameStatus === 'Similar'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    Name: {nameStatus === 'Exact' ? '✓ Exact Match' : nameStatus === 'Similar' ? '~ Similar' : '≠ Different'}
                  </span>

                  {/* Email Match Status */}
                  <span
                    className={`px-2.5 py-1 rounded-md font-semibold border ${
                      emailStatus === 'Match'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : emailStatus === 'Different'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    Email: {emailStatus === 'Match' ? '✓ Match' : emailStatus === 'Different' ? '≠ Different' : '— Missing'}
                  </span>

                  {/* Phone Match Status */}
                  <span
                    className={`px-2.5 py-1 rounded-md font-semibold border ${
                      phoneStatus === 'Match'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : phoneStatus === 'Different'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}
                  >
                    Phone: {phoneStatus === 'Match' ? '✓ Match' : phoneStatus === 'Different' ? '≠ Different' : '— Missing'}
                  </span>

                  {match.rule_triggered && (
                    <span className="text-[11px] font-mono text-slate-400 ml-auto">
                      Rule: {match.rule_triggered}
                    </span>
                  )}
                </div>

                {/* Match Reason Banner */}
                <div className="p-3.5 bg-amber-50/70 rounded-xl border border-amber-200/80 text-xs text-amber-950 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div>
                      <strong className="font-semibold">Reason Flagged: </strong>
                      <span>{match.match_reason}</span>
                    </div>
                    <div className="text-[11px] text-amber-900/80 font-medium">
                      ✓ Candidates evaluated strictly within {compA} database pool. Historical notes, contacts, and applications preserved upon merge.
                    </div>
                  </div>
                </div>

                {/* Identity Conflicts Alert (Section 7) */}
                {match.conflicts && match.conflicts.length > 0 && (
                  <div className="p-3.5 bg-rose-50 rounded-xl border border-rose-200 text-xs text-rose-900 flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold">Identity Conflicts Detected: </strong>
                      <span>{match.conflicts.join('; ')}</span>
                    </div>
                  </div>
                )}

                {/* Side by side comparison (Section 9) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Candidate A Card (Primary Master) */}
                  {match.candidate_a && (
                    <div
                      className={`p-4 rounded-xl border space-y-3 ${
                        isAara
                          ? 'border-blue-200 bg-blue-50/20'
                          : 'border-indigo-200 bg-indigo-50/20'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-bold uppercase tracking-wider ${
                            isAara ? 'text-blue-700' : 'text-indigo-700'
                          }`}
                        >
                          Profile A (Primary Master in {compA})
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-600">
                          {match.candidate_a.person_id}
                        </span>
                      </div>

                      <div className="font-bold text-slate-900 text-base">
                        {match.candidate_a.full_name}
                      </div>

                      <div className="space-y-2 text-xs text-slate-700">
                        {/* Email display with match indicator */}
                        <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white/60 border border-slate-200/60">
                          <div className="flex items-center gap-1.5 truncate">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{match.candidate_a.primary_email || 'No email'}</span>
                          </div>
                          {emailStatus === 'Match' && match.candidate_a.primary_email && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                              ✓ Match
                            </span>
                          )}
                        </div>

                        {/* Phone display with match indicator */}
                        <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white/60 border border-slate-200/60">
                          <div className="flex items-center gap-1.5 font-mono truncate">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{match.candidate_a.primary_phone || 'No phone'}</span>
                          </div>
                          {phoneStatus === 'Match' && match.candidate_a.primary_phone && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                              ✓ Match
                            </span>
                          )}
                        </div>

                        {/* Counts (Section 9) */}
                        <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-500 font-medium">
                          <div className="flex items-center gap-1">
                            <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                            <span>{match.candidate_a.applications?.length || 0} applications</span>
                          </div>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span>{match.candidate_a.recruiter_contacts?.length || 0} recruiter notes</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => onSelectCandidate(match.candidate_a!.id)}
                        className={`text-xs font-semibold hover:underline block pt-1 ${
                          isAara ? 'text-blue-600' : 'text-indigo-600'
                        }`}
                      >
                        Inspect Profile A →
                      </button>
                    </div>
                  )}

                  {/* Candidate B Card (Duplicate to Merge) */}
                  {match.candidate_b && (
                    <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Profile B (Duplicate in {compB})
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-600">
                          {match.candidate_b.person_id}
                        </span>
                      </div>

                      <div className="font-bold text-slate-900 text-base">
                        {match.candidate_b.full_name}
                      </div>

                      <div className="space-y-2 text-xs text-slate-700">
                        {/* Email display with match indicator */}
                        <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white border border-slate-200/60">
                          <div className="flex items-center gap-1.5 truncate">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{match.candidate_b.primary_email || 'No email'}</span>
                          </div>
                          {emailStatus === 'Match' && match.candidate_b.primary_email && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                              ✓ Match
                            </span>
                          )}
                        </div>

                        {/* Phone display with match indicator */}
                        <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-white border border-slate-200/60">
                          <div className="flex items-center gap-1.5 font-mono truncate">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{match.candidate_b.primary_phone || 'No phone'}</span>
                          </div>
                          {phoneStatus === 'Match' && match.candidate_b.primary_phone && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                              ✓ Match
                            </span>
                          )}
                        </div>

                        {/* Counts (Section 9) */}
                        <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-500 font-medium">
                          <div className="flex items-center gap-1">
                            <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                            <span>{match.candidate_b.applications?.length || 0} applications</span>
                          </div>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span>{match.candidate_b.recruiter_contacts?.length || 0} recruiter notes</span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => onSelectCandidate(match.candidate_b!.id)}
                        className="text-xs font-semibold text-blue-600 hover:underline block pt-1"
                      >
                        Inspect Profile B →
                      </button>
                    </div>
                  )}
                </div>

                {/* Section 8 & 9 Action Buttons */}
                <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    onClick={() => handleReviewLater(match)}
                    className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Review Later</span>
                  </button>

                  <button
                    onClick={() => handleReject(match)}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                    title="Permanently marks that these are distinct candidates. Stores decision to prevent repeat flagging."
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Not The Same Person</span>
                  </button>

                  <button
                    onClick={() => setPendingMergeMatch(match)}
                    className={`px-5 py-2 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 ${
                      isAara
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    <span>Merge into {match.candidate_a?.person_id} ({compA})</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Human-Approved Merge */}
      {pendingMergeMatch && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <GitMerge className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Confirm Candidate Merge
                </h3>
                <p className="text-xs text-slate-500">
                  Consolidate duplicate profiles within the AaraTech database
                </p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 space-y-1">
                <div className="font-bold text-blue-900">
                  Retaining Master Profile: {pendingMergeMatch.candidate_a?.full_name} ({pendingMergeMatch.candidate_a?.person_id})
                </div>
                <div>
                  Merging In Duplicate: {pendingMergeMatch.candidate_b?.full_name} ({pendingMergeMatch.candidate_b?.person_id})
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                <div className="font-bold text-slate-800 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>100% History Preservation Guarantee:</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-slate-600">
                  <li>All applications and statuses will be transferred to Profile A.</li>
                  <li>All recruiter notes &amp; feedback will be preserved verbatim.</li>
                  <li>All contact details (emails, phones) will remain associated.</li>
                  <li>Original profile IDs and full unmerge snapshot archived in audit log.</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingMergeMatch(null)}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMerge}
                disabled={executingMerge}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
              >
                <GitMerge className="w-4 h-4" />
                <span>{executingMerge ? 'Merging...' : 'Confirm & Execute Merge'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dry-Run Results Modal (Section 13) */}
      {dryRunModalOpen && dryRunResults && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Search className="w-4 h-4 text-blue-600" />
                  <span>Dry-Run Deduplication Report</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Simulation only. No candidate records or relationships have been modified.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDryRunModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Metrics Ribbon */}
            <div className="grid grid-cols-4 gap-3 p-5 bg-slate-50 border-b border-slate-100 text-center">
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <div className="text-xl font-black text-slate-900">
                  {dryRunResults.totalPairsEvaluated}
                </div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">
                  Pairs Evaluated
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-emerald-200">
                <div className="text-xl font-black text-emerald-600">
                  {dryRunResults.eligibleForAutoMergeCount}
                </div>
                <div className="text-[11px] font-semibold text-emerald-700 uppercase mt-0.5">
                  Proposed Auto-Merges
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-amber-200">
                <div className="text-xl font-black text-amber-600">
                  {dryRunResults.manualReviewCount}
                </div>
                <div className="text-[11px] font-semibold text-amber-700 uppercase mt-0.5">
                  Proposed Manual Reviews
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <div className="text-xl font-black text-slate-500">
                  {dryRunResults.noMatchCount}
                </div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase mt-0.5">
                  Non-Matches
                </div>
              </div>
            </div>

            {/* Modal Body / Table of Proposed Decisions */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Evaluated Flagged Candidate Pairs ({dryRunResults.details.length})</span>
                <button
                  type="button"
                  onClick={downloadDryRunCsv}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download CSV Report</span>
                </button>
              </div>

              {dryRunResults.details.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No duplicate candidate pairs detected in this pool.
                </div>
              ) : (
                <div className="space-y-3">
                  {dryRunResults.details.map((detail, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-700">
                            {detail.candidateA.personId} ({detail.candidateA.name})
                          </span>
                          <span className="text-slate-400">↔</span>
                          <span className="font-mono font-bold text-slate-700">
                            {detail.candidateB.personId} ({detail.candidateB.name})
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                            detail.decision === 'AUTO_MERGE'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-800 border border-amber-300'
                          }`}
                        >
                          {detail.decision === 'AUTO_MERGE' ? '⚡ Proposed Auto-Merge' : '👤 Manual Review'}
                        </span>
                      </div>

                      <div className="text-slate-600">
                        <strong>Reason: </strong>{detail.reason}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono">
                        <span>Name: {detail.nameMatchStatus}</span>
                        <span>•</span>
                        <span>Email: {detail.emailMatchStatus}</span>
                        <span>•</span>
                        <span>Phone: {detail.phoneMatchStatus}</span>
                        <span>•</span>
                        <span>Rule: {detail.ruleTriggered}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="text-xs text-slate-500">
                To execute these merges, enable Auto-Merge and click &quot;Run Safe Auto-Merge&quot;.
              </span>
              <button
                type="button"
                onClick={() => setDryRunModalOpen(false)}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gemini AI Re-Verification Modal */}
      <GeminiMatchModal
        isOpen={geminiModalOpen}
        onClose={() => setGeminiModalOpen(false)}
        matches={filteredMatches}
        onMatchesResolved={() => {
          onRefreshBadge();
          loadMatches();
        }}
      />
    </div>
  );
};
