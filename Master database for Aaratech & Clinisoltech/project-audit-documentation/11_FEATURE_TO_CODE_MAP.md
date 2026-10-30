# Cross-Module Dependency & Feature-to-Code Matrix

**Repository:** Master Database for AaraTech & ClinisolTech  
**Auditor:** Senior Software Architect & Codebase Auditor  

---

## 1. Feature-to-Code Traceability Matrix

| Business Feature | Frontend Files | API Routes / Endpoints | Backend / Lib Services | Database Tables | External Integrations | Tests | Implementation Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: |
| **Authentication & Password Reset** | `AuthView.tsx`, `Header.tsx`, `App.tsx` | Supabase Auth REST (`/auth/v1/token`, `/auth/v1/recover`, `/auth/v1/user`) | `authService.ts`, `supabase.ts` | Local Session (`aat_auth_session`), Supabase Auth Users | Supabase Auth Service | Manual verification | **Implemented** |
| **Executive Recruiting Dashboard** | `DashboardView.tsx`, `Header.tsx`, `Sidebar.tsx` | Supabase PostgREST table queries (`people`, `applications`, `imports`, etc.) | `dbService.ts` (`getDashboardStats`) | `people`, `applications`, `recruiter_contacts`, `imports`, `possible_matches` | None | UI manual testing | **Implemented** |
| **Candidate Directory & Multi-Filtering** | `CandidatesListView.tsx`, `Header.tsx` | Supabase PostgREST table queries | `dbService.ts` (`getCandidates`), `normalization.ts` | `people`, `person_emails`, `person_phones`, `applications` | None | UI manual testing | **Implemented** |
| **360 Candidate Profile & Timeline** | `CandidateProfileView.tsx`, `TimelineTab.tsx`, `EditCandidateModal.tsx` | Supabase PostgREST table queries | `dbService.ts` (`getCandidateById`, `updateStatus`, `updateOwner`, `addRecruiterContact`), `normalization.ts` | `people`, `person_emails`, `person_phones`, `applications`, `recruiter_contacts`, `person_status_history` | Google Drive (resume links), LinkedIn | UI manual testing | **Implemented** |
| **Spreadsheet Ingestion & Column Mapping** | `ImportView.tsx`, `Header.tsx` | SheetJS in-memory parse, Supabase batch upserts | `importEngine.ts`, `normalization.ts`, `matchingEngine.ts`, `genderDetection.ts`, `dbService.ts` (`saveImportBatch`) | `imports`, `import_rows`, `people`, `person_emails`, `person_phones`, `applications`, `recruiter_contacts` | SheetJS (`xlsx`) | `scratch/test_assembler.mjs` | **Implemented** |
| **Pasted Leads Parsing & Pre-processing** | `ImportView.tsx` | In-memory text-to-file parsing | `importEngine.ts` (`convertPastedTextToFile`), `normalization.ts` | Temporary in-memory workbook | SheetJS (`xlsx`) | `scratch_test_aditi.ts`, `scratch/test_data_only_paste.mjs` | **Implemented** |
| **Gemini AI Direct Lead Extraction** | `ImportView.tsx`, `GeminiRescueModal.tsx` | Google Generative Language v1beta REST API | `geminiService.ts` (`extractCandidatesFromRawText`), `importEngine.ts` | `people`, `incomplete_records` | Google Gemini API (`gemini-2.5-flash-lite`) | `scratch/test_flash_lite.mjs` | **Implemented** |
| **Deterministic Duplicate Detection** | `PossibleMatchesView.tsx`, `ImportView.tsx` | In-memory algorithmic evaluation | `matchingEngine.ts` (`evaluateCandidatePair`, `evaluateDuplicateMatch`), `normalization.ts` | `possible_matches`, `people` | None | `scratch/test_28_complete_acceptance.mjs`, `scratch/test_20_acceptance_scenarios.mjs` | **Implemented** |
| **Gemini AI Match Re-Verification** | `GeminiMatchModal.tsx`, `PossibleMatchesView.tsx` | Google Generative Language v1beta REST API | `geminiService.ts` (`verifyPossibleMatches`), `dbService.ts` | `possible_matches` | Google Gemini API | `scratch/test_gemini_live.mjs` | **Implemented** |
| **Candidate Merging & Reversible Unmerge**| `MergeCandidatesView.tsx`, `PossibleMatchesView.tsx` | Supabase PostgREST table queries & local IndexedDB updates | `dbService.ts` (`mergeCandidates`, `unmergeCandidates`), `matchingEngine.ts` | `people`, `merge_history`, `audit_log`, `person_emails`, `person_phones`, `applications`, `recruiter_contacts` | None | `scratch/test_db_autorecover.mjs` | **Implemented** |
| **Incomplete Leads Quarantine Queue** | `IncompleteProfilesView.tsx`, `Sidebar.tsx` | Supabase PostgREST queries | `dbService.ts` (`getIncompleteRecords`, `deleteIncompleteRecord`), `importEngine.ts` | `incomplete_records` | None | `scratch/inspect_incomplete.mjs` | **Implemented** |
| **Quarantine Auto-Recovery & Healing** | `IncompleteProfilesView.tsx`, `App.tsx` | In-memory regex heuristics & background auto-promotion | `dbService.ts` (`autoRecoverIncompleteRecords`, `batchPromoteIncompleteToMaster`), `normalization.ts` | `incomplete_records`, `people`, `person_emails`, `person_phones` | None | `scratch/verify_end_to_end_recovery.mjs` | **Implemented** |
| **Cultural & Suffix Gender Classification**| `CandidatesListView.tsx`, `ImportView.tsx` | In-memory lexicon and morphological suffix pattern matching | `genderDetection.ts`, `dbService.ts` (`batchAutoDetectGender`) | `people` | None | `scratch/test_gender_detection.ts` | **Implemented** |
| **Company Requisitions & Jobs Management**| `JobsView.tsx`, `Sidebar.tsx` | Supabase PostgREST queries | `dbService.ts` (`getJobs`, `addJob`, `updateJobStatus`) | `jobs` | None | UI manual testing | **Implemented** |
| **Global Multi-Identifier Search** | `GlobalSearchView.tsx`, `Header.tsx` | PostgreSQL GIN Trigram search & in-memory string matching | `dbService.ts` (`getCandidates`), `normalization.ts` | `people`, `person_emails`, `person_phones` | None | UI manual testing | **Implemented** |
| **System Administration & Supabase Settings**| `SettingsView.tsx`, `Header.tsx` | Supabase Health Ping (`SELECT count(*) FROM people`), Gemini Connection Test | `supabase.ts`, `geminiService.ts`, `dbService.ts` (`getStorageStats`, `syncAllLocalToSupabase`) | All 13 PostgreSQL tables, IndexedDB stores | Supabase Cloud, Google Gemini API | UI manual testing | **Implemented** |

---

## 2. High-Risk Shared Modules

A modification to any of the following four core files directly affects multiple system workflows:

### 1. [src/lib/dbService.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/dbService.ts) (Criticality: MAXIMUM)
- **Used By:** Almost all UI views (`DashboardView`, `CandidatesListView`, `CandidateProfileView`, `PossibleMatchesView`, `MergeCandidatesView`, `IncompleteProfilesView`, `JobsView`, `ReportsView`, `GlobalSearchView`, `SettingsView`, `App.tsx`).
- **Risk:** Controls state caching, IndexedDB operations, Supabase cloud synchronization, candidate ID generation (`P-XXXXXX`), and merge snapshots. An uncaught exception here can cause local data loss, failed cloud synchronization, or application-wide rendering failure.

### 2. [src/lib/matchingEngine.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/matchingEngine.ts) (Criticality: HIGH)
- **Used By:** `importEngine.ts`, `PossibleMatchesView.tsx`, `MergeCandidatesView.tsx`, `dbService.ts`.
- **Risk:** Governs duplicate candidate decisions. Any change to similarity thresholds or rule priority can result in false-positive merges (corrupting distinct candidate histories) or false-negative duplicates (bloating the database).

### 3. [src/lib/importEngine.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/importEngine.ts) (Criticality: HIGH)
- **Used By:** `ImportView.tsx`, `IncompleteProfilesView.tsx`, `dbService.ts`.
- **Risk:** Governs file parsing, column auto-detection, and staged row transformation. A bug here can corrupt thousands of records during bulk imports.

### 4. [src/lib/normalization.ts](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/normalization.ts) (Criticality: HIGH)
- **Used By:** `matchingEngine.ts`, `importEngine.ts`, `dbService.ts`, `CandidateProfileView.tsx`, `CandidatesListView.tsx`.
- **Risk:** Email and phone normalization directly determines matching accuracy. Overly aggressive email alteration or faulty phone digit extraction could block valid matches or misclassify valid contacts.

---

## 3. Potential Regression Hotspots for Future Changes

1. **Auto-Merge vs. Manual Review Boundary (Rule 1 vs Rule 2):**
   - *Rule 1:* Names match, but phone and email are different -> Must remain `NO_MATCH`.
   - *Rule 2:* Names match, and email or phone matches -> `AUTO_MERGE`.
   - *Regression Risk:* Modifying name normalization or string distance could accidentally trigger auto-merge on candidates sharing a common name (e.g. two different people named "Sandeep G").
2. **Reversible Unmerge Entity Association:**
   - *Mechanism:* When candidate B is merged into A, its child emails, phones, applications, and recruiter contacts are re-assigned to A. The pre-merge state is stored in `merge_history.snapshot`.
   - *Regression Risk:* If new child entities are added to the candidate schema without updating the snapshot serialization/deserialization logic in `dbService.mergeCandidates` and `dbService.unmergeCandidates`, unmerging will drop newly added entity fields.
3. **Cross-Company Isolation:**
   - *Rule:* AaraTech and ClinisolTech candidates must never be merged.
   - *Regression Risk:* Any modification to `evaluateCandidatePair` or `mergeCandidates` that relaxes the company check (`compA !== compB`) will violate client business segregation requirements.
