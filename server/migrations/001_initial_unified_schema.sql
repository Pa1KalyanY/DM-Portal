-- =============================================================================
-- Migration: 001_initial_unified_schema.sql (Corrected & Hardened)
-- Description: Unified Multi-Tenant PostgreSQL Schema for AaraTech & ClinisolTech
-- Target Project: https://fqznaoiwainliizszcsd.supabase.co
-- Security Level: Strict Row-Level Security (RLS) with Fail-Closed Authorization
-- Date: October 2026
-- =============================================================================

-- Enable required extensions in public/extensions schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- 1. COMPANIES & WORKSPACES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.companies (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- 'AaraTech' | 'ClinisolTech'
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Seed company entities idempotently
INSERT INTO public.companies (id, code, display_name)
VALUES 
  ('comp-aaratech', 'AaraTech', 'AaraTech'),
  ('comp-clinisoltech', 'ClinisolTech', 'ClinisolTech')
ON CONFLICT (code) DO UPDATE SET display_name = EXCLUDED.display_name;

-- =============================================================================
-- 2. IMPORT BATCHES & PROVENANCE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  import_code TEXT UNIQUE NOT NULL,
  batch_name TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'excel', -- 'excel' | 'csv' | 'pasted' | 'manual'
  uploaded_by TEXT NOT NULL DEFAULT 'Recruiter Admin',
  file_count INT DEFAULT 1,
  total_applicants INT DEFAULT 0,
  passed_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  manual_review_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  status TEXT DEFAULT 'completed',
  application_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_ib_company ON public.import_batches(company);
CREATE INDEX IF NOT EXISTS idx_ib_company_date ON public.import_batches(company, application_date DESC);
CREATE INDEX IF NOT EXISTS idx_ib_import_code ON public.import_batches(import_code);

-- =============================================================================
-- 3. IMPORT FILES (FILE HASHES FOR IDEMPOTENCY)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.import_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  filename TEXT NOT NULL,
  file_size INT DEFAULT 0,
  row_count INT DEFAULT 0,
  job_id TEXT,
  job_title TEXT,
  status TEXT DEFAULT 'PROCESSED',
  error_message TEXT,
  file_hash TEXT NOT NULL, -- SHA-256 hash for deduplication
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_if_company_hash ON public.import_files(company, file_hash);
CREATE INDEX IF NOT EXISTS idx_if_import ON public.import_files(import_id);

-- =============================================================================
-- 4. APPLICANTS STAGING (WITH 35-DAY RETENTION FOR FAILED DETAILS)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.applicants_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_applicant_id TEXT UNIQUE, -- Exact SQLite applicants.id for deterministic migration & traceability
  import_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  source_file TEXT,
  source_worksheet TEXT,
  source_row_number INT,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  location TEXT,
  zip_code TEXT,
  headline TEXT,
  current_title TEXT,
  current_company TEXT,
  current_position_start_date TEXT,
  education_degree TEXT,
  education_institution TEXT,
  profile_url TEXT,
  date_applied DATE NOT NULL DEFAULT CURRENT_DATE,
  current_stage TEXT DEFAULT 'Applied',
  job_id TEXT,
  job_title TEXT NOT NULL,
  normalized_role TEXT,
  job_url TEXT,
  ats_job_id TEXT,
  min_salary TEXT,
  max_salary TEXT,
  currency_code TEXT,
  compensation_period TEXT,
  hiring_project_id TEXT,
  hiring_project_title TEXT,
  contract_id TEXT,
  contract_name TEXT,
  gender TEXT DEFAULT 'UNSPECIFIED', -- 'MALE' | 'FEMALE' | 'UNSPECIFIED'
  raw_screening_questions TEXT,
  raw_row_json JSONB,
  automated_result TEXT NOT NULL, -- 'PASS' | 'FAIL' | 'MANUAL_REVIEW' | 'ERROR'
  manual_result TEXT,
  effective_result TEXT NOT NULL,
  screening_reasons TEXT,
  override_reason TEXT,
  overridden_by TEXT,
  overridden_at TIMESTAMPTZ,
  source_person_code TEXT, -- Candidate person_id (e.g. 'P-000001')
  master_person_id UUID, -- Foreign key to master_people(id) once promoted
  link_status TEXT DEFAULT 'Not Linked', -- 'Not Linked' | 'Linked' | 'Needs Review'
  link_error TEXT,
  is_duplicate INT DEFAULT 0,
  duplicate_reason TEXT,
  assigned_recruiter TEXT,
  distributed_at TIMESTAMPTZ,
  review_decision TEXT,
  review_notes TEXT,
  retained_until TIMESTAMPTZ, -- For FAIL records: created_at + INTERVAL '35 days'
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_as_company ON public.applicants_staging(company);
CREATE INDEX IF NOT EXISTS idx_as_source_id ON public.applicants_staging(source_applicant_id);
CREATE INDEX IF NOT EXISTS idx_as_company_result ON public.applicants_staging(company, effective_result);
CREATE INDEX IF NOT EXISTS idx_as_company_date ON public.applicants_staging(company, date_applied DESC);
CREATE INDEX IF NOT EXISTS idx_as_email ON public.applicants_staging(email);
CREATE INDEX IF NOT EXISTS idx_as_phone ON public.applicants_staging(phone);
CREATE INDEX IF NOT EXISTS idx_as_full_name ON public.applicants_staging(full_name);
CREATE INDEX IF NOT EXISTS idx_as_person_code ON public.applicants_staging(source_person_code);
CREATE INDEX IF NOT EXISTS idx_as_retention ON public.applicants_staging(retained_until) WHERE effective_result = 'FAIL';

-- =============================================================================
-- 5. SCREENING RULES
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.screening_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  required_answer TEXT NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  is_mandatory INT DEFAULT 1,
  question_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Seed Baseline Screening Rules
INSERT INTO public.screening_rules (id, name, description, required_answer, status, is_mandatory, question_key)
VALUES
  ('rule-gc-1', 'Green Card / US Citizen', 'Applicant must possess a Green Card or US Citizenship. Mandatory requirement.', 'YES', 'ACTIVE', 1, 'GREEN_CARD_CITIZEN'),
  ('rule-sp-2', 'Future Sponsorship', 'Applicant must NOT require future visa sponsorship (e.g. H-1B visa status). Mandatory requirement.', 'NO', 'ACTIVE', 1, 'FUTURE_SPONSORSHIP'),
  ('rule-wa-3', 'US Work Authorization', 'Applicant must be legally authorized to work in the United States. Optional rule.', 'YES', 'ACTIVE', 0, 'US_WORK_AUTH'),
  ('rule-sa-4', 'South Asian Profile / Name Filter (IN, PK, BD, NP, LK)', 'Requires applicant to have an Indian, Pakistani, Bangladeshi, Nepalese, or Sri Lankan name or profile. Ambiguous names routed to Manual Review.', 'SOUTH_ASIAN', 'ACTIVE', 0, 'SOUTH_ASIAN_ORIGIN')
ON CONFLICT (question_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  required_answer = EXCLUDED.required_answer;

-- =============================================================================
-- 6. SCREENING OUTCOMES (DETAILED FIELD-BY-FIELD EVALUATION PER APPLICANT)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.screening_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID UNIQUE NOT NULL REFERENCES public.applicants_staging(id) ON DELETE CASCADE,
  source_applicant_id TEXT, -- Exact SQLite source reference
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  green_card_answer TEXT,
  sponsorship_answer TEXT,
  us_work_auth_answer TEXT,
  origin_region TEXT,
  origin_country TEXT,
  origin_match_reason TEXT,
  name_match_category TEXT,
  name_match_score REAL,
  name_matched_pattern TEXT,
  name_matched_reference TEXT,
  automated_result TEXT NOT NULL,
  manual_result TEXT,
  effective_result TEXT NOT NULL,
  screening_reasons TEXT,
  overridden_by TEXT,
  override_reason TEXT,
  overridden_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_so_company ON public.screening_outcomes(company);
CREATE INDEX IF NOT EXISTS idx_so_applicant ON public.screening_outcomes(applicant_id);
CREATE INDEX IF NOT EXISTS idx_so_source_applicant ON public.screening_outcomes(source_applicant_id);

-- =============================================================================
-- 7. MASTER CANDIDATE PROFILES (CANONICAL UNIQUE PERSONS)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.master_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id TEXT NOT NULL, -- e.g. 'P-000001'
  source_person_id TEXT, -- Original SQLite master_people.id for deterministic lineage
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT NOT NULL,
  gender TEXT DEFAULT 'Unspecified', -- 'Male' | 'Female' | 'Other' | 'Unspecified'
  primary_email TEXT,
  secondary_email TEXT,
  primary_phone TEXT,
  secondary_phone TEXT,
  location TEXT,
  zip_code TEXT,
  headline TEXT,
  current_title TEXT,
  current_company TEXT,
  linkedin_url TEXT,
  current_status TEXT DEFAULT 'New', -- 'New' | 'Open' | 'Assigned' | 'Contacted' | 'Follow-up' | 'Review' | 'Not Interested' | 'Closed' | 'Dead' | 'Merged'
  current_owner TEXT DEFAULT 'Unassigned',
  merged_into_id UUID REFERENCES public.master_people(id),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  last_activity_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT uq_person_company UNIQUE(person_id, company)
);

CREATE INDEX IF NOT EXISTS idx_mp_company ON public.master_people(company);
CREATE INDEX IF NOT EXISTS idx_mp_person_id ON public.master_people(person_id);
CREATE INDEX IF NOT EXISTS idx_mp_source_id ON public.master_people(source_person_id);
CREATE INDEX IF NOT EXISTS idx_mp_company_status ON public.master_people(company, current_status);
CREATE INDEX IF NOT EXISTS idx_mp_company_owner ON public.master_people(company, current_owner);
CREATE INDEX IF NOT EXISTS idx_mp_company_email ON public.master_people(company, primary_email);
CREATE INDEX IF NOT EXISTS idx_mp_company_phone ON public.master_people(company, primary_phone);
CREATE INDEX IF NOT EXISTS idx_mp_company_name ON public.master_people(company, full_name);
CREATE INDEX IF NOT EXISTS idx_mp_last_activity ON public.master_people(company, last_activity_at DESC);

-- Add Foreign Key constraint for applicants_staging.master_person_id after master_people exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'fk_as_master_person' AND table_name = 'applicants_staging'
  ) THEN
    ALTER TABLE public.applicants_staging 
    ADD CONSTRAINT fk_as_master_person 
    FOREIGN KEY (master_person_id) REFERENCES public.master_people(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================================================
-- 8. MASTER PERSON EMAILS & PHONES (NORMALIZED CONTACT CREDENTIALS)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.master_person_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.master_people(id) ON DELETE CASCADE,
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'import',
  first_seen_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  last_seen_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT uq_person_email_norm UNIQUE(person_id, normalized_email)
);

CREATE INDEX IF NOT EXISTS idx_mpe_company_norm ON public.master_person_emails(company, normalized_email);
CREATE INDEX IF NOT EXISTS idx_mpe_person ON public.master_person_emails(person_id);

CREATE TABLE IF NOT EXISTS public.master_person_phones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.master_people(id) ON DELETE CASCADE,
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  phone_original TEXT NOT NULL,
  phone_normalized TEXT NOT NULL, -- last 10 digits clean
  is_primary BOOLEAN DEFAULT FALSE,
  source TEXT DEFAULT 'import',
  first_seen_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  last_seen_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT uq_person_phone_norm UNIQUE(person_id, phone_normalized)
);

CREATE INDEX IF NOT EXISTS idx_mpp_company_norm ON public.master_person_phones(company, phone_normalized);
CREATE INDEX IF NOT EXISTS idx_mpp_person ON public.master_person_phones(person_id);

-- =============================================================================
-- 9. MASTER APPLICATIONS (LINKING INCOMING APPLICATIONS TO CANONICAL CANDIDATES)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.master_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_application_id TEXT UNIQUE, -- Exact SQLite master_applications.id
  source_applicant_id TEXT, -- Exact SQLite master_applications.applicant_id
  person_id UUID NOT NULL REFERENCES public.master_people(id) ON DELETE CASCADE,
  applicant_staging_id UUID REFERENCES public.applicants_staging(id) ON DELETE SET NULL,
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  job_id TEXT,
  job_title TEXT NOT NULL,
  date_applied DATE NOT NULL DEFAULT CURRENT_DATE,
  current_stage TEXT DEFAULT 'Applied',
  effective_result TEXT,
  source_file TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_ma_person ON public.master_applications(person_id);
CREATE INDEX IF NOT EXISTS idx_ma_company ON public.master_applications(company);
CREATE INDEX IF NOT EXISTS idx_ma_source_app_id ON public.master_applications(source_application_id);
CREATE INDEX IF NOT EXISTS idx_ma_source_applicant ON public.master_applications(source_applicant_id);
CREATE INDEX IF NOT EXISTS idx_ma_applicant_staging ON public.master_applications(applicant_staging_id);
CREATE INDEX IF NOT EXISTS idx_ma_company_job ON public.master_applications(company, job_id);

-- =============================================================================
-- 10. MASTER RECRUITER CONTACTS & VERBATIM FEEDBACK TIMELINE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.master_recruiter_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_contact_id TEXT UNIQUE,
  person_id UUID NOT NULL REFERENCES public.master_people(id) ON DELETE CASCADE,
  application_id UUID REFERENCES public.master_applications(id) ON DELETE SET NULL,
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  recruiter_name TEXT NOT NULL,
  contact_type TEXT NOT NULL DEFAULT 'Phone', -- 'Phone' | 'Email' | 'LinkedIn' | 'Note'
  contact_date DATE NOT NULL DEFAULT CURRENT_DATE,
  original_feedback TEXT NOT NULL, -- Verbatim unaltered text
  feedback_label TEXT, -- Original column header (e.g. 'Feedback 1', 'Remarks')
  column_index INT,
  source TEXT,
  source_file TEXT,
  source_row INT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_mrc_person_date ON public.master_recruiter_contacts(person_id, contact_date DESC);
CREATE INDEX IF NOT EXISTS idx_mrc_company ON public.master_recruiter_contacts(company);
CREATE INDEX IF NOT EXISTS idx_mrc_source_id ON public.master_recruiter_contacts(source_contact_id);

-- =============================================================================
-- 11. AMBIGUOUS MATCHES (FOR HUMAN RECRUITER REVIEW)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.master_possible_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_code TEXT UNIQUE NOT NULL,
  candidate_a_id UUID NOT NULL REFERENCES public.master_people(id) ON DELETE CASCADE,
  candidate_b_id UUID NOT NULL REFERENCES public.master_people(id) ON DELETE CASCADE,
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  match_reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending' | 'resolved' | 'dismissed'
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_mpm_company_status ON public.master_possible_matches(company, status);

-- =============================================================================
-- 12. MASTER STATUS HISTORY & AUDIT LOGS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.master_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.master_people(id) ON DELETE CASCADE,
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW())
);

CREATE INDEX IF NOT EXISTS idx_msh_person ON public.master_status_history(person_id);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  timestamp TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  applicant_id TEXT,
  applicant_name TEXT,
  previous_result TEXT,
  new_result TEXT,
  reason TEXT,
  details TEXT
);

CREATE INDEX IF NOT EXISTS idx_al_company ON public.audit_logs(company, timestamp DESC);

-- =============================================================================
-- 13. INCOMPLETE RECORDS REVIEW QUEUE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.incomplete_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  source_file TEXT,
  source_row_number INT,
  raw_data TEXT NOT NULL,
  extracted_name TEXT,
  extracted_email TEXT,
  extracted_phone TEXT,
  missing_reason TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending' | 'resolved' | 'dismissed'
  promoted_person_id UUID REFERENCES public.master_people(id),
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_ir_company_status ON public.incomplete_records(company, status);

-- =============================================================================
-- 14. JOBS (31 BASELINE REQUISITIONS)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  status TEXT DEFAULT 'Active', -- 'Active' | 'Closed' | 'Draft'
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT uq_jobs_company_slot UNIQUE(company, job_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_company ON public.jobs(company, status);

-- Seed 31 Baseline Jobs (21 AaraTech, 10 ClinisolTech)
INSERT INTO public.jobs (company, job_id, job_title) VALUES
  ('AaraTech', 'AT-001', 'Senior Full Stack Engineer'),
  ('AaraTech', 'AT-002', 'Data Analyst'),
  ('AaraTech', 'AT-003', 'CyberSecurity Specialist'),
  ('AaraTech', 'AT-004', 'Cloud DevOps Architect'),
  ('AaraTech', 'AT-005', 'Python Backend Developer'),
  ('AaraTech', 'AT-006', 'React Frontend Specialist'),
  ('AaraTech', 'AT-007', 'Machine Learning Engineer'),
  ('AaraTech', 'AT-008', 'Systems Administrator'),
  ('AaraTech', 'AT-009', 'QA Automation Engineer'),
  ('AaraTech', 'AT-010', 'Technical Project Manager'),
  ('AaraTech', 'AT-011', 'Database Administrator (PostgreSQL)'),
  ('AaraTech', 'AT-012', 'Network Security Engineer'),
  ('AaraTech', 'AT-013', 'Java Microservices Developer'),
  ('AaraTech', 'AT-014', 'Solutions Architect'),
  ('AaraTech', 'AT-015', 'Business Intelligence Developer'),
  ('AaraTech', 'AT-016', 'Scrum Master'),
  ('AaraTech', 'AT-017', 'Mobile App Developer (Flutter/iOS)'),
  ('AaraTech', 'AT-018', 'Site Reliability Engineer (SRE)'),
  ('AaraTech', 'AT-019', 'ERP Technical Consultant'),
  ('AaraTech', 'AT-020', 'SOC Analyst'),
  ('AaraTech', 'AT-021', 'Product Owner - Technical'),
  ('ClinisolTech', 'CT-001', 'Clinical Data Manager'),
  ('ClinisolTech', 'CT-002', 'SAS Programmer (Clinical Trials)'),
  ('ClinisolTech', 'CT-003', 'Regulatory Affairs Specialist'),
  ('ClinisolTech', 'CT-004', 'Biostatistician'),
  ('ClinisolTech', 'CT-005', 'Clinical Research Associate (CRA)'),
  ('ClinisolTech', 'CT-006', 'Pharmacovigilance Scientist'),
  ('ClinisolTech', 'CT-007', 'Medical Writer'),
  ('ClinisolTech', 'CT-008', 'Clinical Operations Lead'),
  ('ClinisolTech', 'CT-009', 'Validation Engineer (CSV)'),
  ('ClinisolTech', 'CT-010', 'QA Auditor - GxP')
ON CONFLICT (company, job_id) DO UPDATE SET job_title = EXCLUDED.job_title;

-- =============================================================================
-- 15. RECRUITERS (8 BASELINE RECRUITERS)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.recruiters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'Recruiter',
  active INT DEFAULT 1,
  leads_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT uq_recruiters_company_email UNIQUE(company, email)
);

CREATE INDEX IF NOT EXISTS idx_recruiters_company ON public.recruiters(company, active);

-- Seed 8 Baseline Recruiters
INSERT INTO public.recruiters (company, name, email, role) VALUES
  ('AaraTech', 'Sarah Jenkins', 'sarah.jenkins@aaratech.com', 'Senior Technical Recruiter'),
  ('AaraTech', 'David Miller', 'david.miller@aaratech.com', 'Cloud & DevOps Lead Recruiter'),
  ('AaraTech', 'Priya Sharma', 'priya.sharma@aaratech.com', 'Data & AI Talent Partner'),
  ('AaraTech', 'Alex Carter', 'alex.carter@aaratech.com', 'Full Stack & Enterprise Recruiter'),
  ('ClinisolTech', 'Dr. Elena Rostova', 'elena.rostova@clinisoltech.com', 'Lead Clinical Recruiter'),
  ('ClinisolTech', 'Marcus Vance', 'marcus.vance@clinisoltech.com', 'SAS & Biostatistics Recruiter'),
  ('ClinisolTech', 'Rachel Green', 'rachel.green@clinisoltech.com', 'Regulatory & GxP Talent Partner'),
  ('ClinisolTech', 'David Chen', 'david.chen@clinisoltech.com', 'Clinical Data Operations Recruiter')
ON CONFLICT (company, email) DO NOTHING;

-- =============================================================================
-- 16. MONTHLY HISTORICAL AGGREGATES (PERMANENT REPORTING ROLLUPS)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.monthly_application_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL REFERENCES public.companies(code) ON DELETE RESTRICT,
  year_month TEXT NOT NULL, -- Format: 'YYYY-MM'
  job_title TEXT NOT NULL,
  total_applications INT DEFAULT 0,
  passed_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  manual_review_count INT DEFAULT 0,
  unique_candidates_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()),
  CONSTRAINT uq_monthly_rollup UNIQUE(company, year_month, job_title)
);

CREATE INDEX IF NOT EXISTS idx_maa_company_month ON public.monthly_application_aggregates(company, year_month);

-- =============================================================================
-- 17. AUTOMATED 35-DAY RETENTION CLEANUP STORED PROCEDURE (ATOMIC & HARDENED)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.purge_expired_failed_applications()
RETURNS TABLE(purged_rows INT, updated_aggregates INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_purged INT := 0;
BEGIN
  -- 1. Advisory transaction lock to prevent concurrent executions from running simultaneously
  PERFORM pg_advisory_xact_lock(hashtext('purge_expired_failed_applications'));

  -- 2. Atomic delete-then-aggregate: Deletes expired FAIL records and immediately aggregates in the same statement.
  -- This mathematically eliminates double-counting on retry.
  WITH deleted_rows AS (
    DELETE FROM public.applicants_staging
    WHERE effective_result = 'FAIL'
      AND retained_until IS NOT NULL
      AND retained_until < NOW()
    RETURNING company, to_char(date_applied, 'YYYY-MM') AS year_month, job_title
  ),
  aggregated_counts AS (
    SELECT
      company,
      year_month,
      job_title,
      COUNT(*)::INT AS failed_cnt
    FROM deleted_rows
    GROUP BY company, year_month, job_title
  )
  INSERT INTO public.monthly_application_aggregates (
    company, year_month, job_title, total_applications, passed_count, failed_count, manual_review_count
  )
  SELECT
    company,
    year_month,
    job_title,
    failed_cnt,
    0,
    failed_cnt,
    0
  FROM aggregated_counts
  ON CONFLICT (company, year_month, job_title) DO UPDATE SET
    total_applications = public.monthly_application_aggregates.total_applications + EXCLUDED.total_applications,
    failed_count = public.monthly_application_aggregates.failed_count + EXCLUDED.failed_count,
    updated_at = NOW();

  GET DIAGNOSTICS v_purged = ROW_COUNT;
  RETURN QUERY SELECT v_purged, 1;
END;
$$;

-- Restrict execution to trusted service role only
REVOKE EXECUTE ON FUNCTION public.purge_expired_failed_applications() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_expired_failed_applications() FROM anon;
REVOKE EXECUTE ON FUNCTION public.purge_expired_failed_applications() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_failed_applications() TO service_role;

-- =============================================================================
-- 18. ROW LEVEL SECURITY (RLS) POLICIES FOR STRICT TENANT ISOLATION
-- =============================================================================

-- Enable RLS on all operational tenant tables
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicants_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.screening_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_person_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_person_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_recruiter_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_possible_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incomplete_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruiters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_application_aggregates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper Function 1: Extract User's Authorized Company from Server-Managed app_metadata (Fail-Closed)
CREATE OR REPLACE FUNCTION public.get_auth_company()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_company TEXT;
BEGIN
  -- Strictly extract from verified app_metadata; NEVER inspect client-editable user_metadata
  v_company := current_setting('request.jwt.claim.app_metadata', true)::json->>'company';
  -- If missing, empty, or unparseable, return NULL (fail closed)
  IF v_company IS NULL OR v_company = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_company;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- Fail closed on any parse error
END;
$$;

-- Helper Function 2: Verify Explicit Trusted Dual-Company Admin Access (Fail-Closed)
CREATE OR REPLACE FUNCTION public.is_admin_dual_company()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_company TEXT;
BEGIN
  -- Both role = 'admin' AND company = 'Both' must be present in server-managed app_metadata
  v_role := current_setting('request.jwt.claim.app_metadata', true)::json->>'role';
  v_company := current_setting('request.jwt.claim.app_metadata', true)::json->>'company';
  RETURN (v_role = 'admin' AND v_company = 'Both');
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE; -- Fail closed
END;
$$;

-- Apply Explicit Separate Tenant Policies on Operational Tables (Strictly Authenticated and Service Role ONLY)
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'import_batches', 'import_files', 'applicants_staging', 'screening_outcomes',
    'master_people', 'master_person_emails', 'master_person_phones', 'master_applications',
    'master_recruiter_contacts', 'master_possible_matches', 'master_status_history',
    'incomplete_records', 'monthly_application_aggregates', 'audit_logs'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- Drop any old policies
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_%s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_select_%s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_insert_%s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_update_%s" ON public.%I', tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_delete_%s" ON public.%I', tbl, tbl);

    -- 1. SELECT Policy (Denies anon, enforces verified company or admin)
    EXECUTE format('
      CREATE POLICY "tenant_select_%s" ON public.%I
      FOR SELECT
      TO authenticated, service_role
      USING (
        auth.role() = ''service_role''
        OR public.is_admin_dual_company() = TRUE
        OR (public.get_auth_company() IS NOT NULL AND company = public.get_auth_company())
      )
    ', tbl, tbl);

    -- 2. INSERT Policy (Ensures written records match authorized company)
    EXECUTE format('
      CREATE POLICY "tenant_insert_%s" ON public.%I
      FOR INSERT
      TO authenticated, service_role
      WITH CHECK (
        auth.role() = ''service_role''
        OR (public.is_admin_dual_company() = TRUE AND company IN (''AaraTech'', ''ClinisolTech''))
        OR (public.get_auth_company() IS NOT NULL AND company = public.get_auth_company())
      )
    ', tbl, tbl);

    -- 3. UPDATE Policy (Cannot read or reassign records across company boundary)
    EXECUTE format('
      CREATE POLICY "tenant_update_%s" ON public.%I
      FOR UPDATE
      TO authenticated, service_role
      USING (
        auth.role() = ''service_role''
        OR public.is_admin_dual_company() = TRUE
        OR (public.get_auth_company() IS NOT NULL AND company = public.get_auth_company())
      )
      WITH CHECK (
        auth.role() = ''service_role''
        OR (public.is_admin_dual_company() = TRUE AND company IN (''AaraTech'', ''ClinisolTech''))
        OR (public.get_auth_company() IS NOT NULL AND company = public.get_auth_company())
      )
    ', tbl, tbl);

    -- 4. DELETE Policy (Cannot delete records of another company)
    EXECUTE format('
      CREATE POLICY "tenant_delete_%s" ON public.%I
      FOR DELETE
      TO authenticated, service_role
      USING (
        auth.role() = ''service_role''
        OR public.is_admin_dual_company() = TRUE
        OR (public.get_auth_company() IS NOT NULL AND company = public.get_auth_company())
      )
    ', tbl, tbl);
  END LOOP;
END $$;

-- Jobs and Recruiters RLS Policies
DROP POLICY IF EXISTS "jobs_select_policy" ON public.jobs;
CREATE POLICY "jobs_select_policy" ON public.jobs FOR SELECT TO authenticated, service_role
USING (
  auth.role() = 'service_role' 
  OR public.is_admin_dual_company() = TRUE 
  OR (public.get_auth_company() IS NOT NULL AND company = public.get_auth_company())
);

DROP POLICY IF EXISTS "jobs_modify_policy" ON public.jobs;
CREATE POLICY "jobs_modify_policy" ON public.jobs FOR ALL TO authenticated, service_role
USING (auth.role() = 'service_role' OR public.is_admin_dual_company() = TRUE)
WITH CHECK (auth.role() = 'service_role' OR public.is_admin_dual_company() = TRUE);

DROP POLICY IF EXISTS "recruiters_select_policy" ON public.recruiters;
CREATE POLICY "recruiters_select_policy" ON public.recruiters FOR SELECT TO authenticated, service_role
USING (
  auth.role() = 'service_role' 
  OR public.is_admin_dual_company() = TRUE 
  OR (public.get_auth_company() IS NOT NULL AND company = public.get_auth_company())
);

DROP POLICY IF EXISTS "recruiters_modify_policy" ON public.recruiters;
CREATE POLICY "recruiters_modify_policy" ON public.recruiters FOR ALL TO authenticated, service_role
USING (auth.role() = 'service_role' OR public.is_admin_dual_company() = TRUE)
WITH CHECK (auth.role() = 'service_role' OR public.is_admin_dual_company() = TRUE);

-- Companies and Screening Rules RLS Policies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "companies_read_policy" ON public.companies;
CREATE POLICY "companies_read_policy" ON public.companies FOR SELECT TO authenticated, service_role USING (true);

ALTER TABLE public.screening_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "screening_rules_read_policy" ON public.screening_rules;
CREATE POLICY "screening_rules_read_policy" ON public.screening_rules FOR SELECT TO authenticated, service_role USING (true);

DROP POLICY IF EXISTS "screening_rules_write_policy" ON public.screening_rules;
CREATE POLICY "screening_rules_write_policy" ON public.screening_rules FOR ALL TO service_role
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- =============================================================================
-- Migration DDL Complete
-- =============================================================================
