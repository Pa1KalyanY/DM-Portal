# 02. Source Code Inventory & File Catalog

**Document**: Physical Source Tree & File-by-File Technical Specification  
**Audit Target**: `linkedin-application-filter`  
**Root Path**: `c:\Users\yarla\linkedin application filter`  
**Total Source Files**: 32 source code & configuration files (excluding `node_modules` & `dist`)  
**Audit Date**: October 2026

---

## 1. Complete Physical Directory Tree

```
linkedin-application-filter/
├── .env                                  # Local environment configuration (Secrets redacted)
├── .env.example                          # Sample environment variable template
├── .gitignore                            # Git exclusion rules
├── .oxlintrc.json                        # Oxlint static analysis configuration
├── index.html                            # Frontend HTML entry point
├── linkedin_screening.db                 # Primary local SQLite database (DatabaseSync)
├── package.json                          # NPM dependencies and run scripts
├── package-lock.json                     # NPM lockfile
├── README.md                             # Project overview and instructions
├── SYSTEM_ARCHITECTURE_DOCUMENTATION.md  # Comprehensive system documentation
├── supabase_schema.sql                   # Reference cloud PostgreSQL/Supabase DDL schema
├── tsconfig.json                         # TypeScript root project references
├── tsconfig.app.json                     # TypeScript compiler configuration (Frontend)
├── tsconfig.node.json                    # TypeScript compiler configuration (Node/Vite)
├── vite.config.ts                        # Vite build configuration with Tailwind plugin
│
├── .vscode/                              # VS Code editor configuration
│   └── settings.json                     # Workspace editor settings
├── public/                               # Static public web assets
│   ├── favicon.svg                       # LinkedIn blue brand favicon SVG
│   └── icons.svg                         # Sprite vector icons asset
├── dist/                                 # Production client bundle (Generated via npm run build)
│   ├── assets/                           # Bundled JS and CSS chunks
│   ├── index.html                        # Production root HTML
│   ├── favicon.svg                       # Production favicon
│   └── icons.svg                         # Production sprite
│
├── sample_test_files/                    # Automated testing spreadsheets (.xlsx)
│   ├── Business Analyst.xlsx
│   ├── Cybersecurity Analyst.xlsx
│   ├── Data Analyst.xlsx
│   ├── DevOps Engineer.xlsx
│   └── Prompt_12_Test_Cases.xlsx
│
├── scratch/                              # Temporary/ad-hoc developer scratch directory
│
├── uploads/                              # Ingested spreadsheet storage (Multer destination)
│
├── server/                               # Backend Node.js / Express application
│   ├── index.ts                          # Main Express server, routing, file parsing pipeline
│   ├── db.ts                             # SQLite database service, queries, audit logging, dedup
│   ├── geminiService.ts                  # Google Gemini AI client & batch classification runner
│   ├── referenceNameMatcher.ts           # 5-tier reference matcher, token index, scoring engine
│   └── data/                             # Reference datasets
│       ├── reference_names_dataset_1.txt # 9,297 verified reference names
│       └── reference_names_dataset_2.txt # 4,562 verified reference names
│
└── src/                                  # Frontend React application
    ├── App.tsx                           # Main React application shell, view routing, layout
    ├── App.css                           # App-level utility styles
    ├── index.css                         # Tailwind CSS root import & CSS custom properties
    ├── main.tsx                          # React DOM mount entry point
    │
    ├── assets/                           # Static React application assets
    │   ├── hero.png                      # Hero illustration image
    │   ├── react.svg                     # React vector logo
    │   └── vite.svg                      # Vite vector logo
    │
    ├── api/                              # HTTP API client

    │   └── client.ts                     # Fetch wrapper for all 32 backend REST endpoints
    │
    ├── types/                            # TypeScript type definitions
    │   └── index.ts                      # Core models: Applicant, ImportRecord, ScreeningRule, etc.
    │
    ├── shared/                           # Universal business logic (Used by Server & Client)
    │   ├── columnMapper.ts               # Header detection, role normalizer, Google Sheets TSV
    │   ├── genderClassifier.ts           # SSA & International rule-based gender classification
    │   ├── screeningEngine.ts            # Deterministic visa work authorization evaluation
    │   ├── southAsianOriginClassifier.ts # Linguistic regional origin classifier (IN, PK, BD, NP, LK)
    │   └── tabularParser.ts              # RFC-4180 parser & multiline row stitching repair
    │
    ├── components/                       # Shared React UI components
    │   ├── ExportModal.tsx               # Multi-format export dialog (XLSX, CSV, TSV, Sheets copy)
    │   ├── GeminiAiModal.tsx             # Gemini API key management & batch run dialog
    │   ├── Header.tsx                    # Top navigation bar, search input, global actions
    │   ├── ReferenceMatcherModal.tsx     # Reference matcher stats, threshold slider, re-run dialog
    │   ├── Sidebar.tsx                   # Dark navy enterprise navigation sidebar with counters
    │   └── StatusBadge.tsx               # Colored badge component (PASS, FAIL, MANUAL REVIEW)
    │
    └── views/                            # Primary screen views
        ├── ApplicantDetailModal.tsx      # Comprehensive candidate inspector & status override modal
        ├── ApplicantsView.tsx            # Full-window data grid with zoom, 1-click actions, batch bar
        ├── AuditLogsView.tsx             # Security audit trail & transition event viewer
        ├── DashboardView.tsx             # Executive KPI metrics, cards, and pass/fail distributions
        ├── ImportsView.tsx               # Historical batch upload viewer & per-file row audits
        ├── JobsView.tsx                  # Aggregated applicant volumes grouped by job requisition
        ├── ReportsView.tsx               # Printable summary report & compliance breakdown
        ├── ScreeningRulesView.tsx        # Screening policy administration & re-evaluation runner
        ├── TestCasesModal.tsx            # 12 acceptance test cases verification runner modal
        └── UploadView.tsx                # Batch file drag-and-drop & clipboard paste interface
```

---

## 2. File-by-File Detailed Specification

### 2.1 Backend Core Modules (`server/`)

#### 1. `server/index.ts`
- **Purpose**: Main HTTP application entry point, Express server setup, file upload pipeline, spreadsheet repair runner, and REST route controller.
- **Exported Symbols**: None (Entry point script).
- **Key Internal Functions**: `parseWorkbook`, `getFileHash`, `parsePastedText`.
- **Dependencies**: `express`, `cors`, `multer`, `xlsx`, `crypto`, `node:path`, `node:fs`, `node:module` (`pdf-parse`), `./db.js`, `../src/shared/screeningEngine.js`, `../src/shared/columnMapper.js`, `../src/shared/tabularParser.js`, `../src/shared/genderClassifier.js`, `./geminiService.js`, `./referenceNameMatcher.js`.
- **Inputs**: HTTP requests on port 3001, multipart file uploads, JSON payloads.
- **Outputs**: JSON responses, binary `.xlsx` streams, CSV attachments.
- **Database Tables Used**: Interacts with all tables via `dbService`.
- **Usage Status**: **Actively Used** (Primary backend server running under `npm run server`).

#### 2. `server/db.ts`
- **Purpose**: Singleton database abstraction layer encapsulating all synchronous SQLite operations, table creations, safe migrations, audit trail insertions, and candidate deduplication logic.
- **Exported Symbols**: `DatabaseService` (Class), `dbService` (Singleton instance).
- **Key Methods**:
  - `initTables()`, `initDefaultRules()`: Schema creation and initial seed data.
  - `insertApplicantsBatch(applicants)`: High-throughput batch insert wrapped in transaction.
  - `getApplicants(params)`: Paginated, filtered, and sorted candidate queries.
  - `overrideApplicantStatus(id, newStatus, user, reason)`: 1-click or reasoned decision override with audit logging.
  - `batchOverrideApplicantStatus(ids, newStatus, reason, user)`: Atomic bulk status transitions.
  - `updateApplicantGender(id, gender, user)` & `batchUpdateGender(ids, gender, user)`: Inline and bulk gender modifications.
  - `deduplicateApplicants(scope)`: Deterministic grouping by email or name+phone, keeping 1 authoritative PASS record.
  - `runReferenceMatchingOnAll(threshold)`: Re-indexes and re-scores database against reference datasets.
  - `clearAllData()`: Truncates applicants, imports, files, and audit logs.
- **Dependencies**: `node:sqlite` (`DatabaseSync`), `node:path`, `node:fs`, `node:url`, `../src/types`, `../src/shared/screeningEngine.js`, `../src/shared/columnMapper.js`, `../src/shared/southAsianOriginClassifier.js`, `../src/shared/genderClassifier.js`, `./referenceNameMatcher.js`.
- **Tables Managed**: `imports`, `import_files`, `applicants`, `screening_rules`, `audit_logs`, `app_settings`.
- **Usage Status**: **Actively Used** (Primary data engine).

#### 3. `server/referenceNameMatcher.ts`
- **Purpose**: Multi-tier name pattern matcher and linguistic analyzer running against 13,859 reference entries. Enforces negative Western dictionary exclusions and initials filtering.
- **Exported Symbols**: `ReferenceNameMatcherService` (Class), `referenceNameMatcher` (Singleton instance), `normalizeName`, `cleanToken`, `getCanonicalToken`, `NameMatchCategory` (Type), `NameMatchResult` (Type), `ReferenceMatcherStats` (Type).
- **Key Internal Data**:
  - `CANONICAL_SPELLINGS`: Standardizes South Asian transliterations (`chaudhary` $\rightarrow$ `chowdary`, `reddi` $\rightarrow$ `reddy`).
  - `ULTRA_COMMON_TOKENS`: High-frequency tokens (`kumar`, `singh`, `sharma`, `patel`, `reddy`, `rao`) capped at lower score tiers when isolated.
  - `COMMON_NON_SOUTH_ASIAN_NAMES`: 150+ Anglo/Western names blocked from triggering positive South Asian matches.
  - `RECURRENT_SUFFIXES`: Common Telugu/South Indian suffixes (`-gadda`, `-palli`, `-kuri`, `-neni`).
- **Dependencies**: `node:fs`, `node:path`, `node:url`.
- **Inputs**: Candidate full name string.
- **Outputs**: `NameMatchResult` `{ category, score, matchedPattern, matchedReferenceName }`.
- **Usage Status**: **Actively Used** (Integrated into upload ingestion, database rescreening, and applicant modals).

#### 4. `server/geminiService.ts`
- **Purpose**: Optional supplementary AI classification service integrating Google Gemini models (`gemini-2.5-flash`, `gemini-3.5-flash-lite`, `gemini-flash-latest`) via REST with automatic exponential backoff retry on 429/503.
- **Exported Symbols**: `validateGeminiApiKey(apiKey)`, `classifyApplicantsWithGemini(applicants, apiKey, onProgress)`, `GeminiApplicantInput` (Interface), `GeminiClassificationResult` (Interface).
- **Dependencies**: Native global `fetch`.
- **Inputs**: Candidate demographic profiles and Google AI Studio API key.
- **Outputs**: Classification objects with origin country, gender, confidence, and reasoning.
- **Usage Status**: **Actively Used** (Invoked when recruiter triggers Gemini modal from the UI).

---

### 2.2 Universal / Shared Business Logic (`src/shared/`)

#### 5. `src/shared/screeningEngine.ts`
- **Purpose**: Deterministic legal work authorization rules evaluator. Evaluates Green Card / US Citizenship and Future Visa Sponsorship questions.
- **Exported Symbols**: `evaluateScreening(rawText, activeRules, originContext)`, `parseScreeningQuestionsText(rawText)`, `normalizeAnswer(rawAnswer)`, `normalizeQuestion(rawQuestion)`, `isGreenCardQuestion(q)`, `isFutureSponsorshipQuestion(q)`, `isWorkAuthQuestion(q)`.
- **Dependencies**: `../types`, `./southAsianOriginClassifier.js`.
- **Inputs**: Raw multiline screening questions cell from LinkedIn.
- **Outputs**: `ParsedScreeningInfo` object with parsed answers, individual rule statuses, overall status (`PASS`, `FAIL`, `MANUAL_REVIEW`), and reason trail.
- **Usage Status**: **Actively Used** (Core screening algorithm for every candidate row).

#### 6. `src/shared/southAsianOriginClassifier.ts`
- **Purpose**: Rule-based linguistic categorization identifying candidates from India (10 regional states), Pakistan, Bangladesh, Nepal, and Sri Lanka across 2,500+ family names, prefixes, suffixes, and educational institutions.
- **Exported Symbols**: `classifySouthAsianOrigin(fullName, firstName, lastName, headline, educationInstitution, location)`, `OriginResult` (Interface), `SouthAsianOriginType` (Type).
- **Dependencies**: None (Pure TypeScript/JavaScript).
- **False-Positive Guardrails**: Suppresses false positives on European prepositions (e.g. `de` in *Elisandra De La Cruz*), cybersecurity terms (`NIST`), and Western names ending in `-nathan` (*Jonathan*).
- **Usage Status**: **Actively Used** (Called during ingestion, screening engine evaluation, and re-screening).

#### 7. `src/shared/genderClassifier.ts`
- **Purpose**: Rule-based candidate gender classification leveraging US SSA frequency data, international given-name lexicons (Western, South Asian, Arabic/Middle Eastern, East Asian, Hispanic), honorific prefixes, and pronoun extraction.
- **Exported Symbols**: `classifyGender(firstName, fullName, headline)`, `GenderResult` (Interface), `GenderType` (Type).
- **Dependencies**: None.
- **Inputs**: Candidate first name, full name, and headline.
- **Outputs**: `{ gender: 'MALE' | 'FEMALE' | 'UNSPECIFIED', confidence: number, source: string }`.
- **Usage Status**: **Actively Used** (Initializes candidate gender on import and re-classification).

#### 8. `src/shared/columnMapper.ts`
- **Purpose**: Maps 40+ variations in LinkedIn and ATS export column headers to normalized system properties; normalizes job titles to standard industry codes (`DA`, `DE`, `BA`, `DS`, `AWS`, `Cybersecurity`, `QA`); formats tab-separated clipboard data for Google Sheets.
- **Exported Symbols**: `detectHeaderMapping(headers)`, `extractRowValues(row, mapping)`, `sanitizeContactNumber(rawPhone)`, `normalizeJobRole(rawRole, fallbackContext)`, `formatGoogleSheetsRow(applicant)`, `generateGoogleSheetsTsv(rows, includeHeaders)`, `GOOGLE_SHEETS_COLUMNS`, `CANONICAL_COLUMNS`.
- **Dependencies**: None.
- **Usage Status**: **Actively Used** (Used in ingestion, quick-copy, ExportModal, and table rendering).

#### 9. `src/shared/tabularParser.ts`
- **Purpose**: RFC-4180 compliant CSV and TSV parser with an intelligent row repair engine that detects and stitches fragmented rows caused by unquoted line breaks in LinkedIn headlines and screening questions.
- **Exported Symbols**: `parseTabularText(rawText)`, `parseRfc4180(text)`, `repairSplitRows(rows)`.
- **Dependencies**: `xlsx`.
- **Usage Status**: **Actively Used** (Used when processing clipboard pastes and fragmented spreadsheets).

---

### 2.3 Frontend Application Layer (`src/`)

#### 10. `src/App.tsx`
- **Purpose**: Main layout shell, view routing state (`currentTab`), global search bar state, and modal orchestrator.
- **Dependencies**: `react`, `lucide-react`, `./components/*`, `./views/*`, `./api/client`.
- **Usage Status**: **Actively Used** (Top-level application component).

#### 11. `src/api/client.ts`
- **Purpose**: Centralized HTTP client wrapping all REST endpoints with `fetch` calls, URL search parameter construction, and error parsing.
- **Exported Symbols**: `api` (Object with 24 API client methods).
- **Usage Status**: **Actively Used** (Sole communication channel between frontend and backend).

#### 12. `src/types/index.ts`
- **Purpose**: Authoritative TypeScript interface and type definitions for the entire platform (`Applicant`, `ImportRecord`, `ScreeningRule`, `AuditLogEntry`, `DashboardStats`, etc.).
- **Usage Status**: **Actively Used**.

#### 13. `src/views/ApplicantsView.tsx`
- **Purpose**: Primary interactive recruiter workspace. Renders a 13-column zoomable data grid (60% to 125%, 85% default "Fit Table"), floating selection action bar, 1-click status override buttons (`+ PASS`, `Remove`), inline gender dropdowns, deduplication runner, and Google Sheets copy controls.
- **Usage Status**: **Actively Used**.

#### 14. `src/views/ApplicantDetailModal.tsx`
- **Purpose**: Modal displaying full candidate profile details, raw preserved spreadsheet rows, parsed screening question pairs, gender editing, and manual status override history.
- **Usage Status**: **Actively Used**.

#### 15. `src/views/UploadView.tsx`
- **Purpose**: File upload interface supporting drag-and-drop of 1 to 50 files (.xlsx, .xls, .csv, .pdf), pre-validation with row counts and duplicate warnings, and direct clipboard text paste.
- **Usage Status**: **Actively Used**.

#### 16. `src/views/DashboardView.tsx`
- **Purpose**: Executive dashboard displaying KPI summary cards (Files Processed, Applicants Ingested, Pass/Fail/Review counts), pass rate percentages, and recent batch activity.
- **Usage Status**: **Actively Used**.

#### 17. `src/views/ScreeningRulesView.tsx`
- **Purpose**: Administrative panel for reviewing mandatory and optional screening rules and triggering database-wide re-screening.
- **Usage Status**: **Actively Used**.

#### 18. `src/views/JobsView.tsx`
- **Purpose**: Aggregated view grouping applicant volumes, pass rates, and candidate totals by LinkedIn job requisition title.
- **Usage Status**: **Actively Used**.

#### 19. `src/views/ImportsView.tsx`
- **Purpose**: Historical audit log of all batch uploads showing batch name, import code (`IMP-xxxxx`), uploader, timestamp, and per-file breakdown.
- **Usage Status**: **Actively Used**.

#### 20. `src/views/ReportsView.tsx`
- **Purpose**: Executive processing report summary displaying question-by-question breakdown, pass/fail audit metrics, and quick-export buttons.
- **Usage Status**: **Actively Used**.

#### 21. `src/views/AuditLogsView.tsx`
- **Purpose**: Security audit trail viewing table listing all manual overrides, deduplications, and status changes with timestamps and user names.
- **Usage Status**: **Actively Used**.

#### 22. `src/views/TestCasesModal.tsx`
- **Purpose**: Automated test runner modal executing the 12 core acceptance tests against the live screening engine via `/api/run-tests`.
- **Usage Status**: **Actively Used**.

#### 23. `src/components/ExportModal.tsx`
- **Purpose**: Dialog allowing recruiters to export data in multiple formats (XLSX, CSV, TSV, JSON) or copy clean Google Sheets TSV directly to the clipboard.
- **Usage Status**: **Actively Used**.

#### 24. `src/components/ReferenceMatcherModal.tsx`
- **Purpose**: Modal displaying reference dataset statistics (13,859 total names, token counts, top 2-grams), a similarity threshold slider, and an on-demand re-matching runner.
- **Usage Status**: **Actively Used**.

#### 25. `src/components/GeminiAiModal.tsx`
- **Purpose**: Configuration and execution dialog for Google Gemini AI classification with API key validation, model selection, and progress monitoring.
- **Usage Status**: **Actively Used**.

#### 26. `src/components/Header.tsx`, `Sidebar.tsx`, `StatusBadge.tsx`
- **Purpose**: Reusable UI chrome components rendering the top search/action bar, side navigation with live counts, and colored status badges.
- **Usage Status**: **Actively Used**.

---

### 2.4 Data & Configuration Files

#### 27. `server/data/reference_names_dataset_1.txt` & `reference_names_dataset_2.txt`
- **Purpose**: Line-delimited plain text files containing 9,297 and 4,562 reference names respectively. Loaded by `referenceNameMatcher.ts` at startup.
- **Usage Status**: **Actively Used**.

#### 28. `sample_test_files/*.xlsx`
- **Purpose**: 5 pre-packaged Excel test spreadsheets (`Business Analyst.xlsx`, `Cybersecurity Analyst.xlsx`, `Data Analyst.xlsx`, `DevOps Engineer.xlsx`, `Prompt_12_Test_Cases.xlsx`) used for regression testing and demonstration.
- **Usage Status**: **Actively Used**.

#### 29. `supabase_schema.sql`
- **Purpose**: SQL DDL script defining an equivalent PostgreSQL/Supabase schema for cloud deployment.
- **Usage Status**: **Reference / Unused by Local Runtime** (Application currently uses local SQLite `linkedin_screening.db`).

#### 30. `.oxlintrc.json`, `tsconfig*.json`, `vite.config.ts`, `package.json`
- **Purpose**: Linter configuration, TypeScript build settings, Vite bundler plugins (`@tailwindcss/vite`, `@vitejs/plugin-react`), and NPM dependencies.
- **Usage Status**: **Actively Used**.
