# 13. Domain Glossary, System Terminology & Baseline Assumptions

**Document**: Definitive Terminology, Status Definitions & Domain Glossary  
**Target System**: `linkedin-application-filter`  
**Audit Date**: October 2026

---

## 1. Domain Terminology & System Concepts

### 1.1 Candidate Status Dispositions
- **`PASS`**: The candidate has met all mandatory work authorization criteria (Green Card / US Citizenship is `YES`, Future Sponsorship required is `NO`), and their background matches South Asian origin / reference criteria (or has been promoted by a recruiter override).
- **`FAIL`**: The candidate failed one or both mandatory legal screening requirements (answered `NO` to Green Card, or `YES` to requiring future visa sponsorship).
- **`MANUAL REVIEW`**: The candidate cannot be definitively classified automatically due to missing or unclear screening answers, or because their name/profile was not verified as South Asian. Requires human recruiter review.
- **`ERROR`**: The spreadsheet row contained unparseable binary data or corrupted formatting that could not be processed.

### 1.2 Decision Types
- **`automated_result`**: The status calculated strictly by algorithmic rules (`PASS`, `FAIL`, `MANUAL_REVIEW`, `ERROR`).
- **`manual_result`**: The status assigned by a human recruiter overriding the system decision (`NULL` if never overridden).
- **`effective_result`**: The final governing status displayed in the UI and used in exports: `manual_result ?? automated_result`.

### 1.3 Screening Questions
- **Rule GC-1 (`GREEN_CARD_CITIZEN`)**: Mandatory requirement evaluating the question *"Do You Have a Green Card or US Citizen ?"*. Required answer: **`YES`**.
- **Rule SP-2 (`FUTURE_SPONSORSHIP`)**: Mandatory requirement evaluating the question *"Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)?"*. Required answer: **`NO`**.
- **Rule WA-3 (`US_WORK_AUTH`)**: Optional rule evaluating *"Are you legally authorized to work in the United States?"*. Required answer: **`YES`**.
- **Rule SA-4 (`SOUTH_ASIAN_ORIGIN`)**: Regional origin filter evaluating candidate name and background for Indian, Pakistani, Bangladeshi, Nepalese, or Sri Lankan markers.

---

## 2. Standardized Job Role Abbreviation Codes

The platform standardizes diverse ATS and LinkedIn job titles into industry standard codes for clipboard export into recruiter Google Sheets:

| Standard Code | Full Role Title | Typical Input Job Titles |
| :--- | :--- | :--- |
| **`DA`** | Data Analyst | Data Analyst, Senior Data Analyst, BI Analyst, Tableau Developer, Power BI Analyst |
| **`DE`** | Data Engineer | Data Engineer, Big Data Engineer, ETL Developer, Snowflake Developer, Databricks Engineer |
| **`BA`** | Business Analyst | Business Analyst, Technical Business Analyst, Product Analyst, Systems Analyst |
| **`DS`** | Data Scientist | Data Scientist, Machine Learning Engineer, AI Specialist, NLP Engineer |
| **`AWS`** | Cloud / AWS Architect | AWS Cloud Engineer, Cloud Architect, DevOps Engineer, Site Reliability Engineer |
| **`Cybersecurity`**| Information Security | Cybersecurity Analyst, SOC Analyst, Information Security Analyst, Pen Tester |
| **`QA`** | Quality Assurance | QA Engineer, Quality Assurance, Test Automation Engineer, SDET |

---

## 3. Reference Name Matching Categories & Scoring Tiers

- **`Strong Match` (Score: 0.85 – 1.00)**:
  - Exact full-name match against reference datasets (1.00).
  - Consecutive multi-letter 2-gram combination match (0.90).
  - Multiple distinct South Asian tokens matched (0.85).
- **`Possible Match` (Score: 0.35 – 0.55)**:
  - Single distinctive South Asian surname (0.55). Never awarded Strong Match.
  - Single ultra-common South Asian token e.g. `Kumar`, `Singh`, `Patel` (0.35).
- **`No Match` (Score: 0.05 – 0.10)**:
  - Candidate name does not match reference datasets.
  - Only Western common names matched (`James Cook`, `Jonathan Amirante`).
  - Only single-letter initials present (`Ola C.`, `Derek D.`).

---

## 4. Candidate Deduplication Concepts

- **Authoritative Candidate**: When a candidate has submitted applications for multiple jobs or appears in multiple upload files, exactly one row is retained as the authoritative record.
- **Resolution Precedence**: Candidates with `PASS` status are prioritized over `FAIL` or `MANUAL_REVIEW`, followed by profile data completeness (presence of email and phone), followed by the latest upload timestamp (`created_at DESC`).

---

## 5. Architectural Baseline Assumptions

1. **Local Single-User Execution**: The application is designed to be executed on a recruiter's local machine via `npm run dev`. It assumes low concurrent write traffic.
2. **US Work Authorization Context**: All legal screening rules assume candidates are applying for employment within the United States.
3. **LinkedIn Recruiter Export Formats**: The tabular parser and column mapper assume incoming spreadsheets originate from LinkedIn Job Postings or standard Applicant Tracking Systems.
4. **Voluntary Self-Identification**: Screening question answers are evaluated as reported by the applicant in their LinkedIn application without external credit or visa database lookups.
