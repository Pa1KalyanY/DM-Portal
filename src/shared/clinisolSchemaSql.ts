// Comprehensive ClinisolTech Supabase SQL Schema (18 Tables + RLS + 10 Requisitions + Recruiters)
export const CLINISOLTECH_SCHEMA_SQL = `-- =========================================================================
-- CLINISOLTECH SUPABASE COMPREHENSIVE PRODUCTION DATABASE SCHEMA
-- Project URL: https://cltnihvibgufoagjtrhr.supabase.co
-- Generated for: ClinisolTech Recruitment & Applicant Intelligence Platform
-- =========================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. SEQUENCES FOR HUMAN-READABLE IDENTIFIERS
CREATE SEQUENCE IF NOT EXISTS person_id_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS import_id_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS match_code_seq START WITH 1 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION generate_person_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'P-' || LPAD(nextval('person_id_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_import_id()
RETURNS TEXT AS $$
BEGIN
  RETURN 'IMP-' || LPAD(nextval('import_id_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_match_code()
RETURNS TEXT AS $$
BEGIN
  RETURN 'PM-' || LPAD(nextval('match_code_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- 3. RECRUITMENT SCREENING & APPLICANT FILTERING TABLES (PHASE 1)
-- =========================================================================

-- 3A. JOBS TABLE (Requisition Definitions)
CREATE TABLE IF NOT EXISTS public.jobs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    job_id TEXT NOT NULL UNIQUE,
    job_title TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    status TEXT NOT NULL DEFAULT 'Active',
    department TEXT DEFAULT 'Clinical Research',
    location TEXT DEFAULT 'Remote / US',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3B. RECRUITERS TABLE
CREATE TABLE IF NOT EXISTS public.recruiters (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'Recruiter',
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3C. IMPORTS TABLE (Ingestion Batches)
CREATE TABLE IF NOT EXISTS public.imports (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    import_code TEXT NOT NULL UNIQUE,
    batch_name TEXT,
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by TEXT NOT NULL DEFAULT 'Recruiter Admin',
    file_count INTEGER NOT NULL DEFAULT 0,
    total_applicants INTEGER NOT NULL DEFAULT 0,
    passed_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    manual_review_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Completed'
);

-- 3D. IMPORT FILES TABLE
CREATE TABLE IF NOT EXISTS public.import_files (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    import_id TEXT NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,
    row_count INTEGER NOT NULL DEFAULT 0,
    job_id TEXT,
    job_title TEXT,
    status TEXT NOT NULL DEFAULT 'PROCESSED',
    error_message TEXT,
    file_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3E. APPLICANTS TABLE (Direct Row Ingestion & Screening Results)
CREATE TABLE IF NOT EXISTS public.applicants (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    import_id TEXT NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    source_file TEXT NOT NULL,
    source_worksheet TEXT NOT NULL DEFAULT 'Sheet1',
    source_row_number INTEGER NOT NULL DEFAULT 1,
    
    -- Candidate Identity
    first_name TEXT,
    last_name TEXT,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    location TEXT,
    zip_code TEXT,
    headline TEXT,
    linkedin_url TEXT,
    date_applied TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Requisition Association
    job_id TEXT NOT NULL,
    job_title TEXT NOT NULL,
    normalized_role TEXT,
    
    -- Legal Work Authorization & Screening Inputs
    green_card_answer TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    sponsorship_answer TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    green_card_status BOOLEAN,
    sponsorship_status BOOLEAN,
    
    -- Screening Decisions
    raw_screening_status TEXT NOT NULL DEFAULT 'PASS',
    raw_screening_reasons TEXT NOT NULL DEFAULT '[]',
    effective_result TEXT NOT NULL DEFAULT 'PASS',
    status TEXT NOT NULL DEFAULT 'PASS',
    status_reason TEXT,
    
    -- Manual Overrides
    is_overridden BOOLEAN NOT NULL DEFAULT FALSE,
    overridden_at TIMESTAMPTZ,
    overridden_by TEXT,
    override_reason TEXT,
    
    -- Verification & Matching
    gender TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    name_match_category TEXT NOT NULL DEFAULT 'UNSPECIFIED',
    name_match_reason TEXT,
    reference_score NUMERIC(5,2) DEFAULT 0,
    reference_matches TEXT,
    
    -- Metadata
    raw_row_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3F. APPLICANT AUDIT LOG
CREATE TABLE IF NOT EXISTS public.applicant_audit (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    applicant_id TEXT NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    actor TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================================
-- 4. UNIFIED MASTER CANDIDATE DATABASE TABLES
-- =========================================================================

-- 4A. PEOPLE TABLE (Master Profiles)
CREATE TABLE IF NOT EXISTS public.people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id TEXT UNIQUE NOT NULL DEFAULT generate_person_id(),
    first_name TEXT,
    last_name TEXT,
    full_name TEXT NOT NULL,
    gender TEXT NOT NULL DEFAULT 'Unspecified',
    primary_email TEXT,
    primary_phone TEXT,
    location TEXT,
    zip_code TEXT,
    headline TEXT,
    summary TEXT,
    linkedin_url TEXT,
    current_company TEXT DEFAULT 'ClinisolTech',
    company_source TEXT DEFAULT 'ClinisolTech',
    candidate_status TEXT NOT NULL DEFAULT 'New',
    owner TEXT DEFAULT 'Unassigned',
    rating NUMERIC(2,1) DEFAULT 0,
    tags JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    date_applied TIMESTAMPTZ DEFAULT NOW(),
    is_incomplete BOOLEAN NOT NULL DEFAULT FALSE,
    incomplete_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4B. APPLICATIONS TABLE (Master Profile Application History)
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    job_id TEXT NOT NULL,
    job_title TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    date_applied TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'New',
    source TEXT DEFAULT 'LinkedIn',
    screening_status TEXT DEFAULT 'PASS',
    screening_reasons JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4C. RECRUITER ASSIGNMENTS TABLE
CREATE TABLE IF NOT EXISTS public.recruiter_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    recruiter_name TEXT NOT NULL,
    recruiter_email TEXT,
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'Active'
);

-- 4D. CONTACT ENRICHMENTS TABLE
CREATE TABLE IF NOT EXISTS public.contact_enrichments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    contact_type TEXT NOT NULL,
    contact_value TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4E. INTERACTION LOGS TABLE
CREATE TABLE IF NOT EXISTS public.interaction_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    interaction_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    details TEXT,
    actor TEXT NOT NULL DEFAULT 'Recruiter Admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4F. POSSIBLE MATCHES (Duplicate Candidates)
CREATE TABLE IF NOT EXISTS public.possible_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_code TEXT UNIQUE NOT NULL DEFAULT generate_match_code(),
    person_a_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    person_b_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    confidence_score NUMERIC(5,2) NOT NULL DEFAULT 50.0,
    match_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'Pending Review',
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4G. IMPORT BATCHES (Master Database Ingestions)
CREATE TABLE IF NOT EXISTS public.import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_name TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    imported_by TEXT NOT NULL DEFAULT 'Admin',
    total_records INTEGER NOT NULL DEFAULT 0,
    created_candidates INTEGER NOT NULL DEFAULT 0,
    updated_candidates INTEGER NOT NULL DEFAULT 0,
    duplicate_candidates INTEGER NOT NULL DEFAULT 0,
    incomplete_candidates INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4H. INCOMPLETE PROFILES TABLE
CREATE TABLE IF NOT EXISTS public.incomplete_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID REFERENCES public.people(id) ON DELETE SET NULL,
    raw_name TEXT NOT NULL,
    raw_contact TEXT,
    missing_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    status TEXT NOT NULL DEFAULT 'Unresolved',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4I. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    actor TEXT NOT NULL DEFAULT 'Admin',
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================================
-- 5. DIGITAL MARKETING OPERATIONS TABLES
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    status TEXT NOT NULL DEFAULT 'Active',
    objective TEXT,
    budget NUMERIC(10,2) DEFAULT 0,
    spend NUMERIC(10,2) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    channels JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketing_content (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    channel TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Draft',
    copy TEXT,
    scheduled_date TIMESTAMPTZ,
    published_date TIMESTAMPTZ,
    author TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketing_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    asset_type TEXT NOT NULL,
    url TEXT NOT NULL,
    size_bytes BIGINT,
    tags JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketing_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    channel_type TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    status TEXT NOT NULL DEFAULT 'Active',
    credentials JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketing_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'Content Creator',
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    allowed_companies JSONB NOT NULL DEFAULT '["ClinisolTech"]'::jsonb,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketing_daily_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    posts_published INTEGER DEFAULT 0,
    leads_generated INTEGER DEFAULT 0,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketing_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    company TEXT NOT NULL DEFAULT 'ClinisolTech',
    period TEXT NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =========================================================================
-- 6. INDEXES FOR LIGHTNING FAST SCREENING, FILTERING & DEDUPLICATION
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_applicants_company_job ON public.applicants (company, job_id);
CREATE INDEX IF NOT EXISTS idx_applicants_effective_result ON public.applicants (effective_result);
CREATE INDEX IF NOT EXISTS idx_applicants_batch_id ON public.applicants (import_id);
CREATE INDEX IF NOT EXISTS idx_applicants_email ON public.applicants (email);
CREATE INDEX IF NOT EXISTS idx_applicants_phone ON public.applicants (phone);
CREATE INDEX IF NOT EXISTS idx_applicants_date ON public.applicants (date_applied);

CREATE INDEX IF NOT EXISTS idx_people_company ON public.people (current_company);
CREATE INDEX IF NOT EXISTS idx_people_status ON public.people (candidate_status);
CREATE INDEX IF NOT EXISTS idx_people_email ON public.people (primary_email);
CREATE INDEX IF NOT EXISTS idx_people_phone ON public.people (primary_phone);
CREATE INDEX IF NOT EXISTS idx_people_name_trgm ON public.people USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_jobs_company ON public.jobs (company);
CREATE INDEX IF NOT EXISTS idx_imports_company ON public.imports (company);
CREATE INDEX IF NOT EXISTS idx_applications_person ON public.applications (person_id);
CREATE INDEX IF NOT EXISTS idx_possible_matches_status ON public.possible_matches (status);

-- =========================================================================
-- 7. ROW LEVEL SECURITY (RLS) & PUBLIC ACCESS POLICIES
-- =========================================================================

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruiters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applicant_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruiter_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_enrichments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interaction_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.possible_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incomplete_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_reports ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'jobs', 'recruiters', 'imports', 'import_files', 'applicants', 'applicant_audit',
        'people', 'applications', 'recruiter_assignments', 'contact_enrichments',
        'interaction_logs', 'possible_matches', 'import_batches', 'incomplete_profiles',
        'audit_logs', 'marketing_campaigns', 'marketing_content', 'marketing_assets',
        'marketing_channels', 'marketing_team_members', 'marketing_daily_logs', 'marketing_reports'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Public full access" ON public.%I', tbl);
        EXECUTE format('CREATE POLICY "Public full access" ON public.%I FOR ALL USING (true) WITH CHECK (true)', tbl);
    END LOOP;
END $$;

-- =========================================================================
-- 8. BASELINE CLINISOLTECH REQUISITIONS & RECRUITER SEED DATA
-- =========================================================================

INSERT INTO public.jobs (job_id, job_title, company, status, department)
VALUES
    ('CT-001', 'Clinical Data Manager', 'ClinisolTech', 'Active', 'Clinical Data Operations'),
    ('CT-002', 'SAS Programmer (Clinical Trials)', 'ClinisolTech', 'Active', 'Biostatistics & SAS'),
    ('CT-003', 'Regulatory Affairs Specialist', 'ClinisolTech', 'Active', 'Regulatory Affairs'),
    ('CT-004', 'Biostatistician', 'ClinisolTech', 'Active', 'Biostatistics'),
    ('CT-005', 'Clinical Research Associate (CRA)', 'ClinisolTech', 'Active', 'Clinical Operations'),
    ('CT-006', 'Pharmacovigilance Scientist', 'ClinisolTech', 'Active', 'Drug Safety & PV'),
    ('CT-007', 'Medical Writer', 'ClinisolTech', 'Active', 'Medical Communications'),
    ('CT-008', 'Clinical Operations Lead', 'ClinisolTech', 'Active', 'Clinical Operations'),
    ('CT-009', 'Validation Engineer (CSV)', 'ClinisolTech', 'Active', 'Computer Systems Validation'),
    ('CT-010', 'QA Auditor - GxP', 'ClinisolTech', 'Active', 'Quality Assurance & GxP')
ON CONFLICT (job_id) DO UPDATE 
SET job_title = EXCLUDED.job_title, company = EXCLUDED.company;

INSERT INTO public.recruiters (name, email, role, company, active)
VALUES
    ('Dr. Elena Rostova', 'elena.rostova@clinisoltech.com', 'Lead Clinical Recruiter', 'ClinisolTech', true),
    ('Marcus Vance', 'marcus.vance@clinisoltech.com', 'SAS & Biostatistics Recruiter', 'ClinisolTech', true),
    ('Rachel Green', 'rachel.green@clinisoltech.com', 'Regulatory & GxP Talent Partner', 'ClinisolTech', true),
    ('David Chen', 'david.chen@clinisoltech.com', 'Clinical Data Operations Recruiter', 'ClinisolTech', true)
ON CONFLICT (email) DO NOTHING;
`;
