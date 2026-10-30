# API Reference: External & Internal Service Contracts

**Repository:** Master Database for AaraTech & ClinisolTech  
**Application Architecture:** Client-Centric Single Page Application (SPA) with Direct BaaS (Supabase) & External LLM (Google Gemini) Integrations  

---

## 1. External HTTP REST API Endpoints

### 1.1 Google Gemini Generative Language REST API (v1beta)

The application communicates directly with Google's Gemini API from the client browser without an intermediary server.

- **Base Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- **Supported Models (`candidateModels` cascade):**
  1. `gemini-2.5-flash-lite` (Default production model)
  2. `gemini-2.5-flash`
  3. `gemini-3.8-flash`
- **HTTP Method:** `POST`
- **Authentication:** Query parameter `?key={GEMINI_API_KEY}`
- **Request Headers:**
  - `Content-Type: application/json`

#### Request Schema & Payload Structure

```json
{
  "contents": [
    {
      "parts": [
        {
          "text": "<INSTRUCTION_PROMPT_CONTAINING_CANDIDATE_DATA>"
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.1,
    "maxOutputTokens": 8192,
    "responseMimeType": "application/json"
  }
}
```

#### Operations Using Gemini API

| Service Method | Invocation Purpose | Output JSON Contract | Error Fallback Strategy |
| :--- | :--- | :--- | :--- |
| `geminiService.testConnection(model?)` | Validates API key and model availability | `{"status": "ok", "message": "..."}` | Returns error object with status message |
| `geminiService.verifyPossibleMatches(...)` | Analyzes candidate pairs against Rules 1–5 to verify identity | Array of `GeminiMatchVerification` | Falls back to rule-based comparison; sets confidence `0` |
| `geminiService.rescueIncompleteProfiles(...)` | Parses unstructured recruiter notes into verified candidate data | Array of `GeminiIncompleteRescue` | Regex/heuristic fallback extraction in memory |
| `geminiService.extractCandidatesFromRawText(...)` | Ingests unformatted raw copy-pasted blocks of recruiter notes | Array of `GeminiExtractedCandidate` | Throws error back to UI modal for user correction |
| `geminiService.enhanceRowsWithGemini(...)` | Pre-import scan to extract missing phone/email buried in notes | Array of enhanced row objects | Returns original rows unchanged on error |

#### Standard Response & Error Handling
- **Success (HTTP 200):** Response parses `candidates[0].content.parts[0].text`. The helper `stripMarkdownCodeFences` removes any extraneous ` ```json ` markers before `JSON.parse`.
- **Rate Limit (HTTP 429), Model Not Found (HTTP 404), or Service Unavailable (HTTP 503):** The service catches the error, logs a console warning, and transparently retries the request against the next model in `candidateModels`.

---

### 1.2 Supabase PostgREST & Auth API Endpoints

The application utilizes `@supabase/supabase-js` v2.117.3 to communicate with Supabase managed services.

- **Base URL:** Defined dynamically via `getSupabaseCredentials()` (`import.meta.env.VITE_SUPABASE_URL` or `localStorage.getItem('aat_supabase_url')`).
- **Anon Key:** Passed via `apikey` header and `Authorization: Bearer <ANON_KEY>`.

#### Supabase Auth Endpoints

| Client Call | Internal Method | Parameters | HTTP Protocol |
| :--- | :--- | :--- | :--- |
| `client.auth.signInWithPassword` | `authService.signIn` | `{ email, password }` | `POST /auth/v1/token?grant_type=password` |
| `client.auth.resetPasswordForEmail` | `authService.requestPasswordReset` | `email, { redirectTo }` | `POST /auth/v1/recover` |
| `client.auth.updateUser` | `authService.updatePassword` | `{ password }` | `PUT /auth/v1/user` |
| `client.auth.signOut` | `authService.signOut` | None | `POST /auth/v1/logout` |

#### Supabase Database Table Endpoints

All table queries use parameterized PostgREST RPC and REST operations:

| Table Name | Operations Executed | Query Method / Filter |
| :--- | :--- | :--- |
| `people` | Read, Upsert, Update | `client.from('people').select('*')`, `.upsert(chunk, { onConflict: 'id' })` |
| `person_emails` | Read, Upsert, Insert | `client.from('person_emails').upsert(chunk, { onConflict: 'id' })` |
| `person_phones` | Read, Upsert, Insert | `client.from('person_phones').upsert(chunk, { onConflict: 'id' })` |
| `applications` | Read, Upsert, Insert | `client.from('applications').upsert(chunk, { onConflict: 'id' })` |
| `recruiter_contacts` | Read, Upsert, Insert | `client.from('recruiter_contacts').upsert(chunk, { onConflict: 'id' })` |
| `jobs` | Read, Insert, Update | `client.from('jobs').select('*')`, `.insert(newJob)` |
| `imports` | Read, Upsert | `client.from('imports').upsert(importRecord)` |
| `import_rows` | Insert | `client.from('import_rows').insert(rows)` |
| `possible_matches` | Read, Upsert, Update | `client.from('possible_matches').select('*')`, `.update({ status })` |
| `merge_history` | Read, Insert, Update | `client.from('merge_history').insert(mergeRecord)` |
| `audit_log` | Read, Insert | `client.from('audit_log').insert(auditRecord)` |
| `incomplete_records` | Read, Upsert, Delete | `client.from('incomplete_records').select('*')`, `.delete().eq('id', id)` |

---

## 2. Internal Service API Reference

### 2.1 `dbService` API (`src/lib/dbService.ts`)

Central coordinator for the application data state. Manages in-memory cache, local IndexedDB persistence, and remote Supabase synchronization across 49 public methods organized into 7 functional domains:

#### Category 1: Candidate Queries & Search
- `getCandidates(params)`: Retrieves a paginated, filtered list of candidate master profiles.
  ```typescript
  async getCandidates(params: {
    page?: number;            // 1-indexed page number (default: 1)
    pageSize?: number;        // Records per page (default: 25)
    search?: string;          // Full text search across names, emails, phones, IDs, roles
    company?: string;         // 'AaraTech' | 'ClinisolTech' | 'All'
    status?: string;          // CandidateStatus filter or 'All'
    owner?: string;           // Recruiter owner filter or 'All'
    gender?: string;          // 'Male' | 'Female' | 'Other' | 'Unspecified' | 'All'
    contactFilter?: 'all' | 'missing_phone' | 'missing_email';
    hasResumeOnly?: boolean;
    hasLinkedInOnly?: boolean;
    dateFrom?: string;        // YYYY-MM-DD
    dateTo?: string;          // YYYY-MM-DD
  }): Promise<{ candidates: Person[]; totalCount: number }>
  ```
- `getCandidateById(personIdOrUuid: string)`: Retrieves a candidate master profile by UUID or human-readable ID (`P-000123`), including joined relation records (`emails`, `phones`, `applications`, `recruiter_contacts`, `status_history`).
- `getCandidateDateApplied(personId: string)`: Computes earliest application or contact date string for a candidate.
- `getAllPeopleForMatching()`: Returns all non-merged candidate profiles for duplicate cross-matching.

#### Category 2: Candidate Mutations & Single/Batch Updates
- `createCandidate(data: Partial<Person>, createdBy?: string)`: Inserts a new candidate master record, assigns sequence-based ID (`P-000XXX`), detects gender, saves to IndexedDB and syncs to Supabase.
- `updateCandidateProfile(personId: string, updates: Partial<Person>, changedBy: string)`: Updates personal details, primary contacts, visa, location, education, certifications, and experience.
- `updateStatus(personId: string, newStatus: CandidateStatus, changedBy: string, reason?: string)`: Updates operational status, appends to `person_status_history`, records `audit_log`, and syncs.
- `updateOwner(personId: string, newOwner: string, changedBy: string)`: Reassigns candidate recruiter owner and logs audit trail.
- `updateGender(personId: string, newGender: Gender, changedBy?: string)`: Explicitly updates candidate gender tag.
- `batchUpdateGender(personIds: string[], newGender: Gender, changedBy?: string)`: Updates gender for multiple selected candidate IDs.
- `batchUpdateGenderByFilter(filter: any, newGender: Gender, changedBy?: string)`: Bulk updates gender across candidates matching filter criteria.
- `batchAutoDetectGender(personIds: string[], changedBy?: string)`: Re-runs name/notes gender heuristics across selected candidate IDs.
- `addRecruiterContact(personId: string, contact: Partial<RecruiterContact>)`: Logs a recruiter communication touchpoint into timeline.

#### Category 3: Duplicate Matching, Deduplication & Merging
- `getPossibleMatches(status?: PossibleMatchStatus)`: Returns detected duplicate pairs flagged for review.
- `resolvePossibleMatch(matchId: string, resolution: 'Merged' | 'Dismissed', resolvedBy: string)`: Updates possible match review resolution.
- `runDuplicateScan()`: Executes exhaustive pairwise evaluation across all active candidates using Rules 1–5.
- `autoMergeEligibleCandidates(options?)`: Scans candidates and automatically merges pairs meeting Rule 2/3 criteria.
- `resolveCanonicalPerson(personId: string)`: Follows merge chains to return the root survivor candidate.
- `mergeCandidates(targetPersonId: string, sourcePersonId: string, mergedBy?: string)`: Performs atomic merge: moves child relations, marks source `Merged`, records reversible `merge_history` JSON snapshot.
- `unmergeCandidates(mergeHistoryId: string)`: Reverses a merge using stored snapshot; restores source candidate and re-attaches relations.
- `isAutoMergeEnabled()`: Checks if automated merge during imports is currently enabled.
- `setAutoMergeEnabled(enabled: boolean)`: Toggles automated merge during imports.

#### Category 4: Incomplete Profiles & Quarantine Queue
- `getAllIncompleteProfiles()`: Returns all records currently quarantined in incomplete staging.
- `getIncompleteRecords(params?)`: Returns paginated, filtered incomplete quarantine records.
- `getIncompleteCount()`: Returns total count of quarantined incomplete profiles.
- `getRecoverableIncompleteCount()`: Returns count of incomplete profiles containing recoverable contact data.
- `getAnonymousIncompleteCount()`: Returns count of screening notes lacking candidate identity.
- `updateIncompleteRecord(id: string, updates: Partial<IncompleteRecord>)`: Edits raw quarantined lead attributes.
- `deleteIncompleteRecord(id: string)`: Removes single quarantined lead record.
- `deleteIncompleteRecordsBatch(ids: string[])`: Bulk deletes quarantined records by ID array.
- `deleteAllIncompleteRecords()`: Clears entire incomplete queue.
- `deleteAnonymousIncompleteRecords()`: Purges all anonymous screening logs lacking name and contacts.
- `promoteIncompleteToMaster(incompleteId: string, candidateData: Partial<Person>)`: Promotes single incomplete lead to master candidate.
- `batchPromoteIncompleteToMaster(items: any[])`: Atomic batch promotion of incomplete leads to master database.
- `autoRecoverIncompleteRecords()`: Automated engine extracting contacts from recruiter notes and promoting recoverable profiles.

#### Category 5: Job Requisition Management
- `getJobs(company?: string)`: Returns job slots filtered by company (AaraTech / ClinisolTech).
- `addJob(job: Partial<Job>)`: Creates a new job requisition slot.
- `updateJobStatus(jobId: string, status: 'Active' | 'Closed' | 'Draft')`: Updates job status.

#### Category 6: Ingestion & Supabase Cloud Synchronization
- `saveImportBatch(batch: ImportBatchData)`: Commits import metadata, staged rows, master candidates, and relations to local store.
- `syncBatchToSupabase(batch: ImportBatchData)`: Pushes staged batch entities to live Supabase PostgreSQL tables in 100-row chunks.
- `syncAllLocalToSupabase()`: Full database synchronization push from IndexedDB to Supabase.
- `getStorageStats()`: Returns entity counts across memory and IndexedDB stores.

#### Category 7: Diagnostics, Metrics & Data Healing
- `getDashboardStats(company?: string)`: Computes KPI metrics, company counts, gender distribution, and deduplication ratios.
- `getImports()`: Returns historical import batch logs.
- `getAuditLogs(limit?: number)`: Returns system audit trail records.
- `getMergeHistories()`: Returns candidate merge logs for unmerge audit.
- `healCandidateRecords()`: Scans database to repair misplaced phone numbers in names, recruiter roles, and shifted fields.
- `clearAllData()`: Clears memory, IndexedDB tables, and optionally deletes remote Supabase records.
- `resetLocalDatabase()`: Resets local stores to initial seeded baseline.


---

### 2.2 `matchingEngine` API (`src/lib/matchingEngine.ts`)

#### `evaluateCandidatePair(candidateA, candidateB, options?)`
Evaluates two candidate master profiles against the recruiting decision matrix.
```typescript
export function evaluateCandidatePair(
  candidateA: Person,
  candidateB: Person,
  options?: {
    separatedPairs?: Set<string>;
    unmergedPairs?: Set<string>;
    contradictoryIdentity?: boolean;
  }
): DuplicateDecisionResult

export interface DuplicateDecisionResult {
  decision: 'AUTO_MERGE' | 'MANUAL_REVIEW' | 'NO_MATCH';
  confidenceScore: number; // 0.0 to 1.0
  reason: string;
  ruleTriggered: string;
  nameMatchStatus: 'Exact' | 'Similar' | 'Different';
  emailMatchStatus: 'Match' | 'Different' | 'Missing';
  phoneMatchStatus: 'Match' | 'Different' | 'Missing';
  matchedEmail?: string;
  matchedPhone?: string;
  conflicts: string[];
}
```

#### `compareCandidateNames(nameA?, nameB?)`
Performs normalized string comparison and token analysis:
- `'Exact'`: Normalized character match or joined/separated equivalent (e.g. `SaiVenkat` vs `Sai Venkat`).
- `'Similar'`: Levenshtein distance >= 0.82 or initial/abbreviation variation (e.g. `Ravi K` vs `Ravi Kumar`).
- `'Different'`: Distinct names or similarity < 0.82.
```typescript
export function compareCandidateNames(
  nameA?: string | null,
  nameB?: string | null
): 'Exact' | 'Similar' | 'Different'
```

---

### 2.3 `importEngine` API (`src/lib/importEngine.ts`)

#### `parseFileForPreview(file, selectedSheet?)`
Parses an uploaded `.xlsx`, `.xls`, or `.csv` file and extracts sheet names, headers, top 5 sample rows, and auto-detected column mappings.
```typescript
export async function parseFileForPreview(
  file: File,
  selectedSheet?: string
): Promise<ImportPreviewData>
```

#### `executeImport(file, mappings, existingPeople, onProgress?, targetCompanyOverride?, targetGenderOverride?, selectedSheet?)`
Executes the full import pipeline across spreadsheet rows.
```typescript
export async function executeImport(
  file: File,
  mappings: ColumnMappingConfig[],
  existingPeople: Person[],
  onProgress?: (processed: number, total: number) => void,
  targetCompanyOverride?: 'AaraTech' | 'ClinisolTech' | 'auto',
  targetGenderOverride?: 'auto' | 'Male' | 'Female',
  selectedSheet?: string
): Promise<ImportExecutionResult>
```

---

### 2.4 `genderDetection` API (`src/lib/genderDetection.ts`)

#### `detectGender(rawGenderOrOptions?, firstNameArg?, fullNameArg?, notesArg?)`
Classifies candidate gender into `'Male' | 'Female' | 'Other' | 'Unspecified'`.
```typescript
export function detectGender(
  rawGenderOrOptions?: string | null | DetectGenderOptions,
  firstNameArg?: string | null,
  fullNameArg?: string | null,
  notesArg?: string | null
): Gender
```

---

### 2.5 `indexedDbService` API (`src/lib/indexedDb.ts`)

Low-level asynchronous wrapper over the browser's native `IDBDatabase`.

```typescript
class IndexedDBManager {
  getDB(): Promise<IDBDatabase | null>;
  getAll<T>(storeName: DBStoreName): Promise<T[]>;
  getItem<T>(storeName: DBStoreName, key: string): Promise<T | null>;
  putItem<T>(storeName: DBStoreName, item: T): Promise<boolean>;
  putBatch<T>(storeName: DBStoreName, items: T[]): Promise<boolean>;
  deleteItem(storeName: DBStoreName, key: string): Promise<boolean>;
  clearStore(storeName: DBStoreName): Promise<boolean>;
  clearAll(): Promise<boolean>;
  getStorageStats(): Promise<{ peopleCount: number; jobsCount: number; importsCount: number; matchesCount: number }>;
}
```
