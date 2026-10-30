import React, { useState, useEffect } from 'react';
import {
  FileBarChart2,
  Calendar,
  Building2,
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
  Check,
  Layers,
  PhoneCall,
  GitCompare,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
  Table,
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

  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [copiedGoogleSheets, setCopiedGoogleSheets] = useState<boolean>(false);
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);

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

  // Quick preset button handler
  const applyPreset = (presetKey: 'today' | 'yesterday' | 'week' | 'month' | 'last30') => {
    const today = new Date().toISOString().split('T')[0];
    if (presetKey === 'today') {
      setPeriod('daily');
      setSelectedDate(today);
    } else if (presetKey === 'yesterday') {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      setPeriod('daily');
      setSelectedDate(y.toISOString().split('T')[0]);
    } else if (presetKey === 'week') {
      setPeriod('weekly');
      setSelectedDate(today);
    } else if (presetKey === 'month') {
      setPeriod('monthly');
      setSelectedDate(today);
    } else if (presetKey === 'last30') {
      const d30 = new Date();
      d30.setDate(d30.getDate() - 30);
      setPeriod('custom');
      setCustomStartDate(d30.toISOString().split('T')[0]);
      setCustomEndDate(today);
    }
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

  // Export current report data to structured CSV (Section 11)
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
        `"Recruitment Operations & Analytics Periodic Report"`,
        `"Company Workspace","${activeCompany}"`,
        `"Reporting Period","${period.toUpperCase()}"`,
        `"Date Range / Reference Date","${dateRangeStr}"`,
        `"Reporting Basis","Application Date (Volume) / Current Status (Screening Outcomes)"`,
        `"Generated Timestamp","${now}"`,
        ``,
        `"--- 1. OVERALL RECRUITMENT METRICS ---"`,
        `"Metric","Count","Notes"`,
        `"Total Applications Screened",${reportData.totalApplications || 0},"Total applications within reporting window"`,
        `"Passed (Copy-Ready)",${reportData.passedCount || 0},"Approved for recruitment operations"`,
        `"Failed Requirements",${reportData.failedCount || 0},"Ineligible based on work auth or screening"`,
        `"Manual Review Queue",${reportData.manualReviewCount || 0},"Pending recruiter decision"`,
        `"Transferred to Master DB",${reportData.transferredCount || 0},"Applications successfully entered Master DB"`,
        `"Unique Candidates",${reportData.uniqueCandidatesCount || 0},"Distinct individual applicants"`,
        `"Repeat Applications",${reportData.repeatApplicationsCount || 0},"Applications with prior submission history"`,
        `"Duplicate Same-Job Re-uploads",${reportData.duplicateCount || 0},"Accidental re-uploads to exact same slot"`,
        `"Master Profiles Linked",${reportData.masterLinked || 0},"Unified master candidate identity linked"`,
        `"Contact Attempts Logged",${reportData.contactAttemptsCount || 0},"Recruiter phone calls/contacts made"`,
        `"Screening Pass Rate","${reportData.passRate || 0}%","Passed / Total percentage"`,
        ``,
        `"--- 2. TECHNOLOGY & JOB REQUISITION PERFORMANCE ---"`,
        `"Slot ID","Requisition Title","Total Applications","Unique Candidates","Repeat Apps","Passed","Transferred","Manual Review","Failed","Pass Rate"`,
      ];

      if (reportData.jobSlotDistribution && Array.isArray(reportData.jobSlotDistribution)) {
        for (const slot of reportData.jobSlotDistribution) {
          lines.push(
            `"${slot.jobId}","${(slot.jobTitle || '').replace(/"/g, '""')}",${slot.total},${slot.uniqueCandidates || 0},${slot.repeatApplicants || 0},${slot.passed},${slot.transferred || 0},${slot.manualReview || 0},${slot.failed},"${slot.passRate || 0}%"`
          );
        }
      }

      if (reportData.recruiterDistribution && Array.isArray(reportData.recruiterDistribution)) {
        lines.push(``);
        lines.push(`"--- 3. RECRUITER ACTIVITY SCORECARD ---"`);
        lines.push(`"Recruiter Name","Leads Assigned","Contacts Made","Positive Feedback","Negative Feedback","Pending Contacts"`);
        for (const r of reportData.recruiterDistribution) {
          lines.push(
            `"${r.recruiterName}",${r.leadsAssigned || 0},${r.contactsMade || 0},${r.positiveFeedbackCount || 0},${r.negativeFeedbackCount || 0},${r.pendingFeedbackCount || 0}`
          );
        }
      }

      if (reportData.dailyBreakdown && Array.isArray(reportData.dailyBreakdown)) {
        lines.push(``);
        lines.push(`"--- 4. DAILY ACTIVITY TIMELINE ---"`);
        lines.push(`"Date","Total Applications","Passed","Manual Review","Failed"`);
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

  // One-click Copy Google Sheets Table (TSV)
  const handleCopyGoogleSheets = () => {
    if (!reportData) return;
    const rows: string[][] = [
      ['Slot ID', 'Requisition Title', 'Total Applications', 'Unique Candidates', 'Repeat Applications', 'Passed', 'Transferred to Master DB', 'Manual Review', 'Failed', 'Pass Rate'],
    ];
    if (reportData.jobSlotDistribution && Array.isArray(reportData.jobSlotDistribution)) {
      for (const s of reportData.jobSlotDistribution) {
        rows.push([
          s.jobId || 'N/A',
          s.jobTitle || 'Unspecified Role',
          String(s.total || 0),
          String(s.uniqueCandidates || 0),
          String(s.repeatApplicants || 0),
          String(s.passed || 0),
          String(s.transferred || 0),
          String(s.manualReview || 0),
          String(s.failed || 0),
          `${s.passRate || 0}%`,
        ]);
      }
    }
    const tsv = rows.map(r => r.join('\t')).join('\n');
    navigator.clipboard.writeText(tsv).then(() => {
      setCopiedGoogleSheets(true);
      setTimeout(() => setCopiedGoogleSheets(false), 3000);
    });
  };

  const navigateToMasterWithTech = (tech: string) => {
    window.location.search = `?section=master-candidates&company=${activeCompany}&mTech=${encodeURIComponent(tech)}`;
  };

  const comparison = reportData?.comparison;

  return (
    <div className="space-y-6">
      {/* Top Header & Reporting Range Controls */}
      <div className="card-premium p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="badge-pass">
                Recruitment Analytics &amp; Reporting
              </span>
              <span className="text-slate-300">•</span>
              <span className="text-xs font-semibold text-slate-600">{activeCompany} Workspace</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight mt-1">
              Periodic Recruitment &amp; Performance Reports
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Multi-dimensional reporting across screening outcomes, candidate transfer rates, and recruiter activity.
            </p>
          </div>

          {/* Timeframe & Action Controls */}
          <div className="flex items-center flex-wrap gap-2.5">
            {/* Period Selector Tabs */}
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

            {/* Date Inputs */}
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

            {/* Google Sheets Copy */}
            <button
              type="button"
              onClick={handleCopyGoogleSheets}
              disabled={loading || !reportData}
              className={`btn-secondary !py-1.5 !px-3 !text-xs shadow-xs flex items-center gap-1.5 ${
                copiedGoogleSheets ? '!bg-emerald-50 !text-emerald-700 !border-emerald-300' : ''
              }`}
              title="Copy tab-delimited table ready to paste directly into Google Sheets"
            >
              {copiedGoogleSheets ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Table className="w-3.5 h-3.5 text-emerald-600" />}
              <span>{copiedGoogleSheets ? 'Copied to Sheets!' : 'Copy for Google Sheets'}</span>
            </button>

            {/* Export CSV Button */}
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

        {/* Quick Presets Bar & Comparison Mode Toggle */}
        <div className="mt-4 pt-3 border-t border-[#E0E6EF] flex flex-wrap items-center justify-between text-xs gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 mr-1">Quick Presets:</span>
            <button
              type="button"
              onClick={() => applyPreset('today')}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyPreset('yesterday')}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
            >
              Yesterday
            </button>
            <button
              type="button"
              onClick={() => applyPreset('week')}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
            >
              This Week (7D)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('month')}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => applyPreset('last30')}
              className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors cursor-pointer"
            >
              Last 30 Days
            </button>
          </div>

          {/* Comparison Mode Toggle (Section 11) */}
          <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              checked={compareMode}
              onChange={(e) => setCompareMode(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
              <GitCompare className="w-3.5 h-3.5 text-blue-600" />
              <span>Compare with Prior Period</span>
            </span>
          </label>
        </div>
      </div>

      {/* Main Metric Cards Grid (Section 11) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3.5">
        {/* Total Applications */}
        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="text-xs text-[#65738B] font-medium mb-1">Total Screened</div>
          <div className="text-2xl font-bold text-[#18243A] tabular-nums">
            {loading ? '...' : (reportData?.totalApplications || 0).toLocaleString()}
          </div>
          {compareMode && comparison && (
            <div className={`text-[11px] mt-1 font-semibold flex items-center gap-0.5 ${comparison.deltas.total >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {comparison.deltas.total >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              <span>{comparison.deltas.total >= 0 ? `+${comparison.deltas.total}` : comparison.deltas.total} vs prior</span>
            </div>
          )}
          {!compareMode && (
            <div className="text-[11px] text-[#8995A8] mt-1 capitalize font-medium">{period} window</div>
          )}
        </div>

        {/* Passed (Copy-Ready) */}
        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="text-xs text-[#65738B] font-semibold mb-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#16836B]" />
            <span>Passed (Ready)</span>
          </div>
          <div className="text-2xl font-bold text-[#18243A] tabular-nums">
            {loading ? '...' : (reportData?.passedCount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-[#16836B] mt-1 font-medium">
            {reportData && reportData.totalApplications > 0
              ? `${reportData.passRate}% pass rate`
              : '0%'}
          </div>
        </div>

        {/* Transferred to Master DB */}
        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all bg-gradient-to-b from-purple-50/20 to-white">
          <div className="text-xs text-purple-700 font-semibold mb-1 flex items-center gap-1">
            <Database className="w-3.5 h-3.5 text-purple-600" />
            <span>Transferred to DB</span>
          </div>
          <div className="text-2xl font-bold text-purple-900 tabular-nums">
            {loading ? '...' : (reportData?.transferredCount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-purple-600 mt-1 font-medium">Permanent profiles</div>
        </div>

        {/* Unique Candidates */}
        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="text-xs text-[#65738B] font-semibold mb-1 flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-blue-600" />
            <span>Unique Candidates</span>
          </div>
          <div className="text-2xl font-bold text-[#18243A] tabular-nums">
            {loading ? '...' : (reportData?.uniqueCandidatesCount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-blue-600 mt-1 font-medium">
            {reportData?.repeatApplicationsCount || 0} repeat apps
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
            <span>Failed Req.</span>
          </div>
          <div className="text-2xl font-bold text-[#18243A] tabular-nums">
            {loading ? '...' : (reportData?.failedCount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-[#C44750] mt-1 font-medium">Legally ineligible</div>
        </div>

        {/* Contact Attempts Made */}
        <div className="card-premium p-4 hover:border-[#CBD5E1] transition-all">
          <div className="text-xs text-[#65738B] font-semibold mb-1 flex items-center gap-1">
            <PhoneCall className="w-3.5 h-3.5 text-emerald-600" />
            <span>Contact Attempts</span>
          </div>
          <div className="text-2xl font-bold text-[#18243A] tabular-nums">
            {loading ? '...' : (reportData?.contactAttemptsCount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 font-medium">Logged recruiter calls</div>
        </div>
      </div>

      {/* Comparison Insights Banner (Section 11) */}
      {compareMode && comparison && (
        <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-xl text-xs space-y-1.5 animate-fade-in">
          <div className="font-bold text-blue-900 flex items-center gap-1.5">
            <GitCompare className="w-4 h-4 text-blue-600" />
            <span>Period-over-Period Performance Comparison ({activeCompany})</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-slate-700 mt-1">
            <div>
              <span className="text-slate-500">Volume Delta: </span>
              <strong className={comparison.deltas.total >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                {comparison.deltas.total >= 0 ? `+${comparison.deltas.total}` : comparison.deltas.total} applications
              </strong>
              <span className="text-slate-400 text-[10px] block">(Prior: {comparison.previousTotal})</span>
            </div>
            <div>
              <span className="text-slate-500">Passed Delta: </span>
              <strong className={comparison.deltas.passed >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                {comparison.deltas.passed >= 0 ? `+${comparison.deltas.passed}` : comparison.deltas.passed} leads
              </strong>
              <span className="text-slate-400 text-[10px] block">(Prior: {comparison.previousPassed})</span>
            </div>
            <div>
              <span className="text-slate-500">Pass Rate Delta: </span>
              <strong className={comparison.deltas.passRate >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                {comparison.deltas.passRate >= 0 ? `+${comparison.deltas.passRate}%` : `${comparison.deltas.passRate}%`}
              </strong>
              <span className="text-slate-400 text-[10px] block">(Prior: {comparison.previousPassRate}%)</span>
            </div>
            <div>
              <span className="text-slate-500">Transferred Delta: </span>
              <strong className={comparison.deltas.transferred >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                {comparison.deltas.transferred >= 0 ? `+${comparison.deltas.transferred}` : comparison.deltas.transferred}
              </strong>
              <span className="text-slate-400 text-[10px] block">(Prior: {comparison.previousTransferred})</span>
            </div>
          </div>
        </div>
      )}

      {/* Job Requisition / Technology Performance Table (Section 13) */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-blue-600" />
              <span>Technology &amp; Job Requisition Performance ({activeCompany})</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Breakdown of total applied, unique individuals, repeat submissions, and Master DB transfer rates by technology.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-slate-100 text-slate-700">
              {reportData?.jobSlotDistribution?.length || 0} Requisitions
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading technology breakdown...</div>
        ) : !reportData?.jobSlotDistribution || reportData.jobSlotDistribution.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">
            No applicant records available for these job roles.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200/80">
            <table className="w-full text-xs text-left table-premium">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                  <th className="py-2.5 px-3">Slot ID</th>
                  <th className="py-2.5 px-3">Technology / Requisition</th>
                  <th className="py-2.5 px-3 text-right">Total Applied</th>
                  <th className="py-2.5 px-3 text-right">Unique Cand.</th>
                  <th className="py-2.5 px-3 text-right text-blue-600">Repeat Apps</th>
                  <th className="py-2.5 px-3 text-right text-emerald-600">Passed</th>
                  <th className="py-2.5 px-3 text-right text-purple-600">Transferred</th>
                  <th className="py-2.5 px-3 text-right text-amber-600">Review</th>
                  <th className="py-2.5 px-3 text-right text-rose-500">Failed</th>
                  <th className="py-2.5 px-3 text-center">Pass Rate</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.jobSlotDistribution.map((slot: any) => {
                  const passRate = slot.passRate !== undefined ? slot.passRate : (slot.total > 0 ? Math.round((slot.passed / slot.total) * 100) : 0);
                  return (
                    <tr key={slot.jobId} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{slot.jobId}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">{slot.jobTitle}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums">{slot.total}</td>
                      <td className="py-2.5 px-3 text-right text-slate-700 tabular-nums">{slot.uniqueCandidates || slot.total}</td>
                      <td className="py-2.5 px-3 text-right text-blue-600 font-semibold tabular-nums">{slot.repeatApplicants || 0}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600 tabular-nums">{slot.passed}</td>
                      <td className="py-2.5 px-3 text-right font-bold text-purple-600 tabular-nums">{slot.transferred || 0}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-amber-600 tabular-nums">{slot.manualReview || 0}</td>
                      <td className="py-2.5 px-3 text-right font-medium text-slate-400 tabular-nums">{slot.failed}</td>
                      <td className="py-2.5 px-3 text-center tabular-nums">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full ${passRate >= 50 ? 'bg-emerald-500' : 'bg-slate-400'}`}
                              style={{ width: `${Math.min(100, passRate)}%` }}
                            />
                          </div>
                          <span className={`font-bold ${passRate >= 50 ? 'text-emerald-700' : 'text-slate-600'}`}>
                            {passRate}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => navigateToMasterWithTech(slot.jobTitle)}
                          className="px-2 py-0.5 rounded text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 border border-blue-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                          title={`View all candidates matching ${slot.jobTitle} in Master Database`}
                        >
                          <span>Filter DB</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recruiter Activity & Scorecard (Section 11) */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-blue-600" />
              <span>Recruiter Distribution &amp; Contact Activity ({activeCompany})</span>
            </h3>
            <p className="text-xs text-slate-500">Leads assigned, calls logged, and feedback outcomes for this timeframe</p>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading recruiter scorecard...</div>
        ) : !reportData?.recruiterDistribution || reportData.recruiterDistribution.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">No recruiter assignments recorded.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200/80">
            <table className="w-full text-xs text-left table-premium">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                  <th className="py-2.5 px-3">Recruiter Name</th>
                  <th className="py-2.5 px-3">Recruiter Email</th>
                  <th className="py-2.5 px-3 text-right">Leads Assigned</th>
                  <th className="py-2.5 px-3 text-right text-blue-600">Contacts Made</th>
                  <th className="py-2.5 px-3 text-right text-emerald-600">Positive Feedback</th>
                  <th className="py-2.5 px-3 text-right text-rose-600">Negative Feedback</th>
                  <th className="py-2.5 px-3 text-right text-amber-600">Pending Feedback</th>
                  <th className="py-2.5 px-3 text-right">Last Assigned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.recruiterDistribution.map((r: any) => (
                  <tr key={r.recruiterName} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-900 capitalize">{r.recruiterName}</td>
                    <td className="py-2.5 px-3 text-slate-500">{r.email || '—'}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums">{r.leadsAssigned || 0}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-blue-600 tabular-nums">{r.contactsMade || 0}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-emerald-600 tabular-nums">{r.positiveFeedbackCount || 0}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-rose-600 tabular-nums">{r.negativeFeedbackCount || 0}</td>
                    <td className="py-2.5 px-3 text-right font-medium text-amber-600 tabular-nums">{r.pendingFeedbackCount || 0}</td>
                    <td className="py-2.5 px-3 text-right text-slate-400 text-[11px] font-mono">
                      {r.lastDistributedAt ? r.lastDistributedAt.split('T')[0] : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cross-Technology Multi-Disciplinary Candidates (Section 13) */}
      {reportData?.crossTechnology && reportData.crossTechnology.totalMultiTechCount > 0 && (
        <div className="card-premium p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-purple-600" />
                <span>Cross-Technology Movement &amp; Multi-Disciplinary Applicants ({activeCompany})</span>
              </h3>
              <p className="text-xs text-slate-500">
                Candidates with applications across two or more distinct technology disciplines
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-purple-100 text-purple-800">
              {reportData.crossTechnology.totalMultiTechCount} Multi-Tech Applicants
            </span>
          </div>

          {/* Top Technology Pairings */}
          {reportData.crossTechnology.technologyPairs && reportData.crossTechnology.technologyPairs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 p-3 bg-purple-50/50 border border-purple-200/70 rounded-lg text-xs">
              <span className="font-bold text-purple-900">Top Cross-Disciplinary Pairings:</span>
              {reportData.crossTechnology.technologyPairs.slice(0, 5).map((p: any) => (
                <span
                  key={p.pair}
                  className="px-2 py-0.5 rounded bg-white border border-purple-300 font-semibold text-purple-800 text-[11px] shadow-2xs"
                >
                  {p.pair} ({p.count})
                </span>
              ))}
            </div>
          )}

          {/* Sample Multi-Tech Candidates Table */}
          <div className="overflow-x-auto rounded-lg border border-slate-200/80">
            <table className="w-full text-xs text-left table-premium">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                  <th className="py-2.5 px-3">Candidate Name</th>
                  <th className="py-2.5 px-3">Email &amp; Phone</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Distinct Technologies Applied</th>
                  <th className="py-2.5 px-3 text-right">Total Apps</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.crossTechnology.multiTechCandidates.slice(0, 10).map((cand: any) => (
                  <tr key={cand.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-slate-900">{cand.full_name}</td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <div>{cand.primary_email}</div>
                      {cand.primary_phone && <div className="text-[11px] text-slate-400">{cand.primary_phone}</div>}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{cand.location || '—'}</td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {cand.technologiesList?.map((t: string) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-medium"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums">
                      {cand.total_applications}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          window.location.search = `?section=master-candidates&company=${activeCompany}&candId=${cand.id}&candTab=applications`;
                        }}
                        className="px-2 py-0.5 rounded text-[11px] font-semibold text-purple-700 hover:text-purple-900 hover:bg-purple-50 border border-purple-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>View Apps</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Daily Progression Breakdown */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span>Daily Activity Timeline ({activeCompany})</span>
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
                  <th className="py-2.5 px-3 text-right">Total Applications</th>
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
  );
};
