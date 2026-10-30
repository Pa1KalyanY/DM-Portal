# 01. System Architecture & Data Flow

**Document**: Architecture Specification & Component Model  
**Audit Target**: `linkedin-application-filter`  
**Runtime Model**: Client-Server Monorepo (Express API + Vite React Client)  
**Verification Date**: October 2026

---

## 1. High-Level System Architecture Diagram

```mermaid
flowchart TD
    subgraph CLIENT["Frontend Client (Browser: React 19 + Vite 8)"]
        UI_NAV[Sidebar Navigation & Header Search]
        VIEW_DASH[DashboardView: KPI Cards & Metrics]
        VIEW_UPLOAD[UploadView: Drag & Drop + Clipboard]
        VIEW_APP[ApplicantsView: Full-Window Zoom Grid]
        VIEW_MODAL[ApplicantDetailModal: Overrides & Raw Inspection]
        VIEW_RULES[ScreeningRulesView: Rules Admin]
        VIEW_AUDIT[AuditLogsView & ReportsView]
        API_CLIENT[API Client: src/api/client.ts]
        
        UI_NAV --> VIEW_DASH & VIEW_UPLOAD & VIEW_APP & VIEW_RULES & VIEW_AUDIT
        VIEW_APP --> VIEW_MODAL
        VIEW_UPLOAD & VIEW_APP & VIEW_MODAL & VIEW_RULES & VIEW_AUDIT --> API_CLIENT
    end

    subgraph API_SERVER["Backend API Server (Node 22 + Express 5)"]
        ROUTER[Express Route Handlers: server/index.ts]
        MULTER[Multer Disk Storage: /uploads]
        PARSER[SheetJS xlsx + Tabular Parser: tabularParser.ts]
        MAPPER[Column Header Mapper & Role Normalizer]
        SCREENER[Deterministic Screening Engine: screeningEngine.ts]
        ORIGIN[South Asian Origin Classifier]
        GENDER[Rule-Based Gender Classifier]
        MATCHER[Reference Name Matcher: 13,859 Index]
        AI_SVC[Gemini AI Service: geminiService.ts]
        DB_SVC[Database Service: server/db.ts]
        
        API_CLIENT -->|HTTP REST / JSON / Multipart| ROUTER
        ROUTER --> MULTER
        MULTER --> PARSER
        PARSER --> MAPPER
        MAPPER --> SCREENER
        SCREENER --> ORIGIN & GENDER & MATCHER
        ROUTER -.->|Optional Batch AI| AI_SVC
        SCREENER & MATCHER & ORIGIN & GENDER --> DB_SVC
    end

    subgraph STORAGE["Persistence Layer (Local File System)"]
        SQLITE[(SQLite DatabaseSync: linkedin_screening.db)]
        DATASETS[(Reference Datasets: dataset_1.txt & dataset_2.txt)]
        UPLOADS_DIR[(Uploaded Spreadsheets: /uploads)]
        
        DB_SVC --> SQLITE
        MATCHER --> DATASETS
        MULTER --> UPLOADS_DIR
    end

    subgraph EXTERNAL["External Integrations"]
        GOOGLE_GEMINI[Google AI Studio: Gemini API]
        GOOGLE_SHEETS[Google Sheets Clipboard Ctrl+V Destination]
        EXCEL_EXPORT[Recruiter Desktop: Downloaded .xlsx Workbooks]
        
        AI_SVC -.->|REST / JSON| GOOGLE_GEMINI
        API_CLIENT -->|Formatted TSV Clipboard| GOOGLE_SHEETS
        ROUTER -->|Binary Stream| EXCEL_EXPORT
    end
```

---

## 2. Application Entry Points & Initialization Sequence

### 2.1 Backend Initialization Sequence ([server/index.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts))
1. **Module Import**: Loads `express`, `cors`, `multer`, `node:sqlite`, `xlsx`, and local services.
2. **Environment & Constants**: Reads `PORT` (defaults to `3001`), configures `UPLOAD_DIR` (`process.cwd()/uploads`), creating it recursively if absent.
3. **Database Instantiation**: Instantiates singleton `dbService` from [server/db.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts).
   - Opens synchronous connection to `linkedin_screening.db` via `new DatabaseSync(DB_PATH)`.
   - Executes `initTables()`: Creates tables `app_settings`, `imports`, `import_files`, `applicants`, `screening_rules`, `audit_logs` and indexes.
   - Executes safe column migrations (`ALTER TABLE applicants ADD COLUMN ...`) for `gender`, `origin_region`, `origin_country`, `origin_match_reason`, `name_match_category`, `name_match_score`, `name_matched_pattern`, `name_matched_reference`, `batch_name`.
   - Executes phone number sanitization migration on historical records.
   - Executes `initDefaultRules()`: Inserts default rules `rule-gc-1`, `rule-sp-2`, `rule-wa-3`, and `rule-sa-4`.
4. **Reference Matcher Indexing**: Singleton `ReferenceNameMatcherService` loads:
   - `server/data/reference_names_dataset_1.txt` (9,297 names)
   - `server/data/reference_names_dataset_2.txt` (4,562 names)
   - Indexes **12,558** unique names, tokens (length $\ge 2$), and 2-gram combinations into memory maps.
5. **Express Middleware**: Attaches CORS, JSON body parser (50MB limit), URL-encoded body parser (50MB limit).
6. **Route Binding**: Registers 32 HTTP endpoints across `/api/*`.
7. **HTTP Listen**: Starts listening on `http://localhost:3001`.

### 2.2 Frontend Initialization Sequence ([src/main.tsx](file:///c:/Users/yarla/linkedin%20application%20filter/src/main.tsx) & [src/App.tsx](file:///c:/Users/yarla/linkedin%20application%20filter/src/App.tsx))
1. **DOM Mount**: `createRoot` mounts `<App />` inside `#root` in `index.html`.
2. **Global Styles**: Injects Tailwind CSS (`@import "tailwindcss";`) and custom styling.
3. **App Component Mount**:
   - Initializes default view: `currentTab = 'dashboard'`.
   - Fires `useEffect` triggering `loadDashboardStats()` $\rightarrow$ calls `GET /api/dashboard`.
   - Populates metric counters in `<Sidebar />` (`total`, `passed`, `failed`, `manualReview`).
4. **View Routing**: Renders view components conditionally based on `currentTab`:
   - `'dashboard'`: `<DashboardView />`
   - `'upload'`: `<UploadView />`
   - `'applicants-all' | 'applicants-pass' | 'applicants-fail' | 'applicants-review'`: `<ApplicantsView />`
   - `'rules'`: `<ScreeningRulesView />`
   - `'jobs'`: `<JobsView />`
   - `'imports'`: `<ImportsView />`
   - `'reports'`: `<ReportsView />`
   - `'audit'`: `<AuditLogsView />`

---

## 3. End-to-End Business Workflow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor Recruiter
    participant Frontend as React 19 Frontend
    participant Server as Express Server
    participant Screener as Screening Engine
    participant Matcher as Reference Matcher
    participant DB as SQLite (DatabaseSync)
    
    Recruiter->>Frontend: Selects 1-30+ LinkedIn .xlsx files
    Frontend->>Server: POST /api/validate-files (Multipart)
    Server->>Server: Compute SHA-256 hash & check prior imports
    Server-->>Frontend: Return file row count & duplicate warnings
    
    Recruiter->>Frontend: Clicks "Process All Files"
    Frontend->>Server: POST /api/process-files (Files, BatchName, User)
    Server->>Server: SheetJS parse + Multiline repair (sheetRepair.ts)
    Server->>Server: Map columns & sanitize phone numbers
    
    loop Each Applicant Row
        Server->>Screener: evaluateScreening(rawQuestions, rules, originContext)
        Screener->>Screener: Check GC=YES & Sponsorship=NO
        Screener->>Screener: Check South Asian Linguistic Origin
        Server->>Matcher: matchApplicantName(fullName)
        Matcher->>Matcher: 5-Tier score against 12,558 reference names
        Server->>DB: INSERT into applicants & import_files
    end
    
    Server->>DB: Commit transaction & update import stats
    Server-->>Frontend: Import summary (Passed, Failed, Manual Review)
    
    Recruiter->>Frontend: Opens Applicants View (Full-Window Zoom Grid)
    Frontend->>Server: GET /api/applicants?status=ALL&page=1
    Server->>DB: SELECT * FROM applicants WHERE ... LIMIT 25
    DB-->>Server: Rows + Total Count
    Server-->>Frontend: JSON payload
    Frontend-->>Recruiter: Displays 13 columns with zero horizontal scroll
    
    Recruiter->>Frontend: Clicks "+ PASS" or "Remove" (1-Click Override)
    Frontend->>Server: POST /api/applicants/:id/override { newStatus }
    Server->>DB: UPDATE applicants + INSERT INTO audit_logs
    DB-->>Server: OK
    Server-->>Frontend: Updated applicant record
    Frontend-->>Recruiter: Live status badge transition
    
    Recruiter->>Frontend: Clicks "Copy for Google Sheets"
    Frontend->>Server: GET /api/export-sheets-data?status=PASS
    Server-->>Frontend: Formatted TSV with role codes (DA, DE, BA, DS, AWS)
    Frontend-->>Recruiter: Data copied to clipboard -> Paste (Ctrl+V) into Google Sheets
```

---

## 4. Module Dependency Graph

```mermaid
graph TD
    subgraph UI_COMPONENTS["UI Layer (src/views & src/components)"]
        APP[App.tsx]
        APPLICANTS_VIEW[ApplicantsView.tsx]
        MODAL_DETAIL[ApplicantDetailModal.tsx]
        MODAL_EXPORT[ExportModal.tsx]
        MODAL_AI[GeminiAiModal.tsx]
        MODAL_MATCHER[ReferenceMatcherModal.tsx]
        UPLOAD_VIEW[UploadView.tsx]
        HEADER[Header.tsx]
        SIDEBAR[Sidebar.tsx]
    end

    subgraph CLIENT_API["API Client Layer (src/api)"]
        CLIENT_TS[client.ts]
    end

    subgraph SHARED_LOGIC["Shared Core Logic (src/shared)"]
        COL_MAPPER[columnMapper.ts]
        TAB_PARSER[tabularParser.ts]
        SCR_ENGINE[screeningEngine.ts]
        ORIGIN_CLS[southAsianOriginClassifier.ts]
        GENDER_CLS[genderClassifier.ts]
    end

    subgraph SERVER_LAYER["Backend Layer (server)"]
        SRV_INDEX[index.ts]
        SRV_DB[db.ts]
        REF_MATCHER[referenceNameMatcher.ts]
        GEMINI_SVC[geminiService.ts]
    end

    APP --> APPLICANTS_VIEW & UPLOAD_VIEW & HEADER & SIDEBAR & MODAL_EXPORT
    APPLICANTS_VIEW --> MODAL_DETAIL & MODAL_AI & MODAL_MATCHER & MODAL_EXPORT
    APPLICANTS_VIEW & UPLOAD_VIEW & MODAL_DETAIL & MODAL_AI & MODAL_MATCHER --> CLIENT_TS
    
    CLIENT_TS -->|HTTP| SRV_INDEX
    
    SRV_INDEX --> SRV_DB & REF_MATCHER & GEMINI_SVC
    SRV_INDEX --> COL_MAPPER & TAB_PARSER & SCR_ENGINE & GENDER_CLS
    
    SRV_DB --> SCR_ENGINE & COL_MAPPER & ORIGIN_CLS & GENDER_CLS & REF_MATCHER
    SCR_ENGINE --> ORIGIN_CLS
    APPLICANTS_VIEW & MODAL_DETAIL --> COL_MAPPER
```

---

## 5. Database Entity-Relationship Diagram

```mermaid
erDiagram
    IMPORTS ||--o{ IMPORT_FILES : "contains (1:N)"
    IMPORTS ||--o{ APPLICANTS : "contains (1:N)"
    APPLICANTS ||--o{ AUDIT_LOGS : "logs (1:N)"
    SCREENING_RULES ||--o{ APPLICANTS : "governs"

    IMPORTS {
        TEXT id PK
        TEXT import_code UK "Unique batch code e.g. IMP-00001"
        TEXT batch_name "User batch label e.g. CY-1"
        TEXT uploaded_at "ISO-8601 timestamp"
        TEXT uploaded_by "User name default 'Recruiter Admin'"
        INTEGER file_count
        INTEGER total_applicants
        INTEGER passed_count
        INTEGER failed_count
        INTEGER manual_review_count
        INTEGER error_count
        TEXT status "'Completed' or 'Processing'"
    }

    IMPORT_FILES {
        TEXT id PK
        TEXT import_id FK "References imports(id) ON DELETE CASCADE"
        TEXT filename "Original file name"
        INTEGER file_size "Bytes"
        INTEGER row_count "Parsed rows"
        TEXT job_id "Extracted LinkedIn Job ID"
        TEXT job_title "Extracted Job Requisition Title"
        TEXT status "'PROCESSED' or 'ERROR'"
        TEXT error_message
        TEXT file_hash "SHA-256 hash"
    }

    APPLICANTS {
        TEXT id PK "app_uuid"
        TEXT import_id FK "References imports(id) ON DELETE CASCADE"
        TEXT source_file "Filename"
        TEXT source_worksheet "Sheet name"
        INTEGER source_row_number "Spreadsheet row index"
        TEXT first_name
        TEXT last_name
        TEXT full_name
        TEXT email "Indexed"
        TEXT phone "Sanitized (10 digits)"
        TEXT location "City, State, Country"
        TEXT zip_code
        TEXT headline "Professional headline"
        TEXT current_title
        TEXT current_company
        TEXT current_position_start_date
        TEXT education_degree
        TEXT education_institution
        TEXT profile_url "LinkedIn profile link"
        TEXT date_applied "Date string"
        TEXT current_stage "ATS workflow stage"
        TEXT job_id "Requisition ID"
        TEXT job_title "Raw job title"
        TEXT job_url
        TEXT ats_job_id
        TEXT min_salary
        TEXT max_salary
        TEXT currency_code
        TEXT compensation_period
        TEXT hiring_project_id
        TEXT hiring_project_title
        TEXT contract_id
        TEXT contract_name
        TEXT raw_screening_questions "Exact unedited text"
        TEXT green_card_answer "YES, NO, MISSING, UNCLEAR"
        TEXT sponsorship_answer "YES, NO, MISSING, UNCLEAR"
        TEXT us_work_auth_answer "YES, NO, MISSING, UNCLEAR"
        TEXT automated_result "PASS, FAIL, MANUAL_REVIEW, ERROR"
        TEXT manual_result "Overridden status or NULL"
        TEXT effective_result "Final active status (Indexed)"
        TEXT screening_reasons "Audit explanation text"
        TEXT override_reason "Recruiter rationale or NULL"
        TEXT overridden_by "User ID or NULL"
        TEXT raw_row_json "Complete raw row serialized"
        TEXT gender "MALE, FEMALE, UNSPECIFIED (Indexed)"
        TEXT origin_region "SOUTH_ASIAN, UNCERTAIN, OTHER (Indexed)"
        TEXT origin_country "India, Pakistan, Bangladesh, Nepal, Sri Lanka"
        TEXT origin_match_reason "Linguistic match explanation"
        TEXT name_match_category "'Strong Match', 'Possible Match', 'No Match'"
        REAL name_match_score "0.0 to 1.0"
        TEXT name_matched_pattern "Pattern description"
        TEXT name_matched_reference "Matched reference record"
        TEXT created_at "ISO-8601 timestamp"
    }

    SCREENING_RULES {
        TEXT id PK
        TEXT name "Rule title"
        TEXT description "Detailed policy explanation"
        TEXT required_answer "'YES' or 'NO'"
        TEXT status "'ACTIVE' or 'INACTIVE'"
        INTEGER is_mandatory "1 for mandatory, 0 for optional"
        TEXT question_key UK "'GREEN_CARD_CITIZEN', 'FUTURE_SPONSORSHIP', 'US_WORK_AUTH', 'SOUTH_ASIAN_ORIGIN'"
    }

    AUDIT_LOGS {
        TEXT id PK
        TEXT timestamp "ISO-8601 timestamp (Indexed DESC)"
        TEXT user "Action author"
        TEXT action "OVERRIDE, BATCH_OVERRIDE, DEDUPLICATE, GENDER_UPDATE"
        TEXT applicant_id FK "References applicants(id)"
        TEXT applicant_name "Candidate full name"
        TEXT previous_result "Prior status"
        TEXT new_result "New status"
        TEXT reason "Audit explanation"
        TEXT details "Additional JSON or context"
    }

    APP_SETTINGS {
        TEXT key PK "Setting key e.g. gemini_api_key"
        TEXT value "Setting value"
        TEXT updated_at "ISO-8601 timestamp"
    }
```

---

## 6. Error Handling, Logging & Reliability

1. **Row-Level Fault Isolation**: During workbook parsing in `server/index.ts`, each row is processed in an individual `try-catch` block. If a single row is corrupted, unparseable, or contains unexpected binary data, it is tagged as `ERROR` and recorded with `screening_reasons: "Processing error: <message>"`. The batch continues uninterrupted.
2. **Atomic SQLite Transactions**: All batch writes ([`insertApplicantsBatch`](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts#L433)), deduplications ([`deduplicateApplicants`](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts#L1687)), and gender re-classifications execute within explicit `BEGIN TRANSACTION` and `COMMIT` blocks. If an error occurs, `ROLLBACK` is immediately triggered.
3. **Structured Server Logging**: Express logs major life-cycle events to `stdout` with timestamp prefixes (`[API Server]`, `[ReferenceNameMatcher]`, `[Gemini API]`).
4. **Audit Trail Persistence**: Every manual recruiter override, bulk status modification, gender change, and deduplication run automatically records an immutable row in the `audit_logs` table.
