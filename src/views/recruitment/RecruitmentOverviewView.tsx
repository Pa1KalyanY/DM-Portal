import React, { useEffect, useState } from 'react';
import {
  Building2,
  Stethoscope,
  Filter,
  Users,
  FileBarChart2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Upload,
  Calendar,
  Briefcase,
  Copy,
  TrendingUp,
  Clock,
  ArrowRight,
  Sparkles,
  Layers,
  Database
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { DashboardStats, ImportRecord } from '../../types';
import { api } from '../../api/client';

interface RecruitmentOverviewProps {
  onNavigate: (section: string) => void;
}

export const RecruitmentOverviewView: React.FC<RecruitmentOverviewProps> = ({ onNavigate }) => {
  const { activeCompany, setActiveCompany, isDualCompany } = useWorkspace();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentBatches, setRecentBatches] = useState<ImportRecord[]>([]);
  const [masterStats, setMasterStats] = useState<{ totalPeople: number; activeCandidates: number } | null>(null);
  const [jobs, setJobs] = useState<Array<{ jobId: string; jobTitle: string; total: number; passed: number; failed: number; manualReview: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const [statsData, batchesData, jobsData, mStats] = await Promise.all([
          api.getDashboardStats(activeCompany).catch(() => null),
          api.getImports(activeCompany, 6).catch(() => []),
          api.getJobs(activeCompany).catch(() => []),
          api.getMasterCandidateStats(activeCompany).catch(() => null),
        ]);
        if (isMounted) {
          setStats(statsData);
          setRecentBatches(batchesData);
          setJobs(jobsData);
          if (mStats) setMasterStats(mStats);
        }
      } catch (err) {
        console.error('Failed to load recruitment overview data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();

    const handleUpdate = () => {
      loadData();
    };

    window.addEventListener('workspace-data-updated', handleUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener('workspace-data-updated', handleUpdate);
    };
  }, [activeCompany]);

  const jobSlotCount = activeCompany === 'AaraTech' ? 21 : 10;
  const totalApps = stats?.totalApplicants ?? stats?.applicantsProcessed ?? 0;
  const passRate = totalApps > 0 && stats ? Math.round((stats.passedCount / totalApps) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner / Company Workspace Context */}
      <div className="card-premium p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="badge-info">
                Recruitment Workspace
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-medium text-slate-500">Live Operations</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>{activeCompany} Recruitment Overview</span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                activeCompany === 'AaraTech'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
              }`}>
                {jobSlotCount} Baseline Job Slots
              </span>
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl">
              {activeCompany === 'AaraTech'
                ? 'Technical talent requisitions: Cloud, AI, Fullstack & Engineering (AT-001 through AT-021).'
                : 'Life sciences talent requisitions: Clinical Research, SAS, Data Management (CT-001 through CT-010).'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('filter')}
              className="btn-primary"
            >
              <Upload className="w-4 h-4" />
              <span>Import &amp; Screen Applications</span>
            </button>
            <button
              onClick={() => onNavigate('reports')}
              className="btn-secondary"
            >
              <FileBarChart2 className="w-4 h-4 text-[#3659D9]" />
              <span>Reports</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary KPI Metric Cards (Pure White Surfaces with Restrained Status Accents) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="flex items-center justify-between text-[#65738B] text-xs font-medium">
            <span>Total Applications</span>
            <Users className="w-4 h-4 text-[#8995A8]" />
          </div>
          <div className="text-2xl font-bold text-[#18243A] mt-2 tabular-nums">
            {loading ? '...' : totalApps.toLocaleString()}
          </div>
          <p className="text-[11px] text-[#65738B] mt-0.5 font-medium">Across all batches</p>
        </div>

        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="flex items-center justify-between text-[#65738B] text-xs font-semibold">
            <span>Passed (Copy-Ready)</span>
            <CheckCircle2 className="w-4 h-4 text-[#16836B]" />
          </div>
          <div className="text-2xl font-bold text-[#18243A] mt-2 tabular-nums">
            {loading ? '...' : (stats?.passedCount || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-[#16836B] mt-0.5 font-medium">{passRate}% pass rate</p>
        </div>

        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="flex items-center justify-between text-[#65738B] text-xs font-semibold">
            <span>Manual Review</span>
            <AlertTriangle className="w-4 h-4 text-[#A66B19]" />
          </div>
          <div className="text-2xl font-bold text-[#18243A] mt-2 tabular-nums">
            {loading ? '...' : (stats?.manualReviewCount || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-[#A66B19] mt-0.5 font-medium">Requires recruiter review</p>
        </div>

        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="flex items-center justify-between text-[#65738B] text-xs font-semibold">
            <span>Failed</span>
            <XCircle className="w-4 h-4 text-[#C44750]" />
          </div>
          <div className="text-2xl font-bold text-[#18243A] mt-2 tabular-nums">
            {loading ? '...' : (stats?.failedCount || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-[#C44750] mt-0.5 font-medium">Did not meet criteria</p>
        </div>

        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="flex items-center justify-between text-[#65738B] text-xs font-semibold">
            <span>Master Profiles</span>
            <Database className="w-4 h-4 text-[#4A63C7]" />
          </div>
          <div className="text-2xl font-bold text-[#18243A] mt-2 tabular-nums">
            {loading ? '...' : (masterStats?.totalPeople || 0).toLocaleString()}
          </div>
          <p className="text-[11px] text-[#4A63C7] mt-0.5 font-medium">Unified unique candidates</p>
        </div>

        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="flex items-center justify-between text-[#65738B] text-xs font-semibold">
            <span>Active Job Slots</span>
            <Briefcase className="w-4 h-4 text-[#3659D9]" />
          </div>
          <div className="text-2xl font-bold text-[#18243A] mt-2 tabular-nums">
            {jobSlotCount}
          </div>
          <p className="text-[11px] text-[#3659D9] mt-0.5 font-medium">{activeCompany === 'AaraTech' ? 'AT-001..021' : 'CT-001..010'}</p>
        </div>
      </div>

      {/* Main Grid: Job Slots & Recent Batches */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Job Slot Performance */}
        <div className="lg:col-span-2 card-premium p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-blue-600" />
                <span>Job Slot Performance ({activeCompany})</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Breakdown of applications and screening outcomes across configured baseline slots
              </p>
            </div>
            <button
              onClick={() => onNavigate('filter')}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <span>View Filter</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200/80">
            <table className="w-full text-left text-xs table-premium">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Slot</th>
                  <th className="py-2.5 px-3">Job Role</th>
                  <th className="py-2.5 px-3 text-right">Total</th>
                  <th className="py-2.5 px-3 text-right">Passed</th>
                  <th className="py-2.5 px-3 text-right">Review</th>
                  <th className="py-2.5 px-3 text-right">Failed</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {jobs.map((j) => (
                  <tr key={j.jobId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                      {j.jobId}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800 max-w-[200px] truncate" title={j.jobTitle}>
                      {j.jobTitle}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900 tabular-nums">
                      {j.total}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-600 tabular-nums">
                      {j.passed}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-amber-600 tabular-nums">
                      {j.manualReview}
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-slate-400 tabular-nums">
                      {j.failed}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => onNavigate('filter')}
                        className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-[11px] transition-colors cursor-pointer"
                      >
                        Filter
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Recent Batches & Quick Actions */}
        <div className="space-y-6">
          {/* Quick Actions Card */}
          <div className="card-premium p-5 space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Recruitment Quick Actions
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => onNavigate('filter')}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50/40 text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 group-hover:text-blue-700">
                      LinkedIn Filter
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Upload files, screen applicants &amp; copy TSV
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                onClick={() => onNavigate('master-candidates')}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                    <Database className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-700">
                      Master Candidate DB
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Search {masterStats?.totalPeople || 0} candidate profiles &amp; history
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
              </button>

              <button
                onClick={() => onNavigate('reports')}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 text-left transition-all group cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <FileBarChart2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-700">
                      Periodic Reports
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Daily, weekly, monthly and custom exports
                    </div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
              </button>
            </div>
          </div>

          {/* Recent Batches Card */}
          <div className="card-premium p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Recent Batches ({activeCompany})
              </h3>
              <span className="text-[11px] text-slate-400">Preserved in history</span>
            </div>

            {recentBatches.length === 0 ? (
              <p className="text-xs text-slate-400 py-3 text-center">No batches uploaded yet.</p>
            ) : (
              <div className="space-y-2">
                {recentBatches.map((b) => (
                  <div
                    key={b.id}
                    className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-slate-900">
                        {b.importCode}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {b.uploadedAt ? new Date(b.uploadedAt).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 font-medium truncate mt-0.5">
                      {b.batchName || 'Import Batch'}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                      <span>Total: <strong className="text-slate-800 tabular-nums">{b.totalApplicants}</strong></span>
                      <span className="text-emerald-600">Passed: <strong className="tabular-nums">{b.passedCount}</strong></span>
                      <span className="text-rose-600">Failed: <strong className="tabular-nums">{b.failedCount}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
