# Security, Privacy, and Reliability Audit

**Repository:** Master Database for AaraTech & ClinisolTech  
**Auditor:** Senior Security Architect & Application Security Specialist  
**Audit Standard:** OWASP Top 10, CWE / SANS Top 25, Enterprise Data Privacy & Secret Hygiene Standards  

---

## 1. Vulnerability & Risk Summary Table

| Finding ID | Severity | Category | Vulnerability Title | Source Location | Status |
| :---: | :---: | :---: | :--- | :--- | :---: |
| **SEC-01** | **CRITICAL** | Secrets Management | Hardcoded Fallback Google Gemini API Key in Source Code | [src/lib/geminiService.ts#L92](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/geminiService.ts#L92) | **Open** |
| **SEC-02** | **HIGH** | Access Control / Authorization | Overly Permissive Row Level Security (RLS) Policies | [supabase/migrations/...sql#L323-L334](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/supabase/migrations/20261008000001_master_database_schema.sql#L323-L334) | **Open** |
| **SEC-03** | **MEDIUM** | Authentication | Client-Side Password Authentication with Hardcoded Demo Credentials | [src/lib/authService.ts#L15-L56](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/authService.ts#L15-L56) | **Open** |
| **SEC-04** | **MEDIUM** | Privacy & Storage | Cleartext Credential & Session Storage in `localStorage` | [src/lib/supabase.ts#L8-L9](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/supabase.ts#L8-L9) | **Open** |
| **SEC-05** | **LOW** | Concurrency | Client-Side Race Condition during Concurrent Bulk Upserts | [src/lib/dbService.ts#L92-L123](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/dbService.ts#L92-L123) | **Open** |
| **SEC-06** | **LOW** | Injection Safety | SQL Injection Resilience (Positive Finding) | Architecture-wide | **Secured** |

---

## 2. Detailed Security Findings

### SEC-01: Hardcoded Fallback Google Gemini API Key in Source Code
- **Severity:** **CRITICAL (CVSS 9.1)**
- **CWE:** CWE-798: Use of Hard-coded Credentials
- **File:** [src/lib/geminiService.ts:L92](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/geminiService.ts#L92)
- **Evidence:**
  ```typescript
  // Line 91-93 of src/lib/geminiService.ts:
  // Reliable default fallback provided by administrator
  return '[REDACTED_GEMINI_API_KEY]';
  ```
- **Risk Analysis:** In modern Single Page Applications (SPAs), all client source code compiled by Vite into `dist/assets/*.js` is delivered in plaintext to end users. Any browser user opening DevTools can inspect the compiled bundle and extract this Google Gemini API key. This allows malicious actors to exhaust the organization's Gemini quota, generate unauthorized LLM requests, or incur substantial cloud billing costs.
- **Recommended Remediation:**
  1. Revoke the compromised API key immediately in Google AI Studio / Google Cloud Console.
  2. Remove line 92 from `src/lib/geminiService.ts`.
  3. Enforce API key retrieval solely from environment variables (`import.meta.env.VITE_GEMINI_API_KEY`) or from runtime user entry saved in browser session storage.

---

### SEC-02: Overly Permissive Row Level Security (RLS) Policies
- **Severity:** **HIGH (CVSS 8.2)**
- **CWE:** CWE-284: Improper Access Control
- **File:** [supabase/migrations/20261008000001_master_database_schema.sql:L322-L334](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/supabase/migrations/20261008000001_master_database_schema.sql#L322-L334)
- **Evidence:**
  ```sql
  -- Lines 323-334:
  CREATE POLICY "Allow public read-write for internal CRM people" ON people FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "Allow public read-write for internal CRM person_emails" ON person_emails FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "Allow public read-write for internal CRM person_phones" ON person_phones FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "Allow public read-write for internal CRM applications" ON applications FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "Allow public read-write for internal CRM recruiter_contacts" ON recruiter_contacts FOR ALL USING (true) WITH CHECK (true);
  ```
- **Risk Analysis:** Although Row Level Security is enabled on PostgreSQL tables, the policy definition grants full read, write, update, and delete privileges to the `anon` public role without authentication verification (`USING (true) WITH CHECK (true)`). Anyone with knowledge of the Supabase project URL and anon public key can issue direct REST queries to `https://<project-id>.supabase.co/rest/v1/people` and dump or delete all candidate data.
- **Recommended Remediation:**
  1. Update RLS policies to require authenticated user tokens:
     ```sql
     CREATE POLICY "Enforce authenticated access on people" ON people
     FOR ALL TO authenticated
     USING (auth.uid() IS NOT NULL)
     WITH CHECK (auth.uid() IS NOT NULL);
     ```
  2. For administrative batch sync operations, use a backend API route with the Supabase `service_role` key rather than exposing public write access to the anon key.

---

### SEC-03: Client-Side Password Authentication with Hardcoded Demo Credentials
- **Severity:** **MEDIUM (CVSS 6.5)**
- **CWE:** CWE-522: Insufficiently Protected Credentials
- **File:** [src/lib/authService.ts:L15-L56](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/authService.ts#L15-L56)
- **Evidence:**
  ```typescript
  // Lines 15-25:
  const DEMO_USERS: Record<string, { password: string; user: UserSession }> = {
    'marketing@aaratech.com': {
      password: '[REDACTED_DEFAULT_PASSWORD]',
      user: { id: 'usr-mkt-team', email: 'marketing@aaratech.com', ... }
    },
    ...
  ```
- **Risk Analysis:** While designed as a convenience fallback when Supabase Auth is offline, storing plaintext passwords in client code allows bypass of authentication. Furthermore, password update operations (`updatePassword`) only update local session state when Supabase Auth is offline.
- **Recommended Remediation:**
  1. Restrict demo fallback authentication to non-production environments (`import.meta.env.DEV`).
  2. Require live Supabase Auth with email confirmation in production.

---

### SEC-04: Cleartext Credential & Session Storage in `localStorage`
- **Severity:** **MEDIUM (CVSS 5.8)**
- **CWE:** CWE-922: Insecure Storage of Sensitive Information
- **Files:** [src/lib/supabase.ts:L8-L9](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/supabase.ts#L8-L9), [src/lib/authService.ts:L58](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/authService.ts#L58)
- **Evidence:** `localStorage.getItem('aat_supabase_url')`, `localStorage.getItem('aat_supabase_key')`, and `localStorage.getItem('aat_auth_session')` store authentication tokens and Supabase API keys unencrypted.
- **Risk Analysis:** Any Cross-Site Scripting (XSS) vulnerability or rogue browser extension running in the user's browser context can read `localStorage` and exfiltrate database credentials and session tokens.
- **Recommended Remediation:** Transition authentication session storage to HTTP-only, secure, SameSite cookies. Store API credentials in secure backend environment variables.

---

### SEC-05: Client-Side Concurrency & Race Conditions during Bulk Sync
- **Severity:** **LOW (CVSS 3.7)**
- **CWE:** CWE-362: Concurrent Execution using Shared Resource with Improper Synchronization
- **File:** [src/lib/dbService.ts:L92-L123](file:///c:/Users/yarla/OneDrive/Documents/Desktop/Master%20database%20for%20Aaratech%20&%20Clinisoltech/src/lib/dbService.ts#L92-L123)
- **Evidence:** `parallelChunkUpsert` dispatches 3 concurrent `Promise.all` chunk upserts of 250 records each to Supabase PostgreSQL without database-level transactional locks across foreign key tables.
- **Risk Analysis:** If an application record references a newly created `person_id` that is part of a concurrent chunk that has not yet completed insertion, a foreign key violation could theoretically occur. (In practice, `dbService.ts` mitigates this by inserting `people` before inserting child `person_emails` and `person_phones`).

---

### SEC-06: SQL Injection Resilience (Positive Security Finding)
- **Severity:** **INFORMATIONAL (Defended)**
- **Assessment:** **No SQL Injection Vulnerabilities Identified in Application Runtime.**
- **Evidence:**
  1. The application does not execute raw SQL queries via string concatenation in the browser.
  2. All interactions with Supabase PostgreSQL are mediated through the Supabase PostgREST client library (`client.from('table').select().upsert()`), which strictly uses parameterized query mechanisms.
  3. Native IndexedDB uses structured JavaScript object stores and indexed keys, completely immune to SQL injection.
  4. The file `src/lib/migrationSql.ts` contains static DDL strings designed solely for human copy-pasting into the administrative Supabase SQL Editor.

---

## 3. Candidate Privacy & PII Handling

1. **Candidate Contact Details:** Candidate phone numbers, email addresses, and locations are stored in plaintext in IndexedDB and Supabase. While necessary for recruiting operations, access must be restricted to authorized recruiting personnel.
2. **Verbatim Recruiter Feedback:** Screening feedback frequently contains compensation details, visa statuses (e.g. `OPT EAD`, `H1B`, `Green Card`), and personal remarks. These notes are preserved verbatim.
3. **Data Erasure & Deletion:** The system provides full deletion capabilities:
   - Individual candidate deletion (`dbService.deleteCandidateProfile`).
   - Incomplete record deletion (`deleteIncompleteRecord`, `deleteAnonymousIncompleteRecords`).
   - Complete database wipe (`dbService.clearAllData`), which flushes IndexedDB stores and triggers a cascade delete in Supabase.
