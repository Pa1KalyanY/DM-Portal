import React, { useEffect, useState } from 'react';
import {
  Users,
  FileSpreadsheet,
  PhoneCall,
  GitMerge,
  UploadCloud,
  ArrowRight,
  TrendingUp,
  Clock,
  ShieldCheck,
  Building,
  CheckCircle,
} from 'lucide-react';
import { dbService } from '../../lib/dbService';
import { ImportRecord, Person } from '../../types/database';
import { UserSession } from '../../lib/authService';

interface DashboardViewProps {
  onNavigate: (page: any) => void;
  onSelectCandidate: (personId: string) => void;
  currentUser?: UserSession | null;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onSelectCandidate,
  currentUser,
}) => {
  const [stats, setStats] = useState({
    totalPeople: 0,
    totalApplications: 0,
    recruiterContacts: 0,
    possibleMatches: 0,
    filesImported: 0,
    companyBreakdown: { AaraTech: 0, ClinisolTech: 0 },
    genderBreakdown: { Male: 0, Female: 0, Other: 0, Unspecified: 0 },
    statusCounts: {} as Record<string, number>,
  });
  const [selectedCompanyView, setSelectedCompanyView] = useState<'Both' | 'AaraTech' | 'ClinisolTech'>('Both');
  const [recentImports, setRecentImports] = useState<ImportRecord[]>([]);
  const [recentCandidates, setRecentCandidates] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData(selectedCompanyView);
  }, [selectedCompanyView]);

  const loadDashboardData = async (scope: 'Both' | 'AaraTech' | 'ClinisolTech') => {
    setLoading(true);
    try {
      const data = await dbService.getDashboardStats(scope);
      setStats(data);

      const imports = await dbService.getImports();
      setRecentImports(imports.slice(0, 5));

      const { candidates } = await dbService.getCandidates({
        page: 1,
        pageSize: 5,
        company: scope !== 'Both' ? scope : undefined,
      });
      setRecentCandidates(candidates);
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Banner & Interactive Company Pipeline Switcher for Digital Marketing Team */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-slate-900 text-white shadow-2xs">
                Digital Marketing Operations
              </span>
              <span className="text-xs text-slate-400 font-medium">
                • Operator: {currentUser?.name || 'Digital Marketing Team'} ({currentUser?.email || 'marketing@aaratech.com'})
              </span>
            </div>

            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {selectedCompanyView === 'AaraTech'
                ? 'AaraTech Campaign & Candidate Pipeline'
                : selectedCompanyView === 'ClinisolTech'
                ? 'ClinisolTech Clinical Candidate Pipeline'
                : 'Unified Master Candidate Database (AaraTech & ClinisolTech)'}
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
              {selectedCompanyView === 'AaraTech' ? (
                <span>
                  Filtering active pipeline for <strong>AaraTech</strong>. IT, DevOps, Cloud Architecture, Full Stack &amp; CyberSecurity candidate datasets.
                </span>
              ) : selectedCompanyView === 'ClinisolTech' ? (
                <span>
                  Filtering active pipeline for <strong>ClinisolTech</strong>. Clinical Data Management, Biostatistics, SAS Programming &amp; GxP Clinical Trials datasets.
                </span>
              ) : (
                <span>
                  Centralized multi-company database operated by the <strong>Digital Marketing Team</strong>. Ingest campaign dumps, deduplicate on multi-identifiers (1 Person = 1 Master Profile), and preserve all historical interactions.
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => onNavigate('import')}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all hover:shadow"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Ingest Campaign Data</span>
            </button>
            <button
              onClick={() => onNavigate('candidates')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-sm font-semibold shadow-2xs transition-colors"
            >
              <Users className="w-4 h-4 text-slate-500" />
              <span>Browse Master DB</span>
            </button>
          </div>
        </div>

        {/* Dynamic Company Pipeline Filter Switcher */}
        <div className="flex items-center gap-2 bg-slate-100/90 p-1.5 rounded-xl border border-slate-200/80 w-fit">
          <span className="text-[11px] font-bold text-slate-500 uppercase px-2">Pipeline Scope:</span>
          <button
            onClick={() => setSelectedCompanyView('Both')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              selectedCompanyView === 'Both'
                ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building className="w-3.5 h-3.5 text-slate-500" />
            <span>All Companies (Unified Master)</span>
          </button>
          <button
            onClick={() => setSelectedCompanyView('AaraTech')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              selectedCompanyView === 'AaraTech'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-blue-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span>AaraTech Only</span>
          </button>
          <button
            onClick={() => setSelectedCompanyView('ClinisolTech')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              selectedCompanyView === 'ClinisolTech'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-indigo-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            <span>ClinisolTech Only</span>
          </button>
        </div>
      </div>

      {/* Main KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Total People */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:border-blue-200 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total People
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              {stats.totalPeople.toLocaleString()}
            </div>
            <div className="text-[12px] text-slate-500 mt-1 flex items-center gap-1">
              <span>Master unique profiles</span>
            </div>
          </div>
        </div>

        {/* Total Applications */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:border-indigo-200 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Applications
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              {stats.totalApplications.toLocaleString()}
            </div>
            <div className="text-[12px] text-slate-500 mt-1">
              Historical submissions preserved
            </div>
          </div>
        </div>

        {/* Touchpoint Notes */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:border-emerald-200 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Touchpoint Notes
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <PhoneCall className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              {stats.recruiterContacts.toLocaleString()}
            </div>
            <div className="text-[12px] text-slate-500 mt-1">
              Historical verbatim interactions
            </div>
          </div>
        </div>

        {/* Possible Matches */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:border-amber-200 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Possible Matches
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <GitMerge className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-amber-600">
              {stats.possibleMatches.toLocaleString()}
            </div>
            <div className="text-[12px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Pending manual review</span>
              {stats.possibleMatches > 0 && (
                <button
                  onClick={() => onNavigate('possible-matches')}
                  className="text-blue-600 hover:underline font-semibold text-[11px]"
                >
                  Review
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Files Imported */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs hover:border-purple-200 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Files Imported
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">
              {stats.filesImported.toLocaleString()}
            </div>
            <div className="text-[12px] text-slate-500 mt-1">
              XLSX / CSV datasets tracked
            </div>
          </div>
        </div>
      </div>

      {/* Three Column Analytics Layout: Requisitions, Gender Demographics, Deduplication Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Company Requisitions Split */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Requisition Split
            </h2>
            <Building className="w-4 h-4 text-slate-400" />
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5 font-medium">
                <span className="text-slate-700">AaraTech Candidates</span>
                <span className="text-slate-900 font-bold">{stats.companyBreakdown.AaraTech}</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full"
                  style={{
                    width: `${
                      stats.totalPeople
                        ? Math.round((stats.companyBreakdown.AaraTech / stats.totalPeople) * 100)
                        : 50
                    }%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-slate-500 mt-1">21 Active Job Openings</div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1.5 font-medium">
                <span className="text-slate-700">ClinisolTech Candidates</span>
                <span className="text-slate-900 font-bold">
                  {stats.companyBreakdown.ClinisolTech}
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 rounded-full"
                  style={{
                    width: `${
                      stats.totalPeople
                        ? Math.round((stats.companyBreakdown.ClinisolTech / stats.totalPeople) * 100)
                        : 50
                    }%`,
                  }}
                />
              </div>
              <div className="text-[11px] text-slate-500 mt-1">10 Active Clinical Openings</div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex gap-2">
            <button
              onClick={() => onNavigate('jobs-aaratech')}
              className="flex-1 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              AaraTech Jobs
            </button>
            <button
              onClick={() => onNavigate('jobs-clinisoltech')}
              className="flex-1 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
            >
              Clinisol Jobs
            </button>
          </div>
        </div>

        {/* Gender Demographics Split */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Gender Demographics
            </h2>
            <Users className="w-4 h-4 text-slate-400" />
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5 font-medium">
                <span className="flex items-center gap-1.5 text-slate-700">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                    ♂ Male
                  </span>
                  <span>Candidates</span>
                </span>
                <span className="text-slate-900 font-bold">
                  {stats.genderBreakdown?.Male || 0}
                  <span className="text-slate-400 font-normal text-xs ml-1">
                    ({stats.totalPeople ? Math.round(((stats.genderBreakdown?.Male || 0) / stats.totalPeople) * 100) : 0}%)
                  </span>
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full"
                  style={{
                    width: `${
                      stats.totalPeople
                        ? Math.round(((stats.genderBreakdown?.Male || 0) / stats.totalPeople) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1.5 font-medium">
                <span className="flex items-center gap-1.5 text-slate-700">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    ♀ Female
                  </span>
                  <span>Candidates</span>
                </span>
                <span className="text-slate-900 font-bold">
                  {stats.genderBreakdown?.Female || 0}
                  <span className="text-slate-400 font-normal text-xs ml-1">
                    ({stats.totalPeople ? Math.round(((stats.genderBreakdown?.Female || 0) / stats.totalPeople) * 100) : 0}%)
                  </span>
                </span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-rose-500 rounded-full"
                  style={{
                    width: `${
                      stats.totalPeople
                        ? Math.round(((stats.genderBreakdown?.Female || 0) / stats.totalPeople) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Unspecified / Neutral:</span>
                <span className="font-semibold text-slate-700">
                  {(stats.genderBreakdown?.Unspecified || 0) + (stats.genderBreakdown?.Other || 0)} candidates
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex gap-2">
            <button
              onClick={() => onNavigate('candidates')}
              className="w-full py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-1"
            >
              <span>Explore Master Candidate Pool</span>
              <ArrowRight className="w-3 h-3 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Deduplication & Traceability Architecture Banner */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-xl border border-slate-800 text-white flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                1 Person = 1 Master Profile Principle
              </span>
              <ShieldCheck className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-lg font-bold text-white tracking-tight">
              Multi-Identifier Deduplication &amp; Verbatim Historical Preservation
            </h3>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">
              When candidates apply across multiple years or channels (e.g. John Smith in File A &amp; File B),
              matching runs on normalized US phone (10-digit), normalized email, and LinkedIn. All historical emails,
              distinct applications, and verbatim recruiter feedback (&quot;LVM&quot;, &quot;JD sent&quot;, &quot;VM/VM/VM&quot;)
              are permanently preserved.
            </p>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Exact Phone/Email Match
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> Raw Feedback Verbatim
              </span>
            </div>
            <button
              onClick={() => onNavigate('possible-matches')}
              className="text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              <span>Review Duplicate Flags</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Recent Import Batches Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Historical Import History</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Traceable datasets ingested into Supabase master candidate tables
            </p>
          </div>
          <button
            onClick={() => onNavigate('import')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <span>Import New File</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Import ID</th>
                <th className="py-3 px-4">File Name</th>
                <th className="py-3 px-4">Total Rows</th>
                <th className="py-3 px-4">New People</th>
                <th className="py-3 px-4">Matched Profiles</th>
                <th className="py-3 px-4">Possible Matches</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentImports.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    No files imported yet. Click &quot;Import New File&quot; to begin your fresh data ingestion.
                  </td>
                </tr>
              ) : (
                recentImports.map((imp) => (
                  <tr key={imp.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-medium text-xs text-slate-900">
                      {imp.id}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800">
                      {imp.file_name}
                    </td>
                    <td className="py-3 px-4">{imp.total_rows.toLocaleString()}</td>
                    <td className="py-3 px-4 text-emerald-600 font-semibold">
                      +{imp.new_people.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-blue-600 font-semibold">
                      {imp.matched_people.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-amber-600 font-semibold">
                      {imp.possible_matches}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {imp.import_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {imp.completed_at ? new Date(imp.completed_at).toLocaleDateString() : 'In Progress'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Candidate Activity */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">Recent Candidate Profiles</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live records from the normalized master database
            </p>
          </div>
          <button
            onClick={() => onNavigate('candidates')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            <span>View All Candidates</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500 border-b border-slate-100">
              <tr>
                <th className="py-3 px-4">Person ID</th>
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Primary Contact</th>
                <th className="py-3 px-4">Applications</th>
                <th className="py-3 px-4">Touchpoint Notes</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Owner</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentCandidates.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    No candidates currently in master database. Records will appear here once files or leads are ingested.
                  </td>
                </tr>
              ) : (
                recentCandidates.map((cand) => (
                  <tr key={cand.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-xs text-blue-600">
                      {cand.person_id}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      {cand.full_name}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <div>{cand.primary_email || 'No email'}</div>
                      <div className="text-slate-400 font-mono">{cand.primary_phone || ''}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 font-medium">
                        {cand.applications?.length || 0} applied
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 font-medium">
                        {cand.recruiter_contacts?.length || 0} notes
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          cand.current_status === 'Open'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : cand.current_status === 'Review'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : cand.current_status === 'Contacted'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {cand.current_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-700">
                      {cand.current_owner || 'Unassigned'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onSelectCandidate(cand.id)}
                        className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-semibold transition-colors"
                      >
                        View Profile
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
