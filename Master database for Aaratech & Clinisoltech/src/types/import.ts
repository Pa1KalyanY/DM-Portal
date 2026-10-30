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
  | 'ignore';

export interface ColumnMappingConfig {
  sourceColumn: string;
  targetColumn: TargetColumn;
  confidence: number; // 0 to 1
  sampleValues: string[];
  isManualOverride?: boolean;
  safeguardApplied?: boolean;
  columnIndex?: number;
  feedbackIndex?: number | null;
  feedbackLabel?: string;
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
}
