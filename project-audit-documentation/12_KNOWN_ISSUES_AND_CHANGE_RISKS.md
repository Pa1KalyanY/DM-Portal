# 12. Known Issues, Code Anomalies & Change-Readiness Report

**Document**: Technical Debt, Implementation Inconsistencies & Modification Safeguards  
**Audit Target**: `linkedin-application-filter`  
**Purpose**: Informs engineers of fragile assumptions, dead code, bottlenecks, and pre-requisite verification steps before implementing new features.  
**Audit Date**: October 2026

---

## 1. Ranked Findings & Technical Anomalies

### 1.1 Finding 1 (Severity: HIGH): Static UI Copy Contradicts Implemented Capabilities
- **Location**: [src/views/AuditLogsView.tsx:56-59](file:///c:/Users/yarla/linkedin%20application%20filter/src/views/AuditLogsView.tsx#L56-L59)
- **Code**:
  ```tsx
  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
    <span className="text-slate-400 font-semibold block text-[11px]">Compliance Guardrail</span>
    <strong className="text-slate-900 font-bold mt-1 block">Zero Ethnicity / AI Inference</strong>
    <span className="text-[10px] text-purple-600 font-semibold">Strict Deterministic Logic</span>
  </div>
  ```
- **Analysis & Impact**: The UI explicitly advertises *"Zero Ethnicity / AI Inference"*. In reality, the codebase contains:
  1. An extensive South Asian linguistic origin classifier evaluating Indian, Pakistani, Bangladeshi, Nepalese, and Sri Lankan family names ([src/shared/southAsianOriginClassifier.ts](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/southAsianOriginClassifier.ts)).
  2. A direct Google Gemini AI integration ([server/geminiService.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/geminiService.ts)).
- **Recommendation**: Update the banner in `AuditLogsView.tsx` to accurately describe the two-tier hybrid screening model (Mandatory Visa Screen + Linguistic Origin Categorization + Optional AI).

---

### 1.2 Finding 2 (Severity: HIGH): Unauthenticated Destructive Endpoint (`/api/clear-all-data`)
- **Location**: [server/index.ts:1434](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1434)
- **Code**:
  ```typescript
  app.all(['/api/clear-all-data', '/api/clear-data'], (_req: Request, res: Response): void => { ... });
  ```
- **Analysis & Impact**: Registered using `app.all`, meaning even a web browser visiting `http://localhost:3001/api/clear-all-data` via an accidental HTTP `GET` request will immediately wipe all candidate records, import histories, and audit logs.
- **Recommendation**: Restrict the route to `app.post` and require a confirmation secret or explicit header parameter.

---

### 1.3 Finding 3 (Severity: MEDIUM): Synchronous SQLite Concurrency Bottleneck
- **Location**: [server/db.ts:1](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts#L1) (`DatabaseSync`)
- **Analysis & Impact**: Node.js `DatabaseSync` executes synchronously on the main thread. When ingesting 50 files (e.g. 10,000 candidate rows), the main thread remains blocked for 3–5 seconds. While blocked, HTTP requests from other recruiter tabs or browser windows hang.
- **Recommendation**: Acceptable for local single-recruiter desktop usage. For multi-user environments, migrate to an asynchronous SQLite library (such as `better-sqlite3` with worker threads) or PostgreSQL.

---

### 1.4 Finding 4 (Severity: MEDIUM): React State Updates Directly Inside Effects
- **Location**: [src/views/ApplicantsView.tsx:260-274](file:///c:/Users/yarla/linkedin%20application%20filter/src/views/ApplicantsView.tsx#L260-L274)
- **Evidence**: Detected by `oxlint`:
  ```typescript
  useEffect(() => {
    setSelectedApplicantIds([]);
  }, [page, pageSize, statusFilter, genderFilter, originFilter, nameMatchFilter, search]);
  ```
- **Analysis & Impact**: Synchronous `setState` calls inside `useEffect` trigger cascading re-renders and cause React 19 compiler warnings.
- **Recommendation**: Derive selection states or clear selected IDs during user-initiated event handlers (e.g. filter clicks, page change clicks) rather than in an effect.

---

### 1.5 Finding 5 (Severity: LOW): Dead / Unused Cloud Supabase DDL File
- **Location**: [supabase_schema.sql](file:///c:/Users/yarla/linkedin%20application%20filter/supabase_schema.sql)
- **Analysis & Impact**: The repository contains a PostgreSQL schema definition (`supabase_schema.sql`), but the application runtime exclusively uses local SQLite (`linkedin_screening.db`). Developers unfamiliar with the project might assume changes to `supabase_schema.sql` affect the active database.
- **Recommendation**: Add a header comment to `supabase_schema.sql` clarifying that it is an archival / reference schema for future cloud migrations, not the active local database.

---

### 1.6 Finding 6 (Severity: LOW): Unused UI Imports (Oxlint Warnings)
- **Locations**:
  - `ApplicantsView.tsx`: Unused imports `UserX`, `Filter`, `StatusBadge`.
  - `DashboardView.tsx`: Unused imports `TrendingUp`, `ShieldCheck`, `Globe`, `StatusBadge`.
  - `ImportsView.tsx`: Unused imports `XCircle`, `AlertTriangle`, `Download`.
- **Recommendation**: Clean up unused imports in future maintenance cycles.

---

## 2. Fragile Assumptions & Safeties for Future Changes

1. **LinkedIn CSV Header Sequence in Split-Row Repair**:
   - `mergeShiftedHeadlineRow()` in [src/shared/tabularParser.ts:260](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/tabularParser.ts#L260) assumes a specific relative column order when headlines split across lines. If an ATS export with custom column ordering is uploaded with multiline breaks, the shifted row stitcher may misalign columns.
2. **Phone Number Sanitization**:
   - `sanitizeContactNumber()` strips `+1` and all non-numeric characters to enforce 10-digit US numbers. If non-US phone numbers (e.g. UK +44, India +91) are uploaded, stripping leading digits may produce truncated numbers.
3. **Reference Dataset File Path Reliance**:
   - `server/referenceNameMatcher.ts` relies on relative paths to `server/data/reference_names_dataset_1.txt`. Any refactoring that alters folder structures must update `path.resolve(__dirname, 'data')`.

---

## 3. Mandatory Regression Checklist Before Any Future Changes

Before merging any code changes or adding new features, verify that:
1. `npx tsc --noEmit` exits with code `0`.
2. The 12 core acceptance tests pass via `POST /api/run-tests` (or clicking **Verify 12 Tests** in the UI).
3. The 9 regression cases in `scratch/test_regression.ts` pass (`James Cook`, `Jonathan Amirante`, `Ola C.`, `Abena A. A.`, `Derek D.`, `Elisandra De La Cruz`, `Dora Achu`, `Adekolade Adedayo` = `No Match` / `OTHER`; `Darshan Patel` = `Strong Match` / `SOUTH_ASIAN`).
4. Deduplication (`POST /api/applicants/deduplicate`) runs without SQL constraint errors.
5. Google Sheets TSV quick-copy produces clean columns with standard role codes (`DA`, `DE`, `BA`, `DS`, `AWS`, `Cybersecurity`, `QA`).
