import React from 'react';
import {
  FileSpreadsheet,
  Users,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  AlertOctagon,
  ArrowUpRight,
  TrendingUp,
  Upload,
  Briefcase,
  History,
  ShieldCheck,
  CheckSquare,
  Globe,
} from 'lucide-react';
import { DashboardStats } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { NavTab } from '../components/Sidebar';
import { formatDateDisplay } from '../shared/dateFormat';

interface DashboardViewProps {
  stats: DashboardStats | null;
  loading: boolean;
  onNavigate: (tab: NavTab) => void;
  onOpenTestCases: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  loading,
  onNavigate,
  onOpenTestCases,
}) => {
  if (loading || !stats) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-500 font-medium">Loading executive dashboard...</p>
        </div>
      </div>
    );
  }

  const passRate = stats.applicantsProcessed > 0
    ? Math.round((stats.passedCount / stats.applicantsProcessed) * 100)
    : 0;
  const failRate = stats.applicantsProcessed > 0
    ? Math.round((stats.failedCount / stats.applicantsProcessed) * 100)
    : 0;
  const reviewRate = stats.applicantsProcessed > 0
    ? Math.round((stats.manualReviewCount / stats.applicantsProcessed) * 100)
    : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Scope Banner */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 rounded-xl p-5 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-xs font-semibold text-blue-200">
            Phase 1 Screening Engine Active
          </div>
          <h2 className="text-xl font-bold mt-2">LinkedIn Recruiter Applicant Screening System</h2>
          <p className="text-xs text-blue-200/80 mt-1 max-w-2xl leading-relaxed">
            Deterministic rule-based applicant qualification. Evaluates mandatory Green Card / US Citizenship and Future Visa Sponsorship questions from LinkedIn XLSX exports.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <button
            onClick={() => onNavigate('upload')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md transition"
          >
            <Upload className="w-4 h-4" />
            <span>Upload XLSX Files</span>
          </button>
          <button
            onClick={onOpenTestCases}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition border border-white/20"
          >
            <CheckSquare className="w-4 h-4 text-emerald-400" />
            <span>Run 12 Tests</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Files Processed */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Files Processed</span>
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{stats.filesProcessed.toLocaleString()}</div>
          <div className="mt-1 text-[11px] text-slate-500">Up to 31+ batches</div>
        </div>

        {/* Total Applicants */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Total Applicants</span>
            <Users className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900">{stats.applicantsProcessed.toLocaleString()}</div>
          <div className="mt-1 text-[11px] text-slate-500">Across all jobs</div>
        </div>

        {/* Passed */}
        <div
          onClick={() => onNavigate('applicants-pass')}
          className="bg-emerald-50/50 hover:bg-emerald-50 p-4 rounded-xl border border-emerald-200 shadow-xs cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-xs font-semibold">PASSED</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-800">{stats.passedCount.toLocaleString()}</div>
          <div className="mt-1 text-[11px] text-emerald-700 font-medium">{passRate}% qualified</div>
        </div>

        {/* Failed */}
        <div
          onClick={() => onNavigate('applicants-fail')}
          className="bg-rose-50/50 hover:bg-rose-50 p-4 rounded-xl border border-rose-200 shadow-xs cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-rose-700">
            <span className="text-xs font-semibold">FAILED</span>
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-rose-800">{stats.failedCount.toLocaleString()}</div>
          <div className="mt-1 text-[11px] text-rose-700 font-medium">{failRate}% non-compliant</div>
        </div>

        {/* Manual Review */}
        <div
          onClick={() => onNavigate('applicants-review')}
          className="bg-amber-50/50 hover:bg-amber-50 p-4 rounded-xl border border-amber-200 shadow-xs cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-amber-800">
            <span className="text-xs font-semibold">MANUAL REVIEW</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-900">{stats.manualReviewCount.toLocaleString()}</div>
          <div className="mt-1 text-[11px] text-amber-700 font-medium">{reviewRate}% missing/unclear</div>
        </div>

        {/* Errors */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-xs font-semibold">ERRORS</span>
            <AlertOctagon className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-800">{stats.errorCount.toLocaleString()}</div>
          <div className="mt-1 text-[11px] text-slate-500">Row parse errors</div>
        </div>
      </div>

      {/* Mandatory Screening Questions Deep Dive (Section 26) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Rule 1: Green Card / US Citizen */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">Mandatory Rule #1</span>
              <h3 className="text-sm font-bold text-slate-900 mt-0.5">Green Card / US Citizen Requirement</h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              Required: YES
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
              <div className="text-[11px] font-medium text-emerald-800">Answered YES</div>
              <div className="text-lg font-bold text-emerald-900 mt-1">{stats.greenCardYes.toLocaleString()}</div>
              <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                {stats.applicantsProcessed > 0 ? Math.round((stats.greenCardYes / stats.applicantsProcessed) * 100) : 0}% Meets Rule
              </div>
            </div>

            <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
              <div className="text-[11px] font-medium text-rose-800">Answered NO</div>
              <div className="text-lg font-bold text-rose-900 mt-1">{stats.greenCardNo.toLocaleString()}</div>
              <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                {stats.applicantsProcessed > 0 ? Math.round((stats.greenCardNo / stats.applicantsProcessed) * 100) : 0}% Fails Rule
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
              <div className="text-[11px] font-medium text-amber-800">Missing / Unclear</div>
              <div className="text-lg font-bold text-amber-900 mt-1">{stats.greenCardMissing.toLocaleString()}</div>
              <div className="text-[10px] text-amber-600 font-semibold mt-0.5">
                {stats.applicantsProcessed > 0 ? Math.round((stats.greenCardMissing / stats.applicantsProcessed) * 100) : 0}% Manual
              </div>
            </div>
          </div>
        </div>

        {/* Rule 2: Future Sponsorship */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-indigo-600 tracking-wider">Mandatory Rule #2</span>
              <h3 className="text-sm font-bold text-slate-900 mt-0.5">Future Visa Sponsorship Requirement</h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Required: NO
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
              <div className="text-[11px] font-medium text-emerald-800">Answered NO</div>
              <div className="text-lg font-bold text-emerald-900 mt-1">{stats.sponsorshipNo.toLocaleString()}</div>
              <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                {stats.applicantsProcessed > 0 ? Math.round((stats.sponsorshipNo / stats.applicantsProcessed) * 100) : 0}% Meets Rule
              </div>
            </div>

            <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
              <div className="text-[11px] font-medium text-rose-800">Answered YES</div>
              <div className="text-lg font-bold text-rose-900 mt-1">{stats.sponsorshipYes.toLocaleString()}</div>
              <div className="text-[10px] text-rose-600 font-semibold mt-0.5">
                {stats.applicantsProcessed > 0 ? Math.round((stats.sponsorshipYes / stats.applicantsProcessed) * 100) : 0}% Fails Rule
              </div>
            </div>

            <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
              <div className="text-[11px] font-medium text-amber-800">Missing / Unclear</div>
              <div className="text-lg font-bold text-amber-900 mt-1">{stats.sponsorshipMissing.toLocaleString()}</div>
              <div className="text-[10px] text-amber-600 font-semibold mt-0.5">
                {stats.applicantsProcessed > 0 ? Math.round((stats.sponsorshipMissing / stats.applicantsProcessed) * 100) : 0}% Manual
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Demographics & Regional Origin Breakdown Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gender Distribution Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-purple-600 tracking-wider">Demographic Breakdown</span>
              <h3 className="text-sm font-bold text-slate-900 mt-0.5">Applicant Gender Classification</h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
              First-Name Registry
            </span>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200">
              <div className="flex items-center justify-between text-xs text-blue-800 font-bold">
                <span>Male (♂)</span>
                <span>{stats.applicantsProcessed > 0 ? Math.round(((stats.maleCount || 0) / stats.applicantsProcessed) * 100) : 0}%</span>
              </div>
              <div className="text-xl font-extrabold text-blue-900 mt-1">{(stats.maleCount || 0).toLocaleString()}</div>
              <div className="text-[10px] text-blue-600 mt-0.5 font-medium">Classified Male</div>
            </div>

            <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200">
              <div className="flex items-center justify-between text-xs text-purple-800 font-bold">
                <span>Female (♀)</span>
                <span>{stats.applicantsProcessed > 0 ? Math.round(((stats.femaleCount || 0) / stats.applicantsProcessed) * 100) : 0}%</span>
              </div>
              <div className="text-xl font-extrabold text-purple-900 mt-1">{(stats.femaleCount || 0).toLocaleString()}</div>
              <div className="text-[10px] text-purple-600 mt-0.5 font-medium">Classified Female</div>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between text-xs text-slate-700 font-bold">
                <span>Unspecified</span>
                <span>{stats.applicantsProcessed > 0 ? Math.round(((stats.unspecifiedGenderCount || 0) / stats.applicantsProcessed) * 100) : 0}%</span>
              </div>
              <div className="text-xl font-extrabold text-slate-800 mt-1">{(stats.unspecifiedGenderCount || 0).toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 mt-0.5 font-medium">Neutral / Initials</div>
            </div>
          </div>
        </div>

        {/* Regional Origin Filter Card (India, Pakistan, Bangladesh, Nepal, Sri Lanka) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-teal-600 tracking-wider">Regional Origin Filter</span>
              <h3 className="text-sm font-bold text-slate-900 mt-0.5">South Asian Origin Breakdown</h3>
            </div>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-50 text-teal-700 border border-teal-200">
              🇮🇳 • 🇵🇰 • 🇧🇩 • 🇳🇵 • 🇱🇰
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200">
              <div className="flex items-center justify-between text-xs text-emerald-800 font-bold">
                <span>South Asian (Passed Origin)</span>
                <span>{stats.applicantsProcessed > 0 ? Math.round(((stats.southAsianCount || 0) / stats.applicantsProcessed) * 100) : 0}%</span>
              </div>
              <div className="text-xl font-extrabold text-emerald-900 mt-1">{(stats.southAsianCount || 0).toLocaleString()}</div>
              <div className="text-[10px] text-emerald-700 mt-0.5 font-medium">Verified by Name / Profile</div>
            </div>

            <div className="p-3 bg-amber-50/70 rounded-xl border border-amber-200">
              <div className="flex items-center justify-between text-xs text-amber-800 font-bold">
                <span>Review Needed (Ambiguous)</span>
                <span>{stats.applicantsProcessed > 0 ? Math.round(((stats.otherOriginCount || 0) / stats.applicantsProcessed) * 100) : 0}%</span>
              </div>
              <div className="text-xl font-extrabold text-amber-900 mt-1">{(stats.otherOriginCount || 0).toLocaleString()}</div>
              <div className="text-[10px] text-amber-700 mt-0.5 font-medium">Pushed to Manual Review</div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Jobs Breakdown & Recent Imports */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Jobs (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Top Jobs by Applicant Volume</h3>
            </div>
            <button
              onClick={() => onNavigate('jobs')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <span>View All Jobs</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {stats.topJobs && stats.topJobs.length > 0 ? (
              stats.topJobs.slice(0, 5).map((job, idx) => {
                const jobPassRate = job.total > 0 ? Math.round((job.passed / job.total) * 100) : 0;
                return (
                  <div key={idx} className="p-3 rounded-lg border border-slate-100 hover:border-slate-200 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-900">{job.jobTitle}</span>
                        <span className="text-[11px] text-slate-500 ml-2">ID: {job.jobId}</span>
                      </div>
                      <div className="text-xs font-semibold text-slate-700">
                        {job.total.toLocaleString()} applicants
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="mt-2.5 flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-slate-200 overflow-hidden flex">
                        <div
                          className="bg-emerald-500 h-full"
                          style={{ width: `${job.total > 0 ? (job.passed / job.total) * 100 : 0}%` }}
                          title={`Passed: ${job.passed}`}
                        ></div>
                        <div
                          className="bg-rose-500 h-full"
                          style={{ width: `${job.total > 0 ? (job.failed / job.total) * 100 : 0}%` }}
                          title={`Failed: ${job.failed}`}
                        ></div>
                        <div
                          className="bg-amber-500 h-full"
                          style={{ width: `${job.total > 0 ? (job.manualReview / job.total) * 100 : 0}%` }}
                          title={`Review: ${job.manualReview}`}
                        ></div>
                      </div>
                      <span className="text-[11px] font-semibold text-emerald-700 flex-shrink-0">
                        {jobPassRate}% Pass
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-4 text-[10px] text-slate-500">
                      <span>✓ {job.passed} Passed</span>
                      <span>✗ {job.failed} Failed</span>
                      <span>⚠ {job.manualReview} Review</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No jobs processed yet. Upload LinkedIn files to view breakdown.
              </div>
            )}
          </div>
        </div>

        {/* Recent Imports List (1 col) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">Recent Imports</h3>
            </div>
            <button
              onClick={() => onNavigate('imports')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              <span>History</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {stats.recentImports && stats.recentImports.length > 0 ? (
              stats.recentImports.slice(0, 5).map((imp) => {
                const displayName = imp.batchName || imp.files?.[0]?.jobTitle || imp.files?.[0]?.filename || imp.importCode;
                return (
                  <div
                    key={imp.id}
                    onClick={() => onNavigate('imports')}
                    className="p-3 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-slate-100/80 transition cursor-pointer"
                    title={`View details for ${displayName} (${imp.importCode})`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 pr-1">
                        <span className="text-xs font-bold text-slate-900 truncate" title={displayName}>
                          {displayName}
                        </span>
                        <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded font-mono flex-shrink-0">
                          {imp.importCode}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">
                        {formatDateDisplay(imp.uploadedAt)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-600 font-medium truncate">
                      {imp.totalApplicants.toLocaleString()} applicants across {imp.fileCount} file(s)
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold">
                      <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        {imp.passedCount} Pass
                      </span>
                      <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                        {imp.failedCount} Fail
                      </span>
                      <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                        {imp.manualReviewCount} Review
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No imports recorded.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
