# Glossary, Technical Assumptions & Unverified Areas

**Repository:** Master Database for AaraTech & ClinisolTech  
**Auditor:** Senior Software Architect  

---

## 1. Business & Domain Terminology Glossary

| Term | Exact System Definition & Meaning |
| :--- | :--- |
| **Master Candidate Profile** | The canonical consolidated human profile stored in the `people` table. Follows the **1 Person = 1 Profile** paradigm, unifying all historical email addresses, phone numbers, job applications, and recruiter feedback under a single identity. |
| **Person ID (`P-000001`)** | The permanent, human-readable identifier assigned sequentially to each candidate profile via PostgreSQL sequence `person_id_seq` or client-side sequence tracking. |
| **Company Isolation** | Strict architectural segregation enforcing that candidate profiles belonging to **AaraTech** (IT recruitment) and **ClinisolTech** (Life Sciences recruitment) must never be compared, consolidated, or auto-merged together. |
| **Verbatim Recruiter Notes** | Screening comments, salary expectations, relocation notes, and visa feedback logged by recruiters. System policy strictly dictates these notes must be preserved 100% word-for-word, prohibiting any AI summarization, modification, or truncation. |
| **Incomplete Profile** | A quarantined lead record stored in `incomplete_records` that lacks either a valid human candidate name or a verified contact method (phone number or email). It is withheld from the master candidate directory until resolved. |
| **Orphan Call Log** | A freeform recruiter remark containing no candidate name and no contact details (e.g. `"called back, line busy"`, `"not interested in contract roles"`). Flagged by heuristic regex or Gemini AI for bulk purging. |
| **Auto-Merge (Rule 2)** | Automatic consolidation of two candidate records without human confirmation, triggered exclusively when candidates have the exact normalized name and matching verified email or phone number. |
| **Possible Match (Rules 3 & 4)** | A flagged candidate pair assigned a `PM-000001` match code routed to the manual review queue because names vary slightly (e.g. "Sai depu" vs "Sai D") or names differ while contact points match. |
| **Reversible Merge** | The consolidation of Candidate B into Candidate A with a complete pre-merge JSON snapshot preserved in `merge_history`, allowing the merge to be reversed cleanly at any time. |
| **Unmerge** | The single-click restoration of a previously merged candidate profile, reconstructing Candidate B and re-assigning their historical applications and contacts back to their original profile. |

---

## 2. Technical Concepts Glossary

| Technical Term | Implementation Definition |
| :--- | :--- |
| **IndexedDB Object Store** | High-capacity, transactional, NoSQL-style key-value storage built natively into the client's web browser (`aaratech_clinisoltech_master_db`). Stores hundreds of megabytes of candidate records locally, bypassing the 5MB `localStorage` ceiling. |
| **Row Level Security (RLS)** | PostgreSQL security feature in Supabase restricting table row access based on user session context (`auth.uid()`). |
| **Trigram GIN Index (`pg_trgm`)** | PostgreSQL Generalized Inverted Index breaking strings into 3-character slices, enabling rapid typo-tolerant fuzzy substring searches on candidate names. |
| **SheetJS (`xlsx`)** | Pure JavaScript library used for client-side parsing of Excel workbooks (`.xlsx`, `.xls`) and CSV files into JSON objects, and vice versa. |
| **E.164 Phone Normalization** | Stripping punctuation and country prefixes to standardize US phone numbers to 10 canonical digits (`2143349058`) for deterministic equality comparison. |
| **Levenshtein Distance** | Algorithmic metric calculating the minimum number of single-character edits required to transform one candidate name string into another. |

---

## 3. Explicit Architectural Assumptions

1. **Client-Centric Execution Model:**
   - *Assumption:* The recruitment team operates on modern desktop or laptop hardware running Google Chrome or Microsoft Edge with sufficient memory (8GB+ RAM) to handle tens of thousands of client-side records in memory.
2. **Single Primary Database per Deployment:**
   - *Assumption:* One Supabase PostgreSQL instance serves as the central source of truth for all users in the organization.
3. **Data Immutability of Notes:**
   - *Assumption:* Recruiter notes are treated as historical legal touchpoints and should never be overwritten or cleaned up by automated scripts.

---

## 4. Explicitly Uninspected & Unverified Areas

In accordance with strict auditor standards, the following areas could not be verified from the current workspace source code:

| Area / Component | Verification Status | Missing Information / Reason for Non-Verification |
| :--- | :---: | :--- |
| **Live Supabase PostgreSQL Migration Status** | **Not Verified** | The auditor has access to the local schema files ([supabase/migrations/20261008000001_master_database_schema.sql](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/supabase/migrations/20261008000001_master_database_schema.sql)), but cannot inspect the live remote Supabase production project to verify whether all migrations and indexes were executed on the live cluster. |
| **Production Supabase RLS Enforcement in Practice** | **Not Verified** | Live Supabase role assignments, custom JWT claims, and remote user policies cannot be inspected without active production administrative credentials. |
| **External Email Delivery Service (Supabase SMTP)** | **Not Verified** | Live SMTP server credentials and email deliverability for password reset emails are configured in the Supabase Cloud dashboard and cannot be verified from client code. |
| **Third-Party LinkedIn ATS Integration** | **Not Verified** | The application stores LinkedIn profile URLs in candidate records, but there is no direct backend OAuth API integration with LinkedIn Recruiter or LinkedIn ATS. |
