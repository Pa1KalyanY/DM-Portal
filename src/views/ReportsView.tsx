import React, { useState, useEffect } from 'react';
import { FileBarChart2, Download, FileSpreadsheet, FileText, CheckCircle2, XCircle, AlertTriangle, Copy } from 'lucide-react';
import { DashboardStats } from '../types';
import { api } from '../api/client';

export const ReportsView: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const data = await api.getDashboardStats();
        setStats(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  const handleCopySheets = async () => {
    try {
      const res = await api.copyGoogleSheetsTsv({ status: 'ALL' });
      setCopiedNotice(res.message);
      setTimeout(() => setCopiedNotice(null), 4000);
    } catch (err: any) {
      alert(`Could not copy: ${err.message}`);
    }
  };

  const handleExport = (format: 'xlsx' | 'csv' | 'tsv') => {
    const url = api.getExportUrl(format, { template: 'clean' });
    window.open(url, '_blank');
  };

  if (loading || !stats) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading processing report...</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Title Card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
            <FileBarChart2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">PROCESSING REPORT</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Comprehensive audit breakdown across screening questions and final dispositions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopySheets}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition"
            title="Copy 8 clean columns directly for Google Sheets (Ctrl+V)"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy for Google Sheets</span>
          </button>
          <button
            onClick={() => handleExport('xlsx')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Export XLSX</span>
          </button>
          <button
            onClick={() => handleExport('csv')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs transition"
          >
            <FileText className="w-3.5 h-3.5 text-blue-600" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {copiedNotice && (
        <div className="p-3 bg-emerald-600 text-white rounded-xl shadow-xs flex items-center justify-between text-xs font-bold">
          <span>{copiedNotice}</span>
          <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono">Ready to paste (Ctrl+V)</span>
        </div>
      )}


      {/* Main Report Document (Layout styled exactly to Section 48) */}
      <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm space-y-8 font-sans">
        {/* Header Summary */}
        <div className="border-b border-slate-200 pb-5">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">LinkedIn Applicant Screening</div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">PROCESSING REPORT SUMMARY</h1>
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-400 font-semibold block text-[11px]">Total Files Processed</span>
              <strong className="text-xl text-slate-900 font-black mt-1 block">{stats.filesProcessed}</strong>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-400 font-semibold block text-[11px]">Total Applicants</span>
              <strong className="text-xl text-slate-900 font-black mt-1 block">{stats.applicantsProcessed.toLocaleString()}</strong>
            </div>
            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
              <span className="text-emerald-700 font-semibold block text-[11px]">Screening Pass Rate</span>
              <strong className="text-xl text-emerald-800 font-black mt-1 block">
                {stats.applicantsProcessed > 0 ? Math.round((stats.passedCount / stats.applicantsProcessed) * 100) : 0}%
              </strong>
            </div>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
              <span className="text-slate-400 font-semibold block text-[11px]">Generated Date</span>
              <strong className="text-xs text-slate-800 font-bold mt-2 block">{new Date().toLocaleDateString()}</strong>
            </div>
          </div>
        </div>

        {/* Section 1: Question Breakdown */}
        <div className="space-y-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
            1. MANDATORY SCREENING QUESTION BREAKDOWN
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Green Card / US Citizen */}
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-800">Green Card / US Citizen</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800">Req: YES</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">YES:</span>
                  <strong className="text-emerald-700 font-bold">{stats.greenCardYes.toLocaleString()}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">NO:</span>
                  <strong className="text-rose-700 font-bold">{stats.greenCardNo.toLocaleString()}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">Missing / Unclear:</span>
                  <strong className="text-amber-700 font-bold">{stats.greenCardMissing.toLocaleString()}</strong>
                </div>
              </div>
            </div>

            {/* Future Sponsorship */}
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <span className="text-xs font-bold text-slate-800">Future Sponsorship</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">Req: NO</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">NO:</span>
                  <strong className="text-emerald-700 font-bold">{stats.sponsorshipNo.toLocaleString()}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">YES:</span>
                  <strong className="text-rose-700 font-bold">{stats.sponsorshipYes.toLocaleString()}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">Missing / Unclear:</span>
                  <strong className="text-amber-700 font-bold">{stats.sponsorshipMissing.toLocaleString()}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Final Results */}
        <div className="space-y-4 pt-4 border-t border-slate-200">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">
            2. FINAL SCREENING CLASSIFICATION DISPOSITION
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
              <div className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>PASS</span>
              </div>
              <div className="text-2xl font-black text-emerald-900 mt-2">{stats.passedCount.toLocaleString()}</div>
              <div className="text-[10px] text-emerald-700 font-semibold mt-1">Meets both mandatory rules</div>
            </div>

            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
              <div className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-rose-600" />
                <span>FAIL</span>
              </div>
              <div className="text-2xl font-black text-rose-900 mt-2">{stats.failedCount.toLocaleString()}</div>
              <div className="text-[10px] text-rose-700 font-semibold mt-1">Failed one or both rules</div>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
              <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>MANUAL REVIEW</span>
              </div>
              <div className="text-2xl font-black text-amber-900 mt-2">{stats.manualReviewCount.toLocaleString()}</div>
              <div className="text-[10px] text-amber-700 font-semibold mt-1">Missing or unclear answers</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span>ERRORS</span>
              </div>
              <div className="text-2xl font-black text-slate-800 mt-2">{stats.errorCount.toLocaleString()}</div>
              <div className="text-[10px] text-slate-500 font-semibold mt-1">Malformed input rows</div>
            </div>
          </div>
        </div>

        {/* Section 3: Legal & Phase 1 Compliance Notice */}
        <div className="pt-4 border-t border-slate-200 text-xs text-slate-500 leading-relaxed space-y-1">
          <p className="font-semibold text-slate-700">Audit Compliance Notice:</p>
          <p>
            This screening report reflects deterministic logical rules applied directly to original raw applicant responses exported from LinkedIn Recruiter. No AI candidate scoring, candidate duplicate detection, candidate merging, or ethnicity/nationality classification has been performed. Original data rows are preserved indefinitely in accordance with recruiting compliance policies.
          </p>
        </div>
      </div>
    </div>
  );
};
