# 10. Deployment, Environment & Operations Guide

**Document**: Runtime Requirements, Configuration & Operational Procedures  
**Audit Target**: `linkedin-application-filter`  
**Execution Environment**: Windows / Linux / macOS  
**Node.js Engine**: `>= v22.0.0` (Requires Node.js 22+ for native `DatabaseSync` support)  
**Audit Date**: October 2026

---

## 1. Runtime Requirements & Prerequisites

1. **Node.js**: `v22.14.0` or higher (Mandatory: Node.js 22 is required for `node:sqlite` `DatabaseSync`).
2. **Package Manager**: `npm` (v10+).
3. **Operating System**: Platform independent (Tested on Windows 11; compatible with Linux and macOS).
4. **External Services**: None required for core screening and matching. Internet connection required only if optional Google Gemini AI classification is enabled.

---

## 2. Environment Variables Specification

The system reads environment configuration from `.env` in the project root:

| Variable Name | Required | Default Value | Purpose | Sensitive? |
| :--- | :--- | :--- | :--- | :--- |
| `PORT` | Optional | `3001` | TCP port on which the Express REST API server listens | No |
| `NODE_ENV` | Optional | `development` | Node execution environment (`development`, `production`) | No |
| `GEMINI_API_KEY` | Optional | None | Google AI Studio API key used for supplementary candidate origin/gender classification | **YES (Secret)** |
| `MAX_FILES_UPLOAD`| Optional | `50` | Maximum number of concurrent files accepted by Multer | No |
| `MAX_FILE_SIZE_MB`| Optional | `50` | Maximum allowed individual spreadsheet file size (in MB) | No |
| `SUPABASE_URL` | Optional | None | Cloud Supabase URL (Reserved for future cloud migration) | No |
| `SUPABASE_ANON_KEY`| Optional | None | Cloud Supabase public anonymous key | **YES (Secret)** |

*All sensitive keys in this documentation have been redacted in compliance with security guidelines.*

---

## 3. Startup & Execution Commands

### 3.1 Local Development Mode
To start both the Express API server and the Vite React frontend concurrently:
```bash
npm run dev
```
This executes:
```bash
concurrently -n "API,VITE" -c "blue,green" "npm run server" "npm run client"
```
- **Backend API**: Starts on `http://localhost:3001` with file watching (`tsx watch server/index.ts`).
- **Frontend App**: Starts on `http://localhost:5173` with Vite HMR (`vite`).

### 3.2 Individual Service Startup
- **Run Backend API Only**:
  ```bash
  npm run server
  ```
- **Run Frontend Client Only**:
  ```bash
  npm run client
  ```

### 3.3 Production Build & Validation
- **Compile & Bundle**:
  ```bash
  npm run build
  ```
  *(Runs `tsc -b` followed by `vite build`, generating optimized static production assets in `/dist`).*
- **Preview Production Build**:
  ```bash
  npm run preview
  ```

---

## 4. Database Lifecycle & Migrations

### 4.1 Initialization
The database file `linkedin_screening.db` is automatically created on first boot if it does not exist. The initialization sequence in [server/db.ts:27](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts#L27) executes:
1. `CREATE TABLE IF NOT EXISTS` for all 6 core tables.
2. `CREATE INDEX IF NOT EXISTS` for all 10 query performance indexes.
3. Inserts default screening rules (`rule-gc-1`, `rule-sp-2`, `rule-wa-3`, `rule-sa-4`) if absent.

### 4.2 Migration Model
The application does not use a formal migration framework like Prisma or Knex. Instead, it utilizes **idempotent procedural migrations** inside `initTables()` wrapped in `try-catch` blocks:
- Safely attempts `ALTER TABLE applicants ADD COLUMN ...` for new columns (`gender`, `origin_region`, `name_match_category`, etc.).
- Safely sanitizes phone numbers on existing rows.
- Safely populates `batch_name` on historical imports.

---

## 5. Storage & Backup Operations

### 5.1 Critical Persistent Files
The entire system state consists of exactly two local filesystem directories/files:
1. `linkedin_screening.db`: SQLite database file containing all candidates, imports, and audit logs.
2. `uploads/`: Directory containing uploaded source spreadsheet files (.xlsx, .csv).

### 5.2 Backup Procedure
To take a complete snapshot of the system, simply copy `linkedin_screening.db`:
```bash
# Windows PowerShell Backup
Copy-Item linkedin_screening.db "linkedin_screening_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').db"

# Linux / macOS Backup
cp linkedin_screening.db "linkedin_screening_backup_$(date +%Y%m%d_%H%M%S).db"
```

### 5.3 Restore Procedure
Stop the server process, replace `linkedin_screening.db` with the backup copy, and restart the server.

---

## 6. Known Operational Risks

1. **File Locks on Windows**: Because `DatabaseSync` keeps `linkedin_screening.db` open during server execution, attempting to delete or overwrite the database file while `npm run dev` is running will fail with an `EBUSY` file lock error. The server process must be stopped first.
2. **Ephemeral Disk Risk**: If deployed to containerized serverless environments (e.g. AWS Lambda, Vercel, Heroku) without persistent block storage, local SQLite data in `linkedin_screening.db` and files in `uploads/` will be wiped on container restart. For cloud hosting, a persistent volume mount or PostgreSQL adapter is required.
3. **No Automatic Backups**: There is no scheduled cron job backing up the SQLite database file. Recruiters should periodically export data to XLSX or back up the database file manually.
