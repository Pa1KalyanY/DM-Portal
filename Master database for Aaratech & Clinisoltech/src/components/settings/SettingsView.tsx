import React, { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Key,
  Globe,
  Copy,
  Check,
  Shield,
  RotateCcw,
  HardDrive,
  CloudUpload,
  Layers,
  Sparkles,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import {
  checkSupabaseHealth,
  getSupabaseCredentials,
  saveSupabaseCredentials,
  clearSupabaseCredentials,
  HealthCheckResult,
} from '../../lib/supabase';
import { dbService } from '../../lib/dbService';
import { geminiService } from '../../lib/geminiService';
import { MASTER_SCHEMA_SQL } from '../../lib/migrationSql';

interface SettingsViewProps {
  onHealthStatusChanged?: (connected: boolean) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onHealthStatusChanged }) => {
  const [health, setHealth] = useState<HealthCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedFullSql, setCopiedFullSql] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Gemini AI Engine State
  const [geminiKey, setGeminiKey] = useState(geminiService.getApiKey() || '');
  const [geminiModel, setGeminiModel] = useState(geminiService.getModel());
  const [geminiTesting, setGeminiTesting] = useState(false);
  const [geminiTestResult, setGeminiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [geminiSaveSuccess, setGeminiSaveSuccess] = useState(false);

  // Storage Stats State
  const [storageStats, setStorageStats] = useState<{
    peopleCount: number;
    jobsCount: number;
    importsCount: number;
    matchesCount: number;
    auditCount: number;
    storageEngine: string;
  } | null>(null);
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  useEffect(() => {
    const creds = getSupabaseCredentials();
    setUrl(creds.url);
    setAnonKey(creds.anonKey);
    runHealthCheck();
    loadStorageStats();
  }, []);

  const loadStorageStats = async () => {
    try {
      const stats = await dbService.getStorageStats();
      setStorageStats(stats);
    } catch (e) {
      console.warn('Failed to fetch storage stats:', e);
    }
  };

  const runHealthCheck = async () => {
    setChecking(true);
    const res = await checkSupabaseHealth();
    setHealth(res);
    setChecking(false);
    if (onHealthStatusChanged) {
      onHealthStatusChanged(res.connected);
    }
  };

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    saveSupabaseCredentials(url, anonKey);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
    runHealthCheck();
    loadStorageStats();
  };

  const handleClearCredentials = () => {
    clearSupabaseCredentials();
    setUrl('');
    setAnonKey('');
    runHealthCheck();
    loadStorageStats();
  };

  const handleSaveGemini = (e: React.FormEvent) => {
    e.preventDefault();
    geminiService.setApiKey(geminiKey.trim());
    geminiService.setModel(geminiModel);
    setGeminiSaveSuccess(true);
    setTimeout(() => setGeminiSaveSuccess(false), 3000);
  };

  const handleClearGemini = () => {
    geminiService.clearApiKey();
    setGeminiKey('');
    setGeminiTestResult(null);
  };

  const handleTestGemini = async () => {
    if (!geminiKey.trim()) return;
    setGeminiTesting(true);
    setGeminiTestResult(null);
    geminiService.setApiKey(geminiKey.trim());
    geminiService.setModel(geminiModel);
    const res = await geminiService.testConnection(geminiModel);
    setGeminiTestResult(res);
    setGeminiTesting(false);
  };

  const handleSyncToSupabase = async () => {
    setSyncingCloud(true);
    setSyncResult(null);
    try {
      const res = await dbService.syncAllLocalToSupabase();
      setSyncResult(res.message);
      await loadStorageStats();
      await runHealthCheck();
    } catch (err: any) {
      setSyncResult(err?.message || 'Sync failed.');
    } finally {
      setSyncingCloud(false);
    }
  };

  const handleClearAllData = async () => {
    if (window.confirm('Wipe ALL candidate profiles, historical imports, and touchpoints to start with a 100% empty database?')) {
      await dbService.clearAllData();
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 3000);
      runHealthCheck();
      loadStorageStats();
    }
  };

  const copyMigrationPath = () => {
    navigator.clipboard.writeText('/supabase/migrations/20261008000001_master_database_schema.sql');
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const copyFullSql = () => {
    navigator.clipboard.writeText(MASTER_SCHEMA_SQL);
    setCopiedFullSql(true);
    setTimeout(() => setCopiedFullSql(false), 2500);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          System Diagnostics &amp; Storage Architecture
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Verify database connection health, configure environment credentials, inspect permanent IndexedDB storage, and execute PostgreSQL migration scripts.
        </p>
      </div>

      {/* Permanent Storage Health Card (IndexedDB) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-indigo-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Permanent Browser Storage Status (IndexedDB)
            </h2>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Permanent &bull; No 5MB Quota Limits
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-xs font-semibold text-slate-500 uppercase">Stored Candidates</div>
            <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
              {storageStats ? storageStats.peopleCount.toLocaleString() : '...'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Retained permanently on disk</div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-xs font-semibold text-slate-500 uppercase">Import Batches</div>
            <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
              {storageStats ? storageStats.importsCount.toLocaleString() : '...'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Historical ingestion logs</div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-xs font-semibold text-slate-500 uppercase">System Jobs</div>
            <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
              {storageStats ? storageStats.jobsCount.toLocaleString() : '...'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">AaraTech &amp; ClinisolTech slots</div>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div className="text-xs font-semibold text-slate-500 uppercase">Audit Touchpoints</div>
            <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">
              {storageStats ? storageStats.auditCount.toLocaleString() : '...'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Verbatim recruiter notes</div>
          </div>
        </div>

        {/* 1-Click Cloud Sync Action */}
        <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
              <CloudUpload className="w-4 h-4 text-indigo-600" />
              <span>Sync Local Data to Supabase PostgreSQL</span>
            </h4>
            <p className="text-xs text-indigo-700/80 mt-0.5">
              Uploaded files are stored locally in IndexedDB. Click to push all local records to your Supabase PostgreSQL cloud database.
            </p>
          </div>

          <button
            onClick={handleSyncToSupabase}
            disabled={syncingCloud || !health?.connected}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-2 transition-colors shrink-0"
          >
            <CloudUpload className={`w-3.5 h-3.5 ${syncingCloud ? 'animate-bounce' : ''}`} />
            <span>{syncingCloud ? 'Synchronizing Records...' : 'Push to Supabase Cloud'}</span>
          </button>
        </div>

        {syncResult && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{syncResult}</span>
          </div>
        )}
      </div>

      {/* Supabase Connection Health Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Supabase PostgreSQL Connection Status
            </h2>
          </div>
          <button
            onClick={runHealthCheck}
            disabled={checking}
            className="px-3.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
            <span>Test Connection Now</span>
          </button>
        </div>

        {health && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-xs font-semibold text-slate-500 uppercase">System Status</div>
              <div className="flex items-center gap-2 mt-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    health.connected ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span className="font-bold text-sm text-slate-900">
                  {health.connected ? 'Supabase Live Connected' : 'IndexedDB Local Standby'}
                </span>
              </div>
              <div className="text-xs text-slate-500 mt-1">{health.message}</div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-xs font-semibold text-slate-500 uppercase">Query Latency</div>
              <div className="text-xl font-bold text-slate-900 mt-2 font-mono">
                {health.latencyMs !== undefined ? `${health.latencyMs} ms` : 'Local < 1 ms'}
              </div>
              <div className="text-xs text-slate-500 mt-1">PostgreSQL round-trip response</div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="text-xs font-semibold text-slate-500 uppercase">Last Health Ping</div>
              <div className="text-sm font-bold text-slate-900 mt-2 font-mono">
                {health.timestamp}
              </div>
              <div className="text-xs text-slate-500 mt-1">Automated interval verification</div>
            </div>
          </div>
        )}
      </div>

      {/* Google Gemini AI Re-Verification Engine */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span>Google Gemini AI Engine</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                    geminiService.hasApiKey()
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {geminiService.hasApiKey() ? 'API Key Active' : 'Key Not Configured'}
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Powers AI duplicate verification for <strong>Possible Matches</strong> and intelligent contact extraction for <strong>Incomplete Profiles</strong>.
              </p>
            </div>
          </div>

          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors"
          >
            <span>Get Free Key</span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>

        {geminiSaveSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Gemini AI settings saved successfully!</span>
          </div>
        )}

        {geminiTestResult && (
          <div
            className={`p-3 rounded-lg text-xs font-semibold flex items-center gap-2 ${
              geminiTestResult.success
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {geminiTestResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{geminiTestResult.message}</span>
          </div>
        )}

        <form onSubmit={handleSaveGemini} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Gemini Model
              </label>
              <select
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Active &amp; Fast)</option>
                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite (High Speed)</option>
                <option value="gemini-3.8-flash">Gemini 3.8 Flash (Next-Gen)</option>
                <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-slate-400" />
                <span>Google Gemini API Key</span>
              </label>
              <input
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleClearGemini}
              className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg font-medium transition-colors cursor-pointer"
            >
              Clear Gemini Key
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleTestGemini}
                disabled={geminiTesting || !geminiKey.trim()}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {geminiTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                <span>{geminiTesting ? 'Testing API...' : 'Test Connection'}</span>
              </button>

              <button
                type="submit"
                className="px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Save Gemini Settings</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Supabase API Credentials Configuration */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <Key className="w-5 h-5 text-blue-600" />
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            Supabase Project Credentials (.env / Runtime)
          </h2>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Provide your <strong>Supabase Project URL</strong> and <strong>Public/Anon API Key</strong>.
          These can also be saved in the root <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">.env</code> file
          under <code className="text-blue-600 font-mono">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-blue-600 font-mono">VITE_SUPABASE_ANON_KEY</code>.
          <br />
          <strong className="text-amber-700">Security Rule:</strong> Never provide the database service-role secret key.
        </p>

        {saveSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Credentials saved successfully. Re-running health test...</span>
          </div>
        )}

        <form onSubmit={handleSaveCredentials} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-400" />
              <span>VITE_SUPABASE_URL</span>
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xyzcompany.supabase.co"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-slate-400" />
              <span>VITE_SUPABASE_ANON_KEY (Public Key)</span>
            </label>
            <input
              type="password"
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleClearCredentials}
              className="px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-lg font-medium transition-colors"
            >
              Clear Stored Credentials
            </button>

            <button
              type="submit"
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
            >
              Save &amp; Connect to Supabase
            </button>
          </div>
        </form>
      </div>

      {/* Database Schema Migration Instructions */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              PostgreSQL Database Schema &amp; Migrations
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Run this script once in your Supabase SQL Editor to initialize all 13 relational tables and RLS policies.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={copyFullSql}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            >
              {copiedFullSql ? <Check className="w-3.5 h-3.5 text-emerald-200" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedFullSql ? 'Complete SQL Copied!' : 'Copy Full SQL Script'}</span>
            </button>
            <button
              onClick={copyMigrationPath}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSql ? 'Path Copied!' : 'Copy Path'}</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          The full normalized PostgreSQL migration SQL is ready in your project at:
          <br />
          <code className="font-mono text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-[11px] block mt-1.5 select-all">
            supabase/migrations/20261008000001_master_database_schema.sql
          </code>
        </p>

        <div className="p-4 bg-slate-900 text-slate-200 rounded-xl font-mono text-xs space-y-2 overflow-x-auto">
          <div className="text-slate-400">-- Migration Summary:</div>
          <div>✓ Tables: people, person_emails, person_phones, applications, recruiter_contacts, jobs, imports, import_rows, possible_matches, person_status_history, audit_log, merge_history</div>
          <div>✓ Automatic ID sequences: P-000001, IMP-000001, PM-000001</div>
          <div>✓ High-performance pg_trgm &amp; B-Tree indexes on emails, phones, names, person_id</div>
          <div>✓ Preloaded with initial 31 configurable job slots (AaraTech: 21, ClinisolTech: 10)</div>
          <div>✓ Row Level Security (RLS) policies configured for CRM access</div>
        </div>
      </div>

      {/* Database Maintenance */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Database Slate Controls</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Wipe all candidate profiles, historical imports, and touchpoint notes to maintain a completely clean database.
          </p>
        </div>

        <button
          onClick={handleClearAllData}
          className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
          <span>Clear All Data (Fresh Slate)</span>
        </button>
      </div>
    </div>
  );
};
