# 00. Executive Summary & Project Overview

**Document**: System Audit & Technical Handover  
**Repository**: `linkedin-application-filter`  
**System Name**: LinkedIn Applicant Filtering, Verification & Matching Platform  
**Target Audience**: Senior Engineers, System Architects, AI Assistants, Technical Auditors  
**Audit Status**: Verified against active codebase and runtime (October 2026)  
**Security Disclosure**: All credentials, access keys, and personally identifiable candidate records have been redacted.

---

## 1. Project Identification & Core Purpose

The **LinkedIn Applicant Filtering, Verification & Matching Platform** is an on-premises / locally hosted enterprise recruitment intelligence application. It ingests, repairs, standardizes, evaluates, deduplicates, and exports bulk applicant data from LinkedIn Recruiter exports, LinkedIn job application spreadsheets, and third-party Applicant Tracking Systems (ATS).

### Primary Business Objectives
1. **Automated Legal Work Authorization Verification**: Eliminates manual inspection of spreadsheet columns by deterministically enforcing mandatory US work authorization criteria (Green Card / US Citizenship requirement and Future Visa Sponsorship requirement).
2. **Linguistic & Regional Origin Categorization**: Identifies candidates originating from South Asian countries (India, Pakistan, Bangladesh, Nepal, Sri Lanka) across 30+ regional ethnic and linguistic groups, while safely routing ambiguous profiles to manual review.
3. **Reference Dataset Pattern Matching**: Compares candidate names against two proprietary verified name datasets (13,859 total records, 12,558 unique names) using a 5-tier scoring hierarchy with strict false-positive suppression for Western names and single-letter initials.
4. **Candidate Deduplication**: Replaces redundant candidate rows resulting from multi-requisition uploads with single authoritative records prioritizing positive screening dispositions.
5. **High-Speed Recruiter Workspace**: Provides a full-window data grid with zoom scaling (60% to 125%, 85% default "Fit Table"), 1-click in-place status overrides (no mandatory text prompt), batch gender modifications, and 1-click clipboard formatting for Google Sheets.

---

## 2. Actual User Roles & Security Access Model

### Implementation Reality
- **Authentication**: **None implemented**. There is no login screen, session middleware, JWT validation, or HTTP Basic authentication in the active codebase.
- **Authorization**: **Flat single-role model**. Any user accessing the HTTP interface has full administrative control (can upload files, override candidate statuses, batch edit gender, trigger deduplication, alter screening rules, and purge the entire database).
- **Default Hardcoded Identity**:
  - The default user recorded in audit logs and overrides is hardcoded as `'Recruiter Admin'` across both frontend ([src/api/client.ts](file:///c:/Users/yarla/linkedin%20application%20filter/src/api/client.ts)) and backend ([server/db.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts)).
- **Multi-Tenancy**: Not implemented. A single SQLite database instance (`linkedin_screening.db`) holds all data across all uploads.

---

## 3. End-to-End Core Workflow

```
[Raw Spreadsheets (.xlsx, .xls, .csv, .pdf)]
                 │
                 ▼
     [1. Pre-Validation & Hash Check] ──> Duplicate Warning Alert
                 │
                 ▼
     [2. Multiline Repair & Token Stitching]
                 │
                 ▼
     [3. Dynamic Column Mapping (40+ headers)]
                 │
                 ▼
     [4. Deterministic Visa Screening] ──> Fail if Sponsorship Required / GC Missing
                 │
                 ▼
     [5. Regional Origin Classification] ──> India, Pakistan, Bangladesh, Nepal, Sri Lanka
                 │
                 ▼
     [6. 13,859 Reference Name Matching] ──> Exact (100%), Bigram (90%), Multi (85%), Surname (55%)
                 │
                 ▼
     [7. SQLite Transactional Persistence] ──> DatabaseSync (linkedin_screening.db)
                 │
                 ▼
     [8. Deterministic Deduplication] ──> Group by Email or Name+Phone, retain 1 PASS record
                 │
                 ▼
     [9. Recruiter Workspace & Overrides] ──> Full-Window Zoom Grid, 1-Click Status, Batch Gender
                 │
                 ▼
     [10. Export Engine] ──> Google Sheets TSV Clipboard (Role Codes) & Filtered XLSX
```

---

## 4. Feature Implementation Status Matrix

The following table reflects the **actual verified state** in the source code:

| Feature / Capability | Implementation Status | Primary Source File | Notes & Verification Details |
| :--- | :--- | :--- | :--- |
| **Multi-File Upload (up to 50 files)** | **Fully Implemented** | [server/index.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L77-L224) | Uses Multer disk storage, parses `.xlsx`, `.xls`, `.csv`, `.pdf`. |
| **Duplicate File Hash Detection** | **Fully Implemented** | [server/db.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts#L344) | Computes SHA-256 hash per file; alerts recruiter in UI. |
| **Multiline Row Stitching Engine** | **Fully Implemented** | [src/shared/tabularParser.ts](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/tabularParser.ts#L126) | Stitches fragmented headlines and shifted Q&A blocks. |
| **Dynamic Column Header Mapping** | **Fully Implemented** | [src/shared/columnMapper.ts](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/columnMapper.ts#L13) | Fuzzy maps 40+ variations to canonical fields. |
| **Deterministic Visa Screening** | **Fully Implemented** | [src/shared/screeningEngine.ts](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/screeningEngine.ts#L222) | Mandatory GC=YES, Sponsorship=NO. Verified with 12 tests. |
| **South Asian Origin Classifier** | **Fully Implemented** | [src/shared/southAsianOriginClassifier.ts](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/southAsianOriginClassifier.ts) | 2,500+ surnames, state-level regional lexicons. |
| **Rule-Based Gender Classifier** | **Fully Implemented** | [src/shared/genderClassifier.ts](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/genderClassifier.ts) | SSA + South Asian + International given name sets. |
| **13,859 Reference Name Matcher** | **Fully Implemented** | [server/referenceNameMatcher.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/referenceNameMatcher.ts) | 5-tier scoring, Western dictionary exclusion, initial blocking. |
| **Candidate Deduplication Engine** | **Fully Implemented** | [server/db.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts#L1687) | Deduplicates by Email or Name+Phone; keeps 1 PASS record. |
| **Recruiter 1-Click Status Override** | **Fully Implemented** | [src/views/ApplicantsView.tsx](file:///c:/Users/yarla/linkedin%20application%20filter/src/views/ApplicantsView.tsx) | Instant `+ PASS` / `Remove` with no mandatory reason. |
| **Batch Gender Modification** | **Fully Implemented** | [server/index.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L857) | Floating action bar bulk updates selected candidates. |
| **Full-Window Zoom Grid** | **Fully Implemented** | [src/views/ApplicantsView.tsx](file:///c:/Users/yarla/linkedin%20application%20filter/src/views/ApplicantsView.tsx#L52) | CSS `zoom: 60%-125%`, 85% default "Fit Table", 99vw width. |
| **Google Sheets TSV Quick-Copy** | **Fully Implemented** | [src/shared/columnMapper.ts](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/columnMapper.ts#L683) | Formats 8 clean columns with normalized role codes. |
| **Excel (.xlsx) Binary Export** | **Fully Implemented** | [server/index.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1009) | SheetJS buffer export with filtered query parameters. |
| **Optional Google Gemini AI Assistant** | **Partially Implemented** | [server/geminiService.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/geminiService.ts) | Backend functional via REST; frontend modal available. API key must be supplied via UI or `.env`. |
| **Cloud Supabase Synchronization** | **Planned / Unimplemented** | [supabase_schema.sql](file:///c:/Users/yarla/linkedin%20application%20filter/supabase_schema.sql) | DDL script exists; no active Supabase client or sync runner in code. |
| **User Authentication / RBAC** | **Missing** | N/A | No user accounts, sessions, or permissions exist. |
| **Automated CI/CD Test Pipeline** | **Missing** | [package.json](file:///c:/Users/yarla/linkedin%20application%20filter/package.json) | No `npm test` script. Internal test suite runs via `/api/run-tests`. |

---

## 5. Technology Stack Summary

- **Backend Runtime**: Node.js `v22.14.0` (LTS), `tsx ^4.23.15`, TypeScript `~6.0.2`
- **Server Framework**: Express `^5.2.1`
- **Database Engine**: Native `node:sqlite` (`DatabaseSync` synchronous SQLite)
- **Spreadsheet & File Engines**: SheetJS `xlsx ^0.18.5`, Multer `^2.4.0`, `pdf-parse ^2.4.5`
- **Frontend Stack**: React `^19.2.8`, Vite `^8.3.0`, Tailwind CSS `^4.3.3`, Lucide React `^1.53.0`
- **External AI (Optional)**: Google Gemini API (`gemini-2.5-flash`, `gemini-3.5-flash-lite`, `gemini-flash-latest`)

---

## 6. Critical Business Rules & Policy Constraints

1. **Rule GC-1 (Mandatory)**: Candidate MUST respond affirmatively (`YES`) to Green Card / US Citizenship.
2. **Rule SP-2 (Mandatory)**: Candidate MUST respond negatively (`NO`) to requiring future visa sponsorship (e.g. H-1B).
3. **Precedence**: Any mandatory question failure causes an immediate status of **`FAIL`**, overriding any name matching or resume strength.
4. **Safety Default**: Missing, blank, or ambiguous answers NEVER auto-pass; they are strictly routed to **`MANUAL REVIEW`**.
5. **Reference Match Strictness**: An isolated first name, surname, single-letter initial, or common Western token CANNOT award a `Strong Match`.

---

## 7. Known Inconsistencies & Change Hazards

- **UI Copy vs Implementation Discrepancy**: [src/views/AuditLogsView.tsx](file:///c:/Users/yarla/linkedin%20application%20filter/src/views/AuditLogsView.tsx#L57) displays a static banner reading *"Zero Ethnicity / AI Inference"*, which directly contradicts the active South Asian Origin Classifier and Gemini AI integration.
- **Supabase Cloud Schema vs SQLite Schema**: `supabase_schema.sql` defines PostgreSQL syntax (`TIMESTAMPTZ`, `JSONB`), whereas the application actually runs on local SQLite (`node:sqlite`). Modifying the SQL file does not migrate SQLite.
- **Single Threaded Synchronous Database**: `node:sqlite` `DatabaseSync` blocks the Node event loop during large batch operations (e.g. 5,000+ candidate writes).
