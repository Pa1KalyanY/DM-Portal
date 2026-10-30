// TypeScript Definitions for Master Recruiting Database Architecture
// Ported and adapted for Unified Company Management Platform

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

export interface RecruiterAssignment {
  id: string;
  person_id: string;
  application_id?: string | null;
  recruiter_name: string;
  assigned_date: string; // recruiter_assigned_date
  end_date?: string | null;
  status: 'Current' | 'Completed' | 'Reassigned';
  reason?: string | null;
  reassignment_reason?: string | null;
  created_by?: string | null;
  company?: CompanyName;
  source_file?: string | null;
  source_row?: number | null;
  created_at: string;
}

export interface Person {
  id: string; // UUID internally
  person_id: string; // Human-readable (e.g. 'P-000123')
  company?: CompanyName | 'Both';
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
  resume_url?: string | null;
  unclassified_links?: string[];
  current_status: CandidateStatus;
  current_owner: string | null;
  merged_into_id?: string | null;
  created_at: string;
  updated_at: string;
  last_activity_at: string;

  // Screening & Visa Status (File 1: Green Card / US-C, H1B Y/N)
  green_card?: string | null;
  h1b_status?: string | null;

  // Specific separated dates (Part 4)
  application_collected_date?: string | null;
  recruiter_assigned_date?: string | null;
  ingestion_date?: string | null;
  contact_date?: string | null;

  // Key recruiter roles (Part 6)
  first_assigned_recruiter?: string | null;
  first_confirmed_contacted_by?: string | null;
  first_contacted_by?: string | null;
  last_contacted_by?: string | null;
  latest_contact_outcome?: string | null;
  last_assignment_date?: string | null;
  last_contact_date?: string | null;
  next_followup_date?: string | null;

  // Extra populated source fields
  extra_source_fields?: Record<string, any>;
  
  // Joined relation fields for UI
  emails?: PersonEmail[];
  phones?: PersonPhone[];
  applications?: Application[];
  assignments?: RecruiterAssignment[];
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
  application_collected_date?: string | null;
  recruiter_assigned_date?: string | null;
  ingestion_date?: string | null;
  green_card?: string | null;
  h1b_status?: string | null;
  current_stage: string;
  status?: string;
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
  resume_url?: string | null;
  linkedin_url?: string | null;
  unclassified_links?: string[];
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
  application_unresolved?: boolean;
  assignment_id?: string | null;
  recruiter_name: string;
  contact_date: string;
  contact_type: string; // 'Phone', 'Email', 'LinkedIn', etc.
  contact_method?: string | null;
  outcome?: string | null;
  outcome_status?: string | null; // Call status / outcome (e.g. Connected, VM, No Answer)
  feedback_1?: string | null;
  feedback_2?: string | null;
  additional_notes?: string | null;
  notes?: string | null;
  raw_feedback?: string | null;
  next_followup_date?: string | null;
  original_feedback: string; // Verbatim raw feedback
  feedback_label?: string | null;
  column_index?: number | null;
  import_id?: string | null;
  source?: string | null;
  source_file?: string | null;
  source_row?: number | null;
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
  matched_applications?: number;
  unresolved_applications?: number;
  assignments_created?: number;
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
  
  name_match_status?: 'Exact' | 'Similar' | 'Different';
  email_match_status?: 'Match' | 'Different' | 'Missing';
  phone_match_status?: 'Match' | 'Different' | 'Missing';
  decision_category?: 'Eligible for auto-merge' | 'Manual review' | 'No merge';
  conflicts?: string[];
  rule_triggered?: string;

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
