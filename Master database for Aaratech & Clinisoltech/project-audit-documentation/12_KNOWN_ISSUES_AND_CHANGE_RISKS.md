# Known Issues & Change-Readiness Report

**Repository:** Master Database for AaraTech & ClinisolTech  
**Auditor:** Senior Software Architect & Code Auditor  
**Purpose:** Handover risk register for future engineering teams and AI coding assistants before implementing new features or refactoring.  

---

## 1. Ranked Risk Register (By Severity)

| Issue ID | Severity | Category | Description | Primary File Reference |
| :---: | :---: | :---: | :--- | :--- |
| **ISS-01** | **CRITICAL** | Security | Cleartext Fallback Google Gemini API Key in Client Source Code | [src/lib/geminiService.ts:L92](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/geminiService.ts#L92) |
| **ISS-02** | **HIGH** | Architecture | Monolithic `dbService.ts` Exceeds 4,600 Lines with High Coupling | [src/lib/dbService.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/dbService.ts) |
| **ISS-03** | **HIGH** | Database / Schema | Schema Divergence between `migrationSql.ts` and `20261008000001_master_database_schema.sql` | [src/lib/migrationSql.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/migrationSql.ts) vs [supabase/migrations/...sql](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/supabase/migrations/20261008000001_master_database_schema.sql) |
| **ISS-04** | **HIGH** | Testing | Absence of Automated Test Harness (`npm test` Missing in `package.json`) | [package.json](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/package.json) |
| **ISS-05** | **MEDIUM** | Performance | In-Memory Candidate Scanning (`localStore.people`) Scales $O(N)$ with High Memory Footprint | [src/lib/dbService.ts:L716-L890](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/dbService.ts#L716-L890) |
| **ISS-06** | **MEDIUM** | Build / Bundle | Oversized Monolithic JavaScript Bundle (>1.39 MB) Emits Vite Warning | `dist/assets/index-DUC9qiAm.js` |
| **ISS-07** | **MEDIUM** | Specification Divergence | Test Script Expectation Mismatch with Code Rule 1 | [scratch/test_28_complete_acceptance.mjs:L114](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/scratch/test_28_complete_acceptance.mjs#L114) vs [src/lib/matchingEngine.ts:L469](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/matchingEngine.ts#L469) |
| **ISS-08** | **LOW** | Developer Experience | Workspace Path Contains Ampersand (`&`) Breaking Windows Command Wrappers | Workspace Root Directory Name |

---

## 2. In-Depth Technical Analysis of Issues

### ISS-01: Cleartext Fallback Google Gemini API Key in Client Source Code
- **Severity:** **CRITICAL**
- **Impact:** Anyone opening the compiled application bundle in browser DevTools can inspect and copy the Google Gemini API key.
- **Evidence:** Line 92 of [src/lib/geminiService.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/geminiService.ts#L92) returns `'AQ.Ab8RN6J-16yjA8HiTLCcFhhqRiqnBIq3v0OnftxP3YxNZieYEQ'`.
- **Remediation:** Remove line 92 immediately. Enforce environment variable injection (`VITE_GEMINI_API_KEY`) or in-app Settings configuration.

---

### ISS-02: Monolithic `dbService.ts` Architectural Debt
- **Severity:** **HIGH**
- **Impact:** At 4,601 lines and 179 KB, `dbService.ts` violates the Single Responsibility Principle. It manages:
  1. In-memory state caching (`localStore`).
  2. Native IndexedDB transactions.
  3. Supabase REST API communication and chunked upsert concurrency.
  4. Deduplication scans and merge execution.
  5. Quarantined incomplete records recovery heuristics.
  6. Cultural gender detection orchestration.
- **Why it is difficult to modify safely:** Any modification to candidate schema attributes requires edits across multiple 500-line methods within this single file (`getCandidates`, `getCandidateById`, `updateCandidateProfile`, `saveImportBatch`, `syncBatchToSupabase`, `mergeCandidates`, `unmergeCandidates`).
- **Remediation:** Refactor into modular sub-services:
  - `src/lib/services/CandidateService.ts`
  - `src/lib/services/MergeService.ts`
  - `src/lib/services/QuarantineService.ts`
  - `src/lib/services/SupabaseSyncService.ts`

---

### ISS-03: Schema Inconsistency in Migration SQL
- **Severity:** **HIGH**
- **Impact:** The embedded string constant `MASTER_SCHEMA_SQL` inside [src/lib/migrationSql.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/migrationSql.ts) does not contain the `incomplete_records` table definition, while [supabase/migrations/20261008000001_master_database_schema.sql](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/supabase/migrations/20261008000001_master_database_schema.sql#L337-L360) does.
- **Why it matters:** If an administrator copies the SQL directly from the in-app Settings view to configure their Supabase database, the `incomplete_records` table will not exist, causing all incomplete profile sync operations to throw PostgreSQL errors.
- **Remediation:** Update `MASTER_SCHEMA_SQL` in `migrationSql.ts` to include lines 337–360 of the canonical migration script.

---

### ISS-04: Absence of Automated Testing Pipeline
- **Severity:** **HIGH**
- **Impact:** There is no `npm test` script in `package.json`. Developers or AI assistants modifying code have no automated mechanism to verify that their changes have not broken existing deduplication rules, normalization functions, or data flows.
- **Remediation:** Install `vitest` and configure automated unit tests for `matchingEngine.ts`, `normalization.ts`, and `genderDetection.ts`.

---

### ISS-05: In-Memory Candidate Pool Scalability Limit
- **Severity:** **MEDIUM**
- **Impact:** In [src/lib/dbService.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/dbService.ts), all candidates are loaded into JavaScript memory (`localStore.people`). Array operations like `.filter()`, `.sort()`, and `.slice()` are performed on this in-memory array.
- **Performance Threshold:**
  - *1,000 to 10,000 records:* Highly performant (sub-10ms UI renders).
  - *50,000+ records:* Will cause visible UI thread lag, high memory consumption, and potential tab crashing on low-memory mobile devices.
- **Remediation:** Transition filtering and pagination to native IndexedDB index cursor queries or direct Supabase PostgREST range queries (`.range(start, end)`).

---

### ISS-06: Monolithic Bundle Size (>1.39 MB)
- **Severity:** **MEDIUM**
- **Impact:** Vite build outputs a single JavaScript chunk `dist/assets/index-DUC9qiAm.js` of 1,393 kB. This triggers Vite's build warning and increases initial page load time on slow mobile connections.
- **Root Cause:** Large third-party libraries (`xlsx` SheetJS, Lucide React icon set, `@supabase/supabase-js`) are bundled into a single file without code splitting.
- **Remediation:** Configure dynamic `import()` for `xlsx` and route views in `vite.config.ts` using `build.rollupOptions.output.manualChunks`.

---

### ISS-07: Contradiction Between Test Script and Active Code (Rule 1)
- **Severity:** **MEDIUM**
- **Evidence:**
  - In [scratch/test_28_complete_acceptance.mjs:L119](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/scratch/test_28_complete_acceptance.mjs#L119), Test 5 asserts that candidates with the same name but different email and phone should resolve to `'MANUAL_REVIEW'`.
  - In active code [src/lib/matchingEngine.ts:L469-L482](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/matchingEngine.ts#L469-L482), the engine implements **Rule 1**: candidates with matching names but different emails and phones resolve to `'NO_MATCH'` (distinct profiles).
- **Explanation:** The test script reflects an older iteration of the specification before the user explicitly clarified that identical names with completely different contact points represent two different human beings and must not be flagged for merge review.
- **Remediation:** Update `scratch/test_28_complete_acceptance.mjs` test 5 to assert `res.decision === 'NO_MATCH'`.

---

### ISS-08: Workspace Path Ampersand Issue on Windows
- **Severity:** **LOW**
- **Impact:** The folder path contains an ampersand: `Master database for Aaratech & Clinisoltech`. When executing shell commands like `npx tsc`, the unquoted batch wrapper interprets `&` as a command separator, causing the shell to search for a non-existent command `Clinisoltech\node_modules\.bin\`.
- **Workaround:** Always invoke CLI tools directly via Node: `node ./node_modules/typescript/bin/tsc --noEmit`.

---

## 3. Pre-Change Regression Checklist for Future Engineers

Before making any code modifications to this repository:
1. [ ] **Verify TypeScript:** Run `node ./node_modules/typescript/bin/tsc --noEmit` and confirm 0 errors.
2. [ ] **Verify Production Build:** Run `npm run build` and confirm exit code 0.
3. [ ] **Preserve Verbatim Feedback:** Ensure no changes summarize, trim, or rewrite `original_feedback` or `recruiter_feedback`.
4. [ ] **Enforce Company Isolation:** Ensure candidate pairs from AaraTech and ClinisolTech can never be compared or merged.
5. [ ] **Preserve Reversible Snapshots:** Ensure any schema changes to candidate child tables are reflected in `merge_history.snapshot` and `unmergeCandidates`.
