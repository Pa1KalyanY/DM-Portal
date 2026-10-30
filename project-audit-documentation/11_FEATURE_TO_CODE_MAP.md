# 11. Cross-Module Dependency & Feature-to-Code Matrix

**Document**: Feature-to-Code Cross-Reference & Impact Analysis  
**Audit Target**: `linkedin-application-filter`  
**Purpose**: Enables incoming engineers and AI assistants to locate every relevant file, route, and database table for any given feature before making changes.  
**Audit Date**: October 2026

---

## 1. Feature-to-Code Matrix

| Business Feature | Frontend Files | API Routes | Backend Services | Database Tables | External Integrations | Tests | Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Multi-File Spreadsheet Upload** | `UploadView.tsx` | `POST /api/validate-files`<br>`POST /api/process-files` | `server/index.ts`<br>`server/db.ts` | `imports`<br>`import_files`<br>`applicants` | SheetJS (`xlsx`)<br>Multer | Acceptance Test 10 & 11 | **Fully Implemented** |
| **Direct Clipboard Paste Ingestion** | `UploadView.tsx` | `POST /api/process-pasted-data` | `tabularParser.ts`<br>`server/index.ts` | `imports`<br>`applicants` | OS Clipboard | Manual Test | **Fully Implemented** |
| **Multiline Row Stitching & Repair** | `UploadView.tsx`<br>`ApplicantsView.tsx` | `ALL /api/repair-applicants` | `tabularParser.ts`<br>`server/db.ts` | `applicants` | None | Acceptance Test 12 | **Fully Implemented** |
| **Deterministic Visa Screening** | `ApplicantsView.tsx`<br>`ApplicantDetailModal.tsx` | Evaluated inside `/api/process-files`<br>`POST /api/reevaluate` | `screeningEngine.ts`<br>`server/db.ts` | `applicants`<br>`screening_rules` | None | Acceptance Tests 1–9 | **Fully Implemented** |
| **South Asian Origin Classification** | `ApplicantsView.tsx`<br>`ApplicantDetailModal.tsx` | Evaluated inside `/api/process-files`<br>`ALL /api/rescreen-all` | `southAsianOriginClassifier.ts`<br>`server/db.ts` | `applicants` | None | Regression Suite (9 cases) | **Fully Implemented** |
| **Rule-Based Gender Classification** | `ApplicantsView.tsx`<br>`ApplicantDetailModal.tsx` | `POST /api/applicants/:id/gender`<br>`POST /api/applicants/batch-gender`<br>`ALL /api/reclassify-genders` | `genderClassifier.ts`<br>`server/db.ts` | `applicants`<br>`audit_logs` | None | Manual UI Verification | **Fully Implemented** |
| **13,859 Reference Name Matching** | `ApplicantsView.tsx`<br>`ReferenceMatcherModal.tsx` | `GET /api/reference-matcher/stats`<br>`POST /api/reference-matcher/match-all`<br>`POST /api/reference-matcher/export` | `referenceNameMatcher.ts`<br>`server/db.ts` | `applicants` | Reference Datasets 1 & 2 | Regression Suite (9 cases) | **Fully Implemented** |
| **Candidate Deduplication Engine** | `ApplicantsView.tsx` | `POST /api/applicants/deduplicate` | `server/db.ts` (`deduplicateApplicants`) | `applicants`<br>`audit_logs`<br>`imports` | None | Executed on DB (360 duplicates removed) | **Fully Implemented** |
| **Recruiter 1-Click Status Override** | `ApplicantsView.tsx`<br>`ApplicantDetailModal.tsx` | `POST /api/applicants/:id/override`<br>`POST /api/applicants/batch-override` | `server/db.ts` | `applicants`<br>`audit_logs` | None | Live Manual Test | **Fully Implemented** |
| **Full-Window Zoom Grid Display** | `ApplicantsView.tsx` | `GET /api/applicants` | `server/db.ts` (`getApplicants`) | `applicants` | None | Live UI Verification | **Fully Implemented** |
| **Google Sheets 1-Click TSV Copy** | `ApplicantsView.tsx`<br>`ExportModal.tsx`<br>`ReportsView.tsx` | `GET /api/export-sheets-data` | `columnMapper.ts`<br>`server/index.ts` | `applicants` | Google Sheets (Clipboard Ctrl+V) | Live Clipboard Test | **Fully Implemented** |
| **Standardized Job Role Mapping** | `ApplicantsView.tsx`<br>`ExportModal.tsx` | `GET /api/export`<br>`GET /api/export-sheets-data` | `columnMapper.ts` (`normalizeJobRole`) | `applicants` | Excel / Sheets | Role Code Verification | **Fully Implemented** |
| **Binary Excel Workbook (.xlsx) Export** | `ExportModal.tsx`<br>`ReportsView.tsx` | `GET /api/export` | `server/index.ts`<br>`server/db.ts` | `applicants` | SheetJS (`xlsx`) | Live Download Test | **Fully Implemented** |
| **Optional Google Gemini AI Assistant** | `GeminiAiModal.tsx` | `GET /api/ai/config`<br>`POST /api/ai/config`<br>`POST /api/ai/classify` | `geminiService.ts`<br>`server/db.ts` | `applicants`<br>`app_settings` | Google AI Studio REST API | API Ping Validation | **Partially Implemented** |
| **Executive Dashboard & Job Summaries** | `DashboardView.tsx`<br>`JobsView.tsx`<br>`Sidebar.tsx` | `GET /api/dashboard`<br>`GET /api/jobs`<br>`GET /api/imports` | `server/db.ts` | `applicants`<br>`imports`<br>`import_files` | None | Live API Verification | **Fully Implemented** |
| **Audit Trail & System History** | `AuditLogsView.tsx`<br>`ImportsView.tsx` | `GET /api/audit-logs`<br>`GET /api/imports` | `server/db.ts` | `audit_logs`<br>`imports` | None | Live API Verification | **Fully Implemented** |
| **Database Reset & Purge** | `Header.tsx` | `ALL /api/clear-all-data` | `server/db.ts` (`clearAllData`) | `applicants`<br>`imports`<br>`import_files`<br>`audit_logs` | Filesystem (`/uploads`) | Verified in Dev | **Fully Implemented** |

---

## 2. High-Risk Files & Shared Hub Modules

Modifications to the following files carry high architectural risk and could inadvertently cause cross-cutting regressions:

### 1. `src/shared/screeningEngine.ts`
- **Impact Level**: **CRITICAL**
- **Why**: Governs whether candidates are marked `PASS`, `FAIL`, or `MANUAL_REVIEW`. A small bug in regex matching or boolean normalization will directly corrupt legal compliance decisions for thousands of candidates.
- **Affected Features**: Ingestion pipeline, rule re-evaluations, acceptance tests, reports.

### 2. `server/db.ts`
- **Impact Level**: **CRITICAL**
- **Why**: Handles all database writes, schema migrations, audit logging, and candidate deduplication. Because operations run synchronously on `node:sqlite DatabaseSync`, an unhandled error inside a transaction or query will crash the backend process.
- **Affected Features**: Entire application persistence layer.

### 3. `src/shared/columnMapper.ts`
- **Impact Level**: **HIGH**
- **Why**: Defines the canonical header recognition dictionary, contact sanitization rules, Google Sheets TSV export formatting, and job role abbreviation logic (`normalizeJobRole`).
- **Affected Features**: Upload validation, candidate data extraction, table role display, Google Sheets copy, Excel export.

### 4. `server/referenceNameMatcher.ts`
- **Impact Level**: **HIGH**
- **Why**: Evaluates name similarity across 12,558 unique reference entries. Adjusting thresholds, token extraction logic, or the Western negative dictionary can re-introduce false positive `Strong Match` ratings on Western names or single-letter initials.
- **Affected Features**: Ingestion, candidate search filters, matcher statistics modal, reference export.

### 5. `src/views/ApplicantsView.tsx`
- **Impact Level**: **HIGH**
- **Why**: The largest frontend component (1,171 lines) containing table state, zoom scaling, inline dropdowns, 1-click status actions, and floating batch operations.
- **Affected Features**: Entire recruiter workspace experience.

---

## 3. Potential Regression Points & Fragile Assumptions

1. **Synchronous Database Concurrency**: If multiple recruiters make concurrent requests while a large batch is being ingested or deduplicated, `DatabaseSync` blocks the thread.
2. **Column Position Assumptions in Fragmented Rows**: `tabularParser.ts` `mergeShiftedHeadlineRow` assumes a specific column order for shifted cells. If LinkedIn modifies the sequence of columns in their export files, the shifted row repair logic could misassign fields.
3. **Hardcoded User Identity**: `Recruiter Admin` is hardcoded across multiple files. If real authentication is added, all audit logging and override endpoints will need refactoring to accept authenticated user session tokens.
