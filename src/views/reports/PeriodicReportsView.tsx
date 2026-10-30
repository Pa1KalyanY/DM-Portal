import React, { useState, useEffect } from 'react';
import {
  FileBarChart2,
  Calendar,
  Building2,
  Stethoscope,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  TrendingUp,
  Download,
  Users,
  Briefcase,
  RefreshCw,
  Database,
  ArrowRight,
  ShieldCheck,
  Check
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { api } from '../../api/client';

import {
  readNavigationStateFromUrl,
  readPersistedBackupState,
  syncNavigationToUrlAndStorage,
} from '../../shared/navigationState';

export const PeriodicReportsView: React.FC = () => {
  const { activeCompany } = useWorkspace();

  const [period, setPeriodState] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>(() => {
    const urlState = readNavigationStateFromUrl();
    if (urlState.reportPeriod) return urlState.reportPeriod;
    const backup = readPersistedBackupState();
    if (backup.reportPeriod) return backup.reportPeriod;
    return 'daily';
  });

  const [selectedDate, setSelectedDateState] = useState<string>(() => {
    const urlState = readNavigationStateFromUrl();
    if (urlState.reportDate) return urlState.reportDate;
    const backup = readPersistedBackupState();
    if (backup.reportDate) return backup.reportDate;
    return new Date().toISOString().split('T')[0];
  });

  const [customStartDate, setCustomStartDateState] = useState<string>(() => {
    const urlState = readNavigationStateFromUrl();
    if (urlState.startDate) return urlState.startDate;
    const backup = readPersistedBackupState();
    if (backup.startDate) return backup.startDate;
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().split('T')[0];
  });

  const [customEndDate, setCustomEndDateState] = useState<string>(() => {
    const urlState = readNavigationStateFromUrl();
    if (urlState.endDate) return urlState.endDate;
    const backup = readPersistedBackupState();
    if (backup.endDate) return backup.endDate;
    return new Date().toISOString().split('T')[0];
  });

  const setPeriod = (p: 'daily' | 'weekly' | 'monthly' | 'custom') => {
    setPeriodState(p);
    syncNavigationToUrlAndStorage({
      section: 'reports',
      company: activeCompany,
      reportPeriod: p,
      reportDate: selectedDate,
      startDate: customStartDate,
      endDate: customEndDate,
    }, 'push');
  };

  const setSelectedDate = (d: string) => {
    setSelectedDateState(d);
    syncNavigationToUrlAndStorage({
      section: 'reports',
      company: activeCompany,
      reportPeriod: period,
      reportDate: d,
      startDate: customStartDate,
      endDate: customEndDate,
    }, 'replace');
  };

  const setCustomStartDate = (d: string) => {
    setCustomStartDateState(d);
    syncNavigationToUrlAndStorage({
      section: 'reports',
      company: activeCompany,
      reportPeriod: period,
      reportDate: selectedDate,
      startDate: d,
      endDate: customEndDate,
    }, 'replace');
  };

  const setCustomEndDate = (d: string) => {
    setCustomEndDateState(d);
    syncNavigationToUrlAndStorage({
      section: 'reports',
      company: activeCompany,
      reportPeriod: period,
      reportDate: selectedDate,
      startDate: customStartDate,
      endDate: d,
    }, 'replace');
  };

  // Sync state to URL on mount
  useEffect(() => {
    syncNavigationToUrlAndStorage({
      section: 'reports',
      company: activeCompany,
      reportPeriod: period,
      reportDate: selectedDate,
      startDate: customStartDate,
      endDate: customEndDate,
    }, 'replace');
  }, [activeCompany]);

  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);

  const fetchReport = async () => {
    try {
      setLoading(true);
      const data = await api.getReportAnalytics(
        activeCompany,
        period,
        selectedDate,
        period === 'custom' ? customStartDate : undefined,
        period === 'custom' ? customEndDate : undefined
      );
      setReportData(data);
    } catch (err) {
      console.error('Failed to load report analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();

    const handleUpdate = () => {
      fetchReport();
    };

    window.addEventListener('workspace-data-updated', handleUpdate);
    return () => {
      window.removeEventListener('workspace-data-updated', handleUpdate);
    };
  }, [activeCompany, period, selectedDate, customStartDate, customEndDate]);

  // Export current report data to structured CSV
  const handleExportCsv = () => {
    if (!reportData) return;
    setExporting(true);
    try {
      const now = new Date().toISOString();
      const dateRangeStr =
        period === 'custom'
          ? `${customStartDate} to ${customEndDate}`
          : period === 'daily'
          ? selectedDate
          : period === 'weekly'
          ? `${selectedDate} (Previous 7 Days)`
          : `${selectedDate} (Monthly Window)`;

      const lines: string[] = [
        `"Recruitment Operations & Screening Periodic Report"`,
        `"Company Workspace","${activeCompany}"`,
        `"Reporting Period","${period.toUpperCase()}"`,
        `"Date Range / Reference Date","${dateRangeStr}"`,
        `"Reporting Basis","Application Date (Volume) / Current Status (Screening Outcomes)"`,
        `"Generated Timestamp","${now}"`,
        ``,
        `"--- 1. OVERALL METRICS SUMMARY ---"`,
        `"Metric","Count","Notes"`,
        `"Total Applications",${reportData.totalApplications || 0},"Total applications within reporting window"`,
        `"Passed (Copy-Ready)",${reportData.passedCount || 0},"Approved for recruitment operations"`,
        `"Failed Requirements",${reportData.failedCount || 0},"Ineligible based on work auth or legal screening"`,
        `"Manual Review Queue",${reportData.manualReviewCount || 0},"Pending recruiter decision"`,
        `"Duplicates / Re-uploads",${reportData.duplicateCount || 0},"Re-application to same job slot"`,
        `"Master Profiles Linked",${reportData.masterLinked || 0},"Unified master candidate identity linked"`,
        `"Review Queue / Unlinked",${(reportData.needsReview || 0) + (reportData.unlinked || 0)},"Incomplete or identity review required"`,
        `"Pass Rate","${reportData.passRate || 0}%","Passed / Total percentage"`,
        ``,
        `"--- 2. JOB REQUISITION PERFORMANCE ---"`,
        `"Slot ID","Job Title","Total Applications","Passed","Manual Review","Failed","Pass Rate"`,
      ];

      if (reportData.jobSlotDistribution && Array.isArray(reportData.jobSlotDistribution)) {
        for (const slot of reportData.jobSlotDistribution) {
          const rate = slot.total > 0 ? Math.round((slot.passed / slot.total) * 100) : 0;
          lines.push(
            `"${slot.jobId}","${(slot.jobTitle || '').replace(/"/g, '""')}",${slot.total},${slot.passed},${slot.manualReview || 0},${slot.failed},"${rate}%"`
          );
        }
      }

      lines.push(``);
      lines.push(`"--- 3. DAILY ACTIVITY TIMELINE ---"`);
      lines.push(`"Date","Total Applications","Passed","Manual Review","Failed"`);

      if (reportData.dailyBreakdown && Array.isArray(reportData.dailyBreakdown)) {
        for (const row of reportData.dailyBreakdown) {
          lines.push(`"${row.date}",${row.total},${row.passed},${row.manualReview || 0},${row.failed}`);
        }
      }

      const csvContent = lines.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Recruitment_Report_${activeCompany}_${period}_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export error: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Filter Controls */}
      <div className="card-premium p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="badge-pass">
                Reporting &amp; Reconciliation
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-medium text-slate-500">{activeCompany} Workspace</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
              Periodic Recruitment &amp; Performance Reports
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Historical audits, screening outcomes, and master linking remain permanently preserved across all batches.
            </p>
          </div>

          {/* Timeframe & Date Picker */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Period Selector */}
            <div className="bg-slate-50 border border-slate-200 p-0.5 rounded-lg flex items-center text-xs font-medium">
              <button
                type="button"
                onClick={() => setPeriod('daily')}
                className={`px-3 py-1.5 rounded transition-all cursor-pointer ${
                  period === 'daily'
                    ? 'bg-[#3659D9] text-white font-semibold shadow-xs'
                    : 'text-[#65738B] hover:text-[#18243A]'
                }`}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => setPeriod('weekly')}
                className={`px-3 py-1.5 rounded transition-all cursor-pointer ${
                  period === 'weekly'
                    ? 'bg-[#3659D9] text-white font-semibold shadow-xs'
                    : 'text-[#65738B] hover:text-[#18243A]'
                }`}
              >
                Weekly (7D)
              </button>
              <button
                type="button"
                onClick={() => setPeriod('monthly')}
                className={`px-3 py-1.5 rounded transition-all cursor-pointer ${
                  period === 'monthly'
                    ? 'bg-[#3659D9] text-white font-semibold shadow-xs'
                    : 'text-[#65738B] hover:text-[#18243A]'
                }`}
              >
                Monthly (30D)
              </button>
              <button
                type="button"
                onClick={() => setPeriod('custom')}
                className={`px-3 py-1.5 rounded transition-all cursor-pointer ${
                  period === 'custom'
                    ? 'bg-[#3659D9] text-white font-semibold shadow-xs'
                    : 'text-[#65738B] hover:text-[#18243A]'
                }`}
              >
                Custom Range
              </button>
            </div>

            {/* Date Pickers */}
            {period !== 'custom' ? (
              <div className="flex items-center gap-1.5 bg-[#F1F4F9] border border-[#E0E6EF] px-2.5 py-1.5 rounded-lg text-xs">
                <Calendar className="w-3.5 h-3.5 text-[#8995A8]" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent text-[#18243A] text-xs focus:outline-none"
                />
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-[#F1F4F9] border border-[#E0E6EF] px-2.5 py-1 rounded-lg text-xs">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-transparent text-[#18243A] text-xs focus:outline-none"
                />
                <span className="text-[#8995A8] font-bold">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-transparent text-[#18243A] text-xs focus:outline-none"
                />
              </div>
            )}

            {/* Export CSV Button (Primary Action) */}
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={exporting || loading}
              className="btn-primary !py-1.5 !px-3 !text-xs shadow-xs"
              title="Export complete report with metadata, parameters, and breakdowns to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            {/* Refresh */}
            <button
              type="button"
              onClick={fetchReport}
              className="p-1.5 rounded-lg border border-[#E0E6EF] bg-white hover:bg-[#F1F4F9] text-[#65738B] transition-colors cursor-pointer"
              title="Refresh Report"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Prominent Reporting Basis Banner */}
        <div className="mt-4 pt-3 border-t border-[#E0E6EF] flex flex-wrap items-center justify-between text-[11px] text-[#65738B] gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#18243A]">Reporting Basis:</span>
            <span>Application Date for Volume Reporting</span>
            <span>•</span>
            <span>Current Status for Screening Outcomes</span>
            <span>•</span>
            <span>Upload Timestamp for Import History</span>
          </div>
          <div className="font-medium text-[#65738B]">
            Company: <strong className="text-[#18243A]">{activeCompany}</strong> | Window: <strong className="text-[#18243A] capitalize">{period}</strong>
          </div>
        </div>
      </div>

      {/* Main Metric Cards (Pure White Surfaces with Restrained Status Accents) */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* Total Applications */}
        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="text-xs text-[#65738B] font-medium mb-1">Total Applications</div>
          <div className="text-2xl font-bold text-[#18243A] tabular-nums">
            {loading ? '...' : (reportData?.totalApplications || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-[#8995A8] mt-1 capitalize font-medium">{period} Window</div>
        </div>

        {/* Passed (Copy-Ready) */}
        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="text-xs text-[#65738B] font-semibold mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#16836B]" />
            <span>Passed (Copy-Ready)</span>
          </div>
          <div className="text-2xl font-bold text-[#18243A] tabular-nums">
            {loading ? '...' : (reportData?.passedCount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-[#16836B] mt-1 font-medium">
            {reportData && reportData.totalApplications > 0
              ? `${Math.round((reportData.passedCount / reportData.totalApplications) * 100)}% pass rate`
              : '0%'}
          </div>
        </div>

        {/* Manual Review */}
        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="text-xs text-[#65738B] font-semibold mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-[#A66B19]" />
            <span>Manual Review</span>
          </div>
          <div className="text-2xl font-bold text-[#18243A] tabular-nums">
            {loading ? '...' : (reportData?.manualReviewCount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-[#A66B19] mt-1 font-medium">Awaiting decision</div>
        </div>

        {/* Failed */}
        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="text-xs text-[#65738B] font-semibold mb-1 flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5 text-[#C44750]" />
            <span>Failed Requirements</span>
          </div>
          <div className="text-2xl font-bold text-[#18243A] tabular-nums">
            {loading ? '...' : (reportData?.failedCount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-[#C44750] mt-1 font-medium">Legally ineligible</div>
        </div>

        {/* Master Profiles Linked */}
        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="text-xs text-[#65738B] font-semibold mb-1 flex items-center gap-1">
            <Database className="w-3.5 h-3.5 text-[#4A63C7]" />
            <span>Master Profiles Linked</span>
          </div>
          <div className="text-2xl font-bold text-[#18243A] tabular-nums">
            {loading ? '...' : (reportData?.masterLinked || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-[#4A63C7] mt-1 font-medium">Unique candidate CRM</div>
        </div>

        {/* Potential Duplicates */}
        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="text-xs text-[#65738B] font-medium mb-1 flex items-center gap-1">
            <Copy className="w-3.5 h-3.5 text-[#8995A8]" />
            <span>Repeated Applications</span>
          </div>
          <div className="text-2xl font-bold text-[#18243A] tabular-nums">
            {loading ? '...' : (reportData?.duplicateCount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-[#8995A8] mt-1 font-medium">Same slot re-uploads</div>
        </div>
      </div>

      {/* Outcome Breakdown & Daily Progression Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Screening Outcomes & Master Linking Status */}
        <div className="card-premium p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Screening Outcomes &amp; Candidate Promotion</span>
              </h3>
              <p className="text-xs text-slate-500">Summary of decisions and database linking for {activeCompany}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-emerald-50/50 border border-emerald-200 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-emerald-900">Approved &amp; Copy-Ready Leads</div>
                <div className="text-[11px] text-emerald-700">Eligible to paste directly into recruiter Google Sheets</div>
              </div>
              <div className="text-xl font-bold text-emerald-800 tabular-nums">
                {reportData?.passedCount || 0}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-purple-50/50 border border-purple-200 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-purple-900">Master Candidate Database Links</div>
                <div className="text-[11px] text-purple-700">Applications linked to permanent candidate profiles</div>
              </div>
              <div className="text-xl font-bold text-purple-800 tabular-nums">
                {reportData?.masterLinked || 0}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-200 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-amber-900">Review Queue / Discrepancy</div>
                <div className="text-[11px] text-amber-700">Uncertain matches or questions needing human review</div>
              </div>
              <div className="text-xl font-bold text-amber-800 tabular-nums">
                {(reportData?.needsReview || 0) + (reportData?.manualReviewCount || 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Daily Progression Breakdown */}
        <div className="card-premium p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span>Daily Activity Progression</span>
              </h3>
              <p className="text-xs text-slate-500">Day-by-day volume and screening results</p>
            </div>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading activity timeline...</div>
          ) : !reportData?.dailyBreakdown || reportData.dailyBreakdown.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No activity logs recorded for this window.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200/80">
              <table className="w-full text-xs text-left table-premium">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                    <th className="py-2.5 px-3 text-right text-emerald-600">Passed</th>
                    <th className="py-2.5 px-3 text-right text-amber-600">Review</th>
                    <th className="py-2.5 px-3 text-right text-rose-600">Failed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reportData.dailyBreakdown.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono text-slate-800 font-medium">{row.date}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums">{row.total}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-600 font-semibold tabular-nums">{row.passed}</td>
                      <td className="py-2.5 px-3 text-right text-amber-600 font-medium tabular-nums">{row.manualReview || 0}</td>
                      <td className="py-2.5 px-3 text-right text-rose-600 font-medium tabular-nums">{row.failed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Job Slot Distribution Table */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-blue-600" />
              <span>Job Requisitions Performance ({activeCompany})</span>
            </h3>
            <p className="text-xs text-slate-500">Applicant volumes, screening outcomes, and pass rates by job slot</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-slate-100 text-slate-700">
            {reportData?.jobSlotDistribution?.length || 0} Job Slots
          </span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading job distribution...</div>
        ) : !reportData?.jobSlotDistribution || reportData.jobSlotDistribution.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No applicant records available for these job slots.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200/80">
            <table className="w-full text-xs text-left table-premium">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                  <th className="py-2.5 px-3">Slot ID</th>
                  <th className="py-2.5 px-3">Requisition Title</th>
                  <th className="py-2.5 px-3 text-right">Total Applied</th>
                  <th className="py-2.5 px-3 text-right text-emerald-600">Passed</th>
                  <th className="py-2.5 px-3 text-right text-amber-600">Review</th>
                  <th className="py-2.5 px-3 text-right text-rose-600">Failed</th>
                  <th className="py-2.5 px-3 text-right">Pass Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.jobSlotDistribution.map((slot: any) => {
                  const passRate = slot.total > 0 ? Math.round((slot.passed / slot.total) * 100) : 0;
                  return (
                    <tr key={slot.jobId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{slot.jobId}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">{slot.jobTitle}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums">{slot.total}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600 tabular-nums">{slot.passed}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-amber-600 tabular-nums">{slot.manualReview || 0}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-slate-400 tabular-nums">{slot.failed}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        <span className={`font-bold ${passRate >= 50 ? 'text-emerald-700' : 'text-slate-600'}`}>
                          {passRate}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
