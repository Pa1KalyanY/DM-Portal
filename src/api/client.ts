import { Applicant, AuditLogEntry, DashboardStats, ImportRecord, PaginatedResult, PaginationParams, Recruiter, ScreeningRule } from '../types';
import { Person } from '../types/masterDatabase';

export const api = {
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
    return res.json() as Promise<{ pass: number; fail: number; review: number; all: number }>;
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
    user = 'Recruiter Admin'
  ) => {
    const res = await fetch('/api/clear-current-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-company': company,
      },
      body: JSON.stringify({ batchId, company, purgeRecords, user }),
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

  // 9E. Periodic Reports & Analytics (Daily, Weekly, Monthly, Custom)
  getReportAnalytics: async (
    company: string,
    period: 'daily' | 'weekly' | 'monthly' | 'custom' = 'daily',
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
      totalApplications: number;
      activeCandidates: number;
      unlinkedApplications: number;
      statusBreakdown: Record<string, number>;
      genderBreakdown: Record<string, number>;
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

  clearAllMasterCandidates: async (company: string = 'all', user = 'Recruiter Admin') => {
    const res = await fetch('/api/master-candidates/clear-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, user }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to clear master candidate database' }));
      throw new Error(err.error || 'Failed to clear master candidate database');
    }
    return res.json() as Promise<{ success: boolean; message: string }>;
  },

  upsertMasterCandidatesBatch: async (people: Person[], importRecord?: any) => {
    const res = await fetch('/api/master-candidates/batch-upsert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ people, importRecord }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Failed to batch upsert candidates' }));
      throw new Error(err.error || 'Failed to batch upsert candidates');
    }
    return res.json() as Promise<{ success: boolean; count: number }>;
  },
};

