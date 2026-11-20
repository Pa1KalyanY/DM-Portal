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

export function canonicalizeLocation(rawLoc?: string | null): string {
  if (!rawLoc) return 'Unknown / Unspecified';
  const loc = rawLoc.trim().toLowerCase();
  if (loc.includes('new york') || loc.includes('nyc') || loc.includes('brooklyn') || loc.includes('jersey city') || loc.includes('manhattan') || loc.includes('queens')) {
    return 'New York Metro';
  }
  if (loc.includes('dallas') || loc.includes('dfw') || loc.includes('denton') || loc.includes('fort worth') || loc.includes('plano') || loc.includes('irving')) {
    return 'Dallas / DFW';
  }
  if (loc.includes('chicago') || loc.includes('illinois')) {
    return 'Chicago';
  }
  if (loc.includes('houston')) {
    return 'Houston';
  }
  if (loc.includes('washington') || loc.includes('baltimore') || loc.includes('dc')) {
    return 'Washington DC / Baltimore';
  }
  if (loc.includes('atlanta') || loc.includes('georgia')) {
    return 'Atlanta';
  }
  if (loc.includes('st louis') || loc.includes('saint louis') || loc.includes('missouri')) {
    return 'St Louis';
  }
  if (loc.includes('san francisco') || loc.includes('bay area') || loc.includes('san jose') || loc.includes('sunnyvale') || loc.includes('oakland')) {
    return 'SF Bay Area';
  }
  if (loc.includes('seattle') || loc.includes('redmond') || loc.includes('bellevue')) {
    return 'Seattle';
  }
  if (loc.includes('austin')) {
    return 'Austin';
  }
  if (loc.includes('los angeles') || loc.includes('orange county')) {
    return 'Los Angeles';
  }
  if (loc.includes('boston') || loc.includes('cambridge')) {
    return 'Boston';
  }
  if (loc.includes('london') || loc.includes('united kingdom') || loc.includes('uk')) {
    return 'London';
  }
  if (loc.includes('toronto') || loc.includes('canada')) {
    return 'Toronto';
  }
  if (loc === 'united states' || loc === 'us') {
    return 'United States (General)';
  }
  return rawLoc.split(',')[0].trim();
}

export function getTechCategory(jobTitle?: string | null, jobId?: string | null): string {
  const title = (jobTitle || '').toLowerCase();
  const id = (jobId || '').toLowerCase();
  if (title.includes('cyber') || id.includes('cyber') || title.includes('security')) return 'CyberSecurity';
  if (title.includes('aws') || id.includes('aws') || title.includes('cloud')) return 'AWS';
  if (title.includes('da') || title.includes('data analyst') || title.includes('analytics')) return 'Data Analytics';
  if (title.includes('sas') || title.includes('clinical') || title.includes('biostat') || title.includes('regulatory') || title.includes('cra') || title.includes('pv') || title.includes('pharma') || title.includes('gxp')) {
    return 'Clinical Operations & Trials';
  }
  return 'Other Technologies';
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

  constructor(customDbPath?: string) {
    let resolvedDbPath = customDbPath || DB_PATH;
    if (process.env.VERCEL === '1' || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      try {
        const tmpPath = path.resolve('/tmp', 'linkedin_screening.db');
        if (!fs.existsSync(tmpPath) && fs.existsSync(DB_PATH)) {
          fs.copyFileSync(DB_PATH, tmpPath);
        }
        if (fs.existsSync(tmpPath)) {
          resolvedDbPath = tmpPath;
        }
      } catch (err) {
        console.warn('Vercel serverless DB setup note:', err);
      }
    }
    this.db = new DatabaseSync(resolvedDbPath);
    try {
      this.db.exec(`PRAGMA busy_timeout = 30000;`);
      this.db.exec(`PRAGMA journal_mode = WAL;`);
    } catch (e) {
      console.warn('PRAGMA init warning:', e);
    }
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
    } catch { }
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_gender ON applicants(gender);");
    } catch { }

    // Safe migration: Add company column for workspace isolation (AaraTech vs ClinisolTech)
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN company TEXT DEFAULT 'AaraTech';");
    } catch { }
    try {
      this.db.exec("ALTER TABLE imports ADD COLUMN company TEXT DEFAULT 'AaraTech';");
    } catch { }
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_company ON applicants(company);");
    } catch { }
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_imports_company ON imports(company);");
    } catch { }

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
      try { this.db.exec(sql); } catch { }
    }
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_batch_id ON applicants(batch_id);");
    } catch { }
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_app_date ON applicants(application_date);");
    } catch { }
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_master_person ON applicants(master_person_id);");
    } catch { }
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_recruiter ON applicants(assigned_recruiter);");
    } catch { }

    // Safe migration: Add workflow columns to imports
    const newImportCols = [
      "ALTER TABLE imports ADD COLUMN application_date TEXT;",
      "ALTER TABLE imports ADD COLUMN job_slots TEXT;",
      "ALTER TABLE imports ADD COLUMN active_working_batch INTEGER DEFAULT 1;",
    ];
    for (const sql of newImportCols) {
      try { this.db.exec(sql); } catch { }
    }

    // Safe migration: Add link status & error columns
    try { this.db.exec("ALTER TABLE applicants ADD COLUMN link_status TEXT DEFAULT 'Not Linked';"); } catch { }
    try { this.db.exec("ALTER TABLE applicants ADD COLUMN link_error TEXT;"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_link_status ON applicants(link_status);"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_imports_app_date ON imports(application_date);"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_company_appdate ON applicants(company, application_date);"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_comp_res ON applicants(company, effective_result);"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_comp_date_res ON applicants(company, application_date, effective_result);"); } catch { }
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
    } catch { }
    try {
      this.db.exec(`
        UPDATE applicants
        SET application_date = (
          SELECT substr(uploaded_at, 1, 10) FROM imports WHERE imports.id = applicants.import_id
        )
        WHERE (application_date IS NULL OR application_date = '')
          AND import_id IN (SELECT id FROM imports WHERE uploaded_at IS NOT NULL AND uploaded_at != '');
      `);
    } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_link_status ON applicants(link_status);"); } catch { }

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

    try { this.db.exec("ALTER TABLE master_people ADD COLUMN secondary_email TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN secondary_phone TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_person_emails ADD COLUMN source TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_person_emails ADD COLUMN first_seen_at TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_person_emails ADD COLUMN last_seen_at TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_person_phones ADD COLUMN source TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_person_phones ADD COLUMN first_seen_at TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_person_phones ADD COLUMN last_seen_at TEXT;"); } catch { }

    // Master Candidate Database Enhancements: Assignments, Classified URLs & Distinct Dates
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN resume_url TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN unclassified_links TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN application_collected_date TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN recruiter_assigned_date TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN first_assigned_recruiter TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN first_confirmed_contacted_by TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN last_contacted_by TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN latest_contact_outcome TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN last_assignment_date TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN last_contact_date TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN resume_link TEXT;"); } catch { }

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

    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN contact_method TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN outcome TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN feedback_1 TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN feedback_2 TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN additional_feedback TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN next_follow_up TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN raw_feedback TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN source_file TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN created_by TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN application_id TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN source_row_number INTEGER;"); } catch { }
    try { this.db.exec("ALTER TABLE master_recruiter_assignments ADD COLUMN application_id TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_recruiter_assignments ADD COLUMN source_row_number INTEGER;"); } catch { }
    try { this.db.exec("ALTER TABLE master_recruiter_assignments ADD COLUMN source_file TEXT;"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_mrc_app ON master_recruiter_contacts(application_id);"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_mra_app ON master_recruiter_assignments(application_id);"); } catch { }

    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN application_collected_date TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN recruiter_assigned_date TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN assigned_recruiter TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN resume_url TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN unclassified_links TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN green_card TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_people ADD COLUMN h1b_status TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN green_card TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN h1b_status TEXT;"); } catch { }

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

      -- Master Import Ledger for Complete Row-Level Auditability & Idempotent Resumption (Prompt Section 6)
      CREATE TABLE IF NOT EXISTS master_import_ledger (
        id TEXT PRIMARY KEY,
        import_id TEXT NOT NULL,
        source_file TEXT NOT NULL,
        sheet_name TEXT,
        row_number INTEGER NOT NULL,
        company TEXT NOT NULL,
        normalized_identity TEXT,
        raw_name TEXT,
        raw_email TEXT,
        raw_phone TEXT,
        raw_role TEXT,
        status TEXT NOT NULL,
        person_id TEXT,
        application_id TEXT,
        error_details TEXT,
        processed_at TEXT NOT NULL,
        UNIQUE(company, source_file, sheet_name, row_number)
      );
      CREATE INDEX IF NOT EXISTS idx_mil_import ON master_import_ledger(import_id);
      CREATE INDEX IF NOT EXISTS idx_mil_status ON master_import_ledger(status);
      CREATE INDEX IF NOT EXISTS idx_mil_identity ON master_import_ledger(company, normalized_identity);

      -- Master Import Jobs & Batch Tracking Architecture for Scalable & Resumable Imports
      CREATE TABLE IF NOT EXISTS master_import_jobs (
        id TEXT PRIMARY KEY,
        company TEXT NOT NULL,
        source_file TEXT,
        sheet_name TEXT,
        total_rows INTEGER DEFAULT 0,
        processed_rows INTEGER DEFAULT 0,
        successful_rows INTEGER DEFAULT 0,
        failed_rows INTEGER DEFAULT 0,
        new_candidates INTEGER DEFAULT 0,
        matched_candidates INTEGER DEFAULT 0,
        new_applications INTEGER DEFAULT 0,
        matched_applications INTEGER DEFAULT 0,
        duplicate_applications INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Pending',
        error_summary TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mij_company ON master_import_jobs(company);
      CREATE INDEX IF NOT EXISTS idx_mij_status ON master_import_jobs(status);

      CREATE TABLE IF NOT EXISTS master_import_batches (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        batch_number INTEGER NOT NULL,
        start_row INTEGER NOT NULL,
        end_row INTEGER NOT NULL,
        record_count INTEGER NOT NULL,
        row_count INTEGER,
        successful_count INTEGER DEFAULT 0,
        failed_count INTEGER DEFAULT 0,
        new_candidates INTEGER DEFAULT 0,
        matched_candidates INTEGER DEFAULT 0,
        new_applications INTEGER DEFAULT 0,
        duplicate_applications INTEGER DEFAULT 0,
        status TEXT DEFAULT 'Pending',
        error_details TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT,
        FOREIGN KEY (job_id) REFERENCES master_import_jobs(id)
      );
      CREATE INDEX IF NOT EXISTS idx_mib_job ON master_import_batches(job_id);
    `);

    // Master import and application safe schema migrations
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN normalized_role TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN source_row_number INTEGER;"); } catch { }
    try { this.db.exec("ALTER TABLE master_import_ledger ADD COLUMN job_id TEXT;"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_mil_job ON master_import_ledger(job_id);"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_mp_comp_email ON master_people(company, primary_email);"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_mp_comp_phone ON master_people(company, primary_phone);"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_mp_comp_pid ON master_people(company, person_id);"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_ma_comp_pid_title ON master_applications(company, person_id, job_title);"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_ma_comp_date ON master_applications(company, date_applied);"); } catch { }

    // Transfer status and tracking columns on applicants table
    try { this.db.exec("ALTER TABLE applicants ADD COLUMN transfer_status TEXT DEFAULT 'Not Transferred';"); } catch { }
    try { this.db.exec("ALTER TABLE applicants ADD COLUMN transferred_at TEXT;"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_transfer_status ON applicants(transfer_status);"); } catch { }

    // Master application enhancements for technology analytics & traceability (Prompt Section 6 & 16)
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN technology TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN source_batch_id TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN screening_applicant_id TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE master_applications ADD COLUMN transfer_id TEXT;"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_ma_tech ON master_applications(technology);"); } catch { }
    try { this.db.exec("CREATE INDEX IF NOT EXISTS idx_ma_screening_applicant ON master_applications(screening_applicant_id);"); } catch { }

    // Imports enhancements for re-import protection & transfer statistics (Prompt Section 15)
    try { this.db.exec("ALTER TABLE imports ADD COLUMN file_hash TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE imports ADD COLUMN content_fingerprint TEXT;"); } catch { }
    try { this.db.exec("ALTER TABLE imports ADD COLUMN transferred_count INTEGER DEFAULT 0;"); } catch { }

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
    } catch { }

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
    } catch { }

    // Digital Marketing Enterprise Persistence Tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS marketing_members (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        designation TEXT,
        company_access TEXT,
        is_active INTEGER DEFAULT 1,
        avatar_initials TEXT,
        created_at TEXT
      );

      CREATE TABLE IF NOT EXISTS marketing_attendance (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        member_name TEXT NOT NULL,
        company TEXT NOT NULL,
        work_date TEXT NOT NULL,
        check_in_time TEXT NOT NULL,
        check_out_time TEXT,
        total_hours REAL,
        status TEXT NOT NULL,
        notes TEXT,
        breaks_json TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mkt_att_member ON marketing_attendance(member_id);
      CREATE INDEX IF NOT EXISTS idx_mkt_att_date ON marketing_attendance(work_date);
      CREATE INDEX IF NOT EXISTS idx_mkt_att_company ON marketing_attendance(company);

      CREATE TABLE IF NOT EXISTS marketing_tasks (
        id TEXT PRIMARY KEY,
        company TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        assigned_to_id TEXT,
        assigned_to_name TEXT,
        priority TEXT,
        status TEXT,
        due_date TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mkt_tasks_company ON marketing_tasks(company);
      CREATE INDEX IF NOT EXISTS idx_mkt_tasks_status ON marketing_tasks(status);

      CREATE TABLE IF NOT EXISTS marketing_posts (
        id TEXT PRIMARY KEY,
        company TEXT NOT NULL,
        channel TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        media_urls TEXT,
        scheduled_for TEXT,
        approval_status TEXT,
        author_id TEXT,
        author_name TEXT,
        reviewer_id TEXT,
        reviewer_name TEXT,
        reviewer_feedback TEXT,
        published_at TEXT,
        live_post_url TEXT,
        created_at TEXT,
        updated_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mkt_posts_company ON marketing_posts(company);
      CREATE INDEX IF NOT EXISTS idx_mkt_posts_status ON marketing_posts(approval_status);

      CREATE TABLE IF NOT EXISTS marketing_reports (
        id TEXT PRIMARY KEY,
        member_id TEXT NOT NULL,
        member_name TEXT NOT NULL,
        company TEXT NOT NULL,
        report_date TEXT NOT NULL,
        tasks_completed TEXT,
        in_progress_tasks TEXT,
        blockers TEXT,
        key_learnings TEXT,
        hours_worked REAL,
        created_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_mkt_rep_member ON marketing_reports(member_id);
      CREATE INDEX IF NOT EXISTS idx_mkt_rep_date ON marketing_reports(report_date);

      CREATE TABLE IF NOT EXISTS marketing_settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      );
    `);

    this.initDefaultMarketing();

    // Safe migration: Add origin columns for South Asian profile filtering
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN origin_region TEXT DEFAULT 'UNSPECIFIED';");
    } catch { }
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN origin_country TEXT;");
    } catch { }

    // Auto-rotate any older daily working batches based on EST (America/New_York)
    try {
      this.autoRotateDailyBatchesEST();
    } catch { }
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN origin_match_reason TEXT;");
    } catch { }
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_origin_region ON applicants(origin_region);");
    } catch { }

    // Safe migration: Add reference name matching columns
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN name_match_category TEXT DEFAULT 'No Match';");
    } catch { }
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN name_match_score REAL DEFAULT 0;");
    } catch { }
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN name_matched_pattern TEXT;");
    } catch { }
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN name_matched_reference TEXT;");
    } catch { }
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_name_match_category ON applicants(name_match_category);");
    } catch { }

    // Safe migration: Add normalized_role column to applicants
    try {
      this.db.exec("ALTER TABLE applicants ADD COLUMN normalized_role TEXT;");
    } catch { }
    try {
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_applicants_normalized_role ON applicants(normalized_role);");
    } catch { }

    // One-time startup backfill & reevaluation (gated in app_settings so server restarts don't lock or rewrite 7,500+ rows every boot)
    let startupBackfillDone = false;
    try {
      const flag = this.db.prepare("SELECT value FROM app_settings WHERE key = 'startup_backfill_v1_done'").get() as { value?: string } | undefined;
      startupBackfillDone = flag?.value === '1';
    } catch { }

    if (!startupBackfillDone) {
      try {
        const needRoleOrMatch = this.db.prepare(`
          SELECT id, first_name, last_name, full_name, job_title, current_title, headline, source_file, name_match_category, name_match_score, normalized_role
          FROM applicants
          WHERE (normalized_role IS NULL OR normalized_role = '')
             OR (name_match_category IS NULL OR name_match_category = '')
        `).all() as any[];

        if (needRoleOrMatch && needRoleOrMatch.length > 0) {
          this.db.exec('BEGIN TRANSACTION');
          try {
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
            this.db.exec('COMMIT');
          } catch {
            try { this.db.exec('ROLLBACK'); } catch { }
          }
        }
      } catch (err) {
        console.warn('[initDb] Auto-repair backfill notice:', err);
      }

      // Safe migration: sanitize existing phone numbers to remove +1 and symbols
      try {
        const phoneRows = this.db.prepare("SELECT id, phone FROM applicants WHERE phone IS NOT NULL AND phone != ''").all() as any[];
        if (phoneRows.length > 0) {
          this.db.exec('BEGIN TRANSACTION');
          try {
            const updatePhoneStmt = this.db.prepare("UPDATE applicants SET phone = ? WHERE id = ?");
            for (const row of phoneRows) {
              const cleaned = sanitizeContactNumber(row.phone);
              if (cleaned !== row.phone) {
                updatePhoneStmt.run(cleaned, row.id);
              }
            }
            this.db.exec('COMMIT');
          } catch {
            try { this.db.exec('ROLLBACK'); } catch { }
          }
        }
      } catch { }

      // Safe migration: add batch_name column to imports and populate for existing rows
      try {
        this.db.exec("ALTER TABLE imports ADD COLUMN batch_name TEXT;");
      } catch { }
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
      } catch { }

      // Safe self-healing migration: Restore statutory screening results for duplicate records where effective_result was previously overwritten to FAIL
      try {
        this.db.exec(`
          UPDATE applicants 
          SET effective_result = automated_result 
          WHERE manual_result IS NULL 
            AND is_duplicate = 1 
            AND automated_result IN ('PASS', 'MANUAL_REVIEW') 
            AND effective_result = 'FAIL';
        `);
      } catch { }

      // Synchronize and reevaluate all applicants with the latest Origin Rule and Reference Name Matcher
      try {
        this.reevaluateAllApplicants();
      } catch (err) {
        console.warn('[initDb] Initial applicant reevaluation notice:', err);
      }

      try {
        this.db.prepare(`
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ('startup_backfill_v1_done', '1', datetime('now'))
          ON CONFLICT(key) DO UPDATE SET value = '1', updated_at = datetime('now')
        `).run();
      } catch { }
    } else {
      try { this.db.exec("ALTER TABLE imports ADD COLUMN batch_name TEXT;"); } catch { }
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
    } catch { }
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
    // Only reset batches from PREVIOUS days for this company, keeping all today's batches active together!
    try {
      const todayEST = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
      this.db.prepare('UPDATE imports SET active_working_batch = 0 WHERE company = ? AND application_date < ?').run(company, todayEST);
    } catch { }

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
      // 1. Pre-load Master Candidate DB records strictly within this company workspace
      const masterPeople = this.db.prepare('SELECT id, person_id, full_name, primary_email, primary_phone, linkedin_url FROM master_people WHERE company = ?').all(company) as any[];
      const masterEmails = this.db.prepare(`
        SELECT e.person_id, e.email, e.normalized_email 
        FROM master_person_emails e
        JOIN master_people p ON p.id = e.person_id
        WHERE p.company = ?
      `).all(company) as any[];
      const masterPhones = this.db.prepare(`
        SELECT ph.person_id, ph.phone_original, ph.phone_normalized 
        FROM master_person_phones ph
        JOIN master_people p ON p.id = ph.person_id
        WHERE p.company = ?
      `).all(company) as any[];
      const masterApps = this.db.prepare('SELECT person_id, job_id, job_title, technology, date_applied, source_file, screening_applicant_id FROM master_applications WHERE company = ?').all(company) as any[];

      const masterEmailToPerson = new Map<string, any>();
      const masterPhoneNameToPerson = new Map<string, any>();
      const masterLiToPerson = new Map<string, any>();
      const masterNameToPeople = new Map<string, any[]>();
      const masterAppsByPerson = new Map<string, any[]>();

      for (const p of masterPeople) {
        if (p.primary_email) masterEmailToPerson.set(p.primary_email.trim().toLowerCase(), p);
        const nm = (p.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (nm) {
          const list = masterNameToPeople.get(nm) || [];
          list.push(p);
          masterNameToPeople.set(nm, list);
        }
        if (p.primary_phone && nm) {
          const cleanPh = p.primary_phone.replace(/\D/g, '').slice(-10);
          if (cleanPh.length >= 7) masterPhoneNameToPerson.set(`${cleanPh}:::${nm}`, p);
        }
        const li = cleanLinkedinIdentifier(p.linkedin_url);
        if (li && li.length >= 3) masterLiToPerson.set(li, p);
      }

      for (const e of masterEmails) {
        const p = masterPeople.find(x => x.id === e.person_id || x.person_id === e.person_id);
        const nEmail = (e.normalized_email || e.email || '').trim().toLowerCase();
        if (p && nEmail) masterEmailToPerson.set(nEmail, p);
      }

      for (const ph of masterPhones) {
        const p = masterPeople.find(x => x.id === ph.person_id || x.person_id === ph.person_id);
        const cleanPh = (ph.phone_normalized || ph.phone_original || '').replace(/\D/g, '').slice(-10);
        if (p && cleanPh.length >= 7) {
          const nm = (p.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
          if (nm) masterPhoneNameToPerson.set(`${cleanPh}:::${nm}`, p);
        }
      }

      for (const ma of masterApps) {
        const list = masterAppsByPerson.get(ma.person_id) || [];
        list.push(ma);
        masterAppsByPerson.set(ma.person_id, list);
      }

      // 2. Pre-load historical screening applicant records for this company
      const existingRows = this.db.prepare(`
        SELECT id, full_name, email, phone, profile_url, job_id, job_title, normalized_role, master_person_id, is_duplicate
        FROM applicants
        WHERE company = ?
      `).all(company) as any[];

      const histEmailToApp = new Map<string, any>();
      const histEmailSlots = new Map<string, Set<string>>();
      const histPhoneNameToApp = new Map<string, any>();
      const histPhoneNameSlots = new Map<string, Set<string>>();
      const histLiToApp = new Map<string, any>();
      const histLiSlots = new Map<string, Set<string>>();

      for (const r of existingRows) {
        const em = (r.email || '').trim().toLowerCase();
        const sId = (r.job_id || '').trim().toUpperCase();
        const rRole = (r.normalized_role || normalizeJobRole(r.job_title) || '').trim().toLowerCase();

        if (em && em !== 'n/a' && em !== 'none' && em.includes('@')) {
          histEmailToApp.set(em, r);
          if (!histEmailSlots.has(em)) histEmailSlots.set(em, new Set());
          if (sId) histEmailSlots.get(em)!.add(sId);
          if (rRole) histEmailSlots.get(em)!.add(rRole);
        }
        const li = cleanLinkedinIdentifier(r.profile_url);
        if (li && li.length >= 3) {
          histLiToApp.set(li, r);
          if (!histLiSlots.has(li)) histLiSlots.set(li, new Set());
          if (sId) histLiSlots.get(li)!.add(sId);
          if (rRole) histLiSlots.get(li)!.add(rRole);
        }
        const ph = (r.phone || '').replace(/\D/g, '').slice(-10);
        const nm = (r.full_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
        if (nm && ph.length >= 7) {
          const npKey = `${ph}:::${nm}`;
          histPhoneNameToApp.set(npKey, r);
          if (!histPhoneNameSlots.has(npKey)) histPhoneNameSlots.set(npKey, new Set());
          if (sId) histPhoneNameSlots.get(npKey)!.add(sId);
          if (rRole) histPhoneNameSlots.get(npKey)!.add(rRole);
        }
      }

      // 3. Intra-batch tracking to prevent identical row re-insertion
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
        const sId = (a.jobId || '').trim().toUpperCase();
        const curRole = (a.normalizedRole || normalizeJobRole(a.jobTitle) || '').trim().toLowerCase();
        const candKey = (em && em.includes('@') && !['unknown', 'n/a', 'none'].includes(em))
          ? `email:${em}`
          : ((ph.length >= 7 && nm) ? `phone:${ph}:::${nm}` : (li ? `li:${li}` : ''));
        const slotKey = candKey && sId ? `${candKey}::${sId}` : '';
        const roleKey = candKey && curRole ? `${candKey}::${curRole}` : '';

        let isDuplicate = 0;
        let duplicateReason: string | null = null;
        let masterPersonId: string | null = null;
        let possibleDuplicate = false;

        // 1. Intra-batch duplicate check
        if (slotKey && seenBatchJobKeys.has(slotKey)) {
          isDuplicate = 1;
          duplicateReason = `Duplicate submission within current batch for job slot (${a.jobTitle || a.jobId})`;
        } else if (roleKey && seenBatchJobKeys.has(roleKey)) {
          isDuplicate = 1;
          duplicateReason = `Duplicate submission within current batch for job role (${a.jobTitle || curRole})`;
        }

        // 2. Master Candidate DB matching
        let matchedMasterPerson: any = null;
        if (em && masterEmailToPerson.has(em)) {
          matchedMasterPerson = masterEmailToPerson.get(em);
        } else if (ph.length >= 7 && nm && masterPhoneNameToPerson.has(`${ph}:::${nm}`)) {
          matchedMasterPerson = masterPhoneNameToPerson.get(`${ph}:::${nm}`);
        } else if (li && masterLiToPerson.has(li)) {
          matchedMasterPerson = masterLiToPerson.get(li);
        }

        if (matchedMasterPerson) {
          masterPersonId = matchedMasterPerson.person_id;
          // Check if candidate already has an application occurrence in Master DB for this slot/role
          if (!isDuplicate) {
            const pApps = masterAppsByPerson.get(matchedMasterPerson.person_id) || masterAppsByPerson.get(matchedMasterPerson.id) || [];
            const isSameMasterApp = pApps.some((ma: any) => {
              if (sId && ma.job_id && ma.job_id.trim().toUpperCase() === sId) return true;
              const maRole = (ma.technology || ma.job_title || '').trim().toLowerCase();
              const normMaRole = normalizeJobRole(maRole).toLowerCase();
              if (curRole && (curRole === maRole || curRole === normMaRole)) return true;
              return false;
            });

            if (isSameMasterApp) {
              isDuplicate = 1;
              duplicateReason = `Candidate already applied to job slot (${a.jobTitle || a.jobId}) in Master Database (${matchedMasterPerson.person_id})`;
            } else {
              // Existing Master Candidate
              isDuplicate = 1;
              duplicateReason = `Candidate already exists in Master Database (${matchedMasterPerson.person_id} - ${matchedMasterPerson.full_name})`;
            }
          }
        }

        // 3. Historical batch duplicate check
        if (!isDuplicate) {
          let histMatch: any = null;
          let histSlots: Set<string> | undefined;
          if (em && histEmailToApp.has(em)) {
            histMatch = histEmailToApp.get(em);
            histSlots = histEmailSlots.get(em);
          } else if (ph.length >= 7 && nm && histPhoneNameToApp.has(`${ph}:::${nm}`)) {
            histMatch = histPhoneNameToApp.get(`${ph}:::${nm}`);
            histSlots = histPhoneNameSlots.get(`${ph}:::${nm}`);
          } else if (li && histLiToApp.has(li)) {
            histMatch = histLiToApp.get(li);
            histSlots = histLiSlots.get(li);
          }

          if (histMatch && histSlots) {
            const isSameSlot = Boolean(sId && histSlots.has(sId));
            const isSameRole = Boolean(curRole && histSlots.has(curRole));
            if (isSameSlot || isSameRole) {
              isDuplicate = 1;
              duplicateReason = `Candidate already applied to job ${isSameRole ? `role (${curRole})` : `slot (${sId})`} in prior batch (${histMatch.import_id || 'earlier batch'})`;
            }
            if (!masterPersonId && histMatch.master_person_id) {
              masterPersonId = histMatch.master_person_id;
            }
          }
        }

        // 4. Possible duplicate check (name match, different credentials)
        if (!matchedMasterPerson && !isDuplicate && nm) {
          if (masterNameToPeople.has(nm)) {
            possibleDuplicate = true;
          }
        }

        if (slotKey) seenBatchJobKeys.add(slotKey);
        if (roleKey) seenBatchJobKeys.add(roleKey);

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

        // 5. Final effective result determination: Preserves statutory criteria evaluation (PASS, FAIL, MANUAL_REVIEW) regardless of duplicate status
        let finalEffectiveResult: string;
        if (a.manualResult) {
          finalEffectiveResult = a.manualResult;
        } else if (a.effectiveResult) {
          finalEffectiveResult = a.effectiveResult;
        } else if (a.automatedResult) {
          finalEffectiveResult = a.automatedResult;
        } else {
          finalEffectiveResult = 'PASS';
        }

        if (finalEffectiveResult === 'PASS' && possibleDuplicate) {
          finalEffectiveResult = 'MANUAL_REVIEW';
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
          finalEffectiveResult,
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
          isDuplicate,
          duplicateReason,
          masterPersonId,
          (a.reviewDecision || (finalEffectiveResult === 'PASS' ? 'APPROVED' : null)) ?? null,
          a.reviewNotes ?? (possibleDuplicate ? 'Possible duplicate candidate: name matches existing profile with different contact credentials' : null)
        );

        // Add newly inserted applicant to in-memory lookup maps for intra-batch deduplication
        if (slotKey) seenBatchJobKeys.add(slotKey);
        if (roleKey) seenBatchJobKeys.add(roleKey);
        if (roleKey) seenBatchJobKeys.add(roleKey);
        if (em && em.includes('@')) {
          histEmailToApp.set(em, { id: a.id, master_person_id: masterPersonId, full_name: a.fullName });
          if (!histEmailSlots.has(em)) histEmailSlots.set(em, new Set());
          if (sId) histEmailSlots.get(em)!.add(sId);
          if (curRole) histEmailSlots.get(em)!.add(curRole);
        }
        if (li && li.length >= 3) {
          histLiToApp.set(li, { id: a.id, master_person_id: masterPersonId, full_name: a.fullName });
          if (!histLiSlots.has(li)) histLiSlots.set(li, new Set());
          if (sId) histLiSlots.get(li)!.add(sId);
          if (curRole) histLiSlots.get(li)!.add(curRole);
        }
        if (nm && ph.length >= 7) {
          const npKey = `${ph}:::${nm}`;
          histPhoneNameToApp.set(npKey, { id: a.id, master_person_id: masterPersonId, full_name: a.fullName });
          if (!histPhoneNameSlots.has(npKey)) histPhoneNameSlots.set(npKey, new Set());
          if (sId) histPhoneNameSlots.get(npKey)!.add(sId);
          if (curRole) histPhoneNameSlots.get(npKey)!.add(curRole);
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
      if (params.status === 'ALL_PASSED' || params.status === 'PASS_ALL') {
        conditions.push("effective_result = 'PASS'");
      } else if (params.status === 'PASS' || params.status === 'UNIQUE_PASSED') {
        conditions.push("effective_result = 'PASS'");
        conditions.push("(is_duplicate = 0 OR is_duplicate IS NULL)");
      } else if (params.status === 'FAIL') {
        conditions.push("effective_result = 'FAIL'");
        conditions.push("(is_duplicate = 0 OR is_duplicate IS NULL)");
      } else if (params.status === 'MANUAL_REVIEW') {
        conditions.push("(effective_result = 'MANUAL_REVIEW' OR effective_result = 'ERROR')");
        conditions.push("(is_duplicate = 0 OR is_duplicate IS NULL)");
      } else if (params.status === 'DUPLICATE' || params.status === 'DUPLICATE_APPLICATION') {
        conditions.push("is_duplicate = 1");
      } else {
        conditions.push("effective_result = ?");
        values.push(params.status);
      }
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
    } else if ((params as any).viewMode === 'working_batch') {
      // In active daily workspace without a specific batch selected, only show active working batches
      const comp = params.company || 'AaraTech';
      conditions.push("(import_id IS NULL OR import_id = '' OR import_id IN (SELECT id FROM imports WHERE active_working_batch = 1 AND company = ?))");
      values.push(comp);
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

    const agg = (this.db.prepare(`
      SELECT
        COUNT(*) as totalApplicants,
        SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passedCount,
        SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failedCount,
        SUM(CASE WHEN effective_result = 'MANUAL_REVIEW' THEN 1 ELSE 0 END) as manualReviewCount,
        SUM(CASE WHEN effective_result = 'ERROR' THEN 1 ELSE 0 END) as errorCount,
        SUM(CASE WHEN green_card_answer = 'YES' THEN 1 ELSE 0 END) as gcYes,
        SUM(CASE WHEN green_card_answer = 'NO' THEN 1 ELSE 0 END) as gcNo,
        SUM(CASE WHEN green_card_answer IN ('MISSING', 'UNCLEAR') THEN 1 ELSE 0 END) as gcMissing,
        SUM(CASE WHEN sponsorship_answer = 'NO' THEN 1 ELSE 0 END) as spNo,
        SUM(CASE WHEN sponsorship_answer = 'YES' THEN 1 ELSE 0 END) as spYes,
        SUM(CASE WHEN sponsorship_answer IN ('MISSING', 'UNCLEAR') THEN 1 ELSE 0 END) as spMissing,
        SUM(CASE WHEN gender = 'MALE' THEN 1 ELSE 0 END) as maleCount,
        SUM(CASE WHEN gender = 'FEMALE' THEN 1 ELSE 0 END) as femaleCount,
        SUM(CASE WHEN gender NOT IN ('MALE', 'FEMALE') OR gender IS NULL THEN 1 ELSE 0 END) as unspecifiedGenderCount,
        SUM(CASE WHEN origin_region = 'SOUTH_ASIAN' THEN 1 ELSE 0 END) as southAsianCount,
        SUM(CASE WHEN origin_region != 'SOUTH_ASIAN' OR origin_region IS NULL THEN 1 ELSE 0 END) as otherOriginCount,
        SUM(CASE WHEN effective_result = 'PASS' OR review_decision = 'APPROVED' THEN 1 ELSE 0 END) as approvedLeadsCount,
        SUM(CASE WHEN is_duplicate = 1 THEN 1 ELSE 0 END) as duplicateCount,
        SUM(CASE WHEN assigned_recruiter IS NOT NULL AND assigned_recruiter != '' THEN 1 ELSE 0 END) as distributedCount
      FROM applicants
      WHERE company = ?
    `).get(company) as any) || {};

    const totalApplicants = Number(agg.totalApplicants || 0);
    const passedCount = Number(agg.passedCount || 0);
    const failedCount = Number(agg.failedCount || 0);
    const manualReviewCount = Number(agg.manualReviewCount || 0);
    const errorCount = Number(agg.errorCount || 0);
    const gcYes = Number(agg.gcYes || 0);
    const gcNo = Number(agg.gcNo || 0);
    const gcMissing = Number(agg.gcMissing || 0);
    const spNo = Number(agg.spNo || 0);
    const spYes = Number(agg.spYes || 0);
    const spMissing = Number(agg.spMissing || 0);
    const maleCount = Number(agg.maleCount || 0);
    const femaleCount = Number(agg.femaleCount || 0);
    const unspecifiedGenderCount = Number(agg.unspecifiedGenderCount || 0);
    const southAsianCount = Number(agg.southAsianCount || 0);
    const otherOriginCount = Number(agg.otherOriginCount || 0);
    const approvedLeadsCount = Number(agg.approvedLeadsCount || 0);
    const duplicateCount = Number(agg.duplicateCount || 0);
    const distributedCount = Number(agg.distributedCount || 0);

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
  getImports(limit: number | string = 50, company?: string): ImportRecord[] {
    const finalLimit = typeof limit === 'number' ? limit : (parseInt(String(limit), 10) || 50);
    const finalCompany = typeof limit === 'string' && isNaN(Number(limit)) ? limit : company;

    let importsStmt;
    let importRows: any[];
    if (finalCompany) {
      importsStmt = this.db.prepare('SELECT * FROM imports WHERE company = ? ORDER BY uploaded_at DESC LIMIT ?');
      importRows = importsStmt.all(finalCompany, finalLimit) as any[];
    } else {
      importsStmt = this.db.prepare('SELECT * FROM imports ORDER BY uploaded_at DESC LIMIT ?');
      importRows = importsStmt.all(finalLimit) as any[];
    }

    return importRows.map(imp => {
      const filesStmt = this.db.prepare('SELECT * FROM import_files WHERE import_id = ?');
      const fileRows = filesStmt.all(imp.id) as any[];
      const batchName = imp.batch_name || fileRows[0]?.job_title || fileRows[0]?.filename || imp.import_code;

      let parsedJobSlots: string[] = [];
      try {
        if (imp.job_slots) parsedJobSlots = JSON.parse(imp.job_slots);
      } catch { }

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
    company: string;
    clearedMode: 'purged' | 'unloaded';
    activeWorkingBatchCleared: boolean;
    purgedApplicants: number;
    applicantsDeleted: number;
    message: string;
  } {
    const batch = this.db.prepare('SELECT id, batch_name, import_code FROM imports WHERE id = ? AND company = ?').get(batchId, company) as any;
    if (!batch) {
      throw new Error(`Batch '${batchId}' not found in company workspace '${company}'.`);
    }

    const countRow = this.db.prepare('SELECT COUNT(*) as c FROM applicants WHERE import_id = ? AND company = ?').get(batchId, company) as any;
    const applicantCount = countRow?.c || 0;

    let purgedApplicants = 0;
    if (purgeRecords) {
      this.db.prepare('DELETE FROM applicants WHERE (import_id = ? OR batch_id = ?) AND company = ?').run(batchId, batchId, company);
      this.db.prepare('DELETE FROM import_files WHERE import_id = ?').run(batchId);
      this.db.prepare('DELETE FROM imports WHERE id = ? AND company = ?').run(batchId, company);
      purgedApplicants = applicantCount;
    } else {
      // Safely unload active batch from working view without deleting permanent application records
      this.db.prepare('UPDATE imports SET active_working_batch = 0 WHERE id = ? AND company = ?').run(batchId, company);
    }

    this.addAuditLog({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user: 'Recruiter Admin',
      action: purgeRecords ? 'Batch Purged' : 'Batch Unloaded',
      reason: `User cleared active batch ${batch.import_code} (${batch.batch_name || 'Import Batch'}) from ${company} workspace (mode: ${purgeRecords ? 'purged' : 'unloaded'}).`,
      details: purgeRecords
        ? `Batch ${batch.import_code} and all ${applicantCount} applicant rows purged from screening workspace. Master candidate CRM records remain permanently intact.`
        : `Working view cleared. All ${applicantCount} applicant records, screening decisions, and master links remain permanently preserved in application history and reporting.`,
    });

    return {
      success: true,
      batchId,
      company,
      clearedMode: purgeRecords ? 'purged' : 'unloaded',
      activeWorkingBatchCleared: true,
      purgedApplicants,
      applicantsDeleted: purgedApplicants,
      message: purgeRecords
        ? `Batch ${batch.import_code} and its ${applicantCount} applicant records purged from ${company} filter workspace. Master CRM records remain preserved.`
        : `Batch ${batch.import_code} cleared from active working view. All ${applicantCount} applicants safely preserved in permanent history.`,
    };
  }

  // --- Clear All Working Batches / All Slots at a time ---
  clearAllWorkingBatches(company: 'AaraTech' | 'ClinisolTech', purgeRecords = false, user = 'Recruiter Admin') {
    if (purgeRecords) {
      return this.clearAllApplications(company, user);
    }

    const totalBatches = this.db.prepare('SELECT COUNT(*) as c FROM imports WHERE company = ?').get(company) as any;
    const totalApps = this.db.prepare('SELECT COUNT(*) as c FROM applicants WHERE company = ?').get(company) as any;

    this.db.prepare('UPDATE imports SET active_working_batch = 0 WHERE company = ?').run(company);

    this.addAuditLog({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user,
      action: 'All Batches Unloaded',
      reason: `User safely cleared all active slots/batches from ${company} working view.`,
      details: `All ${totalBatches?.c || 0} batches cleared from working view. All ${totalApps?.c || 0} applicants remain permanently preserved in application history and reporting.`,
    });

    return {
      success: true,
      company,
      clearedMode: 'unloaded' as const,
      activeWorkingBatchCleared: true,
      purgedApplicants: 0,
      applicantsDeleted: 0,
      totalBatches: totalBatches?.c || 0,
      totalApplicants: totalApps?.c || 0,
      message: `All ${totalBatches?.c || 0} slots/batches cleared from active working view for ${company}. All ${totalApps?.c || 0} applicants safely preserved in permanent history.`,
    };
  }

  // --- Clear Daily Batches for a specific date (or today) ---
  clearDailyBatches(
    company: 'AaraTech' | 'ClinisolTech',
    applicationDate?: string,
    purgeRecords = false,
    user = 'Recruiter Admin'
  ): {
    success: boolean;
    company: string;
    clearedMode: 'purged' | 'unloaded';
    activeWorkingBatchCleared: boolean;
    purgedApplicants: number;
    applicantsDeleted: number;
    totalBatches: number;
    totalApplicants: number;
    message: string;
  } {
    let importRows: any[];

    if (applicationDate && applicationDate !== 'ALL') {
      importRows = this.db.prepare('SELECT id, import_code, total_applicants FROM imports WHERE company = ? AND application_date = ?').all(company, applicationDate) as any[];
    } else {
      // In active workspace without specific date, only target active working batches!
      importRows = this.db.prepare('SELECT id, import_code, total_applicants FROM imports WHERE company = ? AND active_working_batch = 1').all(company) as any[];
    }

    const totalBatches = importRows.length;
    if (totalBatches === 0) {
      return {
        success: true,
        company,
        clearedMode: purgeRecords ? 'purged' : 'unloaded',
        activeWorkingBatchCleared: true,
        purgedApplicants: 0,
        applicantsDeleted: 0,
        totalBatches: 0,
        totalApplicants: 0,
        message: `No active daily batches found to clear for ${company}.`,
      };
    }

    const batchIds = importRows.map(r => r.id);
    const placeholders = batchIds.map(() => '?').join(',');

    const countRow = this.db.prepare(`SELECT COUNT(*) as c FROM applicants WHERE company = ? AND import_id IN (${placeholders})`).get(company, ...batchIds) as any;
    const totalApps = countRow?.c || 0;
    let purgedApplicants = 0;

    if (purgeRecords) {
      // Strictly scoped deletion to ONLY the batches uploaded on this day - NEVER company-wide delete!
      this.db.prepare(`DELETE FROM applicants WHERE company = ? AND import_id IN (${placeholders})`).run(company, ...batchIds);
      this.db.prepare(`DELETE FROM import_files WHERE import_id IN (${placeholders})`).run(...batchIds);
      this.db.prepare(`DELETE FROM imports WHERE company = ? AND id IN (${placeholders})`).run(company, ...batchIds);
      purgedApplicants = totalApps;
    } else {
      // Safely unload from active daily view without deleting any applicant or CRM rows
      this.db.prepare(`UPDATE imports SET active_working_batch = 0 WHERE company = ? AND id IN (${placeholders})`).run(company, ...batchIds);
    }

    const dateLabel = applicationDate && applicationDate !== 'ALL' ? `for ${applicationDate}` : 'active daily';
    this.addAuditLog({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      user,
      action: purgeRecords ? 'Daily Batches Purged' : 'Daily Batches Unloaded',
      reason: `User cleared ${dateLabel} batches from ${company} workspace (mode: ${purgeRecords ? 'purged' : 'unloaded'}).`,
      details: purgeRecords
        ? `All ${totalBatches} batches and ${totalApps} applicant records ${dateLabel} purged. Master candidate CRM records remain permanently preserved.`
        : `All ${totalBatches} batches ${dateLabel} unloaded from active working view. All ${totalApps} applicants preserved in permanent history.`,
    });

    return {
      success: true,
      company,
      clearedMode: purgeRecords ? 'purged' : 'unloaded',
      activeWorkingBatchCleared: true,
      purgedApplicants,
      applicantsDeleted: purgedApplicants,
      totalBatches,
      totalApplicants: totalApps,
      message: purgeRecords
        ? `Cleared and purged all ${totalBatches} uploads (${totalApps} applicants) ${dateLabel} for ${company}. Master CRM records remain permanently preserved.`
        : `Unloaded all ${totalBatches} uploads (${totalApps} applicants) ${dateLabel} from active working view for ${company}. Applications remain safely preserved in permanent history.`,
    };
  }

  // --- Auto-Rotate Daily Batches based on EST Date (America/New_York) ---
  autoRotateDailyBatchesEST(): { rotatedBatches: number; todayEST: string } {
    try {
      const todayEST = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
      // Fast read-only check first so GET endpoints don't acquire unnecessary SQLite write locks
      const needsRotation = this.db.prepare(`
        SELECT 1 FROM imports
        WHERE active_working_batch = 1
          AND (
            application_date < ?
            OR (application_date IS NULL AND substr(uploaded_at, 1, 10) < ?)
          )
        LIMIT 1
      `).get(todayEST, todayEST);
      if (!needsRotation) {
        return { rotatedBatches: 0, todayEST };
      }
      const stmt = this.db.prepare(`
        UPDATE imports 
        SET active_working_batch = 0 
        WHERE active_working_batch = 1 
          AND (
            application_date < ? 
            OR (application_date IS NULL AND substr(uploaded_at, 1, 10) < ?)
          )
      `);
      const info = stmt.run(todayEST, todayEST);
      return {
        rotatedBatches: Number(info.changes),
        todayEST,
      };
    } catch (err: any) {
      console.warn('Auto-rotate daily batches EST error:', err?.message || err);
      return { rotatedBatches: 0, todayEST: new Date().toISOString().split('T')[0] };
    }
  }

  // --- Authoritative Database Health Check ---
  checkDatabaseHealth(company: 'AaraTech' | 'ClinisolTech') {
    const startTime = performance.now();
    try {
      const appRow = this.db.prepare('SELECT COUNT(*) as c FROM applicants WHERE company = ?').get(company) as any;
      const peopleRow = this.db.prepare('SELECT COUNT(*) as c FROM master_people WHERE company = ?').get(company) as any;
      const masterAppsRow = this.db.prepare('SELECT COUNT(*) as c FROM master_applications WHERE company = ?').get(company) as any;
      const importsRow = this.db.prepare('SELECT COUNT(*) as c FROM imports WHERE company = ?').get(company) as any;
      const latestAudit = this.db.prepare('SELECT timestamp FROM audit_logs ORDER BY timestamp DESC LIMIT 1').get() as any;

      const latencyMs = Math.round(performance.now() - startTime);
      const now = new Date().toISOString();

      return {
        status: 'ONLINE' as const,
        company,
        connected: true,
        dbType: 'SQLite Relational Database (Authoritative)',
        latencyMs,
        applicantCount: appRow?.c || 0,
        masterPeopleCount: peopleRow?.c || 0,
        masterAppCount: masterAppsRow?.c || 0,
        importCount: importsRow?.c || 0,
        lastSuccessfulCheck: now,
        lastSuccessfulRead: now,
        lastSuccessfulWrite: latestAudit?.timestamp || now,
        syncStatus: 'Authoritative Production Store Verified',
      };
    } catch (err: any) {
      return {
        status: 'OFFLINE' as const,
        company,
        connected: false,
        dbType: 'SQLite Relational Database (Authoritative)',
        latencyMs: Math.round(performance.now() - startTime),
        applicantCount: 0,
        masterPeopleCount: 0,
        masterAppCount: 0,
        importCount: 0,
        lastSuccessfulCheck: new Date().toISOString(),
        lastSuccessfulRead: '',
        lastSuccessfulWrite: '',
        syncStatus: `Database query error: ${err.message}`,
      };
    }
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
      try { this.db.exec('ROLLBACK'); } catch { }
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

    let total = overview.total || 0;
    let passed = overview.passed || 0;
    let failed = overview.failed || 0;
    let manualReview = overview.manualReview || 0;
    let approved = overview.approved || 0;
    let duplicates = overview.duplicates || 0;
    let distributed = overview.distributed || 0;

    // Monthly fallback to master_applications if applicants table has 0 records for historical month
    const monthPrefix = targetDate.length >= 7 ? targetDate.slice(0, 7) : targetDate;
    if (period === 'monthly' && total === 0) {
      const mStats = this.getMonthSummary(company, monthPrefix);
      total = mStats.total;
      passed = mStats.passed;
      failed = mStats.failed;
      duplicates = mStats.duplicates;
    }

    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    // Unique Candidates in reporting period
    const uniqueCandRow = (this.db.prepare(`
      SELECT COUNT(DISTINCT COALESCE(NULLIF(email, ''), NULLIF(phone, ''), full_name)) as count
      FROM applicants
      WHERE company = ? ${dateFilter}
    `).get(...dateParams) as any) || {};
    let uniqueCandidatesCount = uniqueCandRow.count || 0;
    if (period === 'monthly' && uniqueCandidatesCount === 0 && total > 0) {
      uniqueCandidatesCount = total;
    }

    // Repeat Applications in reporting period (instant indexed aggregation)
    const repeatApplicationsCount = overview.duplicates || Math.max(0, total - uniqueCandidatesCount);

    // Transferred applications to Master DB during this period
    let transferDateFilter = '';
    const transferParams: any[] = [company];
    if (period === 'daily') {
      transferDateFilter = "AND substr(transferred_at, 1, 10) = ?";
      transferParams.push(targetDate);
    } else if (period === 'weekly') {
      transferDateFilter = "AND substr(transferred_at, 1, 10) >= date(?, '-7 days') AND substr(transferred_at, 1, 10) <= ?";
      transferParams.push(targetDate, targetDate);
    } else if (period === 'monthly') {
      const monthPrefix = targetDate.slice(0, 7);
      transferDateFilter = "AND substr(transferred_at, 1, 10) LIKE ?";
      transferParams.push(`${monthPrefix}%`);
    } else if (period === 'custom' && startDate && endDate) {
      transferDateFilter = "AND substr(transferred_at, 1, 10) >= ? AND substr(transferred_at, 1, 10) <= ?";
      transferParams.push(startDate, endDate);
    }

    const transferRow = (this.db.prepare(`
      SELECT COUNT(*) as transferred
      FROM master_transfers
      WHERE company = ? AND transfer_status = 'TRANSFERRED' ${transferDateFilter}
    `).get(...transferParams) as any) || {};

    const masterLinkedPassed = (this.db.prepare(`
      SELECT COUNT(*) as count
      FROM applicants
      WHERE company = ? AND master_person_id IS NOT NULL AND master_person_id != '' AND (review_decision = 'APPROVED' OR effective_result = 'PASS') ${dateFilter}
    `).get(...dateParams) as any)?.count || 0;

    const transferredCount = Math.max(transferRow.transferred || 0, masterLinkedPassed);

    // Recruiter Distribution & Leads in period
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

    // Recruiter Contacts and Outcomes in reporting window
    let contactDateFilter = '';
    const contactParams: any[] = [company];
    if (period === 'daily') {
      contactDateFilter = "AND (c.contact_date = ? OR substr(c.created_at, 1, 10) = ?)";
      contactParams.push(targetDate, targetDate);
    } else if (period === 'weekly') {
      contactDateFilter = "AND ((c.contact_date >= date(?, '-7 days') AND c.contact_date <= ?) OR (substr(c.created_at, 1, 10) >= date(?, '-7 days') AND substr(c.created_at, 1, 10) <= ?))";
      contactParams.push(targetDate, targetDate, targetDate, targetDate);
    } else if (period === 'monthly') {
      const monthPrefix = targetDate.slice(0, 7);
      contactDateFilter = "AND (c.contact_date LIKE ? OR substr(c.created_at, 1, 10) LIKE ?)";
      contactParams.push(`${monthPrefix}%`, `${monthPrefix}%`);
    } else if (period === 'custom' && startDate && endDate) {
      contactDateFilter = "AND ((c.contact_date >= ? AND c.contact_date <= ?) OR (substr(c.created_at, 1, 10) >= ? AND substr(c.created_at, 1, 10) <= ?))";
      contactParams.push(startDate, endDate, startDate, endDate);
    }

    const contactRow = (this.db.prepare(`
      SELECT COUNT(*) as count
      FROM master_recruiter_contacts c
      JOIN master_people p ON c.person_id = p.id OR c.person_id = p.person_id
      WHERE p.company = ? ${contactDateFilter}
    `).get(...contactParams) as any) || {};
    const contactAttemptsCount = contactRow.count || 0;

    const recContacts = this.db.prepare(`
      SELECT
        LOWER(TRIM(c.recruiter_name)) as recruiterKey,
        COUNT(*) as contactsMade,
        SUM(CASE 
          WHEN (LOWER(c.outcome) LIKE '%interest%' AND LOWER(c.outcome) NOT LIKE '%not%')
            OR (LOWER(c.feedback_1) LIKE '%interest%' AND LOWER(c.feedback_1) NOT LIKE '%not%')
            OR (LOWER(c.feedback_2) LIKE '%interest%' AND LOWER(c.feedback_2) NOT LIKE '%not%')
            OR LOWER(c.outcome) LIKE '%interview%'
            OR LOWER(c.outcome) LIKE '%cleared%'
            OR LOWER(c.outcome) LIKE '%scheduled%' THEN 1
          ELSE 0
        END) as positiveFeedbackCount,
        SUM(CASE 
          WHEN LOWER(c.outcome) LIKE '%not interest%'
            OR LOWER(c.feedback_1) LIKE '%not interest%'
            OR LOWER(c.feedback_2) LIKE '%not interest%'
            OR LOWER(c.outcome) LIKE '%vm%'
            OR LOWER(c.outcome) LIKE '%voicemail%'
            OR LOWER(c.outcome) LIKE '%reject%'
            OR LOWER(c.outcome) LIKE '%fail%' THEN 1
          ELSE 0
        END) as negativeFeedbackCount
      FROM master_recruiter_contacts c
      JOIN master_people p ON c.person_id = p.id OR c.person_id = p.person_id
      WHERE p.company = ? ${contactDateFilter}
      GROUP BY LOWER(TRIM(c.recruiter_name))
    `).all(...contactParams) as any[];

    const recContactMap = new Map<string, any>();
    for (const rc of recContacts) {
      recContactMap.set(rc.recruiterKey, rc);
    }

    const allRecruiters = this.getRecruiters(company);
    const recruiterDistribution = allRecruiters.map(r => {
      const found = recBreakdown.find(b => (b.recruiterName || '').trim().toLowerCase() === r.name.toLowerCase());
      const cStats = recContactMap.get(r.name.toLowerCase()) || {};
      const leadsAssigned = found ? found.leadsAssigned : 0;
      const contactsMade = cStats.contactsMade || 0;
      const positiveFeedbackCount = cStats.positiveFeedbackCount || 0;
      const negativeFeedbackCount = cStats.negativeFeedbackCount || 0;
      const pendingFeedbackCount = Math.max(0, leadsAssigned - contactsMade);

      return {
        recruiterName: r.name,
        recruiter: r.name,
        email: r.email,
        leadsAssigned,
        count: leadsAssigned,
        contactsMade,
        positiveFeedbackCount,
        negativeFeedbackCount,
        pendingFeedbackCount,
        lastDistributedAt: found ? found.lastDistributedAt : undefined,
      };
    });

    // Baseline and dynamic job slot breakdown
    const jobRows = this.db.prepare(`
      SELECT
        COALESCE(job_id, 'N/A') as jobId,
        COALESCE(job_title, 'Unspecified Role') as jobTitle,
        COUNT(*) as total,
        SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN effective_result = 'MANUAL_REVIEW' THEN 1 ELSE 0 END) as manualReview,
        SUM(CASE WHEN review_decision = 'APPROVED' OR effective_result = 'PASS' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN master_person_id IS NOT NULL AND master_person_id != '' AND (review_decision = 'APPROVED' OR effective_result = 'PASS') THEN 1 ELSE 0 END) as transferred,
        COUNT(DISTINCT COALESCE(NULLIF(email, ''), NULLIF(phone, ''), full_name)) as uniqueCandidates
      FROM applicants
      WHERE company = ? ${dateFilter}
      GROUP BY job_id, job_title
      ORDER BY total DESC
    `).all(...dateParams) as any[];

    const baselineJobs = this.getBaselineJobs(company);
    const matchedJobKeys = new Set<string>();

    const jobBreakdown = baselineJobs.map(bj => {
      const matched = jobRows.find(
        r => r.jobId === bj.jobId || r.jobTitle.toLowerCase().trim() === bj.jobTitle.toLowerCase().trim()
      );
      if (matched) {
        matchedJobKeys.add(matched.jobId);
        matchedJobKeys.add(matched.jobTitle.toLowerCase().trim());
      }
      const totalCount = matched ? matched.total : 0;
      const passedCount = matched ? matched.passed : 0;
      const uniqueCandidates = matched ? matched.uniqueCandidates : 0;
      const repeatApplicants = Math.max(0, totalCount - uniqueCandidates);
      return {
        jobId: bj.jobId,
        jobTitle: bj.jobTitle,
        total: totalCount,
        passed: passedCount,
        failed: matched ? matched.failed : 0,
        manualReview: matched ? matched.manualReview : 0,
        approved: matched ? matched.approved : 0,
        transferred: matched ? matched.transferred : 0,
        uniqueCandidates,
        repeatApplicants,
        passRate: totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0,
      };
    });

    // Add any dynamic job titles from applicants not in baselineJobs
    for (const r of jobRows) {
      if (!matchedJobKeys.has(r.jobId) && !matchedJobKeys.has(r.jobTitle.toLowerCase().trim())) {
        const repeatCount = Math.max(0, r.total - (r.uniqueCandidates || 0));
        jobBreakdown.push({
          jobId: r.jobId,
          jobTitle: r.jobTitle,
          total: r.total,
          passed: r.passed,
          failed: r.failed,
          manualReview: r.manualReview,
          approved: r.approved,
          transferred: r.transferred || 0,
          uniqueCandidates: r.uniqueCandidates || 0,
          repeatApplicants: repeatCount,
          passRate: r.total > 0 ? Math.round((r.passed / r.total) * 100) : 0,
        });
      }
    }

    // Previous period comparison (Section 11)
    let prevDateFilter = '';
    const prevDateParams: any[] = [company];
    if (period === 'daily') {
      prevDateFilter = "AND application_date = date(?, '-1 day')";
      prevDateParams.push(targetDate);
    } else if (period === 'weekly') {
      prevDateFilter = "AND application_date >= date(?, '-14 days') AND application_date < date(?, '-7 days')";
      prevDateParams.push(targetDate, targetDate);
    } else if (period === 'monthly') {
      prevDateFilter = "AND application_date >= date(?, 'start of month', '-1 month') AND application_date < date(?, 'start of month')";
      prevDateParams.push(targetDate, targetDate);
    } else if (period === 'custom' && startDate && endDate) {
      const diffDays = Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000));
      prevDateFilter = `AND application_date >= date(?, '-${diffDays} days') AND application_date < ?`;
      prevDateParams.push(startDate, startDate);
    }

    let comparison: any = null;
    if (period === 'monthly') {
      const monthPrefix = targetDate.length >= 7 ? targetDate.slice(0, 7) : targetDate;
      const [yStr, mStr] = monthPrefix.split('-');
      let prevY = parseInt(yStr, 10);
      let prevM = parseInt(mStr, 10) - 1;
      if (prevM < 1) { prevM = 12; prevY -= 1; }
      const prevMonthKey = `${prevY}-${String(prevM).padStart(2, '0')}`;
      const prevSummary = this.getMonthSummary(company, prevMonthKey);

      const prevTotal = prevSummary.total;
      const prevPassed = prevSummary.passed;
      const prevDuplicates = prevSummary.duplicates;
      const prevFailed = prevSummary.failed;
      const prevPassRate = prevSummary.passRate;
      const hasPreviousData = prevTotal > 0;

      comparison = {
        hasPreviousData,
        previousPeriodLabel: prevSummary.label,
        previousTotal: prevTotal,
        previousPassed: prevPassed,
        previousDuplicates: prevDuplicates,
        previousFailed: prevFailed,
        previousPassRate: prevPassRate,
        previousTransferred: 0,
        deltas: {
          total: total - prevTotal,
          totalPct: hasPreviousData ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0,
          passed: passed - prevPassed,
          passedPct: prevPassed > 0 ? Math.round(((passed - prevPassed) / prevPassed) * 100) : 0,
          duplicates: duplicates - prevDuplicates,
          duplicatesPct: prevDuplicates > 0 ? Math.round(((duplicates - prevDuplicates) / prevDuplicates) * 100) : 0,
          failed: failed - prevFailed,
          failedPct: prevFailed > 0 ? Math.round(((failed - prevFailed) / prevFailed) * 100) : 0,
          passRate: passRate - prevPassRate,
          transferred: 0,
        },
      };
    } else if (prevDateFilter) {
      const prevRow = (this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed,
          SUM(CASE WHEN is_duplicate = 1 THEN 1 ELSE 0 END) as duplicates,
          SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN review_decision = 'APPROVED' OR effective_result = 'PASS' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN master_person_id IS NOT NULL AND master_person_id != '' AND (review_decision = 'APPROVED' OR effective_result = 'PASS') THEN 1 ELSE 0 END) as transferred
        FROM applicants
        WHERE company = ? ${prevDateFilter}
      `).get(...prevDateParams) as any) || {};

      const prevTotal = prevRow.total || 0;
      const prevPassed = prevRow.passed || 0;
      const prevDuplicates = prevRow.duplicates || 0;
      const prevFailed = prevRow.failed || 0;
      const prevTransferred = prevRow.transferred || 0;
      const prevPassRate = prevTotal > 0 ? Math.round((prevPassed / prevTotal) * 100) : 0;
      const hasPreviousData = prevTotal > 0;

      comparison = {
        hasPreviousData,
        previousTotal: prevTotal,
        previousPassed: prevPassed,
        previousDuplicates: prevDuplicates,
        previousFailed: prevFailed,
        previousPassRate: prevPassRate,
        previousTransferred: prevTransferred,
        deltas: {
          total: total - prevTotal,
          totalPct: hasPreviousData ? Math.round(((total - prevTotal) / prevTotal) * 100) : 0,
          passed: passed - prevPassed,
          passedPct: prevPassed > 0 ? Math.round(((passed - prevPassed) / prevPassed) * 100) : 0,
          duplicates: duplicates - prevDuplicates,
          duplicatesPct: prevDuplicates > 0 ? Math.round(((duplicates - prevDuplicates) / prevDuplicates) * 100) : 0,
          failed: failed - prevFailed,
          failedPct: prevFailed > 0 ? Math.round(((failed - prevFailed) / prevFailed) * 100) : 0,
          passRate: passRate - prevPassRate,
          transferred: transferredCount - prevTransferred,
        },
      };
    }

    // Daily Trend
    let trendRows = this.db.prepare(`
      SELECT
        COALESCE(NULLIF(application_date, ''), strftime('%Y-%m-%d', created_at)) as date,
        COUNT(*) as total,
        SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN effective_result = 'MANUAL_REVIEW' THEN 1 ELSE 0 END) as manualReview,
        SUM(CASE WHEN is_duplicate = 1 THEN 1 ELSE 0 END) as duplicates
      FROM applicants
      WHERE company = ? AND (application_date IS NOT NULL OR created_at IS NOT NULL)
      GROUP BY date
      ORDER BY date ASC
    `).all(company) as any[];

    if (period === 'monthly' && (overview.total || 0) === 0 && total > 0) {
      trendRows = (this.db.prepare(`
        SELECT
          COALESCE(ma.application_collected_date, ma.date_applied) as date,
          COUNT(*) as total,
          SUM(CASE WHEN ma.effective_result = 'PASS' THEN 1 ELSE 0 END) as passed,
          SUM(CASE WHEN ma.effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed,
          0 as manualReview,
          0 as duplicates
        FROM master_applications ma
        WHERE ma.company = ? AND (ma.application_collected_date LIKE ? OR ma.date_applied LIKE ?)
        GROUP BY date
        ORDER BY date ASC
      `).all(company, `${monthPrefix}%`, `${monthPrefix}%`) as any[]) || [];
    }

    // Unique Passed Candidates for Scope
    const uniquePassedRow = (this.db.prepare(`
      SELECT COUNT(DISTINCT COALESCE(NULLIF(email, ''), NULLIF(phone, ''), full_name)) as count
      FROM applicants
      WHERE company = ? AND effective_result = 'PASS' ${dateFilter}
    `).get(...dateParams) as any) || {};
    let uniquePassedCandidates = uniquePassedRow.count || 0;
    if (period === 'monthly' && (overview.total || 0) === 0 && total > 0) {
      uniquePassedCandidates = passed;
    }

    // Demographics for Passed Candidates
    let passedDemographicsRows = (this.db.prepare(`
      SELECT 
        UPPER(COALESCE(mp.gender, a.gender, 'UNSPECIFIED')) as gender,
        COUNT(DISTINCT COALESCE(NULLIF(a.email, ''), NULLIF(a.phone, ''), a.full_name)) as count
      FROM applicants a
      LEFT JOIN master_people mp ON a.master_person_id = mp.id OR a.master_person_id = mp.person_id
      WHERE a.company = ? AND a.effective_result = 'PASS' ${dateFilter}
      GROUP BY UPPER(COALESCE(mp.gender, a.gender, 'UNSPECIFIED'))
    `).all(...dateParams) as any[]) || [];

    if (period === 'monthly' && (overview.total || 0) === 0 && total > 0) {
      passedDemographicsRows = (this.db.prepare(`
        SELECT 
          UPPER(COALESCE(mp.gender, 'UNSPECIFIED')) as gender,
          COUNT(DISTINCT mp.id) as count
        FROM master_applications ma
        LEFT JOIN master_people mp ON ma.person_id = mp.id
        WHERE ma.company = ? AND ma.effective_result = 'PASS' AND (ma.application_collected_date LIKE ? OR ma.date_applied LIKE ?)
        GROUP BY UPPER(COALESCE(mp.gender, 'UNSPECIFIED'))
      `).all(company, `${monthPrefix}%`, `${monthPrefix}%`) as any[]) || [];
    }

    let malePassedCount = 0;
    let femalePassedCount = 0;
    let unspecifiedPassedCount = 0;
    for (const r of passedDemographicsRows) {
      const g = (r.gender || '').toUpperCase();
      if (g.startsWith('M')) malePassedCount += r.count;
      else if (g.startsWith('F')) femalePassedCount += r.count;
      else unspecifiedPassedCount += r.count;
    }
    const totalVerifiedGender = malePassedCount + femalePassedCount;
    const malePercentage = totalVerifiedGender > 0 ? Math.round((malePassedCount / totalVerifiedGender) * 100) : 0;
    const femalePercentage = totalVerifiedGender > 0 ? Math.round((femalePassedCount / totalVerifiedGender) * 100) : 0;
    const demographics = {
      male: { count: malePassedCount, percentage: malePercentage },
      female: { count: femalePassedCount, percentage: femalePercentage },
      unspecified: { count: unspecifiedPassedCount, percentage: uniquePassedCandidates > 0 ? Math.round((unspecifiedPassedCount / uniquePassedCandidates) * 100) : 0 },
      totalVerified: totalVerifiedGender,
      ageGroups: [
        { group: '18–25', count: 0, percentage: 0 },
        { group: '26–35', count: 0, percentage: 0 },
        { group: '36–45', count: 0, percentage: 0 },
        { group: '46+', count: 0, percentage: 0 },
      ],
      ageNote: 'Verified Date of Birth not captured in standard ATS import feeds per EEOC compliance guidelines.',
    };

    // Geographic Distribution of Passed Candidates (Canonicalized)
    let geoRows = (this.db.prepare(`
      SELECT a.location, COUNT(DISTINCT COALESCE(NULLIF(a.email, ''), NULLIF(a.phone, ''), a.full_name)) as count
      FROM applicants a
      WHERE a.company = ? AND a.effective_result = 'PASS' ${dateFilter}
      GROUP BY a.location
    `).all(...dateParams) as any[]) || [];

    if (period === 'monthly' && (overview.total || 0) === 0 && total > 0) {
      geoRows = (this.db.prepare(`
        SELECT mp.location, COUNT(DISTINCT mp.id) as count
        FROM master_applications ma
        LEFT JOIN master_people mp ON ma.person_id = mp.id
        WHERE ma.company = ? AND ma.effective_result = 'PASS' AND (ma.application_collected_date LIKE ? OR ma.date_applied LIKE ?)
        GROUP BY mp.location
      `).all(company, `${monthPrefix}%`, `${monthPrefix}%`) as any[]) || [];
    }

    const geoMap = new Map<string, number>();
    for (const r of geoRows) {
      const canon = canonicalizeLocation(r.location);
      geoMap.set(canon, (geoMap.get(canon) || 0) + r.count);
    }
    const sortedGeo = Array.from(geoMap.entries()).sort((a, b) => b[1] - a[1]);
    const top5Locations = sortedGeo.slice(0, 5).map(([name, count]) => ({
      name,
      count,
      percentage: uniquePassedCandidates > 0 ? Math.round((count / uniquePassedCandidates) * 100) : 0,
    }));
    const otherCount = sortedGeo.slice(5).reduce((acc, [, count]) => acc + count, 0);
    const geographicDistribution = {
      topLocations: top5Locations,
      other: {
        name: 'Other Locations',
        count: otherCount,
        percentage: uniquePassedCandidates > 0 ? Math.round((otherCount / uniquePassedCandidates) * 100) : 0,
      },
      allLocations: sortedGeo.map(([name, count]) => ({
        name,
        count,
        percentage: uniquePassedCandidates > 0 ? Math.round((count / uniquePassedCandidates) * 100) : 0,
      })),
    };

    // Hierarchical Technology & Job Slot Tree
    let techRows = (this.db.prepare(`
      SELECT 
        a.job_id,
        a.job_title,
        UPPER(COALESCE(mp.gender, a.gender, 'UNSPECIFIED')) as gender,
        a.effective_result,
        a.is_duplicate
      FROM applicants a
      LEFT JOIN master_people mp ON a.master_person_id = mp.id OR a.master_person_id = mp.person_id
      WHERE a.company = ? ${dateFilter}
    `).all(...dateParams) as any[]) || [];

    if (period === 'monthly' && (overview.total || 0) === 0 && total > 0) {
      techRows = (this.db.prepare(`
        SELECT 
          ma.job_id,
          ma.job_title,
          UPPER(COALESCE(mp.gender, 'UNSPECIFIED')) as gender,
          ma.effective_result,
          0 as is_duplicate
        FROM master_applications ma
        LEFT JOIN master_people mp ON ma.person_id = mp.id
        WHERE ma.company = ? AND (ma.application_collected_date LIKE ? OR ma.date_applied LIKE ?)
      `).all(company, `${monthPrefix}%`, `${monthPrefix}%`) as any[]) || [];
    }

    const techGroupMap = new Map<string, any>();
    for (const r of techRows) {
      const tech = getTechCategory(r.job_title, r.job_id);
      const slotKey = r.job_id || r.job_title || 'Unknown Slot';
      const slotTitle = r.job_title || r.job_id;

      if (!techGroupMap.has(tech)) {
        techGroupMap.set(tech, {
          technology: tech,
          totalApplied: 0,
          passedTotal: 0,
          passedMale: 0,
          passedFemale: 0,
          passedUnspecified: 0,
          duplicates: 0,
          failed: 0,
          inReview: 0,
          slots: new Map<string, any>(),
        });
      }
      const t = techGroupMap.get(tech)!;
      t.totalApplied++;
      if (r.is_duplicate === 1) t.duplicates++;
      if (r.effective_result === 'FAIL') t.failed++;
      if (r.effective_result === 'MANUAL_REVIEW') t.inReview++;

      if (!t.slots.has(slotKey)) {
        t.slots.set(slotKey, {
          jobId: r.job_id,
          jobTitle: slotTitle,
          totalApplied: 0,
          passedTotal: 0,
          passedMale: 0,
          passedFemale: 0,
          passedUnspecified: 0,
          duplicates: 0,
          failed: 0,
          inReview: 0,
        });
      }
      const s = t.slots.get(slotKey)!;
      s.totalApplied++;
      if (r.is_duplicate === 1) s.duplicates++;
      if (r.effective_result === 'FAIL') s.failed++;
      if (r.effective_result === 'MANUAL_REVIEW') s.inReview++;

      if (r.effective_result === 'PASS') {
        t.passedTotal++;
        s.passedTotal++;
        const g = (r.gender || '').toUpperCase();
        if (g.startsWith('M')) {
          t.passedMale++;
          s.passedMale++;
        } else if (g.startsWith('F')) {
          t.passedFemale++;
          s.passedFemale++;
        } else {
          t.passedUnspecified++;
          s.passedUnspecified++;
        }
      }
    }

    const technologyTree = Array.from(techGroupMap.values()).map(t => {
      const passRate = t.totalApplied > 0 ? Math.round((t.passedTotal / t.totalApplied) * 100) : 0;
      const repeatRate = t.totalApplied > 0 ? Math.round((t.duplicates / t.totalApplied) * 100) : 0;
      const slots = Array.from(t.slots.values()).map((s: any) => {
        const sPassRate = s.totalApplied > 0 ? Math.round((s.passedTotal / s.totalApplied) * 100) : 0;
        const sRepeatRate = s.totalApplied > 0 ? Math.round((s.duplicates / s.totalApplied) * 100) : 0;
        return {
          ...s,
          passedFormatted: `${s.passedTotal} (M: ${s.passedMale} | F: ${s.passedFemale})`,
          passRate: sPassRate,
          repeatRate: sRepeatRate,
        };
      }).sort((a: any, b: any) => b.totalApplied - a.totalApplied);

      return {
        technology: t.technology,
        totalApplied: t.totalApplied,
        passedTotal: t.passedTotal,
        passedMale: t.passedMale,
        passedFemale: t.passedFemale,
        passedUnspecified: t.passedUnspecified,
        passedFormatted: `${t.passedTotal} (M: ${t.passedMale} | F: ${t.passedFemale})`,
        duplicates: t.duplicates,
        failed: t.failed,
        inReview: t.inReview,
        passRate,
        repeatRate,
        slots,
      };
    }).sort((a, b) => b.totalApplied - a.totalApplied);

    // Recruitment Funnel
    const funnel = {
      applicationLevel: [
        { stage: 'Total Ingested', count: total, percentage: 100 },
        { stage: 'Screened & Evaluated', count: passed + failed + manualReview, percentage: total > 0 ? Math.round(((passed + failed + manualReview) / total) * 100) : 0 },
        { stage: 'Passed Requirements', count: passed, percentage: total > 0 ? Math.round((passed / total) * 100) : 0 },
        { stage: 'Transferred to Master DB', count: transferredCount, percentage: total > 0 ? Math.round((transferredCount / total) * 100) : 0 }
      ],
      personLevel: [
        { stage: 'Unique Candidates Ingested', count: uniqueCandidatesCount, percentage: 100 },
        { stage: 'Unique Candidates Passed', count: uniquePassedCandidates, percentage: uniqueCandidatesCount > 0 ? Math.round((uniquePassedCandidates / uniqueCandidatesCount) * 100) : 0 },
        { stage: 'Master Profiles Linked', count: overview.masterLinked || 0, percentage: uniqueCandidatesCount > 0 ? Math.round(((overview.masterLinked || 0) / uniqueCandidatesCount) * 100) : 0 }
      ]
    };

    // Application Source Analytics
    const sourceRows = (this.db.prepare(`
      SELECT 
        CASE 
          WHEN source_file LIKE '%paste%' THEN 'Direct Paste / Manual Ingestion'
          WHEN job_url LIKE '%linkedin%' OR profile_url LIKE '%linkedin%' THEN 'LinkedIn ATS Export'
          WHEN source_file LIKE '%.xlsx' OR source_file LIKE '%.csv' THEN 'Spreadsheet File Import'
          ELSE 'Direct Portal Ingestion'
        END as channel,
        COUNT(*) as total,
        SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed
      FROM applicants
      WHERE company = ? ${dateFilter}
      GROUP BY channel
      ORDER BY total DESC
    `).all(...dateParams) as any[]) || [];

    const sourceAnalytics = sourceRows.map(r => ({
      channel: r.channel,
      total: r.total,
      passed: r.passed,
      passRate: r.total > 0 ? Math.round((r.passed / r.total) * 100) : 0,
    }));

    // Data Quality Panel
    const dqRow = (this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN location IS NULL OR TRIM(location) = '' OR TRIM(location) = 'United States' THEN 1 ELSE 0 END) as genericOrMissingLocation,
        SUM(CASE WHEN phone IS NULL OR TRIM(phone) = '' THEN 1 ELSE 0 END) as missingPhone,
        SUM(CASE WHEN email IS NULL OR TRIM(email) = '' THEN 1 ELSE 0 END) as missingEmail,
        SUM(CASE WHEN gender IS NULL OR UPPER(gender) = 'UNSPECIFIED' THEN 1 ELSE 0 END) as unverifiedGender,
        SUM(CASE WHEN master_person_id IS NULL OR TRIM(master_person_id) = '' THEN 1 ELSE 0 END) as unlinkedMaster
      FROM applicants
      WHERE company = ? ${dateFilter}
    `).get(...dateParams) as any) || {};

    const dqTotal = dqRow.total || 0;
    const validEmailScore = dqTotal > 0 ? Math.max(0, 100 - Math.round(((dqRow.missingEmail || 0) / dqTotal) * 100)) : 100;
    const validPhoneScore = dqTotal > 0 ? Math.max(0, 100 - Math.round(((dqRow.missingPhone || 0) / dqTotal) * 100)) : 100;
    const dataQuality = {
      totalAudited: dqTotal,
      genericOrMissingLocation: dqRow.genericOrMissingLocation || 0,
      missingPhone: dqRow.missingPhone || 0,
      missingEmail: dqRow.missingEmail || 0,
      unverifiedGender: dqRow.unverifiedGender || 0,
      unlinkedMaster: dqRow.unlinkedMaster || 0,
      healthScore: Math.round((validEmailScore + validPhoneScore) / 2),
      note: 'Data quality checks reflect record completeness and do not automatically alter screening qualification.',
    };

    // Technology Rankings
    const allSlotsFlat = technologyTree.flatMap(t => t.slots);
    const technologyRankings = {
      byVolume: [...technologyTree].sort((a, b) => b.totalApplied - a.totalApplied),
      byPassedVolume: [...technologyTree].sort((a, b) => b.passedTotal - a.passedTotal),
      byPassRate: [...technologyTree].sort((a, b) => b.passRate - a.passRate),
      byDuplicates: [...technologyTree].sort((a, b) => b.duplicates - a.duplicates),
      topSlots: [...allSlotsFlat].sort((a, b) => b.totalApplied - a.totalApplied).slice(0, 5),
    };

    // AI Recruitment Insights
    const aiInsights: string[] = [];
    if (comparison && comparison.hasPreviousData && comparison.deltas) {
      const dTotal = comparison.deltas.total;
      const pctStr = comparison.deltas.totalPct ? ` (${comparison.deltas.totalPct > 0 ? '+' : ''}${comparison.deltas.totalPct}%)` : '';
      if (dTotal > 0) {
        aiInsights.push(`Application intake expanded by +${dTotal.toLocaleString()} occurrences${pctStr} compared to the preceding period.`);
      } else if (dTotal < 0) {
        aiInsights.push(`Application volume decreased by ${Math.abs(dTotal).toLocaleString()} occurrences${pctStr} compared to the preceding period.`);
      }
    }
    if (technologyTree.length > 0) {
      const topTech = technologyTree[0];
      aiInsights.push(`${topTech.technology} represents the primary intake volume with ${topTech.totalApplied.toLocaleString()} applications (${topTech.passedTotal} passed, ${topTech.passRate}% pass rate).`);
      const highestPassTech = [...technologyTree].sort((a, b) => b.passRate - a.passRate)[0];
      if (highestPassTech && highestPassTech.technology !== topTech.technology) {
        aiInsights.push(`${highestPassTech.technology} recorded the highest screening pass rate across domains at ${highestPassTech.passRate}%.`);
      }
    }
    if (top5Locations.length > 0) {
      aiInsights.push(`Candidate talent is heavily concentrated in ${top5Locations[0].name} (${top5Locations[0].count} passed) and ${top5Locations[1]?.name || 'neighboring metropolitan hubs'}.`);
    }
    if (duplicates > 0) {
      const dupPct = total > 0 ? Math.round((duplicates / total) * 100) : 0;
      aiInsights.push(`Repeat submissions comprise ${dupPct}% (${duplicates.toLocaleString()}) of applications, quarantined automatically to maintain recruiter efficiency.`);
    }

    // Cross-Technology Analytics (Section 13)
    const crossTechnology = this.getCrossTechnologyAnalytics(company);

    return {
      timeframe: period,
      date: targetDate,
      company,
      totalApplications: total,
      passedCount: passed,
      uniquePassedCandidates,
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
      uniqueCandidatesCount,
      repeatApplicationsCount,
      transferredCount,
      contactAttemptsCount,
      comparison,
      recruiterDistribution,
      jobBreakdown,
      jobSlotDistribution: jobBreakdown,
      crossTechnology,
      dailyTrend: trendRows,
      dailyBreakdown: trendRows,
      demographics,
      geographicDistribution,
      technologyTree,
      funnel,
      sourceAnalytics,
      dataQuality,
      technologyRankings,
      aiInsights,
      availableMonths: this.getAvailableReportingMonths(company),
    };
  }

  // --- Available Reporting Months ---
  getAvailableReportingMonths(company: string = 'ClinisolTech'): Array<{ month: string; label: string; total: number }> {
    const monthsMap = new Map<string, number>();

    const appMonths = (this.db.prepare(`
      SELECT strftime('%Y-%m', application_date) as m, count(*) as c
      FROM applicants
      WHERE company = ? AND application_date IS NOT NULL AND application_date != ''
      GROUP BY m
    `).all(company) as any[]) || [];
    for (const r of appMonths) {
      if (r.m) monthsMap.set(r.m, Math.max(monthsMap.get(r.m) || 0, r.c));
    }

    const masterMonths = (this.db.prepare(`
      SELECT strftime('%Y-%m', COALESCE(application_collected_date, date_applied)) as m, count(*) as c
      FROM master_applications
      WHERE company = ? AND COALESCE(application_collected_date, date_applied) IS NOT NULL
      GROUP BY m
    `).all(company) as any[]) || [];
    for (const r of masterMonths) {
      if (r.m) monthsMap.set(r.m, Math.max(monthsMap.get(r.m) || 0, r.c));
    }

    const monthLabels: Record<string, string> = {
      '01': 'January', '02': 'February', '03': 'March', '04': 'April',
      '05': 'May', '06': 'June', '07': 'July', '08': 'August',
      '09': 'September', '10': 'October', '11': 'November', '12': 'December',
    };

    return Array.from(monthsMap.entries())
      .filter(([m]) => m && m.length === 7)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, total]) => {
        const [y, m] = month.split('-');
        const label = `${monthLabels[m] || m} ${y}`;
        return { month, label, total };
      });
  }

  // --- Fast Month Summary for Reporting & Comparison ---
  getMonthSummary(company: string = 'ClinisolTech', monthKey: string) {
    const monthLabels: Record<string, string> = {
      '01': 'January', '02': 'February', '03': 'March', '04': 'April',
      '05': 'May', '06': 'June', '07': 'July', '08': 'August',
      '09': 'September', '10': 'October', '11': 'November', '12': 'December',
    };
    const [y, m] = monthKey.split('-');
    const label = `${monthLabels[m] || m} ${y}`;

    const appStats = (this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN effective_result = 'MANUAL_REVIEW' THEN 1 ELSE 0 END) as inReview,
        SUM(CASE WHEN is_duplicate = 1 THEN 1 ELSE 0 END) as duplicates,
        COUNT(DISTINCT COALESCE(NULLIF(email, ''), NULLIF(phone, ''), full_name)) as uniqueCandidates
      FROM applicants
      WHERE company = ? AND application_date LIKE ?
    `).get(company, `${monthKey}%`) as any) || {};

    const masterStats = (this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed,
        COUNT(DISTINCT person_id) as uniqueCandidates
      FROM master_applications
      WHERE company = ? AND (application_collected_date LIKE ? OR date_applied LIKE ?)
    `).get(company, `${monthKey}%`, `${monthKey}%`) as any) || {};

    const useMaster = (appStats.total || 0) === 0 && (masterStats.total || 0) > 0;
    const total = useMaster ? masterStats.total || 0 : appStats.total || 0;
    const passed = useMaster ? masterStats.passed || 0 : appStats.passed || 0;
    const failed = useMaster ? masterStats.failed || 0 : appStats.failed || 0;
    const duplicates = useMaster ? 0 : appStats.duplicates || 0;
    const inReview = useMaster ? 0 : appStats.inReview || 0;
    const uniqueCandidates = useMaster ? masterStats.uniqueCandidates || 0 : appStats.uniqueCandidates || 0;
    const passRate = total > 0 ? Math.round((passed / total) * 100) : 0;

    // Tech breakdown
    let technologies: any[] = [];
    if (useMaster) {
      const rawMasterTech = (this.db.prepare(`
        SELECT 
          COALESCE(technology, job_title, 'General') as tech,
          COUNT(*) as total,
          SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed
        FROM master_applications
        WHERE company = ? AND (application_collected_date LIKE ? OR date_applied LIKE ?)
        GROUP BY COALESCE(technology, job_title, 'General')
      `).all(company, `${monthKey}%`, `${monthKey}%`) as any[]) || [];

      const techAgg = new Map<string, { total: number; passed: number }>();
      for (const r of rawMasterTech) {
        const cat = getTechCategory(r.tech);
        const existing = techAgg.get(cat) || { total: 0, passed: 0 };
        existing.total += r.total;
        existing.passed += r.passed;
        techAgg.set(cat, existing);
      }
      technologies = Array.from(techAgg.entries()).map(([technology, stats]) => ({
        technology,
        total: stats.total,
        passed: stats.passed,
        passRate: stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0,
      })).sort((a, b) => b.total - a.total);
    } else {
      const rawAppTech = (this.db.prepare(`
        SELECT 
          normalized_role as tech,
          job_title,
          COUNT(*) as total,
          SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as passed,
          SUM(CASE WHEN is_duplicate = 1 THEN 1 ELSE 0 END) as duplicates,
          SUM(CASE WHEN effective_result = 'FAIL' THEN 1 ELSE 0 END) as failed
        FROM applicants
        WHERE company = ? AND application_date LIKE ?
        GROUP BY normalized_role, job_title
      `).all(company, `${monthKey}%`) as any[]) || [];

      const techAgg = new Map<string, { total: number; passed: number }>();
      for (const r of rawAppTech) {
        const cat = getTechCategory(r.job_title || r.tech);
        const existing = techAgg.get(cat) || { total: 0, passed: 0 };
        existing.total += r.total;
        existing.passed += r.passed;
        techAgg.set(cat, existing);
      }
      technologies = Array.from(techAgg.entries()).map(([technology, stats]) => ({
        technology,
        total: stats.total,
        passed: stats.passed,
        passRate: stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 0,
      })).sort((a, b) => b.total - a.total);
    }

    // Detailed Demographics, Locations & Child Slots
    let maleCount = 0;
    let femaleCount = 0;
    let unspecifiedCount = 0;
    let locations: Array<{ name: string; count: number; percentage: number }> = [];
    let techSlotsTree: any[] = [];

    if (useMaster) {
      const demoRows = (this.db.prepare(`
        SELECT UPPER(COALESCE(mp.gender, 'UNSPECIFIED')) as g, COUNT(DISTINCT mp.id) as count
        FROM master_applications ma
        LEFT JOIN master_people mp ON ma.person_id = mp.id
        WHERE ma.company = ? AND ma.effective_result = 'PASS' AND (ma.application_collected_date LIKE ? OR ma.date_applied LIKE ?)
        GROUP BY UPPER(COALESCE(mp.gender, 'UNSPECIFIED'))
      `).all(company, `${monthKey}%`, `${monthKey}%`) as any[]) || [];
      for (const r of demoRows) {
        if (r.g.startsWith('M')) maleCount += r.count;
        else if (r.g.startsWith('F')) femaleCount += r.count;
        else unspecifiedCount += r.count;
      }

      const locRows = (this.db.prepare(`
        SELECT mp.location, COUNT(DISTINCT mp.id) as count
        FROM master_applications ma
        LEFT JOIN master_people mp ON ma.person_id = mp.id
        WHERE ma.company = ? AND ma.effective_result = 'PASS' AND (ma.application_collected_date LIKE ? OR ma.date_applied LIKE ?)
        GROUP BY mp.location
      `).all(company, `${monthKey}%`, `${monthKey}%`) as any[]) || [];
      const locAgg = new Map<string, number>();
      for (const r of locRows) {
        const canon = canonicalizeLocation(r.location);
        locAgg.set(canon, (locAgg.get(canon) || 0) + r.count);
      }
      locations = Array.from(locAgg.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({
        name,
        count,
        percentage: passed > 0 ? Math.round((count / passed) * 100) : 0,
      }));

      const slotRows = (this.db.prepare(`
        SELECT 
          ma.job_id,
          ma.job_title,
          UPPER(COALESCE(mp.gender, 'UNSPECIFIED')) as gender,
          ma.effective_result,
          0 as is_duplicate
        FROM master_applications ma
        LEFT JOIN master_people mp ON ma.person_id = mp.id
        WHERE ma.company = ? AND (ma.application_collected_date LIKE ? OR ma.date_applied LIKE ?)
      `).all(company, `${monthKey}%`, `${monthKey}%`) as any[]) || [];
      techSlotsTree = this.aggregateTechSlots(slotRows);
    } else {
      const demoRows = (this.db.prepare(`
        SELECT UPPER(COALESCE(mp.gender, a.gender, 'UNSPECIFIED')) as g, COUNT(DISTINCT COALESCE(NULLIF(a.email, ''), NULLIF(a.phone, ''), a.full_name)) as count
        FROM applicants a
        LEFT JOIN master_people mp ON a.master_person_id = mp.id OR a.master_person_id = mp.person_id
        WHERE a.company = ? AND a.effective_result = 'PASS' AND a.application_date LIKE ?
        GROUP BY UPPER(COALESCE(mp.gender, a.gender, 'UNSPECIFIED'))
      `).all(company, `${monthKey}%`) as any[]) || [];
      for (const r of demoRows) {
        if (r.g.startsWith('M')) maleCount += r.count;
        else if (r.g.startsWith('F')) femaleCount += r.count;
        else unspecifiedCount += r.count;
      }

      const locRows = (this.db.prepare(`
        SELECT a.location, COUNT(DISTINCT COALESCE(NULLIF(a.email, ''), NULLIF(a.phone, ''), a.full_name)) as count
        FROM applicants a
        WHERE a.company = ? AND a.effective_result = 'PASS' AND a.application_date LIKE ?
        GROUP BY a.location
      `).all(company, `${monthKey}%`) as any[]) || [];
      const locAgg = new Map<string, number>();
      for (const r of locRows) {
        const canon = canonicalizeLocation(r.location);
        locAgg.set(canon, (locAgg.get(canon) || 0) + r.count);
      }
      locations = Array.from(locAgg.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({
        name,
        count,
        percentage: passed > 0 ? Math.round((count / passed) * 100) : 0,
      }));

      const slotRows = (this.db.prepare(`
        SELECT 
          a.job_id,
          a.job_title,
          UPPER(COALESCE(mp.gender, a.gender, 'UNSPECIFIED')) as gender,
          a.effective_result,
          a.is_duplicate
        FROM applicants a
        LEFT JOIN master_people mp ON a.master_person_id = mp.id OR a.master_person_id = mp.person_id
        WHERE a.company = ? AND a.application_date LIKE ?
      `).all(company, `${monthKey}%`) as any[]) || [];
      techSlotsTree = this.aggregateTechSlots(slotRows);
    }

    const totalVerifiedGender = maleCount + femaleCount;
    const demographics = {
      maleCount,
      femaleCount,
      unspecifiedCount,
      malePct: totalVerifiedGender > 0 ? Math.round((maleCount / totalVerifiedGender) * 100) : 0,
      femalePct: totalVerifiedGender > 0 ? Math.round((femaleCount / totalVerifiedGender) * 100) : 0,
      unspecifiedPct: passed > 0 ? Math.round((unspecifiedCount / passed) * 100) : 0,
      totalVerified: totalVerifiedGender,
    };

    return {
      month: monthKey,
      label,
      total,
      passed,
      failed,
      duplicates,
      inReview,
      uniqueCandidates,
      passRate,
      demographics,
      locations,
      technologies,
      techSlotsTree,
    };
  }

  // --- Helper to aggregate Technology & Job Slot Tree ---
  private aggregateTechSlots(rows: any[]) {
    const map = new Map<string, any>();
    for (const r of rows) {
      const tech = getTechCategory(r.job_title, r.job_id);
      const slotKey = r.job_id || r.job_title || 'Unknown Requisition';
      const slotTitle = r.job_title || r.job_id;

      if (!map.has(tech)) {
        map.set(tech, {
          technology: tech,
          total: 0,
          passed: 0,
          passedMale: 0,
          passedFemale: 0,
          passedUnspecified: 0,
          duplicates: 0,
          failed: 0,
          slots: new Map<string, any>(),
        });
      }
      const t = map.get(tech)!;
      t.total++;
      if (r.is_duplicate === 1) t.duplicates++;
      if (r.effective_result === 'FAIL') t.failed++;

      if (!t.slots.has(slotKey)) {
        t.slots.set(slotKey, {
          jobId: r.job_id || 'N/A',
          jobTitle: slotTitle,
          total: 0,
          passed: 0,
          passedMale: 0,
          passedFemale: 0,
          passedUnspecified: 0,
          duplicates: 0,
          failed: 0,
        });
      }
      const s = t.slots.get(slotKey)!;
      s.total++;
      if (r.is_duplicate === 1) s.duplicates++;
      if (r.effective_result === 'FAIL') s.failed++;

      if (r.effective_result === 'PASS') {
        t.passed++;
        s.passed++;
        const g = (r.gender || '').toUpperCase();
        if (g.startsWith('M')) {
          t.passedMale++;
          s.passedMale++;
        } else if (g.startsWith('F')) {
          t.passedFemale++;
          s.passedFemale++;
        } else {
          t.passedUnspecified++;
          s.passedUnspecified++;
        }
      }
    }

    return Array.from(map.values()).map(t => {
      const slots = Array.from(t.slots.values()).map((s: any) => ({
        ...s,
        passRate: s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0,
        formattedPassed: `${s.passed} (M: ${s.passedMale} | F: ${s.passedFemale})`,
      })).sort((a: any, b: any) => b.total - a.total);
      return {
        ...t,
        passRate: t.total > 0 ? Math.round((t.passed / t.total) * 100) : 0,
        formattedPassed: `${t.passed} (M: ${t.passedMale} | F: ${t.passedFemale})`,
        slots,
      };
    }).sort((a, b) => b.total - a.total);
  }

  // --- Dedicated Month-over-Month Comparison Engine ---
  getMonthComparison(company: string = 'ClinisolTech', monthA: string = '2026-10', monthB: string = '2026-09') {
    const dataA = this.getMonthSummary(company, monthA);
    const dataB = this.getMonthSummary(company, monthB);

    const deltaTotal = dataA.total - dataB.total;
    const deltaTotalPct = dataB.total > 0 ? Math.round((deltaTotal / dataB.total) * 100) : 0;

    const deltaPassed = dataA.passed - dataB.passed;
    const deltaPassedPct = dataB.passed > 0 ? Math.round((deltaPassed / dataB.passed) * 100) : 0;

    const deltaPassRate = dataA.passRate - dataB.passRate;
    const deltaDuplicates = dataA.duplicates - dataB.duplicates;
    const deltaFailed = dataA.failed - dataB.failed;
    const deltaUniqueCandidates = dataA.uniqueCandidates - dataB.uniqueCandidates;
    const deltaMalePassed = (dataA.demographics?.maleCount || 0) - (dataB.demographics?.maleCount || 0);
    const deltaFemalePassed = (dataA.demographics?.femaleCount || 0) - (dataB.demographics?.femaleCount || 0);

    // Cross-tech comparison with child slots
    const techMap = new Map<string, any>();
    for (const t of dataA.techSlotsTree) {
      techMap.set(t.technology, {
        technology: t.technology,
        monthA: { total: t.total, passed: t.passed, passRate: t.passRate, formattedPassed: t.formattedPassed, slots: t.slots },
        monthB: { total: 0, passed: 0, passRate: 0, formattedPassed: '0 (M: 0 | F: 0)', slots: [] },
      });
    }
    for (const t of dataB.techSlotsTree) {
      if (!techMap.has(t.technology)) {
        techMap.set(t.technology, {
          technology: t.technology,
          monthA: { total: 0, passed: 0, passRate: 0, formattedPassed: '0 (M: 0 | F: 0)', slots: [] },
          monthB: { total: t.total, passed: t.passed, passRate: t.passRate, formattedPassed: t.formattedPassed, slots: t.slots },
        });
      } else {
        techMap.get(t.technology)!.monthB = { total: t.total, passed: t.passed, passRate: t.passRate, formattedPassed: t.formattedPassed, slots: t.slots };
      }
    }

    const techComparison = Array.from(techMap.values()).map(tc => {
      const dTotal = tc.monthA.total - tc.monthB.total;
      const dTotalPct = tc.monthB.total > 0 ? Math.round((dTotal / tc.monthB.total) * 100) : 0;
      const dPassed = tc.monthA.passed - tc.monthB.passed;
      return {
        technology: tc.technology,
        monthA: tc.monthA,
        monthB: tc.monthB,
        deltaTotal: dTotal,
        deltaTotalPct: dTotalPct,
        deltaPassed: dPassed,
      };
    }).sort((a, b) => b.monthA.total - a.monthA.total);

    // Locations Comparison
    const locMap = new Map<string, { monthA: number; monthB: number }>();
    for (const l of (dataA.locations || [])) {
      locMap.set(l.name, { monthA: l.count, monthB: 0 });
    }
    for (const l of (dataB.locations || [])) {
      if (!locMap.has(l.name)) locMap.set(l.name, { monthA: 0, monthB: l.count });
      else locMap.get(l.name)!.monthB = l.count;
    }
    const locationsComparison = Array.from(locMap.entries()).map(([name, counts]) => ({
      name,
      monthA: counts.monthA,
      monthB: counts.monthB,
      delta: counts.monthA - counts.monthB,
    })).sort((a, b) => b.monthA - a.monthA).slice(0, 7);

    // Multi-Month Timeline of All Available Months
    const availableMonths = this.getAvailableReportingMonths(company);
    const allMonthsTimeline = availableMonths.map((m, idx) => {
      const summary = this.getMonthSummary(company, m.month);
      const priorMonth = availableMonths[idx + 1];
      const prior = priorMonth ? this.getMonthSummary(company, priorMonth.month) : null;
      const growthVsPrior = prior && prior.total > 0 ? Math.round(((summary.total - prior.total) / prior.total) * 100) : 0;
      const passedGrowthVsPrior = prior && prior.passed > 0 ? Math.round(((summary.passed - prior.passed) / prior.passed) * 100) : 0;
      return {
        ...summary,
        growthVsPrior,
        passedGrowthVsPrior,
      };
    });

    return {
      monthA: dataA,
      monthB: dataB,
      comparison: {
        deltaTotal,
        deltaTotalPct,
        deltaPassed,
        deltaPassedPct,
        deltaPassRate,
        deltaDuplicates,
        deltaFailed,
        deltaUniqueCandidates,
        deltaMalePassed,
        deltaFemalePassed,
      },
      techComparison,
      locationsComparison,
      allMonthsTimeline,
    };
  }

  // --- Available Reporting Months ---
  getAvailableReportingMonths(company: string = 'ClinisolTech'): Array<{ month: string; label: string; total: number }> {
    const monthsMap = new Map<string, number>();

    const appMonths = (this.db.prepare(`
      SELECT strftime('%Y-%m', application_date) as m, count(*) as c
      FROM applicants
      WHERE company = ? AND application_date IS NOT NULL AND application_date != ''
      GROUP BY m
    `).all(company) as any[]) || [];
    for (const r of appMonths) {
      if (r.m) monthsMap.set(r.m, Math.max(monthsMap.get(r.m) || 0, r.c));
    }

    const masterMonths = (this.db.prepare(`
      SELECT strftime('%Y-%m', COALESCE(application_collected_date, date_applied)) as m, count(*) as c
      FROM master_applications
      WHERE company = ? AND COALESCE(application_collected_date, date_applied) IS NOT NULL
      GROUP BY m
    `).all(company) as any[]) || [];
    for (const r of masterMonths) {
      if (r.m) monthsMap.set(r.m, Math.max(monthsMap.get(r.m) || 0, r.c));
    }

    const monthLabels: Record<string, string> = {
      '01': 'January', '02': 'February', '03': 'March', '04': 'April',
      '05': 'May', '06': 'June', '07': 'July', '08': 'August',
      '09': 'September', '10': 'October', '11': 'November', '12': 'December',
    };

    return Array.from(monthsMap.entries())
      .filter(([m]) => m && m.length === 7)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, total]) => {
        const [y, m] = month.split('-');
        const label = `${monthLabels[m] || m} ${y}`;
        return { month, label, total };
      });
  }



  // --- Recruitment Report Drilldown Records Endpoint ---
  getReportDrilldownRecords(params: {
    company?: string;
    filterType?: 'all' | 'passed' | 'failed' | 'duplicates' | 'inReview' | 'location' | 'jobSlot' | 'technology';
    filterValue?: string;
    period?: 'daily' | 'weekly' | 'monthly' | 'custom' | 'all';
    dateStr?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) {
    const company = params.company || 'ClinisolTech';
    const filterType = params.filterType || 'all';
    const filterValue = params.filterValue || '';
    const period = params.period || 'all';
    const targetDate = params.dateStr || new Date().toISOString().split('T')[0];
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(5, params.pageSize || 20));
    const offset = (page - 1) * pageSize;

    const whereClauses = ['company = ?'];
    const queryParams: any[] = [company];

    if (period === 'daily') {
      whereClauses.push('application_date = ?');
      queryParams.push(targetDate);
    } else if (period === 'weekly') {
      whereClauses.push("application_date >= date(?, '-7 days') AND application_date <= ?");
      queryParams.push(targetDate, targetDate);
    } else if (period === 'monthly') {
      const monthPrefix = targetDate.slice(0, 7);
      whereClauses.push("application_date LIKE ?");
      queryParams.push(`${monthPrefix}%`);
    } else if (period === 'custom' && params.startDate && params.endDate) {
      whereClauses.push("application_date >= ? AND application_date <= ?");
      queryParams.push(params.startDate, params.endDate);
    }

    if (filterType === 'passed') {
      whereClauses.push("effective_result = 'PASS'");
    } else if (filterType === 'passed_male') {
      whereClauses.push("effective_result = 'PASS' AND UPPER(gender) LIKE 'M%'");
    } else if (filterType === 'passed_female') {
      whereClauses.push("effective_result = 'PASS' AND UPPER(gender) LIKE 'F%'");
    } else if (filterType === 'passed_unspecified') {
      whereClauses.push("effective_result = 'PASS' AND (gender IS NULL OR (UPPER(gender) NOT LIKE 'M%' AND UPPER(gender) NOT LIKE 'F%'))");
    } else if (filterType === 'failed') {
      whereClauses.push("effective_result = 'FAIL'");
    } else if (filterType === 'duplicates') {
      whereClauses.push("is_duplicate = 1");
    } else if (filterType === 'inReview') {
      whereClauses.push("effective_result = 'MANUAL_REVIEW'");
    } else if (filterType === 'jobSlot' && filterValue) {
      whereClauses.push("(job_id = ? OR job_title = ?)");
      queryParams.push(filterValue, filterValue);
    } else if (filterType === 'technology' && filterValue) {
      whereClauses.push("(normalized_role = ? OR job_title LIKE ?)");
      queryParams.push(filterValue, `%${filterValue}%`);
    } else if (filterType === 'location' && filterValue) {
      if (filterValue.toLowerCase().includes('other')) {
        // Leave generic if other
      } else {
        whereClauses.push("location LIKE ?");
        queryParams.push(`%${filterValue}%`);
      }
    }

    if (params.search && params.search.trim()) {
      whereClauses.push("(full_name LIKE ? OR email LIKE ? OR location LIKE ? OR job_title LIKE ?)");
      const s = `%${params.search.trim()}%`;
      queryParams.push(s, s, s, s);
    }

    const whereStr = whereClauses.join(' AND ');

    const countQuery = `SELECT COUNT(*) as total FROM applicants WHERE ${whereStr}`;
    const totalRow = (this.db.prepare(countQuery).get(...queryParams) as any) || {};
    let total = totalRow.total || 0;

    if (total === 0 && period === 'monthly') {
      const monthPrefix = targetDate.slice(0, 7);
      const masterWhere = ['ma.company = ?', '(ma.application_collected_date LIKE ? OR ma.date_applied LIKE ?)'];
      const masterParams: any[] = [company, `${monthPrefix}%`, `${monthPrefix}%`];

      if (filterType === 'passed') {
        masterWhere.push("ma.effective_result = 'PASS'");
      } else if (filterType === 'passed_male') {
        masterWhere.push("ma.effective_result = 'PASS' AND UPPER(mp.gender) LIKE 'M%'");
      } else if (filterType === 'passed_female') {
        masterWhere.push("ma.effective_result = 'PASS' AND UPPER(mp.gender) LIKE 'F%'");
      } else if (filterType === 'passed_unspecified') {
        masterWhere.push("ma.effective_result = 'PASS' AND (mp.gender IS NULL OR (UPPER(mp.gender) NOT LIKE 'M%' AND UPPER(mp.gender) NOT LIKE 'F%'))");
      } else if (filterType === 'failed') {
        masterWhere.push("ma.effective_result = 'FAIL'");
      } else if (filterType === 'technology' && filterValue) {
        masterWhere.push("(ma.technology LIKE ? OR ma.job_title LIKE ?)");
        masterParams.push(`%${filterValue}%`, `%${filterValue}%`);
      } else if (filterType === 'location' && filterValue && !filterValue.toLowerCase().includes('other')) {
        masterWhere.push("mp.location LIKE ?");
        masterParams.push(`%${filterValue}%`);
      }

      if (params.search && params.search.trim()) {
        masterWhere.push("(mp.full_name LIKE ? OR mp.primary_email LIKE ? OR ma.job_title LIKE ?)");
        const s = `%${params.search.trim()}%`;
        masterParams.push(s, s, s);
      }

      const masterWhereStr = masterWhere.join(' AND ');
      const masterCountRow = (this.db.prepare(`
        SELECT COUNT(*) as total 
        FROM master_applications ma 
        LEFT JOIN master_people mp ON ma.person_id = mp.id 
        WHERE ${masterWhereStr}
      `).get(...masterParams) as any) || {};

      const masterTotal = masterCountRow.total || 0;
      if (masterTotal > 0) {
        const masterRows = (this.db.prepare(`
          SELECT 
            ma.id,
            COALESCE(mp.full_name, 'Unknown') as fullName,
            mp.primary_email as email,
            mp.primary_phone as phone,
            mp.location as location,
            ma.job_id as jobId,
            ma.job_title as jobTitle,
            COALESCE(ma.application_collected_date, ma.date_applied) as applicationDate,
            ma.effective_result as effectiveResult,
            0 as isDuplicate,
            ma.person_id as masterPersonId,
            mp.gender
          FROM master_applications ma
          LEFT JOIN master_people mp ON ma.person_id = mp.id
          WHERE ${masterWhereStr}
          ORDER BY applicationDate DESC, ma.id DESC
          LIMIT ? OFFSET ?
        `).all(...masterParams, pageSize, offset) as any[]) || [];

        return { total: masterTotal, page, pageSize, records: masterRows };
      }
    }

    const selectQuery = `
      SELECT 
        id,
        full_name as fullName,
        email,
        phone,
        location,
        job_id as jobId,
        job_title as jobTitle,
        application_date as applicationDate,
        effective_result as effectiveResult,
        is_duplicate as isDuplicate,
        master_person_id as masterPersonId,
        gender
      FROM applicants
      WHERE ${whereStr}
      ORDER BY application_date DESC, id DESC
      LIMIT ? OFFSET ?
    `;
    const records = (this.db.prepare(selectQuery).all(...queryParams, pageSize, offset) as any[]) || [];

    return { total, page, pageSize, records };
  }

  // --- Cross-Technology Analytics (Section 13) ---
  getCrossTechnologyAnalytics(company: 'AaraTech' | 'ClinisolTech' = 'AaraTech'): {
    multiTechCandidates: any[];
    totalMultiTechCount: number;
    technologyPairs: { pair: string; count: number }[];
  } {
    const candidates = this.db.prepare(`
      SELECT 
        p.id,
        p.person_id,
        p.full_name,
        p.primary_email,
        p.primary_phone,
        p.location,
        p.current_title,
        p.current_owner,
        COUNT(DISTINCT ma.job_title) as tech_count,
        GROUP_CONCAT(DISTINCT ma.job_title) as technologies,
        COUNT(ma.id) as total_applications
      FROM master_people p
      JOIN master_applications ma ON (ma.person_id = p.id OR ma.person_id = p.person_id)
      WHERE p.company = ? AND ma.job_title IS NOT NULL AND TRIM(ma.job_title) != ''
      GROUP BY p.id
      HAVING COUNT(DISTINCT ma.job_title) > 1
      ORDER BY tech_count DESC, total_applications DESC
      LIMIT 100
    `).all(company) as any[];

    const pairCounts = new Map<string, number>();
    for (const c of candidates) {
      if (c.technologies) {
        const techs = c.technologies.split(',').map((t: string) => t.trim()).filter(Boolean).sort();
        for (let i = 0; i < techs.length; i++) {
          for (let j = i + 1; j < techs.length; j++) {
            const pairKey = `${techs[i]} ↔ ${techs[j]}`;
            pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
          }
        }
      }
    }

    const technologyPairs = Array.from(pairCounts.entries())
      .map(([pair, count]) => ({ pair, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      multiTechCandidates: candidates.map(c => ({
        ...c,
        technologiesList: c.technologies ? c.technologies.split(',').map((t: string) => t.trim()) : [],
      })),
      totalMultiTechCount: candidates.length,
      technologyPairs,
    };
  }

  // --- Tab Badge Counts Query (Fast, exact breakdown for any filtered scope) ---
  getApplicantTabCounts(filters: {
    company?: string;
    batchId?: string;
    viewMode?: 'working_batch' | 'permanent_history';
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
  }): { pass: number; allPassed: number; fail: number; review: number; duplicate: number; all: number; uniquePassed: number } {
    const { whereClause, values } = this.buildApplicantWhereClause({
      page: 1,
      pageSize: 1,
      company: filters.company,
      batchId: filters.batchId,
      viewMode: filters.viewMode,
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
        SUM(CASE WHEN effective_result = 'PASS' AND (is_duplicate = 0 OR is_duplicate IS NULL) THEN 1 ELSE 0 END) as passed,
        SUM(CASE WHEN effective_result = 'PASS' THEN 1 ELSE 0 END) as allPassed,
        SUM(CASE WHEN effective_result = 'FAIL' AND (is_duplicate = 0 OR is_duplicate IS NULL) THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN (effective_result = 'MANUAL_REVIEW' OR effective_result = 'ERROR') AND (is_duplicate = 0 OR is_duplicate IS NULL) THEN 1 ELSE 0 END) as manualReview,
        SUM(CASE WHEN is_duplicate = 1 THEN 1 ELSE 0 END) as duplicates
      FROM applicants
      ${whereClause}
    `;

    const row = this.db.prepare(sql).get(...values) as any;

    const passCount = Number(row?.passed || 0);
    const allPassedCount = Number(row?.allPassed || 0);
    const failCount = Number(row?.failed || 0);
    const reviewCount = Number(row?.manualReview || 0);
    const duplicateCount = Number(row?.duplicates || 0);
    const totalCount = Number(row?.total || 0);

    return {
      pass: passCount,
      allPassed: allPassedCount,
      fail: failCount,
      review: reviewCount,
      duplicate: duplicateCount,
      all: totalCount,
      uniquePassed: passCount,
    };
  }

  getApplicantCountsByStatus(filters: {
    company?: string;
    batchId?: string;
    importId?: string;
    applicationDate?: string;
  }): { pass: number; fail: number; review: number; duplicate: number; all: number; total: number; uniquePassed: number; allPassed: number } {
    const counts = this.getApplicantTabCounts({
      company: filters.company,
      batchId: filters.batchId || filters.importId,
      applicationDate: filters.applicationDate,
    });
    return {
      pass: counts.pass,
      fail: counts.fail,
      review: counts.review,
      duplicate: counts.duplicate,
      all: counts.all,
      total: counts.all,
      uniquePassed: counts.uniquePassed,
      allPassed: counts.allPassed,
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
    search?: string;
    role?: string;
    uniqueOnly?: boolean;
    onlyNewCandidates?: boolean;
  }): Applicant[] {
    const conditions: string[] = [];
    const values: any[] = [];

    if (filters.company && filters.company !== 'All' && filters.company !== 'Both') {
      conditions.push('company = ?');
      values.push(filters.company);
    }
    if (filters.status && filters.status !== 'ALL') {
      if (filters.status === 'ALL_PASSED' || filters.status === 'PASS_ALL') {
        conditions.push("effective_result = 'PASS'");
      } else if (filters.status === 'UNIQUE_PASSED') {
        conditions.push("effective_result = 'PASS'");
        conditions.push('(is_duplicate = 0 OR is_duplicate IS NULL)');

        const compVal = (filters.company === 'AaraTech' || filters.company === 'ClinisolTech') ? filters.company : 'ClinisolTech';
        conditions.push(`(
          (transfer_status = 'Transferred' AND id IN (
            SELECT screening_applicant_id FROM master_transfers WHERE duplicate_check_result = 'NEW CANDIDATE + NEW APPLICATION'
          ))
          OR
          ((transfer_status IS NULL OR transfer_status != 'Transferred') AND (
            (email IS NULL OR email = '' OR email NOT IN (
              SELECT primary_email FROM master_people WHERE company = ? AND primary_email IS NOT NULL AND primary_email != ''
            ))
            AND (
              phone IS NULL OR phone = '' OR SUBSTR(REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '+', ''), -10) NOT IN (
                SELECT SUBSTR(REPLACE(REPLACE(REPLACE(primary_phone, '-', ''), ' ', ''), '+', ''), -10) FROM master_people WHERE company = ? AND primary_phone IS NOT NULL AND primary_phone != ''
              )
            )
          ))
        )`);
        values.push(compVal, compVal);

        let subWhere = "company = ? AND effective_result = 'PASS'";
        let subValues: any[] = [compVal];
        if (filters.applicationDate && filters.applicationDate !== 'ALL') {
          subWhere += ' AND application_date = ?';
          subValues.push(filters.applicationDate);
        }
        if (filters.importId && filters.importId !== 'ALL') {
          subWhere += ' AND (import_id = ? OR batch_id = ?)';
          subValues.push(filters.importId, filters.importId);
        }

        conditions.push(`id IN (
          SELECT MIN(a_inner.id)
          FROM applicants a_inner
          WHERE ${subWhere}
          GROUP BY COALESCE(NULLIF(LOWER(TRIM(a_inner.email)), ''), SUBSTR(REPLACE(REPLACE(REPLACE(a_inner.phone, '-', ''), ' ', ''), '+', ''), -10), LOWER(TRIM(a_inner.full_name)))
        )`);
        values.push(...subValues);
      } else {
        conditions.push('effective_result = ?');
        values.push(filters.status);
      }
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

    if (filters.uniqueOnly || filters.onlyNewCandidates) {
      conditions.push('(is_duplicate = 0 OR is_duplicate IS NULL)');
    }

    if (filters.onlyNewCandidates && filters.status !== 'UNIQUE_PASSED' && filters.company && filters.company !== 'All' && filters.company !== 'Both') {
      conditions.push(`(
        (transfer_status = 'Transferred' AND id IN (
          SELECT screening_applicant_id FROM master_transfers WHERE duplicate_check_result = 'NEW CANDIDATE + NEW APPLICATION'
        ))
        OR
        ((transfer_status IS NULL OR transfer_status != 'Transferred') AND (
          (email IS NULL OR email = '' OR email NOT IN (
            SELECT primary_email FROM master_people WHERE company = ? AND primary_email IS NOT NULL AND primary_email != ''
          ))
          AND (
            phone IS NULL OR phone = '' OR SUBSTR(REPLACE(REPLACE(REPLACE(phone, '-', ''), ' ', ''), '+', ''), -10) NOT IN (
              SELECT SUBSTR(REPLACE(REPLACE(REPLACE(primary_phone, '-', ''), ' ', ''), '+', ''), -10) FROM master_people WHERE company = ? AND primary_phone IS NOT NULL AND primary_phone != ''
            )
          )
        ))
      )`);
      values.push(filters.company, filters.company);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const stmt = this.db.prepare(`SELECT * FROM applicants ${whereClause} ORDER BY source_file, source_row_number`);
    const rows = stmt.all(...values) as any[];
    let applicants = rows.map(r => this.mapRowToApplicant(r));

    if (filters.uniqueOnly || filters.onlyNewCandidates) {
      const seenEmails = new Set<string>();
      const seenPhones = new Set<string>();
      const seenNames = new Set<string>();
      applicants = applicants.filter(a => {
        if (a.isDuplicate) return false;
        const normEmail = (a.email || '').trim().toLowerCase();
        const normPhone = (a.phone || '').replace(/\D/g, '');
        const normName = (a.fullName || '').trim().toLowerCase();

        if (normEmail && normEmail.includes('@') && !['unknown', 'n/a', 'none', 'no email'].includes(normEmail)) {
          if (seenEmails.has(normEmail)) return false;
          seenEmails.add(normEmail);
        }
        if (normPhone && normPhone.length >= 7) {
          const pKey = normPhone.slice(-10);
          if (seenPhones.has(pKey)) return false;
          seenPhones.add(pKey);
        }
        if (!normEmail && !normPhone && normName) {
          const nKey = `${normName}:${a.jobTitle || ''}`;
          if (seenNames.has(nKey)) return false;
          seenNames.add(nKey);
        }
        return true;
      });
    }

    return applicants;
  }

  private mapRowToApplicant(r: any): Applicant {
    let rawRowData = {};
    try {
      if (r.raw_row_json) rawRowData = JSON.parse(r.raw_row_json);
    } catch { }

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

  getMasterCandidateTechnologies(company?: string): string[] {
    const params: any[] = [];
    const hasCompany = Boolean(company && company !== 'All' && company !== 'Both');
    const companyWhereClause = hasCompany ? 'WHERE company = ? AND' : 'WHERE';
    if (hasCompany) {
      params.push(company);
    }

    const appTitles = this.db.prepare(`
      SELECT DISTINCT job_title as title
      FROM master_applications
      ${companyWhereClause} job_title IS NOT NULL AND TRIM(job_title) != ''
    `).all(...params) as any[];

    const peopleTitles = this.db.prepare(`
      SELECT DISTINCT current_title as title
      FROM master_people
      ${companyWhereClause} current_title IS NOT NULL AND TRIM(current_title) != ''
    `).all(...params) as any[];

    const applicantTitles = this.db.prepare(`
      SELECT DISTINCT job_title as title
      FROM applicants
      ${companyWhereClause} job_title IS NOT NULL AND TRIM(job_title) != ''
    `).all(...params) as any[];

    const titlesSet = new Set<string>();
    for (const r of [...appTitles, ...peopleTitles, ...applicantTitles]) {
      if (r.title && typeof r.title === 'string') {
        const clean = r.title.trim();
        if (clean && clean !== 'N/A' && clean !== 'Position') {
          titlesSet.add(clean);
        }
      }
    }
    return Array.from(titlesSet).sort();
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
    technology?: string;
    repeatFilter?: string;
    h1bStatus?: string;
    greenCard?: string;
    hasResume?: boolean;
    hasLinkedIn?: boolean;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): { candidates: any[]; totalCount: number } {
    const opts = typeof params === 'string' ? { company: params } : (params || {});
    const page = Math.max(1, Number(opts.page) || 1);
    const pageSize = Math.min(10000, Math.max(1, Number(opts.pageSize) || 50));
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
      if (opts.gender.toUpperCase() === 'UNSPECIFIED') {
        conditions.push("(p.gender IS NULL OR p.gender = '' OR UPPER(p.gender) = 'UNSPECIFIED')");
      } else {
        conditions.push("UPPER(p.gender) = UPPER(?)");
        values.push(opts.gender);
      }
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

    // Technology / Role Filter (Section 12)
    if (opts.technology && opts.technology !== 'All') {
      conditions.push(`(
        p.current_title LIKE ? OR
        EXISTS (
          SELECT 1 FROM master_applications ma
          WHERE (ma.person_id = p.id OR ma.person_id = p.person_id)
            AND (ma.job_title LIKE ? OR ma.technology LIKE ?)
        ) OR
        EXISTS (
          SELECT 1 FROM applicants a
          WHERE a.master_person_id = p.id
            AND a.job_title LIKE ?
        )
      )`);
      const techPattern = `%${opts.technology.trim()}%`;
      values.push(techPattern, techPattern, techPattern, techPattern);
    }

    // Repeat Applicant Filter (Section 12 & 19)
    if (opts.repeatFilter === 'repeat_only') {
      conditions.push(`(
        (SELECT COUNT(*) FROM master_applications ma WHERE ma.person_id = p.id OR ma.person_id = p.person_id) > 1 OR
        (SELECT COUNT(*) FROM applicants a WHERE a.master_person_id = p.id) > 1
      )`);
    } else if (opts.repeatFilter === 'first_time_only') {
      conditions.push(`(
        (SELECT COUNT(*) FROM master_applications ma WHERE ma.person_id = p.id OR ma.person_id = p.person_id) <= 1 AND
        (SELECT COUNT(*) FROM applicants a WHERE a.master_person_id = p.id) <= 1
      )`);
    }

    // H1B Sponsorship Filter (Section 12)
    if (opts.h1bStatus === 'No') {
      conditions.push(`(LOWER(p.h1b_status) LIKE '%no%' OR p.h1b_status = '0')`);
    } else if (opts.h1bStatus === 'Yes') {
      conditions.push(`(LOWER(p.h1b_status) LIKE '%yes%' OR p.h1b_status = '1')`);
    }

    // Green Card / US-C Filter (Section 12)
    if (opts.greenCard === 'Yes') {
      conditions.push(`(LOWER(p.green_card) LIKE '%yes%' OR LOWER(p.green_card) LIKE '%usc%' OR LOWER(p.green_card) LIKE '%gc%' OR p.green_card = '1')`);
    } else if (opts.greenCard === 'No') {
      conditions.push(`(LOWER(p.green_card) LIKE '%no%' OR p.green_card = '0')`);
    }

    // Has Resume Filter
    if (opts.hasResume) {
      conditions.push(`(p.resume_url IS NOT NULL AND TRIM(p.resume_url) != '')`);
    }

    // Has LinkedIn Filter
    if (opts.hasLinkedIn) {
      conditions.push(`(p.linkedin_url IS NOT NULL AND TRIM(p.linkedin_url) != '')`);
    }

    // Date Range Filter (Applied Date, Collected Date, or Created Date)
    if (opts.dateFrom) {
      conditions.push(`(
        EXISTS (SELECT 1 FROM master_applications ma WHERE (ma.person_id = p.id OR ma.person_id = p.person_id) AND ma.date_applied >= ?) OR
        substr(p.created_at, 1, 10) >= ? OR
        p.application_collected_date >= ?
      )`);
      values.push(opts.dateFrom, opts.dateFrom, opts.dateFrom);
    }
    if (opts.dateTo) {
      conditions.push(`(
        EXISTS (SELECT 1 FROM master_applications ma WHERE (ma.person_id = p.id OR ma.person_id = p.person_id) AND ma.date_applied <= ?) OR
        substr(p.created_at, 1, 10) <= ? OR
        p.application_collected_date <= ?
      )`);
      values.push(opts.dateTo, opts.dateTo, opts.dateTo);
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
      } catch { }

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
        additional_feedback: rc.additional_feedback || null,
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

    const firstAssigned = [...assignments].sort((a, b) => (a.assigned_date || '').localeCompare(b.assigned_date || ''))[0]?.recruiter_name || p.first_assigned_recruiter || authoritativeOwner;
    const firstContacted = [...contacts].sort((a, b) => (a.contact_date || '').localeCompare(b.contact_date || ''))[0]?.recruiter_name || p.first_confirmed_contacted_by || null;
    const lastContacted = contacts[0]?.recruiter_name || p.last_contacted_by || null;
    const latestOutcome = contacts[0]?.outcome || p.latest_contact_outcome || null;
    const lastAssignDate = activeAssign?.assigned_date || p.last_assignment_date || p.recruiter_assigned_date || null;
    const lastContactDate = contacts[0]?.contact_date || p.last_contact_date || null;

    let unclassLinks: string[] = [];
    try {
      if (p.unclassified_links) {
        unclassLinks = typeof p.unclassified_links === 'string' ? JSON.parse(p.unclassified_links) : p.unclassified_links;
      }
    } catch { }

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
      try { this.db.exec('ROLLBACK'); } catch { }
      throw err;
    }

    return this.getMasterCandidateById(person.id);
  }

  addMasterContactAttempt(personId: string, data: { recruiter_name: string; contact_method?: string; outcome?: string; feedback_1?: string; feedback_2?: string; additional_feedback?: string; notes?: string; contact_date?: string; next_follow_up?: string; source_file?: string }, user = 'Recruiter Admin'): any | null {
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
          contact_method, outcome, feedback_1, feedback_2, additional_feedback, next_follow_up, raw_feedback, source_file, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        data.additional_feedback || null,
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
      try { this.db.exec('ROLLBACK'); } catch { }
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
        } catch { }
      }
    }

    if (updates.current_owner !== undefined && updates.current_owner !== null) {
      setClauses.push('current_owner = ?');
      values.push(updates.current_owner);
    }

    if (updates.gender !== undefined && updates.gender !== null) {
      setClauses.push('gender = ?');
      values.push(updates.gender);
      try {
        const normGender = String(updates.gender).toUpperCase().trim();
        this.db.prepare('UPDATE applicants SET gender = ? WHERE master_person_id = ? OR (company = ? AND email = ?)').run(normGender, person.id, person.company, person.primary_email);
      } catch { }
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
    totalPeople: number;
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
      totalPeople: candRow?.c || 0,
      linkedApplications: linkedApps,
      totalLinkedApplications: linkedApps,
      incompleteCount: incRow?.c || 0,
      byCompany: {
        AaraTech: aaraCand,
        ClinisolTech: cliniCand,
      },
    };
  }

  clearAllMasterData(company: 'AaraTech' | 'ClinisolTech', user = 'Recruiter Admin') {
    if (!company || (company !== 'AaraTech' && company !== 'ClinisolTech')) {
      throw new Error(`Strict Company Isolation Violation: Company must be explicitly 'AaraTech' or 'ClinisolTech' (received: ${company}). Global multi-company wipe is strictly forbidden.`);
    }

    this.db.exec('BEGIN TRANSACTION');
    try {
      // Strict Company Isolation: Delete ONLY records for the selected company.
      // The other company (e.g. ClinisolTech when clearing AaraTech) remains 100% UNTOUCHED and preserved!
      this.db.prepare('DELETE FROM master_recruiter_contacts WHERE person_id IN (SELECT id FROM master_people WHERE LOWER(company) = LOWER(?))').run(company);
      this.db.prepare('DELETE FROM master_recruiter_assignments WHERE person_id IN (SELECT id FROM master_people WHERE LOWER(company) = LOWER(?))').run(company);
      this.db.prepare('DELETE FROM master_possible_matches WHERE LOWER(company) = LOWER(?)').run(company);
      this.db.prepare('DELETE FROM master_status_history WHERE person_id IN (SELECT id FROM master_people WHERE LOWER(company) = LOWER(?))').run(company);
      this.db.prepare('DELETE FROM master_applications WHERE LOWER(company) = LOWER(?) OR person_id IN (SELECT id FROM master_people WHERE LOWER(company) = LOWER(?))').run(company, company);
      this.db.prepare('DELETE FROM master_person_emails WHERE person_id IN (SELECT id FROM master_people WHERE LOWER(company) = LOWER(?))').run(company);
      this.db.prepare('DELETE FROM master_person_phones WHERE person_id IN (SELECT id FROM master_people WHERE LOWER(company) = LOWER(?))').run(company);
      this.db.prepare('DELETE FROM incomplete_records WHERE LOWER(company) = LOWER(?)').run(company);
      this.db.prepare('DELETE FROM master_transfers WHERE LOWER(company) = LOWER(?)').run(company);
      this.db.prepare('DELETE FROM master_import_batches WHERE job_id IN (SELECT id FROM master_import_jobs WHERE LOWER(company) = LOWER(?))').run(company);
      this.db.prepare('DELETE FROM master_import_jobs WHERE LOWER(company) = LOWER(?)').run(company);
      this.db.prepare('DELETE FROM master_import_ledger WHERE LOWER(company) = LOWER(?)').run(company);
      this.db.prepare("UPDATE applicants SET transfer_status = 'Not Transferred', transferred_at = NULL, master_person_id = NULL WHERE LOWER(company) = LOWER(?)").run(company);
      this.db.prepare('DELETE FROM master_people WHERE LOWER(company) = LOWER(?)').run(company);
      this.db.exec('COMMIT');
    } catch (err) {
      try { this.db.exec('ROLLBACK'); } catch { }
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

  runInTransactionWithRetry<T>(fn: () => T, maxRetries = 5, initialDelayMs = 50): T {
    let attempt = 0;
    while (attempt < maxRetries) {
      attempt++;
      try {
        this.db.exec('BEGIN IMMEDIATE TRANSACTION');
        try {
          const result = fn();
          this.db.exec('COMMIT');
          return result;
        } catch (innerErr) {
          try { this.db.exec('ROLLBACK'); } catch { }
          throw innerErr;
        }
      } catch (err: any) {
        const msg = String(err?.message || '').toLowerCase();
        const isBusyOrLocked = err?.code === 'ERR_SQLITE_ERROR' && (
          err?.errcode === 5 ||
          err?.errcode === 261 ||
          msg.includes('locked') ||
          msg.includes('busy')
        );
        if (isBusyOrLocked && attempt < maxRetries) {
          const backoff = initialDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 20);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, backoff);
          continue;
        }
        throw err;
      }
    }
    throw new Error('Transaction failed after maximum retries');
  }

  isCompatibleCandidateName(nameA?: string | null, nameB?: string | null): boolean {
    if (!nameA || !nameB) return true;
    const a = nameA.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const b = nameB.trim().toLowerCase().replace(/[^a-z0-9\s]/g, '');
    if (!a || !b) return true;
    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;
    const tokensA = a.split(/\s+/).filter(t => t.length > 1);
    const tokensB = b.split(/\s+/).filter(t => t.length > 1);
    const shared = tokensA.filter(t => tokensB.includes(t));
    if (shared.length > 0) return true;
    const placeholders = ['candidate', 'unknown', 'yes', 'no', 'na', 'n/a', 'none'];
    if (placeholders.includes(a) || placeholders.includes(b)) return true;
    return false;
  }

  createMasterImportJob(job: { id: string; company: string; sourceFile?: string; sheetName?: string; totalRows?: number }): any {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO master_import_jobs (
        id, company, source_file, sheet_name, total_rows, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'Processing', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        company = excluded.company,
        source_file = COALESCE(excluded.source_file, master_import_jobs.source_file),
        sheet_name = COALESCE(excluded.sheet_name, master_import_jobs.sheet_name),
        total_rows = excluded.total_rows,
        status = 'Processing',
        updated_at = excluded.updated_at
    `).run(job.id, job.company, job.sourceFile || null, job.sheetName || 'Sheet1', job.totalRows || 0, now, now);
    return this.getMasterImportJob(job.id);
  }

  getMasterImportJob(jobId: string): any {
    const job = this.db.prepare('SELECT * FROM master_import_jobs WHERE id = ?').get(jobId) as any;
    if (!job) return null;
    const batches = this.db.prepare('SELECT * FROM master_import_batches WHERE job_id = ? ORDER BY batch_number ASC').all(jobId);
    return { ...job, batches };
  }

  updateMasterImportJob(jobId: string, updates: any): any {
    const existing = this.getMasterImportJob(jobId);
    if (!existing) return null;
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE master_import_jobs SET
        processed_rows = COALESCE(?, processed_rows),
        successful_rows = COALESCE(?, successful_rows),
        failed_rows = COALESCE(?, failed_rows),
        new_candidates = COALESCE(?, new_candidates),
        matched_candidates = COALESCE(?, matched_candidates),
        new_applications = COALESCE(?, new_applications),
        matched_applications = COALESCE(?, matched_applications),
        duplicate_applications = COALESCE(?, duplicate_applications),
        status = COALESCE(?, status),
        error_summary = COALESCE(?, error_summary),
        completed_at = COALESCE(?, completed_at),
        updated_at = ?
      WHERE id = ?
    `).run(
      updates.processed_rows !== undefined ? updates.processed_rows : null,
      updates.successful_rows !== undefined ? updates.successful_rows : null,
      updates.failed_rows !== undefined ? updates.failed_rows : null,
      updates.new_candidates !== undefined ? updates.new_candidates : null,
      updates.matched_candidates !== undefined ? updates.matched_candidates : null,
      updates.new_applications !== undefined ? updates.new_applications : null,
      updates.matched_applications !== undefined ? updates.matched_applications : null,
      updates.duplicate_applications !== undefined ? updates.duplicate_applications : null,
      updates.status || null,
      updates.error_summary || null,
      updates.completed_at || null,
      now,
      jobId
    );
    return this.getMasterImportJob(jobId);
  }

  getMasterImportJobs(company?: string): any[] {
    if (company) {
      return this.db.prepare('SELECT * FROM master_import_jobs WHERE company = ? ORDER BY created_at DESC').all(company);
    }
    return this.db.prepare('SELECT * FROM master_import_jobs ORDER BY created_at DESC').all();
  }

  getMasterImportResumeInfo(jobId: string): any {
    const job = this.db.prepare('SELECT * FROM master_import_jobs WHERE id = ?').get(jobId) as any;
    if (!job) return null;
    const batches = this.db.prepare('SELECT * FROM master_import_batches WHERE job_id = ? AND status = ? ORDER BY batch_number ASC').all(jobId, 'Completed') as any[];
    const maxRowResult = this.db.prepare('SELECT MAX(end_row) as max_row FROM master_import_batches WHERE job_id = ? AND status = ?').get(jobId, 'Completed') as any;
    const maxRow = maxRowResult?.max_row || 0;
    return {
      jobId: job.id,
      company: job.company,
      totalRows: job.total_rows,
      processedRows: job.processed_rows,
      successfulRows: job.successful_rows,
      failedRows: job.failed_rows,
      status: job.status,
      completedBatches: batches.map(b => b.batch_number),
      maxCompletedRow: maxRow,
      nextPendingRow: maxRow + 1,
    };
  }

  getMasterImportErrors(jobId: string): any[] {
    return this.db.prepare("SELECT * FROM master_import_ledger WHERE job_id = ? AND status = 'Failed' ORDER BY row_number ASC").all(jobId);
  }

  completeMasterImportJob(jobId: string, status = 'Completed', errorSummary?: string): any {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE master_import_jobs SET
        status = ?,
        error_summary = COALESCE(?, error_summary),
        completed_at = ?,
        updated_at = ?
      WHERE id = ?
    `).run(status, errorSummary || null, now, now, jobId);
    return this.getMasterImportJob(jobId);
  }

  upsertMasterCandidatesBatch(
    people: any[],
    importRecord?: any,
    options?: { jobId?: string; batchNumber?: number; startRow?: number; endRow?: number }
  ): { success: boolean; count: number; upserted?: number; failed?: number; errors?: any[]; peopleIds?: string[] } {
    if (!people || people.length === 0) return { success: true, count: 0, upserted: 0, failed: 0, errors: [], peopleIds: [] };

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
        id, person_id, applicant_id, company, job_id, job_title, normalized_role, source_row_number, date_applied,
        application_collected_date, recruiter_assigned_date, green_card, h1b_status,
        current_stage, effective_result, source_file, resume_link, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        resume_link = COALESCE(excluded.resume_link, master_applications.resume_link),
        application_collected_date = COALESCE(excluded.application_collected_date, master_applications.application_collected_date),
        recruiter_assigned_date = COALESCE(excluded.recruiter_assigned_date, master_applications.recruiter_assigned_date),
        green_card = COALESCE(excluded.green_card, master_applications.green_card),
        h1b_status = COALESCE(excluded.h1b_status, master_applications.h1b_status),
        job_title = excluded.job_title
    `);

    const findExistingAppStmt = this.db.prepare(`
      SELECT id, resume_link, current_stage, application_collected_date, recruiter_assigned_date, green_card, h1b_status, date_applied
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
        contact_method, outcome, feedback_1, feedback_2, additional_feedback, raw_feedback, source_file, application_id, source_row_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    const insertLedgerStmt = this.db.prepare(`
      INSERT INTO master_import_ledger (
        id, job_id, import_id, source_file, sheet_name, row_number, company,
        normalized_identity, raw_name, raw_email, raw_phone, raw_role,
        status, person_id, application_id, error_details, processed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company, source_file, sheet_name, row_number) DO UPDATE SET
        job_id = COALESCE(excluded.job_id, master_import_ledger.job_id),
        status = excluded.status,
        person_id = excluded.person_id,
        application_id = excluded.application_id,
        error_details = excluded.error_details,
        processed_at = excluded.processed_at
    `);

    return this.runInTransactionWithRetry(() => {
      // Pre-load in-memory index ONCE before the loop for blazing-fast O(1) candidate resolution:
      const allExisting = this.db.prepare('SELECT id, person_id, full_name, company, primary_email, primary_phone FROM master_people').all() as any[];
      const emailMap = new Map<string, any>();
      const phoneMap = new Map<string, any>();
      const existingPersonIds = new Set<string>();
      const personIdToIdMap = new Map<string, string>();
      const idMap = new Map<string, any>();
      for (const row of allExisting) {
        if (row.id) idMap.set(row.id, row);
        if (row.person_id) {
          existingPersonIds.add(row.person_id);
          personIdToIdMap.set(row.person_id, row.id);
        }
        if (row.primary_email) emailMap.set(`${row.company}:${row.primary_email.trim().toLowerCase()}`, row);
        if (row.primary_phone) {
          const d = row.primary_phone.replace(/\D/g, '');
          if (d.length >= 7) phoneMap.set(`${row.company}:${d.slice(-10)}`, row);
        }
      }

      // Pre-calculate next Person ID counter ONCE based on all existing P- IDs:
      let nextNum = 1;
      for (const pid of existingPersonIds) {
        const match = pid.match(/P-(\d+)/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (n >= nextNum) nextNum = n + 1;
        }
      }

      let upsertedCount = 0;
      let failedCount = 0;
      let newCandidatesCount = 0;
      let matchedCandidatesCount = 0;
      let newApplicationsCount = 0;
      let duplicateApplicationsCount = 0;
      const rowErrors: any[] = [];
      const peopleIds: string[] = [];

      // Ensure master_import_jobs parent record exists before batch insertion to avoid FOREIGN KEY failure
      const defaultComp = people[0]?.company || (people[0]?.current_company === 'ClinisolTech' ? 'ClinisolTech' : 'AaraTech');
      let jobInfo: any = null;
      if (options?.jobId) {
        jobInfo = this.db.prepare('SELECT id, source_file, sheet_name FROM master_import_jobs WHERE id = ?').get(options.jobId);
        if (!jobInfo) {
          const nowIso = new Date().toISOString();
          this.db.prepare(`
            INSERT INTO master_import_jobs (
              id, company, source_file, sheet_name, total_rows, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'Processing', ?, ?)
          `).run(
            options.jobId,
            defaultComp,
            importRecord?.file_name || (options as any)?.sourceFile || 'pasted_leads.xlsx',
            importRecord?.sheet_name || (options as any)?.sheetName || 'Pasted_Leads',
            options.endRow || people.length,
            nowIso,
            nowIso
          );
          jobInfo = {
            id: options.jobId,
            source_file: importRecord?.file_name || (options as any)?.sourceFile || 'pasted_leads.xlsx',
            sheet_name: importRecord?.sheet_name || (options as any)?.sheetName || 'Pasted_Leads'
          };
        }
      }

      for (const p of people) {
        const comp = p.company || (p.current_company === 'ClinisolTech' ? 'ClinisolTech' : 'AaraTech');
        const now = p.created_at || new Date().toISOString();
        const startOffset = options?.startRow ? (options.startRow - 1) : 0;
        const srcRow = p.source_row || p.source_row_number || (p.applications && p.applications[0]?.source_row) || (startOffset + people.indexOf(p) + 1);
        const impId = (importRecord && importRecord.id) || p.source_import_id || options?.jobId || 'manual-import';
        const jobId = options?.jobId || null;
        const srcFile = (importRecord && importRecord.file_name) || (options as any)?.sourceFile || jobInfo?.source_file || (p.applications && p.applications[0]?.source_file) || p.source_file || 'pasted_leads.xlsx';
        const srcSheet = (importRecord && importRecord.sheet_name) || (options as any)?.sheetName || jobInfo?.sheet_name || (p.applications && p.applications[0]?.source_sheet) || p.source_sheet || 'Pasted_Leads';
        const normIdent = p.primary_email ? p.primary_email.trim().toLowerCase() : (p.primary_phone ? p.primary_phone.replace(/\D/g, '').slice(-10) : (p.full_name || `row-${srcRow}`));

        this.db.exec('SAVEPOINT row_sp');
        try {
          // 1. Resolve or generate candidate ID and person_id
          let existingCandidate: any = null;
          if (p.id && idMap.has(p.id)) {
            existingCandidate = idMap.get(p.id);
          }
          if (!existingCandidate && p.primary_email) {
            existingCandidate = emailMap.get(`${comp}:${p.primary_email.trim().toLowerCase()}`);
          }
          if (!existingCandidate && p.primary_phone) {
            const digits = p.primary_phone.replace(/\D/g, '');
            if (digits.length >= 7) {
              const phoneMatch = phoneMap.get(`${comp}:${digits.slice(-10)}`);
              // Safe Duplicate Identity Matching: Only match on phone if candidate names are compatible
              if (phoneMatch && this.isCompatibleCandidateName(p.full_name, phoneMatch.full_name)) {
                existingCandidate = phoneMatch;
              }
            }
          }

          if (existingCandidate) {
            p.id = existingCandidate.id;
            p.person_id = existingCandidate.person_id;
            matchedCandidatesCount++;
          } else {
            p.id = p.id || `mp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            // Check if p.person_id is missing, or is already taken by a DIFFERENT candidate in master_people
            const isTakenByAnother = p.person_id && personIdToIdMap.has(p.person_id) && personIdToIdMap.get(p.person_id) !== p.id;
            if (!p.person_id || isTakenByAnother || existingPersonIds.has(p.person_id)) {
              while (existingPersonIds.has(`P-${nextNum.toString().padStart(6, '0')}`)) {
                nextNum++;
              }
              p.person_id = `P-${(nextNum++).toString().padStart(6, '0')}`;
            }

            existingPersonIds.add(p.person_id);
            personIdToIdMap.set(p.person_id, p.id);
            idMap.set(p.id, { id: p.id, person_id: p.person_id, full_name: p.full_name, company: comp });
            if (p.primary_email) emailMap.set(`${comp}:${p.primary_email.trim().toLowerCase()}`, { id: p.id, person_id: p.person_id, full_name: p.full_name });
            if (p.primary_phone) {
              const d = p.primary_phone.replace(/\D/g, '');
              if (d.length >= 7) phoneMap.set(`${comp}:${d.slice(-10)}`, { id: p.id, person_id: p.person_id, full_name: p.full_name });
            }
            newCandidatesCount++;
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
              source_row: srcRow,
              date_applied: p.date_applied || null,
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

          // Defensive fallback: full_name must NEVER violate NOT NULL constraint
          const safeFullName = (p.full_name && p.full_name.trim()) ||
            `${p.first_name || ''} ${p.last_name || ''}`.trim() ||
            (p.primary_email ? p.primary_email.split('@')[0] : '') ||
            'Candidate';

          insertPersonStmt.run(
            p.id,
            p.person_id,
            p.first_name || null,
            p.last_name || null,
            safeFullName,
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
              const emailStr = typeof e === 'string' ? e : e.email;
              if (!emailStr) continue;
              const normEmail = typeof e === 'string' ? e.toLowerCase() : (e.normalized_email || e.email?.toLowerCase() || '');
              insertEmailStmt.run(
                (typeof e === 'object' && e.id) || `${p.id}-em-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                p.id,
                emailStr,
                normEmail,
                (typeof e === 'object' && e.is_primary) ? 1 : 0,
                (typeof e === 'object' && e.source) || 'Import',
                (typeof e === 'object' && e.first_seen_at) || now,
                (typeof e === 'object' && e.last_seen_at) || now,
                (typeof e === 'object' && e.created_at) || now
              );
            }
          }

          if (Array.isArray(p.phones)) {
            for (const ph of p.phones) {
              const rawPhone = typeof ph === 'string' ? ph : (ph.phone_original || ph.phone);
              if (!rawPhone) continue;
              const normPhone = typeof ph === 'string' ? ph.replace(/\D/g, '') : (ph.phone_normalized || ph.phone?.replace(/\D/g, '') || '');
              insertPhoneStmt.run(
                (typeof ph === 'object' && ph.id) || `${p.id}-ph-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                p.id,
                rawPhone,
                normPhone,
                (typeof ph === 'object' && ph.is_primary) ? 1 : 0,
                (typeof ph === 'object' && ph.source) || 'Import',
                (typeof ph === 'object' && ph.first_seen_at) || now,
                (typeof ph === 'object' && ph.last_seen_at) || now,
                (typeof ph === 'object' && ph.created_at) || now
              );
            }
          }

          let primaryAppId: string | null = null;
          if (Array.isArray(p.applications)) {
            for (const app of p.applications) {
              const appRole = app.job_title || p.current_title || p.headline || 'General Applicant';
              const appComp = app.company || comp;
              let existing: any = null;
              if (app.id) {
                existing = this.db.prepare('SELECT id, resume_link, current_stage, application_collected_date, recruiter_assigned_date, green_card, h1b_status FROM master_applications WHERE id = ?').get(app.id);
              }
              if (!existing) {
                existing = findExistingAppStmt.get(p.id, p.person_id, appComp, appRole) as any;
              }
              // Strict Multi-Role Application Support:
              // Distinct roles (Cybersecurity vs AWS vs DA) or distinct application dates are genuine separate application occurrences
              if (existing && app.date_applied && existing.date_applied && app.date_applied !== existing.date_applied) {
                existing = null;
              }

              const resLink = app.resume_link || app.resume_url || p.resume_url || null;
              const stage = app.current_stage || null;
              const appColDate = app.application_collected_date || p.application_collected_date || null;
              const recAssignDate = app.recruiter_assigned_date || p.recruiter_assigned_date || null;
              const gcVal = app.green_card || p.green_card || null;
              const h1bVal = app.h1b_status || p.h1b_status || null;

              if (existing) {
                duplicateApplicationsCount++;
                primaryAppId = existing.id;
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
                newApplicationsCount++;
                const newAppId = app.id || `${p.id}-app-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                primaryAppId = newAppId;
                insertAppStmt.run(
                  newAppId,
                  p.id,
                  app.applicant_id || null,
                  appComp,
                  app.job_id || null,
                  appRole,
                  appRole,
                  srcRow,
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
                  asgn.application_id || primaryAppId || null,
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
                primaryAppId || null,
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
                  c.notes || rawFb,
                  c.contact_date || now.split('T')[0],
                  c.created_at || now,
                  c.contact_method || c.contact_type || 'Phone',
                  c.outcome || null,
                  c.feedback_1 || null,
                  c.feedback_2 || null,
                  c.additional_feedback || null,
                  rawFb,
                  c.source_file || null,
                  c.application_id || primaryAppId || null,
                  c.source_row || c.source_row_number || null
                );
              }
            }
          }

          // Idempotent Row-Level Ledger Recording
          const ledgerStatus = existingCandidate ? 'Matched' : 'Committed';

          try {
            insertLedgerStmt.run(
              `mil-${comp}-${srcFile}-${srcRow}-${Date.now()}`,
              jobId,
              impId,
              srcFile,
              srcSheet,
              srcRow,
              comp,
              normIdent,
              p.full_name || null,
              p.primary_email || null,
              p.primary_phone || null,
              p.current_title || (p.applications && p.applications[0]?.job_title) || null,
              ledgerStatus,
              p.person_id,
              primaryAppId,
              null,
              now
            );
          } catch {
            // Idempotent ledger safeguard
          }

          this.db.exec('RELEASE SAVEPOINT row_sp');
          upsertedCount++;
        } catch (rowErr: any) {
          try { this.db.exec('ROLLBACK TO SAVEPOINT row_sp'); } catch { }
          failedCount++;
          rowErrors.push({
            row: srcRow,
            name: p.full_name || 'Candidate',
            reason: rowErr.message || 'Row processing failed',
          });
          try {
            insertLedgerStmt.run(
              `mil-${comp}-${srcFile}-${srcRow}-${Date.now()}`,
              jobId,
              impId,
              srcFile,
              srcSheet,
              srcRow,
              comp,
              normIdent,
              p.full_name || null,
              p.primary_email || null,
              p.primary_phone || null,
              p.current_title || null,
              'Failed',
              null,
              null,
              rowErr.message,
              now
            );
          } catch { }
        }
      }

      // Record batch and job summary atomically
      if (options?.jobId && options?.batchNumber !== undefined) {
        const batchId = `${options.jobId}-b-${options.batchNumber}`;
        const nowIso = new Date().toISOString();
        this.db.prepare(`
          INSERT INTO master_import_batches (
            id, job_id, batch_number, start_row, end_row, record_count, row_count,
            successful_count, failed_count, new_candidates, matched_candidates,
            new_applications, duplicate_applications, status, started_at, completed_at, error_details
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            successful_count = excluded.successful_count,
            failed_count = excluded.failed_count,
            new_candidates = excluded.new_candidates,
            matched_candidates = excluded.matched_candidates,
            new_applications = excluded.new_applications,
            duplicate_applications = excluded.duplicate_applications,
            status = 'Completed',
            completed_at = excluded.completed_at,
            error_details = excluded.error_details
        `).run(
          batchId,
          options.jobId,
          options.batchNumber,
          options.startRow || 0,
          options.endRow || 0,
          people.length,
          people.length,
          upsertedCount,
          failedCount,
          newCandidatesCount,
          matchedCandidatesCount,
          newApplicationsCount,
          duplicateApplicationsCount,
          nowIso,
          nowIso,
          rowErrors.length > 0 ? JSON.stringify(rowErrors.slice(0, 5)) : null
        );

        this.db.prepare(`
          UPDATE master_import_jobs SET
            processed_rows = processed_rows + ?,
            successful_rows = successful_rows + ?,
            failed_rows = failed_rows + ?,
            new_candidates = new_candidates + ?,
            matched_candidates = matched_candidates + ?,
            new_applications = new_applications + ?,
            matched_applications = matched_applications + ?,
            duplicate_applications = duplicate_applications + ?,
            updated_at = ?
          WHERE id = ?
        `).run(
          people.length,
          upsertedCount,
          failedCount,
          newCandidatesCount,
          matchedCandidatesCount,
          newApplicationsCount,
          0,
          duplicateApplicationsCount,
          nowIso,
          options.jobId
        );
      }

      return {
        success: true,
        count: people.length,
        upserted: upsertedCount,
        failed: failedCount,
        errors: rowErrors,
        peopleIds,
      };
    });
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

  // -------------------------------------------------------------
  // DIGITAL MARKETING ENTERPRISE PERSISTENCE
  // -------------------------------------------------------------
  private initDefaultMarketing(): void {
    try {
      const mCount = (this.db.prepare('SELECT COUNT(*) as count FROM marketing_members').get() as { count: number }).count;
      if (mCount === 0) {
        const insertMember = this.db.prepare(`
          INSERT INTO marketing_members (id, name, email, designation, company_access, is_active, avatar_initials, created_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'))
        `);
        const members = [
          { id: 'mkt-001', name: 'Sarah Jenkins', email: 'sarah.j@aaratech.com', designation: 'Marketing Lead', access: ['AaraTech', 'ClinisolTech'], initials: 'SJ' },
          { id: 'mkt-002', name: 'David Chen', email: 'david.c@aaratech.com', designation: 'Content Strategist', access: ['AaraTech', 'ClinisolTech'], initials: 'DC' },
          { id: 'mkt-003', name: 'Priya Sharma', email: 'priya.s@clinisoltech.com', designation: 'Social Media Manager', access: ['AaraTech', 'ClinisolTech'], initials: 'PS' },
          { id: 'mkt-004', name: 'Marcus Vance', email: 'marcus.v@aaratech.com', designation: 'SEO & Performance Specialist', access: ['AaraTech', 'ClinisolTech'], initials: 'MV' },
          { id: 'mkt-005', name: 'Elena Rostova', email: 'elena.r@clinisoltech.com', designation: 'Creative Designer', access: ['AaraTech', 'ClinisolTech'], initials: 'ER' },
        ];
        for (const m of members) {
          insertMember.run(m.id, m.name, m.email, m.designation, JSON.stringify(m.access), m.initials);
        }
      }

      const tCount = (this.db.prepare('SELECT COUNT(*) as count FROM marketing_tasks').get() as { count: number }).count;
      if (tCount === 0) {
        const insertTask = this.db.prepare(`
          INSERT INTO marketing_tasks (id, company, title, description, assigned_to_id, assigned_to_name, priority, status, due_date, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);
        const tasks = [
          { id: 'task-001', company: 'AaraTech', title: 'Q4 Talent Outreach Campaign Launch', desc: 'Prepare LinkedIn sponsored updates and copy for senior AI engineering roles.', toId: 'mkt-001', toName: 'Sarah Jenkins', prio: 'Urgent', status: 'In Progress', due: '2026-11-06' },
          { id: 'task-002', company: 'AaraTech', title: 'Technical Case Study: Cloud Migration Services', desc: 'Draft 1,200-word engineering case study highlighting microservices architecture.', toId: 'mkt-002', toName: 'David Chen', prio: 'High', status: 'Backlog', due: '2026-11-09' },
          { id: 'task-003', company: 'ClinisolTech', title: 'Clinical Data Management Webinar Promotion', desc: 'Create multi-channel promotion banner set and landing page announcement.', toId: 'mkt-003', toName: 'Priya Sharma', prio: 'High', status: 'In Progress', due: '2026-11-07' },
          { id: 'task-004', company: 'ClinisolTech', title: 'Biostatistician Hiring Infographic', desc: 'Design clinical research talent landscape graphic for LinkedIn carousel.', toId: 'mkt-005', toName: 'Elena Rostova', prio: 'Medium', status: 'Review', due: '2026-11-05' },
        ];
        for (const t of tasks) {
          insertTask.run(t.id, t.company, t.title, t.desc, t.toId, t.toName, t.prio, t.status, t.due);
        }
      }

      const pCount = (this.db.prepare('SELECT COUNT(*) as count FROM marketing_posts').get() as { count: number }).count;
      if (pCount === 0) {
        const insertPost = this.db.prepare(`
          INSERT INTO marketing_posts (id, company, channel, title, content, media_urls, scheduled_for, approval_status, author_id, author_name, reviewer_id, reviewer_name, reviewer_feedback, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `);
        const posts = [
          { id: 'post-001', company: 'AaraTech', chan: 'LinkedIn', title: 'Navigating Modern Cloud Architecture in 2026', content: 'Cloud infrastructure continues to evolve with hybrid AI deployment models. How is your engineering team optimizing cost and latency? Read our insights.', sched: '2026-11-05T12:00:00.000Z', status: 'Approved', aId: 'mkt-002', aName: 'David Chen', rId: 'mkt-001', rName: 'Sarah Jenkins', rFb: 'Looks great! Ready to publish on scheduled slot.' },
          { id: 'post-002', company: 'ClinisolTech', chan: 'LinkedIn', title: 'Accelerating Phase III Clinical Trials with Validated EDC Pipelines', content: 'Data precision and GxP regulatory compliance drive successful therapeutic breakthroughs. ClinisolTech delivers expert SAS programming and CDISC standards.', sched: '2026-11-06T14:00:00.000Z', status: 'Under Review', aId: 'mkt-003', aName: 'Priya Sharma', rId: null, rName: null, rFb: null },
        ];
        for (const p of posts) {
          insertPost.run(p.id, p.company, p.chan, p.title, p.content, p.sched, p.status, p.aId, p.aName, p.rId, p.rName, p.rFb);
        }
      }

      const sCount = (this.db.prepare('SELECT COUNT(*) as count FROM marketing_settings').get() as { count: number }).count;
      if (sCount === 0) {
        const insertSetting = this.db.prepare("INSERT INTO marketing_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))");
        insertSetting.run('portal_settings', JSON.stringify({ maxDailyBreakMinutes: 60, allowedBreakTypes: ['Lunch', 'Tea Break', 'Personal', 'Other'], requireEodReport: true }));
        insertSetting.run('AaraTech_settings', JSON.stringify({ company: 'AaraTech', maxDailyBreakMinutes: 60, allowedBreakTypes: ['Lunch', 'Tea Break', 'Personal', 'Other'], requireEodReport: true, standardWorkHoursPerDay: 8 }));
        insertSetting.run('ClinisolTech_settings', JSON.stringify({ company: 'ClinisolTech', maxDailyBreakMinutes: 60, allowedBreakTypes: ['Lunch', 'Tea Break', 'Personal', 'Other'], requireEodReport: true, standardWorkHoursPerDay: 8 }));
      }
    } catch (err) {
      console.error('[DatabaseService] initDefaultMarketing error:', err);
    }
  }

  getMarketingMembers(): any[] {
    const rows = this.db.prepare('SELECT * FROM marketing_members ORDER BY name ASC').all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      designation: r.designation,
      companyAccess: JSON.parse(r.company_access || '["AaraTech","ClinisolTech"]'),
      isActive: Boolean(r.is_active),
      avatarInitials: r.avatar_initials,
    }));
  }

  upsertMarketingMember(m: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO marketing_members (id, name, email, designation, company_access, is_active, avatar_initials, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        email = excluded.email,
        designation = excluded.designation,
        company_access = excluded.company_access,
        is_active = excluded.is_active,
        avatar_initials = excluded.avatar_initials
    `);
    stmt.run(
      m.id,
      m.name,
      m.email,
      m.designation || '',
      JSON.stringify(m.companyAccess || ['AaraTech', 'ClinisolTech']),
      m.isActive ? 1 : 0,
      m.avatarInitials || ''
    );
  }

  getMarketingAttendance(companyFilter?: string, dateFilter?: string): any[] {
    let sql = 'SELECT * FROM marketing_attendance WHERE 1=1';
    const params: any[] = [];
    if (companyFilter && companyFilter !== 'All') {
      sql += " AND (company = ? OR company = 'Shared')";
      params.push(companyFilter);
    }
    if (dateFilter) {
      sql += ' AND work_date = ?';
      params.push(dateFilter);
    }
    sql += ' ORDER BY check_in_time DESC';
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({
      id: r.id,
      memberId: r.member_id,
      memberName: r.member_name,
      company: r.company,
      workDate: r.work_date,
      checkInTime: r.check_in_time,
      checkOutTime: r.check_out_time,
      totalHours: r.total_hours,
      status: r.status,
      notes: r.notes,
      breaks: JSON.parse(r.breaks_json || '[]'),
    }));
  }

  upsertMarketingAttendance(a: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO marketing_attendance (
        id, member_id, member_name, company, work_date, check_in_time,
        check_out_time, total_hours, status, notes, breaks_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        company = excluded.company,
        work_date = excluded.work_date,
        check_in_time = excluded.check_in_time,
        check_out_time = excluded.check_out_time,
        total_hours = excluded.total_hours,
        status = excluded.status,
        notes = excluded.notes,
        breaks_json = excluded.breaks_json,
        updated_at = datetime('now')
    `);
    stmt.run(
      a.id,
      a.memberId,
      a.memberName,
      a.company || 'Shared',
      a.workDate,
      a.checkInTime,
      a.checkOutTime || null,
      a.totalHours || null,
      a.status || 'Present',
      a.notes || '',
      JSON.stringify(a.breaks || [])
    );
  }

  getMarketingTasks(companyFilter?: string): any[] {
    let sql = 'SELECT * FROM marketing_tasks WHERE 1=1';
    const params: any[] = [];
    if (companyFilter && companyFilter !== 'All') {
      sql += " AND (company = ? OR company = 'Shared')";
      params.push(companyFilter);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({
      id: r.id,
      company: r.company,
      title: r.title,
      description: r.description,
      assignedToId: r.assigned_to_id,
      assignedToName: r.assigned_to_name,
      priority: r.priority,
      status: r.status,
      dueDate: r.due_date,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  upsertMarketingTask(t: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO marketing_tasks (
        id, company, title, description, assigned_to_id, assigned_to_name,
        priority, status, due_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        company = excluded.company,
        title = excluded.title,
        description = excluded.description,
        assigned_to_id = excluded.assigned_to_id,
        assigned_to_name = excluded.assigned_to_name,
        priority = excluded.priority,
        status = excluded.status,
        due_date = excluded.due_date,
        updated_at = datetime('now')
    `);
    stmt.run(
      t.id,
      t.company,
      t.title,
      t.description || '',
      t.assignedToId,
      t.assignedToName,
      t.priority || 'Medium',
      t.status || 'Backlog',
      t.dueDate || '',
    );
  }

  deleteMarketingTask(id: string): void {
    this.db.prepare('DELETE FROM marketing_tasks WHERE id = ?').run(id);
  }

  getMarketingPosts(companyFilter?: string): any[] {
    let sql = 'SELECT * FROM marketing_posts WHERE 1=1';
    const params: any[] = [];
    if (companyFilter && companyFilter !== 'All') {
      sql += " AND (company = ? OR company = 'Shared')";
      params.push(companyFilter);
    }
    sql += ' ORDER BY scheduled_for ASC, created_at DESC';
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({
      id: r.id,
      company: r.company,
      channel: r.channel,
      title: r.title,
      content: r.content,
      mediaUrls: JSON.parse(r.media_urls || '[]'),
      scheduledFor: r.scheduled_for,
      approvalStatus: r.approval_status,
      authorId: r.author_id,
      authorName: r.author_name,
      reviewerId: r.reviewer_id,
      reviewerName: r.reviewer_name,
      reviewerFeedback: r.reviewer_feedback,
      publishedAt: r.published_at,
      livePostUrl: r.live_post_url,
      createdAt: r.created_at,
    }));
  }

  upsertMarketingPost(p: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO marketing_posts (
        id, company, channel, title, content, media_urls, scheduled_for,
        approval_status, author_id, author_name, reviewer_id, reviewer_name,
        reviewer_feedback, published_at, live_post_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        company = excluded.company,
        channel = excluded.channel,
        title = excluded.title,
        content = excluded.content,
        media_urls = excluded.media_urls,
        scheduled_for = excluded.scheduled_for,
        approval_status = excluded.approval_status,
        author_id = excluded.author_id,
        author_name = excluded.author_name,
        reviewer_id = excluded.reviewer_id,
        reviewer_name = excluded.reviewer_name,
        reviewer_feedback = excluded.reviewer_feedback,
        published_at = excluded.published_at,
        live_post_url = excluded.live_post_url,
        updated_at = datetime('now')
    `);
    stmt.run(
      p.id,
      p.company,
      p.channel,
      p.title,
      p.content,
      JSON.stringify(p.mediaUrls || []),
      p.scheduledFor,
      p.approvalStatus || 'Draft',
      p.authorId,
      p.authorName,
      p.reviewerId || null,
      p.reviewerName || null,
      p.reviewerFeedback || null,
      p.publishedAt || null,
      p.livePostUrl || null
    );
  }

  deleteMarketingPost(id: string): void {
    this.db.prepare('DELETE FROM marketing_posts WHERE id = ?').run(id);
  }

  getMarketingReports(companyFilter?: string, dateFilter?: string): any[] {
    let sql = 'SELECT * FROM marketing_reports WHERE 1=1';
    const params: any[] = [];
    if (companyFilter && companyFilter !== 'All') {
      sql += " AND (company = ? OR company = 'Shared')";
      params.push(companyFilter);
    }
    if (dateFilter) {
      sql += ' AND report_date = ?';
      params.push(dateFilter);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => ({
      id: r.id,
      memberId: r.member_id,
      memberName: r.member_name,
      company: r.company,
      reportDate: r.report_date,
      date: r.report_date,
      tasksCompleted: r.tasks_completed,
      inProgressTasks: r.in_progress_tasks,
      blockers: r.blockers,
      keyLearnings: r.key_learnings,
      hoursWorked: r.hours_worked,
      createdAt: r.created_at,
    }));
  }

  upsertMarketingReport(r: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO marketing_reports (
        id, member_id, member_name, company, report_date,
        tasks_completed, in_progress_tasks, blockers, key_learnings, hours_worked, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        member_id = excluded.member_id,
        member_name = excluded.member_name,
        company = excluded.company,
        report_date = excluded.report_date,
        tasks_completed = excluded.tasks_completed,
        in_progress_tasks = excluded.in_progress_tasks,
        blockers = excluded.blockers,
        key_learnings = excluded.key_learnings,
        hours_worked = excluded.hours_worked
    `);
    stmt.run(
      r.id,
      r.memberId,
      r.memberName,
      r.company,
      r.reportDate || r.date,
      r.tasksCompleted || '',
      r.inProgressTasks || '',
      r.blockers || '',
      r.keyLearnings || '',
      r.hoursWorked || 0
    );
  }

  getMarketingSettings(key?: string): any {
    if (key) {
      const row = this.db.prepare('SELECT value FROM marketing_settings WHERE key = ?').get(key) as any;
      return row ? JSON.parse(row.value) : null;
    }
    const rows = this.db.prepare('SELECT * FROM marketing_settings').all() as any[];
    const res: Record<string, any> = {};
    for (const r of rows) {
      res[r.key] = JSON.parse(r.value);
    }
    return res;
  }

  upsertMarketingSettings(key: string, value: any): void {
    const stmt = this.db.prepare(`
      INSERT INTO marketing_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `);
    stmt.run(key, JSON.stringify(value));
  }
}

export const dbService = new DatabaseService();
