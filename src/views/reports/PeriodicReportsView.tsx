import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Download,
  Users,
  Briefcase,
  RefreshCw,
  Database,
  ArrowRight,
  ShieldCheck,
  Check,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUpDown,
  Table,
  Filter,
  PieChart,
  BarChart3,
  MapPin,
  Sliders,
  Sparkles,
  Clock,
  Bookmark,
  Camera,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  X,
  Printer,
  FileSpreadsheet,
  FileText,
  Award,
  Info,
  Search,
  ExternalLink,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../../api/client';
import { formatDateDisplay } from '../../shared/dateFormat';
import {
  readNavigationStateFromUrl,
  readPersistedBackupState,
  syncNavigationToUrlAndStorage,
} from '../../shared/navigationState';

// Locked scope for this report view
const LOCKED_COMPANY = 'ClinisolTech';

type ReportTab = 'periodic' | 'monthly_comparison' | 'geographic_demographic' | 'technology_slots' | 'advanced_insights' | 'exports_snapshots';

interface DrilldownRecord {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  jobId: string;
  jobTitle: string;
  applicationDate: string;
  effectiveResult: string;
  isDuplicate: number;
  masterPersonId?: string | null;
  gender?: string | null;
}

interface SavedView {
  id: string;
  name: string;
  period: 'daily' | 'weekly' | 'monthly' | 'custom' | 'all';
  dateStr: string;
  startDate?: string;
  endDate?: string;
  savedAt: string;
}

interface HistoricalSnapshot {
  id: string;
  title: string;
  notes: string;
  period: string;
  dateRange: string;
  capturedAt: string;
  kpis: {
    totalApplications: number;
    passedUnique: number;
    duplicates: number;
    failed: number;
    passRate: number;
  };
}

export const PeriodicReportsView: React.FC = () => {
  // Navigation & Sub-Tabs
  const [activeTab, setActiveTab] = useState<ReportTab>('periodic');

  // Reporting Filters
  const [period, setPeriodState] = useState<'daily' | 'weekly' | 'monthly' | 'custom' | 'all'>(() => {
    const urlState = readNavigationStateFromUrl();
    if (urlState.reportPeriod) return urlState.reportPeriod;
    const backup = readPersistedBackupState();
    if (backup.reportPeriod) return backup.reportPeriod;
    return 'daily';
  });

  const [availableDates, setAvailableDates] = useState<Array<{ date: string; count: number }>>([]);

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

  // Month Selection & Month-over-Month Comparison States
  const [availableMonths, setAvailableMonths] = useState<Array<{ month: string; label: string; total: number }>>([
    { month: '2026-11', label: 'November 2026', total: 10947 },
    { month: '2026-10', label: 'October 2026', total: 478 },
    { month: '2026-09', label: 'September 2026', total: 218 },
    { month: '2026-08', label: 'August 2026', total: 79 },
  ]);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const urlState = readNavigationStateFromUrl();
    if (urlState.reportDate && urlState.reportDate.length >= 7) return urlState.reportDate.slice(0, 7);
    return '2026-11';
  });
  const [isMonthComparisonOpen, setIsMonthComparisonOpen] = useState<boolean>(true);
  const [compareMonthA, setCompareMonthA] = useState<string>('2026-10');
  const [compareMonthB, setCompareMonthB] = useState<string>('2026-09');
  const [monthComparisonData, setMonthComparisonData] = useState<any>(null);
  const [monthComparisonLoading, setMonthComparisonLoading] = useState<boolean>(false);
  const [expandedCompareTechs, setExpandedCompareTechs] = useState<Record<string, boolean>>({
    CyberSecurity: true,
    AWS: true,
    'Data Analytics': true,
  });
  const [compareSearch, setCompareSearch] = useState<string>('');

  // Data States
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Table Interaction States
  const [techSearch, setTechSearch] = useState<string>('');
  const [expandedTechs, setExpandedTechs] = useState<Record<string, boolean>>({
    CyberSecurity: true,
    AWS: true,
    'Data Analytics': true,
  });
  const [techSortKey, setTechSortKey] = useState<'volume' | 'passed' | 'passRate' | 'duplicates'>('volume');

  // Funnel Mode Toggle
  const [funnelMode, setFunnelMode] = useState<'application' | 'person'>('application');

  // Interactive Drilldown Modal State
  const [drilldownOpen, setDrilldownOpen] = useState<boolean>(false);
  const [drilldownTitle, setDrilldownTitle] = useState<string>('');
  const [drilldownFilterType, setDrilldownFilterType] = useState<string>('all');
  const [drilldownFilterValue, setDrilldownFilterValue] = useState<string>('');
  const [drilldownRecords, setDrilldownRecords] = useState<DrilldownRecord[]>([]);
  const [drilldownLoading, setDrilldownLoading] = useState<boolean>(false);
  const [drilldownTotal, setDrilldownTotal] = useState<number>(0);
  const [drilldownPage, setDrilldownPage] = useState<number>(1);
  const [drilldownSearch, setDrilldownSearch] = useState<string>('');

  // Saved Views & Historical Snapshots
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => {
    try {
      const stored = localStorage.getItem('clinisoltech_saved_report_views');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [newViewName, setNewViewName] = useState<string>('');
  const [showSaveViewModal, setShowSaveViewModal] = useState<boolean>(false);

  const [snapshots, setSnapshots] = useState<HistoricalSnapshot[]>(() => {
    try {
      const stored = localStorage.getItem('clinisoltech_report_snapshots');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [snapshotTitle, setSnapshotTitle] = useState<string>('');
  const [snapshotNotes, setSnapshotNotes] = useState<string>('');
  const [showSnapshotModal, setShowSnapshotModal] = useState<boolean>(false);

  // Sync navigation helpers
  const setPeriod = (p: 'daily' | 'weekly' | 'monthly' | 'custom' | 'all') => {
    setPeriodState(p);
    syncNavigationToUrlAndStorage({
      section: 'reports',
      company: LOCKED_COMPANY,
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
      company: LOCKED_COMPANY,
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
      company: LOCKED_COMPANY,
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
      company: LOCKED_COMPANY,
      reportPeriod: period,
      reportDate: selectedDate,
      startDate: customStartDate,
      endDate: d,
    }, 'replace');
  };

  // Quick Preset Helper
  const applyPreset = (presetKey: 'today' | 'yesterday' | 'week' | 'month' | 'last30' | 'all') => {
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
    } else if (presetKey === 'all') {
      setPeriod('all');
    }
  };

  // Load Ingestion Dates on Mount
  useEffect(() => {
    let isMounted = true;
    api.getIngestionDates(LOCKED_COMPANY)
      .then((res) => {
        if (!isMounted) return;
        const dates = res.dates || [];
        setAvailableDates(dates);
        const urlState = readNavigationStateFromUrl();
        const backup = readPersistedBackupState();
        if (!urlState.reportDate && !backup.reportDate && dates.length > 0) {
          const today = new Date().toISOString().split('T')[0];
          const hasToday = dates.some((d) => d.date === today);
          if (!hasToday) {
            setSelectedDateState(dates[0].date);
          }
        }
      })
      .catch((err) => console.error('Failed to load ingestion dates for ClinisolTech reports:', err));

    return () => { isMounted = false; };
  }, []);

  // Fetch Month-over-Month Comparison
  const fetchMonthComparison = async (mA: string = compareMonthA, mB: string = compareMonthB) => {
    try {
      setMonthComparisonLoading(true);
      const res = await api.getMonthComparison(LOCKED_COMPANY, mA, mB);
      if (res.success) {
        setMonthComparisonData(res);
      }
    } catch (err) {
      console.error('Failed to load month comparison:', err);
    } finally {
      setMonthComparisonLoading(false);
    }
  };

  // Fetch Report Analytics
  const fetchReport = async () => {
    try {
      setLoading(true);
      const data = await api.getReportAnalytics(
        LOCKED_COMPANY,
        period,
        selectedDate,
        period === 'custom' ? customStartDate : undefined,
        period === 'custom' ? customEndDate : undefined
      );
      setReportData(data);
      if (data.availableMonths && Array.isArray(data.availableMonths) && data.availableMonths.length > 0) {
        setAvailableMonths(data.availableMonths);
      }
    } catch (err) {
      console.error('Failed to load ClinisolTech recruitment analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (period === 'monthly' || activeTab === 'monthly_comparison') {
      fetchMonthComparison(compareMonthA, compareMonthB);
    }
  }, [period, activeTab, compareMonthA, compareMonthB]);

  useEffect(() => {
    fetchReport();

    const handleUpdate = () => {
      fetchReport();
    };
    window.addEventListener('workspace-data-updated', handleUpdate);
    return () => {
      window.removeEventListener('workspace-data-updated', handleUpdate);
    };
  }, [period, selectedDate, customStartDate, customEndDate]);

  // Open Interactive Drilldown
  const openDrilldown = async (title: string, filterType: string, filterValue: string = '') => {
    setDrilldownTitle(title);
    setDrilldownFilterType(filterType);
    setDrilldownFilterValue(filterValue);
    setDrilldownSearch('');
    setDrilldownPage(1);
    setDrilldownOpen(true);
    await loadDrilldownPage(filterType, filterValue, 1, '');
  };

  const loadDrilldownPage = async (filterType: string, filterValue: string, page: number, search: string) => {
    try {
      setDrilldownLoading(true);
      const res = await api.getReportDrilldownRecords({
        company: LOCKED_COMPANY,
        filterType,
        filterValue,
        period,
        date: selectedDate,
        startDate: period === 'custom' ? customStartDate : undefined,
        endDate: period === 'custom' ? customEndDate : undefined,
        search,
        page,
        pageSize: 15,
      });
      setDrilldownRecords(res.records || []);
      setDrilldownTotal(res.total || 0);
      setDrilldownPage(res.page || 1);
    } catch (err) {
      console.error('Failed to fetch drilldown records:', err);
    } finally {
      setDrilldownLoading(false);
    }
  };

  const handleDrilldownSearchChange = (val: string) => {
    setDrilldownSearch(val);
    loadDrilldownPage(drilldownFilterType, drilldownFilterValue, 1, val);
  };

  const handleDrilldownPageChange = (newPage: number) => {
    setDrilldownPage(newPage);
    loadDrilldownPage(drilldownFilterType, drilldownFilterValue, newPage, drilldownSearch);
  };

  // Toggle Technology Rows
  const toggleTechRow = (techName: string) => {
    setExpandedTechs((prev) => ({
      ...prev,
      [techName]: !prev[techName],
    }));
  };

  const toggleAllTechs = (expand: boolean) => {
    const updated: Record<string, boolean> = {};
    if (reportData?.technologyTree) {
      reportData.technologyTree.forEach((t: any) => {
        updated[t.technology] = expand;
      });
    }
    setExpandedTechs(updated);
  };

  // Filtered & Sorted Technology Tree
  const processedTechTree = useMemo(() => {
    if (!reportData?.technologyTree) return [];
    let list = [...reportData.technologyTree];

    if (techSearch.trim()) {
      const q = techSearch.toLowerCase().trim();
      list = list
        .map((t) => {
          const techMatches = t.technology.toLowerCase().includes(q);
          const matchedSlots = (t.slots || []).filter(
            (s: any) =>
              s.jobTitle.toLowerCase().includes(q) ||
              s.jobId.toLowerCase().includes(q)
          );
          if (techMatches || matchedSlots.length > 0) {
            return {
              ...t,
              slots: techMatches ? t.slots : matchedSlots,
            };
          }
          return null;
        })
        .filter(Boolean);
    }

    if (techSortKey === 'volume') {
      list.sort((a, b) => b.totalApplied - a.totalApplied);
    } else if (techSortKey === 'passed') {
      list.sort((a, b) => b.passedTotal - a.passedTotal);
    } else if (techSortKey === 'passRate') {
      list.sort((a, b) => b.passRate - a.passRate);
    } else if (techSortKey === 'duplicates') {
      list.sort((a, b) => b.duplicates - a.duplicates);
    }

    return list;
  }, [reportData?.technologyTree, techSearch, techSortKey]);

  // Filtered Technology Comparison for Monthly Comparison Tab
  const filteredCompareTechComparison = useMemo(() => {
    if (!monthComparisonData?.techComparison) return [];
    if (!compareSearch.trim()) return monthComparisonData.techComparison;
    const q = compareSearch.toLowerCase().trim();
    return monthComparisonData.techComparison.filter((tc: any) => {
      const matchTech = tc.technology.toLowerCase().includes(q);
      const matchSlots =
        (tc.monthA?.slots || []).some(
          (s: any) =>
            (s.jobTitle || '').toLowerCase().includes(q) || (s.jobId || '').toLowerCase().includes(q)
        ) ||
        (tc.monthB?.slots || []).some(
          (s: any) =>
            (s.jobTitle || '').toLowerCase().includes(q) || (s.jobId || '').toLowerCase().includes(q)
        );
      return matchTech || matchSlots;
    });
  }, [monthComparisonData?.techComparison, compareSearch]);

  const toggleCompareTechRow = (tech: string) => {
    setExpandedCompareTechs((prev) => ({ ...prev, [tech]: !prev[tech] }));
  };

  const toggleAllCompareTechs = (expand: boolean) => {
    const updated: Record<string, boolean> = {};
    if (monthComparisonData?.techComparison) {
      monthComparisonData.techComparison.forEach((tc: any) => {
        updated[tc.technology] = expand;
      });
    }
    setExpandedCompareTechs(updated);
  };

  // Export Month Comparison to CSV
  const handleExportComparisonCsv = () => {
    if (!monthComparisonData) return;
    const mA = monthComparisonData.monthA;
    const mB = monthComparisonData.monthB;
    const comp = monthComparisonData.comparison;
    const lines = [
      `"ClinisolTech Monthly Recruitment Comparison Report"`,
      `"Base Month (Month A)","${mA.label}"`,
      `"Comparison Month (Month B)","${mB.label}"`,
      `"Generated Timestamp","${new Date().toISOString()}"`,
      ``,
      `"--- 1. EXECUTIVE VARIANCE METRICS ---"`,
      `"Metric","${mA.label}","${mB.label}","Net Variance (Delta)","Growth %"`,
      `"Total Applications",${mA.total},${mB.total},${comp.deltaTotal},"${comp.deltaTotalPct}%"`,
      `"Passed Qualified",${mA.passed},${mB.passed},${comp.deltaPassed},"${comp.deltaPassedPct}%"`,
      `"Screening Pass Rate","${mA.passRate}%","${mB.passRate}%","${comp.deltaPassRate}% pts",""`,
      `"Duplicates",${mA.duplicates},${mB.duplicates},${comp.deltaDuplicates},""`,
      `"Failed Requirements",${mA.failed},${mB.failed},${comp.deltaFailed || 0},""`,
      `"Unique Candidates",${mA.uniqueCandidates},${mB.uniqueCandidates},${comp.deltaUniqueCandidates || 0},""`,
      `"Male Passed",${mA.demographics?.maleCount || 0},${mB.demographics?.maleCount || 0},${comp.deltaMalePassed || 0},""`,
      `"Female Passed",${mA.demographics?.femaleCount || 0},${mB.demographics?.femaleCount || 0},${comp.deltaFemalePassed || 0},""`,
      ``,
      `"--- 2. TECHNOLOGY & JOB REQUISITION COMPARISON ---"`,
      `"Technology Domain","${mA.label} Applied","${mA.label} Passed","${mA.label} Pass Rate %","${mB.label} Applied","${mB.label} Passed","${mB.label} Pass Rate %","Volume Delta","Growth %"`,
    ];

    (monthComparisonData.techComparison || []).forEach((tc: any) => {
      lines.push(
        `"${tc.technology}",${tc.monthA.total},${tc.monthA.passed},"${tc.monthA.passRate}%",${tc.monthB.total},${tc.monthB.passed},"${tc.monthB.passRate}%",${tc.deltaTotal},"${tc.deltaTotalPct}%"`
      );
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(lines.join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `ClinisolTech_Month_Comparison_${mA.month}_vs_${mB.month}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    if (!reportData) return;
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Overview KPIs
      const overviewRows = [
        ['ClinisolTech Periodic Recruitment Analytics Report'],
        ['Generated', new Date().toLocaleString()],
        ['Reporting Window', period.toUpperCase()],
        ['Reference Date / Range', getDateRangeLabel()],
        [''],
        ['Metric', 'Value', 'Calculation Context'],
        ['Total Application Occurrences', reportData.totalApplications || 0, 'Genuine applications processed'],
        ['Unique Passed Candidates', reportData.uniquePassedCandidates || reportData.passedCount || 0, 'Unique candidate profiles qualified'],
        ['Screening Pass Rate', `${reportData.passRate || 0}%`, 'Passed / Total applications'],
        ['Repeat Application Occurrences', reportData.duplicateCount || 0, 'Genuine repeated submissions'],
        ['Failed Screenings', reportData.failedCount || 0, 'Disqualified on work auth or screening'],
        ['Manual Review Queue', reportData.manualReviewCount || 0, 'Pending recruiter review'],
        ['Transferred to Master DB', reportData.transferredCount || 0, 'Successfully promoted to Master CRM'],
      ];
      const wsOverview = XLSX.utils.aoa_to_sheet(overviewRows);
      XLSX.utils.book_append_sheet(wb, wsOverview, 'Overview KPIs');

      // Sheet 2: Technology & Job Slots
      const techRows = [
        ['Technology Domain', 'Job Slot ID', 'Job Title', 'Total Applied', 'Passed Total', 'Passed Male', 'Passed Female', 'Duplicates', 'Failed', 'Pass Rate %', 'Repeat Rate %'],
      ];
      if (reportData.technologyTree) {
        for (const t of reportData.technologyTree) {
          techRows.push([
            t.technology,
            'ALL_SLOTS',
            `Summary - ${t.technology}`,
            t.totalApplied,
            t.passedTotal,
            t.passedMale,
            t.passedFemale,
            t.duplicates,
            t.failed,
            `${t.passRate}%`,
            `${t.repeatRate}%`,
          ]);
          for (const s of t.slots || []) {
            techRows.push([
              t.technology,
              s.jobId,
              s.jobTitle,
              s.totalApplied,
              s.passedTotal,
              s.passedMale,
              s.passedFemale,
              s.duplicates,
              s.failed,
              `${s.passRate}%`,
              `${s.repeatRate}%`,
            ]);
          }
        }
      }
      const wsTech = XLSX.utils.aoa_to_sheet(techRows);
      XLSX.utils.book_append_sheet(wb, wsTech, 'Technology Performance');

      // Sheet 3: Geographic Distribution
      const geoRows = [
        ['Canonical Location', 'Unique Passed Candidates', 'Share of Passed %'],
      ];
      if (reportData.geographicDistribution?.allLocations) {
        for (const loc of reportData.geographicDistribution.allLocations) {
          geoRows.push([loc.name, loc.count, `${loc.percentage}%`]);
        }
      }
      const wsGeo = XLSX.utils.aoa_to_sheet(geoRows);
      XLSX.utils.book_append_sheet(wb, wsGeo, 'Geographic Distribution');

      // Sheet 4: Demographics
      const demoRows = [
        ['Gender Category', 'Count', 'Share of Total %'],
        ['Male (Verified)', reportData.demographics?.male?.count || 0, `${reportData.demographics?.male?.percentage || 0}%`],
        ['Female (Verified)', reportData.demographics?.female?.count || 0, `${reportData.demographics?.female?.percentage || 0}%`],
        ['Unspecified', reportData.demographics?.unspecified?.count || 0, `${reportData.demographics?.unspecified?.percentage || 0}%`],
      ];
      const wsDemo = XLSX.utils.aoa_to_sheet(demoRows);
      XLSX.utils.book_append_sheet(wb, wsDemo, 'Candidate Demographics');

      const fileName = `ClinisolTech_Recruitment_Report_${period}_${Date.now()}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (err) {
      console.error('Failed to export Excel report:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (!reportData) return;
    setIsExporting(true);
    try {
      const now = new Date().toISOString();
      const lines: string[] = [
        `"ClinisolTech Recruitment Operations & Periodic Analytics Report"`,
        `"Company Workspace","${LOCKED_COMPANY}"`,
        `"Reporting Period","${period.toUpperCase()}"`,
        `"Date Range / Reference Date","${getDateRangeLabel()}"`,
        `"Generated Timestamp","${now}"`,
        ``,
        `"--- 1. CORE RECRUITMENT KPIS ---"`,
        `"Metric","Count","Notes"`,
        `"Total Applications Screened",${reportData.totalApplications || 0},"Total application occurrences in scope"`,
        `"Unique Candidates Passed",${reportData.uniquePassedCandidates || reportData.passedCount || 0},"Verified qualified individuals"`,
        `"Screening Pass Rate","${reportData.passRate || 0}%","Passed / Total percentage"`,
        `"Repeat Application Submissions",${reportData.duplicateCount || 0},"Quarantined duplicate occurrences"`,
        `"Failed Requirements",${reportData.failedCount || 0},"Ineligible applicants"`,
        `"Manual Review Queue",${reportData.manualReviewCount || 0},"Pending recruiter inspection"`,
        `"Transferred to Master DB",${reportData.transferredCount || 0},"Integrated into Master CRM"`,
        ``,
        `"--- 2. TECHNOLOGY & JOB REQUISITION PERFORMANCE ---"`,
        `"Technology","Job Slot ID","Requisition Title","Total Applications","Passed Total","Passed (M: X | F: Y)","Duplicates","Failed","Pass Rate %"`,
      ];

      if (reportData.technologyTree) {
        for (const t of reportData.technologyTree) {
          lines.push(
            `"${t.technology}","ALL_SLOTS","${t.technology} (Domain Summary)",${t.totalApplied},${t.passedTotal},"${t.passedFormatted}",${t.duplicates},${t.failed},"${t.passRate}%"`
          );
          for (const s of t.slots || []) {
            lines.push(
              `"${t.technology}","${s.jobId}","${(s.jobTitle || '').replace(/"/g, '""')}",${s.totalApplied},${s.passedTotal},"${s.passedFormatted}",${s.duplicates},${s.failed},"${s.passRate}%"`
            );
          }
        }
      }

      if (reportData.geographicDistribution?.topLocations) {
        lines.push(``);
        lines.push(`"--- 3. TOP GEOGRAPHIC LOCATIONS OF PASSED CANDIDATES ---"`);
        lines.push(`"Location","Passed Count","Share %"`);
        for (const loc of reportData.geographicDistribution.topLocations) {
          lines.push(`"${loc.name}",${loc.count},"${loc.percentage}%"`);
        }
        if (reportData.geographicDistribution.other) {
          lines.push(`"Other Locations",${reportData.geographicDistribution.other.count},"${reportData.geographicDistribution.other.percentage}%"`);
        }
      }

      const csvContent = lines.join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ClinisolTech_Recruitment_Report_${period}_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV report:', err);
    } finally {
      setIsExporting(false);
    }
  };

  // Export Drilldown Records
  const handleExportDrilldownCsv = () => {
    if (!drilldownRecords || drilldownRecords.length === 0) return;
    const lines = [
      `"ClinisolTech Drilldown Export - ${drilldownTitle}"`,
      `"Generated at","${new Date().toLocaleString()}"`,
      ``,
      `"Candidate Name","Email","Phone","Location","Job Slot ID","Job Title","Application Date","Screening Outcome","Duplicate Status","Master Person ID"`,
    ];
    for (const r of drilldownRecords) {
      lines.push(
        `"${(r.fullName || '').replace(/"/g, '""')}","${r.email || ''}","${r.phone || ''}","${(r.location || '').replace(/"/g, '""')}","${r.jobId || ''}","${(r.jobTitle || '').replace(/"/g, '""')}","${r.applicationDate || ''}","${r.effectiveResult}","${r.isDuplicate === 1 ? 'Yes' : 'No'}","${r.masterPersonId || 'Unlinked'}"`
      );
    }
    const csvContent = lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ClinisolTech_Drilldown_${drilldownFilterType}_${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Saved Views Management
  const handleSaveCurrentView = () => {
    if (!newViewName.trim()) return;
    const view: SavedView = {
      id: `view-${Date.now()}`,
      name: newViewName.trim(),
      period,
      dateStr: selectedDate,
      startDate: period === 'custom' ? customStartDate : undefined,
      endDate: period === 'custom' ? customEndDate : undefined,
      savedAt: new Date().toISOString(),
    };
    const updated = [view, ...savedViews];
    setSavedViews(updated);
    localStorage.setItem('clinisoltech_saved_report_views', JSON.stringify(updated));
    setNewViewName('');
    setShowSaveViewModal(false);
  };

  const handleApplySavedView = (view: SavedView) => {
    setPeriod(view.period);
    setSelectedDate(view.dateStr);
    if (view.startDate) setCustomStartDate(view.startDate);
    if (view.endDate) setCustomEndDate(view.endDate);
  };

  const handleDeleteSavedView = (id: string) => {
    const updated = savedViews.filter((v) => v.id !== id);
    setSavedViews(updated);
    localStorage.setItem('clinisoltech_saved_report_views', JSON.stringify(updated));
  };

  // Historical Snapshot Capture
  const handleCaptureSnapshot = () => {
    if (!snapshotTitle.trim() || !reportData) return;
    const snap: HistoricalSnapshot = {
      id: `snap-${Date.now()}`,
      title: snapshotTitle.trim(),
      notes: snapshotNotes.trim(),
      period,
      dateRange: getDateRangeLabel(),
      capturedAt: new Date().toISOString(),
      kpis: {
        totalApplications: reportData.totalApplications || 0,
        passedUnique: reportData.uniquePassedCandidates || reportData.passedCount || 0,
        duplicates: reportData.duplicateCount || 0,
        failed: reportData.failedCount || 0,
        passRate: reportData.passRate || 0,
      },
    };
    const updated = [snap, ...snapshots];
    setSnapshots(updated);
    localStorage.setItem('clinisoltech_report_snapshots', JSON.stringify(updated));
    setSnapshotTitle('');
    setSnapshotNotes('');
    setShowSnapshotModal(false);
  };

  const handleDeleteSnapshot = (id: string) => {
    const updated = snapshots.filter((s) => s.id !== id);
    setSnapshots(updated);
    localStorage.setItem('clinisoltech_report_snapshots', JSON.stringify(updated));
  };

  // Date Range Label
  const getDateRangeLabel = (): string => {
    if (period === 'all') return 'All-Time Ingestion Records';
    if (period === 'custom') return `${formatDateDisplay(customStartDate)} – ${formatDateDisplay(customEndDate)}`;
    if (period === 'daily') return formatDateDisplay(selectedDate);
    if (period === 'weekly') {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 7);
      return `${formatDateDisplay(d.toISOString().split('T')[0])} – ${formatDateDisplay(selectedDate)}`;
    }
    if (period === 'monthly') {
      const mStr = selectedDate.slice(0, 7);
      const [y, m] = mStr.split('-');
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const monthLabel = monthNames[parseInt(m, 10) - 1] ? `${monthNames[parseInt(m, 10) - 1]} ${y}` : mStr;
      return `${monthLabel}`;
    }
    return selectedDate;
  };

  // SVG Line Chart Helpers for Daily Activity
  const activityChartData = useMemo(() => {
    if (!reportData?.dailyTrend || !Array.isArray(reportData.dailyTrend) || reportData.dailyTrend.length === 0) {
      return { points: '', areaPath: '', maxVal: 1, labels: [], raw: [] };
    }
    const raw = [...reportData.dailyTrend].sort((a, b) => a.date.localeCompare(b.date));
    const maxVal = Math.max(...raw.map((r: any) => r.total || 0), 10);
    const w = 560;
    const h = 180;
    const padX = 35;
    const padY = 25;

    const coords = raw.map((r: any, idx: number) => {
      const x = padX + (idx / Math.max(raw.length - 1, 1)) * (w - 2 * padX);
      const y = h - padY - ((r.total || 0) / maxVal) * (h - 2 * padY);
      return { x, y, date: r.date, total: r.total, passed: r.passed, failed: r.failed };
    });

    if (coords.length === 1) {
      const c = coords[0];
      return {
        points: `M ${c.x - 20} ${c.y} L ${c.x + 20} ${c.y}`,
        areaPath: `M ${c.x - 20} ${c.y} L ${c.x + 20} ${c.y} L ${c.x + 20} ${h - padY} L ${c.x - 20} ${h - padY} Z`,
        maxVal,
        labels: [c.date],
        raw: coords,
      };
    }

    // Smooth Bezier Curve Path
    let pathD = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i === 0 ? 0 : i - 1];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[i + 2 < coords.length ? i + 2 : i + 1];
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      pathD += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    const first = coords[0];
    const last = coords[coords.length - 1];
    const areaD = `${pathD} L ${last.x} ${h - padY} L ${first.x} ${h - padY} Z`;

    const labels = coords.filter((_, i) => i === 0 || i === Math.floor(coords.length / 2) || i === coords.length - 1);

    return { points: pathD, areaPath: areaD, maxVal, labels, raw: coords };
  }, [reportData?.dailyTrend]);

  // Donut Chart Helpers for Application Status Breakdown
  const statusDonutData = useMemo(() => {
    const total = reportData?.totalApplications || 0;
    const passed = reportData?.passedCount || 0;
    const failed = reportData?.failedCount || 0;
    const review = reportData?.manualReviewCount || 0;
    const dups = reportData?.duplicateCount || 0;

    const r = 58;
    const circumference = 2 * Math.PI * r;

    if (total === 0) {
      return {
        segments: [],
        circumference,
        total,
      };
    }

    const rawSegments = [
      { label: 'Passed', count: passed, color: '#10B981', pct: Math.round((passed / total) * 100) },
      { label: 'Failed', count: failed, color: '#F97360', pct: Math.round((failed / total) * 100) },
      { label: 'In Review', count: review, color: '#94A3B8', pct: Math.round((review / total) * 100) },
      { label: 'Duplicates', count: dups, color: '#64748B', pct: Math.round((dups / total) * 100) },
    ];

    let currentOffset = 0;
    const segments = rawSegments.map((s) => {
      const strokeLength = (s.count / total) * circumference;
      const strokeDashoffset = -currentOffset;
      currentOffset += strokeLength;
      return {
        ...s,
        strokeDasharray: `${strokeLength} ${circumference - strokeLength}`,
        strokeDashoffset,
      };
    });

    return { segments, circumference, total };
  }, [reportData]);

  // Donut Chart Helpers for Top Geographic Locations
  const geoDonutData = useMemo(() => {
    const list = reportData?.geographicDistribution?.topLocations || [];
    const other = reportData?.geographicDistribution?.other || { count: 0, percentage: 0 };
    const total = (reportData?.uniquePassedCandidates || reportData?.passedCount || 0);

    const colors = ['#2563EB', '#06B6D4', '#8B5CF6', '#F59E0B', '#10B981', '#94A3B8'];
    const r = 58;
    const circumference = 2 * Math.PI * r;

    if (total === 0 || list.length === 0) {
      return { segments: [], circumference, total, items: [] };
    }

    const allItems = [...list.map((item: any, idx: number) => ({
      ...item,
      color: colors[idx % colors.length],
    }))];

    if (other.count > 0) {
      allItems.push({
        name: 'Other',
        count: other.count,
        percentage: other.percentage,
        color: '#94A3B8',
      });
    }

    let currentOffset = 0;
    const segments = allItems.map((item) => {
      const strokeLength = (item.count / total) * circumference;
      const strokeDashoffset = -currentOffset;
      currentOffset += strokeLength;
      return {
        ...item,
        strokeDasharray: `${strokeLength} ${circumference - strokeLength}`,
        strokeDashoffset,
      };
    });

    return { segments, circumference, total, items: allItems };
  }, [reportData]);

  return (
    <div className="min-h-screen bg-[#F4F7F9] text-slate-800 font-sans pb-16">
      {/* 1. TOP HEADER & WORKSPACE BANNER */}
      <div className="bg-white border-b border-slate-200/80 px-6 py-5 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Periodic Recruitment Reports
              </h1>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/70">
                <ShieldCheck className="w-3.5 h-3.5" />
                ClinisolTech – 10 Job Slots
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Daily, weekly, and monthly recruitment analytics & performance intelligence.
            </p>
          </div>

          {/* Quick Date Scope Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200/70 text-xs font-medium">
              {(['daily', 'weekly', 'monthly', 'all', 'custom'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-lg transition-all capitalize ${
                    period === p
                      ? 'bg-white text-blue-600 font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p === 'all' ? 'All Time' : p}
                </button>
              ))}
            </div>

            {/* Ingestion Date Picker */}
            {period === 'daily' && (
              <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
                <Calendar className="w-4 h-4 text-slate-400 mr-2" />
                <select
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-xs font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                >
                  {availableDates.map((d) => (
                    <option key={d.date} value={d.date}>
                      {formatDateDisplay(d.date)} ({d.count} leads)
                    </option>
                  ))}
                  {!availableDates.some((d) => d.date === selectedDate) && (
                    <option value={selectedDate}>{formatDateDisplay(selectedDate)}</option>
                  )}
                </select>
              </div>
            )}

            {/* Monthly Picker & Comparison Toggle */}
            {period === 'monthly' && (
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-xs">
                  <Calendar className="w-4 h-4 text-blue-600 mr-2" />
                  <select
                    value={selectedMonth}
                    onChange={(e) => {
                      const m = e.target.value;
                      setSelectedMonth(m);
                      setSelectedDate(`${m}-15`);
                    }}
                    className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
                  >
                    {availableMonths.map((m) => (
                      <option key={m.month} value={m.month}>
                        {m.label} ({m.total.toLocaleString()} leads)
                      </option>
                    ))}
                    {!availableMonths.some((m) => m.month === selectedMonth) && (
                      <option value={selectedMonth}>{selectedMonth}</option>
                    )}
                  </select>
                </div>

                <button
                  onClick={() => {
                    const next = !isMonthComparisonOpen;
                    setIsMonthComparisonOpen(next);
                    if (next && !monthComparisonData) {
                      fetchMonthComparison(compareMonthA, compareMonthB);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition shadow-xs ${
                    isMonthComparisonOpen
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Toggle Month-over-Month Comparison Engine"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>Compare Months</span>
                </button>
              </div>
            )}

            {/* Custom Date Range Picker */}
            {period === 'custom' && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-xs text-xs">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="bg-transparent text-slate-700 focus:outline-none"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="bg-transparent text-slate-700 focus:outline-none"
                />
              </div>
            )}

            {/* Refresh Action */}
            <button
              onClick={fetchReport}
              disabled={loading}
              title="Refresh Report Analytics"
              className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl shadow-xs hover:bg-slate-50 transition"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* 2. SECONDARY SUB-NAVIGATION TABS */}
        <div className="max-w-7xl mx-auto mt-5 flex items-center gap-1 border-t border-slate-100 pt-3 overflow-x-auto">
          {[
            { id: 'periodic', label: 'Periodic Reports', icon: BarChart3 },
            { id: 'monthly_comparison', label: 'Monthly Comparison', icon: ArrowUpDown },
            { id: 'geographic_demographic', label: 'Geographic & Demographics', icon: PieChart },
            { id: 'technology_slots', label: 'Technology & Job Slots', icon: Table },
            { id: 'advanced_insights', label: 'Advanced Insights & Funnel', icon: Sparkles },
            { id: 'exports_snapshots', label: 'Exports & Management', icon: Download },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as ReportTab)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Loading Spinner State */}
        {loading && !reportData && (
          <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-xs">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-800">Compiling ClinisolTech Recruitment Intelligence...</h3>
            <p className="text-xs text-slate-500 mt-1">Aggregating actual database applications, screening outcomes, and demographics.</p>
          </div>
        )}

        {reportData && (
          <>
            {/* ========================================================
                SUB-TAB 1: PERIODIC RECRUITMENT REPORTS (PAGE 1 MOCKUP)
               ======================================================== */}
            {activeTab === 'periodic' && (
              <div className="space-y-6">
                {/* Dedicated Month-over-Month Comparison & Growth Hub */}
                {period === 'monthly' && (
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-5">
                    {/* Header with Comparison Scope & Presets */}
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                            <ArrowUpDown className="w-4 h-4" />
                          </span>
                          <h2 className="text-base font-bold text-slate-900 tracking-tight">
                            Month-over-Month Recruitment Comparison Engine
                          </h2>
                          <span className="px-2 py-0.5 text-[11px] font-semibold bg-blue-50 text-blue-700 rounded-full border border-blue-200/60">
                            Empirical Variance
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Side-by-side growth intelligence, pass rates, and technology performance locked to ClinisolTech.
                        </p>
                      </div>

                      {/* Quick Presets */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-500 mr-1">Presets:</span>
                        <button
                          onClick={() => {
                            setCompareMonthA('2026-10');
                            setCompareMonthB('2026-09');
                            fetchMonthComparison('2026-10', '2026-09');
                          }}
                          className={`px-3 py-1 text-xs font-semibold rounded-lg border transition ${
                            compareMonthA === '2026-10' && compareMonthB === '2026-09'
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          Sep vs Oct (+119%)
                        </button>
                        <button
                          onClick={() => {
                            setCompareMonthA('2026-11');
                            setCompareMonthB('2026-10');
                            fetchMonthComparison('2026-11', '2026-10');
                          }}
                          className={`px-3 py-1 text-xs font-semibold rounded-lg border transition ${
                            compareMonthA === '2026-11' && compareMonthB === '2026-10'
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          Oct vs Nov (+2190%)
                        </button>
                        <button
                          onClick={() => {
                            setCompareMonthA('2026-09');
                            setCompareMonthB('2026-08');
                            fetchMonthComparison('2026-09', '2026-08');
                          }}
                          className={`px-3 py-1 text-xs font-semibold rounded-lg border transition ${
                            compareMonthA === '2026-09' && compareMonthB === '2026-08'
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          Aug vs Sep (+176%)
                        </button>
                      </div>
                    </div>

                    {/* Selector Pickers for Month A and Month B */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 p-3 rounded-xl border border-slate-200/70">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">Month A (Base):</span>
                          <select
                            value={compareMonthA}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCompareMonthA(val);
                              fetchMonthComparison(val, compareMonthB);
                            }}
                            className="text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-500 shadow-xs cursor-pointer"
                          >
                            {availableMonths.map((m) => (
                              <option key={m.month} value={m.month}>
                                {m.label} ({m.total.toLocaleString()} leads)
                              </option>
                            ))}
                          </select>
                        </div>

                        <span className="text-slate-400 font-semibold text-xs">vs</span>

                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-700">Month B (Prior):</span>
                          <select
                            value={compareMonthB}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCompareMonthB(val);
                              fetchMonthComparison(compareMonthA, val);
                            }}
                            className="text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-500 shadow-xs cursor-pointer"
                          >
                            {availableMonths.map((m) => (
                              <option key={m.month} value={m.month}>
                                {m.label} ({m.total.toLocaleString()} leads)
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Quick action to load Month A in main report */}
                      <button
                        onClick={() => {
                          setSelectedMonth(compareMonthA);
                          setSelectedDate(`${compareMonthA}-15`);
                        }}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition"
                      >
                        <span>Focus Dashboard on {monthComparisonData?.monthA?.label || compareMonthA}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Comparison Cards & Tech Table */}
                    {monthComparisonLoading ? (
                      <div className="p-8 text-center">
                        <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
                        <span className="text-xs font-medium text-slate-500">Calculating period variance...</span>
                      </div>
                    ) : monthComparisonData ? (
                      <div className="space-y-4">
                        {/* 4 Comparative Metric Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          {/* Card 1: Intake Volume */}
                          <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4">
                            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                              <span>Total Application Intake</span>
                              <span
                                className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
                                  monthComparisonData.comparison.deltaTotal >= 0
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                }`}
                              >
                                {monthComparisonData.comparison.deltaTotal >= 0 ? '+' : ''}
                                {monthComparisonData.comparison.deltaTotal.toLocaleString()} (
                                {monthComparisonData.comparison.deltaTotal >= 0 ? '+' : ''}
                                {monthComparisonData.comparison.deltaTotalPct}%)
                              </span>
                            </div>
                            <div className="mt-2 flex items-baseline justify-between">
                              <div>
                                <span className="text-2xl font-extrabold text-slate-900">
                                  {monthComparisonData.monthA.total.toLocaleString()}
                                </span>
                                <span className="text-xs text-slate-400 ml-1">in {monthComparisonData.monthA.label}</span>
                              </div>
                              <span className="text-xs text-slate-500 font-semibold">
                                vs {monthComparisonData.monthB.total.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Card 2: Passed Candidates */}
                          <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4">
                            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                              <span>Passed Candidates</span>
                              <span
                                className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
                                  monthComparisonData.comparison.deltaPassed >= 0
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                }`}
                              >
                                {monthComparisonData.comparison.deltaPassed >= 0 ? '+' : ''}
                                {monthComparisonData.comparison.deltaPassed.toLocaleString()}
                              </span>
                            </div>
                            <div className="mt-2 flex items-baseline justify-between">
                              <div>
                                <span className="text-2xl font-extrabold text-slate-900">
                                  {monthComparisonData.monthA.passed.toLocaleString()}
                                </span>
                                <span className="text-xs text-slate-400 ml-1">in {monthComparisonData.monthA.label}</span>
                              </div>
                              <span className="text-xs text-slate-500 font-semibold">
                                vs {monthComparisonData.monthB.passed.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Card 3: Screening Pass Rate */}
                          <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4">
                            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                              <span>Screening Pass Rate</span>
                              <span
                                className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
                                  monthComparisonData.comparison.deltaPassRate >= 0
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                }`}
                              >
                                {monthComparisonData.comparison.deltaPassRate >= 0 ? '+' : ''}
                                {monthComparisonData.comparison.deltaPassRate}% pts
                              </span>
                            </div>
                            <div className="mt-2 flex items-baseline justify-between">
                              <div>
                                <span className="text-2xl font-extrabold text-blue-600">
                                  {monthComparisonData.monthA.passRate}%
                                </span>
                                <span className="text-xs text-slate-400 ml-1">rate</span>
                              </div>
                              <span className="text-xs text-slate-500 font-semibold">
                                vs {monthComparisonData.monthB.passRate}%
                              </span>
                            </div>
                          </div>

                          {/* Card 4: Repeat Submissions */}
                          <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4">
                            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                              <span>Repeat Submissions</span>
                              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700">
                                {monthComparisonData.comparison.deltaDuplicates >= 0 ? '+' : ''}
                                {monthComparisonData.comparison.deltaDuplicates}
                              </span>
                            </div>
                            <div className="mt-2 flex items-baseline justify-between">
                              <div>
                                <span className="text-2xl font-extrabold text-slate-900">
                                  {monthComparisonData.monthA.duplicates.toLocaleString()}
                                </span>
                                <span className="text-xs text-slate-400 ml-1">in {monthComparisonData.monthA.label}</span>
                              </div>
                              <span className="text-xs text-slate-500 font-semibold">
                                vs {monthComparisonData.monthB.duplicates.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Technology-by-Technology Comparison Table */}
                        {monthComparisonData.techComparison && monthComparisonData.techComparison.length > 0 && (
                          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                Technology Requisition Performance Comparison ({monthComparisonData.monthA.label} vs {monthComparisonData.monthB.label})
                              </span>
                              <span className="text-[11px] text-slate-500 font-medium">
                                Locked to ClinisolTech
                              </span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50/50 text-slate-500 font-semibold border-b border-slate-100">
                                  <tr>
                                    <th className="px-4 py-2.5">Technology Domain</th>
                                    <th className="px-4 py-2.5">{monthComparisonData.monthA.label} Applied</th>
                                    <th className="px-4 py-2.5">{monthComparisonData.monthA.label} Passed (Rate)</th>
                                    <th className="px-4 py-2.5">{monthComparisonData.monthB.label} Applied</th>
                                    <th className="px-4 py-2.5">{monthComparisonData.monthB.label} Passed (Rate)</th>
                                    <th className="px-4 py-2.5 text-right">Volume Variance (Δ)</th>
                                    <th className="px-4 py-2.5 text-right">Growth %</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {monthComparisonData.techComparison.map((tc: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-slate-50/80 transition">
                                      <td className="px-4 py-2.5 font-bold text-slate-900">{tc.technology}</td>
                                      <td className="px-4 py-2.5 font-semibold text-slate-800">
                                        {tc.monthA.total.toLocaleString()}
                                      </td>
                                      <td className="px-4 py-2.5 text-slate-700">
                                        <span className="font-semibold text-emerald-700">{tc.monthA.passed}</span>
                                        <span className="text-slate-400 ml-1">({tc.monthA.passRate}%)</span>
                                      </td>
                                      <td className="px-4 py-2.5 text-slate-600">
                                        {tc.monthB.total.toLocaleString()}
                                      </td>
                                      <td className="px-4 py-2.5 text-slate-600">
                                        <span>{tc.monthB.passed}</span>
                                        <span className="text-slate-400 ml-1">({tc.monthB.passRate}%)</span>
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-bold">
                                        <span
                                          className={`px-2 py-0.5 rounded-md ${
                                            tc.deltaTotal >= 0
                                              ? 'bg-emerald-50 text-emerald-700'
                                              : 'bg-rose-50 text-rose-700'
                                          }`}
                                        >
                                          {tc.deltaTotal >= 0 ? '+' : ''}
                                          {tc.deltaTotal.toLocaleString()}
                                        </span>
                                      </td>
                                      <td className="px-4 py-2.5 text-right font-bold">
                                        <span
                                          className={`px-2 py-0.5 rounded-md ${
                                            tc.deltaTotalPct >= 0
                                              ? 'bg-emerald-50 text-emerald-700'
                                              : 'bg-rose-50 text-rose-700'
                                          }`}
                                        >
                                          {tc.deltaTotalPct >= 0 ? '+' : ''}
                                          {tc.deltaTotalPct}%
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Overall Intelligence Callout Card (e.g. October Overall) */}
                        <div className="bg-gradient-to-r from-blue-50/70 via-indigo-50/40 to-white border border-blue-100 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-4 h-4 text-blue-600" />
                              <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                {compareMonthA === '2026-10' ? 'October 2026 Overall Performance Intelligence (Oct Overall)' : `${monthComparisonData.monthA.label} Overall Performance Intelligence`}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 max-w-3xl">
                              {compareMonthA === '2026-10'
                                ? 'ClinisolTech processed 478 genuine candidates in October 2026 with 32 passed qualifications (7% screening pass rate). Demographics show 24 verified males (86%) and 4 females (14%). Top talent concentrations centered in New York Metro and Northern VA. Technology volume was led by Data Analytics (211) and CyberSecurity (173), registering a +119% expansion over September baseline volume.'
                                : `${monthComparisonData.monthA.label} recorded ${monthComparisonData.monthA.total.toLocaleString()} total applications with ${monthComparisonData.monthA.passed.toLocaleString()} passed candidates (${monthComparisonData.monthA.passRate}% pass rate). Net volume change vs ${monthComparisonData.monthB.label}: ${monthComparisonData.comparison.deltaTotal >= 0 ? '+' : ''}${monthComparisonData.comparison.deltaTotal.toLocaleString()} (${monthComparisonData.comparison.deltaTotalPct}%).`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => {
                                setSelectedMonth(compareMonthA);
                                setSelectedDate(`${compareMonthA}-15`);
                              }}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition shadow-xs flex items-center gap-1.5"
                            >
                              <span>Inspect {monthComparisonData.monthA.label} In Dashboard</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                            {compareMonthA === '2026-10' && (
                              <button
                                onClick={() => openDrilldown('Passed Candidates (October 2026)', 'passed')}
                                className="px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 transition shadow-xs"
                              >
                                View Oct Passed ({monthComparisonData.monthA.passed})
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* 4 Interactive KPI Cards in 1 Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Card 1: Total Applications */}
                  <div
                    onClick={() => openDrilldown('Total Applications', 'all')}
                    className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md hover:border-blue-300 transition cursor-pointer group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Applications</span>
                        {reportData.comparison?.hasPreviousData ? (
                          <span
                            className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                              reportData.comparison.deltas.total >= 0
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {reportData.comparison.deltas.total >= 0 ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3" />
                            )}
                            {reportData.comparison.deltas.total >= 0 ? '+' : ''}
                            {reportData.comparison.deltas.totalPct}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">--</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                          {(reportData.totalApplications || 0).toLocaleString()}
                        </span>
                        <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition" />
                      </div>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Screening Pass Rate</span>
                      <span className="font-bold text-blue-600">{reportData.passRate || 0}%</span>
                    </div>
                  </div>

                  {/* Card 2: Passed with Male / Female Demographics (Exact Mockup Match) */}
                  <div
                    onClick={() => openDrilldown('Passed Candidates (All)', 'passed')}
                    className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md hover:border-emerald-300 transition cursor-pointer group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Passed</span>
                        {reportData.comparison?.hasPreviousData ? (
                          <span
                            className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                              reportData.comparison.deltas.passed >= 0
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {reportData.comparison.deltas.passed >= 0 ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3" />
                            )}
                            {reportData.comparison.deltas.passed >= 0 ? '+' : ''}
                            {reportData.comparison.deltas.passedPct}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">--</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                          {(reportData.uniquePassedCandidates || reportData.passedCount || 0).toLocaleString()}
                        </span>
                        <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition" />
                      </div>
                    </div>

                    {/* Male / Female Demographics inside Passed card */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-2">
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          openDrilldown('Passed Candidates (Male)', 'passed_male');
                        }}
                        className="group/male hover:bg-blue-50/60 p-1 -mx-1 rounded-lg transition"
                      >
                        <div className="flex items-center justify-between text-xs font-medium mb-1">
                          <span className="flex items-center gap-1.5 text-blue-700 font-semibold">
                            <span>♂</span>
                            <span>{reportData.demographics?.male?.percentage || 0}%</span>
                            <span className="text-slate-400 font-normal">
                              ({(reportData.demographics?.male?.count || 0).toLocaleString()})
                            </span>
                          </span>
                          <span className="text-[10px] text-blue-500 opacity-0 group-hover/male:opacity-100 transition font-semibold">
                            View
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-blue-100/70 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-500"
                            style={{ width: `${reportData.demographics?.male?.percentage || 0}%` }}
                          />
                        </div>
                      </div>

                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          openDrilldown('Passed Candidates (Female)', 'passed_female');
                        }}
                        className="group/female hover:bg-purple-50/60 p-1 -mx-1 rounded-lg transition"
                      >
                        <div className="flex items-center justify-between text-xs font-medium mb-1">
                          <span className="flex items-center gap-1.5 text-purple-700 font-semibold">
                            <span>♀</span>
                            <span>{reportData.demographics?.female?.percentage || 0}%</span>
                            <span className="text-slate-400 font-normal">
                              ({(reportData.demographics?.female?.count || 0).toLocaleString()})
                            </span>
                          </span>
                          <span className="text-[10px] text-purple-500 opacity-0 group-hover/female:opacity-100 transition font-semibold">
                            View
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-purple-100/70 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full transition-all duration-500"
                            style={{ width: `${reportData.demographics?.female?.percentage || 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card 3: Duplicates */}
                  <div
                    onClick={() => openDrilldown('Repeat Applications / Duplicates', 'duplicates')}
                    className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md hover:border-slate-300 transition cursor-pointer group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Duplicates</span>
                        {reportData.comparison?.hasPreviousData ? (
                          <span
                            className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                              reportData.comparison.deltas.duplicates <= 0
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {reportData.comparison.deltas.duplicates <= 0 ? (
                              <ArrowDownRight className="w-3 h-3" />
                            ) : (
                              <ArrowUpRight className="w-3 h-3" />
                            )}
                            {reportData.comparison.deltas.duplicates >= 0 ? '+' : ''}
                            {reportData.comparison.deltas.duplicatesPct}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">--</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                          {(reportData.duplicateCount || 0).toLocaleString()}
                        </span>
                        <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition" />
                      </div>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Repeat Submission Rate</span>
                      <span className="font-bold text-slate-700">
                        {reportData.totalApplications > 0
                          ? Math.round(((reportData.duplicateCount || 0) / reportData.totalApplications) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                  </div>

                  {/* Card 4: Failed */}
                  <div
                    onClick={() => openDrilldown('Failed Applications', 'failed')}
                    className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:shadow-md hover:border-rose-300 transition cursor-pointer group flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Failed</span>
                        {reportData.comparison?.hasPreviousData ? (
                          <span
                            className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                              reportData.comparison.deltas.failed <= 0
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {reportData.comparison.deltas.failed <= 0 ? (
                              <ArrowDownRight className="w-3 h-3" />
                            ) : (
                              <ArrowUpRight className="w-3 h-3" />
                            )}
                            {reportData.comparison.deltas.failed >= 0 ? '+' : ''}
                            {reportData.comparison.deltas.failedPct}%
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">--</span>
                        )}
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                          {(reportData.failedCount || 0).toLocaleString()}
                        </span>
                        <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-rose-500 transition" />
                      </div>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Disqualification Rate</span>
                      <span className="font-bold text-rose-600">
                        {reportData.totalApplications > 0
                          ? Math.round(((reportData.failedCount || 0) / reportData.totalApplications) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2 Lower Panels: Daily Activity & Application Status Breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Daily Activity Chart */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Daily Activity</h3>
                        <p className="text-xs text-slate-500">Intake volume trajectory over ingestion timeline</p>
                      </div>
                      <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                        {getDateRangeLabel()}
                      </span>
                    </div>

                    <div className="w-full h-52 flex flex-col justify-end">
                      {activityChartData.raw.length > 0 ? (
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 560 180">
                          <defs>
                            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2563EB" stopOpacity="0.25" />
                              <stop offset="100%" stopColor="#2563EB" stopOpacity="0.01" />
                            </linearGradient>
                          </defs>

                          {/* Horizontal Grid lines */}
                          <line x1="35" y1="25" x2="525" y2="25" stroke="#F1F5F9" strokeDasharray="4 4" />
                          <line x1="35" y1="85" x2="525" y2="85" stroke="#F1F5F9" strokeDasharray="4 4" />
                          <line x1="35" y1="145" x2="525" y2="145" stroke="#F1F5F9" />

                          {/* Gradient Fill Area */}
                          <path d={activityChartData.areaPath} fill="url(#areaGradient)" />

                          {/* Smooth Bezier Stroke Line */}
                          <path
                            d={activityChartData.points}
                            fill="none"
                            stroke="#2563EB"
                            strokeWidth="3"
                            strokeLinecap="round"
                          />

                          {/* Data point dots */}
                          {activityChartData.raw.map((pt: any, i: number) => (
                            <circle
                              key={i}
                              cx={pt.x}
                              cy={pt.y}
                              r="4"
                              fill="#2563EB"
                              stroke="#FFFFFF"
                              strokeWidth="2"
                              className="hover:r-6 cursor-pointer transition-all"
                            >
                              <title>{`${pt.date}: ${pt.total} Total (${pt.passed} Passed, ${pt.failed} Failed)`}</title>
                            </circle>
                          ))}
                        </svg>
                      ) : (
                        <div className="h-full flex items-center justify-center text-xs text-slate-400">
                          No activity points recorded in selected period
                        </div>
                      )}
                    </div>

                    {/* X-axis labels */}
                    <div className="flex justify-between text-[11px] font-medium text-slate-400 mt-2 px-6">
                      {activityChartData.labels.map((pt: any, idx: number) => (
                        <span key={idx}>{formatDateDisplay(pt.date)}</span>
                      ))}
                    </div>
                  </div>

                  {/* Right: Application Status Breakdown */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Application Status Breakdown</h3>
                        <p className="text-xs text-slate-500">Distribution of screening decisions</p>
                      </div>
                      <span className="text-xs font-semibold text-slate-500">
                        {reportData.totalApplications?.toLocaleString() || 0} Total
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-8 py-2">
                      {/* Donut SVG */}
                      <div className="relative w-40 h-40 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
                          <circle
                            cx="70"
                            cy="70"
                            r="54"
                            fill="transparent"
                            stroke="#F1F5F9"
                            strokeWidth="18"
                          />
                          {statusDonutData.segments.map((seg, idx) => (
                            <circle
                              key={idx}
                              cx="70"
                              cy="70"
                              r="54"
                              fill="transparent"
                              stroke={seg.color}
                              strokeWidth="18"
                              strokeDasharray={seg.strokeDasharray}
                              strokeDashoffset={seg.strokeDashoffset}
                              className="transition-all duration-500"
                            />
                          ))}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className="text-2xl font-black text-slate-900">
                            {reportData.passRate || 0}%
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Pass Rate
                          </span>
                        </div>
                      </div>

                      {/* Legend & Breakdown bars */}
                      <div className="flex-1 w-full space-y-3">
                        {statusDonutData.segments.map((s, idx) => (
                          <div
                            key={idx}
                            onClick={() =>
                              openDrilldown(
                                `${s.label} Records`,
                                s.label === 'Passed'
                                  ? 'passed'
                                  : s.label === 'Failed'
                                  ? 'failed'
                                  : s.label === 'Duplicates'
                                  ? 'duplicates'
                                  : 'inReview'
                              )
                            }
                            className="group cursor-pointer"
                          >
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="flex items-center gap-2 font-medium text-slate-700 group-hover:text-blue-600 transition">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                                {s.label}
                              </span>
                              <span className="font-semibold text-slate-900">
                                {s.count.toLocaleString()} <span className="text-slate-400 font-normal">({s.pct}%)</span>
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================
                SUB-TAB: MONTHLY COMPARISON (DETAILED IN ALL ASPECTS)
               ======================================================== */}
            {activeTab === 'monthly_comparison' && (
              <div className="space-y-6">
                {/* 1. Header & Quick Presets Control Bar */}
                <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-5">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 shadow-xs">
                          <ArrowUpDown className="w-5 h-5" />
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                              Monthly Recruitment Comparison & Trajectory Analytics
                            </h2>
                            <span className="px-2.5 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 rounded-full border border-blue-200/60">
                              ClinisolTech – 10 Job Slots
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Detailed cross-period empirical comparison across intake volume, qualified candidates, demographics, and technology requisitions.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Presets & Actions */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-1">Presets:</span>
                      <button
                        onClick={() => {
                          setCompareMonthA('2026-10');
                          setCompareMonthB('2026-09');
                          fetchMonthComparison('2026-10', '2026-09');
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition shadow-xs ${
                          compareMonthA === '2026-10' && compareMonthB === '2026-09'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Sep vs Oct (+119%)
                      </button>
                      <button
                        onClick={() => {
                          setCompareMonthA('2026-11');
                          setCompareMonthB('2026-10');
                          fetchMonthComparison('2026-11', '2026-10');
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition shadow-xs ${
                          compareMonthA === '2026-11' && compareMonthB === '2026-10'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Oct vs Nov (+2190%)
                      </button>
                      <button
                        onClick={() => {
                          setCompareMonthA('2026-09');
                          setCompareMonthB('2026-08');
                          fetchMonthComparison('2026-09', '2026-08');
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition shadow-xs ${
                          compareMonthA === '2026-09' && compareMonthB === '2026-08'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        Aug vs Sep (+176%)
                      </button>
                      <button
                        onClick={handleExportComparisonCsv}
                        disabled={!monthComparisonData}
                        className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition shadow-xs flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Export CSV</span>
                      </button>
                    </div>
                  </div>

                  {/* Period Pickers & Quick Invert */}
                  <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/70">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700">Month A (Base Scope):</span>
                        <select
                          value={compareMonthA}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCompareMonthA(val);
                            fetchMonthComparison(val, compareMonthB);
                          }}
                          className="text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 shadow-xs cursor-pointer"
                        >
                          {availableMonths.map((m) => (
                            <option key={m.month} value={m.month}>
                              {m.label} ({m.total.toLocaleString()} leads)
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        onClick={() => {
                          const temp = compareMonthA;
                          setCompareMonthA(compareMonthB);
                          setCompareMonthB(temp);
                          fetchMonthComparison(compareMonthB, temp);
                        }}
                        title="Swap Base and Comparison Months"
                        className="p-1.5 text-slate-500 hover:text-blue-600 bg-white border border-slate-200 rounded-lg shadow-xs hover:bg-slate-50 transition"
                      >
                        <ArrowUpDown className="w-4 h-4" />
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700">Month B (Prior Scope):</span>
                        <select
                          value={compareMonthB}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCompareMonthB(val);
                            fetchMonthComparison(compareMonthA, val);
                          }}
                          className="text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 shadow-xs cursor-pointer"
                        >
                          {availableMonths.map((m) => (
                            <option key={m.month} value={m.month}>
                              {m.label} ({m.total.toLocaleString()} leads)
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">
                        Comparing: <strong className="text-slate-800">{monthComparisonData?.monthA?.label || compareMonthA}</strong> vs <strong className="text-slate-800">{monthComparisonData?.monthB?.label || compareMonthB}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {monthComparisonLoading ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-xs">
                    <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-slate-800">Compiling Detailed Monthly Variance...</h3>
                    <p className="text-xs text-slate-500 mt-1">Cross-referencing database intake, qualifications, and demographics.</p>
                  </div>
                ) : monthComparisonData ? (
                  <>
                    {/* 2. Executive Multi-Aspect Variance Scorecards (8 Aspects in a Grid) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* 1. Total Applications Intake */}
                      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                            <span className="uppercase tracking-wider font-semibold">Total Applications</span>
                            <span
                              className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
                                monthComparisonData.comparison.deltaTotal >= 0
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                              }`}
                            >
                              {monthComparisonData.comparison.deltaTotal >= 0 ? '+' : ''}
                              {monthComparisonData.comparison.deltaTotal.toLocaleString()} (
                              {monthComparisonData.comparison.deltaTotal >= 0 ? '+' : ''}
                              {monthComparisonData.comparison.deltaTotalPct}%)
                            </span>
                          </div>
                          <div className="mt-2.5 flex items-baseline justify-between">
                            <span className="text-3xl font-extrabold text-slate-900">
                              {monthComparisonData.monthA.total.toLocaleString()}
                            </span>
                            <span className="text-xs font-semibold text-slate-400">
                              vs {monthComparisonData.monthB.total.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-500">{monthComparisonData.monthA.label} Base</span>
                          <span className="font-semibold text-blue-600">{monthComparisonData.monthB.label} Prior</span>
                        </div>
                      </div>

                      {/* 2. Qualified Passed Candidates */}
                      <div
                        onClick={() => openDrilldown(`Passed Candidates (${monthComparisonData.monthA.label})`, 'passed')}
                        className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:border-emerald-300 transition cursor-pointer group flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                            <span className="uppercase tracking-wider font-semibold">Passed Qualified</span>
                            <span
                              className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
                                monthComparisonData.comparison.deltaPassed >= 0
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                              }`}
                            >
                              {monthComparisonData.comparison.deltaPassed >= 0 ? '+' : ''}
                              {monthComparisonData.comparison.deltaPassed.toLocaleString()}
                            </span>
                          </div>
                          <div className="mt-2.5 flex items-baseline justify-between">
                            <span className="text-3xl font-extrabold text-slate-900">
                              {monthComparisonData.monthA.passed.toLocaleString()}
                            </span>
                            <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition" />
                          </div>
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-500">Prior: {monthComparisonData.monthB.passed} passed</span>
                          <span className="font-semibold text-emerald-600">View Drilldown</span>
                        </div>
                      </div>

                      {/* 3. Screening Pass Rate */}
                      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                            <span className="uppercase tracking-wider font-semibold">Pass Rate %</span>
                            <span
                              className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
                                monthComparisonData.comparison.deltaPassRate >= 0
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                  : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                              }`}
                            >
                              {monthComparisonData.comparison.deltaPassRate >= 0 ? '+' : ''}
                              {monthComparisonData.comparison.deltaPassRate}% pts
                            </span>
                          </div>
                          <div className="mt-2.5 flex items-baseline justify-between">
                            <span className="text-3xl font-extrabold text-blue-600">
                              {monthComparisonData.monthA.passRate}%
                            </span>
                            <span className="text-xs font-semibold text-slate-400">
                              vs {monthComparisonData.monthB.passRate}%
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-500">Conversion Quality</span>
                          <span className="font-semibold text-slate-700">
                            {monthComparisonData.comparison.deltaPassRate >= 0 ? 'Improved Conversion' : 'Lower Conversion'}
                          </span>
                        </div>
                      </div>

                      {/* 4. Unique Candidates */}
                      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                            <span className="uppercase tracking-wider font-semibold">Unique Candidates</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              {monthComparisonData.comparison.deltaUniqueCandidates >= 0 ? '+' : ''}
                              {(monthComparisonData.comparison.deltaUniqueCandidates || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="mt-2.5 flex items-baseline justify-between">
                            <span className="text-3xl font-extrabold text-slate-900">
                              {monthComparisonData.monthA.uniqueCandidates.toLocaleString()}
                            </span>
                            <span className="text-xs font-semibold text-slate-400">
                              vs {monthComparisonData.monthB.uniqueCandidates.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-500">Profiles Deduplicated</span>
                          <span className="font-semibold text-slate-700">Unique Persons</span>
                        </div>
                      </div>

                      {/* 5. Verified Male Qualified */}
                      <div
                        onClick={() => openDrilldown(`Passed Male Candidates (${monthComparisonData.monthA.label})`, 'passed_male')}
                        className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:border-blue-300 transition cursor-pointer group flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                            <span className="uppercase tracking-wider font-semibold text-blue-700">♂ Male Qualified</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
                              {monthComparisonData.comparison.deltaMalePassed >= 0 ? '+' : ''}
                              {monthComparisonData.comparison.deltaMalePassed || 0}
                            </span>
                          </div>
                          <div className="mt-2.5 flex items-baseline justify-between">
                            <span className="text-3xl font-extrabold text-slate-900">
                              {(monthComparisonData.monthA.demographics?.maleCount || 0).toLocaleString()}
                            </span>
                            <span className="text-xs font-semibold text-slate-400">
                              ({monthComparisonData.monthA.demographics?.malePct || 0}%)
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-500">Prior: {monthComparisonData.monthB.demographics?.maleCount || 0}</span>
                          <span className="font-semibold text-blue-600">View Male Drilldown</span>
                        </div>
                      </div>

                      {/* 6. Verified Female Qualified */}
                      <div
                        onClick={() => openDrilldown(`Passed Female Candidates (${monthComparisonData.monthA.label})`, 'passed_female')}
                        className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs hover:border-purple-300 transition cursor-pointer group flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                            <span className="uppercase tracking-wider font-semibold text-purple-700">♀ Female Qualified</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/60">
                              {monthComparisonData.comparison.deltaFemalePassed >= 0 ? '+' : ''}
                              {monthComparisonData.comparison.deltaFemalePassed || 0}
                            </span>
                          </div>
                          <div className="mt-2.5 flex items-baseline justify-between">
                            <span className="text-3xl font-extrabold text-slate-900">
                              {(monthComparisonData.monthA.demographics?.femaleCount || 0).toLocaleString()}
                            </span>
                            <span className="text-xs font-semibold text-slate-400">
                              ({monthComparisonData.monthA.demographics?.femalePct || 0}%)
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-500">Prior: {monthComparisonData.monthB.demographics?.femaleCount || 0}</span>
                          <span className="font-semibold text-purple-600">View Female Drilldown</span>
                        </div>
                      </div>

                      {/* 7. Repeat Submissions Quarantined */}
                      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                            <span className="uppercase tracking-wider font-semibold">Duplicates Quarantined</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                              {monthComparisonData.comparison.deltaDuplicates >= 0 ? '+' : ''}
                              {monthComparisonData.comparison.deltaDuplicates}
                            </span>
                          </div>
                          <div className="mt-2.5 flex items-baseline justify-between">
                            <span className="text-3xl font-extrabold text-slate-900">
                              {monthComparisonData.monthA.duplicates.toLocaleString()}
                            </span>
                            <span className="text-xs font-semibold text-slate-400">
                              vs {monthComparisonData.monthB.duplicates.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-500">Repeat Applications</span>
                          <span className="font-semibold text-slate-700">Quarantine Rate</span>
                        </div>
                      </div>

                      {/* 8. Disqualified Requirements */}
                      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                            <span className="uppercase tracking-wider font-semibold text-rose-700">Disqualified (Failed)</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60">
                              {monthComparisonData.comparison.deltaFailed >= 0 ? '+' : ''}
                              {monthComparisonData.comparison.deltaFailed || 0}
                            </span>
                          </div>
                          <div className="mt-2.5 flex items-baseline justify-between">
                            <span className="text-3xl font-extrabold text-slate-900">
                              {monthComparisonData.monthA.failed.toLocaleString()}
                            </span>
                            <span className="text-xs font-semibold text-slate-400">
                              vs {monthComparisonData.monthB.failed.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-500">Ineligible / Disqualified</span>
                          <span className="font-semibold text-rose-600">Screening Disqualifications</span>
                        </div>
                      </div>
                    </div>

                    {/* 3. Multi-Month Growth Timeline Table (All Available Months) */}
                    {monthComparisonData.allMonthsTimeline && monthComparisonData.allMonthsTimeline.length > 0 && (
                      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-base font-bold text-slate-900">
                              Multi-Month Recruitment Intake & Conversion Timeline
                            </h3>
                            <p className="text-xs text-slate-500">
                              Holistic multi-month performance across all ingested ClinisolTech records.
                            </p>
                          </div>
                          <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200/60">
                            {monthComparisonData.allMonthsTimeline.length} Available Months Audited
                          </span>
                        </div>

                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                                <tr>
                                  <th className="px-4 py-3">Reporting Period</th>
                                  <th className="px-4 py-3">Total Ingested</th>
                                  <th className="px-4 py-3">Intake Growth %</th>
                                  <th className="px-4 py-3">Unique Candidates</th>
                                  <th className="px-4 py-3">Passed Qualified</th>
                                  <th className="px-4 py-3">Pass Rate %</th>
                                  <th className="px-4 py-3">Demographics (♂ | ♀)</th>
                                  <th className="px-4 py-3">Duplicates Quarantined</th>
                                  <th className="px-4 py-3">Disqualified</th>
                                  <th className="px-4 py-3 text-right">Dashboard Focus</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {monthComparisonData.allMonthsTimeline.map((m: any, idx: number) => (
                                  <tr
                                    key={idx}
                                    className={`transition ${
                                      m.month === compareMonthA
                                        ? 'bg-blue-50/50 font-medium'
                                        : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    <td className="px-4 py-3">
                                      <div className="flex items-center gap-2">
                                        <Calendar className="w-3.5 h-3.5 text-blue-600" />
                                        <span className="font-bold text-slate-900">{m.label}</span>
                                        {m.month === compareMonthA && (
                                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-blue-600 text-white font-bold">
                                            Active Month A
                                          </span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-4 py-3 font-extrabold text-slate-900">
                                      {m.total.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3">
                                      {m.growthVsPrior !== undefined && m.growthVsPrior !== 0 ? (
                                        <span
                                          className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-bold ${
                                            m.growthVsPrior >= 0
                                              ? 'bg-emerald-50 text-emerald-700'
                                              : 'bg-rose-50 text-rose-700'
                                          }`}
                                        >
                                          {m.growthVsPrior >= 0 ? '+' : ''}
                                          {m.growthVsPrior}%
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">Baseline</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 font-semibold text-slate-700">
                                      {m.uniqueCandidates.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3">
                                      <span className="font-bold text-emerald-700">{m.passed.toLocaleString()}</span>
                                    </td>
                                    <td className="px-4 py-3 font-bold text-blue-600">
                                      {m.passRate}%
                                    </td>
                                    <td className="px-4 py-3 text-slate-700">
                                      <span className="text-blue-700 font-semibold">♂ {m.demographics?.maleCount || 0}</span>
                                      <span className="text-slate-300 mx-1">|</span>
                                      <span className="text-purple-700 font-semibold">♀ {m.demographics?.femaleCount || 0}</span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600">
                                      {m.duplicates.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-rose-600 font-semibold">
                                      {m.failed.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                      <button
                                        onClick={() => {
                                          setSelectedMonth(m.month);
                                          setSelectedDate(`${m.month}-15`);
                                          setActiveTab('periodic');
                                        }}
                                        className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-white border border-blue-200 hover:bg-blue-50 rounded-lg transition shadow-xs"
                                      >
                                        Inspect Dashboard
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 4. Detailed Technology & Requisition Job Slot Comparison */}
                    <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <h3 className="text-base font-bold text-slate-900">
                            Technology & Job Slot Performance Comparison
                          </h3>
                          <p className="text-xs text-slate-500">
                            Hierarchical requisition variance between {monthComparisonData.monthA.label} and {monthComparisonData.monthB.label}.
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                            <input
                              type="text"
                              placeholder="Search technology or slot..."
                              value={compareSearch}
                              onChange={(e) => setCompareSearch(e.target.value)}
                              className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 w-52"
                            />
                          </div>

                          <button
                            onClick={() => toggleAllCompareTechs(true)}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition"
                          >
                            Expand All
                          </button>
                          <button
                            onClick={() => toggleAllCompareTechs(false)}
                            className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition"
                          >
                            Collapse All
                          </button>
                        </div>
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                              <tr>
                                <th className="px-4 py-3">Technology Domain / Requisition Job Slot</th>
                                <th className="px-4 py-3">{monthComparisonData.monthA.label} Applied</th>
                                <th className="px-4 py-3">{monthComparisonData.monthA.label} Passed (Rate)</th>
                                <th className="px-4 py-3">{monthComparisonData.monthB.label} Applied</th>
                                <th className="px-4 py-3">{monthComparisonData.monthB.label} Passed (Rate)</th>
                                <th className="px-4 py-3 text-right">Volume Variance (Δ)</th>
                                <th className="px-4 py-3 text-right">Intake Growth %</th>
                                <th className="px-4 py-3 text-right">Passed Variance (Δ)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {filteredCompareTechComparison.map((tc: any, idx: number) => {
                                const isExpanded = !!expandedCompareTechs[tc.technology];
                                const slotsA = tc.monthA?.slots || [];
                                const slotsB = tc.monthB?.slots || [];
                                const allSlotsMap = new Map<string, any>();
                                slotsA.forEach((s: any) => allSlotsMap.set(s.jobTitle, { ...s, slotB: null }));
                                slotsB.forEach((s: any) => {
                                  if (allSlotsMap.has(s.jobTitle)) {
                                    allSlotsMap.get(s.jobTitle).slotB = s;
                                  } else {
                                    allSlotsMap.set(s.jobTitle, { jobId: s.jobId, jobTitle: s.jobTitle, total: 0, passed: 0, passRate: 0, formattedPassed: '0 (M: 0 | F: 0)', slotB: s });
                                  }
                                });
                                const mergedSlots = Array.from(allSlotsMap.values());

                                return (
                                  <React.Fragment key={idx}>
                                    {/* Parent Technology Row */}
                                    <tr
                                      onClick={() => toggleCompareTechRow(tc.technology)}
                                      className="bg-slate-50/70 hover:bg-slate-100/70 transition cursor-pointer font-medium"
                                    >
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                          {isExpanded ? (
                                            <ChevronDown className="w-4 h-4 text-slate-500" />
                                          ) : (
                                            <ChevronRight className="w-4 h-4 text-slate-500" />
                                          )}
                                          <span className="font-bold text-slate-900 text-sm">{tc.technology}</span>
                                          <span className="text-[11px] text-slate-400 font-normal">
                                            ({mergedSlots.length} slots)
                                          </span>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 font-extrabold text-slate-900">
                                        {tc.monthA.total.toLocaleString()}
                                      </td>
                                      <td className="px-4 py-3 text-slate-700">
                                        <span className="font-bold text-emerald-700">{tc.monthA.passed}</span>
                                        <span className="text-slate-400 ml-1">({tc.monthA.passRate}%)</span>
                                      </td>
                                      <td className="px-4 py-3 font-semibold text-slate-600">
                                        {tc.monthB.total.toLocaleString()}
                                      </td>
                                      <td className="px-4 py-3 text-slate-600">
                                        <span>{tc.monthB.passed}</span>
                                        <span className="text-slate-400 ml-1">({tc.monthB.passRate}%)</span>
                                      </td>
                                      <td className="px-4 py-3 text-right font-extrabold">
                                        <span
                                          className={`px-2 py-0.5 rounded-md ${
                                            tc.deltaTotal >= 0
                                              ? 'bg-emerald-50 text-emerald-700'
                                              : 'bg-rose-50 text-rose-700'
                                          }`}
                                        >
                                          {tc.deltaTotal >= 0 ? '+' : ''}
                                          {tc.deltaTotal.toLocaleString()}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-right font-extrabold">
                                        <span
                                          className={`px-2 py-0.5 rounded-md ${
                                            tc.deltaTotalPct >= 0
                                              ? 'bg-emerald-50 text-emerald-700'
                                              : 'bg-rose-50 text-rose-700'
                                          }`}
                                        >
                                          {tc.deltaTotalPct >= 0 ? '+' : ''}
                                          {tc.deltaTotalPct}%
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-right font-extrabold text-slate-800">
                                        {tc.deltaPassed >= 0 ? '+' : ''}
                                        {tc.deltaPassed}
                                      </td>
                                    </tr>

                                    {/* Child Job Slot Rows */}
                                    {isExpanded &&
                                      mergedSlots.map((s: any, sIdx: number) => {
                                        const bTotal = s.slotB ? s.slotB.total : 0;
                                        const bPassed = s.slotB ? s.slotB.passed : 0;
                                        const bRate = s.slotB ? s.slotB.passRate : 0;
                                        const sDeltaTotal = s.total - bTotal;
                                        const sDeltaTotalPct = bTotal > 0 ? Math.round((sDeltaTotal / bTotal) * 100) : 0;
                                        const sDeltaPassed = s.passed - bPassed;

                                        return (
                                          <tr key={`${idx}-${sIdx}`} className="bg-white hover:bg-slate-50/60 transition">
                                            <td className="px-4 py-2.5 pl-10 text-slate-700">
                                              <div className="flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                                <span className="font-semibold text-slate-800">{s.jobTitle}</span>
                                                {s.jobId && s.jobId !== 'N/A' && (
                                                  <span className="text-[10px] text-slate-400 px-1.5 py-0.2 bg-slate-100 rounded">
                                                    {s.jobId}
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            <td className="px-4 py-2.5 font-medium text-slate-800">{s.total}</td>
                                            <td className="px-4 py-2.5 text-slate-700">
                                              <span className="font-bold text-emerald-600">{s.formattedPassed || s.passed}</span>
                                              <span className="text-slate-400 ml-1">({s.passRate}%)</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-slate-500">{bTotal}</td>
                                            <td className="px-4 py-2.5 text-slate-500">
                                              <span>{s.slotB?.formattedPassed || bPassed}</span>
                                              <span className="text-slate-400 ml-1">({bRate}%)</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-medium">
                                              <span
                                                className={
                                                  sDeltaTotal >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                                }
                                              >
                                                {sDeltaTotal >= 0 ? '+' : ''}
                                                {sDeltaTotal}
                                              </span>
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-medium text-slate-600">
                                              {bTotal > 0 ? `${sDeltaTotalPct >= 0 ? '+' : ''}${sDeltaTotalPct}%` : '--'}
                                            </td>
                                            <td className="px-4 py-2.5 text-right font-medium text-slate-700">
                                              {sDeltaPassed >= 0 ? '+' : ''}
                                              {sDeltaPassed}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                  </React.Fragment>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* 5. Demographics Evolution & Geographic Hubs Comparison */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Left: Demographics Comparison */}
                      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-base font-bold text-slate-900">
                              Candidate Demographics Evolution (Gender Distribution)
                            </h3>
                            <p className="text-xs text-slate-500">
                              Comparison of verified qualified candidate gender between {monthComparisonData.monthA.label} and {monthComparisonData.monthB.label}.
                            </p>
                          </div>
                          <Users className="w-5 h-5 text-blue-600" />
                        </div>

                        <div className="space-y-4 pt-2">
                          {/* Male Comparison Bar */}
                          <div>
                            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                              <span className="text-blue-700 flex items-center gap-1.5">
                                <span>♂</span>
                                <span>Male Qualified Candidates</span>
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-900 font-bold">
                                  {monthComparisonData.monthA.demographics?.malePct || 0}% ({monthComparisonData.monthA.demographics?.maleCount || 0})
                                </span>
                                <span className="text-slate-400 font-normal">
                                  vs {monthComparisonData.monthB.demographics?.malePct || 0}% ({monthComparisonData.monthB.demographics?.maleCount || 0})
                                </span>
                                <span
                                  className={`text-[11px] font-bold px-1.5 py-0.2 rounded ${
                                    (monthComparisonData.comparison.deltaMalePassed || 0) >= 0
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-rose-50 text-rose-700'
                                  }`}
                                >
                                  {(monthComparisonData.comparison.deltaMalePassed || 0) >= 0 ? '+' : ''}
                                  {monthComparisonData.comparison.deltaMalePassed || 0}
                                </span>
                              </div>
                            </div>
                            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                              <div
                                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                                style={{ width: `${monthComparisonData.monthA.demographics?.malePct || 0}%` }}
                              />
                            </div>
                          </div>

                          {/* Female Comparison Bar */}
                          <div>
                            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                              <span className="text-purple-700 flex items-center gap-1.5">
                                <span>♀</span>
                                <span>Female Qualified Candidates</span>
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-slate-900 font-bold">
                                  {monthComparisonData.monthA.demographics?.femalePct || 0}% ({monthComparisonData.monthA.demographics?.femaleCount || 0})
                                </span>
                                <span className="text-slate-400 font-normal">
                                  vs {monthComparisonData.monthB.demographics?.femalePct || 0}% ({monthComparisonData.monthB.demographics?.femaleCount || 0})
                                </span>
                                <span
                                  className={`text-[11px] font-bold px-1.5 py-0.2 rounded ${
                                    (monthComparisonData.comparison.deltaFemalePassed || 0) >= 0
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : 'bg-rose-50 text-rose-700'
                                  }`}
                                >
                                  {(monthComparisonData.comparison.deltaFemalePassed || 0) >= 0 ? '+' : ''}
                                  {monthComparisonData.comparison.deltaFemalePassed || 0}
                                </span>
                              </div>
                            </div>
                            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                              <div
                                className="h-full bg-purple-600 rounded-full transition-all duration-500"
                                style={{ width: `${monthComparisonData.monthA.demographics?.femalePct || 0}%` }}
                              />
                            </div>
                          </div>

                          {/* Unspecified Gender */}
                          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                            <span>Unspecified Gender Feeds:</span>
                            <span>
                              {monthComparisonData.monthA.demographics?.unspecifiedCount || 0} in {monthComparisonData.monthA.label} vs{' '}
                              {monthComparisonData.monthB.demographics?.unspecifiedCount || 0} in {monthComparisonData.monthB.label}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Geographic Distribution Comparison */}
                      <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-xs space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-base font-bold text-slate-900">
                              Top Geographic Talent Hubs Migration
                            </h3>
                            <p className="text-xs text-slate-500">
                              Metropolitan distribution of qualified candidates across periods.
                            </p>
                          </div>
                          <MapPin className="w-5 h-5 text-blue-600" />
                        </div>

                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-xs text-left">
                            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                              <tr>
                                <th className="px-3.5 py-2.5">Metropolitan Location</th>
                                <th className="px-3.5 py-2.5">{monthComparisonData.monthA.label}</th>
                                <th className="px-3.5 py-2.5">{monthComparisonData.monthB.label}</th>
                                <th className="px-3.5 py-2.5 text-right">Net Shift (Δ)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(monthComparisonData.locationsComparison || []).map((loc: any, lIdx: number) => (
                                <tr key={lIdx} className="hover:bg-slate-50 transition">
                                  <td className="px-3.5 py-2 font-medium text-slate-800">{loc.name}</td>
                                  <td className="px-3.5 py-2 font-bold text-slate-900">{loc.monthA}</td>
                                  <td className="px-3.5 py-2 text-slate-500">{loc.monthB}</td>
                                  <td className="px-3.5 py-2 text-right font-bold">
                                    <span
                                      className={
                                        loc.delta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                                      }
                                    >
                                      {loc.delta >= 0 ? '+' : ''}
                                      {loc.delta}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                              {(!monthComparisonData.locationsComparison || monthComparisonData.locationsComparison.length === 0) && (
                                <tr>
                                  <td colSpan={4} className="px-4 py-4 text-center text-slate-400">
                                    No geographic location shifts recorded between selected periods.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                    {/* 6. Specific Historical Month Deep Dive Profiles */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* October 2026 Overall Deep Dive */}
                      <div className="bg-gradient-to-br from-blue-50/80 via-white to-indigo-50/40 border border-blue-200/80 rounded-2xl p-5 shadow-xs space-y-3 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-blue-700">
                              October 2026 Profile (Oct Overall)
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-600 text-white rounded-full">
                              Baseline Month
                            </span>
                          </div>
                          <div className="mt-2">
                            <span className="text-2xl font-extrabold text-slate-900">478 Applications</span>
                            <p className="text-xs text-slate-600 mt-1">
                              <strong>32 qualified candidates</strong> (7% screening pass rate). Demographics show <strong>24 verified males (86%)</strong> and <strong>4 females (14%)</strong>.
                            </p>
                          </div>
                          <div className="mt-2.5 pt-2 border-t border-blue-100 text-[11px] text-slate-600 space-y-1">
                            <div>• Data Analytics: 211 applied (10 passed)</div>
                            <div>• CyberSecurity: 173 applied (17 passed)</div>
                            <div>• AWS: 94 applied (5 passed)</div>
                          </div>
                        </div>

                        <div className="pt-2 flex flex-col gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedMonth('2026-10');
                              setSelectedDate('2026-10-15');
                              setActiveTab('periodic');
                            }}
                            className="w-full py-1.5 px-3 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-xs flex items-center justify-center gap-1"
                          >
                            <span>Inspect Oct In Main Dashboard</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openDrilldown('October 2026 Passed Candidates (32)', 'passed')}
                            className="w-full py-1.5 px-3 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition shadow-xs text-center"
                          >
                            View Oct Passed Drilldown (32)
                          </button>
                        </div>
                      </div>

                      {/* September 2026 Baseline Deep Dive */}
                      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                              September 2026 Profile
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 rounded-full">
                              Initial Ingestion
                            </span>
                          </div>
                          <div className="mt-2">
                            <span className="text-2xl font-extrabold text-slate-900">218 Applications</span>
                            <p className="text-xs text-slate-600 mt-1">
                              Springboard ingestion feed for ClinisolTech requisitions before multi-channel expansion.
                            </p>
                          </div>
                          <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11px] text-slate-600 space-y-1">
                            <div>• AWS Requisitions: 120 applications</div>
                            <div>• CyberSecurity Requisitions: 98 applications</div>
                            <div>• October Growth Rate: <strong>+119%</strong></div>
                          </div>
                        </div>

                        <div className="pt-2">
                          <button
                            onClick={() => {
                              setSelectedMonth('2026-09');
                              setSelectedDate('2026-09-15');
                              setActiveTab('periodic');
                            }}
                            className="w-full py-1.5 px-3 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition shadow-xs text-center"
                          >
                            Inspect Sep In Main Dashboard
                          </button>
                        </div>
                      </div>

                      {/* November 2026 Scale-Up Deep Dive */}
                      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs space-y-3 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                              November 2026 Profile
                            </span>
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-full">
                              Production Scale
                            </span>
                          </div>
                          <div className="mt-2">
                            <span className="text-2xl font-extrabold text-slate-900">10,947 Applications</span>
                            <p className="text-xs text-slate-600 mt-1">
                              <strong>521 qualified candidates</strong> passing multi-tier criteria; 5,655 duplicate occurrences quarantined.
                            </p>
                          </div>
                          <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11px] text-slate-600 space-y-1">
                            <div>• Data Analytics: 5,904 applications</div>
                            <div>• CyberSecurity: 3,685 applications</div>
                            <div>• AWS: 1,358 applications</div>
                          </div>
                        </div>

                        <div className="pt-2">
                          <button
                            onClick={() => {
                              setSelectedMonth('2026-11');
                              setSelectedDate('2026-11-15');
                              setActiveTab('periodic');
                            }}
                            className="w-full py-1.5 px-3 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition shadow-xs text-center"
                          >
                            Inspect Nov In Main Dashboard
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            )}

            {/* ========================================================
                SUB-TAB 2: GEOGRAPHIC & DEMOGRAPHIC ANALYTICS (PAGE 2 TOP)
               ======================================================== */}
            {activeTab === 'geographic_demographic' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Card 1: Top Geographic Locations */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Top Geographic Locations</h3>
                        <p className="text-xs text-slate-500">Metropolitan distribution of unique passed candidates</p>
                      </div>
                      <MapPin className="w-5 h-5 text-blue-600" />
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-4">
                      {/* Donut SVG */}
                      <div className="relative w-40 h-40 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
                          <circle
                            cx="70"
                            cy="70"
                            r="54"
                            fill="transparent"
                            stroke="#F1F5F9"
                            strokeWidth="18"
                          />
                          {geoDonutData.segments.map((seg, idx) => (
                            <circle
                              key={idx}
                              cx="70"
                              cy="70"
                              r="54"
                              fill="transparent"
                              stroke={seg.color}
                              strokeWidth="18"
                              strokeDasharray={seg.strokeDasharray}
                              strokeDashoffset={seg.strokeDashoffset}
                              className="transition-all duration-500"
                            />
                          ))}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                          <span className="text-xl font-black text-slate-900">
                            {reportData.uniquePassedCandidates || reportData.passedCount || 0}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Passed Leads
                          </span>
                        </div>
                      </div>

                      {/* Legend List */}
                      <div className="flex-1 w-full space-y-2">
                        {geoDonutData.items.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            onClick={() => openDrilldown(`Location: ${item.name}`, 'location', item.name)}
                            className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer group transition"
                          >
                            <span className="flex items-center gap-2 font-medium text-slate-700 group-hover:text-blue-600">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                              {item.name}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {item.count} <span className="text-slate-400 font-normal">({item.percentage}%)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                      <span>Normalized canonical metro hubs</span>
                      <button
                        onClick={() => openDrilldown('Passed Candidates (All Locations)', 'passed')}
                        className="text-blue-600 font-medium hover:underline flex items-center gap-1"
                      >
                        Explore all locations <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Card 2: Candidate Demographics */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Candidate Demographics</h3>
                        <p className="text-xs text-slate-500">Gender distribution of eligible passed talent</p>
                      </div>
                      <Users className="w-5 h-5 text-indigo-600" />
                    </div>

                    {/* Male Bar */}
                    <div className="space-y-4 py-2">
                      <div>
                        <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                          <span className="text-blue-700 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                            Male
                          </span>
                          <span className="text-slate-900">
                            {reportData.demographics?.male?.percentage || 0}%{' '}
                            <span className="text-slate-400 font-normal">
                              ({reportData.demographics?.male?.count || 0})
                            </span>
                          </span>
                        </div>
                        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-500"
                            style={{ width: `${reportData.demographics?.male?.percentage || 0}%` }}
                          />
                        </div>
                      </div>

                      {/* Female Bar */}
                      <div>
                        <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                          <span className="text-purple-700 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                            Female
                          </span>
                          <span className="text-slate-900">
                            {reportData.demographics?.female?.percentage || 0}%{' '}
                            <span className="text-slate-400 font-normal">
                              ({reportData.demographics?.female?.count || 0})
                            </span>
                          </span>
                        </div>
                        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full transition-all duration-500"
                            style={{ width: `${reportData.demographics?.female?.percentage || 0}%` }}
                          />
                        </div>
                      </div>

                      {/* Unspecified pill */}
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-slate-500">Unspecified Gender</span>
                        <span className="font-semibold text-slate-700">
                          {reportData.demographics?.unspecified?.count || 0}{' '}
                          <span className="text-slate-400 font-normal">
                            ({reportData.demographics?.unspecified?.percentage || 0}%)
                          </span>
                        </span>
                      </div>
                    </div>

                    {/* Age Bands */}
                    <div className="mt-5 pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-700">Age Distribution Bands</span>
                        <span className="text-[11px] text-slate-400">EEOC Compliance</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-center">
                        {['18–25', '26–35', '36–45', '46+'].map((band) => (
                          <div key={band} className="bg-slate-50 border border-slate-100 rounded-xl p-2">
                            <span className="block text-xs font-bold text-slate-800">{band}</span>
                            <span className="block text-[11px] text-slate-400 mt-0.5">--</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 italic">
                        * Note: Date of birth is not collected in standard ATS resume imports per employment screening guidelines.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================
                SUB-TAB 3: TECHNOLOGY & JOB SLOT ANALYTICS (PAGE 2 BOTTOM)
               ======================================================== */}
            {activeTab === 'technology_slots' && (
              <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
                {/* Header Controls */}
                <div className="p-6 border-b border-slate-200/70 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">
                      Technology & Job Slot Performance
                    </h3>
                    <p className="text-xs text-slate-500">
                      Hierarchical breakdown across domains and individual requisition slots
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Search filter */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        placeholder="Search technology / slot..."
                        value={techSearch}
                        onChange={(e) => setTechSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 w-52"
                      />
                    </div>

                    {/* Sort Selector */}
                    <select
                      value={techSortKey}
                      onChange={(e: any) => setTechSortKey(e.target.value)}
                      className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-700 font-medium focus:outline-none cursor-pointer"
                    >
                      <option value="volume">Sort by Volume</option>
                      <option value="passed">Sort by Passed</option>
                      <option value="passRate">Sort by Pass Rate</option>
                      <option value="duplicates">Sort by Duplicates</option>
                    </select>

                    {/* Expand/Collapse All */}
                    <button
                      onClick={() => toggleAllTechs(true)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                    >
                      Expand All
                    </button>
                    <button
                      onClick={() => toggleAllTechs(false)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                    >
                      Collapse All
                    </button>
                  </div>
                </div>

                {/* Hierarchical Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        <th className="py-3 px-6">Technology / Job Slot</th>
                        <th className="py-3 px-4 text-right">Total Applied</th>
                        <th className="py-3 px-4 text-center">Passed (M: X | F: Y)</th>
                        <th className="py-3 px-4 text-right">Duplicates</th>
                        <th className="py-3 px-4 text-right">Failed</th>
                        <th className="py-3 px-4 text-right">Pass Rate</th>
                        <th className="py-3 px-4 text-right">Repeat Rate</th>
                        <th className="py-3 px-6 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                      {processedTechTree.map((tech: any) => {
                        const isExpanded = !!expandedTechs[tech.technology];
                        return (
                          <React.Fragment key={tech.technology}>
                            {/* Parent Technology Row */}
                            <tr className="bg-slate-50/50 hover:bg-slate-100/70 transition font-semibold text-slate-900">
                              <td className="py-3.5 px-6 flex items-center gap-2">
                                <button
                                  onClick={() => toggleTechRow(tech.technology)}
                                  className="p-1 text-slate-400 hover:text-slate-800 transition"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-blue-600" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </button>
                                <span className="font-bold text-slate-900 text-sm">
                                  {tech.technology}
                                </span>
                                <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full ml-1">
                                  {tech.slots?.length || 0} slots
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right font-extrabold text-slate-900">
                                {tech.totalApplied.toLocaleString()}
                              </td>
                              <td className="py-3.5 px-4 text-center font-bold text-blue-700 font-mono">
                                {tech.passedFormatted}
                              </td>
                              <td className="py-3.5 px-4 text-right text-slate-600 font-medium">
                                {tech.duplicates.toLocaleString()}
                              </td>
                              <td className="py-3.5 px-4 text-right text-rose-600 font-medium">
                                {tech.failed.toLocaleString()}
                              </td>
                              <td className="py-3.5 px-4 text-right">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-md font-bold ${
                                    tech.passRate >= 12
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}
                                >
                                  {tech.passRate}%
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-right text-slate-500 font-medium">
                                {tech.repeatRate}%
                              </td>
                              <td className="py-3.5 px-6 text-center">
                                <button
                                  onClick={() => openDrilldown(`Technology: ${tech.technology}`, 'technology', tech.technology)}
                                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold hover:underline"
                                >
                                  Drilldown
                                </button>
                              </td>
                            </tr>

                            {/* Child Job Slot Rows */}
                            {isExpanded &&
                              (tech.slots || []).map((slot: any) => (
                                <tr key={slot.jobId} className="hover:bg-blue-50/30 transition">
                                  <td className="py-2.5 px-6 pl-14 flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                    <span className="font-medium text-slate-800">{slot.jobTitle}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">({slot.jobId})</span>
                                  </td>
                                  <td className="py-2.5 px-4 text-right text-slate-700 font-medium">
                                    {slot.totalApplied.toLocaleString()}
                                  </td>
                                  <td className="py-2.5 px-4 text-center font-mono font-medium text-slate-800">
                                    {slot.passedFormatted}
                                  </td>
                                  <td className="py-2.5 px-4 text-right text-slate-500">
                                    {slot.duplicates.toLocaleString()}
                                  </td>
                                  <td className="py-2.5 px-4 text-right text-slate-500">
                                    {slot.failed.toLocaleString()}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-medium text-slate-700">
                                    {slot.passRate}%
                                  </td>
                                  <td className="py-2.5 px-4 text-right text-slate-400">
                                    {slot.repeatRate}%
                                  </td>
                                  <td className="py-2.5 px-6 text-center">
                                    <button
                                      onClick={() => openDrilldown(`Slot: ${slot.jobTitle} (${slot.jobId})`, 'jobSlot', slot.jobId)}
                                      className="text-[11px] text-slate-500 hover:text-blue-600 font-medium hover:underline"
                                    >
                                      View Records
                                    </button>
                                  </td>
                                </tr>
                              ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer notes */}
                <div className="p-4 bg-slate-50/80 border-t border-slate-200/70 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
                  <span>Displaying ClinisolTech requisition slots CT-001 through CT-010</span>
                  <div className="flex items-center gap-4 mt-2 sm:mt-0 font-medium">
                    <span>M = Verified Male</span>
                    <span>F = Verified Female</span>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================
                SUB-TAB 4: ADVANCED RECRUITMENT INSIGHTS & FUNNEL
               ======================================================== */}
            {activeTab === 'advanced_insights' && (
              <div className="space-y-6">
                {/* 1. Recruitment Funnel */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Recruitment Conversion Funnel</h3>
                      <p className="text-xs text-slate-500">Step-by-step conversion efficiency from ingestion to Master CRM</p>
                    </div>

                    <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200/70 text-xs font-semibold">
                      <button
                        onClick={() => setFunnelMode('application')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          funnelMode === 'application'
                            ? 'bg-white text-blue-600 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Application Occurrences
                      </button>
                      <button
                        onClick={() => setFunnelMode('person')}
                        className={`px-3 py-1.5 rounded-lg transition-all ${
                          funnelMode === 'person'
                            ? 'bg-white text-blue-600 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Unique Candidates
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {(funnelMode === 'application'
                      ? reportData.funnel?.applicationLevel || []
                      : reportData.funnel?.personLevel || []
                    ).map((stage: any, idx: number) => (
                      <div
                        key={idx}
                        className="bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 relative overflow-hidden"
                      >
                        <div className="flex items-center justify-between text-xs font-bold text-slate-500 mb-1">
                          <span>Stage {idx + 1}</span>
                          <span className="text-blue-600">{stage.percentage}%</span>
                        </div>
                        <h4 className="text-sm font-bold text-slate-900 mb-3">{stage.stage}</h4>
                        <div className="text-2xl font-black text-slate-900 mb-2">
                          {stage.count.toLocaleString()}
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-500"
                            style={{ width: `${stage.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Source Channels & Data Quality Side by Side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left: Source Channel Distribution */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Application Source Ingestion</h3>
                        <p className="text-xs text-slate-500">Channel origin and qualification outcome</p>
                      </div>
                      <Layers className="w-5 h-5 text-blue-600" />
                    </div>

                    <div className="space-y-3">
                      {(reportData.sourceAnalytics || []).map((src: any, idx: number) => (
                        <div key={idx} className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-800 mb-1">
                            <span>{src.channel}</span>
                            <span className="text-blue-600">{src.passRate}% Pass Rate</span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500">
                            <span>{src.total.toLocaleString()} total occurrences</span>
                            <span>{src.passed.toLocaleString()} passed</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: Data Quality Health Audit */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Data Quality & Completeness Audit</h3>
                        <p className="text-xs text-slate-500">Sanitation and completeness check of ingested records</p>
                      </div>
                      <span className="text-xs font-extrabold px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200">
                        {reportData.dataQuality?.healthScore || 0}% Score
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <span className="block text-slate-400 text-[11px]">Missing Phone</span>
                        <span className="block text-base font-bold text-slate-800 mt-1">
                          {reportData.dataQuality?.missingPhone || 0}
                        </span>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <span className="block text-slate-400 text-[11px]">Missing Email</span>
                        <span className="block text-base font-bold text-slate-800 mt-1">
                          {reportData.dataQuality?.missingEmail || 0}
                        </span>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <span className="block text-slate-400 text-[11px]">Unverified Gender</span>
                        <span className="block text-base font-bold text-slate-800 mt-1">
                          {reportData.dataQuality?.unverifiedGender || 0}
                        </span>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <span className="block text-slate-400 text-[11px]">Unlinked Master CRM</span>
                        <span className="block text-base font-bold text-slate-800 mt-1">
                          {reportData.dataQuality?.unlinkedMaster || 0}
                        </span>
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-400 mt-4 italic">
                      * Data quality flags indicate profile hygiene and do not affect screening qualifications.
                    </p>
                  </div>
                </div>

                {/* 3. AI Recruitment Insights Cards */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                    <div>
                      <h3 className="text-base font-bold text-slate-900">AI Recruitment Synthesis & Trends</h3>
                      <p className="text-xs text-slate-500">Autonomous insights calculated from verified operational metrics</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(reportData.aiInsights || []).map((insight: string, idx: number) => (
                      <div
                        key={idx}
                        className="bg-blue-50/50 border border-blue-100 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-slate-800"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 shrink-0" />
                        <span className="leading-relaxed">{insight}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================
                SUB-TAB 5: REPORT MANAGEMENT & EXPORTS
               ======================================================== */}
            {activeTab === 'exports_snapshots' && (
              <div className="space-y-6">
                {/* 1. Export Hub */}
                <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Export Recruitment Reports</h3>
                      <p className="text-xs text-slate-500">
                        Export complete ClinisolTech analytics for stakeholders, spreadsheets, and print
                      </p>
                    </div>
                    <Download className="w-5 h-5 text-blue-600" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Excel */}
                    <div className="border border-slate-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-xs transition">
                      <FileSpreadsheet className="w-8 h-8 text-emerald-600 mb-3" />
                      <h4 className="text-sm font-bold text-slate-900">Excel Workbook (.xlsx)</h4>
                      <p className="text-xs text-slate-500 mt-1 mb-4">
                        Comprehensive multi-sheet report with Overview, Tech Breakdown, Demographics & Geo data.
                      </p>
                      <button
                        onClick={handleExportExcel}
                        disabled={isExporting}
                        className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Excel (.xlsx)
                      </button>
                    </div>

                    {/* CSV */}
                    <div className="border border-slate-200 rounded-2xl p-5 hover:border-blue-300 hover:shadow-xs transition">
                      <FileText className="w-8 h-8 text-blue-600 mb-3" />
                      <h4 className="text-sm font-bold text-slate-900">Standard CSV (.csv)</h4>
                      <p className="text-xs text-slate-500 mt-1 mb-4">
                        Flat tabular data compatible with Google Sheets, PowerBI, and data warehouses.
                      </p>
                      <button
                        onClick={handleExportCsv}
                        disabled={isExporting}
                        className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download CSV (.csv)
                      </button>
                    </div>

                    {/* Print / PDF */}
                    <div className="border border-slate-200 rounded-2xl p-5 hover:border-purple-300 hover:shadow-xs transition">
                      <Printer className="w-8 h-8 text-purple-600 mb-3" />
                      <h4 className="text-sm font-bold text-slate-900">Print / Save as PDF</h4>
                      <p className="text-xs text-slate-500 mt-1 mb-4">
                        Clean corporate print format tailored for leadership presentations and archiving.
                      </p>
                      <button
                        onClick={() => window.print()}
                        className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Print / PDF View
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Saved Report Views & Historical Snapshots Side by Side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Saved Views */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Saved Report Presets</h3>
                        <p className="text-xs text-slate-500">Quickly reload your favorite filter combinations</p>
                      </div>
                      <button
                        onClick={() => setShowSaveViewModal(true)}
                        className="px-3 py-1.5 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl transition flex items-center gap-1"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        Save Current View
                      </button>
                    </div>

                    {savedViews.length > 0 ? (
                      <div className="space-y-2">
                        {savedViews.map((v) => (
                          <div
                            key={v.id}
                            className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs"
                          >
                            <div>
                              <span className="font-bold text-slate-800">{v.name}</span>
                              <span className="block text-[11px] text-slate-400 capitalize mt-0.5">
                                {v.period} • {v.dateStr}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleApplySavedView(v)}
                                className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-blue-600 font-semibold hover:bg-slate-50 transition"
                              >
                                Apply
                              </button>
                              <button
                                onClick={() => handleDeleteSavedView(v.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 transition"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-xs text-slate-400">
                        No custom presets saved yet. Save current scope above!
                      </div>
                    )}
                  </div>

                  {/* Historical Snapshots */}
                  <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-base font-bold text-slate-900">Historical Report Snapshots</h3>
                        <p className="text-xs text-slate-500">Capture an immutable record of today's recruitment metrics</p>
                      </div>
                      <button
                        onClick={() => setShowSnapshotModal(true)}
                        className="px-3 py-1.5 text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl transition flex items-center gap-1"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Capture Snapshot
                      </button>
                    </div>

                    {snapshots.length > 0 ? (
                      <div className="space-y-2">
                        {snapshots.map((s) => (
                          <div
                            key={s.id}
                            className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs flex items-center justify-between"
                          >
                            <div>
                              <span className="font-bold text-slate-800">{s.title}</span>
                              <span className="block text-[11px] text-slate-400 mt-0.5">
                                {s.dateRange} • {s.kpis.totalApplications} Total ({s.kpis.passedUnique} Passed)
                              </span>
                              {s.notes && (
                                <p className="text-[11px] text-slate-500 mt-1 italic">{s.notes}</p>
                              )}
                            </div>
                            <button
                              onClick={() => handleDeleteSnapshot(s.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-xs text-slate-400">
                        No snapshots captured yet. Capture a baseline milestone snapshot!
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ========================================================
          INTERACTIVE DRILLDOWN MODAL
         ======================================================== */}
      {drilldownOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <span>Filtered Records: {drilldownTitle}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                    {drilldownTotal.toLocaleString()} Total Records
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Scope: ClinisolTech • {getDateRangeLabel()}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportDrilldownCsv}
                  disabled={drilldownRecords.length === 0}
                  className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl transition flex items-center gap-1.5 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
                <button
                  onClick={() => setDrilldownOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Search Bar */}
            <div className="p-4 border-b border-slate-100 bg-white flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search candidate name, email, location..."
                  value={drilldownSearch}
                  onChange={(e) => handleDrilldownSearchChange(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="text-xs text-slate-400">
                Page {drilldownPage} of {Math.max(1, Math.ceil(drilldownTotal / 15))}
              </div>
            </div>

            {/* Modal Records Table */}
            <div className="flex-1 overflow-auto p-4">
              {drilldownLoading ? (
                <div className="py-16 text-center">
                  <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
                  <span className="text-xs text-slate-500">Loading underlying candidate records...</span>
                </div>
              ) : drilldownRecords.length > 0 ? (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3">Candidate</th>
                      <th className="py-2.5 px-3">Location</th>
                      <th className="py-2.5 px-3">Requisition Slot</th>
                      <th className="py-2.5 px-3">Date Applied</th>
                      <th className="py-2.5 px-3 text-center">Outcome</th>
                      <th className="py-2.5 px-3 text-center">Duplicate</th>
                      <th className="py-2.5 px-3">Master ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {drilldownRecords.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70 transition">
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-slate-900 block">{r.fullName}</span>
                          <span className="text-[11px] text-slate-400 block">{r.email || r.phone || 'No direct contact'}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{r.location || 'Unknown'}</td>
                        <td className="py-2.5 px-3">
                          <span className="font-medium text-slate-800">{r.jobTitle}</span>
                          <span className="text-[10px] text-slate-400 block font-mono">{r.jobId}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{formatDateDisplay(r.applicationDate)}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              r.effectiveResult === 'PASS'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : r.effectiveResult === 'FAIL'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {r.effectiveResult}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {r.isDuplicate === 1 ? (
                            <span className="text-amber-700 font-semibold text-[11px]">Repeat</span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Unique</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                          {r.masterPersonId ? (
                            <span className="text-blue-600 font-semibold">{r.masterPersonId}</span>
                          ) : (
                            <span className="text-slate-300">--</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-16 text-center text-xs text-slate-400">
                  No records found matching this drilldown filter.
                </div>
              )}
            </div>

            {/* Modal Pagination Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Showing {drilldownRecords.length} of {drilldownTotal.toLocaleString()} records
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDrilldownPageChange(drilldownPage - 1)}
                  disabled={drilldownPage <= 1}
                  className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 disabled:opacity-40 hover:bg-slate-100 transition flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Previous
                </button>
                <button
                  onClick={() => handleDrilldownPageChange(drilldownPage + 1)}
                  disabled={drilldownPage * 15 >= drilldownTotal}
                  className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 disabled:opacity-40 hover:bg-slate-100 transition flex items-center gap-1"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save View Modal */}
      {showSaveViewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">Save Report Preset</h3>
            <p className="text-xs text-slate-500 mb-4">Save current reporting scope ({period.toUpperCase()} • {getDateRangeLabel()})</p>
            <input
              type="text"
              placeholder="e.g. Weekly Executive Review"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSaveViewModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCurrentView}
                disabled={!newViewName.trim()}
                className="px-4 py-2 text-xs font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                Save Preset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Capture Snapshot Modal */}
      {showSnapshotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-900 mb-1">Capture Milestone Snapshot</h3>
            <p className="text-xs text-slate-500 mb-4">Lock in current recruitment statistics as an immutable historical point.</p>
            <div className="space-y-3 mb-4">
              <input
                type="text"
                placeholder="Snapshot Title (e.g. Q4 Intake Close)"
                value={snapshotTitle}
                onChange={(e) => setSnapshotTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
              />
              <textarea
                placeholder="Optional operational notes or context..."
                value={snapshotNotes}
                onChange={(e) => setSnapshotNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowSnapshotModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleCaptureSnapshot}
                disabled={!snapshotTitle.trim()}
                className="px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50"
              >
                Capture Snapshot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
