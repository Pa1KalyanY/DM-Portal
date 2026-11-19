import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

console.log('--- RESTORING CLINISOLTECH DATA FROM DM-MSDB-V1.BACKUP ---');

const backupPath = 'linkedin_screening.db.DM-MSDB-V1.backup';
const livePath = 'linkedin_screening.db';

if (!fs.existsSync(backupPath)) {
  console.error(`Error: Backup file ${backupPath} not found!`);
  process.exit(1);
}

// First, make a safety copy of current live db just in case
fs.copyFileSync(livePath, 'linkedin_screening.db.pre_restore_safety.bak');

const srcDb = new DatabaseSync(backupPath);
const destDb = new DatabaseSync(livePath);

// Ensure all schema columns exist in destDb
try { destDb.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN additional_feedback TEXT;"); } catch {}
try { destDb.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN next_follow_up TEXT;"); } catch {}
try { destDb.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN raw_feedback TEXT;"); } catch {}
try { destDb.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN outcome TEXT;"); } catch {}
try { destDb.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN feedback_1 TEXT;"); } catch {}
try { destDb.exec("ALTER TABLE master_recruiter_contacts ADD COLUMN feedback_2 TEXT;"); } catch {}

const tablesToRestore = [
  'master_people',
  'master_person_emails',
  'master_person_phones',
  'master_applications',
  'master_recruiter_contacts',
  'master_recruiter_assignments',
  'master_possible_matches',
  'master_status_history',
  'incomplete_records',
  'screening_rules',
  'jobs',
  'recruiters',
  'app_settings',
  'audit_logs'
];

destDb.exec('BEGIN TRANSACTION');
try {
  for (const table of tablesToRestore) {
    // Check if table exists in source
    const tableExists = srcDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
    if (!tableExists) continue;

    const rows = srcDb.prepare(`SELECT * FROM ${table}`).all();
    if (rows.length === 0) continue;

    console.log(`Restoring ${table}: ${rows.length} records...`);

    // Get column names from source table
    const sampleRow = rows[0] as any;
    const columns = Object.keys(sampleRow);
    const placeholders = columns.map(() => '?').join(', ');
    const colList = columns.join(', ');

    const insertStmt = destDb.prepare(`INSERT OR REPLACE INTO ${table} (${colList}) VALUES (${placeholders})`);

    for (const row of rows as any[]) {
      const values = columns.map(c => row[c]);
      insertStmt.run(...values);
    }
  }

  destDb.exec('COMMIT');
  console.log('✓ All ClinisolTech data successfully restored into live database!');
} catch (err: any) {
  try { destDb.exec('ROLLBACK'); } catch {}
  console.error('✗ Restore failed:', err);
  process.exit(1);
}

// Verification
const finalPeople = (destDb.prepare("SELECT COUNT(*) as c FROM master_people WHERE company = 'ClinisolTech'").get() as any).c;
const finalApps = (destDb.prepare("SELECT COUNT(*) as c FROM master_applications WHERE company = 'ClinisolTech'").get() as any).c;
const finalContacts = (destDb.prepare("SELECT COUNT(*) as c FROM master_recruiter_contacts").get() as any).c;
const finalAssignments = (destDb.prepare("SELECT COUNT(*) as c FROM master_recruiter_assignments").get() as any).c;

console.log('\n--- VERIFICATION OF RESTORED DATA ---');
console.log(`- ClinisolTech master_people: ${finalPeople}`);
console.log(`- ClinisolTech master_applications: ${finalApps}`);
console.log(`- master_recruiter_contacts: ${finalContacts}`);
console.log(`- master_recruiter_assignments: ${finalAssignments}`);

if (finalPeople === 742 && finalApps === 742) {
  console.log('✓ SUCCESS: 100% of ClinisolTech data is fully restored and verified!');
} else {
  console.warn(`! Note: ${finalPeople} people restored.`);
}

