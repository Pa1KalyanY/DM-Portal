# System Architecture & Data Flow

**Repository:** Master Database for AaraTech & ClinisolTech  
**Specification Level:** Senior Enterprise Architect Audit  
**Architecture Style:** Client-Centric Single Page Application (SPA) with Dual Persistence (IndexedDB + Cloud PostgreSQL) & External GenAI Engine  

---

## 1. Architectural Overview & Component Tiers

The system is constructed as a modern, high-throughput recruitment application designed to ingest, normalize, deduplicate, and manage tens of thousands of candidate profiles across two sister staffing entities (**AaraTech** and **ClinisolTech**).

```mermaid
flowchart TB
    subgraph ClientTier ["Client Browser Tier (React 19 + TypeScript)"]
        UI["Presentation Layer\n(Dashboard, Import, Candidates, Matches, Merge, Jobs)"]
        StateStore["In-Memory Store: LocalDatabaseStore\n(Caches People, Jobs, Imports, Matches)"]
        EngineLayer["Business Engines\n- matchingEngine\n- importEngine\n- normalization\n- genderDetection\n- geminiService"]
    end

    subgraph LocalPersistence ["Local Persistence Tier (Browser Native)"]
        IDB[("IndexedDB: aaratech_clinisoltech_master_db\n(Stores: people, jobs, imports, matches, incomplete)")]
        LS[("LocalStorage\n(Credentials, Session, Zoom, API Keys)")]
    end

    subgraph CloudServices ["Cloud & External Services Tier"]
        SupabaseDB[("Supabase Cloud (PostgreSQL 15+)\nTables: people, person_emails, person_phones,\napplications, recruiter_contacts, imports, etc.")]
        GeminiAPI["Google Gemini AI REST API\n(gemini-2.5-flash-lite / gemini-2.5-flash)"]
    end

    UI --> StateStore
    UI --> EngineLayer
    EngineLayer --> StateStore
    StateStore <--> IDB
    StateStore <--> LS
    StateStore -- "Parallel Chunk Upserts (250/batch)" --> SupabaseDB
    EngineLayer -- "v1beta REST (Deterministic Temp 0.1)" --> GeminiAPI
```

### 1.1 Architectural Tiers Breakdown

1. **Presentation Layer (React 19 + TailwindCSS v4):**
   - Composed of modular, stateful functional views: `DashboardView`, `ImportView`, `CandidatesListView`, `CandidateProfileView`, `PossibleMatchesView`, `MergeCandidatesView`, `IncompleteProfilesView`, `JobsView`, `ReportsView`, `GlobalSearchView`, and `SettingsView`.
   - Managed via top-level shell `App.tsx` and enterprise layout components (`Sidebar.tsx`, `Header.tsx`).

2. **In-Memory & Local Synchronization Layer (`src/lib/dbService.ts` & `src/lib/indexedDb.ts`):**
   - Implements `LocalDatabaseStore`, an in-memory cache holding arrays of all entities.
   - Transparently backed by **IndexedDB** (`aaratech_clinisoltech_master_db`, Version 2). Solves the browser 5MB `localStorage` limit by providing hundreds of megabytes of reliable local disk storage.
   - On browser boot, records are read from IndexedDB in parallel (`Promise.all`), self-healed, and loaded into memory within milliseconds.

3. **Cloud Synchronization Tier (`src/lib/supabase.ts`):**
   - Connects to Supabase Cloud PostgreSQL using `@supabase/supabase-js`.
   - Executes background parallel chunk upserts (`parallelChunkUpsert` in `dbService.ts` batches 250 records per chunk with a concurrency factor of 3).
   - Provides resilient offline-first behavior: if internet connectivity or Supabase credentials are unavailable, the application functions 100% locally on IndexedDB.

4. **External Artificial Intelligence Tier (`src/lib/geminiService.ts`):**
   - Direct client-to-API integration with Google Generative Language v1beta endpoint.
   - Uses zero-shot prompt engineering with temperature `0.1` and `responseMimeType: "application/json"`.
   - Features automated model fallback cascading from `gemini-2.5-flash-lite` to `gemini-2.5-flash` to `gemini-3.8-flash`.

---

## 2. Application Entry Points & Initialization Sequence

The application boot sequence follows a strict dependency lifecycle to guarantee data integrity before rendering views:

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Browser Client
    participant Main as main.tsx
    participant App as App.tsx
    participant AuthService as authService.ts
    participant DBService as dbService.ts
    participant IDB as indexedDB.ts
    participant Supabase as Supabase Cloud

    Browser->>Main: Load bundle (index.html -> main.tsx)
    Main->>App: Mount <App /> component
    App->>AuthService: getCurrentSession()
    alt No Active Session
        App-->>Browser: Render <AuthView /> (Login Portal)
    else Active Session Found
        App->>DBService: Trigger initialization
        DBService->>IDB: Open DB 'aaratech_clinisoltech_master_db' v2
        IDB-->>DBService: Return IndexedDB Instance
        DBService->>IDB: Promise.all([getAll('people'), getAll('jobs'), ...])
        IDB-->>DBService: Return stored datasets
        DBService->>DBService: healAllCandidateData() (self-repair malformed records)
        App->>Supabase: checkSupabaseHealth() (Ping PostgreSQL)
        Supabase-->>App: HealthCheckResult (connected: boolean, latencyMs)
        App->>DBService: autoRecoverIncompleteRecords() (Background queue scan)
        App-->>Browser: Render Active Page (Default: 'dashboard')
    end
```

---

## 3. End-to-End Business Workflows

### 3.1 Business Workflow Diagram

```mermaid
flowchart TD
    Start([Recruiter Has Leads / Spreadsheet]) --> IngestChoice{Input Method}
    
    IngestChoice -->|Excel / CSV File| Upload[Upload in ImportView]
    IngestChoice -->|Raw Pasted Text| Paste[Paste in Raw Lead Area]
    
    Paste --> GeminiIngest{Run Gemini AI Direct Extraction?}
    GeminiIngest -->|Yes| AIExtract[Gemini extracts verbatim candidates & strips orphan call logs]
    AIExtract --> SheetConvert[Convert to in-memory XLSX File]
    GeminiIngest -->|No| FastParse[Regex & Token Parser converts to XLSX]
    
    Upload --> ColDetect[Auto-Detect Column Mappings]
    SheetConvert --> ColDetect
    
    ColDetect --> VerifyCol[Recruiter Verifies / Adjusts Mappings]
    VerifyCol --> Execute[Execute Import Pipeline]
    
    Execute --> Normalization[Normalize: Name, Phone to E.164, Email, Job Title, Gender]
    
    Normalization --> CompletenessCheck{Valid Name AND Contact Info?}
    
    CompletenessCheck -->|No| Quarantine[Route to Incomplete Profiles Queue]
    Quarantine --> ReviewQueue[Quarantine Management & AI Rescue]
    
    CompletenessCheck -->|Yes| Dedup[Run Duplicate Decision Engine]
    
    Dedup --> Decision{Decision Outcome}
    
    Decision -->|RULE 2: Exact Name + Contact Match| AutoMerge[Auto-Merge into Existing Master Profile]
    Decision -->|RULE 3/4: Name Variation or Different Name + Contacts Match| PossibleMatch[Flag to Possible Matches Queue]
    Decision -->|RULE 1 or 5: No Match or Disjoint Identities| NewPerson[Create New Master Profile P-XXXXXX]
    
    AutoMerge --> Persist[Persist to IndexedDB & Sync to Supabase]
    PossibleMatch --> Persist
    NewPerson --> Persist
    
    Persist --> End([Updated Candidate Directory])
```

---

## 4. Module Responsibilities & Dependency Map

```mermaid
graph TD
    subgraph UI_Components ["UI Components"]
        App["App.tsx"]
        AuthV["AuthView.tsx"]
        DashV["DashboardView.tsx"]
        ImpV["ImportView.tsx"]
        CandList["CandidatesListView.tsx"]
        CandProf["CandidateProfileView.tsx"]
        PossMatch["PossibleMatchesView.tsx"]
        MergeV["MergeCandidatesView.tsx"]
        IncompV["IncompleteProfilesView.tsx"]
        JobsV["JobsView.tsx"]
        RepV["ReportsView.tsx"]
        SetV["SettingsView.tsx"]
    end

    subgraph Core_Libraries ["Core Business Logic & Infrastructure"]
        DBSvc["dbService.ts\n(Central State & Database Layer)"]
        MatchEng["matchingEngine.ts\n(Deterministic Decision Rules)"]
        ImpEng["importEngine.ts\n(Spreadsheet & Ingestion Pipelines)"]
        Norm["normalization.ts\n(Email, Phone, Name Sanitization)"]
        GenDet["genderDetection.ts\n(Cultural Lexicon & Suffix Rules)"]
        GemSvc["geminiService.ts\n(REST API & AI Prompts)"]
        IDBSvc["indexedDb.ts\n(Native IndexedDB Store Manager)"]
        Supa["supabase.ts\n(Supabase Client & Health Checker)"]
        AuthSvc["authService.ts\n(Enterprise Auth & Password Reset)"]
    end

    App --> UI_Components
    App --> DBSvc
    App --> AuthSvc
    App --> Supa

    UI_Components --> DBSvc
    ImpV --> ImpEng
    ImpV --> GemSvc
    PossMatch --> GemSvc
    IncompV --> GemSvc
    CandProf --> Norm

    DBSvc --> IDBSvc
    DBSvc --> Supa
    DBSvc --> MatchEng
    DBSvc --> Norm
    DBSvc --> GenDet
    DBSvc --> GemSvc
    DBSvc --> ImpEng

    ImpEng --> Norm
    ImpEng --> MatchEng
    ImpEng --> GenDet
    ImpEng --> GemSvc

    MatchEng --> Norm
```

---

## 5. Core Workflow Sequence Diagrams

### 5.1 File Ingestion & Import Pipeline Sequence

```mermaid
sequenceDiagram
    autonumber
    participant U as Recruiter (User)
    participant IV as ImportView.tsx
    participant IE as importEngine.ts
    participant ME as matchingEngine.ts
    participant DB as dbService.ts
    participant IDB as indexedDB.ts
    participant SB as Supabase Cloud

    U->>IV: Drop File (e.g., AaraTech_Candidates.xlsx)
    IV->>IE: parseFileForPreview(file)
    IE-->>IV: Return headers, sampleRows, autoDetectMappings()
    U->>IV: Confirm / Adjust Mappings & Click "Start Import"
    IV->>IE: executeImport(file, mappings, candidatePool, progressCallback)
    
    loop For Every Row in Spreadsheet
        IE->>IE: Map raw cells to TargetColumns
        IE->>IE: Normalize Email & Phone (E.164)
        IE->>IE: Detect Gender (explicit, salutation, or lexicon)
        alt Lacks Name or Contact Details
            IE->>IE: Push to newIncompleteRecords[]
        else Has Name & Contact
            IE->>ME: evaluateDuplicateMatch(incoming, candidatePool)
            alt Decision == AUTO_MERGE
                IE->>IE: Update existing Person & append application/contacts
            else Decision == POSSIBLE_MATCH
                IE->>IE: Create new Person & generate PossibleMatch (PM-XXXXXX)
            else Decision == NEW_PERSON
                IE->>IE: Create new Person (P-XXXXXX)
            end
        end
    end

    IE-->>IV: Return ImportExecutionResult
    IV->>DB: saveImportBatch(result)
    DB->>IDB: putBatch('people'), putBatch('imports'), etc.
    IDB-->>DB: Local Persistence Acknowledged
    DB->>SB: parallelChunkUpsert(people, imports, contacts) in background
    IV-->>U: Display Import Success Summary Dialog
```

### 5.2 Duplicate Detection, Match Evaluation & Reversible Merge Sequence

```mermaid
sequenceDiagram
    autonumber
    participant R as Recruiter
    participant PMV as PossibleMatchesView.tsx
    participant DB as dbService.ts
    participant ME as matchingEngine.ts
    participant IDB as indexedDB.ts
    participant SB as Supabase Cloud

    R->>PMV: Open "Possible Matches" View
    PMV->>DB: getPossibleMatches()
    DB-->>PMV: Return list of PM-XXXXXX records
    R->>PMV: Review Pair: Candidate A (P-000101) vs Candidate B (P-000204)
    R->>PMV: Click "Merge Profiles" (Candidate B into Candidate A)
    PMV->>DB: mergeCandidates(targetId, sourceId, 'Admin Recruiter')
    
    critical Atomic Merge Operation
        DB->>DB: Resolve Canonical Person (transitive pointer check)
        DB->>DB: Create Full JSON Snapshot of Candidate B
        DB->>DB: Move Candidate B emails to Candidate A (person_emails)
        DB->>DB: Move Candidate B phones to Candidate A (person_phones)
        DB->>DB: Move Candidate B applications to Candidate A
        DB->>DB: Move Candidate B recruiter contacts to Candidate A
        DB->>DB: Set Candidate B status='Merged', merged_into_id=Candidate A ID
        DB->>DB: Record MergeHistory entity (can_unmerge=true, snapshot)
        DB->>DB: Log AuditLog entry (action='merge')
    end

    DB->>IDB: Update IndexedDB stores (people, mergeHistories, auditLogs)
    DB->>SB: Upsert modified entities to Supabase Cloud
    DB-->>PMV: Return true
    PMV-->>R: Display "Profiles Successfully Merged"

    opt If Recruiter Made a Mistake (Unmerge)
        R->>PMV: Open Merge Candidates View & Click "Unmerge"
        PMV->>DB: unmergeCandidates(mergeHistoryId)
        DB->>DB: Restore Candidate B from JSON snapshot
        DB->>DB: Re-assign moved child entities back to Candidate B
        DB->>DB: Reset Candidate B merged_into_id=null, current_status='New'
        DB->>IDB: Update IndexedDB
        DB->>SB: Sync restored profiles to Supabase
        DB-->>PMV: Return true (Unmerge successful)
    end
```

---

## 6. Error Handling, Logging, and Data Safeguards

### 6.1 Data Integrity Safeguards
- **Zero Hallucination Constraint:** Ingestion algorithms use strict regex boundaries. At no point does the application generate fictitious names, fabricate phone area codes, or alter historical recruiter feedback.
- **Transitive Pointer Traversal (`resolveCanonicalPerson`):** When candidate C is merged into B, and B is subsequently merged into A, the system follows pointers recursively to map C directly to A, eliminating dangling merge pointers or orphaned child records.
- **Offline Fault Tolerance:** If Supabase is unreachable (e.g., bad network, invalid credentials, or CORS failure), API queries catch errors and gracefully degrade to local IndexedDB operations without crashing the frontend.

### 6.2 Error Logging
- Errors encountered during spreadsheet processing are captured per-row in `ImportExecutionResult.errorRows` (`{ row: number, reason: string, rawData: Record<string, any> }`).
- Recruiter feedback notes are stored verbatim in `recruiter_contacts.original_feedback` and are never modified or truncated during system processing.
