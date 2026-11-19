import { Applicant, AuditLogEntry, DashboardStats, ImportRecord, PaginatedResult, PaginationParams, Recruiter, ScreeningRule } from '../types';
import { Person } from '../types/masterDatabase';

// Optional Remote Backend Base URL for split deployments (e.g. Vercel frontend + Render/Railway backend)
const API_BASE = ((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');
if (typeof window !== 'undefined' && API_BASE) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
    if (typeof input === 'string' && input.startsWith('/api')) {
      return originalFetch(`${API_BASE}${input}`, init);
    }
    return originalFetch(input, init);
  };
}

export const api = {
  // 0. Authoritative Database Health Probe
  getDatabaseHealth: async (company: string = 'ClinisolTech') => {
    const res = await fetch(`/api/health?company=${company}`, {
      headers: { 'x-company': company },
    });
    if (!res.ok) throw new Error('Database offline or unreachable');
    return res.json() as Promise<{
      status: 'ONLINE' | 'OFFLINE';
      company: string;
      connected: boolean;
      dbType: string;
      latencyMs: number;
      applicantCount: number;
      masterPeopleCount: number;
      masterAppCount: number;
      importCount: number;
      lastSuccessfulCheck: string;
      lastSuccessfulRead: string;
      lastSuccessfulWrite: string;
      syncStatus: string;
    }>;
  },

  // 1. Pre-validate files before processing
  validateFiles: async (files: File[]) => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));

    const res = await fetch('/api/validate-files', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Validation failed' }));
      throw new Error(err.error || 'Failed to validate files');
    }
    return res.json() as Promise<{
      files: Array<{
        filename: string;
        originalName: string;
        tempPath: string;
        fileSize: number;
        isValid: boolean;
        rowCount: number;
        detectedJobTitle: string;
        detectedJobId: string;
        hasScreeningColumn: boolean;
        status: 'READY' | 'ERROR';
        error?: string;
        duplicateWarning?: {
          isDuplicate: boolean;
          previousImportId?: string;
          previousUploadedAt?: string;
        };
      }>;
    }>;
  },

  // 2. Process batch of files (1 to 31+)
  processFiles: async (
    files: File[],
    batchName?: string,
    uploadedBy = 'Recruiter Admin',
    company = 'AaraTech',
    applicationDate?: string,
    jobSlots?: string[]
  ) => {
    const formData = new FormData();
    files.forEach(f => formData.append('files', f));
    formData.append('uploadedBy', uploadedBy);
    formData.append('company', company);
    if (batchName) formData.append('batchName', batchName);
    if (applicationDate) formData.append('applicationDate', applicationDate);
    if (jobSlots && jobSlots.length > 0) formData.append('jobSlots', JSON.stringify(jobSlots));

    const res = await fetch('/api/process-files', {
      method: 'POST',
      headers: {
        'x-company': company,
      },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Processing failed' }));
      throw new Error(err.error || 'Failed to process files');
    }
    return res.json() as Promise<{
      success: boolean;
      importRecord: ImportRecord;
      summary: {
        importCode: string;
        batchName?: string;
        filesProcessed: number;
        totalApplicants: number;
        passed: number;
        failed: number;
        manualReview: number;
        errors: number;
      };
    }>;
  },

  // 2B. Preview Pasted Tabular Data
  previewPastedData: async (params: {
    text: string;
    company: string;
    jobId?: string;
    jobTitle?: string;
  }) => {
    const res = await fetch('/api/preview-pasted-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-company': params.company,
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to preview pasted data' }));
      throw new Error(err.error || 'Failed to preview pasted data');
    }
    return res.json() as Promise<{
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
    }>;
  },

  // 2C. Process Pasted Tabular Data through Recruitment Pipeline
  processPastedData: async (
    paramsOrText:
      | string
      | {
          text: string;
          label?: string;
          uploadedBy?: string;
          company?: string;
          applicationDate?: string;
          jobSlots?: string[];
          defaultJobId?: string;
          defaultJobTitle?: string;
        },
    label?: string,
    uploadedBy = 'Recruiter Admin',
    company = 'AaraTech'
  ) => {
    const payload =
      typeof paramsOrText === 'string'
        ? { text: paramsOrText, label, uploadedBy, company }
        : {
            text: paramsOrText.text,
            label: paramsOrText.label,
            uploadedBy: paramsOrText.uploadedBy || 'Recruiter Admin',
            company: paramsOrText.company || 'AaraTech',
            applicationDate: paramsOrText.applicationDate,
            jobSlots: paramsOrText.jobSlots,
            defaultJobId: paramsOrText.defaultJobId,
            defaultJobTitle: paramsOrText.defaultJobTitle,
          };

    const res = await fetch('/api/process-pasted-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-company': payload.company || 'AaraTech',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Processing pasted data failed' }));
      throw new Error(err.error || 'Failed to process pasted data');
    }
    return res.json() as Promise<{
      success: boolean;
      importRecord: ImportRecord;
      summary: {
        importCode: string;
        batchName?: string;
        filesProcessed: number;
        totalApplicants: number;
        passed: number;
        failed: number;
        manualReview: number;
        errors: number;
      };
    }>;
  },

  // 3. Dashboard statistics (scoped to company)
  getDashboardStats: async (company?: string) => {
    const query = new URLSearchParams();
    if (company) query.set('company', company);
    const res = await fetch(`/api/dashboard?${query.toString()}`, {
      headers: company ? { 'x-company': company } : {},
    });
    if (!res.ok) throw new Error('Failed to load dashboard stats');
    return res.json() as Promise<DashboardStats>;
  },

  // 4. Paginated & Filtered Applicants
  getApplicants: async (params: PaginationParams) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', String(params.page));
    if (params.pageSize) query.set('pageSize', String(params.pageSize));
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'ALL') query.set('status', params.status);
    if (params.gender && params.gender !== 'ALL') query.set('gender', params.gender);
    if (params.origin && params.origin !== 'ALL') query.set('origin', params.origin);
    if (params.jobId) query.set('jobId', params.jobId);
    if (params.jobTitle) query.set('jobTitle', params.jobTitle);
    if (params.company) query.set('company', params.company);
    if (params.batchId) query.set('batchId', params.batchId);
    if (params.viewMode) query.set('viewMode', params.viewMode);
    if (params.applicationDate) query.set('applicationDate', params.applicationDate);
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    if (params.nameMatchCategory && params.nameMatchCategory !== 'ALL') query.set('nameMatchCategory', params.nameMatchCategory);
    if (params.normalizedRole && params.normalizedRole !== 'ALL') query.set('normalizedRole', params.normalizedRole);
    if (params.isDuplicate !== undefined) query.set('isDuplicate', String(params.isDuplicate));
    if (params.assignedRecruiter) query.set('assignedRecruiter', params.assignedRecruiter);
    if (params.stage) query.set('stage', params.stage);
    if (params.location) query.set('location', params.location);
    if (params.hasEmail) query.set('hasEmail', 'true');
    if (params.hasPhone) query.set('hasPhone', 'true');
    if (params.hasLinkedIn) query.set('hasLinkedIn', 'true');
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);

    const headers: Record<string, string> = {};
    if (params.company) headers['x-company'] = params.company;

    const res = await fetch(`/api/applicants?${query.toString()}`, { headers });
    if (!res.ok) throw new Error('Failed to load applicants');
    return res.json() as Promise<PaginatedResult<Applicant>>;
  },

  // 4B. Get all applicant IDs matching current filters (across all pages)
  getAllApplicantIds: async (params: Partial<PaginationParams>) => {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'ALL') query.set('status', params.status);
    if (params.gender && params.gender !== 'ALL') query.set('gender', params.gender);
    if (params.origin && params.origin !== 'ALL') query.set('origin', params.origin);
    if (params.nameMatchCategory && params.nameMatchCategory !== 'ALL') query.set('nameMatchCategory', params.nameMatchCategory);
    if (params.normalizedRole && params.normalizedRole !== 'ALL') query.set('normalizedRole', params.normalizedRole);
    if (params.jobId) query.set('jobId', params.jobId);
    if (params.jobTitle) query.set('jobTitle', params.jobTitle);
    if (params.company) query.set('company', params.company);
    if (params.batchId) query.set('batchId', params.batchId);
    if (params.viewMode) query.set('viewMode', params.viewMode);
    if (params.applicationDate) query.set('applicationDate', params.applicationDate);
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    if (params.stage) query.set('stage', params.stage);
    if (params.location) query.set('location', params.location);
    if (params.hasEmail) query.set('hasEmail', 'true');
    if (params.hasPhone) query.set('hasPhone', 'true');
    if (params.hasLinkedIn) query.set('hasLinkedIn', 'true');
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);

    const res = await fetch(`/api/applicants/all-ids?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to load applicant IDs');
    return res.json() as Promise<{ ids: string[]; total: number }>;
  },

  // 4C. Tab Badge Counts (Exact breakdown across PASS, MANUAL_REVIEW, FAIL, ALL for current scope)
  getApplicantTabCounts: async (params: Partial<PaginationParams>) => {
    const query = new URLSearchParams();
    if (params.company) query.set('company', params.company);
    if (params.batchId) query.set('batchId', params.batchId);
    if (params.viewMode) query.set('viewMode', params.viewMode);
    if (params.applicationDate) query.set('applicationDate', params.applicationDate);
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    if (params.jobId) query.set('jobId', params.jobId);
    if (params.search) query.set('search', params.search);
    if (params.gender && params.gender !== 'ALL') query.set('gender', params.gender);
    if (params.nameMatchCategory && params.nameMatchCategory !== 'ALL') query.set('nameMatchCategory', params.nameMatchCategory);
    if (params.normalizedRole && params.normalizedRole !== 'ALL') query.set('normalizedRole', params.normalizedRole);
    if (params.isDuplicate !== undefined) query.set('isDuplicate', String(params.isDuplicate));

    const headers: Record<string, string> = {};
    if (params.company) headers['x-company'] = params.company;

    const res = await fetch(`/api/applicants/tab-counts?${query.toString()}`, { headers });
    if (!res.ok) throw new Error('Failed to load tab counts');
    return res.json() as Promise<{ pass: number; allPassed: number; fail: number; review: number; duplicate: number; all: number; uniquePassed: number }>;
  },

  // 4D. Distinct Portal Ingestion Dates for Workspace
  getIngestionDates: async (company: string) => {
    const query = new URLSearchParams({ company });
    const res = await fetch(`/api/ingestion-dates?${query.toString()}`, {
      headers: { 'x-company': company },
    });
    if (!res.ok) throw new Error('Failed to load ingestion dates');
    return res.json() as Promise<{ dates: Array<{ date: string; count: number }> }>;
  },

  // 5. Single Applicant Details
  getApplicant: async (id: string) => {
    const res = await fetch(`/api/applicants/${id}`);
    if (!res.ok) throw new Error('Applicant not found');
    return res.json() as Promise<Applicant>;
  },

  // 6. Manual Review Override (Reason is optional)
  overrideApplicant: async (id: string, newStatus: 'PASS' | 'FAIL' | 'MANUAL_REVIEW', reason?: string, user = 'Recruiter Admin') => {
    const res = await fetch(`/api/applicants/${id}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newStatus, reason: reason || '', user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Override failed' }));
      throw new Error(err.error || 'Failed to override status');
    }
    return res.json() as Promise<{ success: boolean; applicant: Applicant }>;
  },

  // 6A. Batch Status Override (Bulk Add to PASS / Bulk Remove from PASS)
  batchOverrideApplicants: async (
    ids: string[],
    newStatus: 'PASS' | 'FAIL' | 'MANUAL_REVIEW',
    reason?: string,
    user = 'Recruiter Admin'
  ) => {
    const res = await fetch(`/api/applicants/batch-override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, newStatus, reason: reason || '', user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Batch override failed' }));
      throw new Error(err.error || 'Failed to batch override status');
    }
    return res.json() as Promise<{ success: boolean; count: number; message: string }>;
  },

  // 6B. Delete Applicant
  deleteApplicant: async (id: string) => {
    const res = await fetch(`/api/applicants/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Delete failed' }));
      throw new Error(err.error || 'Failed to delete applicant');
    }
    return res.json() as Promise<{ success: boolean; message: string }>;
  },

  // 6B. Update Applicant Gender (User Requested Feature)
  updateApplicantGender: async (id: string, gender: 'MALE' | 'FEMALE' | 'UNSPECIFIED', user = 'Recruiter Admin') => {
    const res = await fetch(`/api/applicants/${id}/gender`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gender, user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Update failed' }));
      throw new Error(err.error || 'Failed to update gender');
    }
    return res.json() as Promise<{ success: boolean; applicant: Applicant }>;
  },

  // 6C. Batch Update Gender (User Requested Feature: "also put here gnder chnage ,we will slect all")
  batchUpdateGender: async (ids: string[], gender: 'MALE' | 'FEMALE' | 'UNSPECIFIED', user = 'Recruiter Admin') => {
    const res = await fetch(`/api/applicants/batch-gender`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, gender, user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Batch gender update failed' }));
      throw new Error(err.error || 'Failed to update gender for selected candidates');
    }
    return res.json() as Promise<{ success: boolean; count: number; message: string }>;
  },

  // 6D. Deduplicate Applicants (User Requested Feature: "only one unique record should be there")
  deduplicateApplicants: async (scope: 'PASS' | 'ALL' = 'ALL') => {
    const res = await fetch(`/api/applicants/deduplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Deduplication failed' }));
      throw new Error(err.error || 'Failed to deduplicate candidates');
    }
    return res.json() as Promise<{
      success: boolean;
      totalDuplicatesRemoved: number;
      uniqueCandidatesKept: number;
      message: string;
    }>;
  },

  // 7. Screening Rules
  getScreeningRules: async () => {
    const res = await fetch('/api/screening-rules');
    if (!res.ok) throw new Error('Failed to load screening rules');
    return res.json() as Promise<ScreeningRule[]>;
  },

  updateScreeningRule: async (id: string, updates: Partial<ScreeningRule>) => {
    const res = await fetch(`/api/screening-rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to update rule');
    return res.json() as Promise<{ success: boolean; rules: ScreeningRule[]; reevaluated?: any }>;
  },

  reevaluateAll: async () => {
    const res = await fetch('/api/reevaluate', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to re-evaluate applicants');
    return res.json() as Promise<{
      success: boolean;
      summary: {
        total: number;
        passed: number;
        failed: number;
        manualReview: number;
        errors: number;
      };
    }>;
  },

  // 8. Jobs Grouping (company scoped)
  getJobs: async (company?: string) => {
    const query = new URLSearchParams();
    if (company) query.set('company', company);
    const res = await fetch(`/api/jobs?${query.toString()}`, {
      headers: company ? { 'x-company': company } : {},
    });
    if (!res.ok) throw new Error('Failed to load jobs');
    return res.json() as Promise<Array<{
      jobTitle: string;
      jobId: string;
      total: number;
      passed: number;
      failed: number;
      manualReview: number;
    }>>;
  },

  // 8B. Update / Rename Job Slot
  updateJobTitle: async (jobId: string, jobTitle: string, company?: string) => {
    const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(company ? { 'x-company': company } : {}),
      },
      body: JSON.stringify({ jobId, jobTitle, company }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update job slot' }));
      throw new Error(err.error || 'Failed to update job slot');
    }
    return res.json() as Promise<{ success: boolean; jobId: string; newTitle: string }>;
  },

  // 9. Imports History (company scoped)
  getImports: async (company?: string, limit = 100) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (company) query.set('company', company);
    const res = await fetch(`/api/imports?${query.toString()}`, {
      headers: company ? { 'x-company': company } : {},
    });
    if (!res.ok) throw new Error('Failed to load imports');
    return res.json() as Promise<ImportRecord[]>;
  },

  // 9B. Clear Current Working Batch (safe scoped action, never global wipe)
  clearCurrentBatch: async (
    batchId: string,
    company: string,
    purgeRecords = false,
    user = 'Recruiter Admin',
    applicationDate?: string
  ) => {
    const res = await fetch('/api/clear-current-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-company': company,
      },
      body: JSON.stringify({ batchId, company, purgeRecords, user, applicationDate }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to clear working batch' }));
      throw new Error(err.error || 'Failed to clear working batch');
    }
    return res.json() as Promise<{
      success: boolean;
      batchId: string;
      company: string;
      activeWorkingBatchCleared: boolean;
      purgedApplicants: number;
      message: string;
    }>;
  },

  // 9B-2. Get Clear Summary (preview before destructive action)
  getApplicationClearSummary: async (company: string) => {
    const query = new URLSearchParams({ company });
    const res = await fetch(`/api/applications/clear-summary?${query.toString()}`, {
      headers: { 'x-company': company },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to fetch clear summary' }));
      throw new Error(err.error || 'Failed to fetch clear summary');
    }
    return res.json() as Promise<{
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
    }>;
  },

  // 9B-3. Clear All Applications (Scoped Company Fresh Start)
  clearAllApplications: async (company: string, user = 'Recruiter Admin') => {
    const res = await fetch('/api/applications/clear-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-company': company,
      },
      body: JSON.stringify({ company, confirm: true, user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to clear applications' }));
      throw new Error(err.error || 'Failed to clear applications');
    }
    return res.json() as Promise<{
      success: boolean;
      company: string;
      deletedApplicants: number;
      deletedBatches: number;
      passedDeleted: number;
      failedDeleted: number;
      manualReviewDeleted: number;
      duplicatesDeleted: number;
      preservedMasterCandidates: number;
      preservedJobSlots: number;
      message: string;
    }>;
  },

  // 9C. Recruiters Management
  getRecruiters: async (company?: string) => {
    const query = new URLSearchParams();
    if (company) query.set('company', company);
    const res = await fetch(`/api/recruiters?${query.toString()}`, {
      headers: company ? { 'x-company': company } : {},
    });
    if (!res.ok) throw new Error('Failed to load recruiters');
    return res.json() as Promise<Recruiter[]>;
  },

  addRecruiter: async (recruiter: { name: string; email: string; company: string; active?: boolean }) => {
    const res = await fetch('/api/recruiters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recruiter),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add recruiter' }));
      throw new Error(err.error || 'Failed to add recruiter');
    }
    return res.json() as Promise<{ success: boolean; recruiter: any }>;
  },

  // 9D. Recruiter Lead Distribution
  distributeLeads: async (
    ids: string[],
    recruiterName: string,
    company = 'AaraTech',
    user = 'Recruiter Admin'
  ) => {
    const res = await fetch('/api/applicants/distribute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-company': company },
      body: JSON.stringify({ ids, recruiterName, company, user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Distribution failed' }));
      throw new Error(err.error || 'Failed to distribute leads');
    }
    return res.json() as Promise<{ success: boolean; count: number; message: string }>;
  },

  // 9E. Periodic Reports & Analytics (Daily, Weekly, Monthly, All-Time, Custom)
  getReportAnalytics: async (
    company: string,
    period: 'daily' | 'weekly' | 'monthly' | 'custom' | 'all' = 'daily',
    date?: string,
    startDate?: string,
    endDate?: string
  ) => {
    const query = new URLSearchParams({ company, period });
    if (date) query.set('date', date);
    if (startDate) query.set('startDate', startDate);
    if (endDate) query.set('endDate', endDate);
    const res = await fetch(`/api/reports/analytics?${query.toString()}`, {
      headers: { 'x-company': company },
    });
    if (!res.ok) throw new Error('Failed to load report analytics');
    return res.json() as Promise<any>;
  },

  // 9E-2. Report Drilldown Records
  getReportDrilldownRecords: async (params: {
    company: string;
    filterType?: string;
    filterValue?: string;
    period?: string;
    date?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) => {
    const query = new URLSearchParams();
    query.set('company', params.company);
    if (params.filterType) query.set('filterType', params.filterType);
    if (params.filterValue) query.set('filterValue', params.filterValue);
    if (params.period) query.set('period', params.period);
    if (params.date) query.set('date', params.date);
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    if (params.search) query.set('search', params.search);
    if (params.page) query.set('page', params.page.toString());
    if (params.pageSize) query.set('pageSize', params.pageSize.toString());

    const res = await fetch(`/api/reports/drilldown-records?${query.toString()}`, {
      headers: { 'x-company': params.company },
    });
    if (!res.ok) throw new Error('Failed to load drilldown records');
    return res.json() as Promise<{
      success: boolean;
      total: number;
      page: number;
      pageSize: number;
      records: Array<{
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
      }>;
    }>;
  },

  // 9E-3. Month Comparison & Available Reporting Months
  getMonthComparison: async (company: string = 'ClinisolTech', monthA: string = '2026-10', monthB: string = '2026-09') => {
    const query = new URLSearchParams({ company, monthA, monthB });
    const res = await fetch(`/api/reports/month-comparison?${query.toString()}`, {
      headers: { 'x-company': company },
    });
    if (!res.ok) throw new Error('Failed to load month comparison');
    return res.json() as Promise<{
      success: boolean;
      monthA: any;
      monthB: any;
      comparison: {
        deltaTotal: number;
        deltaTotalPct: number;
        deltaPassed: number;
        deltaPassedPct: number;
        deltaPassRate: number;
        deltaDuplicates: number;
        deltaFailed?: number;
        deltaUniqueCandidates?: number;
        deltaMalePassed?: number;
        deltaFemalePassed?: number;
      };
      techComparison: Array<{
        technology: string;
        monthA: { total: number; passed: number; passRate: number; formattedPassed?: string; slots?: any[] };
        monthB: { total: number; passed: number; passRate: number; formattedPassed?: string; slots?: any[] };
        deltaTotal: number;
        deltaTotalPct: number;
        deltaPassed: number;
      }>;
      locationsComparison?: Array<{
        name: string;
        monthA: number;
        monthB: number;
        delta: number;
      }>;
      allMonthsTimeline?: Array<any>;
    }>;
  },

  getAvailableReportingMonths: async (company: string = 'ClinisolTech') => {
    const query = new URLSearchParams({ company });
    const res = await fetch(`/api/reports/available-months?${query.toString()}`, {
      headers: { 'x-company': company },
    });
    if (!res.ok) throw new Error('Failed to load available reporting months');
    return res.json() as Promise<{
      success: boolean;
      months: Array<{ month: string; label: string; total: number }>;
    }>;
  },

  getMonthSummary: async (company: string = 'ClinisolTech', month: string = '2026-10') => {
    const query = new URLSearchParams({ company, month });
    const res = await fetch(`/api/reports/month-summary?${query.toString()}`, {
      headers: { 'x-company': company },
    });
    if (!res.ok) throw new Error('Failed to load month summary');
    return res.json() as Promise<{
      success: boolean;
      summary: any;
    }>;
  },

  // 9F. Check Duplicate Candidates Against Master DB
  checkCandidateDuplicates: async (
    candidates: Array<{ email?: string; phone?: string; fullName: string }>,
    company: string,
    targetJobSlot?: string
  ) => {
    const res = await fetch('/api/candidates/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-company': company },
      body: JSON.stringify({ candidates, company, targetJobSlot }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Duplicate check failed' }));
      throw new Error(err.error || 'Failed to check candidate duplicates');
    }
    return res.json() as Promise<{
      success: boolean;
      results: Array<{
        candidate: { email?: string; phone?: string; fullName: string };
        isDuplicate: boolean;
        duplicateReason: string | null;
        matchedMasterPersonId: string | null;
        existingApplicationsCount: number;
        matchedJobTitles: string[];
      }>;
    }>;
  },

  // 10. Audit Logs
  getAuditLogs: async () => {
    const res = await fetch('/api/audit-logs');
    if (!res.ok) throw new Error('Failed to load audit logs');
    return res.json() as Promise<AuditLogEntry[]>;
  },

  // 11. Run 12 Automated Test Cases
  runTests: async () => {
    const res = await fetch('/api/run-tests', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to run test cases');
    return res.json() as Promise<{
      success: boolean;
      totalTests: number;
      passedTests: number;
      results: Array<{
        testNumber: number;
        title: string;
        input: string;
        expected: string;
        actual: string;
        passed: boolean;
      }>;
    }>;
  },

  // 12. Generate Sample Test Files
  generateSamples: async () => {
    const res = await fetch('/api/generate-samples', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to generate sample files');
    return res.json() as Promise<{
      success: boolean;
      directory: string;
      files: string[];
    }>;
  },



  // 14. Export URL generator with multi-options (format, gender, status, template, ids)
  getExportUrl: (
    format: 'xlsx' | 'csv' | 'tsv' | 'json' = 'xlsx',
    options?: {
      status?: string;
      gender?: string;
      jobId?: string;
      importId?: string;
      ids?: string[];
      template?: 'full' | 'clean';
    }
  ) => {
    const query = new URLSearchParams({ format });
    if (options?.status && options.status !== 'ALL') query.set('status', options.status);
    if (options?.gender && options.gender !== 'ALL') query.set('gender', options.gender);
    if (options?.jobId) query.set('jobId', options.jobId);
    if (options?.importId) query.set('importId', options.importId);
    if (options?.template) query.set('template', options.template);
    if (options?.ids && options.ids.length > 0) query.set('ids', options.ids.join(','));
    return `/api/export?${query.toString()}`;
  },

  // 14B. Direct Google Sheets Data Fetch & 1-Click Clipboard Copy
  getGoogleSheetsData: async (options?: {
    status?: string;
    gender?: string;
    jobId?: string;
    jobTitle?: string;
    company?: string;
    importId?: string;
    applicationDate?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    role?: string;
    nameMatchCategory?: string;
    ids?: string[];
    includeHeaders?: boolean;
    format?: 'verification' | 'default';
    uniqueOnly?: boolean;
    onlyNewCandidates?: boolean;
  }) => {
    let res: Response;
    if (options?.ids && options.ids.length > 0) {
      res = await fetch('/api/export-sheets-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: options.ids,
          status: options.status,
          gender: options.gender,
          jobId: options.jobId,
          jobTitle: options.jobTitle,
          company: options.company,
          importId: options.importId,
          applicationDate: options.applicationDate,
          startDate: options.startDate,
          endDate: options.endDate,
          search: options.search,
          role: options.role,
          nameMatchCategory: options.nameMatchCategory,
          includeHeaders: options.includeHeaders,
          format: options.format || 'default',
          uniqueOnly: options.uniqueOnly,
          onlyNewCandidates: options.onlyNewCandidates,
        }),
      });
    } else {
      const query = new URLSearchParams();
      if (options?.status && options.status !== 'ALL') query.set('status', options.status);
      if (options?.gender && options.gender !== 'ALL') query.set('gender', options.gender);
      if (options?.jobId) query.set('jobId', options.jobId);
      if (options?.jobTitle) query.set('jobTitle', options.jobTitle);
      if (options?.company) query.set('company', options.company);
      if (options?.importId) query.set('importId', options.importId);
      if (options?.applicationDate) query.set('applicationDate', options.applicationDate);
      if (options?.startDate) query.set('startDate', options.startDate);
      if (options?.endDate) query.set('endDate', options.endDate);
      if (options?.search) query.set('search', options.search);
      if (options?.role) query.set('role', options.role);
      if (options?.nameMatchCategory && options.nameMatchCategory !== 'ALL') query.set('nameMatchCategory', options.nameMatchCategory);
      if (options?.includeHeaders !== undefined) query.set('includeHeaders', String(options.includeHeaders));
      if (options?.format) query.set('format', options.format);
      if (options?.uniqueOnly) query.set('uniqueOnly', 'true');
      if (options?.onlyNewCandidates) query.set('onlyNewCandidates', 'true');
      res = await fetch(`/api/export-sheets-data?${query.toString()}`);
    }

    if (!res.ok) throw new Error('Failed to fetch Google Sheets export data');
    return res.json() as Promise<{
      total: number;
      columns: string[];
      rows: Array<Record<string, string>>;
      tsv: string;
      tsvWithHeaders: string;
      tsvNoHeaders: string;
      tsvVerification?: string;
      tsvVerificationWithHeaders?: string;
      tsvVerificationNoHeaders?: string;
    }>;
  },

  copyGoogleSheetsTsv: async (options?: {
    status?: string;
    gender?: string;
    jobId?: string;
    jobTitle?: string;
    company?: string;
    importId?: string;
    applicationDate?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    role?: string;
    nameMatchCategory?: string;
    ids?: string[];
    includeHeaders?: boolean;
    format?: 'verification' | 'default';
    uniqueOnly?: boolean;
    onlyNewCandidates?: boolean;
  }): Promise<{ success: boolean; total: number; message: string }> => {
    const data = await api.getGoogleSheetsData(options);
    let textToCopy = options?.includeHeaders === true ? data.tsvWithHeaders : data.tsvNoHeaders;
    if (options?.format === 'verification') {
      textToCopy = options?.includeHeaders === true
        ? (data.tsvVerificationWithHeaders || data.tsvWithHeaders)
        : (data.tsvVerificationNoHeaders || data.tsvNoHeaders);
    }

    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
        copied = true;
      }
    } catch {}

    if (!copied) {
      try {
        const ta = document.createElement('textarea');
        ta.value = textToCopy;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        copied = document.execCommand('copy');
        ta.remove();
      } catch {}
    }

    if (!copied) {
      throw new Error('Clipboard access denied by browser. Please use the manual copy option.');
    }

    const countLabel = options?.ids && options.ids.length > 0 ? `${options.ids.length} selected` : `${data.total}`;
    return {
      success: true,
      total: data.total,
      message: `Copied ${countLabel} row(s) to clipboard! Paste directly into Google Sheets (Ctrl+V).`,
    };
  },


  // 15. Clear all applicant and import data
  clearAllData: async () => {
    const res = await fetch('/api/clear-all-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmPhrase: 'WIPE_CONFIRMED' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to clear data' }));
      throw new Error(err.error || 'Failed to clear data');
    }
    return res.json() as Promise<{
      success: boolean;
      message: string;
      applicantsDeleted: number;
      importsDeleted: number;
      filesDeleted: number;
      logsDeleted: number;
    }>;
  },

  // 16. Repair and realign all split applicants
  repairApplicants: async () => {
    const res = await fetch('/api/repair-applicants', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to repair applicants' }));
      throw new Error(err.error || 'Failed to repair applicants');
    }
    return res.json() as Promise<{
      success: boolean;
      message: string;
      totalImports: number;
      totalApplicantsBefore: number;
      totalApplicantsAfter: number;
    }>;
  },

  // 17. Gemini AI Config
  getAiConfig: async () => {
    const res = await fetch('/api/ai/config');
    if (!res.ok) throw new Error('Failed to fetch AI configuration');
    return res.json() as Promise<{
      configured: boolean;
      maskedKey: string;
      model: string;
      freeTierNotice: string;
    }>;
  },

  saveAiConfig: async (apiKey: string) => {
    const res = await fetch('/api/ai/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to save Gemini key' }));
      throw new Error(err.error || 'Failed to save Gemini key');
    }
    return res.json() as Promise<{
      success: boolean;
      message: string;
      model: string;
    }>;
  },

  clearAiConfig: async () => {
    const res = await fetch('/api/ai/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' }),
    });
    return res.json() as Promise<{ success: boolean; message: string }>;
  },

  // 18. Gemini AI Batch Classification
  classifyWithGemini: async (options?: {
    onlyManualReview?: boolean;
    importId?: string;
    apiKey?: string;
    limit?: number;
  }) => {
    const res = await fetch('/api/ai/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'AI classification failed' }));
      throw new Error(err.error || 'AI classification failed');
    }
    return res.json() as Promise<{
      success: boolean;
      message: string;
      total: number;
      promotedToPass: number;
      maleCount: number;
      femaleCount: number;
      resultsPreview?: any[];
    }>;
  },

  // 19. Rescreen all applicants with expanded local rules
  rescreenAllApplicants: async () => {
    const res = await fetch('/api/rescreen-all', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Rescreen failed' }));
      throw new Error(err.error || 'Rescreen failed');
    }
    return res.json() as Promise<{
      success: boolean;
      message: string;
      total: number;
      updated: number;
      promotedToPass: number;
      southAsianCount: number;
      maleCount: number;
      femaleCount: number;
    }>;
  },

  // 20. Reference Name Pattern Matcher Statistics
  getReferenceMatcherStats: async () => {
    const res = await fetch('/api/reference-matcher/stats');
    if (!res.ok) throw new Error('Failed to load reference matcher stats');
    return res.json() as Promise<{
      success: boolean;
      dataset1Count: number;
      dataset2Count: number;
      totalReferenceNames: number;
      uniqueReferenceNames: number;
      uniqueTokens: number;
      uniqueTokenCombos: number;
      similarityThreshold: number;
      topTokens: { token: string; count: number }[];
      topCombos: string[];
      dbSummary: {
        total: number;
        strongMatches: number;
        possibleMatches: number;
        noMatches: number;
        threshold: number;
      };
    }>;
  },

  // 21. Run Reference Name Pattern Matching with Threshold
  runReferenceMatching: async (threshold?: number) => {
    const res = await fetch('/api/reference-matcher/match-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threshold }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Pattern matching failed' }));
      throw new Error(err.error || 'Pattern matching failed');
    }
    return res.json() as Promise<{
      success: boolean;
      message: string;
      total: number;
      strongMatches: number;
      possibleMatches: number;
      noMatches: number;
      threshold: number;
    }>;
  },

  // 22. Export Reference Matches to CSV or Excel
  exportReferenceMatches: async (params: {
    format: 'csv' | 'xlsx';
    nameMatchCategory?: string;
    status?: string;
    gender?: string;
    jobId?: string;
  }) => {
    const res = await fetch('/api/reference-matcher/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Export failed' }));
      throw new Error(err.error || 'Export failed');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reference_Name_Matches_${params.nameMatchCategory || 'ALL'}_${Date.now()}.${params.format}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  },

  // 23. Master Candidate Database
  getMasterCandidates: async (params?: {
    page?: number;
    pageSize?: number;
    search?: string;
    company?: string;
    status?: string;
    owner?: string;
    gender?: string;
    contactFilter?: string;
    technology?: string;
    repeatFilter?: string;
    h1bStatus?: string;
    greenCard?: string;
    hasResume?: boolean;
    hasLinkedIn?: boolean;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.search) query.set('search', params.search);
    if (params?.company && params.company !== 'All' && params.company !== 'Both') query.set('company', params.company);
    if (params?.status && params.status !== 'All') query.set('status', params.status);
    if (params?.owner && params.owner !== 'All') query.set('owner', params.owner);
    if (params?.gender && params.gender !== 'All') query.set('gender', params.gender);
    if (params?.contactFilter && params.contactFilter !== 'all') query.set('contactFilter', params.contactFilter);
    if (params?.technology && params.technology !== 'All') query.set('technology', params.technology);
    if (params?.repeatFilter && params.repeatFilter !== 'all') query.set('repeatFilter', params.repeatFilter);
    if (params?.h1bStatus && params.h1bStatus !== 'All') query.set('h1bStatus', params.h1bStatus);
    if (params?.greenCard && params.greenCard !== 'All') query.set('greenCard', params.greenCard);
    if (params?.hasResume) query.set('hasResume', 'true');
    if (params?.hasLinkedIn) query.set('hasLinkedIn', 'true');
    if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
    if (params?.dateTo) query.set('dateTo', params.dateTo);
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder);

    const res = await fetch(`/api/master-candidates?${query.toString()}`, {
      headers: params?.company && params.company !== 'All' && params.company !== 'Both' ? { 'x-company': params.company } : {},
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to load master candidates' }));
      throw new Error(err.error || 'Failed to load master candidates');
    }
    return res.json() as Promise<{
      success: boolean;
      candidates: Person[];
      totalCount: number;
      page: number;
      pageSize: number;
    }>;
  },

  getMasterCandidateTechnologies: async (company?: string) => {
    const query = new URLSearchParams();
    if (company && company !== 'All' && company !== 'Both') query.set('company', company);
    const res = await fetch(`/api/master-candidates/technologies?${query.toString()}`, {
      headers: company && company !== 'All' && company !== 'Both' ? { 'x-company': company } : {},
    });
    if (!res.ok) return { success: false, technologies: [] };
    return res.json() as Promise<{ success: boolean; technologies: string[] }>;
  },

  exportMasterCandidatesCsv: (params?: {
    search?: string;
    company?: string;
    status?: string;
    owner?: string;
    gender?: string;
    contactFilter?: string;
    technology?: string;
    repeatFilter?: string;
    h1bStatus?: string;
    greenCard?: string;
    hasResume?: boolean;
    hasLinkedIn?: boolean;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.company && params.company !== 'All' && params.company !== 'Both') query.set('company', params.company);
    if (params?.status && params.status !== 'All') query.set('status', params.status);
    if (params?.owner && params.owner !== 'All') query.set('owner', params.owner);
    if (params?.gender && params.gender !== 'All') query.set('gender', params.gender);
    if (params?.contactFilter && params.contactFilter !== 'all') query.set('contactFilter', params.contactFilter);
    if (params?.technology && params.technology !== 'All') query.set('technology', params.technology);
    if (params?.repeatFilter && params.repeatFilter !== 'all') query.set('repeatFilter', params.repeatFilter);
    if (params?.h1bStatus && params.h1bStatus !== 'All') query.set('h1bStatus', params.h1bStatus);
    if (params?.greenCard && params.greenCard !== 'All') query.set('greenCard', params.greenCard);
    if (params?.hasResume) query.set('hasResume', 'true');
    if (params?.hasLinkedIn) query.set('hasLinkedIn', 'true');
    if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
    if (params?.dateTo) query.set('dateTo', params.dateTo);
    if (params?.sortBy) query.set('sortBy', params.sortBy);
    if (params?.sortOrder) query.set('sortOrder', params.sortOrder);

    window.location.href = `/api/master-candidates/export-csv?${query.toString()}`;
  },

  getCrossTechnologyAnalytics: async (company?: string) => {
    const query = new URLSearchParams();
    if (company && company !== 'All' && company !== 'Both') query.set('company', company);
    const res = await fetch(`/api/reports/cross-technology?${query.toString()}`, {
      headers: company && company !== 'All' && company !== 'Both' ? { 'x-company': company } : {},
    });
    if (!res.ok) return { success: false, multiTechCandidates: [], totalMultiTechCount: 0, technologyPairs: [] };
    return res.json() as Promise<{
      success: boolean;
      multiTechCandidates: any[];
      totalMultiTechCount: number;
      technologyPairs: { pair: string; count: number }[];
    }>;
  },

  getMasterCandidateById: async (id: string) => {
    const res = await fetch(`/api/master-candidates/${encodeURIComponent(id)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Candidate not found' }));
      throw new Error(err.error || 'Candidate not found');
    }
    return res.json() as Promise<{ success: boolean; candidate: Person }>;
  },

  getMasterCandidateStats: async (company?: string) => {
    const query = new URLSearchParams();
    if (company && company !== 'All' && company !== 'Both') query.set('company', company);
    const res = await fetch(`/api/master-candidates/stats?${query.toString()}`, {
      headers: company && company !== 'All' && company !== 'Both' ? { 'x-company': company } : {},
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to load master stats' }));
      throw new Error(err.error || 'Failed to load master stats');
    }
    return res.json() as Promise<{
      success: boolean;
      totalPeople: number;
      totalCandidates?: number;
      totalApplications: number;
      activeCandidates: number;
      unlinkedApplications: number;
      statusBreakdown: Record<string, number>;
      genderBreakdown: Record<string, number>;
      byCompany?: {
        AaraTech: number;
        ClinisolTech: number;
      };
    }>;
  },

  promoteApplications: async (company?: string, applicantIds?: string[], user = 'Recruiter Admin') => {
    const res = await fetch('/api/candidates/promote-applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, applicantIds, user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to promote applications' }));
      throw new Error(err.error || 'Failed to promote applications');
    }
    return res.json() as Promise<{
      success: boolean;
      promotedCount: number;
      linkedCount: number;
      needsReviewCount: number;
      incompleteCount: number;
      errors: string[];
    }>;
  },

  // Phase 2: Controlled Transfer of Final Approved Passed Applications to Master Candidate DB
  transferPassedToMaster: async (params: {
    company: 'AaraTech' | 'ClinisolTech';
    batchId?: string;
    applicantIds?: string[];
    transferredBy?: string;
  }) => {
    const res = await fetch('/api/transfer-passed-to-master', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-company': params.company,
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Transfer failed' }));
      throw new Error(err.error || 'Failed to transfer passed applications');
    }
    return res.json() as Promise<{
      success: boolean;
      company: 'AaraTech' | 'ClinisolTech';
      totalEligiblePassed: number;
      transferredCount: number;
      newCandidatesCount: number;
      existingCandidatesCount: number;
      newApplicationsCount: number;
      skippedDuplicatesCount: number;
      possibleMatchesCount: number;
      errorsCount: number;
      batchId?: string;
      message: string;
      transfers: Array<{
        applicantId: string;
        applicantName: string;
        jobTitle: string;
        personId: string;
        applicationId: string;
        status: 'SUCCESS' | 'SKIPPED_EXISTING' | 'FAILED' | 'POSSIBLE_MATCH';
        classification: string;
        reason?: string;
      }>;
    }>;
  },

  getTransferStatus: async (company: 'AaraTech' | 'ClinisolTech', batchId?: string) => {
    const query = new URLSearchParams();
    query.set('company', company);
    if (batchId) query.set('batchId', batchId);
    const res = await fetch(`/api/transfer-status?${query.toString()}`, {
      headers: { 'x-company': company },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to get transfer status' }));
      throw new Error(err.error || 'Failed to get transfer status');
    }
    return res.json() as Promise<{
      company: 'AaraTech' | 'ClinisolTech';
      batchId?: string;
      totalApplicants: number;
      passedCount: number;
      manualReviewCount: number;
      failedCount: number;
      transferredCount: number;
      pendingTransferCount: number;
      skippedCount: number;
    }>;
  },

  updateMasterCandidate: async (id: string, updates: Record<string, any>, user = 'Recruiter Admin') => {
    const res = await fetch(`/api/master-candidates/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updates, user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to update candidate' }));
      throw new Error(err.error || 'Failed to update candidate');
    }
    return res.json() as Promise<{ success: boolean; candidate: Person }>;
  },

  addMasterRecruiterContact: async (
    id: string,
    contact: { recruiterName: string; contactType: string; notes: string; contactDate?: string },
    user = 'Recruiter Admin'
  ) => {
    const res = await fetch(`/api/master-candidates/${encodeURIComponent(id)}/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...contact, user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to add recruiter contact' }));
      throw new Error(err.error || 'Failed to add recruiter contact');
    }
    return res.json() as Promise<{ success: boolean; candidate: Person }>;
  },

  reassignMasterCandidate: async (
    id: string,
    params: { recruiterName: string; assignedDate?: string; reason?: string },
    user = 'Recruiter Admin'
  ) => {
    const res = await fetch(`/api/master-candidates/${encodeURIComponent(id)}/reassign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to reassign candidate' }));
      throw new Error(err.error || 'Failed to reassign candidate');
    }
    return res.json() as Promise<{ success: boolean; candidate: Person }>;
  },

  addMasterContactAttempt: async (
    id: string,
    params: {
      recruiterName: string;
      contactMethod?: string;
      outcome?: string;
      feedback1?: string;
      feedback2?: string;
      notes?: string;
      contactDate?: string;
      nextFollowUp?: string;
      sourceFile?: string;
    },
    user = 'Recruiter Admin'
  ) => {
    const res = await fetch(`/api/master-candidates/${encodeURIComponent(id)}/contact-attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to record contact attempt' }));
      throw new Error(err.error || 'Failed to record contact attempt');
    }
    return res.json() as Promise<{ success: boolean; candidate: Person }>;
  },

  batchUpdateMasterCandidates: async (
    ids: string[],
    updates: { status?: string; owner?: string; gender?: string },
    user = 'Recruiter Admin'
  ) => {
    const res = await fetch('/api/master-candidates/batch-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, updates, user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to batch update candidates' }));
      throw new Error(err.error || 'Failed to batch update candidates');
    }
    return res.json() as Promise<{ success: boolean; updatedCount: number; message: string }>;
  },

  deleteMasterCandidate: async (id: string, user = 'Recruiter Admin') => {
    const res = await fetch(`/api/master-candidates/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to delete candidate' }));
      throw new Error(err.error || 'Failed to delete candidate');
    }
    return res.json() as Promise<{ success: boolean; message: string }>;
  },

  clearAllMasterCandidates: async (company: 'AaraTech' | 'ClinisolTech', user = 'Recruiter Admin') => {
    if (!company || (company !== 'AaraTech' && company !== 'ClinisolTech')) {
      throw new Error(`Strict Company Isolation: company must be explicitly 'AaraTech' or 'ClinisolTech' (received: ${company}).`);
    }
    const res = await fetch('/api/master-candidates/clear-all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-company': company,
      },
      body: JSON.stringify({ company, user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to clear master candidate database' }));
      throw new Error(err.error || 'Failed to clear master candidate database');
    }
    return res.json() as Promise<{ success: boolean; message: string }>;
  },

  createMasterImportJob: async (job: { id: string; company: string; sourceFile?: string; sheetName?: string; totalRows?: number }) => {
    const res = await fetch('/api/master-candidates/import-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to create import job' }));
      throw new Error(err.error || 'Failed to create import job');
    }
    return res.json();
  },

  getMasterImportJob: async (jobId: string) => {
    const res = await fetch(`/api/master-candidates/import-jobs/${encodeURIComponent(jobId)}`);
    if (!res.ok) return null;
    return res.json();
  },

  getMasterImportJobs: async (company?: string) => {
    const url = company ? `/api/master-candidates/import-jobs?company=${encodeURIComponent(company)}` : '/api/master-candidates/import-jobs';
    const res = await fetch(url);
    if (!res.ok) return [];
    return res.json();
  },

  getMasterImportResumeInfo: async (jobId: string) => {
    const res = await fetch(`/api/master-candidates/import-jobs/${encodeURIComponent(jobId)}/resume`);
    if (!res.ok) return null;
    return res.json();
  },

  getMasterImportErrors: async (jobId: string) => {
    const res = await fetch(`/api/master-candidates/import-jobs/${encodeURIComponent(jobId)}/errors`);
    if (!res.ok) return [];
    return res.json();
  },

  completeMasterImportJob: async (jobId: string, status = 'Completed', errorSummary?: string) => {
    const res = await fetch(`/api/master-candidates/import-jobs/${encodeURIComponent(jobId)}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, errorSummary }),
    });
    if (!res.ok) return null;
    return res.json();
  },

  upsertMasterCandidatesBatch: async (
    people: Person[],
    importRecord?: any,
    jobOptions?: {
      jobId?: string;
      onChunkProgress?: (chunkNum: number, totalChunks: number, processedRows: number) => void;
    }
  ) => {
    if (!people || people.length === 0) return { success: true, count: 0, errors: [] };
    const CHUNK_SIZE = 250;
    let totalUpserted = 0;
    const allErrors: any[] = [];
    const totalChunks = Math.ceil(people.length / CHUNK_SIZE);

    for (let i = 0; i < people.length; i += CHUNK_SIZE) {
      const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
      const chunk = people.slice(i, i + CHUNK_SIZE);
      const startRow = i + 1;
      const endRow = Math.min(i + CHUNK_SIZE, people.length);
      let attempts = 0;
      let success = false;
      let lastErr: any = null;

      while (attempts < 3 && !success) {
        attempts++;
        try {
          const res = await fetch('/api/master-candidates/batch-upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              people: chunk,
              importRecord: i === 0 ? importRecord : undefined,
              options: {
                jobId: jobOptions?.jobId || importRecord?.id,
                sourceFile: importRecord?.file_name,
                sheetName: importRecord?.sheet_name || 'Pasted_Leads',
                batchNumber: chunkNum,
                startRow,
                endRow,
              },
            }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: `Failed to batch upsert candidates chunk ${chunkNum}` }));
            throw new Error(err.error || `Failed to upsert candidates chunk ${chunkNum}`);
          }
          const data = await res.json();
          totalUpserted += data.upserted !== undefined ? data.upserted : (data.count || chunk.length);
          if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
            allErrors.push(...data.errors);
          }
          success = true;
          if (jobOptions?.onChunkProgress) {
            jobOptions.onChunkProgress(chunkNum, totalChunks, endRow);
          }
        } catch (err: any) {
          lastErr = err;
          if (attempts >= 3) {
            console.error(`[API Client] Chunk ${chunkNum}/${totalChunks} encountered persistent error after 3 attempts:`, err);
            allErrors.push({ chunk: chunkNum, error: err.message || 'Network / Database timeout' });
            break;
          }
          // Exponential backoff wait before retrying chunk
          await new Promise(r => setTimeout(r, 600 * attempts));
        }
      }
    }
    return { success: allErrors.length === 0, count: totalUpserted, errors: allErrors };
  },
};

