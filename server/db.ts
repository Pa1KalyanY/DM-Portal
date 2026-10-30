import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Applicant, AuditLogEntry, DashboardStats, ImportRecord, PaginatedResult, PaginationParams, ScreeningRule } from '../src/types';
import { evaluateScreening } from '../src/shared/screeningEngine.js';
import { sanitizeContactNumber, normalizeJobRole } from '../src/shared/columnMapper.js';
import { classifySouthAsianOrigin } from '../src/shared/southAsianOriginClassifier.js';
import { classifyGender } from '../src/shared/genderClassifier.js';
import { GeminiClassificationResult } from './geminiService.js';
import { referenceNameMatcher, NameMatchCategory } from './referenceNameMatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '..', 'linkedin_screening.db');

function cleanLinkedinIdentifier(url?: string | null): string {
  if (!url) return '';
  return url.trim().toLowerCase()
    .replace(/^https?:\/\/(?:www\.)?linkedin\.com\/in\//i, '')
    .replace(/[/?#].*$/, '')
    .trim();
}

export const BASELINE_JOBS: Array<{ company: 'AaraTech' | 'ClinisolTech'; jobId: string; jobTitle: string }> = [
  // AaraTech (21 Jobs)
  { company: 'AaraTech', jobId: 'AT-001', jobTitle: 'Senior Full Stack Engineer' },
  { company: 'AaraTech', jobId: 'AT-002', jobTitle: 'Data Analyst' },
  { company: 'AaraTech', jobId: 'AT-003', jobTitle: 'CyberSecurity Specialist' },
  { company: 'AaraTech', jobId: 'AT-004', jobTitle: 'Cloud DevOps Architect' },
  { company: 'AaraTech', jobId: 'AT-005', jobTitle: 'Python Backend Developer' },
  { company: 'AaraTech', jobId: 'AT-006', jobTitle: 'React Frontend Specialist' },
  { company: 'AaraTech', jobId: 'AT-007', jobTitle: 'Machine Learning Engineer' },
  { company: 'AaraTech', jobId: 'AT-008', jobTitle: 'Systems Administrator' },
  { company: 'AaraTech', jobId: 'AT-009', jobTitle: 'QA Automation Engineer' },
  { company: 'AaraTech', jobId: 'AT-010', jobTitle: 'Technical Project Manager' },
  { company: 'AaraTech', jobId: 'AT-011', jobTitle: 'Database Administrator (PostgreSQL)' },
  { company: 'AaraTech', jobId: 'AT-012', jobTitle: 'Network Security Engineer' },
  { company: 'AaraTech', jobId: 'AT-013', jobTitle: 'Java Microservices Developer' },
  { company: 'AaraTech', jobId: 'AT-014', jobTitle: 'Solutions Architect' },
  { company: 'AaraTech', jobId: 'AT-015', jobTitle: 'Business Intelligence Developer' },
  { company: 'AaraTech', jobId: 'AT-016', jobTitle: 'Scrum Master' },
  { company: 'AaraTech', jobId: 'AT-017', jobTitle: 'Mobile App Developer (Flutter/iOS)' },
  { company: 'AaraTech', jobId: 'AT-018', jobTitle: 'Site Reliability Engineer (SRE)' },
  { company: 'AaraTech', jobId: 'AT-019', jobTitle: 'ERP Technical Consultant' },
  { company: 'AaraTech', jobId: 'AT-020', jobTitle: 'SOC Analyst' },
  { company: 'AaraTech', jobId: 'AT-021', jobTitle: 'Product Owner - Technical' },

  // ClinisolTech (10 Jobs)
  { company: 'ClinisolTech', jobId: 'CT-001', jobTitle: 'Clinical Data Manager' },
  { company: 'ClinisolTech', jobId: 'CT-002', jobTitle: 'SAS Programmer (Clinical Trials)' },
  { company: 'ClinisolTech', jobId: 'CT-003', jobTitle: 'Regulatory Affairs Specialist' },
  { company: 'ClinisolTech', jobId: 'CT-004', jobTitle: 'Biostatistician' },
  { company: 'ClinisolTech', jobId: 'CT-005', jobTitle: 'Clinical Research Associate (CRA)' },
  { company: 'ClinisolTech', jobId: 'CT-006', jobTitle: 'Pharmacovigilance Scientist' },
  { company: 'ClinisolTech', jobId: 'CT-007', jobTitle: 'Medical Writer' },
  { company: 'ClinisolTech', jobId: 'CT-008', jobTitle: 'Clinical Operations Lead' },
  { company: 'ClinisolTech', jobId: 'CT-009', jobTitle: 'Validation Engineer (CSV)' },
  { company: 'ClinisolTech', jobId: 'CT-010', jobTitle: 'QA Auditor - GxP' },
];

export const DEFAULT_RECRUITERS: Array<{ company: 'AaraTech' | 'ClinisolTech'; name: string; email: string; role: string }> = [
  { company: 'AaraTech', name: 'Sarah Jenkins', email: 'sarah.jenkins@aaratech.com', role: 'Senior Technical Recruiter' },
  { company: 'AaraTech', name: 'David Miller', email: 'david.miller@aaratech.com', role: 'Cloud & DevOps Lead Recruiter' },
  { company: 'AaraTech', name: 'Priya Sharma', email: 'priya.sharma@aaratech.com', role: 'Data & AI Talent Partner' },
  { company: 'AaraTech', name: 'Alex Carter', email: 'alex.carter@aaratech.com', role: 'Full Stack & Enterprise Recruiter' },
  { company: 'ClinisolTech', name: 'Dr. Elena Rostova', email: 'elena.rostova@clinisoltech.com', role: 'Lead Clinical Recruiter' },
  { company: 'ClinisolTech', name: 'Marcus Vance', email: 'marcus.vance@clinisoltech.com', role: 'SAS & Biostatistics Recruiter' },
  { company: 'ClinisolTech', name: 'Rachel Green', email: 'rachel.green@clinisoltech.com', role: 'Regulatory & GxP Talent Partner' },
  { company: 'ClinisolTech', name: 'David Chen', email: 'david.chen@clinisoltech.com', role: 'Clinical Data Operations Recruiter' },
];

export class DatabaseService {
  private db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(DB_PATH);
    this.initTables();
    this.initDefaultRules();
    this.ensureReferenceMatchingInitialized();
    // In Phase 2, promotion to Master Candidate Database is strictly manual & passed-only via transferPassedApplicationsToMaster
    // this.ensureMasterPromotionInitialized();
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS imports (
        id TEXT PRIMARY KEY,
        import_code TEXT UNIQUE,
        batch_name TEXT,
        uploaded_at TEXT,
        uploaded_by TEXT,
        file_count INTEGER,
        total_applicants INTEGER,
        passed_count INTEGER,
        failed_count INTEGER,
        manual_review_count INTEGER,
        error_count INTEGER,
        status TEXT
      );

      CREATE TABLE IF NOT EXISTS import_files (
        id TEXT PRIMARY KEY,
        import_id TEXT,
        filename TEXT,
        file_size INTEGER,
        row_count INTEGER,
        job_id TEXT,
        job_title TEXT,
        status TEXT,
        error_message TEXT,
        file_hash TEXT,
        FOREIGN KEY (import_id) REFERENCES imports(id)
      );

      CREATE TABLE IF NOT EXISTS applicants (
        id TEXT PRIMARY KEY,
        import_id TEXT,
        source_file TEXT,
        source_worksheet TEXT,
        source_row_number INTEGER,
        first_name TEXT,
        last_name TEXT,
        full_name TEXT,
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
        job_id TEXT,
        job_title TEXT,
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
        raw_screening_questions TEXT,
        green_card_answer TEXT,
        sponsorship_answer TEXT,
        us_work_auth_answer TEXT,
        automated_result TEXT,
        manual_result TEXT,
        effective_result TEXT,
        screening_reasons TEXT,
        override_reason TEXT,
        overridden_by TEXT,
        raw_row_json TEXT,
        gender TEXT DEFAULT 'UNSPECIFIED',
        created_at TEXT,
        FOREIGN KEY (import_id) REFERENCES imports(id)
      );

      CREATE INDEX IF NOT EXISTS idx_applicants_effective_result ON applicants(effective_result);
      CREATE INDEX IF NOT EXISTS idx_applicants_job_id ON applicants(job_id);
      CREATE INDEX IF NOT EXISTS idx_applicants_job_title ON applicants(job_title);
      CREATE INDEX IF NOT EXISTS idx_applicants_email ON applicants(email);
      CREATE INDEX IF NOT EXISTS idx_applicants_full_name ON applicants(full_name);
      CREATE INDEX IF NOT EXISTS idx_applicants_import_id ON applicants(import_id);

      CREATE TABLE IF NOT EXISTS screening_rules (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        required_answer TEXT,
        status TEXT,
        is_mandatory INTEGER,
        question_key TEXT UNIQUE
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        user TEXT,
        action TEXT,
        applicant_id TEXT,
        applicant_name TEXT,
        previous_result TEXT,
        new_result TEXT,
        reason TEXT,
        details TEXT
      );
    `);

    // Safe migration: Add gender column to existing database if absent, then index it
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN gender TEXT DEFAULT 'UNSPECIFIED';");
    } catch {}
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_gender ON applicants(gender);");
    } catch {}

    // Safe migration: Add company column for workspace isolation (AaraTech vs ClinisolTech)
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN company TEXT DEFAULT 'AaraTech';");
    } catch {}
    try {
      this.db.exec("ALTER TABLE imports ADD COLUMN company TEXT DEFAULT 'AaraTech';");
    } catch {}
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_company ON applicants(company);");
    } catch {}
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_imports_company ON imports(company);");
    } catch {}

    // Safe migration: Add workflow, batch, duplicate & recruiter columns to applicants
    const newApplicantCols = [
      "ALTER TABLE applicants ADD COLUMN batch_id TEXT;",
      "ALTER TABLE applicants ADD COLUMN application_date TEXT;",
      "ALTER TABLE applicants ADD COLUMN assigned_recruiter TEXT;",
      "ALTER TABLE applicants ADD COLUMN distributed_at TEXT;",
      "ALTER TABLE applicants ADD COLUMN is_duplicate INTEGER DEFAULT 0;",
      "ALTER TABLE applicants ADD COLUMN duplicate_reason TEXT;",
      "ALTER TABLE applicants ADD COLUMN master_person_id TEXT;",
      "ALTER TABLE applicants ADD COLUMN review_decision TEXT;",
      "ALTER TABLE applicants ADD COLUMN review_notes TEXT;",
    ];
    for (const sql of newApplicantCols) {
      try { this.db.exec(sql); } catch {}
    }
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_batch_id ON applicants(batch_id);");
    } catch {}
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_app_date ON applicants(application_date);");
    } catch {}
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_master_person ON applicants(master_person_id);");
    } catch {}
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_recruiter ON applicants(assigned_recruiter);");
    } catch {}

    // Safe migration: Add workflow columns to imports
    const newImportCols = [
      "ALTER TABLE imports ADD COLUMN application_date TEXT;",
      "ALTER TABLE imports ADD COLUMN job_slots TEXT;",
      "ALTER TABLE imports ADD COLUMN active_working_batch INTEGER DEFAULT 1;",
    ];
    for (const sql of newImportCols) {
      try { this.db.exec(sql); } catch {}
    }

    // Safe migration: Add link status & error columns
    try { this.db.exec("ALTER TABLE applicants ADD COLUMN link_status TEXT DEFAULT 'Not Linked';"); } catch {}
    try { this.db.exec("ALTER TABLE applicants ADD COLUMN link_error TEXT;"); } catch {}
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_link_status ON applicants(link_status);"); } catch {}
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_imports_app_date ON imports(application_date);"); } catch {}
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_company_appdate ON applicants(company, application_date);"); } catch {}
    // Safe backfill: Resolve any unpopulated applicant ingestion dates from their import metadata
    try {
      this.db.exec(`
        UPDATE applicants
        SET application_date = (
          SELECT application_date FROM imports WHERE imports.id = applicants.import_id
        )
        WHERE (application_date IS NULL OR application_date = '')
          AND import_id IN (SELECT id FROM imports WHERE application_date IS NOT NULL AND application_date != '');
      `);
    } catch {}
    try {
      this.db.exec(`
        UPDATE applicants
        SET application_date = (
          SELECT substr(uploaded_at, 1, 10) FROM imports WHERE imports.id = applicants.import_id
        )
        WHERE (application_date IS NULL OR application_date = '')
          AND import_id IN (SELECT id FROM imports WHERE uploaded_at IS NOT NULL AND uploaded_at != '');
      `);
    } catch {}
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_link_status ON applicants(link_status);"); } catch {}

    // Master Candidate Database Tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS master_people (
        id TEXT PRIMARY KEY,
        person_id TEXT UNIQUE NOT NULL,
        first_name TEXT,
        last_name TEXT,
        full_name TEXT NOT NULL,
        gender TEXT DEFAULT 'Unspecified',
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
        current_status TEXT DEFAULT 'New',
        current_owner TEXT DEFAULT 'Unassigned',
        company TEXT NOT NULL,
        merged_into_id TEXT,
        created_at TEXT,
        updated_at TEXT,
        last_activity_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_master_people_company ON master_people(company);
      CREATE INDEX IF NOT EXISTS idx_master_people_email ON master_people(primary_email);
      CREATE INDEX IF NOT EXISTS idx_master_people_phone ON master_people(primary_phone);
      CREATE INDEX IF NOT EXISTS idx_master_people_name ON master_people(full_name);

      CREATE TABLE IF NOT EXISTS master_person_emails (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        email TEXT NOT NULL,
        normalized_email TEXT NOT NULL,
        is_primary INTEGER DEFAULT 0,
        source TEXT,
        first_seen_at TEXT,
        last_seen_at TEXT,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mpe_person ON master_person_emails(person_id);
      CREATE INDEX IF NOT EXISTS idx_mpe_email ON master_person_emails(normalized_email);

      CREATE TABLE IF NOT EXISTS master_person_phones (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        phone_original TEXT NOT NULL,
        phone_normalized TEXT NOT NULL,
        is_primary INTEGER DEFAULT 0,
        source TEXT,
        first_seen_at TEXT,
        last_seen_at TEXT,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mpp_person ON master_person_phones(person_id);
      CREATE INDEX IF NOT EXISTS idx_mpp_phone ON master_person_phones(phone_normalized);

      CREATE TABLE IF NOT EXISTS master_applications (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        applicant_id TEXT,
        company TEXT NOT NULL,
        job_id TEXT,
        job_title TEXT NOT NULL,
        date_applied TEXT,
        current_stage TEXT,
        effective_result TEXT,
        source_file TEXT,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_ma_person ON master_applications(person_id);
      CREATE INDEX IF NOT EXISTS idx_ma_company ON master_applications(company);

      CREATE TABLE IF NOT EXISTS master_possible_matches (
        id TEXT PRIMARY KEY,
        match_code TEXT UNIQUE NOT NULL,
        candidate_a_id TEXT NOT NULL,
        candidate_b_id TEXT NOT NULL,
        match_reason TEXT NOT NULL,
        company TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS master_recruiter_contacts (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        recruiter_name TEXT NOT NULL,
        contact_type TEXT NOT NULL,
        notes TEXT,
        contact_date TEXT,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mrc_person ON master_recruiter_contacts(person_id);

      CREATE TABLE IF NOT EXISTS master_status_history (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        old_status TEXT,
        new_status TEXT,
        changed_by TEXT,
        reason TEXT,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_msh_person ON master_status_history(person_id);

      CREATE TABLE IF NOT EXISTS incomplete_records (
        id TEXT PRIMARY KEY,
        import_id TEXT NOT NULL,
        source_file TEXT,
        source_row_number INTEGER,
        raw_data TEXT NOT NULL,
        extracted_name TEXT,
        extracted_email TEXT,
        extracted_phone TEXT,
        missing_reason TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        company TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolved_by TEXT,
        promoted_person_id TEXT,
        FOREIGN KEY (import_id) REFERENCES imports(id)
      );
      CREATE INDEX IF NOT EXISTS idx_incomplete_records_company ON incomplete_records(company);
      CREATE INDEX IF NOT EXISTS idx_incomplete_records_status ON incomplete_records(status);
      CREATE INDEX IF NOT EXISTS idx_incomplete_records_import ON incomplete_records(import_id);
    `);

    try { this.db.exec("ALTER TABLE master_people ADD COLUMN secondary_email TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN secondary_phone TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_person_emails ADD COLUMN source TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_person_emails ADD COLUMN first_seen_at TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_person_emails ADD COLUMN last_seen_at TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_person_phones ADD COLUMN source TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_person_phones ADD COLUMN first_seen_at TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_person_phones ADD COLUMN last_seen_at TEXT;"); } catch {}

    // Master Candidate Database Enhancements: Assignments, Classified URLs & Distinct Dates
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN resume_url TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN unclassified_links TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN application_collected_date TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN recruiter_assigned_date TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN first_assigned_recruiter TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN first_confirmed_contacted_by TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN last_contacted_by TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN latest_contact_outcome TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN last_assignment_date TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN last_contact_date TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN resume_link TEXT;"); } catch {}

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS master_recruiter_assignments (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        recruiter_name TEXT NOT NULL,
        assigned_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Current',
        reassignment_reason TEXT,
        created_at TEXT NOT NULL,
        created_by TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mra_person ON master_recruiter_assignments(person_id);
    `);

    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN contact_method TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN outcome TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN feedback_1 TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN feedback_2 TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN next_follow_up TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN raw_feedback TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN source_file TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN created_by TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN application_id TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN source_row_number INTEGER;"); } catch {}
    try { this.db.exec("ALTER TABLE master_recruiter_assignments ADD COLUMN application_id TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_recruiter_assignments ADD COLUMN source_row_number INTEGER;"); } catch {}
    try { this.db.exec("ALTER TABLE master_recruiter_assignments ADD COLUMN source_file TEXT;"); } catch {}
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_mrc_app ON master_recruiter_contacts(application_id);"); } catch {}
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_mra_app ON master_recruiter_assignments(application_id);"); } catch {}

    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN application_collected_date TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN recruiter_assigned_date TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN assigned_recruiter TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN resume_url TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN unclassified_links TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN green_card TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN h1b_status TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN green_card TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN h1b_status TEXT;"); } catch {}

    // Phase 2: Master Transfers Table for Controlled, Idempotent Transfer Pipeline (Prompt Section 5 & 18)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS master_transfers (
        id TEXT PRIMARY KEY,
        screening_applicant_id TEXT NOT NULL,
        batch_id TEXT NOT NULL,
        company TEXT NOT NULL,
        person_id TEXT,
        application_id TEXT,
        transfer_status TEXT NOT NULL,
        duplicate_check_result TEXT NOT NULL,
        transferred_at TEXT NOT NULL,
        transferred_by TEXT DEFAULT 'Recruiter Admin',
        error_message TEXT,
        retry_count INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_mt_applicant ON master_transfers(screening_applicant_id);
      CREATE INDEX IF NOT EXISTS idx_mt_company_batch ON master_transfers(company, batch_id);
      CREATE INDEX IF NOT EXISTS idx_mt_status ON master_transfers(transfer_status);
    `);

    // Transfer status and tracking columns on applicants table
    try { this.db.exec("ALTER TABLE applicants ADD COLUMN transfer_status TEXT DEFAULT 'Not Transferred';"); } catch {}
    try { this.db.exec("ALTER TABLE applicants ADD COLUMN transferred_at TEXT;"); } catch {}
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_transfer_status ON applicants(transfer_status);"); } catch {}

    // Master application enhancements for technology analytics & traceability (Prompt Section 6 & 16)
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN technology TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN source_batch_id TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN screening_applicant_id TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN transfer_id TEXT;"); } catch {}
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_ma_tech ON master_applications(technology);"); } catch {}
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_ma_screening_applicant ON master_applications(screening_applicant_id);"); } catch {}

    // Imports enhancements for re-import protection & transfer statistics (Prompt Section 15)
    try { this.db.exec("ALTER TABLE imports ADD COLUMN file_hash TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE imports ADD COLUMN content_fingerprint TEXT;"); } catch {}
    try { this.db.exec("ALTER TABLE imports ADD COLUMN transferred_count INTEGER DEFAULT 0;"); } catch {}

    // Create Jobs table and Recruiters table for strict company-scoped operations
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        company TEXT NOT NULL,
        job_id TEXT NOT NULL,
        job_title TEXT NOT NULL,
        status TEXT DEFAULT 'Active',
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_jobs_company_slot ON jobs(company, job_id);

      CREATE TABLE IF NOT EXISTS recruiters (
        id TEXT PRIMARY KEY,
        company TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT DEFAULT 'Recruiter',
        active INTEGER DEFAULT 1,
        leads_count INTEGER DEFAULT 0,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_recruiters_company ON recruiters(company);
    `);

    // Seed 31 baseline job requisitions (21 AaraTech, 10 ClinisolTech) if table empty
    try {
      const jCount = (this.db.prepare('SELECT COUNT(*) as count FROM jobs').get() as { count: number }).count;
      if (jCount === 0) {
        const insertJob = this.db.prepare(`
          INSERT INTO jobs (id, company, job_id, job_title, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'Active', datetime('now'), datetime('now'))
        `);
        for (const j of BASELINE_JOBS) {
          insertJob.run(`job-${j.jobId.toLowerCase()}`, j.company, j.jobId, j.jobTitle);
        }
      }
    } catch {}

    // Seed initial recruiters for AaraTech & ClinisolTech if table empty
    try {
      const rCount = (this.db.prepare('SELECT COUNT(*) as count FROM recruiters').get() as { count: number }).count;
      if (rCount === 0) {
        const insertRec = this.db.prepare(`
          INSERT INTO recruiters (id, company, name, email, role, active, leads_count, created_at)
          VALUES (?, ?, ?, ?, ?, 1, 0, datetime('now'))
        `);
        for (const r of DEFAULT_RECRUITERS) {
          insertRec.run(`rec-${Math.random().toString(36).substring(2, 9)}`, r.company, r.name, r.email, r.role);
        }
      }
    } catch {}

    // Safe migration: Add origin columns for South Asian profile filtering
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN origin_region TEXT DEFAULT 'UNSPECIFIED';");
    } catch {}
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN origin_country TEXT;");
    } catch {}
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN origin_match_reason TEXT;");
    } catch {}
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_origin_region ON applicants(origin_region);");
    } catch {}

    // Safe migration: Add reference name matching columns
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN name_match_category TEXT DEFAULT 'No Match';");
    } catch {}
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN name_match_score REAL DEFAULT 0;");
    } catch {}
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN name_matched_pattern TEXT;");
    } catch {}
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN name_matched_reference TEXT;");
    } catch {}
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_name_match_category ON applicants(name_match_category);");
    } catch {}

    // Safe migration: Add normalized_role column to applicants
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN normalized_role TEXT;");
    } catch {}
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_normalized_role ON applicants(normalized_role);");
    } catch {}

    // Auto-repair & backfill existing records: normalized_role & reference name matching
    try {
      const needRoleOrMatch = this.db.prepare(`
        SELECT id, first_name, last_name, full_name, job_title, current_title, headline, source_file, name_match_category, name_match_score, normalized_role
        FROM applicants
        WHERE (normalized_role IS NULL OR normalized_role = '')
           OR (name_match_category IS NULL OR name_match_category = 'No Match' OR name_match_score = 0)
      `).all() as any[];

      if (needRoleOrMatch && needRoleOrMatch.length > 0) {
        const updateStmt = this.db.prepare(`
          UPDATE applicants
          SET normalized_role = ?,
              name_match_category = ?,
              name_match_score = ?,
              name_matched_pattern = ?,
              name_matched_reference = ?
          WHERE id = ?
        `);
        for (const row of needRoleOrMatch) {
          const fn = row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim();
          const normRole = row.normalized_role || normalizeJobRole(row.job_title || '', [row.current_title, row.headline, row.source_file].filter(Boolean).join(' '));
          const matchRes = referenceNameMatcher.evaluate(fn);
          updateStmt.run(
            normRole,
            matchRes.category,
            matchRes.score,
            matchRes.matchedPattern,
            matchRes.matchedReferenceName,
            row.id
          );
        }
      }
    } catch (err) {
      console.warn('[initDb] Auto-repair backfill notice:', err);
    }

    // Safe migration: sanitize existing phone numbers to remove +1 and symbols
    try {
      const phoneRows = this.db.prepare("SELECT id, phone FROM applicants WHERE phone IS NOT NULL AND phone != ''").all() as any[];
      const updatePhoneStmt = this.db.prepare("UPDATE applicants SET phone = ? WHERE id = ?");
      for (const row of phoneRows) {
        const cleaned = sanitizeContactNumber(row.phone);
        if (cleaned !== row.phone) {
          updatePhoneStmt.run(cleaned, row.id);
        }
      }
    } catch {}

    // Safe migration: add batch_name column to imports and populate for existing rows
    try {
      this.db.exec("ALTER TABLE imports ADD COLUMN batch_name TEXT;");
    } catch {}
    try {
      this.db.exec(`
        UPDATE imports
        SET batch_name = (
          SELECT COALESCE(NULLIF(job_title, ''), NULLIF(filename, ''), 'Import Batch')
          FROM import_files
          WHERE import_id = imports.id
          LIMIT 1
        )
        WHERE batch_name IS NULL OR batch_name = '';
      `);
    } catch {}

    // Synchronize and reevaluate all applicants with the latest Origin Rule and Reference Name Matcher
    try {
      this.reevaluateAllApplicants();
    } catch (err) {
      console.warn('[initDb] Initial applicant reevaluation notice:', err);
    }
  }

  reclassifyAllGenders(classifier: (first?: string, full?: string, headline?: string) => { gender: string }): { updated: number; male: number; female: number; unspecified: number } {
    const rows = this.db.prepare('SELECT id, first_name, full_name, headline FROM applicants').all() as any[];
    const stmt = this.db.prepare('UPDATE applicants SET gender = ? WHERE id = ?');
    let m = 0, f = 0, u = 0;
    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const r of rows) {
        const g = classifier(r.first_name, r.full_name, r.headline);
        stmt.run(g.gender, r.id);
        if (g.gender === 'MALE') m++;
        else if (g.gender === 'FEMALE') f++;
        else u++;
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return { updated: rows.length, male: m, female: f, unspecified: u };
  }

  private initDefaultRules() {
    const checkStmt = this.db.prepare('SELECT COUNT(*) as count FROM screening_rules');
    const row = checkStmt.get() as { count: number };
    if (row.count === 0) {
      const insertRule = this.db.prepare(`
        INSERT INTO screening_rules (id, name, description, required_answer, status, is_mandatory, question_key)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      // Rule 1: Mandatory Green Card / US Citizen
      insertRule.run(
        'rule-gc-1',
        'Green Card / US Citizen',
        'Applicant must possess a Green Card or US Citizenship. Mandatory requirement.',
        'YES',
        'ACTIVE',
        1,
        'GREEN_CARD_CITIZEN'
      );
      // Rule 2: Mandatory Future Sponsorship
      insertRule.run(
        'rule-sp-2',
        'Future Sponsorship',
        'Applicant must NOT require future visa sponsorship (e.g. H-1B visa status). Mandatory requirement.',
        'NO',
        'ACTIVE',
        1,
        'FUTURE_SPONSORSHIP'
      );
      // Rule 3: Optional US Work Authorization
      insertRule.run(
        'rule-wa-3',
        'US Work Authorization',
        'Applicant must be legally authorized to work in the United States. Optional rule.',
        'YES',
        'ACTIVE',
        0,
        'US_WORK_AUTH'
      );
    }

    // Ensure Rule 4: South Asian Regional Profile Filter is initialized
    try {
      const saCheck = this.db.prepare("SELECT COUNT(*) as count FROM screening_rules WHERE question_key = 'SOUTH_ASIAN_ORIGIN'").get() as { count: number };
      if (saCheck.count === 0) {
        const insertRule = this.db.prepare(`
          INSERT INTO screening_rules (id, name, description, required_answer, status, is_mandatory, question_key)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        insertRule.run(
          'rule-sa-4',
          'South Asian Profile / Name Filter (IN, PK, BD, NP, LK)',
          'Requires applicant to have an Indian, Pakistani, Bangladeshi, Nepalese, or Sri Lankan name or profile. Ambiguous or doubtful names are routed to Manual Review.',
          'SOUTH_ASIAN',
          'ACTIVE',
          0,
          'SOUTH_ASIAN_ORIGIN'
        );
      }
    } catch {}
  }

  // --- Screening Rules ---
  getScreeningRules(): ScreeningRule[] {
    const stmt = this.db.prepare('SELECT * FROM screening_rules');
    const rows = stmt.all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      requiredAnswer: r.required_answer,
      status: r.status,
      isMandatory: Boolean(r.is_mandatory),
      questionKey: r.question_key,
    }));
  }

  updateScreeningRule(id: string, updates: Partial<ScreeningRule>): boolean {
    const current = this.db.prepare('SELECT * FROM screening_rules WHERE id = ?').get(id) as any;
    if (!current) return false;

    // Safety: The two mandatory rules cannot have is_mandatory disabled or requiredAnswer altered to violate core policy
    let isMandatory = current.is_mandatory;
    let requiredAnswer = updates.requiredAnswer !== undefined ? updates.requiredAnswer : current.required_answer;
    let status = updates.status !== undefined ? updates.status : current.status;

    if (current.question_key === 'GREEN_CARD_CITIZEN' || current.question_key === 'FUTURE_SPONSORSHIP') {
      isMandatory = 1;
      status = 'ACTIVE'; // Must not accidentally be disabled from the normal processing workflow
      if (current.question_key === 'GREEN_CARD_CITIZEN') requiredAnswer = 'YES';
      if (current.question_key === 'FUTURE_SPONSORSHIP') requiredAnswer = 'NO';
    } else {
      if (updates.isMandatory !== undefined) {
        isMandatory = updates.isMandatory ? 1 : 0;
      }
    }

    const stmt = this.db.prepare(`
      UPDATE screening_rules
      SET description = COALESCE(?, description),
          required_answer = ?,
          status = ?,
          is_mandatory = ?
      WHERE id = ?
    `);
    stmt.run(updates.description || current.description, requiredAnswer, status, isMandatory, id);
    return true;
  }

  // --- Duplicate File Check ---
  checkDuplicateFile(filename: string, fileHash?: string): { isDuplicate: boolean; previousImportId?: string; previousUploadedAt?: string } {
    let stmt;
    if (fileHash) {
      stmt = this.db.prepare(`
        SELECT f.filename, i.import_code, i.uploaded_at
        FROM import_files f
        JOIN imports i ON f.import_id = i.id
        WHERE f.file_hash = ? OR f.filename = ?
        ORDER BY i.uploaded_at DESC LIMIT 1
      `);
      const row = stmt.get(fileHash, filename) as any;
      if (row) {
        return { isDuplicate: true, previousImportId: row.import_code, previousUploadedAt: row.uploaded_at };
      }
    } else {
      stmt = this.db.prepare(`
        SELECT f.filename, i.import_code, i.uploaded_at
        FROM import_files f
        JOIN imports i ON f.import_id = i.id
        WHERE f.filename = ?
        ORDER BY i.uploaded_at DESC LIMIT 1
      `);
      const row = stmt.get(filename) as any;
      if (row) {
        return { isDuplicate: true, previousImportId: row.import_code, previousUploadedAt: row.uploaded_at };
      }
    }
    return { isDuplicate: false };
  }

  getNextImportCode(): string {
    const rows = this.db.prepare("SELECT import_code FROM imports WHERE import_code LIKE 'IMP-%'").all() as { import_code: string }[];
    let maxNum = 0;
    for (const r of rows) {
      const match = r.import_code?.match(/IMP-(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
    let candidate = `IMP-${String(maxNum + 1).padStart(5, '0')}`;
    const exists = this.db.prepare('SELECT id FROM imports WHERE import_code = ?').get(candidate);
    if (exists) {
      candidate = `IMP-${Date.now().toString().slice(-6)}`;
    }
    return candidate;
  }

  createImport(
    importRecord: ImportRecord,
    company: 'AaraTech' | 'ClinisolTech' = 'AaraTech',
    applicationDate?: string,
    jobSlots?: string[]
  ): void {
    // Reset any other active_working_batch for this company to 0, so this new batch is the active one!
    try {
      this.db.prepare('UPDATE imports SET active_working_batch = 0 WHERE company = ?').run(company);
    } catch {}

    const insertImport = this.db.prepare(`
      INSERT INTO imports (
        id, import_code, batch_name, uploaded_at, uploaded_by, file_count, total_applicants,
        passed_count, failed_count, manual_review_count, error_count, status, company,
        application_date, job_slots, active_working_batch
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    const finalBatchName = importRecord.batchName || (importRecord.files && importRecord.files[0]?.jobTitle) || (importRecord.files && importRecord.files[0]?.filename) || importRecord.importCode;
    const finalDate = applicationDate || importRecord.uploadedAt.split('T')[0];
    insertImport.run(
      importRecord.id,
      importRecord.importCode,
      finalBatchName,
      importRecord.uploadedAt,
      importRecord.uploadedBy,
      importRecord.fileCount,
      importRecord.totalApplicants,
      importRecord.passedCount,
      importRecord.failedCount,
      importRecord.manualReviewCount,
      importRecord.errorCount,
      importRecord.status,
      company,
      finalDate,
      JSON.stringify(jobSlots || [])
    );

    const insertFile = this.db.prepare(`
      INSERT INTO import_files (id, import_id, filename, file_size, row_count, job_id, job_title, status, error_message, file_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const f of importRecord.files) {
      insertFile.run(
        `file-${Math.random().toString(36).substring(2, 9)}`,
        importRecord.id,
        f.filename,
        f.fileSize,
        f.rowCount,
        f.jobId || '',
        f.jobTitle || '',
        f.status,
        f.errorMessage || '',
        f.hash || ''
      );
    }
  }

  updateImportStats(importId: string, stats: { total: number; passed: number; failed: number; manualReview: number; errors: number; status: string }) {
    const stmt = this.db.prepare(`
      UPDATE imports
      SET total_applicants = ?, passed_count = ?, failed_count = ?, manual_review_count = ?, error_count = ?, status = ?
      WHERE id = ?
    `);
    stmt.run(stats.total, stats.passed, stats.failed, stats.manualReview, stats.errors, stats.status, importId);
  }

  // --- Applicants Batch Insertion (Company-Scoped & Duplicate-Safe) ---
  insertApplicants(
    applicants: Applicant[],
    company: 'AaraTech' | 'ClinisolTech' = 'AaraTech',
    batchId?: string,
    applicationDate?: string
  ): void {
    return this.insertApplicantsBatch(applicants, company, batchId, applicationDate);
  }

  insertApplicantsBatch(
    applicants: Applicant[],
    company: 'AaraTech' | 'ClinisolTech' = 'AaraTech',
    batchId?: string,
    applicationDate?: string
  ): void {
    if (applicants.length === 0) return;

    const now = new Date().toISOString();
    const targetBatchId = batchId || applicants[0]?.importId || `imp-${Date.now()}`;
    const targetAppDate = applicationDate || applicants[0]?.dateApplied || now.split('T')[0];

    this.db.exec('BEGIN TRANSACTION');
    try {
      // 1. Existing candidate lookup maps strictly within this company workspace
      const existingRows = this.db.prepare(`
        SELECT id, full_name, email, phone, profile_url, job_id, job_title, master_person_id, effective_result, automated_result
        FROM applicants
        WHERE company = ?
      `).all(company) as any[];

      const emailMap = new Map<string, any>();
      const emailJobsMap = new Map<string, Set<string>>();
      const linkedinMap = new Map<string, any>();
      const linkedinJobsMap = new Map<string, Set<string>>();
      const namePhoneMap = new Map<string, any>();
      const namePhoneJobsMap = new Map<string, Set<string>>();

      for (const r of existingRows) {
        const em = (r.email || '').trim().toLowerCase();
        const jKey = (r.job_id || r.job_title || '').trim().toLowerCase();
        if (em && em !== 'n/a' && em !== 'none' && em.includes('@')) {
          emailMap.set(em, r);
          if (!emailJobsMap.has(em)) emailJobsMap.set(em, new Set());
          if (jKey) emailJobsMap.get(em)!.add(jKey);
        }
        const li = cleanLinkedinIdentifier(r.profile_url);
        if (li && li.length >= 3) {
          linkedinMap.set(li, r);
          if (!linkedinJobsMap.has(li)) linkedinJobsMap.set(li, new Set());
          if (jKey) linkedinJobsMap.get(li)!.add(jKey);
        }
        const ph = (r.phone || '').replace(/\D/g, '').slice(-10);
        const nm = (r.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (nm && ph.length >= 7) {
          const npKey = `${nm}|${ph}`;
          namePhoneMap.set(npKey, r);
          if (!namePhoneJobsMap.has(npKey)) namePhoneJobsMap.set(npKey, new Set());
          if (jKey) namePhoneJobsMap.get(npKey)!.add(jKey);
        }
      }

      // 2. Intra-batch tracking to prevent identical row re-insertion
      const seenBatchJobKeys = new Set<string>();

      const stmt = this.db.prepare(`
        INSERT INTO applicants (
          id, import_id, source_file, source_worksheet, source_row_number,
          first_name, last_name, full_name, email, phone, location, zip_code,
          headline, current_title, current_company, current_position_start_date,
          education_degree, education_institution, profile_url, date_applied,
          current_stage, job_id, job_title, normalized_role, job_url, ats_job_id,
          min_salary, max_salary, currency_code, compensation_period,
          hiring_project_id, hiring_project_title, contract_id, contract_name,
          raw_screening_questions, green_card_answer, sponsorship_answer, us_work_auth_answer,
          origin_region, origin_country, origin_match_reason,
          name_match_category, name_match_score, name_matched_pattern, name_matched_reference,
          automated_result, manual_result, effective_result, screening_reasons,
          override_reason, overridden_by, overridden_at, raw_row_json, gender, created_at,
          company, batch_id, application_date, assigned_recruiter, distributed_at,
          is_duplicate, duplicate_reason, master_person_id, review_decision, review_notes
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?
        )
      `);

      for (const a of applicants) {
        const em = (a.email || '').trim().toLowerCase();
        const li = cleanLinkedinIdentifier(a.profileUrl);
        const ph = (a.phone || '').replace(/\D/g, '').slice(-10);
        const nm = (a.fullName || `${a.firstName || ''} ${a.lastName || ''}`).trim().toLowerCase().replace(/\s+/g, ' ');
        const curJobKey = (a.jobId || a.jobTitle || '').trim().toLowerCase();

        // Check if candidate exists in Master Candidate DB for this company
        let existingRecord: any = null;
        let appliedJobs: Set<string> | undefined;

        if (em && emailMap.has(em)) {
          existingRecord = emailMap.get(em);
          appliedJobs = emailJobsMap.get(em);
        } else if (li && linkedinMap.has(li)) {
          existingRecord = linkedinMap.get(li);
          appliedJobs = linkedinJobsMap.get(li);
        } else if (nm && ph.length >= 7 && namePhoneMap.has(`${nm}|${ph}`)) {
          existingRecord = namePhoneMap.get(`${nm}|${ph}`);
          appliedJobs = namePhoneJobsMap.get(`${nm}|${ph}`);
        }

        let isDuplicate = 0;
        let duplicateReason: string | null = null;
        const masterPersonId = existingRecord
          ? (existingRecord.master_person_id || existingRecord.id)
          : `P-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        // Re-upload detection: Check if already applied to the SAME job slot
        const candidateKey = em || li || `${nm}|${ph}`;
        const candidateJobKey = `${candidateKey}::${curJobKey}`;

        if (seenBatchJobKeys.has(candidateJobKey)) {
          isDuplicate = 1;
          duplicateReason = `Duplicate submission within current batch for job slot (${a.jobTitle || a.jobId})`;
        } else if (appliedJobs && curJobKey && appliedJobs.has(curJobKey)) {
          isDuplicate = 1;
          duplicateReason = `Candidate already applied to job slot (${a.jobTitle || a.jobId}) in ${company}`;
        }

        if (candidateJobKey) seenBatchJobKeys.add(candidateJobKey);

        const normalizedRole = a.normalizedRole || (a.jobTitle ? normalizeJobRole(a.jobTitle, [a.currentTitle, a.headline, a.sourceFile].filter(Boolean).join(' ')) : null);

        // Perform reference matching if not already set
        let nameMatch = { category: a.nameMatchCategory || 'No Match', score: a.nameMatchScore || 0, matchedPattern: a.nameMatchedPattern || '', matchedReferenceName: a.nameMatchedReference || '' };
        if (!a.nameMatchCategory || a.nameMatchCategory === 'No Match') {
          try {
            const matchResult = referenceNameMatcher.evaluate(a.fullName || `${a.firstName || ''} ${a.lastName || ''}`);
            nameMatch = {
              category: matchResult.category as any,
              score: matchResult.score,
              matchedPattern: matchResult.matchedPattern,
              matchedReferenceName: matchResult.matchedReferenceName,
            };
          } catch (err) {
            console.warn('[insertApplicants] reference matching error:', err);
          }
        }

        stmt.run(
          a.id ?? null,
          targetBatchId ?? null,
          a.sourceFile ?? null,
          a.sourceWorksheet ?? null,
          a.sourceRowNumber ?? null,
          a.firstName ?? null,
          a.lastName ?? null,
          a.fullName ?? null,
          a.email ?? null,
          sanitizeContactNumber(a.phone) ?? null,
          a.location ?? null,
          a.zipCode ?? null,
          a.headline ?? null,
          a.currentTitle ?? null,
          a.currentCompany ?? null,
          a.currentPositionStartDate ?? null,
          a.educationDegree ?? null,
          a.educationInstitution ?? null,
          a.profileUrl ?? null,
          (a.dateApplied || null),
          a.currentStage ?? null,
          a.jobId ?? null,
          a.jobTitle ?? null,
          normalizedRole ?? null,
          a.jobUrl ?? null,
          a.atsJobId ?? null,
          a.minSalary ?? null,
          a.maxSalary ?? null,
          a.currencyCode ?? null,
          a.compensationPeriod ?? null,
          a.hiringProjectId ?? null,
          a.hiringProjectTitle ?? null,
          a.contractId ?? null,
          a.contractName ?? null,
          a.rawScreeningQuestions ?? null,
          a.greenCardCitizenAnswer ?? null,
          a.sponsorshipAnswer ?? null,
          a.usWorkAuthAnswer ?? null,
          (a.originRegion || 'UNSPECIFIED') ?? null,
          a.originCountry ?? null,
          a.originMatchReason ?? null,
          nameMatch.category ?? null,
          nameMatch.score ?? null,
          nameMatch.matchedPattern ?? null,
          nameMatch.matchedReferenceName ?? null,
          a.automatedResult ?? null,
          a.manualResult ?? null,
          a.effectiveResult ?? null,
          a.screeningReasons ?? null,
          a.overrideReason ?? null,
          a.overriddenBy ?? null,
          a.overriddenAt ?? null,
          JSON.stringify(a.rawRowData || {}),
          (a.gender || 'UNSPECIFIED') ?? null,
          (a.createdAt || now) ?? null,
          company ?? null,
          targetBatchId ?? null,
          targetAppDate ?? null,
          a.assignedRecruiter ?? null,
          a.distributedAt ?? null,
          isDuplicate ?? 0,
          duplicateReason ?? null,
          masterPersonId ?? null,
          (a.reviewDecision || (a.effectiveResult === 'PASS' ? 'APPROVED' : null)) ?? null,
          a.reviewNotes ?? null
        );

        // Add to lookup maps
        if (em && em.includes('@')) {
          emailMap.set(em, { id: a.id, master_person_id: masterPersonId });
          if (!emailJobsMap.has(em)) emailJobsMap.set(em, new Set());
          if (curJobKey) emailJobsMap.get(em)!.add(curJobKey);
        }
        if (li && li.length >= 3) {
          linkedinMap.set(li, { id: a.id, master_person_id: masterPersonId });
          if (!linkedinJobsMap.has(li)) linkedinJobsMap.set(li, new Set());
          if (curJobKey) linkedinJobsMap.get(li)!.add(curJobKey);
        }
        if (nm && ph.length >= 7) {
          const npKey = `${nm}|${ph}`;
          namePhoneMap.set(npKey, { id: a.id, master_person_id: masterPersonId });
          if (!namePhoneJobsMap.has(npKey)) namePhoneJobsMap.set(npKey, new Set());
          if (curJobKey) namePhoneJobsMap.get(npKey)!.add(curJobKey);
        }
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }


  // --- Paginated Applicants Query ---
  private buildApplicantWhereClause(params: PaginationParams): { whereClause: string; values: any[] } {
    const conditions: string[] = [];
    const values: any[] = [];

    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push(`(
        full_name LIKE ? OR
        first_name LIKE ? OR
        last_name LIKE ? OR
        name_matched_reference LIKE ? OR
        headline LIKE ? OR
        origin_country LIKE ? OR
        email LIKE ? OR
        phone LIKE ? OR
        current_company LIKE ? OR
        current_title LIKE ? OR
        job_title LIKE ? OR
        job_id LIKE ? OR
        profile_url LIKE ?
      )`);
      values.push(q, q, q, q, q, q, q, q, q, q, q, q, q);
    }

    if (params.status && params.status !== 'ALL') {
      conditions.push('effective_result = ?');
      values.push(params.status);
    }

    if (params.gender && params.gender !== 'ALL') {
      conditions.push('gender = ?');
      values.push(params.gender);
    }

    if (params.origin && params.origin !== 'ALL') {
      if (params.origin === 'SOUTH_ASIAN') {
        conditions.push("origin_region = 'SOUTH_ASIAN'");
      } else if (params.origin === 'MANUAL_REVIEW_ORIGIN' || params.origin === 'UNCERTAIN' || params.origin === 'OTHER') {
        conditions.push("origin_region != 'SOUTH_ASIAN'");
      }
    }

    if (params.nameMatchCategory && params.nameMatchCategory !== 'ALL') {
      conditions.push('name_match_category = ?');
      values.push(params.nameMatchCategory);
    }

    if ((params as any).normalizedRole && (params as any).normalizedRole !== 'ALL') {
      conditions.push('(normalized_role = ? OR job_title LIKE ?)');
      values.push((params as any).normalizedRole, `%${(params as any).normalizedRole}%`);
    }

    if (params.jobId) {
      conditions.push('job_id = ?');
      values.push(params.jobId);
    }

    if (params.jobTitle) {
      conditions.push('job_title LIKE ?');
      values.push(`%${params.jobTitle}%`);
    }

    if (params.company) {
      if (params.company === 'AaraTech' || params.company === 'ClinisolTech') {
        conditions.push('company = ?');
        values.push(params.company);
      } else {
        conditions.push('(company = ? OR current_company LIKE ?)');
        values.push(params.company, `%${params.company}%`);
      }
    }

    if ((params as any).batchId) {
      conditions.push('(import_id = ? OR batch_id = ?)');
      values.push((params as any).batchId, (params as any).batchId);
    }

    // Strict Portal Ingestion Date filter
    if ((params as any).applicationDate && (params as any).applicationDate !== 'ALL') {
      conditions.push('application_date = ?');
      values.push((params as any).applicationDate);
    }

    // Portal Ingestion Date range filter (for historical review)
    if ((params as any).startDate && (params as any).endDate) {
      conditions.push('(application_date >= ? AND application_date <= ?)');
      values.push((params as any).startDate, (params as any).endDate);
    } else if ((params as any).startDate) {
      conditions.push('application_date >= ?');
      values.push((params as any).startDate);
    } else if ((params as any).endDate) {
      conditions.push('application_date <= ?');
      values.push((params as any).endDate);
    }

    // Separate filter for source application date (if explicitly requested)
    if ((params as any).sourceApplicationDate) {
      conditions.push('date_applied LIKE ?');
      values.push(`%${(params as any).sourceApplicationDate}%`);
    }

    if ((params as any).isDuplicate !== undefined && (params as any).isDuplicate !== 'ALL') {
      const isDup = (params as any).isDuplicate === true || (params as any).isDuplicate === '1' || (params as any).isDuplicate === 'true';
      conditions.push('is_duplicate = ?');
      values.push(isDup ? 1 : 0);
    }

    if ((params as any).assignedRecruiter) {
      conditions.push('assigned_recruiter = ?');
      values.push((params as any).assignedRecruiter);
    }

    if (params.stage) {
      conditions.push('current_stage LIKE ?');
      values.push(`%${params.stage}%`);
    }

    if (params.location) {
      conditions.push('location LIKE ?');
      values.push(`%${params.location}%`);
    }

    if (params.hasEmail) {
      conditions.push("email IS NOT NULL AND email != ''");
    }

    if (params.hasPhone) {
      conditions.push("phone IS NOT NULL AND phone != ''");
    }

    if (params.hasLinkedIn) {
      conditions.push("profile_url IS NOT NULL AND profile_url != ''");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, values };
  }

  getApplicants(params: PaginationParams): PaginatedResult<Applicant> {
    const { whereClause, values } = this.buildApplicantWhereClause(params);

    const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM applicants ${whereClause}`);
    const total = (countStmt.get(...values) as { count: number }).count;

    const page = Math.max(1, params.page || 1);
    const pageSize = Math.max(1, Math.min(200, params.pageSize || 25));
    const offset = (page - 1) * pageSize;

    // Sorting
    let sortColumn = 'created_at';
    if (params.sortBy) {
      const allowedCols = ['full_name', 'email', 'phone', 'current_title', 'current_company', 'job_title', 'date_applied', 'effective_result', 'source_row_number'];
      if (allowedCols.includes(params.sortBy)) {
        sortColumn = params.sortBy;
      }
    }
    const sortDir = params.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const dataStmt = this.db.prepare(`
      SELECT * FROM applicants
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDir}
      LIMIT ? OFFSET ?
    `);
    const rows = dataStmt.all(...values, pageSize, offset) as any[];

    const data: Applicant[] = rows.map(r => this.mapRowToApplicant(r));

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  }

  getAllApplicantIds(params: PaginationParams): string[] {
    const { whereClause, values } = this.buildApplicantWhereClause(params);
    let sortColumn = 'created_at';
    if (params.sortBy) {
      const allowedCols = ['full_name', 'email', 'phone', 'current_title', 'current_company', 'job_title', 'date_applied', 'effective_result', 'source_row_number'];
      if (allowedCols.includes(params.sortBy)) {
        sortColumn = params.sortBy;
      }
    }
    const sortDir = params.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const stmt = this.db.prepare(`SELECT id FROM applicants ${whereClause} ORDER BY ${sortColumn} ${sortDir}`);
    const rows = stmt.all(...values) as { id: string }[];
    return rows.map(r => r.id);
  }

  getApplicantsByIds(ids: string[]): Applicant[] {
    if (!ids || ids.length === 0) return [];
    const chunkSize = 500;
    const allApplicants: Applicant[] = [];
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');
      const stmt = this.db.prepare(`SELECT * FROM applicants WHERE id IN (${placeholders})`);
      const rows = stmt.all(...chunk) as any[];
      const mapped = rows.map(r => this.mapRowToApplicant(r));
      allApplicants.push(...mapped);
    }
    // Maintain the order of the requested IDs
    const map = new Map<string, Applicant>();
    allApplicants.forEach(a => map.set(a.id, a));
    return ids.map(id => map.get(id)).filter((a): a is Applicant => Boolean(a));
  }

  getApplicantById(id: string): Applicant | null {
    const stmt = this.db.prepare('SELECT * FROM applicants WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return this.mapRowToApplicant(row);
  }

  // --- Recalculate Batch Import Counts ---
  recalculateImportStats(importId: string): void {
    if (!importId) return;
    try {
      const stats = this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed,
          SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN effective_result = 'MANUAL_REVIEW' THEN 1 ELSE 0 END) as manualReview,
          SUM(CASE WHEN effective_result = 'ERROR' THEN 1 ELSE 0 END) as errors
        FROM applicants
        WHERE import_id = ?
      `).get(importId) as any;

      if (stats) {
        this.db.prepare(`
          UPDATE imports
          SET total_applicants = ?, passed_count = ?, failed_count = ?, manual_review_count = ?, error_count = ?
          WHERE id = ?
        `).run(
          stats.total || 0,
          stats.passed || 0,
          stats.failed || 0,
          stats.manualReview || 0,
          stats.errors || 0,
          importId
        );
      }
    } catch (err) {
      console.error('[DatabaseService] Failed to recalculate import stats:', err);
    }
  }

  // --- Manual Override with Audit Log Preservation ---
  overrideApplicantStatus(id: string, newStatus: 'PASS' | 'FAIL' | 'MANUAL_REVIEW', user = 'Recruiter Admin', reason?: string): boolean {
    const current = this.db.prepare('SELECT * FROM applicants WHERE id = ?').get(id) as any;
    if (!current) return false;

    const previousEffective = current.effective_result;
    const now = new Date().toISOString();
    const finalReason = reason && reason.trim() ? reason.trim() : (
      newStatus === 'PASS'
        ? 'Manually added to PASS'
        : newStatus === 'MANUAL_REVIEW'
        ? 'Removed from PASS — moved to Manual Review'
        : `Status changed to ${newStatus}`
    );

    const updateStmt = this.db.prepare(`
      UPDATE applicants
      SET manual_result = ?,
          effective_result = ?,
          override_reason = ?,
          overridden_by = ?,
          overridden_at = ?
      WHERE id = ?
    `);
    updateStmt.run(newStatus, newStatus, finalReason, user || 'Recruiter Admin', now, id);

    // Keep import record statistics synchronized
    if (current.import_id) {
      this.recalculateImportStats(current.import_id);
    }

    // Record audit log
    this.addAuditLog({
      id: `audit-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: now,
      user: user || 'Recruiter Admin',
      action: 'Manual Review Decision',
      applicantId: id,
      applicantName: current.full_name,
      previousResult: previousEffective,
      newResult: newStatus,
      reason: finalReason,
      details: `Changed effective result (${previousEffective}) to (${newStatus}).`,
    });

    return true;
  }

  batchOverrideApplicantStatus(
    ids: string[],
    newStatus: 'PASS' | 'FAIL' | 'MANUAL_REVIEW',
    user = 'Recruiter Admin',
    reason?: string
  ): number {
    if (ids.length === 0) return 0;
    const now = new Date().toISOString();
    const finalReason = reason && reason.trim() ? reason.trim() : (
      newStatus === 'PASS'
        ? 'Bulk added to PASS'
        : newStatus === 'MANUAL_REVIEW'
        ? 'Bulk removed from PASS — moved to Manual Review'
        : `Bulk status change to ${newStatus}`
    );

    // Identify affected import IDs before update
    const affectedImportRows = this.db.prepare(
      `SELECT DISTINCT import_id FROM applicants WHERE id IN (${ids.map(() => '?').join(',')})`
    ).all(...ids) as any[];

    this.db.exec('BEGIN TRANSACTION');
    try {
      const updateStmt = this.db.prepare(`
        UPDATE applicants
        SET manual_result = ?,
            effective_result = ?,
            override_reason = ?,
            overridden_by = ?,
            overridden_at = ?
        WHERE id = ?
      `);

      let count = 0;
      for (const id of ids) {
        updateStmt.run(newStatus, newStatus, finalReason, user || 'Recruiter Admin', now, id);
        count++;
      }
      this.db.exec('COMMIT');

      // Recalculate import counts for all affected batches
      for (const row of affectedImportRows) {
        if (row.import_id) {
          this.recalculateImportStats(row.import_id);
        }
      }

      return count;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  deleteApplicant(id: string): boolean {
    const current = this.db.prepare('SELECT import_id FROM applicants WHERE id = ?').get(id) as any;
    const stmt = this.db.prepare('DELETE FROM applicants WHERE id = ?');
    const res = stmt.run(id);
    if (current && current.import_id) {
      this.recalculateImportStats(current.import_id);
    }
    return (res as any).changes > 0;
  }

  // --- Gender Modification ---
  updateApplicantGender(id: string, gender: string, user = 'Recruiter Admin'): boolean {
    const valid = ['MALE', 'FEMALE', 'UNSPECIFIED'];
    const normGender = gender.toUpperCase().trim();
    if (!valid.includes(normGender)) {
      throw new Error(`Invalid gender: ${gender}. Must be MALE, FEMALE, or UNSPECIFIED.`);
    }

    const current = this.db.prepare('SELECT id, full_name, gender FROM applicants WHERE id = ?').get(id) as any;
    if (!current) return false;

    const stmt = this.db.prepare('UPDATE applicants SET gender = ? WHERE id = ?');
    stmt.run(normGender, id);

    this.addAuditLog({
      id: `audit-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      user,
      action: 'Gender Modified',
      applicantId: id,
      applicantName: current.full_name,
      previousResult: current.gender,
      newResult: normGender,
      reason: `Gender changed from ${current.gender} to ${normGender}`,
      details: `Recruiter modified gender classification for candidate ${current.full_name}`,
    });

    return true;
  }

  // --- Audit Log Management ---
  addAuditLog(entry: AuditLogEntry): void {
    const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user, action, applicant_id, applicant_name, previous_result, new_result, reason, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      entry.id,
      entry.timestamp,
      entry.user,
      entry.action,
      entry.applicantId || null,
      entry.applicantName || null,
      entry.previousResult || null,
      entry.newResult || null,
      entry.reason,
      entry.details || null
    );
  }

  getAuditLogs(limit = 100): AuditLogEntry[] {
    const stmt = this.db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?');
    const rows = stmt.all(limit) as any[];
    return rows.map(r => ({
      id: r.id,
      timestamp: r.timestamp,
      user: r.user,
      action: r.action,
      applicantId: r.applicant_id,
      applicantName: r.applicant_name,
      previousResult: r.previous_result,
      newResult: r.new_result,
      reason: r.reason,
      details: r.details,
    }));
  }

  // --- Dashboard Statistics (Strictly Computed for Company Workspace) ---
  getDashboardStats(company: 'AaraTech' | 'ClinisolTech' = 'AaraTech'): DashboardStats {
    const totalFilesStmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM import_files
      WHERE import_id IN (SELECT id FROM imports WHERE company = ?)
    `);
    const totalFiles = (totalFilesStmt.get(company) as { count: number }).count;

    const totalApplicantsStmt = this.db.prepare('SELECT COUNT(*) as count FROM applicants WHERE company = ?');
    const totalApplicants = (totalApplicantsStmt.get(company) as { count: number }).count;

    const passedStmt = this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND effective_result = 'PASS'");
    const passedCount = (passedStmt.get(company) as { count: number }).count;

    const failedStmt = this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND effective_result = 'FAIL'");
    const failedCount = (failedStmt.get(company) as { count: number }).count;

    const manualReviewStmt = this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND effective_result = 'MANUAL_REVIEW'");
    const manualReviewCount = (manualReviewStmt.get(company) as { count: number }).count;

    const errorStmt = this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND effective_result = 'ERROR'");
    const errorCount = (errorStmt.get(company) as { count: number }).count;

    // Green Card Counts
    const gcYes = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND green_card_answer = 'YES'").get(company) as { count: number }).count;
    const gcNo = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND green_card_answer = 'NO'").get(company) as { count: number }).count;
    const gcMissing = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND green_card_answer IN ('MISSING', 'UNCLEAR')").get(company) as { count: number }).count;

    // Sponsorship Counts
    const spNo = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND sponsorship_answer = 'NO'").get(company) as { count: number }).count;
    const spYes = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND sponsorship_answer = 'YES'").get(company) as { count: number }).count;
    const spMissing = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND sponsorship_answer IN ('MISSING', 'UNCLEAR')").get(company) as { count: number }).count;

    // Gender Counts
    const maleCount = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND gender = 'MALE'").get(company) as { count: number }).count;
    const femaleCount = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND gender = 'FEMALE'").get(company) as { count: number }).count;
    const unspecifiedGenderCount = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND gender NOT IN ('MALE', 'FEMALE')").get(company) as { count: number }).count;

    // Origin Counts
    const southAsianCount = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND origin_region = 'SOUTH_ASIAN'").get(company) as { count: number }).count;
    const otherOriginCount = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND origin_region != 'SOUTH_ASIAN'").get(company) as { count: number }).count;

    // Approved Leads, Duplicates, Distributed Leads
    const approvedLeadsCount = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND (effective_result = 'PASS' OR review_decision = 'APPROVED')").get(company) as { count: number }).count;
    const duplicateCount = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND is_duplicate = 1").get(company) as { count: number }).count;
    const distributedCount = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE company = ? AND assigned_recruiter IS NOT NULL AND assigned_recruiter != ''").get(company) as { count: number }).count;

    // Top Jobs for Company
    const topJobsStmt = this.db.prepare(`
      SELECT
        COALESCE(job_title, 'Unspecified Job') as jobTitle,
        COALESCE(job_id, 'N/A') as jobId,
        company,
        COUNT(*) as total,
        SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN effective_result = 'MANUAL_REVIEW' THEN 1 ELSE 0 END) as manualReview
      FROM applicants
      WHERE company = ?
      GROUP BY job_title, job_id
      ORDER BY total DESC
      LIMIT 10
    `);
    const topJobs = topJobsStmt.all(company) as any[];

    // Recent Imports for Company
    const recentImports = this.getImports(5, company);

    return {
      filesProcessed: totalFiles,
      applicantsProcessed: totalApplicants,
      passedCount,
      failedCount,
      manualReviewCount,
      errorCount,
      greenCardYes: gcYes,
      greenCardNo: gcNo,
      greenCardMissing: gcMissing,
      sponsorshipNo: spNo,
      sponsorshipYes: spYes,
      sponsorshipMissing: spMissing,
      maleCount,
      femaleCount,
      unspecifiedGenderCount,
      southAsianCount,
      otherOriginCount,
      approvedLeadsCount,
      duplicateCount,
      distributedCount,
      topJobs,
      recentImports,
      company,
    };
  }

  // --- Imports Query (Company Scoped) ---
  getImports(limit = 50, company?: string): ImportRecord[] {
    let importsStmt;
    let importRows: any[];
    if (company) {
      importsStmt = this.db.prepare('SELECT * FROM imports WHERE company = ? ORDER BY uploaded_at DESC LIMIT ?');
      importRows = importsStmt.all(company, limit) as any[];
    } else {
      importsStmt = this.db.prepare('SELECT * FROM imports ORDER BY uploaded_at DESC LIMIT ?');
      importRows = importsStmt.all(limit) as any[];
    }

    return importRows.map(imp => {
      const filesStmt = this.db.prepare('SELECT * FROM import_files WHERE import_id = ?');
      const fileRows = filesStmt.all(imp.id) as any[];
      const batchName = imp.batch_name || fileRows[0]?.job_title || fileRows[0]?.filename || imp.import_code;

      let parsedJobSlots: string[] = [];
      try {
        if (imp.job_slots) parsedJobSlots = JSON.parse(imp.job_slots);
      } catch {}

      return {
        id: imp.id,
        importCode: imp.import_code,
        batchName,
        uploadedAt: imp.uploaded_at,
        uploadedBy: imp.uploaded_by,
        fileCount: imp.file_count,
        totalApplicants: imp.total_applicants,
        passedCount: imp.passed_count,
        failedCount: imp.failed_count,
        manualReviewCount: imp.manual_review_count,
        errorCount: imp.error_count,
        status: imp.status,
        company: imp.company,
        applicationDate: imp.application_date,
        jobSlots: parsedJobSlots,
        activeWorkingBatch: Boolean(imp.active_working_batch),
        files: fileRows.map(f => ({
          filename: f.filename,
          fileSize: f.file_size,
          rowCount: f.row_count,
          jobId: f.job_id,
          jobTitle: f.job_title,
          status: f.status,
          errorMessage: f.error_message,
          hash: f.file_hash,
        })),
      };
    });
  }

  // --- Baseline Jobs for Company ---
  getBaselineJobs(company: 'AaraTech' | 'ClinisolTech' = 'AaraTech'): Array<{ id: string; company: 'AaraTech' | 'ClinisolTech'; jobId: string; jobTitle: string; status: string }> {
    const stmt = this.db.prepare('SELECT * FROM jobs WHERE company = ? ORDER BY job_id ASC');
    const rows = stmt.all(company) as any[];
    if (rows && rows.length > 0) {
      return rows.map(r => ({
        id: r.id,
        company: r.company,
        jobId: r.job_id,
        jobTitle: r.job_title,
        status: r.status,
      }));
    }
    // Fallback to in-memory list
    return BASELINE_JOBS.filter(j => j.company === company).map(j => ({
      id: `job-${j.jobId.toLowerCase()}`,
      company: j.company,
      jobId: j.jobId,
      jobTitle: j.jobTitle,
      status: 'Active',
    }));
  }

  // --- Job Grouping & Summary for Company ---
  getJobSummaries(company: 'AaraTech' | 'ClinisolTech' = 'AaraTech'): {
    jobTitle: string;
    jobId: string;
    company: string;
    total: number;
    passed: number;
    failed: number;
    manualReview: number;
  }[] {
    const baseline = this.getBaselineJobs(company);
    const countStmt = this.db.prepare(`
      SELECT
        COALESCE(job_id, 'N/A') as jobId,
        COALESCE(job_title, 'Unspecified Role') as jobTitle,
        COUNT(*) as total,
        SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN effective_result = 'MANUAL_REVIEW' THEN 1 ELSE 0 END) as manualReview
      FROM applicants
      WHERE company = ?
      GROUP BY job_id, job_title
    `);
    const rows = countStmt.all(company) as any[];

    // Map all baseline jobs so each slot appears even if 0 applicants
    return baseline.map(bj => {
      const match = rows.find(r =>
        r.jobId === bj.jobId ||
        r.jobTitle.toLowerCase().trim() === bj.jobTitle.toLowerCase().trim()
      );
      return {
        jobId: bj.jobId,
        jobTitle: bj.jobTitle,
        company,
        total: match ? match.total : 0,
        passed: match ? match.passed : 0,
        failed: match ? match.failed : 0,
        manualReview: match ? match.manualReview : 0,
      };
    });
  }

  // --- Update / Rename Job Slot ---
  updateJobTitle(company: 'AaraTech' | 'ClinisolTech', jobId: string, newTitle: string): { success: boolean; jobId: string; newTitle: string } {
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
      throw new Error('Job title cannot be empty.');
    }

    const existing = this.db.prepare('SELECT id FROM jobs WHERE company = ? AND job_id = ?').get(company, jobId) as any;
    if (existing) {
      this.db.prepare(`
        UPDATE jobs
        SET job_title = ?, updated_at = datetime('now')
        WHERE company = ? AND job_id = ?
      `).run(trimmedTitle, company, jobId);
    } else {
      this.db.prepare(`
        INSERT INTO jobs (id, company, job_id, job_title, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'Active', datetime('now'), datetime('now'))
      `).run(`job-${jobId.toLowerCase()}`, company, jobId, trimmedTitle);
    }

    // Cascade to existing applicants for this job slot
    try {
      const normRole = normalizeJobRole(trimmedTitle);
      this.db.prepare(`
        UPDATE applicants
        SET job_title = ?, normalized_role = ?
        WHERE company = ? AND job_id = ?
      `).run(trimmedTitle, normRole, company, jobId);
    } catch (e) {
      console.warn('Failed to cascade jobTitle to applicants:', e);
    }

    return { success: true, jobId, newTitle: trimmedTitle };
  }

  // --- Recruiters Management ---
  getRecruiters(company: 'AaraTech' | 'ClinisolTech' = 'AaraTech'): Array<{ id: string; company: 'AaraTech' | 'ClinisolTech'; name: string; email: string; role: string; active: boolean; leadsCount: number; createdAt: string }> {
    const stmt = this.db.prepare('SELECT * FROM recruiters WHERE company = ? AND active = 1 ORDER BY name ASC');
    const rows = stmt.all(company) as any[];
    return rows.map(r => ({
      id: r.id,
      company: r.company,
      name: r.name,
      email: r.email,
      role: r.role || 'Recruiter',
      active: Boolean(r.active),
      leadsCount: r.leads_count || 0,
      createdAt: r.created_at,
    }));
  }

  addRecruiter(company: 'AaraTech' | 'ClinisolTech', name: string, email: string, role = 'Recruiter') {
    const id = `rec-${Date.now()}`;
    const stmt = this.db.prepare(`
      INSERT INTO recruiters (id, company, name, email, role, active, leads_count, created_at)
      VALUES (?, ?, ?, ?, ?, 1, 0, datetime('now'))
    `);
    stmt.run(id, company, name.trim(), email.trim().toLowerCase(), role);
    return { id, company, name, email, role, active: true, leadsCount: 0 };
  }

  // --- Lead Distribution to Recruiters ---
  distributeLeads(ids: string[], recruiterName: string, company: 'AaraTech' | 'ClinisolTech', user = 'Recruiter Admin'): { distributedCount: number; recruiterName: string } {
    if (ids.length === 0) return { distributedCount: 0, recruiterName };
    const now = new Date().toISOString();
    this.db.exec('BEGIN TRANSACTION');
    try {
      const stmt = this.db.prepare(`
        UPDATE applicants
        SET assigned_recruiter = ?,
            distributed_at = ?,
            current_stage = 'Distributed'
        WHERE id = ? AND company = ?
      `);
      let count = 0;
      for (const id of ids) {
        const res = stmt.run(recruiterName, now, id, company);
        if ((res as any).changes > 0) count++;
      }

      // Update lead counter on recruiter record
      this.db.prepare(`
        UPDATE recruiters
        SET leads_count = leads_count + ?
        WHERE name = ? AND company = ?
      `).run(count, recruiterName, company);

      this.addAuditLog({
        id: `audit-${Date.now()}`,
        timestamp: now,
        user,
        action: 'Recruiter Lead Distribution',
        reason: `Distributed ${count} approved lead(s) to ${recruiterName}.`,
        details: `Workspace: ${company}. Assigned ${count} applicant leads to recruiter ${recruiterName}.`,
      });

      this.db.exec('COMMIT');
      return { distributedCount: count, recruiterName };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  // --- Clear Current Working Batch (Strict Non-Destructive Isolation) ---
  clearWorkingBatch(batchId: string, company: 'AaraTech' | 'ClinisolTech', purgeRecords = false): {
    success: boolean;
    batchId: string;
    clearedMode: 'purged' | 'unloaded';
    applicantsDeleted: number;
    message: string;
  } {
    const batch = this.db.prepare('SELECT id, batch_name, import_code FROM imports WHERE id = ? AND company = ?').get(batchId, company) as any;
    if (!batch) {
      throw new Error(`Batch '${batchId}' not found in company workspace '${company}'.`);
    }

    const countRow = this.db.prepare('SELECT COUNT(*) as c FROM applicants WHERE import_id = ? AND company = ?').get(batchId, company) as any;
    const applicantCount = countRow?.c || 0;

    // Always safely unload active batch from working view without deleting permanent application records
    this.db.prepare('UPDATE imports SET active_working_batch = 0 WHERE id = ? AND company = ?').run(batchId, company);

    this.addAuditLog({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: 'Recruiter Admin',
      action: 'Batch Unloaded',
      reason: `User safely cleared active batch ${batch.import_code} (${batch.batch_name || 'Import Batch'}) from ${company} working view.`,
      details: `Working view cleared. All ${applicantCount} applicant records, screening decisions, and master links remain permanently preserved in application history and reporting.`,
    });

    return {
      success: true,
      batchId,
      company,
      clearedMode: 'unloaded',
      activeWorkingBatchCleared: true,
      purgedApplicants: 0,
      applicantsDeleted: 0,
      message: `Batch ${batch.import_code} cleared from active working view. All ${applicantCount} applicants safely preserved in permanent history.`,
    };
  }

  // --- Clear All Applications for Company Workspace (Fresh Start) ---
  getApplicationClearSummary(company: 'AaraTech' | 'ClinisolTech') {
    const totalRow = this.db.prepare('SELECT COUNT(*) as c FROM applicants WHERE company = ?').get(company) as any;
    const passedRow = this.db.prepare("SELECT COUNT(*) as c FROM applicants WHERE company = ? AND (effective_result = 'PASS' OR (effective_result IS NULL AND automated_result = 'PASS'))").get(company) as any;
    const failedRow = this.db.prepare("SELECT COUNT(*) as c FROM applicants WHERE company = ? AND (effective_result = 'FAIL' OR (effective_result IS NULL AND automated_result = 'FAIL'))").get(company) as any;
    const reviewRow = this.db.prepare("SELECT COUNT(*) as c FROM applicants WHERE company = ? AND (effective_result = 'MANUAL_REVIEW' OR (effective_result IS NULL AND automated_result = 'MANUAL_REVIEW'))").get(company) as any;
    const dupRow = this.db.prepare('SELECT COUNT(*) as c FROM applicants WHERE company = ? AND is_duplicate = 1').get(company) as any;
    
    const totalBatchesRow = this.db.prepare('SELECT COUNT(*) as c FROM imports WHERE company = ?').get(company) as any;
    const workingBatchesRow = this.db.prepare('SELECT COUNT(*) as c FROM imports WHERE company = ? AND active_working_batch = 1').get(company) as any;
    
    const masterCandidatesRow = this.db.prepare('SELECT COUNT(*) as c FROM master_people WHERE company = ?').get(company) as any;
    const jobsRow = this.db.prepare('SELECT COUNT(*) as c FROM jobs WHERE company = ?').get(company) as any;

    return {
      company,
      totalApplications: totalRow?.c || 0,
      passedCount: passedRow?.c || 0,
      failedCount: failedRow?.c || 0,
      manualReviewCount: reviewRow?.c || 0,
      duplicateCount: dupRow?.c || 0,
      totalBatches: totalBatchesRow?.c || 0,
      workingBatches: workingBatchesRow?.c || 0,
      preservedMasterCandidates: masterCandidatesRow?.c || 0,
      preservedJobSlots: jobsRow?.c || (company === 'AaraTech' ? 21 : 10),
    };
  }

  clearAllApplications(company: 'AaraTech' | 'ClinisolTech', user = 'Recruiter Admin') {
    if (company !== 'AaraTech' && company !== 'ClinisolTech') {
      throw new Error(`Invalid company scope: ${company}. Must be 'AaraTech' or 'ClinisolTech'.`);
    }

    const summary = this.getApplicationClearSummary(company);

    this.db.exec('BEGIN TRANSACTION');
    try {
      // 1. Delete all applicant records for this company in screening workspace
      // NOTE: Master candidate database (master_people & master_applications) are strictly preserved!
      this.db.prepare('DELETE FROM applicants WHERE company = ?').run(company);

      // 3. Delete import files belonging to imports of this company
      this.db.prepare('DELETE FROM import_files WHERE import_id IN (SELECT id FROM imports WHERE company = ?)').run(company);

      // 4. Delete imports for this company
      this.db.prepare('DELETE FROM imports WHERE company = ?').run(company);

      this.db.exec('COMMIT');
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw err;
    }

    // 5. Add permanent audit log
    this.addAuditLog({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user,
      action: 'Clear All Applications',
      reason: `User executed Clear All Applications for ${company} to start fresh.`,
      details: `Cleared ${summary.totalApplications} applicant records (${summary.passedCount} PASS, ${summary.failedCount} FAIL, ${summary.manualReviewCount} MANUAL REVIEW, ${summary.duplicateCount} duplicates) and ${summary.totalBatches} batch(es) for ${company}. Master candidate profiles (${summary.preservedMasterCandidates}), job slots (${summary.preservedJobSlots}), and shared DM Portal records remain permanently preserved.`,
    });

    return {
      success: true,
      company,
      deletedApplicants: summary.totalApplications,
      deletedBatches: summary.totalBatches,
      passedDeleted: summary.passedCount,
      failedDeleted: summary.failedCount,
      manualReviewDeleted: summary.manualReviewCount,
      duplicatesDeleted: summary.duplicateCount,
      preservedMasterCandidates: summary.preservedMasterCandidates,
      preservedJobSlots: summary.preservedJobSlots,
      message: `Successfully cleared all ${summary.totalApplications} application records and ${summary.totalBatches} batches for ${company}. Master candidate profiles, job slots, and settings preserved.`,
    };
  }

  // --- Duplicate Check for Candidates Across Master DB ---
  checkCandidateDuplicates(company: 'AaraTech' | 'ClinisolTech', candidates: Array<{ email?: string; phone?: string; profileUrl?: string; jobId?: string; fullName?: string }>) {
    const results = [];
    const stmt = this.db.prepare(`
      SELECT id, full_name, email, phone, profile_url, job_id, job_title, master_person_id, effective_result, date_applied
      FROM applicants
      WHERE company = ?
    `);
    const existing = stmt.all(company) as any[];

    const emailMap = new Map<string, any[]>();
    for (const r of existing) {
      const em = (r.email || '').trim().toLowerCase();
      if (em && em.includes('@')) {
        if (!emailMap.has(em)) emailMap.set(em, []);
        emailMap.get(em)!.push(r);
      }
    }

    // ALSO Query master candidate profiles for this company (so duplicate detection against retained master profiles always works even when applications are cleared!)
    const masterPeople = this.db.prepare(`
      SELECT person_id, full_name, primary_email, secondary_email, primary_phone
      FROM master_people
      WHERE company = ?
    `).all(company) as any[];

    const masterEmails = this.db.prepare(`
      SELECT mpe.person_id, mpe.email, mp.full_name
      FROM master_person_emails mpe
      JOIN master_people mp ON mp.person_id = mpe.person_id
      WHERE mp.company = ?
    `).all(company) as any[];

    const masterEmailMap = new Map<string, { personId: string; fullName: string }>();
    for (const m of masterPeople) {
      const pEm = (m.primary_email || '').trim().toLowerCase();
      if (pEm && pEm.includes('@')) {
        masterEmailMap.set(pEm, { personId: m.person_id, fullName: m.full_name });
      }
      const sEm = (m.secondary_email || '').trim().toLowerCase();
      if (sEm && sEm.includes('@')) {
        masterEmailMap.set(sEm, { personId: m.person_id, fullName: m.full_name });
      }
    }
    for (const me of masterEmails) {
      const em = (me.email || '').trim().toLowerCase();
      if (em && em.includes('@') && !masterEmailMap.has(em)) {
        masterEmailMap.set(em, { personId: me.person_id, fullName: me.full_name });
      }
    }

    for (const c of candidates) {
      const em = (c.email || '').trim().toLowerCase();
      const curJob = (c.jobId || '').trim().toLowerCase();
      let isExistingCandidate = false;
      let isSameJobDuplicate = false;
      let masterPersonId: string | null = null;
      let previousApplications: any[] = [];

      if (em && emailMap.has(em)) {
        isExistingCandidate = true;
        previousApplications = emailMap.get(em)!;
        masterPersonId = previousApplications[0]?.master_person_id || previousApplications[0]?.id;
        if (curJob && previousApplications.some(p => (p.job_id || '').toLowerCase() === curJob || (p.job_title || '').toLowerCase() === curJob)) {
          isSameJobDuplicate = true;
        }
      } else if (em && masterEmailMap.has(em)) {
        // Recognized from retained Master Candidate Database profile!
        isExistingCandidate = true;
        const mp = masterEmailMap.get(em)!;
        masterPersonId = mp.personId;
      }

      results.push({
        email: c.email,
        fullName: c.fullName,
        isExistingCandidate,
        isSameJobDuplicate,
        masterPersonId,
        previousApplicationsCount: previousApplications.length,
        matchType: isExistingCandidate ? (isSameJobDuplicate ? 'EXACT_JOB_DUPLICATE' : 'EXISTING_CANDIDATE') : 'NEW_CANDIDATE',
      });
    }

    return results;
  }

  // --- Periodic Reporting Engine (Daily / Weekly / Monthly / All Time) ---
  getReportAnalytics(
    company: 'AaraTech' | 'ClinisolTech' = 'AaraTech',
    period: 'daily' | 'weekly' | 'monthly' | 'custom' | 'all' = 'daily',
    dateStr?: string,
    startDate?: string,
    endDate?: string
  ) {
    const targetDate = dateStr || new Date().toISOString().split('T')[0];
    let dateFilter = '';
    const dateParams: any[] = [company];

    if (period === 'daily') {
      dateFilter = "AND application_date = ?";
      dateParams.push(targetDate);
    } else if (period === 'weekly') {
      dateFilter = "AND application_date >= date(?, '-7 days') AND application_date <= ?";
      dateParams.push(targetDate, targetDate);
    } else if (period === 'monthly') {
      const monthPrefix = targetDate.slice(0, 7);
      dateFilter = "AND application_date LIKE ?";
      dateParams.push(`${monthPrefix}%`);
    } else if (period === 'custom' && startDate && endDate) {
      dateFilter = "AND application_date >= ? AND application_date <= ?";
      dateParams.push(startDate, endDate);
    }

    const overviewQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN effective_result = 'MANUAL_REVIEW' THEN 1 ELSE 0 END) as manualReview,
        SUM(CASE WHEN review_decision = 'APPROVED' OR effective_result = 'PASS' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN is_duplicate = 1 THEN 1 ELSE 0 END) as duplicates,
        SUM(CASE WHEN master_person_id IS NOT NULL AND master_person_id != '' THEN 1 ELSE 0 END) as masterLinked,
        SUM(CASE WHEN link_status = 'Needs Review' THEN 1 ELSE 0 END) as needsReview,
        SUM(CASE WHEN master_person_id IS NULL OR master_person_id = '' THEN 1 ELSE 0 END) as unlinked,
        SUM(CASE WHEN assigned_recruiter IS NOT NULL AND assigned_recruiter != '' THEN 1 ELSE 0 END) as distributed
      FROM applicants
      WHERE company = ? ${dateFilter}
    `;
    const overview = (this.db.prepare(overviewQuery).get(...dateParams) as any) || {};

    const total = overview.total || 0;
    const passed = overview.passed || 0;
    const failed = overview.failed || 0;
    const manualReview = overview.manualReview || 0;
    const approved = overview.approved || 0;
    const duplicates = overview.duplicates || 0;
    const distributed = overview.distributed || 0;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    // Recruiter Distribution in period
    const recBreakdown = this.db.prepare(`
      SELECT
        assigned_recruiter as recruiterName,
        COUNT(*) as leadsAssigned,
        MAX(distributed_at) as lastDistributedAt
      FROM applicants
      WHERE company = ? AND assigned_recruiter IS NOT NULL AND assigned_recruiter != '' ${dateFilter}
      GROUP BY assigned_recruiter
      ORDER BY leadsAssigned DESC
    `).all(...dateParams) as any[];

    const allRecruiters = this.getRecruiters(company);
    const recruiterDistribution = allRecruiters.map(r => {
      const found = recBreakdown.find(b => b.recruiterName === r.name);
      return {
        recruiterName: r.name,
        email: r.email,
        leadsAssigned: found ? found.leadsAssigned : 0,
        lastDistributedAt: found ? found.lastDistributedAt : undefined,
      };
    });

    // Baseline job slot breakdown
    const jobRows = this.db.prepare(`
      SELECT
        COALESCE(job_id, 'N/A') as jobId,
        COALESCE(job_title, 'Unspecified Role') as jobTitle,
        COUNT(*) as total,
        SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN effective_result = 'MANUAL_REVIEW' THEN 1 ELSE 0 END) as manualReview,
        SUM(CASE WHEN review_decision = 'APPROVED' OR effective_result = 'PASS' THEN 1 ELSE 0 END) as approved
      FROM applicants
      WHERE company = ? ${dateFilter}
      GROUP BY job_id, job_title
      ORDER BY total DESC
    `).all(...dateParams) as any[];

    const baselineJobs = this.getBaselineJobs(company);
    const jobBreakdown = baselineJobs.map(bj => {
      const matched = jobRows.find(
        r => r.jobId === bj.jobId || r.jobTitle.toLowerCase().trim() === bj.jobTitle.toLowerCase().trim()
      );
      return {
        jobId: bj.jobId,
        jobTitle: bj.jobTitle,
        total: matched ? matched.total : 0,
        passed: matched ? matched.passed : 0,
        failed: matched ? matched.failed : 0,
        manualReview: matched ? matched.manualReview : 0,
        approved: matched ? matched.approved : 0,
      };
    });

    // Daily Trend
    const trendRows = this.db.prepare(`
      SELECT
        COALESCE(NULLIF(application_date, ''), strftime('%Y-%m-%d', created_at)) as date,
        COUNT(*) as total,
        SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN effective_result = 'MANUAL_REVIEW' THEN 1 ELSE 0 END) as manualReview
      FROM applicants
      WHERE company = ? AND (application_date IS NOT NULL OR created_at IS NOT NULL)
      GROUP BY date
      ORDER BY date DESC
      LIMIT 14
    `).all(company) as any[];

    return {
      timeframe: period,
      date: targetDate,
      company,
      totalApplications: total,
      passedCount: passed,
      failedCount: failed,
      manualReviewCount: manualReview,
      approvedLeadsCount: approved,
      potentialDuplicatesCount: duplicates,
      duplicateCount: duplicates,
      distributedLeadsCount: distributed,
      masterLinked: overview.masterLinked || 0,
      needsReview: overview.needsReview || 0,
      unlinked: overview.unlinked || 0,
      passRate,
      recruiterDistribution: recruiterDistribution.map(r => ({
        ...r,
        recruiter: r.recruiterName,
        count: r.leadsAssigned,
      })),
      jobBreakdown,
      jobSlotDistribution: jobBreakdown,
      dailyTrend: trendRows,
      dailyBreakdown: trendRows,
    };
  }

  // --- Tab Badge Counts Query (Fast, exact breakdown for any filtered scope) ---
  getApplicantTabCounts(filters: {
    company?: string;
    batchId?: string;
    applicationDate?: string;
    startDate?: string;
    endDate?: string;
    jobId?: string;
    search?: string;
    gender?: string;
    nameMatchCategory?: string;
    normalizedRole?: string;
    isDuplicate?: boolean;
    activeBatchOnly?: boolean;
  }): { pass: number; fail: number; review: number; all: number } {
    const { whereClause, values } = this.buildApplicantWhereClause({
      page: 1,
      pageSize: 1,
      company: filters.company,
      batchId: filters.batchId,
      applicationDate: filters.applicationDate,
      startDate: filters.startDate,
      endDate: filters.endDate,
      jobId: filters.jobId,
      search: filters.search,
      gender: filters.gender,
      nameMatchCategory: filters.nameMatchCategory as any,
      normalizedRole: filters.normalizedRole,
      isDuplicate: filters.isDuplicate,
      status: 'ALL',
    });

    const sql = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN effective_result = 'MANUAL_REVIEW' THEN 1 ELSE 0 END) as manualReview
      FROM applicants
      ${whereClause}
    `;

    const row = this.db.prepare(sql).get(...values) as any;
    return {
      pass: Number(row?.passed || 0),
      fail: Number(row?.failed || 0),
      review: Number(row?.manualReview || 0),
      all: Number(row?.total || 0),
    };
  }

  // --- Distinct Portal Ingestion Dates for Workspace ---
  getIngestionDates(company: string): Array<{ date: string; count: number }> {
    const stmt = this.db.prepare(`
      SELECT application_date as date, COUNT(*) as count
      FROM applicants
      WHERE company = ? AND application_date IS NOT NULL AND application_date != ''
      GROUP BY application_date
      ORDER BY application_date DESC
    `);
    return stmt.all(company) as any[];
  }

  // --- Full Export Query ---
  getAllApplicantsForExport(filters: {
    status?: string;
    gender?: string;
    jobId?: string;
    importId?: string;
    company?: string;
    applicationDate?: string;
    startDate?: string;
    endDate?: string;
    ids?: string[];
    nameMatchCategory?: string;
  }): Applicant[] {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filters.company && filters.company !== 'All' && filters.company !== 'Both') {
      conditions.push('company = ?');
      values.push(filters.company);
    }
    if (filters.status && filters.status !== 'ALL') {
      conditions.push('effective_result = ?');
      values.push(filters.status);
    }
    if (filters.gender && filters.gender !== 'ALL') {
      conditions.push('gender = ?');
      values.push(filters.gender);
    }
    if ((filters as any).nameMatchCategory && (filters as any).nameMatchCategory !== 'ALL') {
      conditions.push('name_match_category = ?');
      values.push((filters as any).nameMatchCategory);
    }
    if (filters.jobId && filters.jobId !== 'ALL') {
      conditions.push('job_id = ?');
      values.push(filters.jobId);
    }
    if (filters.importId && filters.importId !== 'ALL') {
      conditions.push('(import_id = ? OR batch_id = ?)');
      values.push(filters.importId, filters.importId);
    }
    if (filters.applicationDate && filters.applicationDate !== 'ALL') {
      conditions.push('application_date = ?');
      values.push(filters.applicationDate);
    }
    if (filters.startDate && filters.endDate) {
      conditions.push('(application_date >= ? AND application_date <= ?)');
      values.push(filters.startDate, filters.endDate);
    } else if (filters.startDate) {
      conditions.push('application_date >= ?');
      values.push(filters.startDate);
    } else if (filters.endDate) {
      conditions.push('application_date <= ?');
      values.push(filters.endDate);
    }
    if ((filters as any).search && (filters as any).search.trim()) {
      const q = `%${(filters as any).search.trim()}%`;
      conditions.push('(full_name LIKE ? OR email LIKE ? OR phone LIKE ? OR job_title LIKE ?)');
      values.push(q, q, q, q);
    }
    if ((filters as any).role && (filters as any).role !== 'ALL') {
      conditions.push('(normalized_role = ? OR job_title = ?)');
      values.push((filters as any).role, (filters as any).role);
    }
    if (filters.ids && filters.ids.length > 0) {
      const placeholders = filters.ids.map(() => '?').join(',');
      conditions.push(`id IN (${placeholders})`);
      values.push(...filters.ids);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = this.db.prepare(`SELECT * FROM applicants ${whereClause} ORDER BY source_file, source_row_number`);
    const rows = stmt.all(...values) as any[];
    return rows.map(r => this.mapRowToApplicant(r));
  }

  private mapRowToApplicant(r: any): Applicant {
    let rawRowData = {};
    try {
      if (r.raw_row_json) rawRowData = JSON.parse(r.raw_row_json);
    } catch {}

    return {
      id: r.id,
      importId: r.import_id,
      sourceFile: r.source_file,
      sourceWorksheet: r.source_worksheet,
      sourceRowNumber: r.source_row_number,
      firstName: r.first_name,
      lastName: r.last_name,
      fullName: r.full_name,
      email: r.email,
      phone: sanitizeContactNumber(r.phone),
      location: r.location,
      zipCode: r.zip_code,
      headline: r.headline,
      currentTitle: r.current_title,
      currentCompany: r.current_company,
      currentPositionStartDate: r.current_position_start_date,
      educationDegree: r.education_degree,
      educationInstitution: r.education_institution,
      profileUrl: r.profile_url,
      dateApplied: r.date_applied,
      currentStage: r.current_stage,
      jobId: r.job_id,
      jobTitle: r.job_title,
      normalizedRole: r.normalized_role || (r.job_title ? normalizeJobRole(r.job_title, [r.current_title, r.headline, r.source_file].filter(Boolean).join(' ')) : undefined),
      jobUrl: r.job_url,
      atsJobId: r.ats_job_id,
      minSalary: r.min_salary,
      maxSalary: r.max_salary,
      currencyCode: r.currency_code,
      compensationPeriod: r.compensation_period,
      hiringProjectId: r.hiring_project_id,
      hiringProjectTitle: r.hiring_project_title,
      contractId: r.contract_id,
      contractName: r.contract_name,
      gender: r.gender || 'UNSPECIFIED',
      originRegion: r.origin_region || 'UNSPECIFIED',
      originCountry: r.origin_country || undefined,
      originMatchReason: r.origin_match_reason || undefined,
      nameMatchCategory: (r.name_match_category as NameMatchCategory) || 'No Match',
      nameMatchScore: r.name_match_score !== null && r.name_match_score !== undefined ? Number(r.name_match_score) : 0,
      nameMatchedPattern: r.name_matched_pattern || undefined,
      nameMatchedReference: r.name_matched_reference || undefined,
      rawScreeningQuestions: r.raw_screening_questions,
      greenCardCitizenAnswer: r.green_card_answer,
      sponsorshipAnswer: r.sponsorship_answer,
      usWorkAuthAnswer: r.us_work_auth_answer,
      automatedResult: r.automated_result,
      manualResult: r.manual_result,
      effectiveResult: r.effective_result,
      screeningReasons: r.screening_reasons,
      overrideReason: r.override_reason,
      overriddenBy: r.overridden_by,
      overriddenAt: r.overridden_at,
      rawRowData,
      createdAt: r.created_at,
      company: r.company || 'AaraTech',
      batchId: r.batch_id || r.import_id,
      applicationDate: r.application_date || (r.created_at ? r.created_at.split('T')[0] : null),
      assignedRecruiter: r.assigned_recruiter || null,
      distributedAt: r.distributed_at || null,
      isDuplicate: Boolean(r.is_duplicate),
      duplicateReason: r.duplicate_reason || null,
      masterPersonId: r.master_person_id || null,
      linkStatus: r.link_status || null,
      linkError: r.link_error || null,
      reviewDecision: r.review_decision || null,
      reviewNotes: r.review_notes || null,
      transferStatus: r.transfer_status || null,
      transferredAt: r.transferred_at || null,
    };
  }

  clearAllData(): { applicantsDeleted: number; importsDeleted: number; filesDeleted: number; logsDeleted: number } {
    console.warn('[DatabaseService] Deprecated global wipe called.');
    const applicantCount = ((this.db.prepare('SELECT COUNT(*) as c FROM applicants').get() as any)?.c) || 0;
    const importCount = ((this.db.prepare('SELECT COUNT(*) as c FROM imports').get() as any)?.c) || 0;
    const fileCount = ((this.db.prepare('SELECT COUNT(*) as c FROM import_files').get() as any)?.c) || 0;
    const logCount = ((this.db.prepare('SELECT COUNT(*) as c FROM audit_logs').get() as any)?.c) || 0;

    return {
      applicantsDeleted: applicantCount,
      importsDeleted: importCount,
      filesDeleted: fileCount,
      logsDeleted: logCount,
    };
  }

  reevaluateAllApplicants(): {
    total: number;
    passed: number;
    failed: number;
    manualReview: number;
    errors: number;
  } {
    const rules = this.getScreeningRules();
    const rows = this.db.prepare('SELECT id, import_id, full_name, first_name, last_name, email, headline, education_institution, location, raw_screening_questions, manual_result FROM applicants').all() as any[];

    const updateStmt = this.db.prepare(`
      UPDATE applicants
      SET green_card_answer = ?,
          sponsorship_answer = ?,
          us_work_auth_answer = ?,
          origin_region = ?,
          origin_country = ?,
          origin_match_reason = ?,
          name_match_category = ?,
          name_match_score = ?,
          name_matched_pattern = ?,
          name_matched_reference = ?,
          automated_result = ?,
          effective_result = ?,
          screening_reasons = ?
      WHERE id = ?
    `);

    let passed = 0;
    let failed = 0;
    let manualReview = 0;
    let errors = 0;

    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const row of rows) {
        const nameMatch = referenceNameMatcher.matchApplicantName(row.full_name);
        const screeningEval = evaluateScreening(row.raw_screening_questions, rules, {
          fullName: row.full_name,
          firstName: row.first_name,
          lastName: row.last_name,
          headline: row.headline,
          educationInstitution: row.education_institution,
          location: row.location,
          email: row.email,
        }, nameMatch);
        const effectiveResult = row.manual_result ? row.manual_result : screeningEval.status;

        updateStmt.run(
          screeningEval.greenCardCitizenAnswer,
          screeningEval.futureSponsorshipAnswer,
          screeningEval.usWorkAuthAnswer || null,
          screeningEval.originResult?.origin || 'UNSPECIFIED',
          screeningEval.originResult?.countryMatch || null,
          screeningEval.originResult?.matchReason || null,
          nameMatch.category,
          nameMatch.score,
          nameMatch.matchedPattern,
          nameMatch.matchedReferenceName,
          screeningEval.status,
          effectiveResult,
          screeningEval.reasons.join('; '),
          row.id
        );

        if (effectiveResult === 'PASS') passed++;
        else if (effectiveResult === 'FAIL') failed++;
        else if (effectiveResult === 'MANUAL_REVIEW') manualReview++;
        else errors++;
      }

      // Update imports table summary counts
      const imports = this.db.prepare('SELECT id FROM imports').all() as any[];
      const updateImportStmt = this.db.prepare(`
        UPDATE imports
        SET passed_count = (SELECT COUNT(*) FROM applicants WHERE import_id = ? AND effective_result = 'PASS'),
            failed_count = (SELECT COUNT(*) FROM applicants WHERE import_id = ? AND effective_result = 'FAIL'),
            manual_review_count = (SELECT COUNT(*) FROM applicants WHERE import_id = ? AND effective_result = 'MANUAL_REVIEW'),
            error_count = (SELECT COUNT(*) FROM applicants WHERE import_id = ? AND effective_result = 'ERROR')
        WHERE id = ?
      `);

      for (const imp of imports) {
        updateImportStmt.run(imp.id, imp.id, imp.id, imp.id, imp.id);
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return {
      total: rows.length,
      passed,
      failed,
      manualReview,
      errors,
    };
  }

  repairAllSplitApplicants(
    repairRowsFn: (rows: Record<string, any>[]) => Record<string, any>[],
    evaluateScreeningFn: any,
    classifyGenderFn: any,
    detectHeaderMappingFn: any,
    extractRowValuesFn: any
  ): {
    totalImports: number;
    totalApplicantsBefore: number;
    totalApplicantsAfter: number;
  } {
    const imports = this.db.prepare('SELECT * FROM imports').all() as any[];
    const rules = this.getScreeningRules();
    let totalBefore = 0;
    let totalAfter = 0;

    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const imp of imports) {
        const rows = this.db.prepare('SELECT * FROM applicants WHERE import_id = ? ORDER BY source_row_number ASC').all(imp.id) as any[];
        totalBefore += rows.length;
        if (rows.length === 0) continue;

        const rawRows: Record<string, any>[] = [];
        for (const r of rows) {
          try {
            rawRows.push(JSON.parse(r.raw_row_json || '{}'));
          } catch {
            rawRows.push({});
          }
        }

        const headers = Object.keys(rawRows[0] || {});
        const mapping = detectHeaderMappingFn(headers);
        const cleanedRows = repairRowsFn(rawRows);

        let passed = 0;
        let failed = 0;
        let manualReview = 0;
        const newApplicants: Applicant[] = [];

        for (let idx = 0; idx < cleanedRows.length; idx++) {
          const rawRow = cleanedRows[idx];
          const sourceRowNumber = idx + 2;
          const { normalized } = extractRowValuesFn(rawRow, mapping);

          let rawScreeningText = normalized.rawScreeningQuestions || '';
          const originCtx = {
            fullName: normalized.fullName,
            firstName: normalized.firstName,
            lastName: normalized.lastName,
            headline: normalized.headline,
            educationInstitution: normalized.educationInstitution,
            location: normalized.location,
            email: normalized.email,
          };
          const nameMatch = referenceNameMatcher.matchApplicantName(normalized.fullName);
          const screeningEval = evaluateScreeningFn(rawScreeningText, rules, originCtx, nameMatch);
          const genderResult = classifyGenderFn(normalized.firstName, normalized.fullName, normalized.headline);

          const appObj: Applicant = {
            id: `app-rep-${imp.id}-${sourceRowNumber}`,
            importId: imp.id,
            sourceFile: imp.batch_name || imp.id,
            sourceWorksheet: 'Repaired Data',
            sourceRowNumber,
            firstName: normalized.firstName,
            lastName: normalized.lastName,
            fullName: normalized.fullName,
            email: normalized.email,
            phone: sanitizeContactNumber(normalized.phone),
            location: normalized.location,
            zipCode: normalized.zipCode,
            headline: normalized.headline,
            currentTitle: normalized.currentTitle,
            currentCompany: normalized.currentCompany,
            currentPositionStartDate: normalized.currentPositionStartDate,
            educationDegree: normalized.educationDegree,
            educationInstitution: normalized.educationInstitution,
            profileUrl: normalized.profileUrl,
            dateApplied: normalized.dateApplied || imp.uploaded_at?.split('T')[0] || new Date().toISOString().split('T')[0],
            currentStage: normalized.currentStage || 'Pasted',
            jobId: normalized.jobId || 'PASTE-JOB',
            jobTitle: normalized.jobTitle || imp.batch_name || 'General Applicant',
            jobUrl: normalized.jobUrl || '',
            atsJobId: normalized.atsJobId || '',
            minSalary: normalized.minSalary || '',
            maxSalary: normalized.maxSalary || '',
            currencyCode: normalized.currencyCode || '',
            compensationPeriod: normalized.compensationPeriod || '',
            hiringProjectId: normalized.hiringProjectId || '',
            hiringProjectTitle: normalized.hiringProjectTitle || '',
            contractId: normalized.contractId || '',
            contractName: normalized.contractName || '',
            gender: genderResult.gender,
            genderConfidence: genderResult.confidence,
            originRegion: screeningEval.originResult?.origin || 'UNSPECIFIED',
            originCountry: screeningEval.originResult?.countryMatch,
            originMatchReason: screeningEval.originResult?.matchReason,
            nameMatchCategory: nameMatch.category,
            nameMatchScore: nameMatch.score,
            nameMatchedPattern: nameMatch.matchedPattern,
            nameMatchedReference: nameMatch.matchedReferenceName,
            rawScreeningQuestions: rawScreeningText,
            greenCardCitizenAnswer: screeningEval.greenCardCitizenAnswer,
            sponsorshipAnswer: screeningEval.futureSponsorshipAnswer,
            usWorkAuthAnswer: screeningEval.usWorkAuthAnswer,
            automatedResult: screeningEval.status,
            manualResult: null,
            effectiveResult: screeningEval.status,
            screeningReasons: screeningEval.reasons.join('; '),
            overrideReason: null,
            overriddenBy: null,
            overriddenAt: null,
            rawRowData: rawRow,
            createdAt: imp.uploaded_at,
          };

          if (appObj.effectiveResult === 'PASS') passed++;
          else if (appObj.effectiveResult === 'FAIL') failed++;
          else manualReview++;

          newApplicants.push(appObj);
        }

        // Delete existing applicants for this import
        this.db.prepare('DELETE FROM applicants WHERE import_id = ?').run(imp.id);

        // Insert cleaned
        this.insertApplicantsBatch(newApplicants);

        // Update import stats
        this.db.prepare(`
          UPDATE imports
          SET total_applicants = ?, passed_count = ?, failed_count = ?, manual_review_count = ?, error_count = 0
          WHERE id = ?
        `).run(newApplicants.length, passed, failed, manualReview, imp.id);

        totalAfter += newApplicants.length;
      }

      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }

    return {
      totalImports: imports.length,
      totalApplicantsBefore: totalBefore,
      totalApplicantsAfter: totalAfter,
    };
  }

  // --- Application Settings (e.g. Gemini API Key) ---
  getSetting(key: string): string | null {
    try {
      const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as any;
      return row ? row.value : null;
    } catch {
      return null;
    }
  }

  setSetting(key: string, value: string): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, now);
  }

  // --- Rescreen All Applicants with Local Rules ---
  rescreenAllWithOriginAndGender(): {
    total: number;
    updated: number;
    promotedToPass: number;
    southAsianCount: number;
    maleCount: number;
    femaleCount: number;
  } {
    const rows = this.db.prepare('SELECT * FROM applicants').all() as any[];
    let updated = 0;
    let promotedToPass = 0;
    let southAsianCount = 0;
    let maleCount = 0;
    let femaleCount = 0;

    const updateStmt = this.db.prepare(`
      UPDATE applicants
      SET gender = ?,
          origin_region = ?,
          origin_country = ?,
          origin_match_reason = ?,
          automated_result = ?,
          effective_result = ?,
          screening_reasons = ?
      WHERE id = ?
    `);

    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const row of rows) {
        const originRes = classifySouthAsianOrigin(
          row.full_name,
          row.first_name,
          row.last_name,
          row.headline,
          row.education_institution,
          row.location
        );

        const genderRes = classifyGender(row.first_name, row.full_name, row.headline);
        if (genderRes.gender === 'MALE') maleCount++;
        else if (genderRes.gender === 'FEMALE') femaleCount++;

        if (originRes.isSouthAsian) {
          southAsianCount++;
        }

        let effectiveResult = row.effective_result;
        let automatedResult = row.automated_result;
        let screeningReasons = row.screening_reasons || '';

        const gcPass = row.green_card_answer === 'YES';
        const spPass = row.sponsorship_answer === 'NO';

        if (gcPass && spPass) {
          if (originRes.isSouthAsian) {
            if (effectiveResult !== 'PASS') {
              promotedToPass++;
            }
            effectiveResult = 'PASS';
            automatedResult = 'PASS';
            screeningReasons = `Pass: Meets GC & sponsorship requirements; Origin confirmed (${originRes.countryMatch || 'South Asia'}): ${originRes.matchReason}`;
          } else {
            if (!row.manual_result) {
              effectiveResult = 'MANUAL_REVIEW';
              automatedResult = 'MANUAL_REVIEW';
              screeningReasons = `Manual Review: Meets GC & sponsorship, but origin unconfirmed/ambiguous (${originRes.matchReason})`;
            }
          }
        }

        updateStmt.run(
          genderRes.gender,
          originRes.origin,
          originRes.countryMatch || (originRes.isSouthAsian ? 'South Asia' : null),
          originRes.matchReason,
          automatedResult,
          effectiveResult,
          screeningReasons,
          row.id
        );
        updated++;
      }

      // Update imports summary counts
      const imports = this.db.prepare('SELECT id FROM imports').all() as any[];
      const updateImportStmt = this.db.prepare(`
        UPDATE imports
        SET total_applicants = (SELECT COUNT(*) FROM applicants WHERE import_id = ?),
            passed_count = (SELECT COUNT(*) FROM applicants WHERE import_id = ? AND effective_result = 'PASS'),
            failed_count = (SELECT COUNT(*) FROM applicants WHERE import_id = ? AND effective_result = 'FAIL'),
            manual_review_count = (SELECT COUNT(*) FROM applicants WHERE import_id = ? AND effective_result = 'MANUAL_REVIEW')
        WHERE id = ?
      `);
      for (const imp of imports) {
        updateImportStmt.run(imp.id, imp.id, imp.id, imp.id, imp.id);
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return {
      total: rows.length,
      updated,
      promotedToPass,
      southAsianCount,
      maleCount,
      femaleCount,
    };
  }

  // --- Apply Gemini AI Classifications ---
  applyGeminiClassifications(results: GeminiClassificationResult[]): {
    total: number;
    promotedToPass: number;
    maleCount: number;
    femaleCount: number;
  } {
    let promotedToPass = 0;
    let maleCount = 0;
    let femaleCount = 0;

    const selectStmt = this.db.prepare('SELECT id, green_card_answer, sponsorship_answer, effective_result, automated_result, screening_reasons FROM applicants WHERE id = ?');
    const updateStmt = this.db.prepare(`
      UPDATE applicants
      SET gender = ?,
          origin_region = ?,
          origin_country = ?,
          origin_match_reason = ?,
          automated_result = ?,
          effective_result = ?,
          screening_reasons = ?
      WHERE id = ?
    `);

    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const r of results) {
        const row = selectStmt.get(r.id) as any;
        if (!row) continue;

        if (r.gender === 'MALE') maleCount++;
        else if (r.gender === 'FEMALE') femaleCount++;

        let effectiveResult = row.effective_result;
        let automatedResult = row.automated_result;
        let reasons = row.screening_reasons || '';

        const gcPass = row.green_card_answer === 'YES';
        const spPass = row.sponsorship_answer === 'NO';

        if (gcPass && spPass && r.isSouthAsian) {
          if (effectiveResult !== 'PASS') {
            promotedToPass++;
            effectiveResult = 'PASS';
            automatedResult = 'PASS';
            reasons = `Pass: Meets GC & sponsorship requirements; Gemini AI confirmed South Asian origin (${r.originCountry}): ${r.reason}`;
          }
        }

        updateStmt.run(
          r.gender,
          r.originRegion,
          r.originCountry,
          `Gemini AI: ${r.reason}`,
          automatedResult,
          effectiveResult,
          reasons,
          r.id
        );
      }

      // Update imports summary counts
      const imports = this.db.prepare('SELECT id FROM imports').all() as any[];
      const updateImportStmt = this.db.prepare(`
        UPDATE imports
        SET total_applicants = (SELECT COUNT(*) FROM applicants WHERE import_id = ?),
            passed_count = (SELECT COUNT(*) FROM applicants WHERE import_id = ? AND effective_result = 'PASS'),
            failed_count = (SELECT COUNT(*) FROM applicants WHERE import_id = ? AND effective_result = 'FAIL'),
            manual_review_count = (SELECT COUNT(*) FROM applicants WHERE import_id = ? AND effective_result = 'MANUAL_REVIEW')
        WHERE id = ?
      `);
      for (const imp of imports) {
        updateImportStmt.run(imp.id, imp.id, imp.id, imp.id, imp.id);
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return {
      total: results.length,
      promotedToPass,
      maleCount,
      femaleCount,
    };
  }

  // --- Fetch Applicants for AI Classification ---
  getApplicantsForAi(options?: { onlyManualReview?: boolean; importId?: string; limit?: number }): any[] {
    let query = 'SELECT id, full_name as fullName, first_name as firstName, last_name as lastName, headline, education_institution as educationInstitution, location, green_card_answer as greenCardAnswer, sponsorship_answer as sponsorshipAnswer, effective_result as effectiveResult FROM applicants WHERE 1=1';
    const params: any[] = [];

    if (options?.onlyManualReview) {
      query += " AND effective_result = 'MANUAL_REVIEW'";
    }

    if (options?.importId) {
      query += ' AND import_id = ?';
      params.push(options.importId);
    }

    query += ' ORDER BY rowid ASC';
    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    return this.db.prepare(query).all(...params) as any[];
  }

  // --- Run Reference Name Matching Across All Applicants ---
  runReferenceMatchingOnAll(customThreshold?: number): {
    total: number;
    strongMatches: number;
    possibleMatches: number;
    noMatches: number;
    threshold: number;
  } {
    const threshold = customThreshold !== undefined ? customThreshold : referenceNameMatcher.getThreshold();
    referenceNameMatcher.setThreshold(threshold);
    this.setSetting('reference_match_threshold', String(threshold));

    const rows = this.db.prepare('SELECT id, full_name, first_name, last_name FROM applicants').all() as any[];
    const updateStmt = this.db.prepare(`
      UPDATE applicants
      SET name_match_category = ?,
          name_match_score = ?,
          name_matched_pattern = ?,
          name_matched_reference = ?
      WHERE id = ?
    `);

    let strongMatches = 0;
    let possibleMatches = 0;
    let noMatches = 0;

    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const r of rows) {
        const fullName = r.full_name || `${r.first_name || ''} ${r.last_name || ''}`.trim();
        const res = referenceNameMatcher.matchApplicantName(fullName, threshold);
        updateStmt.run(res.category, res.score, res.matchedPattern, res.matchedReferenceName, r.id);

        if (res.category === 'Strong Match') strongMatches++;
        else if (res.category === 'Possible Match') possibleMatches++;
        else noMatches++;
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return {
      total: rows.length,
      strongMatches,
      possibleMatches,
      noMatches,
      threshold,
    };
  }

  getReferenceMatchSummary(): {
    total: number;
    strongMatches: number;
    possibleMatches: number;
    noMatches: number;
    threshold: number;
  } {
    const savedThreshold = Number(this.getSetting('reference_match_threshold') || referenceNameMatcher.getThreshold() || 0.80);
    const total = (this.db.prepare('SELECT COUNT(*) as count FROM applicants').get() as { count: number }).count;
    const strongMatches = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE name_match_category = 'Strong Match'").get() as { count: number }).count;
    const possibleMatches = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE name_match_category = 'Possible Match'").get() as { count: number }).count;
    const noMatches = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE name_match_category = 'No Match' OR name_match_category IS NULL").get() as { count: number }).count;

    return {
      total,
      strongMatches,
      possibleMatches,
      noMatches,
      threshold: savedThreshold,
    };
  }

  // --- Batch Update Gender (User Requested Feature) ---
  batchUpdateGender(
    ids: string[],
    gender: 'MALE' | 'FEMALE' | 'UNSPECIFIED',
    user = 'Recruiter Admin'
  ): number {
    const updateStmt = this.db.prepare('UPDATE applicants SET gender = ? WHERE id = ?');
    const auditStmt = this.db.prepare(`
      INSERT INTO audit_logs (id, timestamp, user, action, applicant_id, applicant_name, previous_result, new_result, reason)
      VALUES (?, ?, ?, 'BATCH_GENDER_UPDATE', ?, ?, ?, ?, ?)
    `);

    let count = 0;
    const now = new Date().toISOString();

    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const id of ids) {
        const app = this.db.prepare('SELECT id, full_name, gender, effective_result FROM applicants WHERE id = ?').get(id) as any;
        if (app) {
          updateStmt.run(gender, id);
          auditStmt.run(
            `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            now,
            user,
            id,
            app.full_name || 'Unknown',
            app.effective_result,
            app.effective_result,
            `Batch modified gender from ${app.gender || 'UNSPECIFIED'} to ${gender}`
          );
          count++;
        }
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return count;
  }

  // --- Deduplicate Applicants (User Requested Feature: "only one unique record should be there") ---
  deduplicateApplicants(scope: 'PASS' | 'ALL' = 'ALL'): {
    totalDuplicatesRemoved: number;
    uniqueCandidatesKept: number;
    message: string;
  } {
    let whereClause = '';
    if (scope === 'PASS') {
      whereClause = "WHERE effective_result = 'PASS'";
    }

    const applicants = this.db.prepare(`
      SELECT id, full_name, email, phone, profile_url, job_title, effective_result, automated_result, created_at, source_file
      FROM applicants
      ${whereClause}
      ORDER BY created_at DESC
    `).all() as any[];

    const groups = new Map<string, any[]>();

    for (const app of applicants) {
      let key = '';
      const email = (app.email || '').trim().toLowerCase();
      const phoneDigits = (app.phone || '').replace(/\D/g, '').slice(-10);
      const name = (app.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const linkedin = cleanLinkedinIdentifier(app.profile_url);

      if (email && email !== 'n/a' && email !== 'none' && email.includes('@')) {
        key = `email:${email}`;
      } else if (linkedin && linkedin.length >= 3) {
        key = `li:${linkedin}`;
      } else if (name && phoneDigits.length >= 7) {
        key = `name_phone:${name}|${phoneDigits}`;
      } else if (name) {
        key = `name:${name}`;
      } else {
        continue;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(app);
    }

    const idsToDelete: string[] = [];
    let uniqueKept = 0;

    for (const [, list] of groups.entries()) {
      if (list.length > 1) {
        // Sort to keep the best one:
        // 1. Keep 'PASS' over others if available
        // 2. Keep the one with most complete data
        // 3. Keep most recent
        list.sort((a, b) => {
          if (a.effective_result === 'PASS' && b.effective_result !== 'PASS') return -1;
          if (b.effective_result === 'PASS' && a.effective_result !== 'PASS') return 1;
          const scoreA = (a.email ? 2 : 0) + (a.phone ? 2 : 0) + (a.profile_url ? 1 : 0);
          const scoreB = (b.email ? 2 : 0) + (b.phone ? 2 : 0) + (b.profile_url ? 1 : 0);
          if (scoreA !== scoreB) return scoreB - scoreA;
          return (b.created_at || '').localeCompare(a.created_at || '');
        });

        uniqueKept++;
        for (let i = 1; i < list.length; i++) {
          idsToDelete.push(list[i].id);
        }
      } else {
        uniqueKept++;
      }
    }

    if (idsToDelete.length > 0) {
      this.db.exec('BEGIN TRANSACTION');
      try {
        const deleteStmt = this.db.prepare('DELETE FROM applicants WHERE id = ?');
        const deleteAuditStmt = this.db.prepare('DELETE FROM audit_logs WHERE applicant_id = ?');

        for (const id of idsToDelete) {
          deleteStmt.run(id);
          deleteAuditStmt.run(id);
        }

        // Update imports summary counts
        const imports = this.db.prepare('SELECT id FROM imports').all() as any[];
        const updateImportStmt = this.db.prepare(`
          UPDATE imports
          SET total_applicants = (SELECT COUNT(*) FROM applicants WHERE import_id = ?),
              passed_count = (SELECT COUNT(*) FROM applicants WHERE import_id = ? AND effective_result = 'PASS'),
              failed_count = (SELECT COUNT(*) FROM applicants WHERE import_id = ? AND effective_result = 'FAIL'),
              manual_review_count = (SELECT COUNT(*) FROM applicants WHERE import_id = ? AND effective_result = 'MANUAL_REVIEW')
          WHERE id = ?
        `);
        for (const imp of imports) {
          updateImportStmt.run(imp.id, imp.id, imp.id, imp.id, imp.id);
        }

        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    }

    return {
      totalDuplicatesRemoved: idsToDelete.length,
      uniqueCandidatesKept: uniqueKept,
      message: `Removed ${idsToDelete.length} duplicate applicant record(s). Kept ${uniqueKept} unique candidate(s).`,
    };
  }

  private ensureReferenceMatchingInitialized(): void {
    try {
      const row = this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE name_match_category IS NOT NULL AND name_match_category != 'No Match'").get() as { count: number };
      const totalRow = this.db.prepare("SELECT COUNT(*) as count FROM applicants").get() as { count: number };
      if (totalRow.count > 0 && row.count === 0) {
        console.log('[DatabaseService] Initializing reference name pattern matching on existing applicants...');
        this.runReferenceMatchingOnAll();
      }
    } catch (err) {
      console.error('[DatabaseService] ensureReferenceMatchingInitialized error:', err);
    }
  }

  // =========================================================================
  // MASTER CANDIDATE DATABASE ENGINE & PROMOTION PIPELINE
  // =========================================================================

  promoteApplicationsToMaster(company?: string, applicantIds?: string[]): {
    promotedCount: number;
    linkedCount: number;
    needsReviewCount: number;
    incompleteCount: number;
    errors: string[];
  } {
    let query = 'SELECT * FROM applicants';
    const conditions: string[] = [];
    const params: any[] = [];

    if (company && company !== 'All' && company !== 'Both') {
      conditions.push('company = ?');
      params.push(company);
    }

    if (applicantIds && applicantIds.length > 0) {
      const placeholders = applicantIds.map(() => '?').join(',');
      conditions.push(`id IN (${placeholders})`);
      params.push(...applicantIds);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    query += ' ORDER BY created_at ASC, id ASC';

    const rows = this.db.prepare(query).all(...params) as any[];
    if (rows.length === 0) {
      return { promotedCount: 0, linkedCount: 0, needsReviewCount: 0, incompleteCount: 0, errors: [] };
    }

    let promotedCount = 0;
    let linkedCount = 0;
    let needsReviewCount = 0;
    let incompleteCount = 0;
    const errors: string[] = [];

    // Pre-load existing master people for identity checking
    const existingPeopleRows = this.db.prepare('SELECT * FROM master_people').all() as any[];
    const existingEmailsRows = this.db.prepare('SELECT * FROM master_person_emails').all() as any[];
    const existingPhonesRows = this.db.prepare('SELECT * FROM master_person_phones').all() as any[];
    const existingAppsRows = this.db.prepare('SELECT * FROM master_applications').all() as any[];

    // Maps keyed by company
    const emailToPersonMap = new Map<string, any>(); // `${company}::${normEmail}` -> person
    const phoneNameToPersonMap = new Map<string, any>(); // `${company}::${phone}::${normName}` -> person
    const nameToPeopleMap = new Map<string, any[]>(); // `${company}::${normName}` -> people[]
    const personByIdMap = new Map<string, any>(); // person.id -> person
    const personByPersonIdMap = new Map<string, any>(); // person.person_id -> person
    const appsByPersonMap = new Map<string, any[]>(); // person.id -> apps[]

    for (const p of existingPeopleRows) {
      personByIdMap.set(p.id, p);
      personByPersonIdMap.set(p.person_id, p);
      const c = p.company;
      const nm = (p.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (nm) {
        const k = `${c}::${nm}`;
        if (!nameToPeopleMap.has(k)) nameToPeopleMap.set(k, []);
        nameToPeopleMap.get(k)!.push(p);
      }
    }

    for (const e of existingEmailsRows) {
      const p = personByIdMap.get(e.person_id);
      if (p) {
        const normEmail = (e.normalized_email || e.email || '').trim().toLowerCase();
        if (normEmail) {
          emailToPersonMap.set(`${p.company}::${normEmail}`, p);
        }
      }
    }

    for (const ph of existingPhonesRows) {
      const p = personByIdMap.get(ph.person_id);
      if (p) {
        const cleanPh = (ph.phone_normalized || ph.phone_original || '').replace(/\D/g, '').slice(-10);
        const nm = (p.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (cleanPh.length >= 7 && nm) {
          phoneNameToPersonMap.set(`${p.company}::${cleanPh}::${nm}`, p);
        }
      }
    }

    for (const app of existingAppsRows) {
      if (!appsByPersonMap.has(app.person_id)) appsByPersonMap.set(app.person_id, []);
      appsByPersonMap.get(app.person_id)!.push(app);
    }

    // Global unique sequence generator across master candidate database
    let maxSeq = 0;
    for (const p of existingPeopleRows) {
      const numMatch = (p.person_id || '').match(/P-(\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        if (num > maxSeq) maxSeq = num;
      }
    }
    let globalSeq = maxSeq + 1;

    const insertPersonStmt = this.db.prepare(`
      INSERT INTO master_people (
        id, person_id, first_name, last_name, full_name, gender,
        primary_email, secondary_email, primary_phone, secondary_phone,
        location, zip_code, headline, current_title, current_company,
        linkedin_url, current_status, current_owner, company, created_at, updated_at, last_activity_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEmailStmt = this.db.prepare(`
      INSERT INTO master_person_emails (
        id, person_id, email, normalized_email, is_primary, source, first_seen_at, last_seen_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPhoneStmt = this.db.prepare(`
      INSERT INTO master_person_phones (
        id, person_id, phone_original, phone_normalized, is_primary, source, first_seen_at, last_seen_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAppStmt = this.db.prepare(`
      INSERT INTO master_applications (
        id, person_id, applicant_id, company, job_id, job_title, date_applied, current_stage, effective_result, source_file, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateApplicantStmt = this.db.prepare(`
      UPDATE applicants
      SET master_person_id = ?,
          link_status = ?,
          link_error = ?
      WHERE id = ?
    `);

    const insertMatchStmt = this.db.prepare(`
      INSERT INTO master_possible_matches (
        id, match_code, candidate_a_id, candidate_b_id, match_reason, company, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `);

    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const a of rows) {
        const comp = (a.company === 'ClinisolTech' ? 'ClinisolTech' : 'AaraTech');
        const now = new Date().toISOString();
        const appDate = a.date_applied || a.application_date || a.created_at?.split('T')[0] || now.split('T')[0];

        const rawEmail = (a.email || '').trim().toLowerCase();
        const hasEmail = Boolean(rawEmail && rawEmail.includes('@') && !['n/a', 'none', 'null', 'undefined'].includes(rawEmail));
        const rawPhone = (a.phone || '').trim();
        const cleanPh = rawPhone.replace(/\D/g, '').slice(-10);
        const hasPhone = cleanPh.length >= 7;

        const fullName = (a.full_name || `${a.first_name || ''} ${a.last_name || ''}`).trim();
        const normName = fullName.toLowerCase().replace(/\s+/g, ' ');

        // Check completeness
        if (!fullName || (!hasEmail && !hasPhone)) {
          incompleteCount++;
          updateApplicantStmt.run(null, 'Needs Review', 'Incomplete applicant contact profile (missing name or both email and phone)', a.id);
          continue;
        }

        // 1. Check existing master person match
        let matchedPerson: any = null;

        // Check if applicant already has a valid master_person_id
        if (a.master_person_id && personByPersonIdMap.has(a.master_person_id)) {
          matchedPerson = personByPersonIdMap.get(a.master_person_id);
        }

        // Match by email
        if (!matchedPerson && hasEmail && emailToPersonMap.has(`${comp}::${rawEmail}`)) {
          matchedPerson = emailToPersonMap.get(`${comp}::${rawEmail}`);
        }

        // Match by phone + name
        if (!matchedPerson && hasPhone && normName && phoneNameToPersonMap.has(`${comp}::${cleanPh}::${normName}`)) {
          matchedPerson = phoneNameToPersonMap.get(`${comp}::${cleanPh}::${normName}`);
        }

        // Check uncertain name match (DO NOT auto-merge on name alone!)
        if (!matchedPerson && normName && nameToPeopleMap.has(`${comp}::${normName}`)) {
          const nameMatches = nameToPeopleMap.get(`${comp}::${normName}`)!;
          for (const candA of nameMatches) {
            needsReviewCount++;
            const matchCode = `PM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            insertMatchStmt.run(
              `pm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              matchCode,
              candA.id,
              a.id,
              `Identical name '${fullName}' detected with different contact credentials. Requires human recruiter review.`,
              comp
            );
          }
        }

        if (matchedPerson) {
          // Link to existing master person
          linkedCount++;
          const targetPersonId = matchedPerson.person_id;

          // Check if email already added to person_emails
          if (hasEmail && !emailToPersonMap.has(`${comp}::${rawEmail}`)) {
            const eId = `mpe-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            insertEmailStmt.run(eId, matchedPerson.id, rawEmail, rawEmail, 0, 'application_link', now, now, now);
            emailToPersonMap.set(`${comp}::${rawEmail}`, matchedPerson);
          }

          // Check if phone already added to person_phones
          if (hasPhone && !phoneNameToPersonMap.has(`${comp}::${cleanPh}::${normName}`)) {
            const phId = `mpp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            insertPhoneStmt.run(phId, matchedPerson.id, rawPhone, cleanPh, 0, 'application_link', now, now, now);
            phoneNameToPersonMap.set(`${comp}::${cleanPh}::${normName}`, matchedPerson);
          }

          // Add to master_applications if not already present
          const personApps = appsByPersonMap.get(matchedPerson.id) || [];
          const isAppAlreadyRecorded = personApps.some(app => app.applicant_id === a.id);
          if (!isAppAlreadyRecorded) {
            const maId = `ma-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            insertAppStmt.run(
              maId,
              matchedPerson.id,
              a.id,
              comp,
              a.job_id || null,
              a.job_title || 'General Applicant',
              appDate,
              a.effective_result === 'PASS' ? 'Passed' : 'Applied',
              a.effective_result || 'UNKNOWN',
              a.source_file || null,
              now
            );
            personApps.push({
              id: maId,
              applicant_id: a.id,
              job_id: a.job_id,
              job_title: a.job_title,
              date_applied: appDate,
              effective_result: a.effective_result,
            });
            appsByPersonMap.set(matchedPerson.id, personApps);
          }

          updateApplicantStmt.run(targetPersonId, 'Linked', null, a.id);
        } else {
          // Create new master person
          promotedCount++;
          const pSeq = String(globalSeq++).padStart(6, '0');
          const personIdCode = `P-${pSeq}`;
          const personUuid = `mp-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

          let fName = a.first_name || null;
          let lName = a.last_name || null;
          if (!fName && fullName) {
            const parts = fullName.split(' ');
            fName = parts[0] || null;
            lName = parts.slice(1).join(' ') || null;
          }

          const status = a.effective_result === 'PASS' ? 'New' : 'New';

          insertPersonStmt.run(
            personUuid,
            personIdCode,
            fName,
            lName,
            fullName,
            a.gender === 'MALE' ? 'Male' : a.gender === 'FEMALE' ? 'Female' : 'Unspecified',
            hasEmail ? rawEmail : null,
            null,
            hasPhone ? (a.phone || cleanPh) : null,
            null,
            a.location || null,
            a.zip_code || null,
            a.headline || a.job_title || null,
            a.current_title || a.job_title || null,
            a.current_company || comp,
            a.profile_url || null,
            status,
            'Unassigned',
            comp,
            now,
            now,
            now
          );

          if (hasEmail) {
            const eId = `mpe-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            insertEmailStmt.run(eId, personUuid, rawEmail, rawEmail, 1, 'master_import', now, now, now);
          }

          if (hasPhone) {
            const phId = `mpp-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            insertPhoneStmt.run(phId, personUuid, rawPhone, cleanPh, 1, 'master_import', now, now, now);
          }

          const maId = `ma-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          insertAppStmt.run(
            maId,
            personUuid,
            a.id,
            comp,
            a.job_id || null,
            a.job_title || 'General Applicant',
            appDate,
            a.effective_result === 'PASS' ? 'Passed' : 'Applied',
            a.effective_result || 'UNKNOWN',
            a.source_file || null,
            now
          );

          const newObj = {
            id: personUuid,
            person_id: personIdCode,
            full_name: fullName,
            company: comp,
            primary_email: hasEmail ? rawEmail : null,
            primary_phone: hasPhone ? cleanPh : null,
          };

          personByIdMap.set(personUuid, newObj);
          personByPersonIdMap.set(personIdCode, newObj);
          if (hasEmail) emailToPersonMap.set(`${comp}::${rawEmail}`, newObj);
          if (hasPhone && normName) phoneNameToPersonMap.set(`${comp}::${cleanPh}::${normName}`, newObj);
          if (normName) {
            const k = `${comp}::${normName}`;
            if (!nameToPeopleMap.has(k)) nameToPeopleMap.set(k, []);
            nameToPeopleMap.get(k)!.push(newObj);
          }
          appsByPersonMap.set(personUuid, [{
            id: maId,
            applicant_id: a.id,
            job_id: a.job_id,
            job_title: a.job_title,
            date_applied: appDate,
            effective_result: a.effective_result,
          }]);

          updateApplicantStmt.run(personIdCode, 'Linked', null, a.id);
        }
      }

      this.db.exec('COMMIT');
    } catch (err: any) {
      this.db.exec('ROLLBACK');
      console.error('[DatabaseService] promoteApplicationsToMaster error:', err);
      errors.push(err.message);
      throw err;
    }

    return { promotedCount, linkedCount, needsReviewCount, incompleteCount, errors };
  }

  /**
   * Phase 2: Controlled, Idempotent Transfer of Final Approved PASSED Records to Master DB
   * Meets all requirements of Master Project Prompt Section 2 (Company Isolation),
   * Section 5 (Controlled Integration, Steps 1-5), and Section 7 (Smart Duplicate Intelligence).
   */
  transferPassedApplicationsToMaster(
    company: 'AaraTech' | 'ClinisolTech',
    options: {
      batchId?: string;
      applicantIds?: string[];
      transferredBy?: string;
    } = {}
  ): {
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
  } {
    if (company !== 'AaraTech' && company !== 'ClinisolTech') {
      throw new Error(`Invalid company scope: '${company}'. Must be 'AaraTech' or 'ClinisolTech'.`);
    }

    const { batchId, applicantIds, transferredBy = 'Recruiter Admin' } = options;

    // Build query: ONLY approved PASS records from the selected company
    const conditions: string[] = ['a.company = ?', "a.effective_result = 'PASS'"];
    const params: any[] = [company];

    if (batchId && batchId !== 'ALL') {
      conditions.push('(a.import_id = ? OR a.batch_id = ?)');
      params.push(batchId, batchId);
    }

    if (applicantIds && applicantIds.length > 0) {
      const placeholders = applicantIds.map(() => '?').join(',');
      conditions.push(`a.id IN (${placeholders})`);
      params.push(...applicantIds);
    }

    const query = `
      SELECT a.* 
      FROM applicants a
      WHERE ${conditions.join(' AND ')}
      ORDER BY a.created_at ASC, a.id ASC
    `;

    const eligiblePassed = this.db.prepare(query).all(...params) as any[];

    if (eligiblePassed.length === 0) {
      return {
        success: true,
        company,
        totalEligiblePassed: 0,
        transferredCount: 0,
        newCandidatesCount: 0,
        existingCandidatesCount: 0,
        newApplicationsCount: 0,
        skippedDuplicatesCount: 0,
        possibleMatchesCount: 0,
        errorsCount: 0,
        batchId,
        message: 'No eligible passed applications found for transfer in the selected scope.',
        transfers: [],
      };
    }

    // Pre-load company-isolated master records
    const people = this.db.prepare('SELECT * FROM master_people WHERE company = ?').all(company) as any[];
    const emails = this.db.prepare(`
      SELECT e.* FROM master_person_emails e
      JOIN master_people p ON p.id = e.person_id
      WHERE p.company = ?
    `).all(company) as any[];
    const phones = this.db.prepare(`
      SELECT ph.* FROM master_person_phones ph
      JOIN master_people p ON p.id = ph.person_id
      WHERE p.company = ?
    `).all(company) as any[];
    const apps = this.db.prepare('SELECT * FROM master_applications WHERE company = ?').all(company) as any[];
    const transfersList = this.db.prepare('SELECT * FROM master_transfers WHERE company = ?').all(company) as any[];

    // In-memory indexing for fast company-isolated lookup
    const personById = new Map<string, any>();
    const personByCode = new Map<string, any>();
    const emailToPerson = new Map<string, any>();
    const phoneNameToPerson = new Map<string, any>();
    const nameToPeople = new Map<string, any[]>();
    const appsByPersonId = new Map<string, any[]>();
    const successfulTransfersByAppId = new Set<string>();

    for (const t of transfersList) {
      if (t.transfer_status === 'SUCCESS' && t.screening_applicant_id) {
        successfulTransfersByAppId.add(t.screening_applicant_id);
      }
    }

    for (const p of people) {
      personById.set(p.id, p);
      personByCode.set(p.person_id, p);
      const nm = (p.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (nm) {
        const list = nameToPeople.get(nm) || [];
        list.push(p);
        nameToPeople.set(nm, list);
      }
      if (p.primary_email) {
        emailToPerson.set(p.primary_email.trim().toLowerCase(), p);
      }
      if (p.primary_phone && nm) {
        const cPh = p.primary_phone.replace(/\D/g, '').slice(-10);
        if (cPh.length >= 7) phoneNameToPerson.set(`${cPh}:::${nm}`, p);
      }
    }

    for (const e of emails) {
      const p = personById.get(e.person_id);
      const nEmail = (e.normalized_email || e.email || '').trim().toLowerCase();
      if (p && nEmail) emailToPerson.set(nEmail, p);
    }

    for (const ph of phones) {
      const p = personById.get(ph.person_id);
      const cPh = (ph.phone_normalized || ph.phone_original || '').replace(/\D/g, '').slice(-10);
      if (p && cPh.length >= 7) {
        const nm = (p.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (nm) phoneNameToPerson.set(`${cPh}:::${nm}`, p);
      }
    }

    for (const app of apps) {
      const list = appsByPersonId.get(app.person_id) || [];
      list.push(app);
      appsByPersonId.set(app.person_id, list);
    }

    // Sequence calculation for new person IDs
    let maxSeq = 0;
    for (const p of people) {
      const match = (p.person_id || '').match(/P-(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxSeq) maxSeq = n;
      }
    }
    const globalMaxRow = this.db.prepare("SELECT MAX(CAST(substr(person_id, 3) AS INTEGER)) as max_n FROM master_people WHERE person_id LIKE 'P-%'").get() as any;
    if (globalMaxRow && globalMaxRow.max_n && globalMaxRow.max_n > maxSeq) {
      maxSeq = globalMaxRow.max_n;
    }
    let nextSeq = maxSeq + 1;

    // Prepared statements
    const insertPersonStmt = this.db.prepare(`
      INSERT INTO master_people (
        id, person_id, first_name, last_name, full_name, gender,
        primary_email, secondary_email, primary_phone, secondary_phone,
        location, zip_code, headline, current_title, current_company,
        linkedin_url, current_status, current_owner, company,
        green_card, h1b_status, created_at, updated_at, last_activity_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertEmailStmt = this.db.prepare(`
      INSERT INTO master_person_emails (
        id, person_id, email, normalized_email, is_primary, source, first_seen_at, last_seen_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPhoneStmt = this.db.prepare(`
      INSERT INTO master_person_phones (
        id, person_id, phone_original, phone_normalized, is_primary, source, first_seen_at, last_seen_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAppStmt = this.db.prepare(`
      INSERT INTO master_applications (
        id, person_id, applicant_id, company, job_id, job_title, technology,
        date_applied, current_stage, effective_result, source_file, source_batch_id,
        screening_applicant_id, transfer_id, resume_link, green_card, h1b_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAssignmentStmt = this.db.prepare(`
      INSERT INTO master_recruiter_assignments (
        id, person_id, recruiter_name, assigned_date, status, created_at, created_by, application_id
      ) VALUES (?, ?, ?, ?, 'Current', ?, ?, ?)
    `);

    const insertTransferStmt = this.db.prepare(`
      INSERT INTO master_transfers (
        id, screening_applicant_id, batch_id, company, person_id, application_id,
        transfer_status, duplicate_check_result, transferred_at, transferred_by, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateApplicantStmt = this.db.prepare(`
      UPDATE applicants
      SET master_person_id = ?,
          transfer_status = 'Transferred',
          transferred_at = ?,
          link_status = 'Linked',
          link_error = NULL
      WHERE id = ?
    `);

    const markApplicantSkippedStmt = this.db.prepare(`
      UPDATE applicants
      SET transfer_status = ?,
          transferred_at = ?,
          link_error = ?
      WHERE id = ?
    `);

    const insertPossibleMatchStmt = this.db.prepare(`
      INSERT INTO master_possible_matches (
        id, match_code, candidate_a_id, candidate_b_id, match_reason, company, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
    `);

    const transferResults: Array<{
      applicantId: string;
      applicantName: string;
      jobTitle: string;
      personId: string;
      applicationId: string;
      status: 'SUCCESS' | 'SKIPPED_EXISTING' | 'FAILED' | 'POSSIBLE_MATCH';
      classification: string;
      reason?: string;
    }> = [];

    let transferredCount = 0;
    let newCandidatesCount = 0;
    let existingCandidatesCount = 0;
    let newApplicationsCount = 0;
    let skippedDuplicatesCount = 0;
    let possibleMatchesCount = 0;
    let errorsCount = 0;

    const now = new Date().toISOString();

    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const a of eligiblePassed) {
        const appBatchId = a.import_id || a.batch_id || batchId || 'BATCH-UNKNOWN';
        const rawEmail = (a.email || '').trim().toLowerCase();
        const hasEmail = Boolean(rawEmail && rawEmail.includes('@') && !['n/a', 'none', 'null', 'undefined'].includes(rawEmail));
        const rawPhone = (a.phone || '').trim();
        const cleanPh = rawPhone.replace(/\D/g, '').slice(-10);
        const hasPhone = cleanPh.length >= 7;

        const fullName = (a.full_name || `${a.first_name || ''} ${a.last_name || ''}`).trim();
        const normName = fullName.toLowerCase().replace(/\s+/g, ' ');
        const jobRole = (a.job_title || a.normalized_role || 'General Applicant').trim();
        const technology = a.normalized_role || normalizeJobRole(jobRole);
        const appDate = a.date_applied || a.application_date || a.created_at?.split('T')[0] || now.split('T')[0];

        // 1. Idempotency Check: Was this exact screening applicant already transferred successfully?
        if (successfulTransfersByAppId.has(a.id)) {
          skippedDuplicatesCount++;
          const tId = `mt-${crypto.randomUUID()}`;
          insertTransferStmt.run(
            tId, a.id, appBatchId, company, a.master_person_id || null, null,
            'SKIPPED_EXISTING', 'ACCIDENTAL REIMPORT', now, transferredBy,
            'Applicant already previously transferred (idempotency guard).'
          );
          markApplicantSkippedStmt.run('Skipped (Already Transferred)', now, 'Already transferred', a.id);
          transferResults.push({
            applicantId: a.id,
            applicantName: fullName,
            jobTitle: jobRole,
            personId: a.master_person_id || '',
            applicationId: '',
            status: 'SKIPPED_EXISTING',
            classification: 'ACCIDENTAL REIMPORT',
            reason: 'Applicant was already transferred in a previous run.',
          });
          continue;
        }

        // 2. Candidate Matching within Company Context (Section 7)
        let matchedPerson: any = null;

        if (a.master_person_id && personByCode.has(a.master_person_id)) {
          matchedPerson = personByCode.get(a.master_person_id);
        }

        if (!matchedPerson && hasEmail && emailToPerson.has(rawEmail)) {
          matchedPerson = emailToPerson.get(rawEmail);
        }

        if (!matchedPerson && hasPhone && normName && phoneNameToPerson.has(`${cleanPh}:::${normName}`)) {
          matchedPerson = phoneNameToPerson.get(`${cleanPh}:::${normName}`);
        }

        // Possible match check: name matches but email and phone differ
        if (!matchedPerson && normName && nameToPeople.has(normName)) {
          const candCandidates = nameToPeople.get(normName)!;
          for (const candA of candCandidates) {
            possibleMatchesCount++;
            const matchCode = `PM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            insertPossibleMatchStmt.run(
              `pm-${crypto.randomUUID()}`,
              matchCode,
              candA.id,
              a.id,
              `Identical name '${fullName}' in ${company} with different contact credentials. Requires human recruiter review.`,
              company
            );
          }
        }

        // 3. Process Existing Candidate vs New Candidate
        if (matchedPerson) {
          // EXISTING CANDIDATE
          existingCandidatesCount++;

          // Check if candidate already has an application for this technology/role and date/source
          const personApps = appsByPersonId.get(matchedPerson.id) || [];
          const isSameApp = personApps.some(existingApp => {
            if (existingApp.screening_applicant_id && existingApp.screening_applicant_id === a.id) return true;
            // If same job requisition code (e.g. CT-001) and same applied date
            if (existingApp.job_id && a.job_id && existingApp.job_id === a.job_id && existingApp.date_applied === appDate) return true;
            // If same specific job title and same applied date and same source file
            if (existingApp.job_title && jobRole &&
                existingApp.job_title.trim().toLowerCase() === jobRole.toLowerCase() &&
                existingApp.date_applied === appDate &&
                existingApp.source_file === a.source_file) {
              return true;
            }
            return false;
          });

          if (isSameApp) {
            // EXISTING CANDIDATE + EXISTING APPLICATION (Accidental re-import of same role)
            skippedDuplicatesCount++;
            const tId = `mt-${crypto.randomUUID()}`;
            insertTransferStmt.run(
              tId, a.id, appBatchId, company, matchedPerson.id, null,
              'SKIPPED_EXISTING', 'EXISTING CANDIDATE + EXISTING APPLICATION', now, transferredBy,
              'Duplicate application for same job role and date already exists for candidate.'
            );
            markApplicantSkippedStmt.run('Skipped (Duplicate Application)', now, 'Existing candidate application duplicate', a.id);
            transferResults.push({
              applicantId: a.id,
              applicantName: fullName,
              jobTitle: jobRole,
              personId: matchedPerson.person_id,
              applicationId: '',
              status: 'SKIPPED_EXISTING',
              classification: 'EXISTING CANDIDATE + EXISTING APPLICATION',
              reason: 'Application already on record for candidate.',
            });
          } else {
            // EXISTING CANDIDATE + NEW APPLICATION (Genuine repeat / multi-technology application)
            const maId = `ma-${crypto.randomUUID()}`;
            const tId = `mt-${crypto.randomUUID()}`;

            insertAppStmt.run(
              maId,
              matchedPerson.id,
              a.id,
              company,
              a.job_id || null,
              jobRole,
              technology,
              appDate,
              'Passed',
              'PASS',
              a.source_file || null,
              appBatchId,
              a.id,
              tId,
              a.profile_url || null,
              a.green_card_answer || 'Yes',
              'No',
              now
            );

            // Enrich contact details if new email or phone supplied
            if (hasEmail && !emailToPerson.has(rawEmail)) {
              insertEmailStmt.run(`mpe-${crypto.randomUUID()}`, matchedPerson.id, rawEmail, rawEmail, 0, 'application_transfer', now, now, now);
              emailToPerson.set(rawEmail, matchedPerson);
            }
            if (hasPhone && normName && !phoneNameToPerson.has(`${cleanPh}:::${normName}`)) {
              insertPhoneStmt.run(`mpp-${crypto.randomUUID()}`, matchedPerson.id, rawPhone, cleanPh, 0, 'application_transfer', now, now, now);
              phoneNameToPerson.set(`${cleanPh}:::${normName}`, matchedPerson);
            }

            // Record assignment if recruiter assigned
            if (a.assigned_recruiter && a.assigned_recruiter !== 'Unassigned') {
              insertAssignmentStmt.run(`mra-${crypto.randomUUID()}`, matchedPerson.id, a.assigned_recruiter, appDate, now, transferredBy, maId);
            }

            // Record Transfer Audit
            insertTransferStmt.run(
              tId, a.id, appBatchId, company, matchedPerson.id, maId,
              'SUCCESS', 'EXISTING CANDIDATE + NEW APPLICATION', now, transferredBy, null
            );

            updateApplicantStmt.run(matchedPerson.person_id, now, a.id);
            successfulTransfersByAppId.add(a.id);

            personApps.push({
              id: maId,
              job_id: a.job_id,
              job_title: jobRole,
              technology,
              date_applied: appDate,
              screening_applicant_id: a.id,
              source_file: a.source_file,
            });
            appsByPersonId.set(matchedPerson.id, personApps);

            transferredCount++;
            newApplicationsCount++;

            transferResults.push({
              applicantId: a.id,
              applicantName: fullName,
              jobTitle: jobRole,
              personId: matchedPerson.person_id,
              applicationId: maId,
              status: 'SUCCESS',
              classification: 'EXISTING CANDIDATE + NEW APPLICATION',
            });
          }
        } else {
          // NEW CANDIDATE + NEW APPLICATION
          const personUuid = `p-${crypto.randomUUID()}`;
          const personCode = `P-${String(nextSeq++).padStart(6, '0')}`;
          const maId = `ma-${crypto.randomUUID()}`;
          const tId = `mt-${crypto.randomUUID()}`;

          insertPersonStmt.run(
            personUuid,
            personCode,
            a.first_name || '',
            a.last_name || '',
            fullName,
            a.gender || 'Unspecified',
            hasEmail ? rawEmail : null,
            null, // secondary email
            hasPhone ? cleanPh : null,
            null, // secondary phone
            a.location || null,
            a.zip_code || null,
            a.headline || null,
            a.current_title || jobRole,
            company,
            a.profile_url || null,
            'New',
            a.assigned_recruiter || 'Unassigned',
            company,
            a.green_card_answer || 'Yes',
            'No', // h1b_status defaults to No
            now,
            now,
            now
          );

          if (hasEmail) {
            insertEmailStmt.run(`mpe-${crypto.randomUUID()}`, personUuid, rawEmail, rawEmail, 1, 'initial_transfer', now, now, now);
          }
          if (hasPhone) {
            insertPhoneStmt.run(`mpp-${crypto.randomUUID()}`, personUuid, rawPhone, cleanPh, 1, 'initial_transfer', now, now, now);
          }

          insertAppStmt.run(
            maId,
            personUuid,
            a.id,
            company,
            a.job_id || null,
            jobRole,
            technology,
            appDate,
            'Passed',
            'PASS',
            a.source_file || null,
            appBatchId,
            a.id,
            tId,
            a.profile_url || null,
            a.green_card_answer || 'Yes',
            'No',
            now
          );

          if (a.assigned_recruiter && a.assigned_recruiter !== 'Unassigned') {
            insertAssignmentStmt.run(`mra-${crypto.randomUUID()}`, personUuid, a.assigned_recruiter, appDate, now, transferredBy, maId);
          }

          insertTransferStmt.run(
            tId, a.id, appBatchId, company, personUuid, maId,
            'SUCCESS', 'NEW CANDIDATE + NEW APPLICATION', now, transferredBy, null
          );

          updateApplicantStmt.run(personCode, now, a.id);
          successfulTransfersByAppId.add(a.id);

          const newPersonObj = {
            id: personUuid,
            person_id: personCode,
            full_name: fullName,
            company,
            primary_email: hasEmail ? rawEmail : null,
            primary_phone: hasPhone ? cleanPh : null,
          };

          personById.set(personUuid, newPersonObj);
          personByCode.set(personCode, newPersonObj);
          if (hasEmail) emailToPerson.set(rawEmail, newPersonObj);
          if (hasPhone && normName) phoneNameToPerson.set(`${cleanPh}:::${normName}`, newPersonObj);
          if (normName) {
            const list = nameToPeople.get(normName) || [];
            list.push(newPersonObj);
            nameToPeople.set(normName, list);
          }
          appsByPersonId.set(personUuid, [{
            id: maId,
            job_id: a.job_id,
            job_title: jobRole,
            technology,
            date_applied: appDate,
            screening_applicant_id: a.id,
            source_file: a.source_file,
          }]);

          transferredCount++;
          newCandidatesCount++;
          newApplicationsCount++;

          transferResults.push({
            applicantId: a.id,
            applicantName: fullName,
            jobTitle: jobRole,
            personId: personCode,
            applicationId: maId,
            status: 'SUCCESS',
            classification: 'NEW CANDIDATE + NEW APPLICATION',
          });
        }
      }

      this.db.exec('COMMIT');
    } catch (err: any) {
      this.db.exec('ROLLBACK');
      console.error('[DatabaseService] transferPassedApplicationsToMaster error:', err);
      throw err;
    }

    // Add comprehensive audit log
    this.addAuditLog({
      id: `audit-${Date.now()}`,
      timestamp: now,
      user: transferredBy,
      action: 'Transfer Passed Applications',
      reason: `User executed Send Passed Applications to Master Database for ${company}.`,
      details: `Evaluated ${eligiblePassed.length} passed records. Transferred: ${transferredCount} (${newCandidatesCount} new candidate profiles, ${newApplicationsCount - newCandidatesCount} repeat applications). Skipped ${skippedDuplicatesCount} duplicates. Flagged ${possibleMatchesCount} possible matches.`,
    });

    return {
      success: true,
      company,
      totalEligiblePassed: eligiblePassed.length,
      transferredCount,
      newCandidatesCount,
      existingCandidatesCount,
      newApplicationsCount,
      skippedDuplicatesCount,
      possibleMatchesCount,
      errorsCount,
      batchId,
      message: `Successfully transferred ${transferredCount} passed application(s) to Master Database (${newCandidatesCount} new candidate profiles created, ${newApplicationsCount - newCandidatesCount} repeat applications added). Skipped ${skippedDuplicatesCount} duplicate application(s).`,
      transfers: transferResults,
    };
  }

  /**
   * Returns live transfer status metrics for a given batch or company
   */
  getTransferStatus(company: 'AaraTech' | 'ClinisolTech', batchId?: string): {
    company: 'AaraTech' | 'ClinisolTech';
    batchId?: string;
    totalApplicants: number;
    passedCount: number;
    manualReviewCount: number;
    failedCount: number;
    transferredCount: number;
    pendingTransferCount: number;
    skippedCount: number;
  } {
    const conditions: string[] = ['company = ?'];
    const params: any[] = [company];

    if (batchId && batchId !== 'ALL') {
      conditions.push('(import_id = ? OR batch_id = ?)');
      params.push(batchId, batchId);
    }

    const where = conditions.join(' AND ');

    const row = this.db.prepare(`
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed_count,
        SUM(CASE WHEN effective_result = 'MANUAL_REVIEW' THEN 1 ELSE 0 END) as manual_review_count,
        SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed_count,
        SUM(CASE WHEN effective_result = 'PASS' AND transfer_status = 'Transferred' THEN 1 ELSE 0 END) as transferred_count,
        SUM(CASE WHEN effective_result = 'PASS' AND (transfer_status IS NULL OR transfer_status = 'Not Transferred') THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN transfer_status LIKE 'Skipped%' THEN 1 ELSE 0 END) as skipped_count
      FROM applicants
      WHERE ${where}
    `).get(...params) as any;

    return {
      company,
      batchId,
      totalApplicants: Number(row.total_count) || 0,
      passedCount: Number(row.passed_count) || 0,
      manualReviewCount: Number(row.manual_review_count) || 0,
      failedCount: Number(row.failed_count) || 0,
      transferredCount: Number(row.transferred_count) || 0,
      pendingTransferCount: Number(row.pending_count) || 0,
      skippedCount: Number(row.skipped_count) || 0,
    };
  }

  getMasterCandidates(params: string | {
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
  } = {}): { candidates: any[]; totalCount: number } {
    const opts = typeof params === 'string' ? { company: params } : (params || {});
    const page = Math.max(1, Number(opts.page) || 1);
    const pageSize = Math.min(500, Math.max(1, Number(opts.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const values: any[] = [];

    if (opts.company && opts.company !== 'All' && opts.company !== 'Both') {
      conditions.push('p.company = ?');
      values.push(opts.company);
    }

    if (opts.status && opts.status !== 'All') {
      conditions.push('p.current_status = ?');
      values.push(opts.status);
    }

    if (opts.owner && opts.owner !== 'All') {
      conditions.push('p.current_owner = ?');
      values.push(opts.owner);
    }

    if (opts.gender && opts.gender !== 'All') {
      conditions.push('p.gender = ?');
      values.push(opts.gender);
    }

    if (opts.search && typeof opts.search === 'string' && opts.search.trim()) {
      const q = `%${opts.search.trim()}%`;
      conditions.push(`(
        p.full_name LIKE ? OR
        p.person_id LIKE ? OR
        p.primary_email LIKE ? OR
        p.primary_phone LIKE ? OR
        p.location LIKE ? OR
        p.current_title LIKE ?
      )`);
      values.push(q, q, q, q, q, q);
    }

    if (opts.contactFilter === 'missing_phone') {
      conditions.push("(p.primary_phone IS NULL OR p.primary_phone = '')");
    } else if (opts.contactFilter === 'missing_email') {
      conditions.push("(p.primary_email IS NULL OR p.primary_email = '')");
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = this.db.prepare(`SELECT COUNT(*) as count FROM master_people p ${where}`).get(...values) as { count: number };
    const totalCount = countRow?.count || 0;

    const sortBy = (opts as any).sortBy || 'created_at';
    const sortOrder = (opts as any).sortOrder === 'asc' ? 'ASC' : 'DESC';

    let orderByClause = 'p.created_at DESC';
    if (sortBy === 'total_applications' || sortBy === 'repeat_applications') {
      orderByClause = `(SELECT COUNT(*) FROM master_applications ma WHERE ma.person_id = p.id OR ma.person_id = p.person_id) ${sortOrder}, p.created_at DESC`;
    } else if (sortBy === 'first_applied_date') {
      orderByClause = `COALESCE((SELECT MIN(ma.date_applied) FROM master_applications ma WHERE ma.person_id = p.id OR ma.person_id = p.person_id), p.application_collected_date, substr(p.created_at, 1, 10)) ${sortOrder}, p.created_at DESC`;
    } else if (sortBy === 'last_applied_date') {
      orderByClause = `COALESCE((SELECT MAX(ma.date_applied) FROM master_applications ma WHERE ma.person_id = p.id OR ma.person_id = p.person_id), p.application_collected_date, substr(p.created_at, 1, 10)) ${sortOrder}, p.created_at DESC`;
    } else if (sortBy === 'name' || sortBy === 'full_name') {
      orderByClause = `p.full_name COLLATE NOCASE ${sortOrder}`;
    } else if (sortBy === 'status') {
      orderByClause = `p.current_status ${sortOrder}`;
    } else if (sortBy === 'date_assigned' || sortBy === 'assigned_date') {
      orderByClause = `COALESCE(p.recruiter_assigned_date, p.last_assignment_date, substr(p.created_at, 1, 10)) ${sortOrder}`;
    } else if (sortBy === 'created_at') {
      orderByClause = `p.created_at ${sortOrder}`;
    }

    const peopleRows = this.db.prepare(`
      SELECT p.*
      FROM master_people p
      ${where}
      ORDER BY ${orderByClause}
      LIMIT ? OFFSET ?
    `).all(...values, pageSize, offset) as any[];

    if (peopleRows.length === 0) {
      return { candidates: [], totalCount };
    }

    const personIds = peopleRows.map(p => p.id);
    const placeholders = personIds.map(() => '?').join(',');

    const emails = this.db.prepare(`SELECT * FROM master_person_emails WHERE person_id IN (${placeholders})`).all(...personIds) as any[];
    const phones = this.db.prepare(`SELECT * FROM master_person_phones WHERE person_id IN (${placeholders})`).all(...personIds) as any[];
    const applications = this.db.prepare(`SELECT * FROM master_applications WHERE person_id IN (${placeholders})`).all(...personIds) as any[];
    const contacts = this.db.prepare(`SELECT * FROM master_recruiter_contacts WHERE person_id IN (${placeholders}) ORDER BY created_at DESC`).all(...personIds) as any[];
    const assignments = this.db.prepare(`SELECT * FROM master_recruiter_assignments WHERE person_id IN (${placeholders}) ORDER BY assigned_date DESC, created_at DESC`).all(...personIds) as any[];

    // Fallback applications from applicants table
    const linkedApplicants = this.db.prepare(`SELECT * FROM applicants WHERE master_person_id IN (${placeholders})`).all(...personIds) as any[];
    const linkedAppsByPerson = new Map<string, any[]>();
    for (const la of linkedApplicants) {
      if (!linkedAppsByPerson.has(la.master_person_id)) linkedAppsByPerson.set(la.master_person_id, []);
      linkedAppsByPerson.get(la.master_person_id)!.push({
        id: `ma-${la.id}`,
        person_id: la.master_person_id,
        applicant_id: la.id,
        company: la.company,
        job_id: la.job_id || null,
        job_title: la.job_title || 'Position',
        date_applied: la.application_date || la.date_applied || null,
        current_stage: la.review_decision || la.effective_result || 'Applied',
        screening_result: la.effective_result,
        source_file: la.source_file,
        created_at: la.created_at,
      });
    }

    const emailsByPerson = new Map<string, any[]>();
    for (const e of emails) {
      if (!emailsByPerson.has(e.person_id)) emailsByPerson.set(e.person_id, []);
      emailsByPerson.get(e.person_id)!.push({
        id: e.id,
        person_id: e.person_id,
        email: e.email,
        normalized_email: e.normalized_email,
        is_primary: Boolean(e.is_primary),
        source: e.source,
        created_at: e.created_at,
      });
    }

    const phonesByPerson = new Map<string, any[]>();
    for (const ph of phones) {
      if (!phonesByPerson.has(ph.person_id)) phonesByPerson.set(ph.person_id, []);
      phonesByPerson.get(ph.person_id)!.push({
        id: ph.id,
        person_id: ph.person_id,
        phone_original: ph.phone_original,
        phone_normalized: ph.phone_normalized,
        is_primary: Boolean(ph.is_primary),
        source: ph.source,
        created_at: ph.created_at,
      });
    }

    const appsByPerson = new Map<string, any[]>();
    for (const a of applications) {
      if (!appsByPerson.has(a.person_id)) appsByPerson.set(a.person_id, []);
      appsByPerson.get(a.person_id)!.push({
        id: a.id,
        person_id: a.person_id,
        company: a.company,
        job_id: a.job_id,
        job_title: a.job_title,
        date_applied: a.date_applied,
        current_stage: a.current_stage,
        screening_result: a.effective_result,
        source_file: a.source_file,
        created_at: a.created_at,
      });
    }

    const contactsByPerson = new Map<string, any[]>();
    const seenContactKeysByPerson = new Map<string, Set<string>>();
    for (const c of contacts) {
      if (!contactsByPerson.has(c.person_id)) {
        contactsByPerson.set(c.person_id, []);
        seenContactKeysByPerson.set(c.person_id, new Set<string>());
      }
      const cDate = (c.contact_date || (c.created_at ? c.created_at.split('T')[0] : '')).split('T')[0];
      const cRec = (c.recruiter_name || '').trim().toLowerCase();
      const cF1 = (c.feedback_1 || '').trim().toLowerCase();
      const cF2 = (c.feedback_2 || '').trim().toLowerCase();
      const cRaw = (c.raw_feedback || c.notes || '').trim().toLowerCase();
      const cKey = `${cDate}:::${cRec}:::${cF1}:::${cF2}:::${cRaw}`;
      
      const personSeen = seenContactKeysByPerson.get(c.person_id)!;
      if (personSeen.has(cKey)) continue;
      personSeen.add(cKey);

      contactsByPerson.get(c.person_id)!.push({
        id: c.id,
        person_id: c.person_id,
        application_id: c.application_id || null,
        source_row_number: c.source_row_number || null,
        recruiter_name: c.recruiter_name,
        contact_type: c.contact_type,
        contact_method: c.contact_method || c.contact_type || 'Phone',
        outcome: c.outcome || 'Note Logged',
        feedback_1: c.feedback_1 || null,
        feedback_2: c.feedback_2 || null,
        next_follow_up: c.next_follow_up || null,
        original_feedback: c.raw_feedback || c.notes || '',
        raw_feedback: c.raw_feedback || c.notes || '',
        notes: c.notes || c.raw_feedback || '',
        contact_date: c.contact_date || (c.created_at ? c.created_at.split('T')[0] : null),
        source_file: c.source_file || null,
        created_at: c.created_at,
      });
    }

    const assignmentsByPerson = new Map<string, any[]>();
    for (const asgn of assignments) {
      if (!assignmentsByPerson.has(asgn.person_id)) assignmentsByPerson.set(asgn.person_id, []);
      assignmentsByPerson.get(asgn.person_id)!.push({
        id: asgn.id,
        person_id: asgn.person_id,
        application_id: asgn.application_id || null,
        source_row_number: asgn.source_row_number || null,
        source_file: asgn.source_file || null,
        recruiter_name: asgn.recruiter_name,
        assigned_date: asgn.assigned_date,
        status: asgn.status,
        reassignment_reason: asgn.reassignment_reason,
        created_at: asgn.created_at,
        created_by: asgn.created_by,
      });
    }

    const candidates = peopleRows.map(p => {
      const personAssignments = assignmentsByPerson.get(p.id) || [];
      const personContacts = contactsByPerson.get(p.id) || [];
      let personApps = appsByPerson.get(p.id) || [];

      // Resilient application fallback
      if (personApps.length === 0) {
        personApps = linkedAppsByPerson.get(p.id) || [];
      }
      if (personApps.length === 0 && (p.current_title || p.company)) {
        personApps = [{
          id: `ma-${p.id}-default`,
          person_id: p.id,
          company: p.company,
          job_id: null,
          job_title: p.current_title || 'Candidate Application',
          date_applied: p.application_collected_date || (p.created_at ? p.created_at.split('T')[0] : null),
          current_stage: p.current_status || 'Applied',
          screening_result: 'PASS',
          source_file: 'Master Profile Intake',
          created_at: p.created_at,
        }];
      }

      const appDates = personApps.map((a: any) => a.date_applied).filter(Boolean).sort();
      const firstAppliedDate = appDates[0] || p.application_collected_date || (p.created_at ? p.created_at.split('T')[0] : null);
      const lastAppliedDate = appDates[appDates.length - 1] || p.application_collected_date || (p.created_at ? p.created_at.split('T')[0] : null);
      const totalApplications = Math.max(personApps.length, 1);
      const repeatApplications = Math.max(0, totalApplications - 1);

      // Authoritative owner from active assignment (status: 'Current')
      const activeAssign = personAssignments.find(a => a.status === 'Current') || personAssignments[0];
      const authoritativeOwner = activeAssign ? activeAssign.recruiter_name : (p.current_owner || 'Unassigned');

      let unclassLinks: string[] = [];
      try {
        if (p.unclassified_links) {
          unclassLinks = typeof p.unclassified_links === 'string' ? JSON.parse(p.unclassified_links) : p.unclassified_links;
        }
      } catch {}

      return {
        id: p.id,
        person_id: p.person_id,
        company: p.company,
        first_name: p.first_name,
        last_name: p.last_name,
        full_name: p.full_name,
        gender: p.gender || 'Unspecified',
        primary_email: p.primary_email,
        secondary_email: p.secondary_email,
        primary_phone: p.primary_phone,
        secondary_phone: p.secondary_phone,
        location: p.location,
        zip_code: p.zip_code,
        headline: p.headline,
        current_title: p.current_title,
        current_company: p.current_company,
        linkedin_url: p.linkedin_url,
        resume_url: p.resume_url || null,
        unclassified_links: unclassLinks,
        green_card: p.green_card || null,
        h1b_status: p.h1b_status || null,
        application_collected_date: p.application_collected_date || null,
        recruiter_assigned_date: activeAssign?.assigned_date || p.recruiter_assigned_date || p.last_assignment_date || null,
        first_assigned_recruiter: p.first_assigned_recruiter || authoritativeOwner,
        first_confirmed_contacted_by: p.first_confirmed_contacted_by || (personContacts.length > 0 ? personContacts[personContacts.length - 1].recruiter_name : null),
        last_contacted_by: p.last_contacted_by || (personContacts[0]?.recruiter_name || null),
        latest_contact_outcome: p.latest_contact_outcome || (personContacts[0]?.outcome || null),
        last_assignment_date: activeAssign?.assigned_date || p.last_assignment_date || p.recruiter_assigned_date || null,
        last_contact_date: p.last_contact_date || (personContacts[0]?.contact_date || null),
        current_status: p.current_status,
        current_owner: authoritativeOwner,
        merged_into_id: p.merged_into_id,
        created_at: p.created_at,
        updated_at: p.updated_at,
        last_activity_at: p.last_activity_at,
        total_applications: totalApplications,
        repeat_applications: repeatApplications,
        first_applied_date: firstAppliedDate,
        last_applied_date: lastAppliedDate,
        emails: emailsByPerson.get(p.id) || [],
        phones: phonesByPerson.get(p.id) || [],
        applications: personApps,
        recruiter_contacts: personContacts,
        assignments: personAssignments,
      };
    });

    return { candidates, totalCount };
  }

  getMasterCandidateById(idOrPersonId: string): any | null {
    const p = this.db.prepare('SELECT * FROM master_people WHERE id = ? OR person_id = ?').get(idOrPersonId, idOrPersonId) as any;
    if (!p) return null;

    const emails = this.db.prepare('SELECT * FROM master_person_emails WHERE person_id = ?').all(p.id) as any[];
    const phones = this.db.prepare('SELECT * FROM master_person_phones WHERE person_id = ?').all(p.id) as any[];
    let applications = this.db.prepare('SELECT * FROM master_applications WHERE person_id = ? OR person_id = ? ORDER BY date_applied DESC, created_at DESC').all(p.id, p.person_id) as any[];

    // Fallback applications from applicants table (prevents "applications count showing but empty" problem)
    if (applications.length === 0) {
      const linked = this.db.prepare('SELECT * FROM applicants WHERE master_person_id = ? OR master_person_id = ?').all(p.id, p.person_id) as any[];
      if (linked.length > 0) {
        applications = linked.map(la => ({
          id: `ma-${la.id}`,
          person_id: p.id,
          applicant_id: la.id,
          company: la.company || p.company,
          job_id: la.job_id || null,
          job_title: la.job_title || p.current_title || 'Position',
          date_applied: la.application_date || la.date_applied || (p.created_at ? p.created_at.split('T')[0] : null),
          current_stage: la.review_decision || la.effective_result || 'Applied',
          effective_result: la.effective_result,
          source_file: la.source_file,
          created_at: la.created_at,
        }));
      } else if (p.current_title || p.company) {
        applications = [{
          id: `ma-${p.id}-default`,
          person_id: p.id,
          company: p.company,
          job_id: null,
          job_title: p.current_title || 'Candidate Application',
          date_applied: p.application_collected_date || (p.created_at ? p.created_at.split('T')[0] : null),
          current_stage: p.current_status || 'Applied',
          effective_result: 'PASS',
          source_file: 'Master Profile Intake',
          created_at: p.created_at,
        }];
      }
    }

    const appDates = applications.map(a => a.date_applied).filter(Boolean).sort();
    const firstAppliedDate = appDates[0] || p.application_collected_date || (p.created_at ? p.created_at.split('T')[0] : null);
    const lastAppliedDate = appDates[appDates.length - 1] || p.application_collected_date || (p.created_at ? p.created_at.split('T')[0] : null);
    const totalApplications = Math.max(applications.length, 1);
    const repeatApplications = Math.max(0, totalApplications - 1);

    const transfers = (this.db.prepare('SELECT * FROM master_transfers WHERE person_id = ? OR person_id = ? ORDER BY transferred_at DESC').all(p.id, p.person_id) as any[]).map(t => ({
      id: t.id,
      screening_applicant_id: t.screening_applicant_id,
      batch_id: t.batch_id,
      company: t.company,
      person_id: t.person_id,
      application_id: t.application_id,
      transfer_status: t.transfer_status,
      duplicate_check_result: t.duplicate_check_result,
      transferred_at: t.transferred_at,
      transferred_by: t.transferred_by,
      error_message: t.error_message,
    }));

    let assignments = (this.db.prepare('SELECT * FROM master_recruiter_assignments WHERE person_id = ? OR person_id = ? ORDER BY assigned_date DESC, created_at DESC').all(p.id, p.person_id) as any[]).map(a => ({
      id: a.id,
      person_id: a.person_id,
      recruiter_name: a.recruiter_name,
      assigned_date: a.assigned_date,
      status: a.status,
      reassignment_reason: a.reassignment_reason,
      created_at: a.created_at,
      created_by: a.created_by,
    }));

    // If assignments empty but owner assigned, synthesize initial assignment
    if (assignments.length === 0 && p.current_owner && p.current_owner !== 'Unassigned') {
      assignments.push({
        id: `mra-${p.id}-init`,
        person_id: p.id,
        recruiter_name: p.current_owner,
        assigned_date: p.recruiter_assigned_date || p.application_collected_date || (p.created_at ? p.created_at.split('T')[0] : '2025-01-25'),
        status: 'Current',
        reassignment_reason: 'Initial intake assignment',
        created_at: p.created_at || new Date().toISOString(),
        created_by: 'System Intake',
      });
    }

    const rawContacts = (this.db.prepare('SELECT * FROM master_recruiter_contacts WHERE person_id = ? OR person_id = ? ORDER BY created_at DESC').all(p.id, p.person_id) as any[]);
    const seenContactKeys = new Set<string>();
    const contacts: any[] = [];
    for (const rc of rawContacts) {
      const cDate = (rc.contact_date || (rc.created_at ? rc.created_at.split('T')[0] : '')).split('T')[0];
      const cRec = (rc.recruiter_name || '').trim().toLowerCase();
      const cF1 = (rc.feedback_1 || '').trim().toLowerCase();
      const cF2 = (rc.feedback_2 || '').trim().toLowerCase();
      const cRaw = (rc.raw_feedback || rc.notes || '').trim().toLowerCase();
      const cKey = `${cDate}:::${cRec}:::${cF1}:::${cF2}:::${cRaw}`;
      if (seenContactKeys.has(cKey)) continue;
      seenContactKeys.add(cKey);

      contacts.push({
        id: rc.id,
        person_id: rc.person_id,
        recruiter_name: rc.recruiter_name,
        contact_type: rc.contact_type,
        contact_method: rc.contact_method || rc.contact_type || 'Phone',
        outcome: rc.outcome || 'Note Logged',
        feedback_1: rc.feedback_1 || null,
        feedback_2: rc.feedback_2 || null,
        next_follow_up: rc.next_follow_up || null,
        original_feedback: rc.raw_feedback || rc.notes || '',
        raw_feedback: rc.raw_feedback || rc.notes || '',
        notes: rc.notes || rc.raw_feedback || '',
        contact_date: rc.contact_date || (rc.created_at ? rc.created_at.split('T')[0] : null),
        source_file: rc.source_file || null,
        created_at: rc.created_at,
      });
    }

    const activeAssign = assignments.find(a => a.status === 'Current') || assignments[0];
    const authoritativeOwner = activeAssign ? activeAssign.recruiter_name : (p.current_owner || 'Unassigned');

    const firstAssigned = [...assignments].sort((a,b) => (a.assigned_date || '').localeCompare(b.assigned_date || ''))[0]?.recruiter_name || p.first_assigned_recruiter || authoritativeOwner;
    const firstContacted = [...contacts].sort((a,b) => (a.contact_date || '').localeCompare(b.contact_date || ''))[0]?.recruiter_name || p.first_confirmed_contacted_by || null;
    const lastContacted = contacts[0]?.recruiter_name || p.last_contacted_by || null;
    const latestOutcome = contacts[0]?.outcome || p.latest_contact_outcome || null;
    const lastAssignDate = activeAssign?.assigned_date || p.last_assignment_date || p.recruiter_assigned_date || null;
    const lastContactDate = contacts[0]?.contact_date || p.last_contact_date || null;

    let unclassLinks: string[] = [];
    try {
      if (p.unclassified_links) {
        unclassLinks = typeof p.unclassified_links === 'string' ? JSON.parse(p.unclassified_links) : p.unclassified_links;
      }
    } catch {}

    return {
      id: p.id,
      person_id: p.person_id,
      company: p.company,
      first_name: p.first_name,
      last_name: p.last_name,
      full_name: p.full_name,
      gender: p.gender || 'Unspecified',
      primary_email: p.primary_email,
      secondary_email: p.secondary_email,
      primary_phone: p.primary_phone,
      secondary_phone: p.secondary_phone,
      location: p.location,
      zip_code: p.zip_code,
      headline: p.headline,
      current_title: p.current_title,
      current_company: p.current_company,
      linkedin_url: p.linkedin_url,
      resume_url: p.resume_url || null,
      unclassified_links: unclassLinks,
      green_card: p.green_card || null,
      h1b_status: p.h1b_status || null,
      application_collected_date: p.application_collected_date || null,
      recruiter_assigned_date: lastAssignDate,
      first_assigned_recruiter: firstAssigned,
      first_confirmed_contacted_by: firstContacted,
      current_owner: authoritativeOwner,
      last_contacted_by: lastContacted,
      latest_contact_outcome: latestOutcome,
      last_assignment_date: lastAssignDate,
      last_contact_date: lastContactDate,
      current_status: p.current_status,
      merged_into_id: p.merged_into_id,
      created_at: p.created_at,
      updated_at: p.updated_at,
      last_activity_at: p.last_activity_at,
      total_applications: totalApplications,
      repeat_applications: repeatApplications,
      first_applied_date: firstAppliedDate,
      last_applied_date: lastAppliedDate,
      emails: emails.map(e => ({
        id: e.id,
        person_id: e.person_id,
        email: e.email,
        normalized_email: e.normalized_email,
        is_primary: Boolean(e.is_primary),
        source: e.source,
        created_at: e.created_at,
      })),
      phones: phones.map(ph => ({
        id: ph.id,
        person_id: ph.person_id,
        phone_original: ph.phone_original,
        phone_normalized: ph.phone_normalized,
        is_primary: Boolean(ph.is_primary),
        source: ph.source,
        created_at: ph.created_at,
      })),
      applications: applications.map(a => ({
        id: a.id,
        person_id: a.person_id,
        company: a.company,
        job_id: a.job_id,
        job_title: a.job_title,
        technology: a.technology || null,
        date_applied: a.date_applied,
        application_collected_date: a.application_collected_date || null,
        recruiter_assigned_date: a.recruiter_assigned_date || null,
        green_card: a.green_card || null,
        h1b_status: a.h1b_status || null,
        current_stage: a.current_stage,
        screening_result: a.screening_result || a.effective_result || a.current_stage,
        screening_applicant_id: a.screening_applicant_id || a.applicant_id || null,
        source_batch_id: a.source_batch_id || null,
        transfer_id: a.transfer_id || null,
        source_file: a.source_file,
        source_row: a.source_row || null,
        resume_link: a.resume_url || a.resume_link,
        created_at: a.created_at,
      })),
      recruiter_contacts: contacts,
      assignments,
      transfers,
      status_history: (this.db.prepare('SELECT * FROM master_status_history WHERE person_id = ? ORDER BY created_at DESC').all(p.id) as any[]).map(sh => ({
        id: sh.id,
        person_id: sh.person_id,
        old_status: sh.old_status,
        new_status: sh.new_status,
        changed_by: sh.changed_by,
        reason: sh.reason,
        created_at: sh.created_at,
      })),
    };
  }

  reassignMasterCandidate(personId: string, recruiterName: string, assignedDate?: string, reason?: string, user = 'Recruiter Admin'): any | null {
    const person = this.db.prepare('SELECT id, full_name, person_id, current_owner, first_assigned_recruiter FROM master_people WHERE id = ? OR person_id = ?').get(personId, personId) as any;
    if (!person) return null;

    const now = new Date().toISOString();
    const aDate = assignedDate || now.split('T')[0];
    const prevOwner = person.current_owner || 'Unassigned';

    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.prepare(`UPDATE master_recruiter_assignments SET status = 'Reassigned' WHERE (person_id = ? OR person_id = ?) AND status = 'Current'`).run(person.id, person.person_id);

      const asgnId = `mra-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      this.db.prepare(`
        INSERT INTO master_recruiter_assignments (id, person_id, recruiter_name, assigned_date, status, reassignment_reason, created_at, created_by)
        VALUES (?, ?, ?, ?, 'Current', ?, ?, ?)
      `).run(asgnId, person.id, recruiterName, aDate, reason || 'Reassigned by recruiter', now, user);

      const firstAssigned = person.first_assigned_recruiter || (prevOwner !== 'Unassigned' ? prevOwner : recruiterName);
      this.db.prepare(`
        UPDATE master_people
        SET current_owner = ?, recruiter_assigned_date = ?, last_assignment_date = ?, first_assigned_recruiter = ?, updated_at = ?, last_activity_at = ?
        WHERE id = ?
      `).run(recruiterName, aDate, aDate, firstAssigned, now, now, person.id);

      this.addAuditLog({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: now,
        user,
        action: 'Recruiter Reassigned',
        applicantName: person.full_name,
        reason: reason || `Reassigned from ${prevOwner} to ${recruiterName}`,
        details: `Candidate ${person.full_name} (${person.person_id}) reassigned to ${recruiterName}. Reason: ${reason || 'Manual reassignment'}.`,
      });

      this.db.exec('COMMIT');
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw err;
    }

    return this.getMasterCandidateById(person.id);
  }

  addMasterContactAttempt(personId: string, data: { recruiter_name: string; contact_method?: string; outcome?: string; feedback_1?: string; feedback_2?: string; notes?: string; contact_date?: string; next_follow_up?: string; source_file?: string }, user = 'Recruiter Admin'): any | null {
    const person = this.db.prepare('SELECT id, full_name, person_id, first_confirmed_contacted_by FROM master_people WHERE id = ? OR person_id = ?').get(personId, personId) as any;
    if (!person) return null;

    const now = new Date().toISOString();
    const cDate = data.contact_date || now.split('T')[0];
    const contactId = `mrc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const fullNotes = data.notes || [data.feedback_1, data.feedback_2].filter(Boolean).join('\n') || '';

    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.prepare(`
        INSERT INTO master_recruiter_contacts (
          id, person_id, recruiter_name, contact_type, notes, contact_date, created_at,
          contact_method, outcome, feedback_1, feedback_2, next_follow_up, raw_feedback, source_file, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        contactId,
        person.id,
        data.recruiter_name,
        data.contact_method || 'Phone',
        fullNotes,
        cDate,
        now,
        data.contact_method || 'Phone',
        data.outcome || 'Contact Logged',
        data.feedback_1 || null,
        data.feedback_2 || null,
        data.next_follow_up || null,
        fullNotes,
        data.source_file || null,
        user
      );

      const firstContacted = person.first_confirmed_contacted_by || data.recruiter_name;
      this.db.prepare(`
        UPDATE master_people
        SET last_contacted_by = ?, latest_contact_outcome = ?, last_contact_date = ?, first_confirmed_contacted_by = ?, last_activity_at = ?, updated_at = ?
        WHERE id = ?
      `).run(data.recruiter_name, data.outcome || 'Contact Logged', cDate, firstContacted, now, now, person.id);

      this.addAuditLog({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: now,
        user,
        action: 'Recruiter Contact Logged',
        applicantName: person.full_name,
        reason: `${data.contact_method || 'Contact'} with ${data.recruiter_name}`,
        details: `Outcome: ${data.outcome || 'Logged'}. Notes: ${fullNotes.substring(0, 100)}`,
      });

      this.db.exec('COMMIT');
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw err;
    }

    return this.getMasterCandidateById(person.id);
  }

  updateMasterCandidate(id: string, updates: Record<string, any>, user = 'Recruiter Admin'): boolean {
    const person = this.db.prepare('SELECT * FROM master_people WHERE id = ? OR person_id = ?').get(id, id) as any;
    if (!person) return false;

    const now = new Date().toISOString();
    const setClauses: string[] = ['updated_at = ?', 'last_activity_at = ?'];
    const values: any[] = [now, now];

    if (updates.current_status !== undefined && updates.current_status !== null) {
      setClauses.push('current_status = ?');
      values.push(updates.current_status);

      if (updates.current_status !== person.current_status) {
        try {
          this.db.prepare(`
            INSERT INTO master_status_history (id, person_id, old_status, new_status, changed_by, reason, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).run(
            `msh-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            person.id,
            person.current_status,
            updates.current_status,
            user,
            updates.reason || 'Status updated by recruiter',
            now
          );
        } catch {}
      }
    }

    if (updates.current_owner !== undefined && updates.current_owner !== null) {
      setClauses.push('current_owner = ?');
      values.push(updates.current_owner);
    }

    if (updates.gender !== undefined && updates.gender !== null) {
      setClauses.push('gender = ?');
      values.push(updates.gender);
    }

    if (updates.full_name !== undefined && updates.full_name !== null) {
      setClauses.push('full_name = ?');
      values.push(updates.full_name);
    }

    if (updates.primary_email !== undefined && updates.primary_email !== null) {
      setClauses.push('primary_email = ?');
      values.push(updates.primary_email);
    }

    if (updates.primary_phone !== undefined && updates.primary_phone !== null) {
      setClauses.push('primary_phone = ?');
      values.push(updates.primary_phone);
    }

    if (updates.location !== undefined && updates.location !== null) {
      setClauses.push('location = ?');
      values.push(updates.location);
    }

    if (updates.current_title !== undefined && updates.current_title !== null) {
      setClauses.push('current_title = ?');
      values.push(updates.current_title);
    }

    if (updates.green_card !== undefined) {
      setClauses.push('green_card = ?');
      values.push(updates.green_card);
    }

    if (updates.h1b_status !== undefined) {
      setClauses.push('h1b_status = ?');
      values.push(updates.h1b_status);
    }

    if (updates.resume_url !== undefined) {
      setClauses.push('resume_url = ?');
      values.push(updates.resume_url);
    }

    values.push(person.id);
    const sql = `UPDATE master_people SET ${setClauses.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...values);

    // Audit log
    this.addAuditLog({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      user,
      action: 'Master Candidate Update',
      applicantName: person.full_name,
      reason: updates.reason || 'Updated candidate profile in CRM',
      details: `Updated ${Object.keys(updates).join(', ')} for ${person.full_name} (${person.person_id}).`,
    });

    return true;
  }

  addMasterRecruiterContact(personId: string, recruiterName: string, contactType: string, notes: string, contactDate?: string, user = 'Recruiter Admin'): boolean {
    const person = this.db.prepare('SELECT id, full_name, person_id FROM master_people WHERE id = ? OR person_id = ?').get(personId, personId) as any;
    if (!person) return false;

    const now = new Date().toISOString();
    const cDate = contactDate || now.split('T')[0];
    const contactId = `mrc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    this.db.prepare(`
      INSERT INTO master_recruiter_contacts (id, person_id, recruiter_name, contact_type, notes, contact_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(contactId, person.id, recruiterName, contactType, notes, cDate, now);

    this.db.prepare('UPDATE master_people SET last_activity_at = ?, updated_at = ? WHERE id = ?').run(now, now, person.id);

    this.addAuditLog({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      user,
      action: 'Recruiter Contact Logged',
      applicantName: person.full_name,
      reason: `${contactType} with ${recruiterName}`,
      details: notes,
    });

    return true;
  }

  batchUpdateMasterCandidates(ids: string[], updates: { status?: string; owner?: string; gender?: string }, user = 'Recruiter Admin'): number {
    if (!ids || ids.length === 0) return 0;
    let count = 0;

    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const id of ids) {
        const payload: Record<string, any> = {};
        if (updates.status) payload.current_status = updates.status;
        if (updates.owner) payload.current_owner = updates.owner;
        if (updates.gender) payload.gender = updates.gender;
        const ok = this.updateMasterCandidate(id, payload, user);
        if (ok) count++;
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return count;
  }

  deleteMasterCandidate(id: string, user = 'Recruiter Admin'): boolean {
    const person = this.db.prepare('SELECT id, full_name, person_id FROM master_people WHERE id = ? OR person_id = ?').get(id, id) as any;
    if (!person) return false;

    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.prepare('DELETE FROM master_people WHERE id = ?').run(person.id);
      this.db.prepare('DELETE FROM master_person_emails WHERE person_id = ?').run(person.id);
      this.db.prepare('DELETE FROM master_person_phones WHERE person_id = ?').run(person.id);
      this.db.prepare('DELETE FROM master_applications WHERE person_id = ?').run(person.id);
      this.db.prepare('DELETE FROM master_recruiter_contacts WHERE person_id = ?').run(person.id);
      this.db.prepare('DELETE FROM master_status_history WHERE person_id = ?').run(person.id);
      this.db.prepare("UPDATE applicants SET master_person_id = NULL, link_status = 'Not Linked' WHERE master_person_id = ?").run(person.id);
      this.db.exec('COMMIT');

      this.addAuditLog({
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        user,
        action: 'Master Candidate Deleted',
        applicantName: person.full_name,
        details: `Deleted candidate ${person.full_name} (${person.person_id}) from CRM.`,
      });
      return true;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  getMasterCandidateStats(company?: string): {
    totalCandidates: number;
    linkedApplications: number;
    incompleteCount: number;
    totalLinkedApplications: number;
    byCompany: { AaraTech: number; ClinisolTech: number };
  } {
    let wherePerson = '';
    let whereApp = '';
    const params: any[] = [];
    if (company && company !== 'All' && company !== 'Both') {
      wherePerson = 'WHERE company = ?';
      whereApp = 'WHERE company = ?';
      params.push(company);
    }
    const candRow = this.db.prepare(`SELECT COUNT(*) as c FROM master_people ${wherePerson}`).get(...params) as any;
    const appRow = this.db.prepare(`SELECT COUNT(*) as c FROM master_applications ${whereApp}`).get(...params) as any;
    const incRow = this.db.prepare(`SELECT COUNT(*) as c FROM applicants ${whereApp ? whereApp + " AND link_status = 'Needs Review'" : "WHERE link_status = 'Needs Review'"}`).get(...params) as any;

    const aaraCand = (this.db.prepare("SELECT COUNT(*) as c FROM master_people WHERE company = 'AaraTech'").get() as any)?.c || 0;
    const cliniCand = (this.db.prepare("SELECT COUNT(*) as c FROM master_people WHERE company = 'ClinisolTech'").get() as any)?.c || 0;

    const linkedApps = appRow?.c || 0;
    return {
      totalCandidates: candRow?.c || 0,
      linkedApplications: linkedApps,
      totalLinkedApplications: linkedApps,
      incompleteCount: incRow?.c || 0,
      byCompany: {
        AaraTech: aaraCand,
        ClinisolTech: cliniCand,
      },
    };
  }

  clearAllMasterData(company: 'AaraTech' | 'ClinisolTech' | 'all' = 'all', user = 'Recruiter Admin') {
    this.db.exec('BEGIN TRANSACTION');
    try {
      if (company === 'all') {
        this.db.prepare('DELETE FROM master_recruiter_contacts').run();
        this.db.prepare('DELETE FROM master_recruiter_assignments').run();
        this.db.prepare('DELETE FROM master_possible_matches').run();
        this.db.prepare('DELETE FROM master_status_history').run();
        this.db.prepare('DELETE FROM master_applications').run();
        this.db.prepare('DELETE FROM master_person_emails').run();
        this.db.prepare('DELETE FROM master_person_phones').run();
        this.db.prepare('DELETE FROM incomplete_records').run();
        this.db.prepare('DELETE FROM applicants').run();
        this.db.prepare('DELETE FROM import_files').run();
        this.db.prepare('DELETE FROM imports').run();
        this.db.prepare('DELETE FROM master_people').run();
      } else {
        this.db.prepare('DELETE FROM master_recruiter_contacts WHERE person_id IN (SELECT id FROM master_people WHERE company = ?)').run(company);
        this.db.prepare('DELETE FROM master_recruiter_assignments WHERE person_id IN (SELECT id FROM master_people WHERE company = ?)').run(company);
        this.db.prepare('DELETE FROM master_possible_matches WHERE company = ?').run(company);
        this.db.prepare('DELETE FROM master_status_history WHERE person_id IN (SELECT id FROM master_people WHERE company = ?)').run(company);
        this.db.prepare('DELETE FROM master_applications WHERE company = ? OR person_id IN (SELECT id FROM master_people WHERE company = ?)').run(company, company);
        this.db.prepare('DELETE FROM master_person_emails WHERE person_id IN (SELECT id FROM master_people WHERE company = ?)').run(company);
        this.db.prepare('DELETE FROM master_person_phones WHERE person_id IN (SELECT id FROM master_people WHERE company = ?)').run(company);
        this.db.prepare('DELETE FROM incomplete_records WHERE company = ?').run(company);
        this.db.prepare('DELETE FROM applicants WHERE company = ?').run(company);
        this.db.prepare('DELETE FROM import_files WHERE import_id IN (SELECT id FROM imports WHERE company = ?)').run(company);
        this.db.prepare('DELETE FROM imports WHERE company = ?').run(company);
        this.db.prepare('DELETE FROM master_people WHERE company = ?').run(company);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw err;
    }

    this.addAuditLog({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user,
      action: 'Clear Master Candidate Database',
      reason: `Cleared all candidate records for ${company} to start fresh.`,
      details: `Cleared all candidate profiles, contact details, applications, and imports for ${company}. Baseline jobs, recruiters, and rules preserved.`,
    });

    return {
      success: true,
      company,
      message: `Successfully cleared all candidate data for ${company}. Ready for fresh applications.`,
    };
  }

  upsertMasterCandidatesBatch(people: any[], importRecord?: any): { success: boolean; count: number; upserted?: number; peopleIds?: string[] } {
    if (!people || people.length === 0) return { success: true, count: 0, upserted: 0, peopleIds: [] };

    const insertPersonStmt = this.db.prepare(`
      INSERT INTO master_people (
        id, person_id, first_name, last_name, full_name, gender,
        primary_email, secondary_email, primary_phone, secondary_phone,
        location, zip_code, headline, current_title, current_company,
        linkedin_url, resume_url, unclassified_links, current_status, current_owner, company,
        green_card, h1b_status, application_collected_date, recruiter_assigned_date,
        first_assigned_recruiter, last_contacted_by, latest_contact_outcome, last_assignment_date, last_contact_date,
        created_at, updated_at, last_activity_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        full_name = excluded.full_name,
        gender = excluded.gender,
        primary_email = excluded.primary_email,
        secondary_email = excluded.secondary_email,
        primary_phone = excluded.primary_phone,
        secondary_phone = excluded.secondary_phone,
        location = excluded.location,
        headline = excluded.headline,
        current_title = excluded.current_title,
        current_company = excluded.current_company,
        linkedin_url = COALESCE(excluded.linkedin_url, master_people.linkedin_url),
        resume_url = COALESCE(excluded.resume_url, master_people.resume_url),
        unclassified_links = COALESCE(excluded.unclassified_links, master_people.unclassified_links),
        green_card = COALESCE(excluded.green_card, master_people.green_card),
        h1b_status = COALESCE(excluded.h1b_status, master_people.h1b_status),
        application_collected_date = COALESCE(excluded.application_collected_date, master_people.application_collected_date),
        recruiter_assigned_date = COALESCE(excluded.recruiter_assigned_date, master_people.recruiter_assigned_date),
        first_assigned_recruiter = COALESCE(master_people.first_assigned_recruiter, excluded.first_assigned_recruiter),
        last_contacted_by = COALESCE(excluded.last_contacted_by, master_people.last_contacted_by),
        latest_contact_outcome = COALESCE(excluded.latest_contact_outcome, master_people.latest_contact_outcome),
        last_assignment_date = COALESCE(excluded.last_assignment_date, master_people.last_assignment_date),
        last_contact_date = COALESCE(excluded.last_contact_date, master_people.last_contact_date),
        current_status = excluded.current_status,
        current_owner = excluded.current_owner,
        updated_at = excluded.updated_at,
        last_activity_at = excluded.last_activity_at
    `);

    const insertEmailStmt = this.db.prepare(`
      INSERT OR IGNORE INTO master_person_emails (
        id, person_id, email, normalized_email, is_primary, source, first_seen_at, last_seen_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPhoneStmt = this.db.prepare(`
      INSERT OR IGNORE INTO master_person_phones (
        id, person_id, phone_original, phone_normalized, is_primary, source, first_seen_at, last_seen_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertAppStmt = this.db.prepare(`
      INSERT INTO master_applications (
        id, person_id, applicant_id, company, job_id, job_title, date_applied,
        application_collected_date, recruiter_assigned_date, green_card, h1b_status,
        current_stage, effective_result, source_file, resume_link, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        resume_link = COALESCE(excluded.resume_link, master_applications.resume_link),
        application_collected_date = COALESCE(excluded.application_collected_date, master_applications.application_collected_date),
        recruiter_assigned_date = COALESCE(excluded.recruiter_assigned_date, master_applications.recruiter_assigned_date),
        green_card = COALESCE(excluded.green_card, master_applications.green_card),
        h1b_status = COALESCE(excluded.h1b_status, master_applications.h1b_status),
        job_title = excluded.job_title
    `);

    const findExistingAppStmt = this.db.prepare(`
      SELECT id, resume_link, current_stage, application_collected_date, recruiter_assigned_date, green_card, h1b_status
      FROM master_applications 
      WHERE (person_id = ? OR person_id = ?) AND company = ? 
        AND LOWER(REPLACE(REPLACE(REPLACE(job_title, ' ', ''), '-', ''), '_', '')) = LOWER(REPLACE(REPLACE(REPLACE(?, ' ', ''), '-', ''), '_', ''))
    `);

    const updateExistingAppStmt = this.db.prepare(`
      UPDATE master_applications
      SET resume_link = COALESCE(?, resume_link),
          current_stage = CASE WHEN current_stage = 'Applied' AND ? IS NOT NULL AND ? != 'Applied' THEN ? ELSE current_stage END,
          application_collected_date = COALESCE(?, application_collected_date),
          recruiter_assigned_date = COALESCE(?, recruiter_assigned_date),
          green_card = COALESCE(?, green_card),
          h1b_status = COALESCE(?, h1b_status)
      WHERE id = ?
    `);

    const insertContactStmt = this.db.prepare(`
      INSERT OR IGNORE INTO master_recruiter_contacts (
        id, person_id, recruiter_name, contact_type, notes, contact_date, created_at,
        contact_method, outcome, feedback_1, feedback_2, raw_feedback, source_file, application_id, source_row_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const findExistingContactStmt = this.db.prepare(`
      SELECT id FROM master_recruiter_contacts
      WHERE (person_id = ? OR person_id = ?) AND LOWER(recruiter_name) = LOWER(?) AND (notes = ? OR raw_feedback = ?)
    `);

    const insertAssignmentStmt = this.db.prepare(`
      INSERT OR IGNORE INTO master_recruiter_assignments (
        id, person_id, recruiter_name, assigned_date, status, reassignment_reason, created_at, created_by, application_id, source_row_number, source_file
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const findExistingAssignmentStmt = this.db.prepare(`
      SELECT id FROM master_recruiter_assignments
      WHERE (person_id = ? OR person_id = ?) AND LOWER(recruiter_name) = LOWER(?) AND assigned_date = ?
    `);

    const peopleIds: string[] = [];

    this.db.exec('BEGIN TRANSACTION');
    try {
      for (const p of people) {
        const comp = p.company || (p.current_company === 'ClinisolTech' ? 'ClinisolTech' : 'AaraTech');
        const now = p.created_at || new Date().toISOString();

        // 1. Resolve or generate candidate ID and person_id
        if (!p.id || !p.person_id) {
          let existingCandidate: any = null;
          if (p.primary_email) {
            existingCandidate = this.db.prepare('SELECT id, person_id FROM master_people WHERE company = ? AND LOWER(primary_email) = LOWER(?)').get(comp, p.primary_email.trim());
          }
          if (!existingCandidate && p.primary_phone) {
            const digits = p.primary_phone.replace(/\D/g, '');
            if (digits) {
              const allCand = this.db.prepare('SELECT id, person_id, primary_phone FROM master_people WHERE company = ? AND primary_phone IS NOT NULL').all(comp) as any[];
              existingCandidate = allCand.find(c => (c.primary_phone || '').replace(/\D/g, '') === digits || (c.primary_phone || '').replace(/\D/g, '').endsWith(digits) || digits.endsWith((c.primary_phone || '').replace(/\D/g, '')));
            }
          }

          if (existingCandidate) {
            p.id = existingCandidate.id;
            p.person_id = existingCandidate.person_id;
          } else {
            p.id = p.id || `mp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            if (!p.person_id) {
              const maxRow = this.db.prepare("SELECT person_id FROM master_people WHERE person_id LIKE 'P-%' ORDER BY person_id DESC LIMIT 1").get() as any;
              let nextNum = 1;
              if (maxRow && maxRow.person_id) {
                const match = maxRow.person_id.match(/P-(\d+)/);
                if (match) nextNum = parseInt(match[1], 10) + 1;
              }
              p.person_id = `P-${nextNum.toString().padStart(6, '0')}`;
            }
          }
        }

        peopleIds.push(p.id);

        // 2. Synthesize applications if flat candidate object passed
        if (!Array.isArray(p.applications) && (p.job_title || p.current_title)) {
          p.applications = [{
            job_title: p.job_title || p.current_title,
            company: comp,
            resume_link: p.resume_url || null,
            application_collected_date: p.application_collected_date || null,
            recruiter_assigned_date: p.recruiter_assigned_date || null,
            green_card: p.green_card || null,
            h1b_status: p.h1b_status || null,
            source_file: p.source_file || null,
            source_row: p.source_row || null,
          }];
        }

        if (!Array.isArray(p.emails) && p.primary_email) {
          p.emails = [{ email: p.primary_email, is_primary: true }];
        }

        if (!Array.isArray(p.phones) && p.primary_phone) {
          p.phones = [{ phone_original: p.primary_phone, phone_normalized: p.primary_phone.replace(/\D/g, ''), is_primary: true }];
        }

        if (p.recruiter && (!p.current_owner || p.current_owner === 'Unassigned')) {
          p.current_owner = p.recruiter;
        }

        if (!Array.isArray(p.recruiter_contacts) && (p.feedback_1 || p.feedback_2 || p.notes)) {
          const notesText = [p.feedback_1, p.feedback_2, p.notes].filter(Boolean).join(' - ');
          p.recruiter_contacts = [{
            recruiter_name: p.recruiter || p.current_owner || 'Recruiter',
            contact_type: 'Phone',
            contact_method: 'Phone',
            outcome: p.feedback_1 || 'Logged',
            feedback_1: p.feedback_1 || null,
            feedback_2: p.feedback_2 || null,
            notes: notesText,
            raw_feedback: notesText,
            contact_date: p.recruiter_assigned_date || now.split('T')[0],
            source_file: p.source_file || null,
          }];
        }

        insertPersonStmt.run(
          p.id,
          p.person_id,
          p.first_name || null,
          p.last_name || null,
          p.full_name,
          p.gender || 'Unspecified',
          p.primary_email || null,
          p.secondary_email || null,
          p.primary_phone || null,
          p.secondary_phone || null,
          p.location || null,
          p.zip_code || null,
          p.headline || null,
          p.current_title || null,
          comp,
          p.linkedin_url || null,
          p.resume_url || null,
          p.unclassified_links ? JSON.stringify(p.unclassified_links) : null,
          p.current_status || 'New',
          p.current_owner || 'Unassigned',
          comp,
          p.green_card || null,
          p.h1b_status || null,
          p.application_collected_date || null,
          p.recruiter_assigned_date || null,
          p.first_assigned_recruiter || null,
          p.last_contacted_by || null,
          p.latest_contact_outcome || null,
          p.last_assignment_date || null,
          p.last_contact_date || null,
          now,
          p.updated_at || now,
          p.last_activity_at || now
        );

        if (Array.isArray(p.emails)) {
          for (const e of p.emails) {
            insertEmailStmt.run(
              e.id || `${p.id}-em-${Date.now()}`,
              p.id,
              e.email,
              e.normalized_email || e.email.toLowerCase(),
              e.is_primary ? 1 : 0,
              e.source || 'Import',
              e.first_seen_at || now,
              e.last_seen_at || now,
              e.created_at || now
            );
          }
        }

        if (Array.isArray(p.phones)) {
          for (const ph of p.phones) {
            insertPhoneStmt.run(
              ph.id || `${p.id}-ph-${Date.now()}`,
              p.id,
              ph.phone_original,
              ph.phone_normalized,
              ph.is_primary ? 1 : 0,
              ph.source || 'Import',
              ph.first_seen_at || now,
              ph.last_seen_at || now,
              ph.created_at || now
            );
          }
        }

        if (Array.isArray(p.applications)) {
          for (const app of p.applications) {
            const appRole = app.job_title || 'General Applicant';
            const appComp = app.company || comp;
            let existing: any = null;
            if (app.id) {
              existing = this.db.prepare('SELECT id, resume_link, current_stage, application_collected_date, recruiter_assigned_date, green_card, h1b_status FROM master_applications WHERE id = ?').get(app.id);
            }
            if (!existing) {
              existing = findExistingAppStmt.get(p.id, p.person_id, appComp, appRole) as any;
            }
            if (!existing) {
              // If candidate already has an application in this company, consolidate into it to prevent duplicate applications
              const allCandApps = this.db.prepare('SELECT id, resume_link, current_stage, application_collected_date, recruiter_assigned_date, green_card, h1b_status FROM master_applications WHERE (person_id = ? OR person_id = ?) AND company = ?').all(p.id, p.person_id, appComp) as any[];
              if (allCandApps.length === 1) {
                existing = allCandApps[0];
              }
            }

            const resLink = app.resume_link || app.resume_url || p.resume_url || null;
            const stage = app.current_stage || null;
            const appColDate = app.application_collected_date || p.application_collected_date || null;
            const recAssignDate = app.recruiter_assigned_date || p.recruiter_assigned_date || null;
            const gcVal = app.green_card || p.green_card || null;
            const h1bVal = app.h1b_status || p.h1b_status || null;

            if (existing) {
              updateExistingAppStmt.run(
                resLink,
                stage, stage, stage,
                appColDate,
                recAssignDate,
                gcVal,
                h1bVal,
                existing.id
              );
            } else {
              insertAppStmt.run(
                app.id || `${p.id}-app-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                p.id,
                app.applicant_id || null,
                appComp,
                app.job_id || null,
                appRole,
                app.date_applied || appColDate || recAssignDate || now.split('T')[0],
                appColDate,
                recAssignDate,
                gcVal,
                h1bVal,
                stage || 'Applied',
                app.effective_result || null,
                app.source_file || null,
                resLink,
                app.created_at || now
              );
            }
          }
        }

        // Handle Assignments
        if (Array.isArray(p.assignments) && p.assignments.length > 0) {
          for (const asgn of p.assignments) {
            const recName = asgn.recruiter_name || 'Recruiter';
            const asgnDate = asgn.assigned_date || now.split('T')[0];
            const existingAsgn = findExistingAssignmentStmt.get(p.id, p.person_id, recName, asgnDate) as any;
            if (!existingAsgn) {
              insertAssignmentStmt.run(
                asgn.id || `${p.id}-mra-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                p.id,
                recName,
                asgnDate,
                asgn.status || 'Current',
                asgn.reassignment_reason || null,
                asgn.created_at || now,
                asgn.created_by || 'Import',
                asgn.application_id || null,
                asgn.source_row || asgn.source_row_number || null,
                asgn.source_file || null
              );
            }
          }
        } else if (p.current_owner && p.current_owner !== 'Unassigned' && p.current_owner !== 'Adam') {
          const asgnDate = p.recruiter_assigned_date || p.last_assignment_date || p.application_collected_date || now.split('T')[0];
          const existingAsgn = findExistingAssignmentStmt.get(p.id, p.person_id, p.current_owner, asgnDate) as any;
          if (!existingAsgn) {
            insertAssignmentStmt.run(
              `${p.id}-mra-init`,
              p.id,
              p.current_owner,
              asgnDate,
              'Current',
              'Initial recruiter assignment',
              now,
              'Import',
              null,
              p.source_row || p.source_row_number || null,
              p.source_file || null
            );
          }
        }

        if (Array.isArray(p.recruiter_contacts)) {
          for (const c of p.recruiter_contacts) {
            const rawFb = c.original_feedback || c.raw_feedback || c.notes || null;
            const recName = c.recruiter_name || 'Recruiter';
            const existingContact = rawFb ? findExistingContactStmt.get(p.id, p.person_id, recName, rawFb, rawFb) as any : null;
            if (!existingContact) {
              insertContactStmt.run(
                c.id || `${p.id}-rc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                p.id,
                recName,
                c.contact_type || 'Phone',
                rawFb,
                c.contact_date || now.split('T')[0],
                c.created_at || now,
                c.contact_method || c.contact_type || 'Phone',
                c.outcome || null,
                c.feedback_1 || null,
                c.feedback_2 || null,
                rawFb,
                c.source_file || null,
                c.application_id || null,
                c.source_row || c.source_row_number || null
              );
            }
          }
        }
      }

      this.db.exec('COMMIT');
      return { success: true, count: people.length, upserted: people.length, peopleIds };
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw err;
    }
  }

  private ensureMasterPromotionInitialized(): void {
    try {
      const applicantCount = (this.db.prepare('SELECT COUNT(*) as count FROM applicants').get() as { count: number }).count;
      if (applicantCount === 0) return; // Clean slate, no applicants to promote
      const count = (this.db.prepare('SELECT COUNT(*) as count FROM master_people').get() as { count: number }).count;
      const unlinked = (this.db.prepare("SELECT COUNT(*) as count FROM applicants WHERE master_person_id IS NULL OR master_person_id = ''").get() as { count: number }).count;
      if (count === 0 || unlinked > 0) {
        console.log('[DatabaseService] Promoting/linking existing applications into Master Candidate Database...');
        this.promoteApplicationsToMaster();
      }
    } catch (err) {
      console.error('[DatabaseService] ensureMasterPromotionInitialized error:', err);
    }
  }
}

export const dbService = new DatabaseService();
