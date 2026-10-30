// TypeScript Definitions for Master Recruiting Database Architecture (Phase 1)

export type CompanyName = 'AaraTech' | 'ClinisolTech';

export type CandidateStatus =
  | 'New'
  | 'Open'
  | 'Assigned'
  | 'Contacted'
  | 'Follow-up'
  | 'Review'
  | 'Not Interested'
  | 'Closed'
  | 'Dead'
  | 'Merged';

export type Gender = 'Male' | 'Female' | 'Other' | 'Unspecified';

export interface Person {
  id: string; // UUID internally
  person_id: string; // Human-readable (e.g. 'P-000123')
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  gender?: Gender;
  primary_email: string | null;
  secondary_email?: string | null;
  primary_phone: string | null;
  secondary_phone?: string | null;
  location: string | null;
  preferred_location?: string | null;
  zip_code: string | null;
  headline: string | null;
  current_title: string | null;
  current_company: string | null;
  linkedin_url: string | null;
  current_status: CandidateStatus;
  current_owner: string | null;
  merged_into_id?: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  
  // Joined relation fields for UI
  emails?: PersonEmail[];
  phones?: PersonPhone[];
  applications?: Application[];
  recruiter_contacts?: RecruiterContact[];
  status_history?: PersonStatusHistory[];
}

export interface PersonEmail {
  id: string;
  person_id: string;
  email: string;
  normalized_email: string;
  is_primary: boolean;
  source?: string | null;
  source_file?: string | null;
  source_row?: number | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
}

export interface PersonPhone {
  id: string;
  person_id: string;
  phone_original: string;
  phone_normalized: string;
  is_primary: boolean;
  source?: string | null;
  source_file?: string | null;
  source_row?: number | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
}

export interface Application {
  id: string;
  person_id: string;
  company: CompanyName;
  job_id?: string | null;
  job_title: string;
  job_url?: string | null;
  ats_job_id?: string | null;
  date_applied: string;
  current_stage: string;
  minimum_salary?: number | null;
  maximum_salary?: number | null;
  currency_code?: string;
  compensation_period?: string;
  hiring_project_id?: string | null;
  hiring_project_title?: string | null;
  contract_id?: string | null;
  contract_name?: string | null;
  screening_questions_raw?: any;
  resume_link?: string | null;
  source_file?: string | null;
  source_row?: number | null;
  source_import_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecruiterContact {
  id: string;
  person_id: string;
  application_id?: string | null;
  recruiter_name: string;
  contact_date: string;
  contact_type: string; // 'Phone', 'Email', 'LinkedIn', etc.
  original_feedback: string; // Verbatim raw feedback
  source?: string | null;
  source_file?: string | null;
  source_row?: number | null;
  feedback_label?: string | null; // e.g. 'Feedback 1', 'Feedback 2', 'Feedback 10', 'Recruiter Notes'
  column_index?: number | null; // 0-indexed position in source spreadsheet
  import_id?: string | null; // Batch identifier e.g. 'IMP-000048'
  created_at: string;
}

export interface Job {
  id: string;
  company: CompanyName;
  job_id: string;
  job_title: string;
  job_url?: string | null;
  ats_job_id?: string | null;
  status: 'Active' | 'Closed' | 'Draft';
  created_at: string;
  updated_at: string;
}

export interface ImportRecord {
  id: string; // e.g. 'IMP-000047'
  file_name: string;
  file_size_bytes?: number;
  file_type: 'xlsx' | 'xls' | 'csv';
  import_status: 'processing' | 'completed' | 'failed' | 'cancelled';
  total_rows: number;
  processed_rows: number;
  new_people: number;
  matched_people: number;
  possible_matches: number;
  applications_created: number;
  contacts_created: number;
  errors: number;
  error_details?: ImportErrorRow[];
  uploaded_by: string;
  started_at: string;
  completed_at?: string | null;
  created_at: string;
}

export interface ImportErrorRow {
  row: number;
  name?: string;
  reason: string;
  raw_data?: Record<string, any>;
}

export interface ImportRowTrace {
  id: string;
  import_id: string;
  row_number: number;
  raw_data: Record<string, any>;
  processing_status: 'success' | 'matched' | 'possible_match' | 'error' | 'skipped';
  matched_person_id?: string | null;
  match_type?: string | null;
  error_message?: string | null;
  created_at: string;
}

export interface PersonStatusHistory {
  id: string;
  person_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string;
  reason?: string | null;
  created_at: string;
}

export interface PossibleMatch {
  id: string;
  match_code: string; // e.g. 'PM-000042'
  candidate_a_id: string;
  candidate_b_id: string;
  match_reason: string;
  status: 'pending' | 'merged' | 'rejected' | 'reviewed_later';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  
  // Section 9 Match Status Details
  name_match_status?: 'Exact' | 'Similar' | 'Different';
  email_match_status?: 'Match' | 'Different' | 'Missing';
  phone_match_status?: 'Match' | 'Different' | 'Missing';
  decision_category?: 'Eligible for auto-merge' | 'Manual review' | 'No merge';
  conflicts?: string[];
  rule_triggered?: string;

  // Joined candidates
  candidate_a?: Person;
  candidate_b?: Person;
}

export interface MergeHistory {
  id: string;
  primary_person_id: string;
  merged_person_id: string;
  merged_by: string;
  merged_at: string;
  can_unmerge: boolean;
  unmerged_at?: string | null;
  snapshot: Record<string, any>;

  // Section 11 Provenance & Audit Metadata
  decision_rule?: string;
  decision_reason?: string;
  is_automatic?: boolean;
  matching_fields?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: 'import' | 'merge' | 'unmerge' | 'status_change' | 'owner_change' | 'profile_edit' | 'delete_archive';
  entity_type: 'person' | 'application' | 'recruiter_contact' | 'import';
  entity_id: string;
  details?: Record<string, any> | null;
  created_at: string;
}

export type IncompleteReason = 'missing_contact' | 'missing_name' | 'missing_both' | 'missing_email' | 'missing_phone';

export interface IncompleteRecord {
  id: string;
  missing_reason: IncompleteReason;
  missing_description: string;
  date_assigned: string; // YYYY-MM-DD
  raw_name?: string | null;
  raw_email?: string | null;
  raw_phone?: string | null;
  raw_role?: string | null;
  company: CompanyName;
  owner: string;
  recruiter_feedback?: string | null;
  source_file?: string | null;
  source_row?: number | null;
  created_at: string;
  updated_at: string;
}

