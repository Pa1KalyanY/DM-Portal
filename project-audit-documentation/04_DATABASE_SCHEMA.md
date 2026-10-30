# 04. Database Architecture & Data Model

**Document**: Database Schema Specification & Data Dictionary  
**Database Engine**: Embedded Synchronous SQLite via Node.js native `DatabaseSync` (`node:sqlite`)  
**Database File**: `c:\Users\yarla\linkedin application filter\linkedin_screening.db`  
**Current Database Size**: ~8.45 MB (Contains 1,544 unique candidates post-deduplication)  
**Verification Date**: October 2026  
**Confidentiality Safeguard**: All candidate attributes in examples below are purely synthetic.

---

## 1. Storage Engine & Technology Choices

### 1.1 In-Process SQLite Engine
The application utilizes Node.js 22's built-in `DatabaseSync` from `node:sqlite`.
- **Zero External Server Dependency**: Does not require running PostgreSQL, MySQL, or cloud instances locally.
- **Fast Synchronous Querying**: Prepared statements execute directly in-memory against local storage without TCP roundtrips.
- **ACID Compliant**: Supports transactions (`BEGIN TRANSACTION`, `COMMIT`, `ROLLBACK`) for atomic batch inserts and deduplications.
- **Single Connection Instance**: Instantiated once in [server/db.ts:21](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts#L21) (`new DatabaseSync(DB_PATH)`) and shared across all route handlers.

---

## 2. Table-by-Table Schema Specification

### 2.1 Table: `imports`
Tracks each batch of uploaded spreadsheets or clipboard paste operations.

| Column | Type | Constraints | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` | None | Unique import ID (e.g. `imp_a82f1b40`) |
| `import_code` | `TEXT` | `UNIQUE` | None | Human-readable sequential code (e.g. `IMP-00001`) |
| `batch_name` | `TEXT` | Nullable | Null | Recruiter batch label (e.g. `CY-1 12/10 Requisition`) |
| `uploaded_at` | `TEXT` | Nullable | None | ISO-8601 timestamp string (`YYYY-MM-DDTHH:mm:ss.sssZ`) |
| `uploaded_by` | `TEXT` | Nullable | None | Name of uploader (default: `Recruiter Admin`) |
| `file_count` | `INTEGER` | Nullable | 0 | Number of spreadsheet files in batch |
| `total_applicants` | `INTEGER` | Nullable | 0 | Total parsed candidate rows in batch |
| `passed_count` | `INTEGER` | Nullable | 0 | Candidates with `effective_result == 'PASS'` |
| `failed_count` | `INTEGER` | Nullable | 0 | Candidates with `effective_result == 'FAIL'` |
| `manual_review_count` | `INTEGER` | Nullable | 0 | Candidates with `effective_result == 'MANUAL_REVIEW'` |
| `error_count` | `INTEGER` | Nullable | 0 | Rows encountering unparseable binary errors |
| `status` | `TEXT` | Nullable | `'Completed'` | Batch lifecycle state (`Completed`, `Processing`, `Failed`) |

---

### 2.2 Table: `import_files`
Tracks individual files uploaded within an import batch.

| Column | Type | Constraints | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` | None | Unique file record ID (e.g. `file_c41e98d2`) |
| `import_id` | `TEXT` | `FOREIGN KEY (import_id) REFERENCES imports(id)` | None | Parent import batch ID |
| `filename` | `TEXT` | Nullable | None | Original uploaded file name (e.g. `Data_Analyst.xlsx`) |
| `file_size` | `INTEGER` | Nullable | None | Size in bytes |
| `row_count` | `INTEGER` | Nullable | 0 | Number of rows parsed from this file |
| `job_id` | `TEXT` | Nullable | None | Extracted LinkedIn Job Requisition ID |
| `job_title` | `TEXT` | Nullable | None | Extracted job requisition title |
| `status` | `TEXT` | Nullable | `'PROCESSED'` | File status (`READY`, `PROCESSED`, `ERROR`) |
| `error_message` | `TEXT` | Nullable | Null | Parsing error explanation if corrupted |
| `file_hash` | `TEXT` | Nullable | None | SHA-256 hash of file content used for duplicate detection |

---

### 2.3 Table: `applicants`
The primary table storing candidate profiles, preserved raw rows, and screening classifications.

| Column | Type | Constraints | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` | None | Unique candidate ID (e.g. `app_9f82d1b4`) |
| `import_id` | `TEXT` | `FOREIGN KEY (import_id) REFERENCES imports(id)` | None | Foreign key linking to parent import batch |
| `source_file` | `TEXT` | Nullable | None | Name of spreadsheet file candidate was extracted from |
| `source_worksheet` | `TEXT` | Nullable | None | Sheet name within workbook |
| `source_row_number` | `INTEGER` | Nullable | None | Original 1-indexed row number in spreadsheet |
| `first_name` | `TEXT` | Nullable | None | Candidate given name |
| `last_name` | `TEXT` | Nullable | None | Candidate surname / family name |
| `full_name` | `TEXT` | Nullable | None | Combined full name |
| `email` | `TEXT` | Indexed | None | Candidate email address (lowercase, trimmed) |
| `phone` | `TEXT` | Nullable | None | Sanitized 10-digit phone number (symbols & +1 removed) |
| `location` | `TEXT` | Nullable | None | City, State, Country |
| `zip_code` | `TEXT` | Nullable | None | Postal code |
| `headline` | `TEXT` | Nullable | None | Professional headline summary |
| `current_title` | `TEXT` | Nullable | None | Current job role |
| `current_company` | `TEXT` | Nullable | None | Current employer |
| `current_position_start_date` | `TEXT` | Nullable | None | Start date string |
| `education_degree` | `TEXT` | Nullable | None | Degree level |
| `education_institution` | `TEXT` | Nullable | None | University or college name |
| `profile_url` | `TEXT` | Nullable | None | LinkedIn profile URL |
| `date_applied` | `TEXT` | Nullable | None | Application submission date |
| `current_stage` | `TEXT` | Nullable | None | Workflow stage from ATS |
| `job_id` | `TEXT` | Indexed | None | Requisition ID applied for |
| `job_title` | `TEXT` | Indexed | None | Raw job title from spreadsheet |
| `job_url` | `TEXT` | Nullable | None | Link to job posting |
| `ats_job_id` | `TEXT` | Nullable | None | ATS job identifier |
| `min_salary` | `TEXT` | Nullable | None | Compensation minimum |
| `max_salary` | `TEXT` | Nullable | None | Compensation maximum |
| `currency_code` | `TEXT` | Nullable | None | Currency code (e.g. `USD`) |
| `compensation_period` | `TEXT` | Nullable | None | Period (e.g. `Yearly`) |
| `hiring_project_id` | `TEXT` | Nullable | None | Hiring project ID |
| `hiring_project_title` | `TEXT` | Nullable | None | Hiring project title |
| `contract_id` | `TEXT` | Nullable | None | Contract identifier |
| `contract_name` | `TEXT` | Nullable | None | Contract name |
| `raw_screening_questions` | `TEXT` | Nullable | None | 100% untouched raw text from LinkedIn screening column |
| `green_card_answer` | `TEXT` | Nullable | None | Normalized answer: `YES`, `NO`, `MISSING`, `UNCLEAR` |
| `sponsorship_answer` | `TEXT` | Nullable | None | Normalized answer: `YES`, `NO`, `MISSING`, `UNCLEAR` |
| `us_work_auth_answer` | `TEXT` | Nullable | None | Normalized answer: `YES`, `NO`, `MISSING`, `UNCLEAR` |
| `automated_result` | `TEXT` | Nullable | None | Algorithmic status: `PASS`, `FAIL`, `MANUAL_REVIEW`, `ERROR` |
| `manual_result` | `TEXT` | Nullable | Null | Human override status or `NULL` if not overridden |
| `effective_result` | `TEXT` | Indexed | None | Active decision (`manual_result ?? automated_result`) |
| `screening_reasons` | `TEXT` | Nullable | None | Detailed audit trail explaining why status was assigned |
| `override_reason` | `TEXT` | Nullable | Null | Recruiter reason for status change (optional) |
| `overridden_by` | `TEXT` | Nullable | Null | Recruiter identifier who executed override |
| `raw_row_json` | `TEXT` | Nullable | None | Complete original row serialized as JSON string |
| `gender` | `TEXT` | Indexed | `'UNSPECIFIED'` | `MALE`, `FEMALE`, or `UNSPECIFIED` |
| `origin_region` | `TEXT` | Indexed | `'UNSPECIFIED'` | `SOUTH_ASIAN`, `UNCERTAIN`, or `OTHER` |
| `origin_country` | `TEXT` | Nullable | None | Specific country: `India`, `Pakistan`, `Bangladesh`, `Nepal`, `Sri Lanka` |
| `origin_match_reason` | `TEXT` | Nullable | None | Linguistic explanation for origin match |
| `name_match_category` | `TEXT` | Indexed | `'No Match'` | `Strong Match`, `Possible Match`, or `No Match` |
| `name_match_score` | `REAL` | Nullable | 0.0 | Numeric score from 0.0 to 1.0 |
| `name_matched_pattern` | `TEXT` | Nullable | None | Description of pattern matched |
| `name_matched_reference` | `TEXT` | Nullable | None | Exact reference record matched from dataset |
| `created_at` | `TEXT` | Nullable | None | ISO-8601 timestamp string |

---

### 2.4 Table: `screening_rules`
Defines active screening policies evaluated against raw candidate questions.

| Column | Type | Constraints | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` | None | Unique rule ID (`rule-gc-1`, `rule-sp-2`, etc.) |
| `name` | `TEXT` | Nullable | None | Rule display title |
| `description` | `TEXT` | Nullable | None | Policy explanation |
| `required_answer` | `TEXT` | Nullable | None | Expected candidate answer (`YES`, `NO`, `SOUTH_ASIAN`) |
| `status` | `TEXT` | Nullable | `'ACTIVE'` | Rule state: `'ACTIVE'` or `'INACTIVE'` |
| `is_mandatory` | `INTEGER` | Nullable | 0 | `1` for mandatory (cannot be disabled), `0` for optional |
| `question_key` | `TEXT` | `UNIQUE` | None | Canonical key (`GREEN_CARD_CITIZEN`, `FUTURE_SPONSORSHIP`, `US_WORK_AUTH`, `SOUTH_ASIAN_ORIGIN`) |

---

### 2.5 Table: `audit_logs`
Immutable compliance event log tracking every manual status change, gender update, and deduplication run.

| Column | Type | Constraints | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` | None | Unique log event ID (e.g. `log_7a1b9c3e`) |
| `timestamp` | `TEXT` | Indexed (`DESC`) | None | ISO-8601 timestamp |
| `user` | `TEXT` | Nullable | None | User executing action (default: `'Recruiter Admin'`) |
| `action` | `TEXT` | Nullable | None | Event type (`OVERRIDE`, `BATCH_OVERRIDE`, `DEDUPLICATE`, `GENDER_UPDATE`, `IMPORT`) |
| `applicant_id` | `TEXT` | Nullable | None | Target candidate ID (if single candidate action) |
| `applicant_name` | `TEXT` | Nullable | None | Candidate full name |
| `previous_result` | `TEXT` | Nullable | None | Status before action |
| `new_result` | `TEXT` | Nullable | None | Status after action |
| `reason` | `TEXT` | Nullable | None | Recruiter reason or automated description |
| `details` | `TEXT` | Nullable | None | Additional JSON metadata or batch IDs |

---

### 2.6 Table: `app_settings`
Key-value store for system configuration.

| Column | Type | Constraints | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `key` | `TEXT` | `PRIMARY KEY` | None | Setting name (e.g. `gemini_api_key`) |
| `value` | `TEXT` | Nullable | None | Encrypted or plain setting string |
| `updated_at` | `TEXT` | Nullable | None | ISO-8601 timestamp |

---

## 3. Database Indexes

```sql
-- Fast query indexes created in server/db.ts:
CREATE INDEX IF NOT EXISTS idx_applicants_effective_result ON applicants(effective_result);
CREATE INDEX IF NOT EXISTS idx_applicants_job_id ON applicants(job_id);
CREATE INDEX IF NOT EXISTS idx_applicants_job_title ON applicants(job_title);
CREATE INDEX IF NOT EXISTS idx_applicants_email ON applicants(email);
CREATE INDEX IF NOT EXISTS idx_applicants_full_name ON applicants(full_name);
CREATE INDEX IF NOT EXISTS idx_applicants_import_id ON applicants(import_id);
CREATE INDEX IF NOT EXISTS idx_applicants_gender ON applicants(gender);
CREATE INDEX IF NOT EXISTS idx_applicants_origin_region ON applicants(origin_region);
CREATE INDEX IF NOT EXISTS idx_applicants_name_match_category ON applicants(name_match_category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
```

---

## 4. Candidate Deduplication & Data Retention Logic

Implemented in [`dbService.deduplicateApplicants(scope)`](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts#L1687):

1. **Deterministic Grouping Key Formulation**:
   - Primary: `email.trim().toLowerCase()`
   - Fallback (if email is absent): `cleanName(full_name) + "_" + phone.replace(/\D/g, '').slice(-10)`
2. **Authoritative Candidate Selection**:
   Candidates within each group are ranked using the following strict priority:
   - Rank 1: `effective_result === 'PASS'` has top priority (if a candidate applied for multiple roles and passed one, the PASS disposition is preserved).
   - Rank 2: Data completeness score (records containing both email and phone ranked above partial profiles).
   - Rank 3: Recency: `created_at DESC` (most recent upload timestamp).
3. **Atomic Purge Action**:
   - The top-ranked record is retained.
   - All redundant candidate rows in the group are deleted via `DELETE FROM applicants WHERE id IN (...)`.
   - Associated redundant audit log entries are cleaned.
   - All batch import counters are recalculated to reflect accurate unique counts.

---

## 5. Synthetic Record Example (Data Dictionary)

```json
{
  "id": "app_5a7b9c1d-2e3f-4a5b-6c7d-8e9f0a1b2c3d",
  "importId": "imp_9f82d1b4",
  "sourceFile": "Data_Analyst_Applicants_2026.xlsx",
  "sourceWorksheet": "Applicants",
  "sourceRowNumber": 42,
  "firstName": "Darshan",
  "lastName": "Patel",
  "fullName": "Darshan Patel",
  "email": "darshan.patel.synthetic@example.com",
  "phone": "4085550182",
  "location": "San Jose, CA, United States",
  "zipCode": "95134",
  "headline": "Lead Data Analyst at CloudCorp | SQL | Tableau | Python",
  "currentTitle": "Lead Data Analyst",
  "currentCompany": "CloudCorp Systems",
  "educationDegree": "Bachelor of Technology",
  "educationInstitution": "Gujarat Technological University",
  "profileUrl": "https://www.linkedin.com/in/darshan-patel-synthetic",
  "dateApplied": "2026-09-18",
  "jobId": "3892019482",
  "jobTitle": "Data Analyst",
  "rawScreeningQuestions": "Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No",
  "greenCardAnswer": "YES",
  "sponsorshipAnswer": "NO",
  "usWorkAuthAnswer": "MISSING",
  "automatedResult": "PASS",
  "manualResult": null,
  "effectiveResult": "PASS",
  "screeningReasons": "Mandatory screening passed; South Asian origin verified (India): Matched Indian surname/lineage: \"patel\"",
  "gender": "MALE",
  "originRegion": "SOUTH_ASIAN",
  "originCountry": "India",
  "originMatchReason": "Matched Indian surname/lineage: \"patel\"",
  "nameMatchCategory": "Strong Match",
  "nameMatchScore": 1.0,
  "nameMatchedPattern": "Exact reference record: \"Darshan Patel\" (Reference Dataset 1)",
  "nameMatchedReference": "Darshan Patel",
  "createdAt": "2026-10-15T01:12:00.000Z"
}
```

---

## 6. CRUD Operations & Module Invocation Matrix

The following table documents all database operations implemented in [server/db.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts), the caller module, and the exact tables read or written:

| Database Service Method | Calling Route / Module | Operation Type | Tables Read | Tables Written | Transactional? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `initTables()` | `DatabaseService.constructor` | DDL / Migrate | None | All tables, indexes | No (`CREATE IF NOT EXISTS`) |
| `initDefaultRules()` | `DatabaseService.constructor` | Seed / Read | `screening_rules` | `screening_rules` | Prepared statement |
| `checkDuplicateFile(name, hash)` | `POST /api/validate-files` | Read | `import_files` | None | Read-only |
| `getNextImportCode()` | `POST /api/process-files` | Read | `imports` | None | Read-only (`COUNT(*)`) |
| `createImport(importRecord)` | `POST /api/process-files` | Create | None | `imports`, `import_files` | Implicit |
| `insertApplicantsBatch(applicants)` | `POST /api/process-files` | Create (Bulk) | None | `applicants`, `audit_logs` | **YES (`BEGIN / COMMIT`)** |
| `updateImportStats(importId, stats)`| `POST /api/process-files` | Update | None | `imports` | Single UPDATE |
| `getApplicants(params)` | `GET /api/applicants` | Read (Paginated) | `applicants` | None | Read-only |
| `getApplicantById(id)` | `GET /api/applicants/:id` | Read (Single) | `applicants` | None | Read-only |
| `overrideApplicantStatus(...)` | `POST /api/applicants/:id/override` | Update | `applicants` | `applicants`, `audit_logs` | Prepared statements |
| `batchOverrideApplicantStatus(...)` | `POST /api/applicants/batch-override` | Update (Bulk) | `applicants` | `applicants`, `audit_logs` | **YES (`BEGIN / COMMIT`)** |
| `deleteApplicant(id)` | `DELETE /api/applicants/:id` | Delete | `applicants` | `applicants`, `audit_logs` | Prepared statements |
| `updateApplicantGender(...)` | `POST/PATCH /api/applicants/:id/gender` | Update | `applicants` | `applicants`, `audit_logs` | Prepared statements |
| `batchUpdateGender(...)` | `POST /api/applicants/batch-gender` | Update (Bulk) | `applicants` | `applicants`, `audit_logs` | **YES (`BEGIN / COMMIT`)** |
| `deduplicateApplicants(scope)` | `POST /api/applicants/deduplicate` | Delete / Update | `applicants`, `imports` | `applicants`, `audit_logs`, `imports` | **YES (`BEGIN / COMMIT`)** |
| `getScreeningRules()` | `GET /api/screening-rules` | Read | `screening_rules` | None | Read-only |
| `updateScreeningRule(id, updates)` | `PUT /api/screening-rules/:id` | Update | `screening_rules` | `screening_rules` | Prepared statement |
| `reevaluateAllApplicants()` | `POST /api/reevaluate` | Update (Bulk) | `applicants`, `screening_rules` | `applicants`, `imports` | **YES (`BEGIN / COMMIT`)** |
| `rescreenAllWithOriginAndGender()` | `ALL /api/rescreen-all` | Update (Bulk) | `applicants`, `screening_rules` | `applicants` | **YES (`BEGIN / COMMIT`)** |
| `runReferenceMatchingOnAll(thresh)`| `POST /api/reference-matcher/match-all` | Update (Bulk) | `applicants` | `applicants` | **YES (`BEGIN / COMMIT`)** |
| `getReferenceMatchSummary()` | `GET /api/reference-matcher/stats` | Aggregate Read | `applicants` | None | Read-only |
| `getDashboardStats()` | `GET /api/dashboard` | Aggregate Read | `applicants`, `imports`, `import_files` | None | Read-only |
| `getJobSummaries()` | `GET /api/jobs` | Aggregate Read | `applicants` | None | Read-only (`GROUP BY job_title`) |
| `getImports(limit)` | `GET /api/imports` | Read (List) | `imports`, `import_files` | None | Read-only |
| `getAuditLogs(limit)` | `GET /api/audit-logs` | Read (List) | `audit_logs` | None | Read-only |
| `addAuditLog(entry)` | Internal logger | Create | None | `audit_logs` | Prepared statement |
| `getAllApplicantsForExport(filters)` | `GET /api/export` | Read (Stream) | `applicants` | None | Read-only |
| `repairAllSplitApplicants(...)` | `ALL /api/repair-applicants` | Re-parse / Update | `applicants` | `applicants`, `imports` | **YES (`BEGIN / COMMIT`)** |
| `reclassifyAllGenders(classifier)` | `ALL /api/reclassify-genders` | Update (Bulk) | `applicants` | `applicants` | **YES (`BEGIN / COMMIT`)** |
| `getSetting(key)` | `GET /api/ai/config` | Read | `app_settings` | None | Read-only |
| `setSetting(key, value)` | `POST /api/ai/config` | Upsert | None | `app_settings` | Prepared statement |
| `getApplicantsForAi(options)` | `POST /api/ai/classify` | Read | `applicants` | None | Read-only |
| `applyGeminiClassifications(...)` | `POST /api/ai/classify` | Update (Bulk) | `applicants` | `applicants` | **YES (`BEGIN / COMMIT`)** |
| `clearAllData()` | `ALL /api/clear-all-data` | Delete (All) | `applicants`, `imports` | `applicants`, `imports`, `import_files`, `audit_logs` | **YES (`BEGIN / COMMIT`)** |

