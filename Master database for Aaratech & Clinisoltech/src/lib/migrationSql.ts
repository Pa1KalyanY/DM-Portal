// Complete PostgreSQL Migration SQL for Supabase SQL Editor
export const MASTER_SCHEMA_SQL = `-- Master Database Migration for AaraTech & ClinisolTech
-- Phase 1: Master Candidate Database Architecture
-- Enables 1 Person = 1 Master Profile with complete history preservation

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 1. Sequences for human-readable IDs
CREATE SEQUENCE IF NOT EXISTS person_id_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS import_id_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS match_code_seq START WITH 1 INCREMENT BY 1;

-- Function to format Person ID: P-000001
CREATE OR REPLACE FUNCTION generate_person_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'P-' || LPAD(nextval('person_id_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to format Import ID: IMP-000001
CREATE OR REPLACE FUNCTION generate_import_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'IMP-' || LPAD(nextval('import_id_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Function to format Possible Match Code: PM-000001
CREATE OR REPLACE FUNCTION generate_match_code()
RETURNS TEXT AS $$
BEGIN
  RETURN 'PM-' || LPAD(nextval('match_code_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- 2. People Table (Master Profile)
CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id TEXT UNIQUE NOT NULL DEFAULT generate_person_id(),
  first_name TEXT,
  last_name TEXT,
  full_name TEXT NOT NULL,
  gender TEXT DEFAULT 'Unspecified',
  primary_email TEXT,
  primary_phone TEXT,
  location TEXT,
  zip_code TEXT,
  headline TEXT,
  current_title TEXT,
  current_company TEXT,
  linkedin_url TEXT,
  current_status TEXT NOT NULL DEFAULT 'New',
  current_owner TEXT DEFAULT 'Unassigned',
  merged_into_id UUID REFERENCES people(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE people ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'Unspecified';

-- 3. Person Emails Table (Preserves multiple historical emails)
CREATE TABLE IF NOT EXISTS person_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  source TEXT,
  source_file TEXT,
  source_row INTEGER,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Person Phones Table (Preserves multiple historical phones & raw + normalized)
CREATE TABLE IF NOT EXISTS person_phones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  phone_original TEXT NOT NULL,
  phone_normalized TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  source TEXT,
  source_file TEXT,
  source_row INTEGER,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Jobs Table (AaraTech & ClinisolTech)
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company TEXT NOT NULL,
  job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_url TEXT,
  ats_job_id TEXT,
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Applications Table (Every historical application preserved)
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  job_id TEXT,
  job_title TEXT NOT NULL,
  job_url TEXT,
  ats_job_id TEXT,
  date_applied DATE NOT NULL DEFAULT CURRENT_DATE,
  current_stage TEXT NOT NULL DEFAULT 'Applied',
  minimum_salary NUMERIC,
  maximum_salary NUMERIC,
  currency_code TEXT DEFAULT 'USD',
  compensation_period TEXT DEFAULT 'annual',
  hiring_project_id TEXT,
  hiring_project_title TEXT,
  contract_id TEXT,
  contract_name TEXT,
  screening_questions_raw JSONB DEFAULT '[]'::jsonb,
  resume_link TEXT,
  source_file TEXT,
  source_row INTEGER,
  source_import_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Recruiter Contacts Table (Feedback stored verbatim)
CREATE TABLE IF NOT EXISTS recruiter_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  recruiter_name TEXT NOT NULL,
  contact_date DATE NOT NULL DEFAULT CURRENT_DATE,
  contact_type TEXT NOT NULL DEFAULT 'Phone',
  original_feedback TEXT NOT NULL,
  source TEXT,
  source_file TEXT,
  source_row INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. Imports Table
CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  import_status TEXT NOT NULL DEFAULT 'processing',
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  new_people INTEGER NOT NULL DEFAULT 0,
  matched_people INTEGER NOT NULL DEFAULT 0,
  possible_matches INTEGER NOT NULL DEFAULT 0,
  applications_created INTEGER NOT NULL DEFAULT 0,
  contacts_created INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  error_details JSONB DEFAULT '[]'::jsonb,
  uploaded_by TEXT NOT NULL DEFAULT 'Admin',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Import Rows Table (Traceability for every single row)
CREATE TABLE IF NOT EXISTS import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'success',
  matched_person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  match_type TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Person Status History
CREATE TABLE IF NOT EXISTS person_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Possible Matches Table
CREATE TABLE IF NOT EXISTS possible_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_code TEXT UNIQUE NOT NULL DEFAULT generate_match_code(),
  candidate_a_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  candidate_b_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  match_reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. Merges History Table (For audit and Unmerge)
CREATE TABLE IF NOT EXISTS merge_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  merged_person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  merged_by TEXT NOT NULL DEFAULT 'Admin',
  merged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  can_unmerge BOOLEAN NOT NULL DEFAULT true,
  unmerged_at TIMESTAMPTZ,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 13. Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'Admin',
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_people_person_id ON people(person_id);
CREATE INDEX IF NOT EXISTS idx_people_full_name ON people(full_name);
CREATE INDEX IF NOT EXISTS idx_people_full_name_trgm ON people USING gin(full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_people_primary_email ON people(primary_email);
CREATE INDEX IF NOT EXISTS idx_people_primary_phone ON people(primary_phone);
CREATE INDEX IF NOT EXISTS idx_people_linkedin_url ON people(linkedin_url);
CREATE INDEX IF NOT EXISTS idx_people_current_status ON people(current_status);
CREATE INDEX IF NOT EXISTS idx_people_current_owner ON people(current_owner);
CREATE INDEX IF NOT EXISTS idx_people_last_activity_at ON people(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_people_merged_into ON people(merged_into_id);

CREATE INDEX IF NOT EXISTS idx_emails_person_id ON person_emails(person_id);
CREATE INDEX IF NOT EXISTS idx_emails_normalized ON person_emails(normalized_email);

CREATE INDEX IF NOT EXISTS idx_phones_person_id ON person_phones(person_id);
CREATE INDEX IF NOT EXISTS idx_phones_normalized ON person_phones(phone_normalized);

CREATE INDEX IF NOT EXISTS idx_apps_person_id ON applications(person_id);
CREATE INDEX IF NOT EXISTS idx_apps_company ON applications(company);
CREATE INDEX IF NOT EXISTS idx_apps_date_applied ON applications(date_applied DESC);
CREATE INDEX IF NOT EXISTS idx_apps_job_title ON applications(job_title);

CREATE INDEX IF NOT EXISTS idx_contacts_person_id ON recruiter_contacts(person_id);
CREATE INDEX IF NOT EXISTS idx_contacts_app_id ON recruiter_contacts(application_id);
CREATE INDEX IF NOT EXISTS idx_contacts_date ON recruiter_contacts(contact_date DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_recruiter ON recruiter_contacts(recruiter_name);

CREATE INDEX IF NOT EXISTS idx_imports_status ON imports(import_status);
CREATE INDEX IF NOT EXISTS idx_imports_created ON imports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_rows_import_id ON import_rows(import_id);

CREATE INDEX IF NOT EXISTS idx_possible_matches_status ON possible_matches(status);
CREATE INDEX IF NOT EXISTS idx_possible_matches_candidates ON possible_matches(candidate_a_id, candidate_b_id);

-- Seed Jobs
INSERT INTO jobs (company, job_id, job_title, status) VALUES
('AaraTech', 'AT-001', 'Senior Full Stack Engineer', 'Active'),
('AaraTech', 'AT-002', 'Data Analyst', 'Active'),
('AaraTech', 'AT-003', 'CyberSecurity Specialist', 'Active'),
('AaraTech', 'AT-004', 'Cloud DevOps Architect', 'Active'),
('AaraTech', 'AT-005', 'Python Backend Developer', 'Active'),
('AaraTech', 'AT-006', 'React Frontend Specialist', 'Active'),
('AaraTech', 'AT-007', 'Machine Learning Engineer', 'Active'),
('AaraTech', 'AT-008', 'Systems Administrator', 'Active'),
('AaraTech', 'AT-009', 'QA Automation Engineer', 'Active'),
('AaraTech', 'AT-010', 'Technical Project Manager', 'Active'),
('AaraTech', 'AT-011', 'Database Administrator (PostgreSQL)', 'Active'),
('AaraTech', 'AT-012', 'Network Security Engineer', 'Active'),
('AaraTech', 'AT-013', 'Java Microservices Developer', 'Active'),
('AaraTech', 'AT-014', 'Solutions Architect', 'Active'),
('AaraTech', 'AT-015', 'Business Intelligence Developer', 'Active'),
('AaraTech', 'AT-016', 'Scrum Master', 'Active'),
('AaraTech', 'AT-017', 'Mobile Application Developer (Flutter/iOS)', 'Active'),
('AaraTech', 'AT-018', 'Site Reliability Engineer (SRE)', 'Active'),
('AaraTech', 'AT-019', 'ERP Technical Consultant', 'Active'),
('AaraTech', 'AT-020', 'Security Operations Center (SOC) Analyst', 'Active'),
('AaraTech', 'AT-021', 'Product Owner - Technical', 'Active'),
('ClinisolTech', 'CT-001', 'Clinical Data Manager', 'Active'),
('ClinisolTech', 'CT-002', 'SAS Programmer (Clinical Trials)', 'Active'),
('ClinisolTech', 'CT-003', 'Regulatory Affairs Specialist', 'Active'),
('ClinisolTech', 'CT-004', 'Biostatistician', 'Active'),
('ClinisolTech', 'CT-005', 'Clinical Research Associate (CRA)', 'Active'),
('ClinisolTech', 'CT-006', 'Pharmacovigilance Scientist', 'Active'),
('ClinisolTech', 'CT-007', 'Medical Writer', 'Active'),
('ClinisolTech', 'CT-008', 'Clinical Operations Lead', 'Active'),
('ClinisolTech', 'CT-009', 'Validation Engineer (CSV)', 'Active'),
('ClinisolTech', 'CT-010', 'Quality Assurance Auditor - GxP', 'Active')
ON CONFLICT DO NOTHING;

-- RLS Policies
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruiter_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE possible_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE merge_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read-write for internal CRM people" ON people FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for internal CRM person_emails" ON person_emails FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for internal CRM person_phones" ON person_phones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for internal CRM jobs" ON jobs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for internal CRM applications" ON applications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for internal CRM recruiter_contacts" ON recruiter_contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for internal CRM imports" ON imports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for internal CRM import_rows" ON import_rows FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for internal CRM person_status_history" ON person_status_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for internal CRM possible_matches" ON possible_matches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for internal CRM merge_history" ON merge_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow public read-write for internal CRM audit_log" ON audit_log FOR ALL USING (true) WITH CHECK (true);
`;
