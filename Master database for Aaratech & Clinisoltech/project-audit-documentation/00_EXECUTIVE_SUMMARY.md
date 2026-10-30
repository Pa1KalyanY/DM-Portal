# Executive Summary: AaraTech & ClinisolTech Master Candidate Database

**Project Name:** Master Database for AaraTech & ClinisolTech  
**Audit Date:** October 15, 2026  
**Auditor:** Senior Principal Systems Architect & Code Auditor  
**Repository State:** Phase 1 Master Recruiting Database Architecture (Active Production/Staging Codebase)  
**Verification Level:** 100% Evidence-Based Source Code & Schema Audit  

---

## 1. System Identity and Business Purpose

The **Master Database for AaraTech & ClinisolTech** is an enterprise-grade recruiting CRM, identity resolution engine, and talent database. It serves two distinct corporate staffing and consulting divisions:
1. **AaraTech:** Information Technology, Cloud Architecture, DevOps, Full Stack Development, Data Engineering, and CyberSecurity recruitment.
2. **ClinisolTech:** Life Sciences, Clinical Data Management, Biostatistics, SAS Clinical Programming, and GxP Clinical Research staffing.

### Primary Business Problems Solved
- **Elimination of Fragmented Spreadsheets:** Replaces hundreds of disconnected Excel/CSV recruiter tracking sheets and copy-pasted daily call logs with a single unified master database.
- **Strict 1 Person = 1 Master Profile Paradigm:** Unifies multiple applications, varying job submissions, changing contact points (multiple emails and phone numbers), and touchpoints under a single human identity (`P-000001`).
- **Verbatim Recruiter Feedback Preservation:** Guarantees that historical screening feedback, salary requests, relocation constraints, and visa notes are preserved 100% word-for-word without summary loss or generative distortion.
- **Cross-Company Isolation:** Strictly prevents candidate records from AaraTech and ClinisolTech from being accidentally co-mingled or auto-merged, while allowing operational oversight by a central Digital Marketing team.
- **Contact Recovery & Incomplete Quarantine:** Automatically isolates messy leads that lack complete contact details into an Incomplete Profiles queue, where heuristic algorithms and Google Gemini AI can rescue valid candidate identities from freeform text while purging anonymous call logs.
- **Reversible Merges & Auditability:** Every duplicate resolution operation is recorded in a transactional merge history table with full JSON snapshot recovery, allowing instant single-click unmerging if a recruiter makes an error.

---

## 2. High-Level Technology & Architecture Summary

| Architectural Tier | Technology Stack | Exact Version / Spec |
| :--- | :--- | :--- |
| **Runtime & Language** | Node.js / TypeScript | Node v22.14.0 / TypeScript ~6.0.2 (`tsconfig.json` target ES2022) |
| **Frontend Framework** | React 19 (SPA) | React `^19.3.0`, React DOM `^19.3.0` |
| **Build & Dev Tooling** | Vite + @tailwindcss/vite | Vite `^8.3.0`, PostCSS `^8.5.29`, Autoprefixer `^10.6.1` |
| **Styling & Design System** | TailwindCSS v4 | TailwindCSS `^4.3.3`, `@tailwindcss/vite` |
| **Iconography & UI Tokens** | Lucide React | `lucide-react` `^1.53.0`, `clsx` `^2.1.1`, `tailwind-merge` `^3.7.0` |
| **Local Persistence Layer** | Browser Native IndexedDB | `indexedDB` (DB: `aaratech_clinisoltech_master_db`, Version 2) |
| **Cloud Database Layer** | Supabase PostgreSQL | `@supabase/supabase-js` `^2.117.3`, PostgreSQL 15+ with `pg_trgm`, `uuid-ossp` |
| **Spreadsheet Ingestion/Export**| SheetJS (xlsx) | `xlsx` `^0.18.5` |
| **Artificial Intelligence Engine**| Google Gemini REST API | `gemini-2.5-flash-lite`, `gemini-2.5-flash`, `gemini-3.8-flash` |

### Architectural Highlights
- **Dual-Storage Synchronization Architecture:** The application operates with an offline-first, high-capacity browser persistence engine using native **IndexedDB** (up to gigabytes of capacity, completely bypassing the browser 5MB `localStorage` ceiling). Changes are concurrently synced in background batches to **Supabase PostgreSQL**.
- **Rule-Based Deduplication Engine:** Implements a deterministic decision matrix evaluating exact names, string distance (Levenshtein), normalized E.164 phone formats, and canonical email addresses to route pairs into `AUTO_MERGE`, `MANUAL_REVIEW`, or `NO_MATCH`.
- **Heuristic & AI Quarantine Rescue:** Multistage rescue pipeline extracting contact numbers, emails, and names from unstructured recruiter notes using cultural lexicon matching (South Asian, Middle Eastern, Western names) and Gemini AI verification.

---

## 3. Implementation Status Dashboard

| Core Feature / Module | Status | Verification Evidence / Key File |
| :--- | :---: | :--- |
| **Authentication & Role Switching** | **Implemented** | [authService.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/authService.ts), [AuthView.tsx](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/components/auth/AuthView.tsx) |
| **IndexedDB Permanent Local Storage**| **Implemented** | [indexedDb.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/indexedDb.ts) (8 Object Stores) |
| **Supabase Cloud Synchronization** | **Implemented** | [supabase.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/supabase.ts), [dbService.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/dbService.ts#L2862) |
| **Candidate Filtering, Search, Pagination**| **Implemented** | [CandidatesListView.tsx](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/components/candidates/CandidatesListView.tsx), [GlobalSearchView.tsx](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/components/search/GlobalSearchView.tsx) |
| **Candidate Profile & History Views**| **Implemented** | [CandidateProfileView.tsx](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/components/candidates/CandidateProfileView.tsx), [TimelineTab.tsx](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/components/candidates/TimelineTab.tsx) |
| **Excel/CSV File Ingestion & Mapping**| **Implemented** | [importEngine.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/importEngine.ts), [ImportView.tsx](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/components/import/ImportView.tsx) |
| **Deterministic Duplicate Engine** | **Implemented** | [matchingEngine.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/matchingEngine.ts) (Rules 1, 2, 3, 4, 5) |
| **Reversible Merging & Audit History**| **Implemented** | [dbService.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/dbService.ts#L2050), [MergeCandidatesView.tsx](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/components/merge/MergeCandidatesView.tsx) |
| **Cultural Gender Detection Engine** | **Implemented** | [genderDetection.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/genderDetection.ts) (2,000+ lexicon tokens & suffix rules) |
| **Incomplete Quarantine & Rescue** | **Implemented** | [IncompleteProfilesView.tsx](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/components/incomplete/IncompleteProfilesView.tsx), [GeminiRescueModal.tsx](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/components/incomplete/GeminiRescueModal.tsx) |
| **Gemini AI Ingestion & Match Verification**| **Implemented** | [geminiService.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/geminiService.ts) (Direct REST v1beta integration) |
| **Company Requisitions & Jobs** | **Implemented** | [JobsView.tsx](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/components/jobs/JobsView.tsx) (31 seeded jobs: 21 AaraTech, 10 ClinisolTech) |
| **Operational & Health Reports** | **Implemented** | [ReportsView.tsx](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/components/reports/ReportsView.tsx) |
| **Acceptance Test Files Generator** | **Implemented** | [testDataGenerator.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/testDataGenerator.ts) (Files A, B, C) |
| **Automated CI/CD Test Pipeline** | **Missing** | No `npm test` script in `package.json`; tests exist as ad-hoc scripts in `scratch/`. |
| **Granular RBAC Row-Level Security**| **Partial / Insecure**| Supabase SQL policies use `USING (true) WITH CHECK (true)` open public read-write. |

---

## 4. Key Audit Findings & Critical Risks

### 1. Critical Finding: Hardcoded Fallback Gemini API Key in Source Code (Severity: CRITICAL)
- **File:** [src/lib/geminiService.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/geminiService.ts#L92)
- **Evidence:** Line 92 includes an unredacted production API key fallback in cleartext: `'AQ.Ab8RN6J-16yjA8HiTLCcFhhqRiqnBIq3v0OnftxP3YxNZieYEQ'`.
- **Impact:** Any user inspecting the client JavaScript bundle in production can retrieve and abuse this API key, leading to quota exhaustion, financial liability, or access misuse.
- **Remediation:** Remove hardcoded fallback immediately. Require injection exclusively via `import.meta.env.VITE_GEMINI_API_KEY` or runtime user input stored securely in browser session.

### 2. High Finding: Permissive Supabase Row-Level Security (RLS) Policies (Severity: HIGH)
- **File:** [supabase/migrations/20261008000001_master_database_schema.sql](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/supabase/migrations/20261008000001_master_database_schema.sql#L323-L334)
- **Evidence:** All database tables enable RLS, but the created policies execute: `CREATE POLICY "Allow public read-write..." ON people FOR ALL USING (true) WITH CHECK (true);`.
- **Impact:** The Supabase Anonymous Key (`anonKey`) has full read/write/delete capabilities on all candidate tables directly over the public internet. If the project URL and anon key are known, any external attacker can query or wipe candidate records.
- **Remediation:** Restrict policies using `auth.uid()` checks and create service roles for administrative operations.

### 3. Medium Finding: Monolithic LocalDatabaseStore Memory Footprint (Severity: MEDIUM)
- **File:** [src/lib/dbService.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/dbService.ts) (4,601 lines, 179 KB)
- **Evidence:** The client maintains an in-memory array `localStore.people` containing all candidates and runs filtering/sorting locally via JavaScript array iteration.
- **Impact:** While extraordinarily fast for 1,000 to 10,000 candidates, this architecture will cause high memory pressure and UI thread freezing if candidate volumes scale to 100,000+ profiles.
- **Remediation:** Implement server-side pagination and IndexedDB cursor-based streaming queries instead of loading the entire candidate collection into memory.

### 4. Medium Finding: Schema Inconsistency in Migration SQL (Severity: MEDIUM)
- **Files:** [src/lib/migrationSql.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/migrationSql.ts) vs [supabase/migrations/20261008000001_master_database_schema.sql](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/supabase/migrations/20261008000001_master_database_schema.sql#L337-L360)
- **Evidence:** The SQL migration file contains the `incomplete_records` table definition (lines 337–360), but the embedded string constant `MASTER_SCHEMA_SQL` inside `migrationSql.ts` (which users copy from the Settings screen) omits `incomplete_records`.
- **Impact:** Administrators executing the SQL copied from the application UI Settings screen will experience failed Supabase syncs on the `incomplete_records` table because the table will not exist in PostgreSQL.
- **Remediation:** Synchronize `MASTER_SCHEMA_SQL` in `migrationSql.ts` with the complete migration script.

---

## 5. Verification Commands and Build Status

During this audit, the following safe commands were executed against the codebase:

```bash
# 1. TypeScript Strict Type-Check (Executed successfully: 0 errors)
node ./node_modules/typescript/bin/tsc --noEmit
# Exit Code: 0 (Clean)

# 2. Production Bundle Compilation (Executed successfully: 0 errors)
npm run build
# Output: dist/index.html (1.03 kB), dist/assets/index-xpPCHhax.css (70.22 kB), dist/assets/index-DUC9qiAm.js (1,393.11 kB)
# Exit Code: 0 (Clean)
```

No application source files, test fixtures, or production database records were altered during this audit.
