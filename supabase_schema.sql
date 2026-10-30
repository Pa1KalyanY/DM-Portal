-- =========================================================================
-- LINKEDIN APPLICANT SCREENING & FILTERING SYSTEM - DATABASE SCHEMA (PHASE 1)
-- =========================================================================
-- IMPORTANT NOTICE:
-- This database schema is exclusively for the LinkedIn Applicant Screening &
-- Filtering System. It is strictly NOT the Master Candidate Database.
-- No candidate duplicate merging, recruiter history, or master candidate
-- identities are defined here.
-- =========================================================================

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. IMPORTS TABLE
CREATE TABLE IF NOT EXISTS imports (
    id TEXT PRIMARY KEY,
    import_code TEXT NOT NULL UNIQUE,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by TEXT NOT NULL,
    file_count INTEGER NOT NULL DEFAULT 0,
    total_applicants INTEGER NOT NULL DEFAULT 0,
    passed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    manual_review_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Completed'
);

-- 2. IMPORT FILES TABLE (Tracks 1 to 31+ uploaded files per batch)
CREATE TABLE IF NOT EXISTS import_files (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    row_count INTEGER NOT NULL DEFAULT 0,
    job_id TEXT,
    job_title TEXT,
    status TEXT NOT NULL DEFAULT 'PROCESSED',
    error_message TEXT,
    file_hash TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. APPLICANTS TABLE (Preserves 100% untouched raw row data & parsed screening fields)
CREATE TABLE IF NOT EXISTS applicants (
    id TEXT PRIMARY KEY,
    import_id TEXT NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
    source_file TEXT NOT NULL,
    source_worksheet TEXT NOT NULL,
    source_row_number INTEGER NOT NULL,
    
    -- Person Details
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
    date_applied TEXT,
    current_stage TEXT,
    
    -- Job Requisition Details
    job_id TEXT,
    job_title TEXT,
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
    
    -- Preserved Raw Screening Questions exactly from LinkedIn
    raw_screening_questions TEXT NOT NULL DEFAULT '',
    
    -- Parsed Answers
    green_card_answer TEXT NOT NULL DEFAULT 'MISSING', -- YES, NO, MISSING, UNCLEAR
    sponsorship_answer TEXT NOT NULL DEFAULT 'MISSING', -- YES, NO, MISSING, UNCLEAR
    us_work_auth_answer TEXT NOT NULL DEFAULT 'MISSING',
    
    -- Deterministic Screening Evaluation
    automated_result TEXT NOT NULL, -- PASS, FAIL, MANUAL_REVIEW, ERROR
    manual_result TEXT,              -- NULL or overridden status
    effective_result TEXT NOT NULL, -- PASS, FAIL, MANUAL_REVIEW, ERROR
    screening_reasons TEXT NOT NULL DEFAULT '',
    
    -- Manual Review & Audit Preservation
    override_reason TEXT,
    overridden_by TEXT,
    overridden_at TIMESTAMPTZ,
    
    -- Original Row Preservation
    raw_row_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast Indexing for 40,000+ applicants
CREATE INDEX IF NOT EXISTS idx_applicants_effective_result ON applicants(effective_result);
CREATE INDEX IF NOT EXISTS idx_applicants_job_id ON applicants(job_id);
CREATE INDEX IF NOT EXISTS idx_applicants_job_title ON applicants(job_title);
CREATE INDEX IF NOT EXISTS idx_applicants_email ON applicants(email);
CREATE INDEX IF NOT EXISTS idx_applicants_full_name ON applicants(full_name);
CREATE INDEX IF NOT EXISTS idx_applicants_import_id ON applicants(import_id);
CREATE INDEX IF NOT EXISTS idx_applicants_date_applied ON applicants(date_applied);

-- 4. SCREENING RULES TABLE
CREATE TABLE IF NOT EXISTS screening_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    required_answer TEXT NOT NULL, -- 'YES' or 'NO'
    status TEXT NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE' or 'INACTIVE'
    is_mandatory BOOLEAN NOT NULL DEFAULT FALSE,
    question_key TEXT NOT NULL UNIQUE
);

-- Insert Default Screening Rules
INSERT INTO screening_rules (id, name, description, required_answer, status, is_mandatory, question_key)
VALUES 
('rule-gc-1', 'Green Card / US Citizen', 'Applicant must possess a Green Card or US Citizenship. Mandatory requirement.', 'YES', 'ACTIVE', TRUE, 'GREEN_CARD_CITIZEN'),
('rule-sp-2', 'Future Sponsorship', 'Applicant must NOT require future visa sponsorship (e.g. H-1B visa status). Mandatory requirement.', 'NO', 'ACTIVE', TRUE, 'FUTURE_SPONSORSHIP'),
('rule-wa-3', 'US Work Authorization', 'Applicant must be legally authorized to work in the United States. Optional rule.', 'YES', 'ACTIVE', FALSE, 'US_WORK_AUTH')
ON CONFLICT (question_key) DO NOTHING;

-- 5. AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "user" TEXT NOT NULL,
    action TEXT NOT NULL,
    applicant_id TEXT,
    applicant_name TEXT,
    previous_result TEXT,
    new_result TEXT,
    reason TEXT NOT NULL,
    details TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
