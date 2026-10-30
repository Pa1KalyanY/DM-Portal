import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Filter,
  Upload,
  Calendar,
  Briefcase,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  UserCheck,
  Trash2,
  RefreshCw,
  Search,
  ExternalLink,
  ChevronDown,
  Layers,
  FileSpreadsheet,
  Building2,
  Stethoscope,
  Info,
  Clock,
  ShieldCheck,
  Share2,
  ChevronRight,
  Eye,
  Check,
  AlertCircle,
  ClipboardList,
  X,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Edit3,
  Database,
  ArrowRight,
  UserPlus,
} from 'lucide-react';
import { useWorkspace } from '../../context/WorkspaceContext';
import { Applicant, ImportRecord, Recruiter, NameMatchCategory } from '../../types';
import { api } from '../../api/client';
import { indexedDBService } from '../../services/indexedDb';
import { ApplicantDetailModal } from '../ApplicantDetailModal';
import { normalizeJobRole, formatDayMonthYear } from '../../shared/columnMapper';
import {
  readNavigationStateFromUrl,
  readPersistedBackupState,
  syncNavigationToUrlAndStorage,
  sanitizeCompanyAndSlot,
  getUnsavedPasteDraft,
  saveUnsavedPasteDraft,
  clearUnsavedPasteDraft,
} from '../../shared/navigationState';
import { CompanyName } from '../../types/masterDatabase';

export const ApplicationFilterWorkspaceView: React.FC = () => {
  const { user, activeCompany, setActiveCompany, isDualCompany } = useWorkspace();

  // Read initial navigation state from URL parameters + session backup
  const initialNavState = useMemo(() => {
    const urlState = readNavigationStateFromUrl();
    const backup = readPersistedBackupState();
    return { ...backup, ...urlState };
  }, []);

  const initialJobSlot = useMemo(() => {
    const raw = initialNavState.slot || 'ALL';
    return sanitizeCompanyAndSlot(activeCompany, raw).slot;
  }, [activeCompany]);

  // Step 1 Controls: Portal Ingestion Date (selected for processing new uploads/pastes)
  const [selectedDate, setSelectedDate] = useState<string>(() => initialNavState.date || new Date().toISOString().split('T')[0]);
  const [selectedJobSlot, setSelectedJobSlot] = useState<string>(initialJobSlot);
  const [baselineJobs, setBaselineJobs] = useState<Array<{ jobId: string; jobTitle: string; total?: number }>>([]);
  const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
  const [editingJobSlot, setEditingJobSlot] = useState<{ jobId: string; jobTitle: string; newTitle: string } | null>(null);
  const [isSavingJobSlot, setIsSavingJobSlot] = useState<boolean>(false);

  // Step 5 Controls: Results & Copy Workspace Date Filter (Portal Ingestion Date)
  const [resultsDate, setResultsDate] = useState<string>(() => initialNavState.resultsDate || 'ALL');
  const [historyStartDate, setHistoryStartDate] = useState<string>(() => initialNavState.historyStartDate || '');
  const [historyEndDate, setHistoryEndDate] = useState<string>(() => initialNavState.historyEndDate || '');
  const [availableIngestionDates, setAvailableIngestionDates] = useState<Array<{ date: string; count: number }>>([]);

  // Step 2 & Batch Selection
  const [activeBatchId, setActiveBatchId] = useState<string>(() => initialNavState.batchId || '');
  const [batchHistory, setBatchHistory] = useState<ImportRecord[]>([]);
  const [viewMode, setViewMode] = useState<'working_batch' | 'permanent_history'>(() => initialNavState.viewMode || 'working_batch');

  // Step 5: Passed, Failed, Manual Review Tabs
  const [activeTab, setActiveTab] = useState<'PASS' | 'MANUAL_REVIEW' | 'FAIL' | 'ALL'>(() => initialNavState.tab || 'PASS');

  // Applicants & Pagination
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [page, setPage] = useState<number>(() => initialNavState.page || 1);
  const [pageSize, setPageSize] = useState<number>(() => initialNavState.pageSize || 25);
  const [searchQuery, setSearchQuery] = useState<string>(() => initialNavState.search || '');
  const [loading, setLoading] = useState<boolean>(false);

  // Full-Window Zoom Grid (60% to 125%, 85% default Fit Table)
  const [zoomLevel, setZoomLevel] = useState<number>(85);

  // Advanced Filters: Gender, Reference Match, Normalized Role
  const [genderFilter, setGenderFilter] = useState<string>(() => initialNavState.gender || 'ALL');
  const [nameMatchFilter, setNameMatchFilter] = useState<string>(() => initialNavState.nameMatch || 'ALL');
  const [roleFilter, setRoleFilter] = useState<string>(() => initialNavState.role || 'ALL');
  const [isBatchActionInProgress, setIsBatchActionInProgress] = useState<boolean>(false);

  // Selected Records for Distribution or Copy
  const [selectedApplicantIds, setSelectedApplicantIds] = useState<string[]>([]);
  const [selectedRecruiter, setSelectedRecruiter] = useState<string>('');
  const [isDistributing, setIsDistributing] = useState<boolean>(false);
  const [copySuccessMessage, setCopySuccessMessage] = useState<string | null>(null);

  // Detail Modal & Override State
  const [detailApplicant, setDetailApplicant] = useState<Applicant | null>(null);
  const [overrideModalApplicant, setOverrideModalApplicant] = useState<Applicant | null>(null);
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [overrideTargetStatus, setOverrideTargetStatus] = useState<'PASS' | 'FAIL' | 'MANUAL_REVIEW'>('PASS');

  // Clear Working Batch Modal
  const [isClearBatchModalOpen, setIsClearBatchModalOpen] = useState<boolean>(false);
  const [isPurgingRecords, setIsPurgingRecords] = useState<boolean>(false);

  // Clear All Applications Modal (Company Scoped Fresh Start)
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState<boolean>(false);
  const [isClearingAll, setIsClearingAll] = useState<boolean>(false);
  const [clearSummary, setClearSummary] = useState<{
    company: 'AaraTech' | 'ClinisolTech';
    totalApplications: number;
    passedCount: number;
    failedCount: number;
    manualReviewCount: number;
    duplicateCount: number;
    totalBatches: number;
    workingBatches: number;
    preservedMasterCandidates: number;
    preservedJobSlots: number;
  } | null>(null);
  const [loadingClearSummary, setLoadingClearSummary] = useState<boolean>(false);

  // Phase 2: Send Passed Applications to Master Database State
  const [isTransferring, setIsTransferring] = useState<boolean>(false);
  const [transferModalSummary, setTransferModalSummary] = useState<{
    open: boolean;
    result?: {
      totalEligiblePassed: number;
      transferredCount: number;
      newCandidatesCount: number;
      existingCandidatesCount: number;
      newApplicationsCount: number;
      skippedDuplicatesCount: number;
      possibleMatchesCount: number;
      message: string;
      transfers: any[];
    };
  }>({ open: false });

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Ingestion Method Selector: 'upload' (default) | 'paste'
  const [importMethod, setImportMethod] = useState<'upload' | 'paste'>(() => initialNavState.method || 'upload');

  // Direct Paste State - restored from unsaved session draft if present
  const initialPasteDraft = useMemo(() => getUnsavedPasteDraft(), []);
  const [pastedText, setPastedText] = useState<string>(initialPasteDraft.text);
  const [pasteBatchLabel, setPasteBatchLabel] = useState<string>(initialPasteDraft.label);
  const [isAnalyzingPaste, setIsAnalyzingPaste] = useState<boolean>(false);
  const [isImportingPaste, setIsImportingPaste] = useState<boolean>(false);
  const [pastePreview, setPastePreview] = useState<{
    totalRows: number;
    validRows: number;
    invalidRows: number;
    hasHeaders: boolean;
    headers: string[];
    mappedFields: Record<string, string>;
    missingRequiredFields: string[];
    rows: Array<{
      rowIndex: number;
      fullName: string;
      firstName?: string;
      lastName?: string;
      email: string;
      phone: string;
      location?: string;
      jobId: string;
      jobTitle: string;
      greenCardAnswer: string;
      sponsorshipAnswer: string;
      profileUrl?: string;
      dateApplied?: string;
      rawQuestions?: string;
      isValid: boolean;
      errors: string[];
      screeningStatus?: 'PASS' | 'FAIL' | 'MANUAL_REVIEW';
      screeningReasons?: string[];
    }>;
  } | null>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteImportSummary, setPasteImportSummary] = useState<{
    importCode: string;
    batchName?: string;
    filesProcessed: number;
    totalApplicants: number;
    passed: number;
    failed: number;
    manualReview: number;
    errors: number;
  } | null>(null);

  // Safely persist unsaved paste text and label into sessionStorage
  useEffect(() => {
    saveUnsavedPasteDraft(pastedText, pasteBatchLabel);
  }, [pastedText, pasteBatchLabel]);

  // Keep job slot sanitized when active company changes
  useEffect(() => {
    const { slot: safeSlot } = sanitizeCompanyAndSlot(activeCompany, selectedJobSlot);
    if (safeSlot !== selectedJobSlot) {
      setSelectedJobSlot(safeSlot);
    }
  }, [activeCompany, selectedJobSlot]);

  // Sync navigation state to URL query parameters & storage backup
  useEffect(() => {
    syncNavigationToUrlAndStorage({
      section: 'filter',
      company: activeCompany,
      slot: selectedJobSlot,
      tab: activeTab,
      batchId: activeBatchId || undefined,
      viewMode,
      method: importMethod,
      date: selectedDate,
      resultsDate: resultsDate !== 'ALL' ? resultsDate : undefined,
      historyStartDate: historyStartDate || undefined,
      historyEndDate: historyEndDate || undefined,
      search: searchQuery || undefined,
      page,
      pageSize,
      gender: genderFilter !== 'ALL' ? genderFilter : undefined,
      nameMatch: nameMatchFilter !== 'ALL' ? nameMatchFilter : undefined,
      role: roleFilter !== 'ALL' ? roleFilter : undefined,
    });
  }, [
    activeCompany,
    selectedJobSlot,
    activeTab,
    activeBatchId,
    viewMode,
    importMethod,
    selectedDate,
    resultsDate,
    historyStartDate,
    historyEndDate,
    searchQuery,
    page,
    pageSize,
    genderFilter,
    nameMatchFilter,
    roleFilter,
  ]);

  // Load Baseline Jobs, Recruiters, Batches, and Ingestion Dates whenever active company changes
  useEffect(() => {
    let isMounted = true;
    async function loadMeta() {
      try {
        const [jobsData, recruitersData, importsData, datesData] = await Promise.all([
          api.getJobs(activeCompany),
          api.getRecruiters(activeCompany),
          api.getImports(activeCompany, 50),
          api.getIngestionDates(activeCompany),
        ]);
        if (isMounted) {
          setBaselineJobs(jobsData);
          setRecruiters(recruitersData);
          setBatchHistory(importsData);
          setAvailableIngestionDates(datesData.dates || []);
          
          // Verify if current activeBatchId exists in this company's imports or is 'ALL'
          const batchStillValid = activeBatchId === 'ALL' || importsData.some(b => b.id === activeBatchId);
          if (!batchStillValid && importsData.length > 0) {
            setActiveBatchId(importsData[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load filter metadata:', err);
      }
    }
    loadMeta();
    return () => { isMounted = false; };
  }, [activeCompany]);

  interface LoadApplicantsOverrides {
    batchId?: string;
    tab?: 'PASS' | 'MANUAL_REVIEW' | 'FAIL' | 'ALL';
    page?: number;
    pageSize?: number;
    jobSlot?: string;
    viewMode?: 'working_batch' | 'permanent_history';
    company?: CompanyName;
    date?: string;
    resultsDate?: string;
    historyStartDate?: string;
    historyEndDate?: string;
    search?: string;
    gender?: string;
    nameMatch?: string;
    role?: string;
  }

  const loadRequestIdRef = useRef(0);

  // Load Applicants for Current Filter & Tab (with race condition protection and overrides)
  const loadApplicants = async (overrides?: LoadApplicantsOverrides) => {
    const currentRequestId = ++loadRequestIdRef.current;
    try {
      setLoading(true);
      const effectiveCompany = overrides?.company || activeCompany;
      const effectiveBatchId = overrides?.batchId !== undefined ? overrides.batchId : activeBatchId;
      const effectiveViewMode = overrides?.viewMode !== undefined ? overrides.viewMode : viewMode;
      const effectiveTab = overrides?.tab !== undefined ? overrides.tab : activeTab;
      const effectivePage = overrides?.page !== undefined ? overrides.page : page;
      const effectivePageSize = overrides?.pageSize !== undefined ? overrides.pageSize : pageSize;
      const effectiveSlot = overrides?.jobSlot !== undefined ? overrides.jobSlot : selectedJobSlot;
      const effectiveResultsDate = overrides?.resultsDate !== undefined ? overrides.resultsDate : resultsDate;
      const effectiveHStart = overrides?.historyStartDate !== undefined ? overrides.historyStartDate : historyStartDate;
      const effectiveHEnd = overrides?.historyEndDate !== undefined ? overrides.historyEndDate : historyEndDate;
      const effectiveSearch = overrides?.search !== undefined ? overrides.search : searchQuery;
      const effectiveGender = overrides?.gender !== undefined ? overrides.gender : genderFilter;
      const effectiveNameMatch = overrides?.nameMatch !== undefined ? overrides.nameMatch : nameMatchFilter;
      const effectiveRole = overrides?.role !== undefined ? overrides.role : roleFilter;

      const batchToQuery = effectiveViewMode === 'working_batch' && effectiveBatchId && effectiveBatchId !== 'ALL'
        ? effectiveBatchId
        : undefined;

      const appDateToQuery = effectiveResultsDate && effectiveResultsDate !== 'ALL'
        ? effectiveResultsDate
        : undefined;

      const startDateToQuery = effectiveViewMode === 'permanent_history' && effectiveHStart ? effectiveHStart : undefined;
      const endDateToQuery = effectiveViewMode === 'permanent_history' && effectiveHEnd ? effectiveHEnd : undefined;

      const res = await api.getApplicants({
        page: effectivePage,
        pageSize: effectivePageSize,
        status: effectiveTab === 'ALL' ? undefined : effectiveTab,
        company: effectiveCompany,
        batchId: batchToQuery,
        applicationDate: appDateToQuery,
        startDate: startDateToQuery,
        endDate: endDateToQuery,
        jobId: effectiveSlot !== 'ALL' ? effectiveSlot : undefined,
        search: effectiveSearch || undefined,
        gender: effectiveGender !== 'ALL' ? effectiveGender : undefined,
        nameMatchCategory: effectiveNameMatch !== 'ALL' ? (effectiveNameMatch as any) : undefined,
        normalizedRole: effectiveRole !== 'ALL' ? effectiveRole : undefined,
        sortBy: 'date_applied',
        sortOrder: 'desc',
      });

      if (currentRequestId === loadRequestIdRef.current) {
        setApplicants(res.data);
        setTotalCount(res.total);
      }
    } catch (err) {
      if (currentRequestId === loadRequestIdRef.current) {
        console.error('Failed to fetch applicants:', err);
      }
    } finally {
      if (currentRequestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    loadApplicants();
  }, [
    activeCompany,
    activeBatchId,
    viewMode,
    activeTab,
    page,
    pageSize,
    selectedJobSlot,
    resultsDate,
    historyStartDate,
    historyEndDate,
    searchQuery,
    genderFilter,
    nameMatchFilter,
    roleFilter,
  ]);

  // Tab Badge Counts for Current Scope (Exact matching counts across Passed, Manual Review, Failed, All Records)
  const [tabCounts, setTabCounts] = useState<{ pass: number; fail: number; review: number; all: number }>({
    pass: 0,
    fail: 0,
    review: 0,
    all: 0,
  });

  const fetchTabCounts = async (overrides?: LoadApplicantsOverrides) => {
    try {
      const effectiveCompany = overrides?.company || activeCompany;
      const effectiveBatchId = overrides?.batchId !== undefined ? overrides.batchId : activeBatchId;
      const effectiveViewMode = overrides?.viewMode !== undefined ? overrides.viewMode : viewMode;
      const effectiveSlot = overrides?.jobSlot !== undefined ? overrides.jobSlot : selectedJobSlot;
      const effectiveResultsDate = overrides?.resultsDate !== undefined ? overrides.resultsDate : resultsDate;
      const effectiveHStart = overrides?.historyStartDate !== undefined ? overrides.historyStartDate : historyStartDate;
      const effectiveHEnd = overrides?.historyEndDate !== undefined ? overrides.historyEndDate : historyEndDate;
      const effectiveSearch = overrides?.search !== undefined ? overrides.search : searchQuery;
      const effectiveGender = overrides?.gender !== undefined ? overrides.gender : genderFilter;
      const effectiveNameMatch = overrides?.nameMatch !== undefined ? overrides.nameMatch : nameMatchFilter;
      const effectiveRole = overrides?.role !== undefined ? overrides.role : roleFilter;

      const counts = await api.getApplicantTabCounts({
        company: effectiveCompany,
        batchId: effectiveViewMode === 'working_batch' && effectiveBatchId && effectiveBatchId !== 'ALL' ? effectiveBatchId : undefined,
        applicationDate: effectiveResultsDate && effectiveResultsDate !== 'ALL' ? effectiveResultsDate : undefined,
        startDate: effectiveViewMode === 'permanent_history' && effectiveHStart ? effectiveHStart : undefined,
        endDate: effectiveViewMode === 'permanent_history' && effectiveHEnd ? effectiveHEnd : undefined,
        jobId: effectiveSlot !== 'ALL' ? effectiveSlot : undefined,
        search: effectiveSearch || undefined,
        gender: effectiveGender !== 'ALL' ? effectiveGender : undefined,
        nameMatchCategory: effectiveNameMatch !== 'ALL' ? effectiveNameMatch : undefined,
        normalizedRole: effectiveRole !== 'ALL' ? effectiveRole : undefined,
      });

      setTabCounts(counts);
    } catch (err) {
      console.error('Failed to update tab counts:', err);
    }
  };

  useEffect(() => {
    fetchTabCounts();
  }, [
    activeCompany,
    activeBatchId,
    viewMode,
    selectedJobSlot,
    resultsDate,
    historyStartDate,
    historyEndDate,
    searchQuery,
    genderFilter,
    nameMatchFilter,
    roleFilter,
    batchHistory,
  ]);

  // Unified Auto-Refresh Workspace Data (Eliminates all manual F5 browser refreshes)
  const refreshAllWorkspaceData = async (overrides?: LoadApplicantsOverrides) => {
    try {
      const effectiveCompany = overrides?.company || activeCompany;
      
      // 1. Refresh baseline jobs
      const jobs = await api.getJobs(effectiveCompany);
      setBaselineJobs(jobs);

      // 2. Refresh batch history & available ingestion dates
      const [updatedImports, datesData] = await Promise.all([
        api.getImports(effectiveCompany, 50),
        api.getIngestionDates(effectiveCompany),
      ]);
      setBatchHistory(updatedImports);
      setAvailableIngestionDates(datesData.dates || []);

      // 3. Refresh applicants with explicit overrides
      await loadApplicants(overrides);

      // 4. Refresh tab counts immediately with exact filtered scope
      await fetchTabCounts(overrides);

      // 5. Notify rest of application (Header badges, Sidebar counters, Dashboard)
      window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { company: effectiveCompany } }));
    } catch (err) {
      console.error('Failed to refresh workspace data:', err);
    }
  };

  // Listen to cross-component workspace updates
  useEffect(() => {
    const handleRemoteUpdate = () => {
      loadApplicants();
      fetchTabCounts();
    };
    window.addEventListener('workspace-data-updated', handleRemoteUpdate);
    return () => window.removeEventListener('workspace-data-updated', handleRemoteUpdate);
  }, [activeCompany, activeBatchId, viewMode, activeTab, page, pageSize, selectedJobSlot, selectedDate, searchQuery, genderFilter, nameMatchFilter, roleFilter]);

  // Handle Save Job Slot Rename
  const handleSaveJobSlotRename = async () => {
    if (!editingJobSlot || !editingJobSlot.newTitle.trim()) return;
    setIsSavingJobSlot(true);
    try {
      await api.updateJobTitle(editingJobSlot.jobId, editingJobSlot.newTitle.trim(), activeCompany);
      setBaselineJobs(prev => prev.map(j => j.jobId === editingJobSlot.jobId ? { ...j, jobTitle: editingJobSlot.newTitle.trim() } : j));
      setApplicants(prev => prev.map(a => a.jobId === editingJobSlot.jobId ? { ...a, jobTitle: editingJobSlot.newTitle.trim() } : a));
      window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { company: activeCompany } }));
      setEditingJobSlot(null);
    } catch (err: any) {
      alert(`Failed to rename job slot: ${err.message}`);
    } finally {
      setIsSavingJobSlot(false);
    }
  };

  // Handle Multi-File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);
    try {
      const fileList = Array.from(files);
      const chosenJobSlots = selectedJobSlot !== 'ALL' ? [selectedJobSlot] : [];
      const selectedJobObj = baselineJobs.find(j => j.jobId === selectedJobSlot);
      const slotPrefix = selectedJobObj ? `[${selectedJobObj.jobId}] ${selectedJobObj.jobTitle} - ` : '';
      const batchLabel = fileList.length === 1
        ? `${slotPrefix}${fileList[0].name}`
        : `${slotPrefix}${fileList.map(f => f.name).join(', ')}`;

      const res = await api.processFiles(
        fileList,
        batchLabel,
        'Recruiter Admin',
        activeCompany,
        selectedDate,
        chosenJobSlots
      );

      // Refresh imports history & set new active batch & align results date to the imported processing date
      setActiveBatchId(res.importRecord.id);
      setViewMode('working_batch');
      setResultsDate(selectedDate);
      setActiveTab('PASS');
      setPage(1);

      await refreshAllWorkspaceData({
        batchId: res.importRecord.id,
        resultsDate: selectedDate,
        viewMode: 'working_batch',
        tab: 'PASS',
        page: 1,
      });

      alert(`Batch Upload Completed!\n• File: ${batchLabel}\n• Total Applicants: ${res.summary.totalApplicants}\n• Passed: ${res.summary.passed}\n• Manual Review: ${res.summary.manualReview}\n• Failed: ${res.summary.failed}`);
    } catch (err: any) {
      setUploadError(err.message || 'File upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Direct Paste: Preview & Column Mapping Analysis
  const handlePreviewPastedData = async () => {
    if (!pastedText.trim()) {
      setPasteError('Please paste your application rows from Excel or Google Sheets into the box above (Ctrl+V).');
      return;
    }
    setIsAnalyzingPaste(true);
    setPasteError(null);
    setPasteImportSummary(null);
    try {
      const selectedJobObj = baselineJobs.find(j => j.jobId === selectedJobSlot);
      const res = await api.previewPastedData({
        text: pastedText,
        company: activeCompany,
        jobId: selectedJobSlot !== 'ALL' ? selectedJobSlot : undefined,
        jobTitle: selectedJobObj?.jobTitle,
      });
      setPastePreview(res);
      if (res.missingRequiredFields && res.missingRequiredFields.length > 0) {
        setPasteError(`Missing required application columns: ${res.missingRequiredFields.join(', ')}. Please verify that your pasted rows include candidate names and email or phone contact details.`);
      }
    } catch (err: any) {
      setPasteError(err.message || 'Failed to preview pasted data.');
      setPastePreview(null);
    } finally {
      setIsAnalyzingPaste(false);
    }
  };

  // Direct Paste: Full Recruitment Ingestion Pipeline
  const handleImportPastedData = async () => {
    if (!pastedText.trim() || !pastePreview || pastePreview.validRows === 0) {
      alert('Please preview and validate pasted applications before importing.');
      return;
    }
    setIsImportingPaste(true);
    setPasteError(null);
    try {
      const chosenJobSlots = selectedJobSlot !== 'ALL' ? [selectedJobSlot] : [];
      const selectedJobObj = baselineJobs.find(j => j.jobId === selectedJobSlot);
      const slotDisplayName = selectedJobObj ? `[${selectedJobObj.jobId}] ${selectedJobObj.jobTitle}` : undefined;
      const res = await api.processPastedData({
        text: pastedText,
        label: pasteBatchLabel.trim() || slotDisplayName || `Pasted Ingestion - ${selectedDate}`,
        uploadedBy: 'Recruiter Admin',
        company: activeCompany,
        applicationDate: selectedDate,
        jobSlots: chosenJobSlots,
        defaultJobId: selectedJobSlot !== 'ALL' ? selectedJobSlot : undefined,
        defaultJobTitle: selectedJobObj?.jobTitle,
      });

      // Refresh imports history & set new active batch & align results date to the imported processing date
      setActiveBatchId(res.importRecord.id);
      setViewMode('working_batch');
      setResultsDate(selectedDate);
      setActiveTab('PASS');
      setPage(1);

      setPasteImportSummary(res.summary);
      setPastedText('');
      setPastePreview(null);
      setPasteBatchLabel('');
      clearUnsavedPasteDraft();

      await refreshAllWorkspaceData({
        batchId: res.importRecord.id,
        resultsDate: selectedDate,
        viewMode: 'working_batch',
        tab: 'PASS',
        page: 1,
      });

      alert(`Paste Import Completed!\n• Total Records: ${res.summary.totalApplicants}\n• Passed: ${res.summary.passed}\n• Manual Review: ${res.summary.manualReview}\n• Failed: ${res.summary.failed}\n• Errors/Invalid: ${res.summary.errors}`);
    } catch (err: any) {
      setPasteError(err.message || 'Failed to import pasted applications.');
    } finally {
      setIsImportingPaste(false);
    }
  };

  // Direct Paste: Clear Paste Area (Safe: Never Touches DB Records)
  const handleClearPasteArea = () => {
    setPastedText('');
    setPastePreview(null);
    setPasteError(null);
    setPasteBatchLabel('');
    clearUnsavedPasteDraft();
  };

  // Direct Paste: Cancel Action
  const handleCancelPaste = () => {
    handleClearPasteArea();
    setImportMethod('upload');
  };

  // 1-Click Copy Passed Applications as Google Sheets TSV
  const handleCopyPassedApplications = async (includeHeaders = false) => {
    try {
      const idsToCopy = selectedApplicantIds.length > 0 ? selectedApplicantIds : undefined;
      const res = await api.copyGoogleSheetsTsv({
        status: activeTab === 'ALL' ? undefined : (activeTab === 'PASS' ? 'PASS' : activeTab),
        company: activeCompany,
        importId: viewMode === 'working_batch' && activeBatchId && activeBatchId !== 'ALL' ? activeBatchId : undefined,
        applicationDate: resultsDate !== 'ALL' ? resultsDate : undefined,
        startDate: viewMode === 'permanent_history' && historyStartDate ? historyStartDate : undefined,
        endDate: viewMode === 'permanent_history' && historyEndDate ? historyEndDate : undefined,
        jobId: selectedJobSlot !== 'ALL' ? selectedJobSlot : undefined,
        gender: genderFilter !== 'ALL' ? genderFilter : undefined,
        role: roleFilter !== 'ALL' ? roleFilter : undefined,
        nameMatchCategory: nameMatchFilter !== 'ALL' ? nameMatchFilter : undefined,
        search: searchQuery ? searchQuery : undefined,
        ids: idsToCopy,
        includeHeaders,
      });

      const dateDesc = resultsDate !== 'ALL'
        ? `for ingestion date ${formatDayMonthYear(resultsDate)}`
        : (historyStartDate || historyEndDate
            ? `for range ${historyStartDate || '...'} to ${historyEndDate || '...'}`
            : 'for all dates');

      const filterDesc = genderFilter !== 'ALL' ? ` [${genderFilter}]` : '';

      setCopySuccessMessage(
        `Copied ${res.total} application(s) (${dateDesc}${filterDesc}) formatted for Google Sheets! (8 Columns: Date, Name, Contact, Email, Role, GC/US-C, H1B, LinkedIn). Ready to paste with Ctrl+V.`
      );
      setTimeout(() => setCopySuccessMessage(null), 5000);
    } catch (err: any) {
      alert(`Copy failed: ${err.message}`);
    }
  };

  // 1-Click Copy with Verification & Intelligence Details (Section 6.3 8-Column Format)
  const handleCopyVerificationTsv = async (includeHeaders = false) => {
    try {
      const idsToCopy = selectedApplicantIds.length > 0 ? selectedApplicantIds : undefined;
      const res = await api.copyGoogleSheetsTsv({
        status: activeTab === 'ALL' ? undefined : (activeTab === 'PASS' ? 'PASS' : activeTab),
        company: activeCompany,
        importId: viewMode === 'working_batch' && activeBatchId && activeBatchId !== 'ALL' ? activeBatchId : undefined,
        applicationDate: resultsDate !== 'ALL' ? resultsDate : undefined,
        startDate: viewMode === 'permanent_history' && historyStartDate ? historyStartDate : undefined,
        endDate: viewMode === 'permanent_history' && historyEndDate ? historyEndDate : undefined,
        jobId: selectedJobSlot !== 'ALL' ? selectedJobSlot : undefined,
        gender: genderFilter !== 'ALL' ? genderFilter : undefined,
        role: roleFilter !== 'ALL' ? roleFilter : undefined,
        nameMatchCategory: nameMatchFilter !== 'ALL' ? nameMatchFilter : undefined,
        search: searchQuery ? searchQuery : undefined,
        ids: idsToCopy,
        format: 'verification',
        includeHeaders,
      });

      const dateDesc = resultsDate !== 'ALL'
        ? `for ingestion date ${formatDayMonthYear(resultsDate)}`
        : (historyStartDate || historyEndDate
            ? `for range ${historyStartDate || '...'} to ${historyEndDate || '...'}`
            : 'for all dates');

      const filterDesc = genderFilter !== 'ALL' ? ` [${genderFilter}]` : '';

      setCopySuccessMessage(
        `Copied ${res.total} candidate(s) (${dateDesc}${filterDesc}) to clipboard in Verification & Matching format! Ready for Ctrl+V.`
      );
      setTimeout(() => setCopySuccessMessage(null), 5000);
    } catch (err: any) {
      alert(`Copy failed: ${err.message}`);
    }
  };

  // 1-Click Copy Single Candidate Row
  const handleCopySingleRow = async (applicant: Applicant) => {
    try {
      await api.copyGoogleSheetsTsv({
        ids: [applicant.id],
        format: 'default',
        includeHeaders: false,
      });
      setCopySuccessMessage(`Copied ${applicant.fullName} (${applicant.normalizedRole || 'Candidate'}) formatted for Google Sheets!`);
      setTimeout(() => setCopySuccessMessage(null), 3000);
    } catch (err: any) {
      alert(`Copy failed: ${err.message}`);
    }
  };

  // Phase 2: Send Passed Applications to Master Database Handler (Prompt Section 5)
  const handleSendPassedToMaster = async () => {
    setIsTransferring(true);
    try {
      const idsToTransfer = selectedApplicantIds.length > 0 ? selectedApplicantIds : undefined;
      const res = await api.transferPassedToMaster({
        company: activeCompany,
        batchId: viewMode === 'working_batch' && activeBatchId && activeBatchId !== 'ALL' ? activeBatchId : undefined,
        applicantIds: idsToTransfer,
        transferredBy: user?.name || 'Recruiter Admin',
      });
      setTransferModalSummary({
        open: true,
        result: res,
      });
      await refreshAllWorkspaceData();
    } catch (err: any) {
      alert(`Transfer failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsTransferring(false);
    }
  };

  // 1-Click In-Place Status Override
  const handleQuickOverride = async (applicantId: string, newStatus: 'PASS' | 'FAIL' | 'MANUAL_REVIEW') => {
    // Optimistic UI update
    setApplicants(prev => prev.map(a => a.id === applicantId ? { ...a, effectiveResult: newStatus } : a));
    try {
      await api.overrideApplicant(applicantId, newStatus, '1-Click In-Place Override', 'Recruiter Admin');
      await refreshAllWorkspaceData();
    } catch (err: any) {
      alert(`Override failed: ${err.message}`);
      await refreshAllWorkspaceData();
    }
  };

  // 1-Click In-Place Gender Toggle (Male ♂ -> Female ♀ -> Unspecified ?)
  const handleQuickGenderToggle = async (applicantId: string, currentGender?: string) => {
    const cycle: Record<string, 'MALE' | 'FEMALE' | 'UNSPECIFIED'> = {
      MALE: 'FEMALE',
      FEMALE: 'UNSPECIFIED',
      UNSPECIFIED: 'MALE',
    };
    const nextGender = cycle[currentGender || 'UNSPECIFIED'] || 'MALE';
    setApplicants(prev => prev.map(a => a.id === applicantId ? { ...a, gender: nextGender } : a));
    try {
      await api.updateApplicantGender(applicantId, nextGender, 'Recruiter Admin');
      await refreshAllWorkspaceData();
    } catch (err: any) {
      alert(`Gender update failed: ${err.message}`);
      await refreshAllWorkspaceData();
    }
  };

  // Floating Batch Action: Status Override
  const handleBatchStatus = async (status: 'PASS' | 'FAIL' | 'MANUAL_REVIEW') => {
    if (selectedApplicantIds.length === 0) return;
    setIsBatchActionInProgress(true);
    try {
      await api.batchOverrideApplicants(selectedApplicantIds, status, 'Bulk Recruiter Action', 'Recruiter Admin');
      setSelectedApplicantIds([]);
      await refreshAllWorkspaceData();
    } catch (err: any) {
      alert(`Batch override failed: ${err.message}`);
    } finally {
      setIsBatchActionInProgress(false);
    }
  };

  // Floating Batch Action: Gender Update
  const handleBatchGender = async (gender: 'MALE' | 'FEMALE' | 'UNSPECIFIED') => {
    if (selectedApplicantIds.length === 0) return;
    setIsBatchActionInProgress(true);
    try {
      await api.batchUpdateGender(selectedApplicantIds, gender, 'Recruiter Admin');
      setSelectedApplicantIds([]);
      await refreshAllWorkspaceData();
    } catch (err: any) {
      alert(`Batch gender update failed: ${err.message}`);
    } finally {
      setIsBatchActionInProgress(false);
    }
  };

  // Manual Review Status Override Modal Handler
  const handleSaveOverride = async () => {
    if (!overrideModalApplicant) return;
    try {
      await api.overrideApplicant(
        overrideModalApplicant.id,
        overrideTargetStatus,
        overrideReason || 'Authorized Recruiter Decision',
        'Recruiter Admin'
      );
      setOverrideModalApplicant(null);
      setOverrideReason('');
      await refreshAllWorkspaceData();
    } catch (err: any) {
      alert(`Override failed: ${err.message}`);
    }
  };

  // Clear Working Batch (Safe Scoped Action, NEVER Global Wipe)
  const handleClearCurrentBatch = async () => {
    if (!activeBatchId) {
      alert('No active batch selected to clear.');
      return;
    }

    try {
      const res = await api.clearCurrentBatch(activeBatchId, activeCompany, isPurgingRecords, 'Recruiter Admin');
      alert(`Batch Cleared Successfully:\n${res.message}\nPermanent database, candidate profiles, reference datasets, and audit history remain preserved.`);
      setIsClearBatchModalOpen(false);

      // Refresh batch list
      const updatedImports = await api.getImports(activeCompany, 50);
      setBatchHistory(updatedImports);
      const nextBatchId = updatedImports.length > 0 ? updatedImports[0].id : '';
      setActiveBatchId(nextBatchId);
      await refreshAllWorkspaceData({ batchId: nextBatchId });
    } catch (err: any) {
      alert(`Failed to clear batch: ${err.message}`);
    }
  };

  // Open Clear All Applications Preview Modal
  const handleOpenClearAllModal = async () => {
    setIsClearAllModalOpen(true);
    setLoadingClearSummary(true);
    try {
      const summary = await api.getApplicationClearSummary(activeCompany);
      setClearSummary(summary);
    } catch (err: any) {
      console.error('Failed to fetch clear summary:', err);
    } finally {
      setLoadingClearSummary(false);
    }
  };

  // Confirm and Execute Clear All Applications
  const handleConfirmClearAll = async () => {
    setIsClearingAll(true);
    try {
      const res = await api.clearAllApplications(activeCompany, 'Recruiter Admin');
      alert(`Success: ${res.message}`);
      setIsClearAllModalOpen(false);

      // Reset client state
      setApplicants([]);
      setTotalCount(0);
      setBatchHistory([]);
      setActiveBatchId('');
      setSelectedApplicantIds([]);

      // Clean indexedDB imports cache for this company
      try {
        const localImports = await indexedDBService.getAll<any>('imports');
        for (const imp of localImports) {
          if (imp.company === activeCompany) {
            await indexedDBService.deleteItem('imports', imp.id);
          }
        }
      } catch (idbErr) {
        console.warn('Could not clean indexedDB imports cache:', idbErr);
      }

      // Reload fresh data from backend
      await refreshAllWorkspaceData({ batchId: '' });
    } catch (err: any) {
      alert(`Clear All failed: ${err.message}`);
    } finally {
      setIsClearingAll(false);
    }
  };

  // Check if all items on the current visible page are selected
  const isAllCurrentPageSelected = applicants.length > 0 && applicants.every(a => selectedApplicantIds.includes(a.id));
  const isSomeCurrentPageSelected = applicants.some(a => selectedApplicantIds.includes(a.id)) && !isAllCurrentPageSelected;

  // Toggle selection for current page applicants (preserves selections on other pages)
  const handleSelectAllCurrentPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const pageIds = applicants.map(a => a.id);
      setSelectedApplicantIds(prev => Array.from(new Set([...prev, ...pageIds])));
    } else {
      const pageIdSet = new Set(applicants.map(a => a.id));
      setSelectedApplicantIds(prev => prev.filter(id => !pageIdSet.has(id)));
    }
  };

  // Select all matching candidates across ALL pages
  const handleSelectAllAcrossPages = async () => {
    try {
      const res = await api.getAllApplicantIds({
        search: searchQuery || undefined,
        status: activeTab === 'ALL' ? undefined : activeTab,
        gender: genderFilter !== 'ALL' ? genderFilter : undefined,
        nameMatchCategory: nameMatchFilter !== 'ALL' ? nameMatchFilter : undefined,
        role: roleFilter !== 'ALL' ? roleFilter : undefined,
        company: activeCompany,
        batchId: viewMode === 'working_batch' && activeBatchId && activeBatchId !== 'ALL' ? activeBatchId : undefined,
        applicationDate: resultsDate !== 'ALL' ? resultsDate : undefined,
        jobId: selectedJobSlot !== 'ALL' ? selectedJobSlot : undefined,
      } as any);
      if (res && res.ids) {
        setSelectedApplicantIds(res.ids);
      }
    } catch (err: any) {
      console.error('Failed to select all across pages:', err);
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedApplicantIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Helper to format clean display name for batch dropdown (exact file name, job slot or custom label)
  const getBatchDisplayName = (b: ImportRecord) => {
    // 1. If batchName exists and is a specific name (e.g. '[CT-001] CyberSecurity - 1')
    if (b.batchName && !b.batchName.includes('Direct Clipboard Paste') && !b.batchName.startsWith('Pasted Ingestion')) {
      return b.batchName.replace(/\s*\(\d+\s*rows\)$/i, '');
    }
    // 2. If files have a job slot / title
    const file = b.files?.[0];
    if (file && file.jobId && file.jobId !== 'ALL' && file.jobId !== 'PASTE-JOB' && file.jobTitle) {
      if (file.jobTitle.includes(file.jobId)) {
        return file.jobTitle;
      }
      return `[${file.jobId}] ${file.jobTitle}`;
    }
    // 3. If real file names exist (not generic "Direct Clipboard Paste")
    if (b.files && b.files.length > 0) {
      const realFiles = b.files
        .map(f => f.filename)
        .filter(name => name && name !== 'Direct Clipboard Paste');
      if (realFiles.length > 0) {
        return realFiles.join(', ');
      }
    }
    // 4. If b.jobSlots is present (e.g. ['CT-001'])
    if (b.jobSlots && b.jobSlots.length > 0 && b.jobSlots[0] !== 'ALL') {
      const slot = b.jobSlots[0];
      const jobObj = baselineJobs.find(j => j.jobId === slot);
      if (jobObj) {
        return `[${jobObj.jobId}] ${jobObj.jobTitle}`;
      }
      return slot;
    }
    return b.batchName || 'Uploaded Applications';
  };

  const activeBatchRecord = batchHistory.find(b => b.id === activeBatchId);

  return (
    <div className="space-y-6">
      {/* Detail Slideover/Modal */}
      {detailApplicant && (
        <ApplicantDetailModal
          applicant={detailApplicant}
          onClose={() => setDetailApplicant(null)}
          onStatusUpdated={() => {
            refreshAllWorkspaceData();
          }}
        />
      )}

      {/* Manual Override Dialog */}
      {overrideModalApplicant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Review &amp; Override Screening</h3>
                <p className="text-xs text-slate-500">{overrideModalApplicant.fullName}</p>
              </div>
              <button
                onClick={() => setOverrideModalApplicant(null)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500 block mb-1">Target Decision:</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setOverrideTargetStatus('PASS')}
                    className={`py-1.5 px-2 rounded-lg font-semibold border text-center transition-all ${
                      overrideTargetStatus === 'PASS'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    PASS (Eligible)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverrideTargetStatus('MANUAL_REVIEW')}
                    className={`py-1.5 px-2 rounded-lg font-semibold border text-center transition-all ${
                      overrideTargetStatus === 'MANUAL_REVIEW'
                        ? 'bg-amber-50 text-amber-700 border-amber-300'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    MANUAL REVIEW
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverrideTargetStatus('FAIL')}
                    className={`py-1.5 px-2 rounded-lg font-semibold border text-center transition-all ${
                      overrideTargetStatus === 'FAIL'
                        ? 'bg-rose-50 text-rose-700 border-rose-300'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    FAIL (Reject)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-slate-700 font-semibold block mb-1">
                  Reason for Override (Compliance &amp; Audit Trail):
                </label>
                <textarea
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Verified valid US Green Card in interview; authorized manual exception."
                  rows={3}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-500 space-y-1">
                <div>• GC/US-Citizen Answer: <strong>{overrideModalApplicant.greenCardCitizenAnswer}</strong></div>
                <div>• Sponsorship Answer: <strong>{overrideModalApplicant.sponsorshipAnswer}</strong></div>
                <div>• Initial Reason: {overrideModalApplicant.screeningReasons || 'N/A'}</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setOverrideModalApplicant(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveOverride}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-xs"
              >
                Save Decision &amp; Audit Log
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Current Working Batch Modal (Safe Scoped Action) */}
      {isClearBatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Clear Current Working Batch</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Safe scoped action for workspace <strong>{activeCompany}</strong>.
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1.5">
              <p>
                <strong>Batch:</strong> {activeBatchRecord?.batchName || activeBatchId} ({activeBatchRecord?.importCode || 'N/A'})
              </p>
              <p>
                This clears the current active working batch session from this workspace.
              </p>
              <p className="text-[11px] text-amber-700">
                Notice: All candidate profiles in the Master Candidate CRM, baseline job slots, screening rules, reference datasets, other batches, and historical reports remain intact.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <label className="flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPurgingRecords}
                  onChange={(e) => setIsPurgingRecords(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-0"
                />
                <span>Also purge this batch's applicant rows from the current filter list (keeps master profiles)</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsClearBatchModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50"
              >
                Keep Batch
              </button>
              <button
                type="button"
                onClick={handleClearCurrentBatch}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs"
              >
                Confirm Clear Current Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Applications Confirmation Modal (Company Scoped Fresh Start) */}
      {isClearAllModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-white border border-rose-200 rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-900">Clear All Applications</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
                    activeCompany === 'AaraTech'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  }`}>
                    {activeCompany} Only
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Permanently remove all application records for <strong>{activeCompany}</strong> to start fresh. This operation cannot be undone.
                </p>
              </div>
            </div>

            {loadingClearSummary ? (
              <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-500">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Loading application scope breakdown...</span>
              </div>
            ) : (
              <>
                {/* Deletion Scope Metrics */}
                <div className="bg-rose-50/60 border border-rose-200 rounded-xl p-4 space-y-2.5">
                  <div className="text-xs font-bold text-rose-900 uppercase tracking-wider flex items-center justify-between">
                    <span>Records to be Deleted ({activeCompany})</span>
                    <span className="text-sm font-extrabold text-rose-700">
                      {clearSummary?.totalApplications ?? 0} Total Applications
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs">
                    <div className="bg-white/80 p-2 rounded-lg border border-rose-100">
                      <div className="text-slate-500 text-[11px]">Passed</div>
                      <div className="font-bold text-emerald-700">{clearSummary?.passedCount ?? 0}</div>
                    </div>
                    <div className="bg-white/80 p-2 rounded-lg border border-rose-100">
                      <div className="text-slate-500 text-[11px]">Manual Review</div>
                      <div className="font-bold text-amber-700">{clearSummary?.manualReviewCount ?? 0}</div>
                    </div>
                    <div className="bg-white/80 p-2 rounded-lg border border-rose-100">
                      <div className="text-slate-500 text-[11px]">Failed</div>
                      <div className="font-bold text-rose-700">{clearSummary?.failedCount ?? 0}</div>
                    </div>
                    <div className="bg-white/80 p-2 rounded-lg border border-rose-100">
                      <div className="text-slate-500 text-[11px]">Duplicates</div>
                      <div className="font-bold text-slate-700">{clearSummary?.duplicateCount ?? 0}</div>
                    </div>
                    <div className="bg-white/80 p-2 rounded-lg border border-rose-100">
                      <div className="text-slate-500 text-[11px]">Working Batches</div>
                      <div className="font-bold text-blue-700">{clearSummary?.workingBatches ?? 0}</div>
                    </div>
                    <div className="bg-white/80 p-2 rounded-lg border border-rose-100">
                      <div className="text-slate-500 text-[11px]">Total Batches</div>
                      <div className="font-bold text-slate-700">{clearSummary?.totalBatches ?? 0}</div>
                    </div>
                  </div>
                </div>

                {/* Data Preserved Assurance Box */}
                <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-3.5 space-y-1.5 text-xs text-emerald-900">
                  <div className="font-bold text-[11px] uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Protected Data (Will NOT be deleted)</span>
                  </div>
                  <ul className="space-y-1 text-emerald-800 text-[11px] list-disc list-inside">
                    <li>
                      <strong>Master Candidate Profiles ({clearSummary?.preservedMasterCandidates ?? 0}):</strong> Person CRM identities &amp; contact info preserved for duplicate detection.
                    </li>
                    <li>
                      <strong>Job Requisitions:</strong> All baseline job slots ({clearSummary?.preservedJobSlots ?? (activeCompany === 'AaraTech' ? 21 : 10)} slots) remain active.
                    </li>
                    <li>
                      <strong>Screening Rules &amp; Config:</strong> 12 legal engine rules &amp; settings remain intact.
                    </li>
                    <li>
                      <strong>Digital Marketing Portal:</strong> Shared DM team, attendance, tasks, and reports untouched.
                    </li>
                    <li>
                      <strong>{activeCompany === 'AaraTech' ? 'ClinisolTech' : 'AaraTech'}:</strong> Other company's data remains 100% untouched.
                    </li>
                  </ul>
                </div>
              </>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsClearAllModalOpen(false)}
                disabled={isClearingAll}
                className="px-3.5 py-2 rounded-lg border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearAll}
                disabled={isClearingAll || loadingClearSummary}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50"
              >
                {isClearingAll ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Clearing {activeCompany} Applications...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm &amp; Clear All {activeCompany} Applications</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Notification Toast */}
      {copySuccessMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{copySuccessMessage}</span>
          </div>
          <span className="text-[11px] font-semibold text-emerald-600">Ready for Google Sheets (Ctrl+V)</span>
        </div>
      )}

      {/* STEP 1: Daily Recruitment Setup Bar */}
      <div className="card-premium p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                Step 1 of 8
              </span>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Daily Recruitment Setup &amp; Ingestion
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Select company workspace, application date, and relevant job slot(s) before file upload or direct paste.
            </p>
          </div>

          {/* Company Workspace Toggle */}
          {isDualCompany && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-1 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setActiveCompany('AaraTech')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition-all ${
                  activeCompany === 'AaraTech'
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>AaraTech (21 Jobs)</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveCompany('ClinisolTech')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs transition-all ${
                  activeCompany === 'ClinisolTech'
                    ? 'bg-white text-emerald-700 shadow-xs border border-slate-200 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>ClinisolTech (10 Jobs)</span>
              </button>
            </div>
          )}
        </div>

        {/* Step 1 Controls Grid: Date & Relevant Job Slot */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Application Date (Portal Ingestion Date) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Portal Ingestion Date (Processing Date)</span>
              </label>
              <span className="text-[10px] text-slate-400">Assigned to new imports</span>
            </div>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
              title="Select portal processing date to assign to this batch. Survives navigation and refresh."
            />
          </div>

          {/* Job Slot Selector */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                <span>Relevant Job Slot</span>
              </label>
              {selectedJobSlot !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => {
                    const currentJob = baselineJobs.find(j => j.jobId === selectedJobSlot);
                    if (currentJob) {
                      setEditingJobSlot({ jobId: currentJob.jobId, jobTitle: currentJob.jobTitle, newTitle: currentJob.jobTitle });
                    }
                  }}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                  title="Rename selected job slot"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Rename Slot</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={selectedJobSlot}
                onChange={(e) => setSelectedJobSlot(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
              >
                <option value="ALL">All Requisitions ({baselineJobs.length} active slots)</option>
                {baselineJobs.map((job) => (
                  <option key={job.jobId} value={job.jobId}>
                    [{job.jobId}] {job.jobTitle}
                  </option>
                ))}
              </select>
              {selectedJobSlot !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => {
                    const currentJob = baselineJobs.find(j => j.jobId === selectedJobSlot);
                    if (currentJob) {
                      setEditingJobSlot({ jobId: currentJob.jobId, jobTitle: currentJob.jobTitle, newTitle: currentJob.jobTitle });
                    }
                  }}
                  className="px-2.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 transition-colors"
                  title="Rename this slot"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Rename</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Import Method Selection Tabs (Two Clear Options) */}
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">
              Select Ingestion Method:
            </span>
            <span className="text-[11px] text-slate-400">
              Upload XLSX/CSV files or paste tabular records directly from Excel / Google Sheets
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setImportMethod('upload')}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                importMethod === 'upload'
                  ? 'border-blue-500 bg-blue-50/50 text-blue-900 shadow-2xs ring-1 ring-blue-500/20'
                  : 'border-slate-200 bg-white hover:bg-slate-50/70 text-slate-700'
              }`}
            >
              <div className={`p-2 rounded-lg ${importMethod === 'upload' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                <Upload className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold">1. Upload Excel / CSV</div>
                <div className="text-[11px] text-slate-500">Upload LinkedIn XLSX, XLS, CSV or PDF files</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setImportMethod('paste')}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                importMethod === 'paste'
                  ? 'border-blue-500 bg-blue-50/50 text-blue-900 shadow-2xs ring-1 ring-blue-500/20'
                  : 'border-slate-200 bg-white hover:bg-slate-50/70 text-slate-700'
              }`}
            >
              <div className={`p-2 rounded-lg ${importMethod === 'paste' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                <ClipboardList className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold">2. Paste Application List</div>
                <div className="text-[11px] text-slate-500">Copy rows directly from Excel or Google Sheets and paste with Ctrl+V</div>
              </div>
            </button>
          </div>

          {/* METHOD 1: Upload Excel / CSV */}
          {importMethod === 'upload' && (
            <div className="pt-2">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".xlsx,.xls,.csv,.pdf"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                  id="batch-file-input"
                />
                <label
                  htmlFor="batch-file-input"
                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer transition-all disabled:opacity-50 shadow-xs"
                >
                  {isUploading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Processing &amp; Screening...</span>
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Choose File(s) to Screen</span>
                    </>
                  )}
                </label>
                <span className="text-xs text-slate-500">
                  Select one or more LinkedIn exported spreadsheets (.xlsx, .csv).
                </span>
              </div>

              {uploadError && (
                <div className="mt-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{uploadError}</span>
                </div>
              )}
            </div>
          )}

          {/* METHOD 2: Paste Application List */}
          {importMethod === 'paste' && (
            <div className="pt-2 space-y-3">
              {/* Optional Batch Label */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Batch Name / Label (Optional)
                </label>
                <input
                  type="text"
                  value={pasteBatchLabel}
                  onChange={(e) => setPasteBatchLabel(e.target.value)}
                  placeholder={`Pasted Ingestion - ${selectedDate}`}
                  className="w-full max-w-md px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Instructions Callout */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg flex items-start gap-2.5 text-xs text-blue-900">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold">
                    Copy your application rows from Excel, then click here and press Ctrl+V.
                  </p>
                  <p className="text-[11px] text-blue-700">
                    Supports multi-row data copied from Excel or Google Sheets (tab-delimited or comma-delimited), with or without header row.
                  </p>
                </div>
              </div>

              {/* Comfortable Paste Textarea */}
              <div>
                <textarea
                  value={pastedText}
                  onChange={(e) => {
                    setPastedText(e.target.value);
                    if (pastePreview) setPastePreview(null);
                    if (pasteError) setPasteError(null);
                  }}
                  rows={6}
                  placeholder="Copy your application rows from Excel, then click here and press Ctrl+V.&#10;Example:&#10;Candidate Name&#9;Email&#9;Phone&#9;Role&#9;Green Card / US Citizen&#9;Visa Sponsorship&#10;John Doe&#9;johndoe@example.com&#9;555-0199&#9;Software Engineer&#9;Yes&#9;No"
                  className="w-full font-mono text-xs px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                />
              </div>

              {/* Action Buttons Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePreviewPastedData}
                    disabled={isAnalyzingPaste || !pastedText.trim()}
                    className="btn-secondary !text-xs !py-1.5 shadow-2xs disabled:opacity-50"
                  >
                    {isAnalyzingPaste ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#3659D9]" />
                        <span>Analyzing &amp; Mapping Columns...</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-[#3659D9]" />
                        <span>Preview Pasted Data</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleImportPastedData}
                    disabled={isImportingPaste || !pastePreview || pastePreview.validRows === 0}
                    className="btn-primary !text-xs !py-1.5 shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      !pastePreview
                        ? 'Please click "Preview Pasted Data" before importing'
                        : pastePreview.validRows === 0
                        ? 'Cannot import: no valid application rows found'
                        : 'Import and screen applications'
                    }
                  >
                    {isImportingPaste ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Processing Recruitment Pipeline...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Import Applications</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearPasteArea}
                    disabled={!pastedText && !pastePreview && !pasteError}
                    className="btn-tertiary !text-xs !py-1.5 shadow-2xs disabled:opacity-40"
                    title="Clears only this paste input box without affecting saved database records"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#8995A8]" />
                    <span>Clear Paste Area</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelPaste}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[#65738B] hover:text-[#18243A] text-xs font-medium transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {/* Paste Error / Validation Message */}
              {pasteError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">Validation or Parsing Issue:</p>
                    <p>{pasteError}</p>
                  </div>
                </div>
              )}

              {/* Paste Import Success Toast */}
              {pasteImportSummary && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center justify-between animate-in fade-in">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <div>
                      <span className="font-semibold">Import Complete: </span>
                      <span>
                        {pasteImportSummary.totalApplicants} application(s) processed ({pasteImportSummary.passed} Passed, {pasteImportSummary.manualReview} Manual Review, {pasteImportSummary.failed} Failed, {pasteImportSummary.errors} Errors).
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPasteImportSummary(null)}
                    className="text-emerald-700 hover:text-emerald-900 p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Preview Table & Metrics Box */}
              {pastePreview && (
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs space-y-0 mt-3">
                  {/* Preview Metrics Header */}
                  <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-800">Pasted Preview:</span>
                      <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 font-semibold text-[11px]">
                        Total: {pastePreview.totalRows}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold text-[11px]">
                        Valid: {pastePreview.validRows}
                      </span>
                      {pastePreview.invalidRows > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold text-[11px]">
                          Invalid: {pastePreview.invalidRows}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span>Header Row: {pastePreview.hasHeaders ? 'Detected' : 'Inferred / 8-Column'}</span>
                      <span>•</span>
                      <span>Mapped Fields: {Object.keys(pastePreview.mappedFields).length}</span>
                    </div>
                  </div>

                  {/* Preview Rows Table */}
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-[11px]">#</th>
                          <th className="px-3 py-2 text-[11px]">Applicant Name</th>
                          <th className="px-3 py-2 text-[11px]">Email</th>
                          <th className="px-3 py-2 text-[11px]">Phone</th>
                          <th className="px-3 py-2 text-[11px]">Job Role / Slot</th>
                          <th className="px-3 py-2 text-[11px]">GC / US-C</th>
                          <th className="px-3 py-2 text-[11px]">Sponsorship</th>
                          <th className="px-3 py-2 text-[11px]">Screening Preview</th>
                          <th className="px-3 py-2 text-[11px]">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pastePreview.rows.map((row) => (
                          <tr key={row.rowIndex} className={`hover:bg-slate-50/60 ${!row.isValid ? 'bg-rose-50/30' : ''}`}>
                            <td className="px-3 py-2 text-slate-400 font-mono text-[11px]">{row.rowIndex}</td>
                            <td className="px-3 py-2 font-medium text-slate-900">{row.fullName || <span className="text-rose-500 italic">Missing</span>}</td>
                            <td className="px-3 py-2 text-slate-600">{row.email || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{row.phone || '—'}</td>
                            <td className="px-3 py-2 text-slate-700">{row.jobTitle || row.jobId || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{row.greenCardAnswer || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{row.sponsorshipAnswer || '—'}</td>
                            <td className="px-3 py-2">
                              {row.screeningStatus === 'PASS' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  PASS
                                </span>
                              )}
                              {row.screeningStatus === 'FAIL' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                  FAIL
                                </span>
                              )}
                              {row.screeningStatus === 'MANUAL_REVIEW' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  REVIEW
                                </span>
                              )}
                              {!row.screeningStatus && <span className="text-slate-400">—</span>}
                            </td>
                            <td className="px-3 py-2">
                              {row.isValid ? (
                                <span className="text-[11px] text-emerald-600 font-medium">Valid</span>
                              ) : (
                                <span className="text-[11px] text-rose-600 font-medium" title={row.errors.join(', ')}>
                                  {row.errors[0] || 'Invalid'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
                    <span>
                      Review the parsed records above. Click <strong className="text-emerald-700">"Import Applications"</strong> to apply screening rules, check duplicates against Master CRM, and save into application history.
                    </span>
                    <button
                      type="button"
                      onClick={handleClearPasteArea}
                      className="text-slate-500 hover:text-slate-800 underline"
                    >
                      Clear &amp; Start Over
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* STEP 5 & BATCH CONTROLS: Working Batch Header & Tabs */}
      <div className="card-premium overflow-hidden">
        {/* Workspace Mode Switcher (Active Batch vs Permanent Application History) */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="bg-white border border-slate-200 p-0.5 rounded-lg flex items-center text-xs font-medium">
              <button
                type="button"
                onClick={() => setViewMode('working_batch')}
                className={`px-3 py-1 rounded transition-all ${
                  viewMode === 'working_batch'
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Daily Batch Workspace
              </button>
              <button
                type="button"
                onClick={() => setViewMode('permanent_history')}
                className={`px-3 py-1 rounded transition-all ${
                  viewMode === 'permanent_history'
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Permanent Application History
              </button>
            </div>

            {viewMode === 'working_batch' && batchHistory.length > 0 && (
              <select
                value={activeBatchId}
                onChange={(e) => setActiveBatchId(e.target.value)}
                className="text-xs py-1 px-2.5 bg-white border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none"
              >
                <option value="ALL">
                  All Uploaded Files ({batchHistory.length} active batches)
                </option>
                {batchHistory.map((b) => (
                  <option key={b.id} value={b.id}>
                    [{b.importCode}] {getBatchDisplayName(b)} ({b.totalApplicants} rows)
                  </option>
                ))}
              </select>
            )}

            {/* Explicit Portal Ingestion Date Filter Dropdown */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
              <span className="text-[11px] font-semibold text-slate-500 pl-2 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">Ingestion Date:</span>
              </span>
              <select
                value={resultsDate}
                onChange={(e) => {
                  setResultsDate(e.target.value);
                  setPage(1);
                }}
                className="text-xs py-1 px-2 bg-transparent border-0 text-slate-800 font-medium focus:outline-none cursor-pointer"
                title="Filter records and copy operations by portal ingestion date"
              >
                <option value="ALL">All Ingestion Dates</option>
                {availableIngestionDates.map((d) => (
                  <option key={d.date} value={d.date}>
                    {formatDayMonthYear(d.date)} ({d.count} records)
                  </option>
                ))}
              </select>
              {resultsDate !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => { setResultsDate('ALL'); setPage(1); }}
                  className="px-1.5 py-1 text-[11px] text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                  title="Show all dates"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Permanent History Date Range Filter */}
            {viewMode === 'permanent_history' && (
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs text-xs text-slate-600">
                <span className="text-[11px] font-semibold text-slate-500 pl-2">Range:</span>
                <input
                  type="date"
                  value={historyStartDate}
                  onChange={(e) => { setHistoryStartDate(e.target.value); setPage(1); }}
                  placeholder="From"
                  className="py-0.5 px-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 font-medium focus:outline-none"
                  title="History start date"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  value={historyEndDate}
                  onChange={(e) => { setHistoryEndDate(e.target.value); setPage(1); }}
                  placeholder="To"
                  className="py-0.5 px-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 font-medium focus:outline-none"
                  title="History end date"
                />
                {(historyStartDate || historyEndDate) && (
                  <button
                    type="button"
                    onClick={() => { setHistoryStartDate(''); setHistoryEndDate(''); setPage(1); }}
                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                    title="Clear date range"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* Active Date Scope Indicator Badge */}
            <div className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              <Calendar className="w-3 h-3 text-blue-600 shrink-0" />
              <span>
                {resultsDate === 'ALL'
                  ? (historyStartDate || historyEndDate
                      ? `Range: ${historyStartDate || '...'} to ${historyEndDate || '...'}`
                      : 'All Ingestion Dates')
                  : formatDayMonthYear(resultsDate)}
              </span>
              <span className="text-blue-500 font-normal">
                ({tabCounts.all} records)
              </span>
            </div>
          </div>

          {/* Batch Actions: Clear Current Batch & Clear All Applications */}
          <div className="flex items-center gap-2">
            {viewMode === 'working_batch' && activeBatchId && activeBatchId !== 'ALL' && (
              <button
                type="button"
                onClick={() => setIsClearBatchModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E0E6EF] hover:border-[#F8D8A8] text-[#A66B19] hover:bg-[#FEF6E9] bg-white text-xs font-semibold transition-all shadow-2xs cursor-pointer"
                title="Clears only this working batch from the active workspace without touching master database"
              >
                <Trash2 className="w-3.5 h-3.5 text-[#A66B19]" />
                <span>Clear Current Batch</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleOpenClearAllModal}
              className="btn-destructive !text-xs !py-1.5 shadow-2xs"
              title={`Permanently clear all applications for ${activeCompany} to start fresh`}
            >
              <Trash2 className="w-3.5 h-3.5 text-[#C44750]" />
              <span>Clear All Applications</span>
            </button>
          </div>
        </div>

        {/* Separate Passed, Failed, and Manual Review Tabs */}
        <div className="px-5 pt-3 border-b border-[#E0E6EF] flex flex-wrap items-center justify-between gap-3 bg-white">
          <div className="flex items-center gap-2 border-b border-transparent">
            {/* Passed Tab */}
            <button
              type="button"
              onClick={() => { setActiveTab('PASS'); setPage(1); }}
              className={`flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'PASS'
                  ? 'border-[#16836B] text-[#16836B] bg-[#E6F5F1]'
                  : 'border-transparent text-[#65738B] hover:text-[#18243A]'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-[#16836B]" />
              <span>Passed Results</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E6F5F1] text-[#16836B] border border-[#A3DCD0] font-bold">
                {tabCounts.pass}
              </span>
            </button>

            {/* Manual Review Tab */}
            <button
              type="button"
              onClick={() => { setActiveTab('MANUAL_REVIEW'); setPage(1); }}
              className={`flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'MANUAL_REVIEW'
                  ? 'border-[#A66B19] text-[#A66B19] bg-[#FEF6E9]'
                  : 'border-transparent text-[#65738B] hover:text-[#18243A]'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-[#A66B19]" />
              <span>Manual Review</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FEF6E9] text-[#A66B19] border border-[#F8D8A8] font-bold">
                {tabCounts.review}
              </span>
            </button>

            {/* Failed Tab */}
            <button
              type="button"
              onClick={() => { setActiveTab('FAIL'); setPage(1); }}
              className={`flex items-center gap-2 px-3.5 py-2.5 border-b-2 text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'FAIL'
                  ? 'border-[#C44750] text-[#C44750] bg-[#FDF0F1]'
                  : 'border-transparent text-[#65738B] hover:text-[#18243A]'
              }`}
            >
              <XCircle className="w-4 h-4 text-[#C44750]" />
              <span>Failed Requirements</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#FDF0F1] text-[#C44750] border border-[#F6C1C5] font-bold">
                {tabCounts.fail}
              </span>
            </button>

            {/* All Tab */}
            <button
              type="button"
              onClick={() => { setActiveTab('ALL'); setPage(1); }}
              className={`flex items-center gap-2 px-3 py-2.5 border-b-2 text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'ALL'
                  ? 'border-[#3659D9] text-[#3659D9] bg-[#E8EDFA] font-semibold'
                  : 'border-transparent text-[#65738B] hover:text-[#18243A]'
              }`}
            >
              <span>All Records</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#F1F4F9] text-[#65738B] border border-[#E0E6EF]">
                {tabCounts.all}
              </span>
            </button>
          </div>

          {/* Advanced Multi-Filters & Quick Search */}
          <div className="flex items-center flex-wrap gap-2 pb-2">
            {/* Reference Match Category Filter */}
            <select
              value={nameMatchFilter}
              onChange={(e) => { setNameMatchFilter(e.target.value); setPage(1); }}
              className="py-1.5 px-2.5 text-xs bg-[#F1F4F9] border border-[#E0E6EF] rounded-lg text-[#18243A] focus:outline-none focus:border-[#3659D9] font-medium cursor-pointer"
            >
              <option value="ALL">All Reference Matches</option>
              <option value="Strong Match">★ Strong Match (85%-100%)</option>
              <option value="Possible Match">⚡ Possible Match (35%-55%)</option>
              <option value="No Match">○ No Match (≤10%)</option>
            </select>

            {/* Normalized Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="py-1.5 px-2.5 text-xs bg-[#F1F4F9] border border-[#E0E6EF] rounded-lg text-[#18243A] focus:outline-none focus:border-[#3659D9] font-medium cursor-pointer"
            >
              <option value="ALL">All Roles</option>
              <option value="DA">DA (Data Analyst)</option>
              <option value="DE">DE (Data Engineer)</option>
              <option value="BA">BA (Business Analyst)</option>
              <option value="DS">DS (Data Scientist)</option>
              <option value="AWS">AWS (Cloud / DevOps)</option>
              <option value="Cybersecurity">Cybersecurity</option>
              <option value="QA">QA (Quality Assurance)</option>
            </select>

            {/* Gender Filter */}
            <select
              value={genderFilter}
              onChange={(e) => { setGenderFilter(e.target.value); setPage(1); }}
              className="py-1.5 px-2.5 text-xs bg-[#F1F4F9] border border-[#E0E6EF] rounded-lg text-[#18243A] focus:outline-none focus:border-[#3659D9] font-medium cursor-pointer"
            >
              <option value="ALL">All Genders</option>
              <option value="MALE">Male ♂</option>
              <option value="FEMALE">Female ♀</option>
              <option value="UNSPECIFIED">Unspecified ?</option>
            </select>

            {/* Quick Search inside Batch */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-[#8995A8] absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                type="text"
                placeholder="Search candidate name, email..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F1F4F9] border border-[#E0E6EF] rounded-lg text-[#18243A] placeholder-[#8995A8] focus:outline-none focus:border-[#3659D9] focus:bg-white"
              />
            </div>
          </div>
        </div>

        {/* STEP 7: Copy Passed Applications & Full-Window Zoom Bar */}
        <div className="px-5 py-2.5 bg-[#F7F9FC] border-b border-[#E0E6EF] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <span className="text-[#65738B] font-medium">
              Selected: <strong className="text-[#18243A]">{selectedApplicantIds.length}</strong> candidate(s)
            </span>
            {selectedApplicantIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedApplicantIds([])}
                className="text-xs text-[#3659D9] hover:underline font-semibold cursor-pointer"
              >
                Clear selection
              </button>
            )}

            {/* Cross-page selection button */}
            {selectedApplicantIds.length > 0 && selectedApplicantIds.length < totalCount && (
              <button
                type="button"
                onClick={handleSelectAllAcrossPages}
                className="text-xs text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors"
                title="Select all matching candidates across all pages"
              >
                Select all {totalCount} matching candidates across all pages
              </button>
            )}
            {selectedApplicantIds.length >= totalCount && totalCount > applicants.length && (
              <span className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                ✓ All {totalCount} candidates across all pages selected
              </span>
            )}

            {/* Full-Window Zoom Grid Controls (60% to 125%, 85% default Fit Table) */}
            <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-[#E0E6EF] shadow-2xs ml-2">
              <span className="text-[11px] font-semibold text-slate-500 pr-1">Zoom:</span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(60, z - 5))}
                className="p-1 text-slate-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                title="Zoom Out (-5%)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono font-bold text-slate-800 min-w-[34px] text-center">
                {zoomLevel}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(125, z + 5))}
                className="p-1 text-slate-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                title="Zoom In (+5%)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(85)}
                className={`px-2 py-0.5 text-[10px] rounded font-semibold transition-colors cursor-pointer ${
                  zoomLevel === 85
                    ? 'bg-[#3659D9] text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
                title="Fit full table on screen without horizontal scrolling (85% zoom)"
              >
                Fit Table
              </button>
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                className={`px-2 py-0.5 text-[10px] rounded font-semibold transition-colors cursor-pointer ${
                  zoomLevel === 100
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
                title="Reset to 100% zoom"
              >
                100%
              </button>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Phase 2: Explicit Action to Transfer Approved Passed Applications to Master Candidate Database (Prompt Section 5 Step 3) */}
            <button
              type="button"
              onClick={handleSendPassedToMaster}
              disabled={isTransferring}
              className="bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold !text-xs !py-1.5 px-3 rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Transfer all final approved PASSED applications in this batch into the permanent Master Candidate Database (deduplicates against existing candidates)"
            >
              {isTransferring ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Database className="w-3.5 h-3.5" />
              )}
              <span>
                {isTransferring
                  ? 'Transferring...'
                  : selectedApplicantIds.length > 0
                  ? `Send Selected Passed (${selectedApplicantIds.length}) to Master DB`
                  : 'Send Passed Applications to Master DB'}
              </span>
            </button>

            {/* Primary Action: Copy for Google Sheets (Verification & Match TSV - Section 6.3 8-Column Format) */}
            <button
              type="button"
              onClick={() => handleCopyVerificationTsv(false)}
              className="btn-primary !text-xs !py-1.5 shadow-xs flex items-center gap-1.5"
              title="Copy 8 clean verification columns (Candidate Name, Role, Email, Phone, Gender, Status, Match Score, Matched Reference) ready for Google Sheets (Ctrl+V)"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>
                {selectedApplicantIds.length > 0
                  ? `Copy Selected (${selectedApplicantIds.length}) to Sheets`
                  : 'Copy for Google Sheets (Verification TSV)'}
              </span>
            </button>

            {/* Secondary Action: Copy Tracker Format */}
            <button
              type="button"
              onClick={() => handleCopyPassedApplications(false)}
              className="btn-secondary !text-xs !py-1.5 shadow-2xs"
              title="Copy standard recruiter tracker format (Date, Name, Contact, Email, Role, GC, H1B, LinkedIn)"
            >
              <span>Copy Tracker TSV</span>
            </button>

            {/* Optional: With Headers Toggle */}
            <button
              type="button"
              onClick={() => handleCopyVerificationTsv(true)}
              className="btn-tertiary !text-xs !py-1.5"
              title="Copy with header row"
            >
              <span>With Headers</span>
            </button>
          </div>
        </div>

        {/* Applicants Data Table with Zoom Scaling */}
        <div className="overflow-x-auto" style={{ zoom: `${zoomLevel}%` }}>
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Loading applications...</span>
            </div>
          ) : applicants.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No applications found for the selected tab and filters.
            </div>
          ) : (
            <table className="w-full text-xs text-left table-premium">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                  <th className="py-2.5 px-3 w-8">
                    <input
                      type="checkbox"
                      checked={isAllCurrentPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isSomeCurrentPageSelected;
                      }}
                      onChange={handleSelectAllCurrentPage}
                      className="rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                      title={isAllCurrentPageSelected ? 'Deselect all candidates on current page' : 'Select all candidates on current page'}
                    />
                  </th>
                  <th className="py-2.5 px-3 whitespace-nowrap" title="Portal Ingestion Date (batch processing date)">Ingestion Date</th>
                  <th className="py-2.5 px-3 min-w-[180px]">Candidate Name</th>
                  <th className="py-2.5 px-3 min-w-[120px]">Job Role</th>
                  <th className="py-2.5 px-3 min-w-[160px]">Contact</th>
                  <th className="py-2.5 px-3 text-center min-w-[90px]">Gender</th>
                  <th className="py-2.5 px-3 min-w-[130px]">Regional Origin</th>
                  <th className="py-2.5 px-3 min-w-[150px]">Reference Match</th>
                  <th className="py-2.5 px-3 text-center">GC / US-C</th>
                  <th className="py-2.5 px-3 text-center">Sponsorship</th>
                  <th className="py-2.5 px-3 text-center">Result</th>
                  <th className="py-2.5 px-3 text-center whitespace-nowrap min-w-[150px]">1-Click Override</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applicants.map((a) => {
                  const isChecked = selectedApplicantIds.includes(a.id);
                  const normRole = a.normalizedRole || normalizeJobRole(a.jobTitle, [a.currentTitle, a.headline, a.sourceFile].filter(Boolean).join(' '));
                  return (
                    <tr
                      key={a.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isChecked ? 'bg-blue-50/30' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectOne(a.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-0"
                        />
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">
                          {a.applicationDate || a.createdAt?.split('T')[0] || 'N/A'}
                        </div>
                        {a.dateApplied && a.dateApplied !== a.applicationDate && (
                          <div className="text-[10px] text-slate-400 font-normal" title="Source application date from imported spreadsheet">
                            Src: {a.dateApplied}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <span>{a.fullName}</span>
                          {a.profileUrl && (
                            <a
                              href={a.profileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-slate-400 hover:text-blue-600 transition-colors"
                              title="Open LinkedIn Profile"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          {a.isDuplicate && (
                            <span
                              className="badge-dup"
                              title={`Duplicate detected: ${a.duplicateReason || 'Already in master DB'}`}
                            >
                              DUP
                            </span>
                          )}
                          {a.transferStatus === 'Transferred' && (
                            <span
                              className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200"
                              title={`Transferred to Master Candidate Database${a.masterPersonId ? ` (${a.masterPersonId})` : ''}`}
                            >
                              In Master DB
                            </span>
                          )}
                        </div>
                        {a.headline ? (
                          <div className="text-[11px] text-slate-500 truncate max-w-[220px]" title={a.headline}>
                            {a.headline}
                          </div>
                        ) : a.currentTitle ? (
                          <div className="text-[11px] text-slate-500 truncate max-w-[220px]">
                            {a.currentTitle} {a.currentCompany ? `@ ${a.currentCompany}` : ''}
                          </div>
                        ) : null}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#E8EDFA] text-[#3659D9] border border-[#CCD7F5]">
                          {normRole}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate block max-w-[150px] font-mono mt-0.5" title={a.jobTitle}>
                          {a.jobTitle}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        <div className="truncate max-w-[160px] text-slate-900" title={a.email || 'No email'}>
                          {a.email || 'No email'}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">
                          {a.phone || 'No phone'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleQuickGenderToggle(a.id, a.gender)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition-colors ${
                            a.gender === 'MALE'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                              : a.gender === 'FEMALE'
                              ? 'bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100'
                              : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                          }`}
                          title="Click to toggle Gender (Male ♂ -> Female ♀ -> Unspecified ?)"
                        >
                          {a.gender === 'MALE' ? 'Male ♂' : a.gender === 'FEMALE' ? 'Female ♀' : 'Unspec ?'}
                        </button>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 max-w-[130px] truncate"
                          title={`Origin: ${a.originCountry || 'South Asia'} (${a.originRegion || 'Unspecified'})\nReason: ${a.originMatchReason || 'Linguistic surname match'}`}
                        >
                          {a.originCountry ? a.originCountry : 'South Asian'}
                          {a.originRegion && (a.originRegion as any) !== 'UNSPECIFIED' && a.originRegion !== 'SOUTH_ASIAN' && (
                            <span className="text-[10px] text-slate-500 ml-1">({String(a.originRegion).replace('India - ', '')})</span>
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        {a.nameMatchCategory === 'Strong Match' ? (
                          <div className="flex flex-col">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 w-fit"
                              title={`Pattern: ${a.nameMatchedPattern || 'Exact reference match'}\nMatched Reference: ${a.nameMatchedReference || 'N/A'}\nScore: ${Math.round((a.nameMatchScore || 0) * 100)}%`}
                            >
                              <Sparkles className="w-3 h-3 text-emerald-600" />
                              Strong ({Math.round((a.nameMatchScore || 0) * 100)}%)
                            </span>
                            {a.nameMatchedReference && (
                              <span className="text-[9px] text-slate-500 truncate max-w-[130px]" title={a.nameMatchedReference}>
                                ref: {a.nameMatchedReference}
                              </span>
                            )}
                          </div>
                        ) : a.nameMatchCategory === 'Possible Match' ? (
                          <div className="flex flex-col">
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 w-fit"
                              title={`Pattern: ${a.nameMatchedPattern || 'Token/Surname match'}\nMatched Reference: ${a.nameMatchedReference || 'N/A'}\nScore: ${Math.round((a.nameMatchScore || 0) * 100)}%`}
                            >
                              Possible ({Math.round((a.nameMatchScore || 0) * 100)}%)
                            </span>
                            {a.nameMatchedReference && (
                              <span className="text-[9px] text-slate-500 truncate max-w-[130px]" title={a.nameMatchedReference}>
                                ref: {a.nameMatchedReference}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-200 w-fit"
                            title={a.nameMatchedPattern || 'No reference match'}
                          >
                            No Match ({Math.round((a.nameMatchScore || 0) * 100)}%)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded inline-block ${
                            a.greenCardCitizenAnswer === 'YES'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : a.greenCardCitizenAnswer === 'NO'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                          title={
                            a.greenCardCitizenAnswer
                              ? `Green Card / US Citizen: ${a.greenCardCitizenAnswer}`
                              : a.usWorkAuthAnswer === 'YES'
                              ? 'Green Card question was not asked on LinkedIn (Candidate answered US Work Authorized: Yes)'
                              : 'Question was not asked on LinkedIn for this candidate'
                          }
                        >
                          {a.greenCardCitizenAnswer || 'Not Asked'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded inline-block ${
                            a.sponsorshipAnswer === 'NO'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : a.sponsorshipAnswer === 'YES'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                          title={
                            a.sponsorshipAnswer
                              ? `Future Visa Sponsorship: ${a.sponsorshipAnswer}`
                              : 'Sponsorship question was not asked on LinkedIn for this candidate'
                          }
                        >
                          {a.sponsorshipAnswer || 'Not Asked'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                            a.effectiveResult === 'PASS'
                              ? 'badge-pass'
                              : a.effectiveResult === 'FAIL'
                              ? 'badge-fail'
                              : 'badge-review'
                          }`}
                        >
                          {a.effectiveResult}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleQuickOverride(a.id, 'PASS')}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                              a.effectiveResult === 'PASS'
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            }`}
                            title="1-Click Override to PASS"
                          >
                            + PASS
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickOverride(a.id, 'MANUAL_REVIEW')}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                              a.effectiveResult === 'MANUAL_REVIEW'
                                ? 'bg-amber-500 text-white shadow-2xs'
                                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                            }`}
                            title="1-Click Route to Manual Review"
                          >
                            Review
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickOverride(a.id, 'FAIL')}
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${
                              a.effectiveResult === 'FAIL'
                                ? 'bg-rose-600 text-white shadow-2xs'
                                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                            }`}
                            title="1-Click Set Status: FAIL"
                          >
                            Fail
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap space-x-1">
                        <button
                          type="button"
                          onClick={() => handleCopySingleRow(a)}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[11px] transition-colors cursor-pointer"
                          title="Copy Row to Clipboard (Google Sheets TSV)"
                        >
                          <Copy className="w-3.5 h-3.5 inline mr-1" />
                          <span>Copy</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailApplicant(a)}
                          className="px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium text-[11px] transition-colors cursor-pointer"
                          title="View Full Profile Details"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Bar */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <strong>{(page - 1) * pageSize + (applicants.length > 0 ? 1 : 0)}</strong> to{' '}
            <strong>{Math.min(page * pageSize, totalCount)}</strong> of <strong>{totalCount}</strong> records
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded-md font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.max(1, Math.ceil(totalCount / pageSize))}
            </span>
            <button
              type="button"
              disabled={page >= Math.ceil(totalCount / pageSize)}
              onClick={() => setPage(p => p + 1)}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded-md font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* Floating Batch Operations Bar (Bulk status, bulk gender, bulk export) */}
      {selectedApplicantIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#18243A] text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2 pr-3 border-r border-slate-700 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span>{selectedApplicantIds.length} candidate(s) selected</span>
          </div>

          {/* Bulk Status Actions */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400 mr-1">Status:</span>
            <button
              type="button"
              onClick={() => handleBatchStatus('PASS')}
              disabled={isBatchActionInProgress}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
            >
              + Mark PASS
            </button>
            <button
              type="button"
              onClick={() => handleBatchStatus('MANUAL_REVIEW')}
              disabled={isBatchActionInProgress}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-900 transition-colors cursor-pointer"
            >
              Review
            </button>
            <button
              type="button"
              onClick={() => handleBatchStatus('FAIL')}
              disabled={isBatchActionInProgress}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer"
            >
              Fail
            </button>
          </div>

          {/* Bulk Gender Actions */}
          <div className="flex items-center gap-1.5 pl-3 border-l border-slate-700">
            <span className="text-[11px] text-slate-400 mr-1">Gender:</span>
            <button
              type="button"
              onClick={() => handleBatchGender('MALE')}
              disabled={isBatchActionInProgress}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors cursor-pointer"
            >
              Male ♂
            </button>
            <button
              type="button"
              onClick={() => handleBatchGender('FEMALE')}
              disabled={isBatchActionInProgress}
              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-pink-600 hover:bg-pink-500 text-white transition-colors cursor-pointer"
            >
              Female ♀
            </button>
          </div>

          {/* Bulk Copy */}
          <div className="flex items-center gap-2 pl-3 border-l border-slate-700">
            <button
              type="button"
              onClick={() => handleCopyVerificationTsv(false)}
              className="px-3 py-1 text-xs font-bold rounded-lg bg-[#3659D9] hover:bg-[#2b48b5] text-white flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy to Sheets</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedApplicantIds([])}
              className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
              title="Deselect All"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Edit Job Slot Modal */}
      {editingJobSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <Briefcase className="w-5 h-5 text-blue-600" />
                <span>Rename Job Slot [{editingJobSlot.jobId}]</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingJobSlot(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Requisition Code
                </label>
                <div className="px-3 py-2 bg-slate-100 rounded-lg text-xs font-mono font-bold text-slate-700 border border-slate-200">
                  {editingJobSlot.jobId} ({activeCompany})
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Job Slot Title / Requisition Name
                </label>
                <input
                  type="text"
                  value={editingJobSlot.newTitle}
                  onChange={(e) => setEditingJobSlot({ ...editingJobSlot, newTitle: e.target.value })}
                  placeholder="e.g. Clinical Data Manager, SAS Programmer"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium"
                  autoFocus
                />
              </div>

              <p className="text-[11px] text-slate-500 leading-relaxed bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
                Updating this slot title will immediately update the requisition name across the workspace and synchronize all associated candidate applications in SQLite.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingJobSlot(null)}
                disabled={isSavingJobSlot}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveJobSlotRename}
                disabled={isSavingJobSlot || !editingJobSlot.newTitle.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isSavingJobSlot ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save New Title</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2: Transfer Passed Applications Result Modal */}
      {transferModalSummary.open && transferModalSummary.result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
                <Database className="w-5 h-5 text-emerald-600" />
                <span>Passed Applications Transfer Completed</span>
                <span className="text-xs px-2 py-0.5 rounded font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  {activeCompany}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTransferModalSummary({ open: false })}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              {transferModalSummary.result.message}
            </p>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                <div className="text-[10px] font-semibold text-slate-500 uppercase">Evaluated</div>
                <div className="text-xl font-bold text-slate-800 mt-0.5">
                  {transferModalSummary.result.totalEligiblePassed}
                </div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
                <div className="text-[10px] font-semibold text-emerald-700 uppercase">Transferred</div>
                <div className="text-xl font-bold text-emerald-700 mt-0.5">
                  {transferModalSummary.result.transferredCount}
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                <div className="text-[10px] font-semibold text-blue-700 uppercase">New Candidates</div>
                <div className="text-xl font-bold text-blue-700 mt-0.5">
                  {transferModalSummary.result.newCandidatesCount}
                </div>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
                <div className="text-[10px] font-semibold text-purple-700 uppercase">Repeat Apps</div>
                <div className="text-xl font-bold text-purple-700 mt-0.5">
                  {Math.max(0, transferModalSummary.result.newApplicationsCount - transferModalSummary.result.newCandidatesCount)}
                </div>
              </div>
            </div>

            {/* Duplicates and Possible Matches Notice */}
            {(transferModalSummary.result.skippedDuplicatesCount > 0 || transferModalSummary.result.possibleMatchesCount > 0) && (
              <div className="flex items-center justify-between text-xs bg-amber-50 text-amber-800 border border-amber-200 p-2.5 rounded-lg">
                <span>
                  🛡️ <strong>Duplicate Intelligence:</strong> {transferModalSummary.result.skippedDuplicatesCount} identical application occurrence(s) skipped to prevent accidental reimports.
                </span>
                {transferModalSummary.result.possibleMatchesCount > 0 && (
                  <span className="font-semibold text-purple-700">
                    {transferModalSummary.result.possibleMatchesCount} possible match(es) queued for human review.
                  </span>
                )}
              </div>
            )}

            {/* Candidate Breakdown List */}
            <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg min-h-[140px] max-h-[260px]">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-3">Candidate</th>
                    <th className="py-2 px-3">Role / Technology</th>
                    <th className="py-2 px-3">Person ID</th>
                    <th className="py-2 px-3">Classification</th>
                    <th className="py-2 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transferModalSummary.result.transfers.map((t, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-semibold text-slate-800">{t.applicantName}</td>
                      <td className="py-2 px-3 text-slate-600">{t.jobTitle}</td>
                      <td className="py-2 px-3 font-mono font-bold text-blue-600">{t.personId || '-'}</td>
                      <td className="py-2 px-3 text-[11px] text-slate-500">{t.classification}</td>
                      <td className="py-2 px-3 text-right">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.status === 'SUCCESS'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}>
                          {t.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-[11px] text-slate-400">
                Company Isolation Active: Transfers strictly committed to {activeCompany} master database.
              </span>
              <button
                type="button"
                onClick={() => setTransferModalSummary({ open: false })}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg cursor-pointer transition-colors"
              >
                Close & Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
