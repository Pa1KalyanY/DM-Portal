# 08. Security, Privacy & Reliability Audit

**Document**: Security Posture, Vulnerability Audit & Privacy Risk Assessment  
**Audit Target**: `linkedin-application-filter`  
**Classification Standards**: CVSS v3.1 / OWASP Top 10 Guidelines  
**Auditor**: Senior Software Architect & Security Reviewer  
**Audit Date**: October 2026

---

## 1. Security Vulnerability & Finding Summary

| ID | Vulnerability / Risk | Severity | Affected Component | Status |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Total Absence of Authentication & Access Controls | **CRITICAL** | All API Endpoints ([server/index.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts)) | **Active Risk** |
| **SEC-02** | Unauthenticated Database Wipe Endpoint (`/api/clear-all-data`) | **CRITICAL** | [server/index.ts:1434](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1434) | **Active Risk** |
| **SEC-03** | Gemini AI API Key Stored in Plaintext in SQLite & `.env` | **HIGH** | `.env` & `app_settings` table | **Active Risk** |
| **SEC-04** | Permissive Cross-Origin Resource Sharing (`cors()`) | **MEDIUM** | [server/index.ts:32](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L32) | **Active Risk** |
| **SEC-05** | Unrestricted File Upload Types & Disk Retention | **MEDIUM** | Multer Upload Handler (`/uploads`) | **Active Risk** |
| **SEC-06** | In-Process Event-Loop Blocking via `node:sqlite DatabaseSync` | **MEDIUM** | [server/db.ts:21](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts#L21) | **Active Risk** |
| **SEC-07** | SQL Parameterization Assessment | **LOW (SAFE)** | [server/db.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts) | **Mitigated** |

---

## 2. In-Depth Vulnerability Analysis

### 2.1 SEC-01: Total Absence of Authentication & Access Controls (CRITICAL)
- **Evidence**: [server/index.ts:29-35](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L29-L35). There is no session management, JWT authentication middleware, cookie parsing, or HTTP Basic authentication attached to the Express application.
- **Risk**: Any network agent with HTTP access to port 3001 can query, extract, modify, or delete all candidate resumes, contact details (email, phone, location), and recruiter decision history.
- **Remediation**:
  1. If intended strictly for localhost developer desktop use, bind the Express server explicitly to `127.0.0.1` (`app.listen(PORT, '127.0.0.1')`) instead of listening on all network interfaces (`0.0.0.0`).
  2. For multi-user or hosted deployment, implement an authentication gateway (e.g. Passport.js, OAuth2/OIDC, or Supabase Auth) and verify bearer tokens on every `/api/*` route.

---

### 2.2 SEC-02: Unauthenticated Database Wipe Endpoint (CRITICAL)
- **Evidence**: [server/index.ts:1434-1456](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L1434-L1456):
  ```typescript
  app.all(['/api/clear-all-data', '/api/clear-data'], (_req: Request, res: Response): void => {
    try {
      const result = dbService.clearAllData();
      res.json({ success: true, message: 'All applicant data, imports, files, and audit logs cleared successfully', ...result });
    } catch (err: any) { ... }
  });
  ```
- **Risk**: A single unauthenticated `GET` or `POST` request to `/api/clear-all-data` instantly wipes all candidate rows, import batches, and audit compliance trails from `linkedin_screening.db` and deletes all uploaded spreadsheets from disk.
- **Remediation**:
  1. Remove the `app.all` registration and restrict destructive actions to explicit `DELETE` or `POST` verbs.
  2. Require an administrative confirmation secret token in the request header or disable the endpoint entirely in non-development environments.

---

### 2.3 SEC-03: Secrets Handling & Gemini API Key Storage (HIGH)
- **Evidence**:
  1. `.env` file contains `GEMINI_API_KEY=[REDACTED]`.
  2. [server/db.ts:1333](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts#L1333) saves the API key submitted via `/api/ai/config` into the `app_settings` table in plaintext.
- **Risk**: The SQLite database file (`linkedin_screening.db`) contains the plaintext Google AI Studio API key. Anyone with filesystem read access can extract the key and incur API costs or abuse quota.
- **Remediation**:
  1. Ensure `.env` is never committed to Git (verified: `.gitignore` contains `.env`).
  2. Encrypt the API key at rest using `crypto.createCipheriv` with a machine-specific key if persistent database storage is required.

---

### 2.4 SEC-04: Permissive Cross-Origin Resource Sharing (MEDIUM)
- **Evidence**: [server/index.ts:32](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L32): `app.use(cors());`
- **Risk**: Calling `cors()` with no options generates `Access-Control-Allow-Origin: *`. Any malicious website opened in the recruiter's browser could issue cross-origin requests to `http://localhost:3001` and exfiltrate applicant records.
- **Remediation**: Restrict CORS origins to the Vite frontend origin:
  ```typescript
  app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
  ```

---

### 2.5 SEC-05: Unrestricted File Upload Types & Disk Retention (MEDIUM)
- **Evidence**: [server/index.ts:43-56](file:///c:/Users/yarla/linkedin%20application%20filter/server/index.ts#L43-L56). Multer disk storage does not validate MIME types or file extensions at the middleware level; validation occurs downstream in the handler.
- **Risk**: Large or unauthorized binary files could be uploaded to the `uploads/` folder up to 50MB per file.
- **Remediation**: Implement a `fileFilter` in Multer rejecting any file whose extension is not in `['.xlsx', '.xls', '.csv', '.tsv', '.pdf']`.

---

### 2.6 SEC-06: Database Concurrency & Event Loop Starvation (MEDIUM)
- **Evidence**: [server/db.ts:1](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts#L1): `import { DatabaseSync } from 'node:sqlite';`
- **Risk**: `DatabaseSync` is completely synchronous. During heavy batch operations (e.g. inserting 5,000 candidate records or executing deduplication across 10,000 candidates), the single-threaded Node.js event loop blocks entirely, causing HTTP requests from other browser tabs to stall or time out.
- **Remediation**: If scaling beyond single-user local usage, migrate to asynchronous SQLite bindings or an external connection pool (e.g. PostgreSQL).

---

### 2.7 SEC-07: SQL Injection Risk Assessment (LOW / SAFE)
- **Audit Finding**: **MITIGATED & SAFE**.
- **Evidence**: Across all database methods in [server/db.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts), user inputs are strictly passed through prepared statements with parameter placeholders (`?`):
  - `this.db.prepare('SELECT * FROM applicants WHERE id = ?').get(id)`
  - Parameterized `WHERE` clauses in `getApplicants()` bind filters via `args` array.
  - No raw string interpolation of user inputs was found in SQL queries.

---

## 3. Privacy & Personal Identifiable Information (PII) Audit

1. **PII Elements Stored**:
   - Candidate Full Name, Email Address, Phone Number, Location, LinkedIn Profile URL, Current Employer, Educational Background.
2. **Data Retention & Storage**:
   - All candidate records persist indefinitely in `linkedin_screening.db` until explicitly purged via `/api/clear-all-data` or `/api/applicants/deduplicate`.
   - Contact numbers are sanitized to remove country code prefixes and punctuation.
3. **External Transmission**:
   - When Google Gemini AI integration is invoked, candidate names, educational institutions, headlines, and locations are transmitted over HTTPS to Google AI Studio servers (`https://generativelanguage.googleapis.com`). Recruiters must be aware of company AI privacy policies before submitting applicant batches to external AI endpoints.
