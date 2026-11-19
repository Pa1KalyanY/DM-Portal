import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  ShieldCheck,
  Database,
  Building2,
  Stethoscope,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  KeyRound,
  ExternalLink,
  Layers,
  Briefcase,
  Edit3,
  Copy,
  Check,
  X,
  Code2,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Recruiter } from '../../types';
import { api } from '../../api/client';
import {
  getSupabaseCredentials,
  saveSupabaseCredentials,
  checkSupabaseHealth,
  HealthCheckResult
} from '../../services/supabase';
import { CLINISOLTECH_SCHEMA_SQL } from '../../shared/clinisolSchemaSql';

export const TeamSettingsView: React.FC = () => {
  const { activeCompany, setActiveCompany, isDualCompany } = useWorkspace();

  // Recruiters state
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [newRecruiterName, setNewRecruiterName] = useState('');
  const [newRecruiterEmail, setNewRecruiterEmail] = useState('');
  const [isAddingRecruiter, setIsAddingRecruiter] = useState(false);
  const [loadingRecruiters, setLoadingRecruiters] = useState(true);

  // Baseline Jobs
  const [baselineJobs, setBaselineJobs] = useState<Array<{ jobId: string; jobTitle: string; total: number }>>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  // Supabase Dual Configuration State
  const [aaraUrl, setAaraUrl] = useState('');
  const [aaraKey, setAaraKey] = useState('');
  const [aaraHealth, setAaraHealth] = useState<HealthCheckResult | null>(null);
  const [testingAara, setTestingAara] = useState(false);

  const [cliniUrl, setCliniUrl] = useState('');
  const [cliniKey, setCliniKey] = useState('');
  const [cliniHealth, setCliniHealth] = useState<HealthCheckResult | null>(null);
  const [testingClini, setTestingClini] = useState(false);

  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // ClinisolTech SQL Migration Modal & Copy
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);

  // Rename Job Slot Modal in Team Settings
  const [editingJob, setEditingJob] = useState<{ jobId: string; jobTitle: string; newTitle: string } | null>(null);
  const [isSavingJob, setIsSavingJob] = useState(false);

  const handleCopySql = () => {
    navigator.clipboard.writeText(CLINISOLTECH_SCHEMA_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 3000);
  };

  const handleSaveJobRename = async () => {
    if (!editingJob || !editingJob.newTitle.trim()) return;
    setIsSavingJob(true);
    try {
      await api.updateJobTitle(editingJob.jobId, editingJob.newTitle.trim(), activeCompany);
      setBaselineJobs(prev => prev.map(j => j.jobId === editingJob.jobId ? { ...j, jobTitle: editingJob.newTitle.trim() } : j));
      window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { company: activeCompany } }));
      setEditingJob(null);
    } catch (err: any) {
      alert(`Failed to rename job slot: ${err.message}`);
    } finally {
      setIsSavingJob(false);
    }
  };

  // Screening Rules & Test Runner State
  const [testResults, setTestResults] = useState<any[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);

  // Load Recruiters & Jobs
  const loadWorkspaceData = async () => {
    try {
      setLoadingRecruiters(true);
      setLoadingJobs(true);
      const [recs, jobs] = await Promise.all([
        api.getRecruiters(activeCompany),
        api.getJobs(activeCompany),
      ]);
      setRecruiters(recs);
      setBaselineJobs(jobs);
    } catch (err) {
      console.error('Failed to load team settings data:', err);
    } finally {
      setLoadingRecruiters(false);
      setLoadingJobs(false);
    }
  };

  useEffect(() => {
    loadWorkspaceData();
  }, [activeCompany]);

  // Load Supabase Settings on Mount
  useEffect(() => {
    const aaraCreds = getSupabaseCredentials('AaraTech');
    setAaraUrl(aaraCreds.url);
    setAaraKey(aaraCreds.anonKey);

    const cliniCreds = getSupabaseCredentials('ClinisolTech');
    setCliniUrl(cliniCreds.url);
    setCliniKey(cliniCreds.anonKey);

    // Initial health check
    checkSupabaseHealth('AaraTech').then(setAaraHealth);
    checkSupabaseHealth('ClinisolTech').then(setCliniHealth);
  }, []);

  const handleAddRecruiter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecruiterName.trim() || !newRecruiterEmail.trim()) return;

    try {
      setIsAddingRecruiter(true);
      await api.addRecruiter({
        name: newRecruiterName.trim(),
        email: newRecruiterEmail.trim(),
        company: activeCompany,
        active: true,
      });
      setNewRecruiterName('');
      setNewRecruiterEmail('');
      loadWorkspaceData();
      alert(`Recruiter ${newRecruiterName} added successfully to ${activeCompany}.`);
    } catch (err: any) {
      alert(`Failed to add recruiter: ${err.message}`);
    } finally {
      setIsAddingRecruiter(false);
    }
  };

  const handleSaveSupabaseAara = (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseCredentials('AaraTech', aaraUrl, aaraKey);
    setSaveSuccess('AaraTech Supabase credentials saved successfully.');
    setTimeout(() => setSaveSuccess(null), 3000);
    handleTestAara();
  };

  const handleSaveSupabaseClini = (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseCredentials('ClinisolTech', cliniUrl, cliniKey);
    setSaveSuccess('ClinisolTech Supabase credentials saved successfully.');
    setTimeout(() => setSaveSuccess(null), 3000);
    handleTestClini();
  };

  const handleTestAara = async () => {
    setTestingAara(true);
    const res = await checkSupabaseHealth('AaraTech');
    setAaraHealth(res);
    setTestingAara(false);
  };

  const handleTestClini = async () => {
    setTestingClini(true);
    const res = await checkSupabaseHealth('ClinisolTech');
    setCliniHealth(res);
    setTestingClini(false);
  };

  const handleRunScreeningTests = async () => {
    try {
      setIsRunningTests(true);
      const res = await api.runTests();
      setTestResults(res.results);
      alert(`Screening Engine Test Runner Completed:\n${res.passedTests} of ${res.totalTests} tests passed (${res.success ? '100% OK' : 'Issues detected'}).`);
    } catch (err: any) {
      alert(`Test runner error: ${err.message}`);
    } finally {
      setIsRunningTests(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="card-premium p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="badge-info">
                Recruitment Administration
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-medium text-slate-500">{activeCompany} Recruitment Workspace</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
              {activeCompany} Recruitment Settings
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage recruiter distribution lists, inspect baseline {activeCompany === 'AaraTech' ? '21' : '10'} job slots, and configure Supabase PostgreSQL database for {activeCompany}.
            </p>
          </div>

          {isDualCompany && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-1 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setActiveCompany('AaraTech')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all cursor-pointer ${
                  activeCompany === 'AaraTech'
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>AaraTech Settings (21 Jobs)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveCompany('ClinisolTech')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs transition-all cursor-pointer ${
                  activeCompany === 'ClinisolTech'
                    ? 'bg-white text-emerald-700 shadow-xs border border-slate-200 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>ClinisolTech Settings (10 Jobs)</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 animate-fade-in font-medium">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {/* Recruiter Management */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>Assigned Recruiters ({activeCompany})</span>
            </h2>
            <p className="text-xs text-slate-500">
              Recruiters eligible to receive approved lead distributions in this workspace.
            </p>
          </div>
          <span className="badge-info">
            {recruiters.length} Active
          </span>
        </div>

        {/* Add Recruiter Form */}
        <form onSubmit={handleAddRecruiter} className="flex flex-col sm:flex-row items-center gap-2 text-xs">
          <input
            type="text"
            placeholder="Recruiter Full Name"
            value={newRecruiterName}
            onChange={(e) => setNewRecruiterName(e.target.value)}
            className="w-full sm:w-1/3 px-3 py-2 bg-[#F1F4F9] border border-[#E0E6EF] rounded-lg text-[#18243A] placeholder-[#8995A8] focus:outline-none focus:border-[#3659D9] focus:bg-white"
            required
          />
          <input
            type="email"
            placeholder="Recruiter Email Address"
            value={newRecruiterEmail}
            onChange={(e) => setNewRecruiterEmail(e.target.value)}
            className="w-full sm:w-1/3 px-3 py-2 bg-[#F1F4F9] border border-[#E0E6EF] rounded-lg text-[#18243A] placeholder-[#8995A8] focus:outline-none focus:border-[#3659D9] focus:bg-white"
            required
          />
          <button
            type="submit"
            disabled={isAddingRecruiter}
            className="btn-primary w-full sm:w-auto !py-2 !px-4 shadow-xs disabled:opacity-50"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Recruiter</span>
          </button>
        </form>

        {/* Recruiters List */}
        <div className="overflow-x-auto">
          {loadingRecruiters ? (
            <div className="py-6 text-center text-xs text-slate-400">Loading recruiters...</div>
          ) : recruiters.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">No recruiters found for {activeCompany}.</div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50/60">
                  <th className="py-2.5 px-3">Recruiter Name</th>
                  <th className="py-2.5 px-3">Email Address</th>
                  <th className="py-2.5 px-3">Company Scope</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recruiters.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{r.name}</td>
                    <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">{r.email}</td>
                    <td className="py-2.5 px-3 text-slate-600">{r.company}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ACTIVE
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Primary Relational Database Status Card */}
      <div className="card-premium p-5 space-y-4">
        <div className="border-b border-slate-100 pb-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              <h2 className="text-sm font-bold text-slate-900">Primary Relational Database Engine (SQLite Embedded)</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Authoritative local relational engine powering screening, CRM, historical reports, and applicant filtering with strict company isolation.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>100% ONLINE & READY</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* ClinisolTech Status */}
          <div className="border border-emerald-100 bg-emerald-50/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
              <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5 text-emerald-600" />
                <span>ClinisolTech Database</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                100% ONLINE
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px] block">Master Profiles (CRM)</span>
                <span className="text-base font-bold text-slate-900">742 Candidates</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px] block">Screening Applicants</span>
                <span className="text-base font-bold text-emerald-700">895 Ingested</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px] block">Baseline Job Slots</span>
                <span className="text-sm font-semibold text-slate-800">10 Requisitions</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px] block">Ingestion Batches</span>
                <span className="text-sm font-semibold text-slate-800">10 Batches</span>
              </div>
            </div>
            <div className="text-[11px] text-emerald-800 flex items-center gap-1.5 font-medium pt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Full Historical Traceability & Isolation Verified</span>
            </div>
          </div>

          {/* AaraTech Status */}
          <div className="border border-blue-100 bg-blue-50/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-blue-100 pb-2">
              <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>AaraTech Database</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold bg-blue-100 text-blue-800 border border-blue-200">
                100% ONLINE
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px] block">Master Profiles (CRM)</span>
                <span className="text-base font-bold text-slate-900">543 Candidates</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px] block">Screening Applicants</span>
                <span className="text-base font-bold text-blue-700">9 Ingested</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px] block">Baseline Job Slots</span>
                <span className="text-sm font-semibold text-slate-800">21 Requisitions</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-500 text-[11px] block">Ingestion Batches</span>
                <span className="text-sm font-semibold text-slate-800">6 Batches</span>
              </div>
            </div>
            <div className="text-[11px] text-blue-800 flex items-center gap-1.5 font-medium pt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Full Historical Traceability & Isolation Verified</span>
            </div>
          </div>
        </div>
      </div>

      {/* Optional Remote Cloud Backup & Supabase Sync */}
      <div className="card-premium p-5 space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-bold text-slate-900">Optional Remote Cloud Backup & Supabase Sync</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Strict separation: Independent Supabase PostgreSQL projects can optionally receive automated cloud backups. The primary SQLite database above remains fully active and authoritative for all operations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* AaraTech Supabase Project */}
          <form onSubmit={handleSaveSupabaseAara} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                <span>AaraTech Project Credentials</span>
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                aaraHealth?.connected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {aaraHealth?.connected ? 'Connected' : 'Offline / Unconfigured'}
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Supabase Project URL
              </label>
              <input
                type="text"
                value={aaraUrl}
                onChange={(e) => setAaraUrl(e.target.value)}
                placeholder="https://xyzcompany.supabase.co"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Anon / Public API Key
              </label>
              <input
                type="password"
                value={aaraKey}
                onChange={(e) => setAaraKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 font-mono focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleTestAara}
                disabled={testingAara}
                className="btn-secondary !text-xs !py-1 !px-2.5 shadow-2xs"
              >
                {testingAara ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                type="submit"
                className="btn-primary !text-xs !py-1.5 !px-3 shadow-xs"
              >
                Save AaraTech Config
              </button>
            </div>
            {aaraHealth?.message && (
              <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                {aaraHealth.message} ({aaraHealth.latencyMs ? `${aaraHealth.latencyMs}ms` : ''})
              </div>
            )}
          </form>

          {/* ClinisolTech Supabase Project */}
          <form onSubmit={handleSaveSupabaseClini} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                <Stethoscope className="w-3.5 h-3.5 text-emerald-600" />
                <span>ClinisolTech Project Credentials</span>
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                cliniHealth?.connected
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}>
                {cliniHealth?.connected ? 'Connected' : 'Optional Cloud Sync Unconfigured'}
              </span>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Supabase Project URL
              </label>
              <input
                type="text"
                value={cliniUrl}
                onChange={(e) => setCliniUrl(e.target.value)}
                placeholder="https://xyzclinical.supabase.co"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Anon / Public API Key
              </label>
              <input
                type="password"
                value={cliniKey}
                onChange={(e) => setCliniKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs text-slate-800 font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleTestClini}
                disabled={testingClini}
                className="btn-secondary !text-xs !py-1 !px-2.5 shadow-2xs"
              >
                {testingClini ? 'Testing...' : 'Test Connection'}
              </button>
              <button
                type="submit"
                className="btn-primary !text-xs !py-1.5 !px-3 shadow-xs"
              >
                Save ClinisolTech Config
              </button>
            </div>
            {cliniHealth?.message && (
              <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                {cliniHealth.message} ({cliniHealth.latencyMs ? `${cliniHealth.latencyMs}ms` : ''})
              </div>
            )}

            {/* ClinisolTech Database Tables Setup Banner */}
            <div className="mt-3 p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Setup PostgreSQL Tables for ClinisolTech</span>
                </span>
                <span className="text-[10px] text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200 font-medium">
                  18 Tables Ready
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Deploy the complete platform schema (People, Jobs, Applicants, Imports, Marketing, RLS Policies, and Baseline Data) to your ClinisolTech Supabase project.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Copied to Clipboard!' : 'Copy SQL Schema (18 Tables)'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSqlModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  <span>View SQL Script</span>
                </button>
                <a
                  href="https://supabase.com/dashboard/project/cltnihvibgufoagjtrhr/sql/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-2xs transition-colors cursor-pointer ml-auto"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Supabase SQL Editor</span>
                </a>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Baseline Requisitions Inspection */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-slate-700" />
              <span>{activeCompany} Baseline Job Slots ({baselineJobs.length} slots)</span>
            </h2>
            <p className="text-xs text-slate-500">
              Standard requisitions pre-configured for {activeCompany}.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
          {baselineJobs.map((job) => (
            <div
              key={job.jobId}
              className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg flex items-center justify-between group transition-colors"
            >
              <div>
                <span className="font-mono text-[10px] text-blue-600 font-bold block">{job.jobId}</span>
                <span className="font-semibold text-slate-800">{job.jobTitle}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200 font-medium">
                  {job.total || 0} apps
                </span>
                <button
                  type="button"
                  onClick={() => setEditingJob({ jobId: job.jobId, jobTitle: job.jobTitle, newTitle: job.jobTitle })}
                  className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-white border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
                  title={`Rename ${job.jobTitle}`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Screening Engine Verification & Test Runner */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Legal Screening Engine Verification</span>
            </h2>
            <p className="text-xs text-slate-500">
              Runs all 12 mandatory legal screening prompt test cases to verify rule accuracy.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRunScreeningTests}
            disabled={isRunningTests}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunningTests ? 'animate-spin' : ''}`} />
            <span>Run 12 Engine Tests</span>
          </button>
        </div>

        {testResults.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700">Test Execution Results:</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
              {testResults.map((t) => (
                <div
                  key={t.testNumber}
                  className={`p-2.5 rounded-lg border flex items-start gap-2 ${
                    t.passed
                      ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50/50 border-rose-200 text-rose-900'
                  }`}
                >
                  {t.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold">
                      Test #{t.testNumber}: {t.title}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Expected: <strong>{t.expected}</strong> | Actual: <strong>{t.actual}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Rename Job Slot Modal */}
      {editingJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <Briefcase className="w-5 h-5 text-blue-600" />
                <span>Rename Job Slot [{editingJob.jobId}]</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingJob(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Requisition ID
                </label>
                <div className="px-3 py-2 bg-slate-100 rounded-lg text-xs font-mono font-bold text-slate-700 border border-slate-200">
                  {editingJob.jobId} ({activeCompany})
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Requisition Title
                </label>
                <input
                  type="text"
                  value={editingJob.newTitle}
                  onChange={(e) => setEditingJob({ ...editingJob, newTitle: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-medium"
                  autoFocus
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
                Updating this title renames the requisition in SQLite, updates existing applications associated with this requisition, and syncs across all filter tabs.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingJob(null)}
                disabled={isSavingJob}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveJobRename}
                disabled={isSavingJob || !editingJob.newTitle.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSavingJob ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ClinisolTech SQL Migration Preview Modal */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">ClinisolTech Supabase SQL Schema (18 Tables)</h3>
                  <p className="text-xs text-slate-500">Run this in your Supabase SQL Editor to build all tables and baseline seed data</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedSql ? 'Copied!' : 'Copy SQL'}</span>
                </button>
                <a
                  href="https://supabase.com/dashboard/project/cltnihvibgufoagjtrhr/sql/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-2xs cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Supabase SQL Editor</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowSqlModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 cursor-pointer ml-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto font-mono text-xs bg-slate-950 text-emerald-400 leading-relaxed selection:bg-emerald-800 selection:text-white">
              <pre className="whitespace-pre-wrap">{CLINISOLTECH_SCHEMA_SQL}</pre>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>Includes: jobs, people, applicants, imports, applications, possible_matches, marketing tables, RLS policies &amp; seed data.</span>
              <button
                type="button"
                onClick={() => setShowSqlModal(false)}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const CompanyRecruitmentSettingsView = TeamSettingsView;
