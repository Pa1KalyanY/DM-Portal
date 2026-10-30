# Source Code Inventory & File Catalog

**Repository:** Master Database for AaraTech & ClinisolTech  
**Audit Scope:** Complete Repository Filesystem (excluding `node_modules` and compiled `dist`)  
**Status Categories:** `Actively Used`, `Configuration`, `Development / Scratch Script`, `Asset`  

---

## 1. Complete Directory Tree

```
c:\Users\yarla\OneDrive\Documents\Desktop\Master database for Aaratech & Clinisoltech
├── .env                                   # Local runtime environment variables
├── .env.example                           # Template environment configuration
├── .gitignore                             # Git ignore rules
├── .vscode/
│   └── settings.json                      # VS Code Live Server workspace port settings
├── index.html                             # Single Page Application HTML root template
├── package.json                           # Dependencies and build scripts
├── package-lock.json                      # Dependency lockfile
├── tsconfig.json                          # TypeScript compiler configuration
├── vite.config.ts                         # Vite build configuration with React & Tailwind plugins
├── scratch_test_aditi.ts                  # Root scratch test for pasted text parser
├── scratch_test_values.ts                 # Root scratch test for phone/email normalization
├── public/
│   ├── favicon.svg                        # Application favicon icon
│   └── icons.svg                          # SVG sprite definitions for UI icons
├── src/
│   ├── App.tsx                            # Root application view, router, global modal provider
│   ├── main.tsx                           # Application React DOM root entry point
│   ├── index.css                          # Global typography, Tailwind imports, scrollbar styling
│   ├── vite-env.d.ts                      # Vite client environment typing definitions
│   ├── assets/
│   │   ├── hero.png                       # Static visual asset
│   │   ├── typescript.svg                 # Static visual asset
│   │   └── vite.svg                       # Static visual asset
│   ├── types/
│   │   ├── database.ts                    # Core TypeScript models for database & CRM entities
│   │   └── import.ts                      # TypeScript models for column mapping & staged rows
│   ├── lib/
│   │   ├── authService.ts                 # Authentication service (Supabase Auth + local demo)
│   │   ├── dbService.ts                   # Central state store, IndexedDB cache & Supabase sync
│   │   ├── geminiService.ts               # Google Gemini REST API client & extraction logic
│   │   ├── genderDetection.ts             # Name & notes gender classification engine
│   │   ├── importEngine.ts                # Ingestion, parsing, column mapping & execution
│   │   ├── indexedDb.ts                   # Permanent browser storage via native IndexedDB
│   │   ├── matchingEngine.ts              # Duplicate evaluation, Levenshtein & decision matrix
│   │   ├── migrationSql.ts                # PostgreSQL schema SQL definitions for settings
│   │   ├── normalization.ts               # E.164 phone, canonical email, and name normalization
│   │   ├── supabase.ts                    # Supabase client instantiation & health ping
│   │   ├── testDataGenerator.ts           # Generator for acceptance test Excel files
│   │   └── uuid.ts                        # UUID generation utility
│   └── components/
│       ├── auth/
│       │   └── AuthView.tsx               # Enterprise login & password reset portal
│       ├── candidates/
│       │   ├── CandidateProfileView.tsx   # Detailed 360-degree candidate profile view
│       │   ├── CandidatesListView.tsx     # Master candidates data table with zoom & filters
│       │   ├── EditCandidateModal.tsx     # Modal form to edit full candidate profile
│       │   └── TimelineTab.tsx            # Activity history timeline component
│       ├── dashboard/
│       │   └── DashboardView.tsx          # Key metrics, company toggles & recent activities
│       ├── import/
│       │   └── ImportView.tsx             # File upload, paste box, column mapper & runner
│       ├── incomplete/
│       │   ├── GeminiRescueModal.tsx      # AI incomplete records batch rescue modal
│       │   └── IncompleteProfilesView.tsx # Quarantine queue review & promotion table
│       ├── jobs/
│       │   └── JobsView.tsx               # Requisitions manager for AaraTech & ClinisolTech
│       ├── layout/
│       │   ├── Header.tsx                 # Top bar with search, company switch & DB status
│       │   └── Sidebar.tsx                # Left navigation bar with badge counts
│       ├── matches/
│       │   ├── GeminiMatchModal.tsx       # AI duplicate verification modal
│       │   └── PossibleMatchesView.tsx    # Possible duplicates side-by-side comparison
│       ├── merge/
│       │   └── MergeCandidatesView.tsx    # Administrative manual merge & unmerge center
│       ├── reports/
│       │   └── ReportsView.tsx            # System KPI & database health reports
│       ├── search/
│       │   └── GlobalSearchView.tsx       # Dedicated search interface with match reasons
│       └── settings/
│           └── SettingsView.tsx           # Supabase & Gemini API credentials manager
├── supabase/
│   └── migrations/
│       └── 20261008000001_master_database_schema.sql # Canonical PostgreSQL DDL script
└── scratch/                               # Test scripts and temporary data inspections
```

---

## 2. Detailed Source Code Inventory

### 2.1 Core Application Shell & Routing

#### `src/main.tsx`
- **Relative Path:** `src/main.tsx`
- **Purpose:** Entry point for React 19 application; mounts `<App />` into the DOM `#root` container.
- **Exported Symbols:** None (Application entry file).
- **Dependencies:** `react`, `react-dom/client`, `./App`, `./index.css`.
- **Inputs/Outputs:** Mounts DOM element `root`.
- **Tables/APIs Used:** None directly.
- **Status:** **Actively Used**.

#### `src/App.tsx`
- **Relative Path:** `src/App.tsx`
- **Purpose:** Central application controller. Manages session state, global navigation (`activePage`), badge counters for possible matches and incomplete profiles, global company filter, and password change modal.
- **Exported Symbols:** `App` (React Functional Component), default export.
- **Dependencies:** React hooks, `Sidebar`, `Header`, 11 component views, `checkSupabaseHealth`, `dbService`, `authService`, Lucide icons.
- **Inputs/Outputs:** Manages top-level application state.
- **Tables/APIs Used:** Calls `dbService.getPossibleMatches()`, `dbService.getIncompleteCount()`, `dbService.autoRecoverIncompleteRecords()`, `checkSupabaseHealth()`.
- **Status:** **Actively Used**.

---

### 2.2 Core Business Logic & Infrastructure (`src/lib/`)

#### `src/lib/dbService.ts`
- **Relative Path:** `src/lib/dbService.ts`
- **Purpose:** Master data management service and state store. Implements in-memory caching (`LocalDatabaseStore`), native IndexedDB persistence, background parallel batch synchronization with Supabase, candidate CRUD, status/owner/gender updates, merge/unmerge execution, possible duplicate resolution, and quarantine auto-recovery.
- **Exported Symbols:**
  - `dbService`: Singleton instance of `LocalDatabaseStore`.
  - `INITIAL_JOBS`: Array of 31 baseline pre-configured jobs.
  - `SEED_PEOPLE`, `INITIAL_POSSIBLE_MATCHES`, `INITIAL_IMPORTS`: Baseline seed arrays.
  - `getCandidateDateApplied(p: Person): string`: Application date resolution helper.
- **Dependencies:** `supabase.ts`, `indexedDb.ts`, `uuid.ts`, `types/database.ts`, `normalization.ts`, `genderDetection.ts`, `geminiService.ts`, `importEngine.ts`, `matchingEngine.ts`.
- **Inputs/Outputs:** CRUD queries, batch sync objects, statistics objects.
- **Tables/APIs Used:** `people`, `person_emails`, `person_phones`, `jobs`, `applications`, `recruiter_contacts`, `imports`, `possible_matches`, `merge_history`, `audit_log`, `incomplete_records`.
- **Status:** **Actively Used** (Highest criticality module in the application).

#### `src/lib/importEngine.ts`
- **Relative Path:** `src/lib/importEngine.ts`
- **Purpose:** Complete spreadsheet ingestion and column mapping engine. Handles parsing of `.xlsx`, `.xls`, `.csv`, raw copy-pasted text, vertical candidate blocks, auto-detection of column headers, phone/email validation, date formatting, and execution of import batches into master profiles.
- **Exported Symbols:**
  - `parseDateStringToYMD(val: any): string | null`
  - `isDateString(val: any): boolean`
  - `TECH_ROLES_SET`: Set of technical keywords.
  - `isRoleOrTech(s: any): boolean`
  - `extractCleanPhone(val: any): string | null`
  - `CONVERSATIONAL_WORDS`: Set of conversational stopwords.
  - `isScreeningNote(val: any): boolean`
  - `isHeaderOrLabelWord(val: any): boolean`
  - `isValidCandidateName(name: string | null | undefined): boolean`
  - `extractCandidateName(text: any): { name: string | null; remaining: string }`
  - `US_STATE_CODES`, `US_STATES`, `US_CITIES`: Location lookup sets.
  - `isLocationOrCountry(val: any): boolean`
  - `AREA_CODE_MAP`: US telephone area code mapping.
  - `inferLocationFromPhone(phone?: string | null): string | null`
  - `extractLocationFromFeedback(feedback?: string | null): string | null`
  - `resolveCandidateLocation(...)`
  - `COLUMN_PATTERNS`: Dictionary of regex patterns for auto-column mapping.
  - `autoDetectMappings(headers: string[], sampleRows?: Record<string, any>[]): ColumnMappingConfig[]`
  - `detectHeaderColumns(cells: string[]): Record<string, number> | null`
  - `parseVerticalCandidateBlocks(lines: string[]): Record<string, any>[]`
  - `parseHorizontalCandidateLine(line: string): Record<string, any> | null`
  - `convertPastedTextToFile(rawText: string, customName?: string): File`
  - `parseFileForPreview(file: File, selectedSheet?: string): Promise<ImportPreviewData>`
  - `executeImport(...)`: Main batch import processor.
- **Dependencies:** `xlsx`, `types/import.ts`, `types/database.ts`, `normalization.ts`, `matchingEngine.ts`, `genderDetection.ts`, `geminiService.ts`, `uuid.ts`.
- **Status:** **Actively Used**.

#### `src/lib/matchingEngine.ts`
- **Relative Path:** `src/lib/matchingEngine.ts`
- **Purpose:** Authoritative duplicate detection and decision engine conforming strictly to recruiting rules. Implements string similarity (Levenshtein distance), phone/email normalization comparison, and user-specified decision rules (Rules 1, 2, 3, 4, 5, cross-company separation).
- **Exported Symbols:**
  - `normalizeCandidateName(name: string | null | undefined): string`
  - `compareCandidateNames(nameA?: string | null, nameB?: string | null): 'Exact' | 'Similar' | 'Different'`
  - `normalizeEmailForComparison(email: string | null | undefined): string | null`
  - `compareEmails(...)`: Status and matched email extraction.
  - `normalizePhoneForComparison(phone: string | null | undefined): string | null`
  - `comparePhones(...)`: Status and matched phone extraction.
  - `getAllCandidateEmails(p: Person): string[]`
  - `getAllCandidatePhones(p: Person): string[]`
  - `evaluateCandidatePair(candidateA: Person, candidateB: Person, options?: any): DuplicateDecisionResult`
  - `evaluateDuplicateMatch(incoming: MatchCandidateCriteria, existingPeople: Person[]): MatchResult`
- **Dependencies:** `types/database.ts`.
- **Status:** **Actively Used**.

#### `src/lib/genderDetection.ts`
- **Relative Path:** `src/lib/genderDetection.ts`
- **Purpose:** High-precision cultural and heuristic gender classification engine. Accurately determines Male, Female, Other, or Unspecified using explicit spreadsheet values, honorific salutations, recruiter screening note prefixes (e.g. `Female/Not Interested`, `M/OPT`), a 2,000+ token Western and South Asian first-name lexicon, compound name rules, and morphological suffix patterns.
- **Exported Symbols:**
  - `detectGender(rawGenderOrOptions?: any, firstNameArg?: string | null, fullNameArg?: string | null, notesArg?: string | null): Gender`
  - `DetectGenderOptions`: Parameter interface.
- **Dependencies:** `types/database.ts`.
- **Status:** **Actively Used**.

#### `src/lib/normalization.ts`
- **Relative Path:** `src/lib/normalization.ts`
- **Purpose:** Strict data cleaning and normalization utilities. Normalizes emails, auto-heals common domain typos (`@gmailcom` -> `@gmail.com`), standardizes US/international phone numbers, normalizes LinkedIn URLs, strips invalid titles from candidate names, extracts candidate names from email handles, and cleans job titles.
- **Exported Symbols:**
  - `normalizeEmail(email: string | null | undefined): NormalizedEmailResult | null`
  - `normalizePhone(phone: string | null | undefined): NormalizedPhoneResult | null`
  - `normalizeLinkedInUrl(url: string | null | undefined): string | null`
  - `isPhoneNumber(val: string | null | undefined): boolean`
  - `extractCandidateNameFromEmail(email: string | null | undefined): string | null`
  - `ATS_ROLE_KEYWORDS`: Set of role abbreviation keywords.
  - `isATSJobRoleTitle(val: string | null | undefined): boolean`
  - `parseAndNormalizeName(...)`
  - `cleanJobTitle(role: string | null | undefined, defaultRole?: string): string`
- **Dependencies:** None.
- **Status:** **Actively Used**.

#### `src/lib/geminiService.ts`
- **Relative Path:** `src/lib/geminiService.ts`
- **Purpose:** Integration wrapper for Google Gemini Generative AI REST API. Performs direct candidate extraction from unstructured text leads, AI re-verification of possible duplicate matches, pre-import lead enhancement, and rescue of quarantined incomplete profiles.
- **Exported Symbols:**
  - `geminiService`: Singleton object with API methods: `getModel`, `setModel`, `getApiKey`, `setApiKey`, `clearApiKey`, `hasApiKey`, `testConnection`, `callGemini`, `verifyPossibleMatches`, `rescueIncompleteProfiles`, `extractCandidatesFromRawText`, `createWorkbookFromCandidates`, `enhanceRowsWithGemini`.
  - Type interfaces: `GeminiExtractedCandidate`, `GeminiMatchVerification`, `GeminiIncompleteRescue`.
- **Dependencies:** `xlsx`, `types/database.ts`, `importEngine.ts`, `normalization.ts`.
- **External Endpoints Used:** `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.
- **Status:** **Actively Used** (Contains Critical Finding: hardcoded API key fallback).

#### `src/lib/indexedDb.ts`
- **Relative Path:** `src/lib/indexedDb.ts`
- **Purpose:** Native browser storage engine managing IndexedDB database `aaratech_clinisoltech_master_db` (Version 2). Provides persistent storage across 8 object stores: `people`, `jobs`, `imports`, `possibleMatches`, `auditLogs`, `mergeHistories`, `incompleteRecords`, and `settings`.
- **Exported Symbols:**
  - `indexedDBService`: Singleton instance of `IndexedDBManager`.
  - `DBStoreName`: Type union of valid store names.
- **Dependencies:** `types/database.ts`.
- **Status:** **Actively Used**.

#### `src/lib/supabase.ts`
- **Relative Path:** `src/lib/supabase.ts`
- **Purpose:** Initializes and caches the `@supabase/supabase-js` client. Provides credential resolution (checking `localStorage` first, then `import.meta.env`), credential saving/clearing, and a health check ping query against PostgreSQL `people`.
- **Exported Symbols:**
  - `getSupabaseCredentials()`
  - `saveSupabaseCredentials(url: string, anonKey: string): void`
  - `clearSupabaseCredentials(): void`
  - `getSupabaseClient(): SupabaseClient | null`
  - `checkSupabaseHealth(): Promise<HealthCheckResult>`
  - `HealthCheckResult`: Health status interface.
- **Dependencies:** `@supabase/supabase-js`.
- **Status:** **Actively Used**.

#### `src/lib/authService.ts`
- **Relative Path:** `src/lib/authService.ts`
- **Purpose:** Manages user authentication and enterprise sessions for the Digital Marketing team. Supports live Supabase Auth (`signInWithPassword`, `resetPasswordForEmail`, `updateUser`) with graceful fallback to seeded demo accounts (`marketing@aaratech.com`, `admin@aaratech.com`, `marketing@clinisoltech.com`).
- **Exported Symbols:**
  - `authService`: Service singleton with methods: `getCurrentSession`, `signIn`, `requestPasswordReset`, `updatePassword`, `signOut`.
  - `UserSession`: Interface for active user context.
- **Dependencies:** `supabase.ts`.
- **Status:** **Actively Used**.

#### `src/lib/migrationSql.ts`
- **Relative Path:** `src/lib/migrationSql.ts`
- **Purpose:** Exports the complete PostgreSQL DDL migration script as a TypeScript string literal (`MASTER_SCHEMA_SQL`) so administrators can view or copy it from the Settings view.
- **Exported Symbols:** `MASTER_SCHEMA_SQL`.
- **Dependencies:** None.
- **Status:** **Actively Used** (Discrepancy: Missing `incomplete_records` table definition present in `.sql` file).

#### `src/lib/testDataGenerator.ts`
- **Relative Path:** `src/lib/testDataGenerator.ts`
- **Purpose:** Generates synthetic Excel test files (File A, File B, File C) for verifying duplicate detection and auto-merge scenarios in the UI.
- **Exported Symbols:**
  - `generateAcceptanceTestFiles()`
  - `downloadBlob(blob: Blob, fileName: string): void`
- **Dependencies:** `xlsx`.
- **Status:** **Actively Used**.

#### `src/lib/uuid.ts`
- **Relative Path:** `src/lib/uuid.ts`
- **Purpose:** Generates RFC4122 version 4 UUIDs using `crypto.randomUUID()` where available, with a pseudo-random fallback.
- **Exported Symbols:** `generateUuid(): string`.
- **Dependencies:** None.
- **Status:** **Actively Used**.

---

### 2.3 User Interface Components (`src/components/`)

| File Path | Description & Responsibilities | Key Child Components / Modals Used | Status |
| :--- | :--- | :--- | :---: |
| `src/components/auth/AuthView.tsx` | Enterprise login, forgot password, and reset password portal | Quick login pills, password input | Actively Used |
| `src/components/layout/Header.tsx` | Top application header with global search, company switcher, and Supabase status | Company switch buttons, user dropdown | Actively Used |
| `src/components/layout/Sidebar.tsx` | Dark Navy enterprise sidebar navigation with active route highlights & badge counters | Navigation buttons, phase status indicator | Actively Used |
| `src/components/dashboard/DashboardView.tsx` | Executive dashboard showing KPI cards, company breakdown, gender charts, and recent activity | Metric cards, company view switch | Actively Used |
| `src/components/candidates/CandidatesListView.tsx` | Comprehensive candidate data table with table zoom, 9 filters, bulk actions, and export | Table zoom, quick assign modal, add candidate modal | Actively Used |
| `src/components/candidates/CandidateProfileView.tsx` | 360-degree candidate detail view with 5 tabs: timeline, applications, recruiter notes, documents, related | `TimelineTab`, `EditCandidateModal`, status modal, owner modal | Actively Used |
| `src/components/candidates/EditCandidateModal.tsx` | Form modal allowing full candidate attribute modification | Input fields for personal details & contacts | Actively Used |
| `src/components/candidates/TimelineTab.tsx` | Chronological activity feed showing recruiter contacts, status changes, and applications | Activity icons, timeline cards | Actively Used |
| `src/components/import/ImportView.tsx` | Multi-mode ingestion view: Excel upload, copy-paste raw text, AI extraction, column mapping, progress bar | Column mapper table, sheet selector, report dialog | Actively Used |
| `src/components/incomplete/IncompleteProfilesView.tsx` | Quarantine queue table for incomplete leads, with single-click promotion and orphan purge | `GeminiRescueModal`, review & edit modal | Actively Used |
| `src/components/incomplete/GeminiRescueModal.tsx` | AI batch rescue modal parsing unstructured notes into verified candidate profiles | Model selector, API key config, rescue table | Actively Used |
| `src/components/matches/PossibleMatchesView.tsx` | Side-by-side comparison of duplicate candidates with manual merge, reject, and auto-merge dry run | `GeminiMatchModal`, merge confirmation dialog | Actively Used |
| `src/components/matches/GeminiMatchModal.tsx` | AI modal evaluating candidate pairs against recruiting rules using Gemini | AI insight cards, auto-merge batch executor | Actively Used |
| `src/components/merge/MergeCandidatesView.tsx` | Manual merge pairing view and reversible unmerge history audit table | Company selector, pair comparison, unmerge action | Actively Used |
| `src/components/jobs/JobsView.tsx` | Job requisition management for AaraTech (21 slots) and ClinisolTech (10 slots) | Add job modal, status toggle buttons | Actively Used |
| `src/components/reports/ReportsView.tsx` | Operational reporting on candidate pipeline volumes, deduplication ratios, and import history | Metric summaries, status breakdown bars | Actively Used |
| `src/components/search/GlobalSearchView.tsx` | Dedicated search view showing matching criteria (name, email, phone, ID, or LinkedIn) | Search input, candidate result cards | Actively Used |
| `src/components/settings/SettingsView.tsx` | Configuration center for Supabase connection, Gemini API key, IndexedDB stats, and SQL copy | Credential inputs, health ping, SQL viewer | Actively Used |

---

### 2.4 Database DDL & Schema Migrations (`supabase/`)

#### `supabase/migrations/20261008000001_master_database_schema.sql`
- **Relative Path:** `supabase/migrations/20261008000001_master_database_schema.sql`
- **Purpose:** Canonical PostgreSQL migration script. Creates sequences (`person_id_seq`, `import_id_seq`, `match_code_seq`), 13 tables, extensions (`uuid-ossp`, `pg_trgm`), indexes (including trigram index `idx_people_full_name_trgm`), seed jobs (31 slots), and Row-Level Security policies.
- **Dependencies:** PostgreSQL 15+, Supabase.
- **Status:** **Actively Used** (Canonical schema definition).

---

### 2.5 Development Scripts & Scratch Files (`scratch/` & Workspace Root)

The repository contains 54 development scripts in `scratch/` and 2 standalone test scripts at workspace root. These scripts were authored during rapid prototyping and test automation, and are excluded from the Vite production bundle:

#### Root Development Scripts
| File Path | Language | Purpose / Scope | Target System |
| :--- | :--- | :--- | :--- |
| `scratch_test_aditi.ts` | TypeScript | Verifies pasted lead conversion for sample candidate 'Aditi Sangle' | `src/lib/importEngine.ts` |
| `scratch_test_values.ts` | TypeScript | Verifies phone extraction and canonical email normalization on sample row | `src/lib/normalization.ts` |

#### Dedup & Pipeline Acceptance Suites (`scratch/`)
| File Path | Type | Description | Target Component |
| :--- | :--- | :--- | :--- |
| `scratch/test_28_complete_acceptance.mjs` | Node ESM | Comprehensive 28-scenario duplicate detection and auto-merge validation suite | `matchingEngine.ts`, `dbService.ts` |
| `scratch/test_20_acceptance_scenarios.mjs` | Node ESM | Precursor 20-scenario deduplication acceptance suite | `matchingEngine.ts` |
| `scratch/test_assembler.mjs` | Node ESM | Tests candidate record reconstruction from fragmented import row tokens | `importEngine.ts` |
| `scratch/test_batch_sim.ts` | TypeScript | Simulates concurrent multi-row batch staging and candidate insertion | `importEngine.ts` |
| `scratch/test_data_only_paste.mjs` | Node ESM | Tests clipboard parsing when user pastes tab-separated data without headers | `importEngine.ts` |
| `scratch/test_detect_headers.mjs` | Node ESM | Validates auto-header detection regex patterns against sample spreadsheets | `importEngine.ts` |
| `scratch/test_no_email_col.mjs` | Node ESM | Verifies fallback candidate creation when input data lacks an email column | `importEngine.ts` |
| `scratch/test_classify.mjs` | Node ESM | Quick classification check for staged lead tokens | `importEngine.ts` |
| `scratch/testIncompleteFilter.mjs` | Node ESM | Tests filtering query logic for identifying incomplete candidate profiles | `dbService.ts` |

#### Contact Normalization, Email Healing & Name Parsing (`scratch/`)
| File Path | Type | Description | Target Component |
| :--- | :--- | :--- | :--- |
| `scratch/run_heal_supabase.mjs` | Node ESM | Batch remediation script that repairs malformed emails and phone numbers in Supabase | Remote Supabase |
| `scratch/check_recoverable_contacts.mjs` | Node ESM | Scans candidate records to count leads recoverable via domain/format healing | `dbService.ts` |
| `scratch/testEmailHealing.mjs` | Node ESM | Unit test script verifying email syntax healing regexes (e.g. `user@gmailcom`) | `normalization.ts` |
| `scratch/test_email_issue.mjs` | Node ESM | Investigates specific edge-case email parsing failures | `normalization.ts` |
| `scratch/test_email_name_extractor.mjs` | Node ESM | Tests extracting candidate first and last names from email local-parts | `normalization.ts` |
| `scratch/test_why_email_missing.mjs` | Node ESM | Diagnostic script analyzing candidate rows created without email addresses | `importEngine.ts` |
| `scratch/test_recovery_verification.mjs` | Node ESM | Verifies contact recovery accuracy against known corrupted test cases | `normalization.ts` |
| `scratch/verify_end_to_end_recovery.mjs` | Node ESM | End-to-end integration test of contact recovery and DB update pipeline | `dbService.ts` |
| `scratch/inspect_phone_names.js` | Node CJS | Inspects instances where phone numbers were misplaced into candidate name fields | Database records |
| `scratch/inspect_phone_names.mjs` | Node ESM | ESM variant of misplaced phone number inspector | Database records |
| `scratch/test_location_and_email_complete.mjs` | Node ESM | Tests simultaneous extraction of candidate US location and healed email | `importEngine.ts` |
| `scratch/test_location_debug.mjs` | Node ESM | Debug runner for regex-based US state and city token recognition | `importEngine.ts` |

#### Gender Classification & Cultural Name Heuristics (`scratch/`)
| File Path | Type | Description | Target Component |
| :--- | :--- | :--- | :--- |
| `scratch/analyze_all_people.mjs` | Node ESM | Evaluates gender detection accuracy across all stored candidate records | `genderDetection.ts` |
| `scratch/analyze_db_gender.ts` | TypeScript | Generates gender breakdown statistics from local database state | `genderDetection.ts` |
| `scratch/check_accuracy.ts` | TypeScript | Measures false-positive and false-negative rates for gender classification | `genderDetection.ts` |
| `scratch/check_all_gender.ts` | TypeScript | Comprehensive gender classification verification against test corpus | `genderDetection.ts` |
| `scratch/inspect_unspecified.ts` | TypeScript | Extracts candidate records classified as `Unspecified` to identify missing names | `genderDetection.ts` |
| `scratch/test_enhanced_detection.ts` | TypeScript | Tests supplemental Indian and Western cultural name dictionaries | `genderDetection.ts` |
| `scratch/test_gender_detection.ts` | TypeScript | Core unit test runner for name token classification and recruiter note heuristics | `genderDetection.ts` |
| `scratch/test_with_additional.ts` | TypeScript | Benchmark comparing gender detection accuracy with supplemental datasets | `genderDetection.ts` |
| `scratch/top_unspecified_tokens.ts` | TypeScript | Frequency analysis script identifying top first-name tokens yielding `Unspecified` | `genderDetection.ts` |

#### Database Inspection, Sync & Data Audit Utilities (`scratch/`)
| File Path | Type | Description | Target Component |
| :--- | :--- | :--- | :--- |
| `scratch/testSupabase.mjs` | Node ESM | Tests live Supabase client connection, authentication, and table queries | `supabase.ts` |
| `scratch/inspect_supabase_people.mjs` | Node ESM | Queries and dumps people records from live Supabase PostgreSQL instance | Remote Supabase |
| `scratch/inspectCandidates.mjs` | Node ESM | Queries candidate counts, flags, and company distribution | `dbService.ts` |
| `scratch/inspect_incomplete.mjs` | Node ESM | Inspects records currently quarantined in the incomplete profiles queue | `dbService.ts` |
| `scratch/inspect_screenshot_candidates.mjs` | Node ESM | Cross-references specific candidate records observed in UI screenshot reports | Database records |
| `scratch/checkAudit.mjs` | Node ESM | Queries and formats records from the `audit_log` table | Database records |
| `scratch/checkBatches.mjs` | Node ESM | Inspects import batch IDs and verifies row grouping integrity | `import_rows` |
| `scratch/checkEmails.mjs` | Node ESM | Audits email formatting and primary flag assignments across `person_emails` | Database records |
| `scratch/checkImpBatch.mjs` | Node ESM | Inspects row status and errors for a specific import batch ID | `imports` |
| `scratch/checkImportsTable.mjs` | Node ESM | Dumps records from `imports` and `import_rows` tables | Database records |
| `scratch/checkPromoted.mjs` | Node ESM | Verifies candidates promoted from incomplete status to master database | `dbService.ts` |
| `scratch/check_import.mjs` | Node ESM | Quick check of recent import batch metadata and total staged rows | `imports` |
| `scratch/check_import_details.mjs` | Node ESM | Detailed inspection of staged import rows, column mappings, and raw JSON | `import_rows` |
| `scratch/find_ajith.mjs` | Node ESM | Targeted diagnostic search for specific candidate record 'Ajith' | Database records |
| `scratch/find_candidates.mjs` | Node ESM | Multi-field search script across candidate database | Database records |
| `scratch/findEmailsInFeedback.mjs` | Node ESM | Scans recruiter feedback notes to extract embedded email addresses | Recruiter notes |
| `scratch/findInDownloads.mjs` | Node ESM | Scans user downloads folder for candidate export spreadsheets | File system |
| `scratch/findSourceFile.mjs` | Node ESM | Utility script to locate raw candidate source files on disk | File system |
| `scratch/readExcel.mjs` | Node ESM | Direct XLSX spreadsheet parser for inspecting raw test files | Local files |
| `scratch/test_db_autorecover.mjs` | Node ESM | Simulates network interruption during database sync to verify auto-recovery | `dbService.ts` |
| `scratch/test_feedback_capture.mjs` | Node ESM | Verifies recruiter notes and feedback capture into candidate timeline feed | `dbService.ts` |

#### Google Gemini AI Integration Diagnostics (`scratch/`)
| File Path | Type | Description | Target Component |
| :--- | :--- | :--- | :--- |
| `scratch/test_gemini_live.mjs` | Node ESM | Tests live REST API connectivity to Google Gemini endpoint | `geminiService.ts` |
| `scratch/test_gemini_models.mjs` | Node ESM | Queries available Gemini models and validates response payloads | `geminiService.ts` |
| `scratch/test_flash_lite.mjs` | Node ESM | Benchmarks latency and response structure for `gemini-2.0-flash-lite` | `geminiService.ts` |

- **Operational Status:** **Development / Scratch Scripts** (Not executed in production, excluded from Vite production bundle).

