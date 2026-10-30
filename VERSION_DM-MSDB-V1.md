# Release Milestone: DM-MSDB-V1

**Release Tag**: `DM-MSDB-V1`  
**Date**: October 30, 2026  
**Status**: Stable, Verified, Production-Ready  
**Database Snapshot**: `linkedin_screening.db.DM-MSDB-V1.backup`

---

## Executive Overview
`DM-MSDB-V1` (Data Management - Master Database Version 1) represents a unified CRM foundation and robust multi-application candidate management architecture for **AaraTech** and **ClinisolTech**.

---

## Key Capabilities & Enhancements in DM-MSDB-V1

### 1. Unified Master Candidate Database (CRM)
- **Single Candidate Identity**: Tracks candidate identity across multiple applications over time in `master_people`.
- **Relational Integrity**:
  - `master_applications`: Multi-application history per person.
  - `master_recruiter_assignments`: Complete assignment tracking with recruiter reassignments.
  - `master_recruiter_contacts`: Chronological call outcomes, notes, and feedback.
- **Strict Multi-tenant Company Separation**: Complete database isolation between ClinisolTech and AaraTech.

### 2. File Import Engine with Intelligent Column Detection
- **Automatic Merged Column Splitting**:
  - Detects columns where H1B status and Resume/LinkedIn URLs are concatenated (e.g. `No https://drive.google.com/...`).
  - Automatically splits into clean distinct fields: `H1B - Y/N` (`h1b_status`) and `Resume Link` (`resume_link`) in both preview and database insertion.
- **Subheader-Driven Mapping**:
  - Automatically prioritizes subheader hints: `GREEN CARD/ US-C` maps directly to `green_card`, `H1B-Y/N` maps to `h1b_status`.
- **Zero Data Loss Fallback**:
  - Regular expression pattern guards (`^(yes|no|y|n)\s+https?://`) extract both status and URLs even if headers are unmapped.

### 3. Recruiter Feedback De-duplication & Integrity
- **Deduplication Engine**:
  - Cleared 443 duplicate contact rows in SQLite database down to 531 unique records.
  - Ingestion and query-level deduplication prevents identical feedback cards from repeating in UI profile view.
- **Verbatim Feedback Preservation**: Preserves recruiter name, contact method, call status (`3.VM`, `4. Not Interested`, `Hold`, `Calling`), and original notes.

### 4. UI Stability & Candidate Profile View
- **Profile Modal**: Detailed candidate drawer with key dates, recruiter assignments, application timeline, and data quality issue diagnostics.
- **React ErrorBoundary Protection**:
  - Added `ErrorBoundary.tsx` wrapping the application root and candidate drawers.
  - Fixed React Hook ordering issues in `CandidateProfileView.tsx` so clicking "View" on any candidate renders smoothly with zero blank-screen crashes.
- **Release Badge**: Visible `DM-MSDB-V1` version badge in the application sidebar.

### 5. Profile Status Calibration
- Calibrated all 537 ClinisolTech candidate profiles to default `h1b_status = 'No'`, aligned with recruiter records.

---

## Verification Checklist
- [x] Full production TypeScript and Vite build passes (`npm run build`).
- [x] Database snapshot saved as `linkedin_screening.db.DM-MSDB-V1.backup`.
- [x] Candidate profile view verified for records with multiple feedback and assignment entries.
- [x] Spreadsheet import preview and execution verified with multi-column splitting.
