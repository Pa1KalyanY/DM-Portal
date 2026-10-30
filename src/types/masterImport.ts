// Type definitions for the historical data import and column mapping engine

export type TargetColumn =
  | 'full_name'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'secondary_email'
  | 'phone'
  | 'secondary_phone'
  | 'linkedin_url'
  | 'location'
  | 'preferred_location'
  | 'company'
  | 'job_title'
  | 'job_id'
  | 'date_applied'
  | 'current_stage'
  | 'recruiter_name'
  | 'recruiter_feedback'
  | 'contact_date'
  | 'contact_type'
  | 'resume_link'
  | 'status'
  | 'owner'
  | 'gender'
  | 'green_card'
  | 'h1b_status'
  | 'ignore';

export interface ColumnMappingConfig {
  sourceColumn: string;
  targetColumn: TargetColumn;
  confidence: number; // 0 to 1
  sampleValues: string[];
  isManualOverride?: boolean;
  safeguardApplied?: boolean;
  feedbackIndex?: number | null;
  feedbackLabel?: string;
  columnIndex?: number;
  subheader?: string;
}

export interface StagedRow {
  rowNumber: number;
  data: Record<string, any>;
  mapped: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    linkedinUrl?: string;
    location?: string;
    company?: string;
    jobTitle?: string;
    jobId?: string;
    dateApplied?: string;
    currentStage?: string;
    recruiterName?: string;
    recruiterFeedback?: string;
    contactDate?: string;
    contactType?: string;
    resumeLink?: string;
    greenCard?: string;
    h1bStatus?: string;
    status?: string;
    owner?: string;
  };
  normalized: {
    fullName: string;
    firstName: string | null;
    lastName: string | null;
    emailOriginal: string | null;
    normalizedEmail: string | null;
    phoneOriginal: string | null;
    normalizedPhone: string | null;
    linkedinUrl: string | null;
  };
  validationError?: string;
}

export interface RowCountDiagnostics {
  physicalRows: number; // Physical data rows in selected worksheet, excluding header
  nonEmptyRows: number; // Total non-empty rows parsed
  validCandidateRows: number; // Valid candidate rows (has complete valid name, email, phone)
  missingRequiredRows: number; // Rows with missing required fields (queued for review)
  duplicateRowsInFile: number; // Duplicate rows within uploaded file
  excludedByFilterRows: number; // Rows excluded by explicit filters, if any
  availableToImportRows: number; // Rows available to import
  totalRowsAllSheets: number; // Total rows across all worksheets
  sheetRowCounts: Record<string, number>; // Breakdown per sheet
}

export interface ImportPreviewData {
  fileName: string;
  fileType: 'xlsx' | 'xls' | 'csv';
  fileSize: number;
  totalRows: number;
  headers: string[];
  sampleRows: Record<string, any>[];
  mappings: ColumnMappingConfig[];
  availableSheets?: string[];
  selectedSheet?: string;
  subheaders?: Record<string, string>;
  subheaderRowDetected?: boolean;
  diagnostics?: RowCountDiagnostics;
}
