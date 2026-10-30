# 03. Complete Backend & REST API Reference

**Document**: Comprehensive API Documentation & Endpoint Specification  
**Server File**: [server/index.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts)  
**Base URL**: `http://localhost:3001` (Configured via `PORT` env var)  
**Total Endpoints Registered**: 32 HTTP route handlers  
**Audit Verification**: Verified against active Express server instance  
**Authentication**: None (All endpoints are publicly accessible locally)

---

## 1. File Ingestion & Parsing Endpoints

### 1.1 `POST /api/validate-files`
- **Registration**: [server/index.ts:77](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L77)
- **Controller**: Inline async handler using `multer({ storage }).array('files', 50)`.
- **Purpose**: Pre-validates uploaded spreadsheet files (.xlsx, .xls, .csv, .pdf) before committing to database ingestion. Checks for file corruption, extracts sheet names, estimates candidate row counts, detects job titles, verifies screening question columns, and performs SHA-256 duplicate file checks against past imports.
- **Request Format**: `multipart/form-data`
  - Field `files`: Array of binary files (max 50 files, 50MB per file).
- **Processing Logic**:
  1. Computes SHA-256 hash using `crypto.createHash('sha256')`.
  2. Calls `dbService.checkDuplicateFile(originalname, fileHash)`.
  3. If `.pdf`: Reads buffer using `pdfParse`, counts non-empty lines.
  4. If `.xlsx`/`.xls`/`.csv`: Reads buffer via SheetJS `XLSX.read(buf, { type: 'buffer' })`, inspects headers for screening keywords.
- **Database Reads**: Reads `import_files` to check for matching filenames or hashes.
- **Database Writes**: None (Read-only validation).
- **Response Format**: `200 OK`
  ```json
  {
    "files": [
      {
        "filename": "1729000000000-Data_Analyst.xlsx",
        "originalName": "Data_Analyst.xlsx",
        "tempPath": "C:\\path\\to\\uploads\\...",
        "fileSize": 45575,
        "isValid": true,
        "rowCount": 150,
        "detectedJobTitle": "Data Analyst",
        "detectedJobId": "12345678",
        "hasScreeningColumn": true,
        "status": "READY",
        "duplicateWarning": {
          "isDuplicate": false
        }
      }
    ]
  }
  ```
- **Error Statuses**: `400 Bad Request` (No files uploaded), `500 Internal Server Error`.
- **Frontend Caller**: `api.validateFiles(files)` in [src/api/client.ts:5](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L5), used by [src/views/UploadView.tsx](file:///c:/Users/yarla/linkedin%20application%20filter/src/views/UploadView.tsx).
- **Status**: Implemented, tested, and verified.

---

### 1.2 `POST /api/process-files`
- **Registration**: [server/index.ts:224](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L224)
- **Controller**: Inline async handler with `multer.array('files', 50)`.
- **Purpose**: Full batch ingestion pipeline. Ingests 1 to 50 files, executes multiline repairs, detects column headers, sanitizes phone numbers, evaluates deterministic screening rules, classifies South Asian linguistic origin, determines gender, matches names against the 13,859 reference dataset, and persists records in SQLite.
- **Request Format**: `multipart/form-data`
  - Field `files`: Array of binary files.
  - Field `batchName` (string, optional): Recruiter label for the batch (e.g. "Q4 Data Engineering Requisitions").
  - Field `uploadedBy` (string, optional, default: `'Recruiter Admin'`).
- **Processing Rules & Pipeline**:
  1. Generates unique import ID (`imp_uuid`) and import code (`IMP-xxxxx`).
  2. For each file, parses worksheet into raw JSON rows via SheetJS.
  3. Executes `repairSplitRows()` to heal multiline headline/summary breaks.
  4. Runs `detectHeaderMapping()` to resolve 40+ column header variations.
  5. For each row:
     - Extracts person, job, and raw screening question fields.
     - Sanitizes phone numbers via `sanitizeContactNumber()`.
     - Evaluates mandatory visa rules via `evaluateScreening()`.
     - Classifies origin via `classifySouthAsianOrigin()`.
     - Classifies gender via `classifyGender()`.
     - Evaluates reference name similarity via `referenceNameMatcher.matchApplicantName()`.
  6. Persists batch in SQLite transaction via `dbService.insertApplicantsBatch()`.
  7. Updates counters in `imports` record and creates audit log.
- **Database Writes**: Inserts into `imports`, `import_files`, `applicants`, `audit_logs`.
- **Response Format**: `200 OK`
  ```json
  {
    "success": true,
    "importRecord": {
      "id": "imp_9f82d1",
      "importCode": "IMP-00004",
      "batchName": "Data Analyst Import",
      "uploadedAt": "2026-10-15T01:00:00.000Z",
      "uploadedBy": "Recruiter Admin",
      "fileCount": 1,
      "totalApplicants": 150,
      "passedCount": 42,
      "failedCount": 68,
      "manualReviewCount": 40,
      "errorCount": 0,
      "status": "Completed"
    },
    "summary": { ... }
  }
  ```
- **Error Statuses**: `400 Bad Request`, `500 Internal Server Error`.
- **Frontend Caller**: `api.processFiles(files, batchName, uploadedBy)` in [src/api/client.ts:40](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L40).
- **Status**: Implemented, tested, and verified.

---

### 1.3 `POST /api/process-pasted-data`
- **Registration**: [server/index.ts:537](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L537)
- **Purpose**: Ingests tabular candidate data pasted directly from the recruiter's OS clipboard (TSV or CSV format) without requiring an uploaded file.
- **Request Body**: `{ text: string, label?: string, uploadedBy?: string }`
- **Processing Logic**: Parses clipboard text via `parseTabularText()`, extracts column headers, screens candidates, and persists an import batch.
- **Database Writes**: Inserts into `imports`, `import_files`, `applicants`, `audit_logs`.
- **Response Format**: `200 OK` with `importRecord` and `summary`.
- **Frontend Caller**: `api.processPastedData(text, label, uploadedBy)` in [src/api/client.ts:292](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L292).
- **Status**: Implemented, tested, and verified.

---

## 2. Applicant Management & Query Endpoints

### 2.1 `GET /api/applicants`
- **Registration**: [server/index.ts:745](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L745)
- **Purpose**: Paginated, filtered, and sorted search of candidate records.
- **Query Parameters**:
  - `page` (number, default: 1): Page number.
  - `pageSize` (number, default: 25, max: 500): Rows per page.
  - `status` (string, optional): Filter by `PASS`, `FAIL`, `MANUAL_REVIEW`, or `ALL`.
  - `gender` (string, optional): Filter by `MALE`, `FEMALE`, `UNSPECIFIED`, or `ALL`.
  - `origin` (string, optional): Filter by `SOUTH_ASIAN`, `UNCERTAIN`, `OTHER`, or `ALL`.
  - `nameMatchCategory` (string, optional): Filter by `Strong Match`, `Possible Match`, `No Match`, or `ALL`.
  - `search` (string, optional): Substring search across `full_name`, `email`, `phone`, `current_title`, `current_company`, `job_title`, `headline`.
  - `jobId`, `jobTitle`, `company`, `stage`, `location`, `importId` (string, optional): Specific field filters.
  - `hasEmail`, `hasPhone`, `hasLinkedIn` (boolean, optional): Contact completeness filters.
  - `sortBy` (string, optional, default: `'createdAt'`): Column to sort by.
  - `sortOrder` (string, optional, default: `'desc'`): `'asc'` or `'desc'`.
- **Database Reads**: Queries `applicants` table with dynamic parameterized `WHERE` and `LIMIT / OFFSET` clauses.
- **Response Format**: `200 OK`
  ```json
  {
    "data": [ ... ],
    "total": 1544,
    "page": 1,
    "pageSize": 25,
    "totalPages": 62
  }
  ```
- **Frontend Caller**: `api.getApplicants(params)` in [src/api/client.ts:78](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L78).
- **Status**: Implemented, tested, and verified.

---

### 2.2 `GET /api/applicants/:id`
- **Registration**: [server/index.ts:777](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L777)
- **Path Parameter**: `id` (string): Applicant ID.
- **Purpose**: Fetches complete candidate profile, parsed screening question breakdown, raw JSON row data, and full audit history.
- **Database Reads**: Selects from `applicants` by `id`.
- **Response Format**: `200 OK` with candidate object or `404 Not Found`.
- **Frontend Caller**: `api.getApplicant(id)` in [src/api/client.ts:103](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L103).
- **Status**: Implemented, tested, and verified.

---

### 2.3 `POST /api/applicants/:id/override`
- **Registration**: [server/index.ts:793](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L793)
- **Path Parameter**: `id` (string): Applicant ID.
- **Request Body**:
  ```json
  {
    "newStatus": "PASS",
    "reason": "Recruiter approved after checking portfolio",
    "user": "Recruiter Admin"
  }
  ```
  *(Note: `reason` is completely optional; 1-click overrides pass empty string or undefined).*
- **Processing Rules**:
  - Sets `manual_result = newStatus`.
  - Sets `effective_result = newStatus`.
  - Logs state transition in `audit_logs` table.
- **Database Writes**: Updates `applicants`, inserts into `audit_logs`.
- **Response Format**: `200 OK` `{ "success": true, "applicant": { ... } }`.
- **Frontend Caller**: `api.overrideApplicant(...)` in [src/api/client.ts:110](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L110).
- **Status**: Implemented, tested, and verified.

---

### 2.4 `POST /api/applicants/batch-override`
- **Registration**: [server/index.ts:821](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L821)
- **Request Body**:
  ```json
  {
    "ids": ["app_01", "app_02", "app_03"],
    "newStatus": "PASS",
    "reason": "Bulk promotion from recruiter review",
    "user": "Recruiter Admin"
  }
  ```
- **Processing Logic**: Runs in an atomic SQLite transaction via `dbService.batchOverrideApplicantStatus()`. Updates all specified candidate IDs and creates audit records for each.
- **Response Format**: `200 OK` `{ "success": true, "count": 3, "message": "Updated 3 applicants to PASS" }`.
- **Frontend Caller**: `api.batchOverrideApplicants(...)` in [src/api/client.ts:124](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L124).
- **Status**: Implemented, tested, and verified.

---

### 2.5 `DELETE /api/applicants/:id`
- **Registration**: [server/index.ts:843](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L843)
- **Path Parameter**: `id` (string): Applicant ID.
- **Purpose**: Permanently deletes an individual candidate record and associated audit records from the database.
- **Database Writes**: `DELETE FROM applicants WHERE id = ?`.
- **Response Format**: `200 OK` `{ "success": true, "message": "Applicant deleted" }`.
- **Frontend Caller**: `api.deleteApplicant(id)` in [src/api/client.ts:143](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L143).
- **Status**: Implemented, tested, and verified.

---

### 2.6 `POST /api/applicants/:id/gender` & `PATCH /api/applicants/:id/gender`
- **Registration**: [server/index.ts:889](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L889) and [server/index.ts:915](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L915)
- **Request Body**: `{ "gender": "MALE" | "FEMALE" | "UNSPECIFIED", "user"?: "Recruiter Admin" }`
- **Purpose**: Modifies candidate gender directly from the table row dropdown or detail modal.
- **Validation**: Enforces values in `['MALE', 'FEMALE', 'UNSPECIFIED']`.
- **Database Writes**: Updates `applicants.gender` and inserts an audit log event.
- **Response Format**: `200 OK` `{ "success": true, "applicant": { ... } }`.
- **Frontend Caller**: `api.updateApplicantGender(...)` in [src/api/client.ts:155](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L155).
- **Status**: Implemented, tested, and verified.

---

### 2.7 `POST /api/applicants/batch-gender`
- **Registration**: [server/index.ts:857](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L857)
- **Request Body**:
  ```json
  {
    "ids": ["app_01", "app_02"],
    "gender": "FEMALE",
    "user": "Recruiter Admin"
  }
  ```
- **Purpose**: Bulk gender update triggered from the floating selection action bar when multiple candidates are checked.
- **Database Writes**: Atomic update across all specified IDs in SQLite transaction.
- **Response Format**: `200 OK` `{ "success": true, "count": 2, "message": "Updated gender to FEMALE for 2 candidates" }`.
- **Frontend Caller**: `api.batchUpdateGender(...)` in [src/api/client.ts:169](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L169).
- **Status**: Implemented, tested, and verified.

---

### 2.8 `POST /api/applicants/deduplicate`
- **Registration**: [server/index.ts:876](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L876)
- **Request Body**: `{ "scope": "PASS" | "ALL" }` *(default: "ALL")*
- **Purpose**: Executes deterministic deduplication across the entire database. Identifies duplicate candidate rows by normalized email (or name + phone), keeps exactly 1 authoritative record (prioritizing `PASS` status, completeness, and recency), and deletes all redundant records and associated logs in a single transaction.
- **Database Writes**: Deletes duplicate rows from `applicants` and `audit_logs`; recalculates import counters.
- **Response Format**: `200 OK`
  ```json
  {
    "success": true,
    "totalDuplicatesRemoved": 360,
    "uniqueCandidatesKept": 1544,
    "message": "Deduplication complete: removed 360 duplicate records, 1544 unique candidates remaining."
  }
  ```
- **Frontend Caller**: `api.deduplicateApplicants(scope)` in [src/api/client.ts:183](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L183).
- **Status**: Implemented, tested, and verified.

---

## 3. Screening Rules & Re-Evaluation Endpoints

### 3.1 `GET /api/screening-rules`
- **Registration**: [server/index.ts:937](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L937)
- **Purpose**: Fetches active screening rules from `screening_rules` table.
- **Response Format**: `200 OK` Array of `ScreeningRule` objects (`rule-gc-1`, `rule-sp-2`, `rule-wa-3`, `rule-sa-4`).
- **Frontend Caller**: `api.getScreeningRules()` in [src/api/client.ts:202](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L202).
- **Status**: Implemented, tested, and verified.

---

### 3.2 `PUT /api/screening-rules/:id`
- **Registration**: [server/index.ts:946](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L946)
- **Path Parameter**: `id` (string): Rule ID.
- **Request Body**: `{ "status": "ACTIVE" | "INACTIVE", "requiredAnswer"?: "YES" | "NO" }`
- **Business Rule**: Mandatory rules (`isMandatory === 1`) reject status changes to `INACTIVE`.
- **Database Writes**: Updates `screening_rules` table.
- **Response Format**: `200 OK` `{ "success": true, "rules": [ ... ] }`.
- **Frontend Caller**: `api.updateScreeningRule(...)` in [src/api/client.ts:208](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L208).
- **Status**: Implemented, tested, and verified.

---

### 3.3 `POST /api/reevaluate`
- **Registration**: [server/index.ts:961](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L961)
- **Purpose**: Re-evaluates screening decisions for all candidate records in the database against current rule settings without altering manual recruiter overrides.
- **Database Writes**: Updates `automated_result` and `effective_result` on non-overridden rows.
- **Response Format**: `200 OK` `{ "success": true, "summary": { "total": 1544, "passed": 488, "failed": 403, "manualReview": 653 } }`.
- **Frontend Caller**: `api.reevaluateAll()` in [src/api/client.ts:218](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L218).
- **Status**: Implemented, tested, and verified.

---

### 3.4 `ALL /api/rescreen-all`
- **Registration**: [server/index.ts:1606](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1606)
- **Purpose**: Comprehensive rescreening endpoint. Re-evaluates visa rules, re-evaluates South Asian linguistic origin, and refreshes candidate gender classifications across the entire database.
- **Database Writes**: Updates `origin_region`, `origin_country`, `origin_match_reason`, `gender`, `effective_result`.
- **Response Format**: `200 OK` with detailed update summary.
- **Frontend Caller**: `api.rescreenAllApplicants()` in [src/api/client.ts](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts).
- **Status**: Implemented, tested, and verified.

---

## 4. Reference Name Matcher Endpoints

### 4.1 `GET /api/reference-matcher/stats`
- **Registration**: [server/index.ts:1633](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1633)
- **Purpose**: Returns statistical metadata about reference datasets and match distributions in the active database.
- **Response Format**: `200 OK`
  ```json
  {
    "dataset1Count": 9297,
    "dataset2Count": 4562,
    "totalReferenceNames": 13859,
    "uniqueReferenceNames": 12558,
    "uniqueTokens": 10245,
    "uniqueTokenCombos": 14320,
    "similarityThreshold": 0.8,
    "topTokens": [ { "token": "kumar", "count": 842 }, { "token": "sharma", "count": 612 } ],
    "dbSummary": {
      "total": 1544,
      "strongMatches": 488,
      "possibleMatches": 403,
      "noMatches": 653,
      "threshold": 0.8
    }
  }
  ```
- **Frontend Caller**: `api.getReferenceMatcherStats()` in [src/api/client.ts:489](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L489).
- **Status**: Implemented, tested, and verified.

---

### 4.2 `POST /api/reference-matcher/match-all`
- **Registration**: [server/index.ts:1648](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1648)
- **Request Body**: `{ "threshold"?: 0.80 }`
- **Purpose**: Re-evaluates all applicants against the 12,558 unique reference name index using the 5-tier scoring hierarchy.
- **Database Writes**: Updates `name_match_category`, `name_match_score`, `name_matched_pattern`, `name_matched_reference`.
- **Response Format**: `200 OK` with updated count and match distribution.
- **Frontend Caller**: `api.runReferenceMatching(threshold)` in [src/api/client.ts:503](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L503).
- **Status**: Implemented, tested, and verified.

---

### 4.3 `POST /api/reference-matcher/export`
- **Registration**: [server/index.ts:1673](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1673)
- **Request Body**: `{ "format": "xlsx" | "csv", "nameMatchCategory"?: string, "status"?: string, "gender"?: string, "jobId"?: string }`
- **Purpose**: Generates and streams a custom spreadsheet export containing detailed name matching attributes (Similarity Score %, Matched Pattern, Matched Reference Record).
- **Response Format**: Binary stream (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` or `text/csv`).
- **Frontend Caller**: `api.exportReferenceMatches(...)` in [src/api/client.ts:517](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L517).
- **Status**: Implemented, tested, and verified.

---

## 5. Aggregations, Reporting & Export Endpoints

### 5.1 `GET /api/dashboard`
- **Registration**: [server/index.ts:733](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L733)
- **Purpose**: Returns aggregated high-level statistics for dashboard KPI cards.
- **Response Format**: `200 OK`
  ```json
  {
    "filesProcessed": 12,
    "applicantsProcessed": 1544,
    "passedCount": 488,
    "failedCount": 403,
    "manualReviewCount": 653,
    "errorCount": 0,
    "recentImports": [ ... ]
  }
  ```
- **Frontend Caller**: `api.getDashboardStats()` in [src/api/client.ts:71](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L71).
- **Status**: Implemented, tested, and verified.

---

### 5.2 `GET /api/jobs`
- **Registration**: [server/index.ts:973](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L973)
- **Purpose**: Aggregates applicant totals and pass/fail/review distributions grouped by job title.
- **Response Format**: `200 OK` Array of `{ jobTitle, jobId, total, passed, failed, manualReview }`.
- **Frontend Caller**: `api.getJobs()` in [src/api/client.ts:234](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L234).
- **Status**: Implemented, tested, and verified.

---

### 5.3 `GET /api/imports`
- **Registration**: [server/index.ts:985](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L985)
- **Purpose**: Returns historical import records with file details.
- **Response Format**: `200 OK` Array of `ImportRecord` objects.
- **Frontend Caller**: `api.getImports()` in [src/api/client.ts:248](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L248).
- **Status**: Implemented, tested, and verified.

---

### 5.4 `GET /api/audit-logs`
- **Registration**: [server/index.ts:997](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L997)
- **Purpose**: Returns latest 100 immutable audit log entries.
- **Response Format**: `200 OK` Array of `AuditLogEntry` objects.
- **Frontend Caller**: `api.getAuditLogs()` in [src/api/client.ts:255](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L255).
- **Status**: Implemented, tested, and verified.

---

### 5.5 `GET /api/export`
- **Registration**: [server/index.ts:1009](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1009)
- **Query Parameters**: `format` (`xlsx`, `csv`, `tsv`, `json`), `status`, `gender`, `jobId`, `importId`, `template` (`clean` or `full`).
- **Purpose**: Generates and streams a filtered export file. In `clean` mode, exports 8 recruiter columns with normalized role codes; in `full` mode, exports all raw and parsed attributes.
- **Response Format**: Binary stream or JSON.
- **Frontend Caller**: `api.getExportUrl(...)` in [src/api/client.ts:318](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L318).
- **Status**: Implemented, tested, and verified.

---

### 5.6 `GET /api/export-sheets-data`
- **Registration**: [server/index.ts:1115](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1115)
- **Query Parameters**: `status`, `gender`, `jobId`, `jobTitle`, `company`, `importId`, `includeHeaders` (`true` | `false`).
- **Purpose**: Backend endpoint supporting 1-click Google Sheets clipboard copy. Generates pre-formatted TSV strings (`tsv`, `tsvWithHeaders`, `tsvNoHeaders`) using normalized role abbreviations (`DA`, `DE`, `BA`, `DS`, `AWS`, `Cybersecurity`, `QA`).
- **Response Format**: `200 OK`
  ```json
  {
    "total": 488,
    "columns": ["Name", "Job Role", "Gender", "Email", "Phone", "Status", "Match Score", "Matched Reference"],
    "tsv": "Darshan Patel\tDA\tMALE\tdarshan.patel92@gmail.com\t408-555-0182\tPASS\t100%\tdarshan patel\n...",
    "tsvWithHeaders": "...",
    "tsvNoHeaders": "..."
  }
  ```
- **Frontend Caller**: `api.getGoogleSheetsData(...)` in [src/api/client.ts:338](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L338).
- **Status**: Implemented, tested, and verified.

---

## 6. System Utility & Maintenance Endpoints

### 6.1 `POST /api/generate-samples`
- **Registration**: [server/index.ts:1145](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1145)
- **Purpose**: Programmatically generates 5 standard test spreadsheets in `sample_test_files/` (`Business Analyst.xlsx`, `Cybersecurity Analyst.xlsx`, `Data Analyst.xlsx`, `DevOps Engineer.xlsx`, `Prompt_12_Test_Cases.xlsx`).
- **Response Format**: `200 OK` `{ "success": true, "directory": "...", "files": [ ... ] }`.
- **Frontend Caller**: `api.generateSamples()` in [src/api/client.ts:281](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L281).
- **Status**: Implemented, tested, and verified.

---

### 6.2 `POST /api/run-tests`
- **Registration**: [server/index.ts:1326](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1326)
- **Purpose**: Executes the 12 core acceptance test cases against the live screening engine and returns per-test inputs, expected results, actual results, and pass/fail booleans.
- **Response Format**: `200 OK` `{ "success": true, "totalTests": 12, "passedTests": 12, "results": [ ... ] }`.
- **Frontend Caller**: `api.runTests()` in [src/api/client.ts:262](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L262).
- **Status**: Implemented, tested, and verified.

---

### 6.3 `ALL /api/clear-all-data` & `ALL /api/clear-data`
- **Registration**: [server/index.ts:1434](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1434)
- **Purpose**: Maintenance endpoint that truncates all candidate rows, uploaded file records, and audit logs from `linkedin_screening.db` and purges stored files from `uploads/`.
- **Database Writes**: `DELETE FROM applicants`, `DELETE FROM imports`, `DELETE FROM import_files`, `DELETE FROM audit_logs`.
- **Response Format**: `200 OK` `{ "success": true, "applicantsDeleted": n, "importsDeleted": n, "filesDeleted": n }`.
- **Frontend Caller**: `api.clearAllData()` in [src/api/client.ts:415](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L415).
- **Status**: Implemented, tested, and verified.

---

### 6.4 `ALL /api/repair-applicants`
- **Registration**: [server/index.ts:1476](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1476)
- **Purpose**: Maintenance endpoint that re-scans stored raw spreadsheet rows across past imports and applies `repairSplitRows()` to heal historical headline and question splits.
- **Frontend Caller**: `api.repairApplicants()` in [src/api/client.ts:432](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L432).
- **Status**: Implemented, tested, and verified.

---

### 6.5 `ALL /api/reclassify-genders`
- **Registration**: [server/index.ts:1460](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1460)
- **Purpose**: Runs rule-based gender classification on all candidates across the database.
- **Database Writes**: Updates `applicants.gender`.
- **Response Format**: `200 OK` with counts for updated, male, female, unspecified.
- **Status**: Implemented, tested, and verified.

---

### 6.6 Gemini AI Endpoints (`/api/ai/*`)
- **`GET /api/ai/config`** ([server/index.ts:1498](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1498)): Returns whether Gemini is configured, masked key (`AQ.Ab8...BHQ`), and active model.
- **`POST /api/ai/config`** ([server/index.ts:1513](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1513)): Validates submitted Google AI Studio API key with a live ping and saves to `app_settings`.
- **`POST /api/ai/classify`** ([server/index.ts:1549](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1549)): Batches candidates in chunks of 20, sends prompts to Gemini API with exponential backoff on 429/503, and writes AI evaluations to the database.
- **Frontend Caller**: Wrapped by `api.getAiConfig()`, `api.saveAiConfig()`, `api.runAiClassification()` in [src/api/client.ts:448-485](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts#L448-L485).
- **Status**: Implemented, tested, and verified.
