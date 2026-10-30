import { dbService } from './server/db.js';

console.log('=== BEFORE DEDUPLICATION & RE-EVALUATION ===');
const statsBefore = dbService.getDashboardStats();
console.log('Stats before:', { total: statsBefore.totalApplicants, passed: statsBefore.passedCount, failed: statsBefore.failedCount, review: statsBefore.manualReviewCount });

console.log('\nRunning deduplicateApplicants("ALL")...');
const dedupResult = dbService.deduplicateApplicants('ALL');
console.log('Dedup result:', dedupResult);

console.log('\nRunning reevaluateAllApplicants()...');
const reevalResult = dbService.reevaluateAllApplicants();
console.log('Re-evaluation result:', reevalResult);

const statsAfter = dbService.getDashboardStats();
console.log('\nStats after:', { total: statsAfter.totalApplicants, passed: statsAfter.passedCount, failed: statsAfter.failedCount, review: statsAfter.manualReviewCount });

const namesToCheck = [
  'Ronnie Roy',
  'George C. Ekwem Jr',
  'Uduak Enam',
  'Omar Adnan',
  'Arrey Alexander',
  'Alexander S.',
  'Alexander Munteanu',
  'Olan Hassan',
  'Ahmed Adebayo',
  'Thomas Chiang'
];

console.log('\n=== STATUS OF 10 TARGET NAMES AFTER RE-SCREENING ===');
const { DatabaseSync } = await import('node:sqlite');
const db = new DatabaseSync('linkedin_screening.db');

for (const n of namesToCheck) {
  const parts = n.split(' ');
  const first = parts[0];
  const last = parts[parts.length - 1];
  const rows = db.prepare("SELECT id, full_name, email, phone, effective_result, origin_country, origin_match_reason, screening_reasons FROM applicants WHERE full_name LIKE ?").all(`%${first}%${last}%`);
  if (rows && rows.length > 0) {
    for (const row of rows) {
      console.log(`\nName: [${row.full_name}] | Email: [${row.email}]`);
      console.log(`  -> Effective Result: ${row.effective_result}`);
      console.log(`  -> Origin Country: ${row.origin_country}`);
      console.log(`  -> Origin Reason: ${row.origin_match_reason}`);
      console.log(`  -> Screening Reasons: ${row.screening_reasons}`);
    }
  } else {
    console.log(`\nNot found for: ${n}`);
  }
}


console.log('\n--- Status of 10 target names in DB ---');
for (const n of namesToCheck) {
  const row = db.prepare("SELECT id, full_name, email, phone, effective_result, origin_country, origin_match_reason, screening_reasons FROM applicants WHERE full_name LIKE ?").get(`%${n.split(' ')[0]}%${n.split(' ').slice(-1)[0]}%`);
  if (row) {
    console.log(`Found: [${row.full_name}] -> Effective: ${row.effective_result}, Origin: ${row.origin_country}, Reason: ${row.origin_match_reason}`);
  } else {
    console.log(`Not found for: ${n}`);
  }
}
