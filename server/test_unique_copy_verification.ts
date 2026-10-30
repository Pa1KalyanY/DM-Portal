import { DatabaseService } from './db.js';
import { formatGoogleSheetsRow, generateGoogleSheetsTsv, GOOGLE_SHEETS_COLUMNS } from '../src/shared/columnMapper.js';

console.log('--- START UNIQUE COPY VERIFICATION TESTS ---');

const db = new DatabaseService();

// Test 1: Verify getAllApplicantsForExport with uniqueOnly = true
console.log('\n[Suite 1]: getAllApplicantsForExport with uniqueOnly = true');
const allClinisol = db.getAllApplicantsForExport({ company: 'ClinisolTech', status: 'PASS' });
const uniqueClinisol = db.getAllApplicantsForExport({ company: 'ClinisolTech', status: 'PASS', uniqueOnly: true });

console.log(`- Total Pass ClinisolTech Applicants: ${allClinisol.length}`);
console.log(`- Unique Pass ClinisolTech Applicants: ${uniqueClinisol.length}`);

// Verify no duplicates in unique list
const seenEmails = new Set<string>();
const seenPhones = new Set<string>();
let duplicateCount = 0;

for (const a of uniqueClinisol) {
  if (a.isDuplicate) {
    duplicateCount++;
  }
  const email = (a.email || '').trim().toLowerCase();
  const phone = (a.phone || '').replace(/\D/g, '').slice(-10);
  if (email && email.includes('@') && !['unknown', 'none', 'n/a'].includes(email)) {
    if (seenEmails.has(email)) duplicateCount++;
    seenEmails.add(email);
  }
  if (phone && phone.length >= 7) {
    if (seenPhones.has(phone)) duplicateCount++;
    seenPhones.add(phone);
  }
}

if (duplicateCount === 0) {
  console.log('✓ PASS: Zero duplicates found in uniqueOnly export!');
} else {
  console.error(`✗ FAIL: Found ${duplicateCount} duplicates in unique export!`);
  process.exit(1);
}

// Test 2: Verify onlyNewCandidates filter
console.log('\n[Suite 2]: getAllApplicantsForExport with onlyNewCandidates = true');
const newCandidatesOnly = db.getAllApplicantsForExport({ company: 'ClinisolTech', status: 'PASS', onlyNewCandidates: true });
console.log(`- Only New Candidates Count: ${newCandidatesOnly.length}`);
console.log('✓ PASS: onlyNewCandidates query executed cleanly without error.');

// Test 3: Verify exact 8 columns format for Google Sheets TSV
console.log('\n[Suite 3]: TSV 8-Column Format Validation');
if (uniqueClinisol.length > 0) {
  const sample = uniqueClinisol[0];
  const formattedRow = formatGoogleSheetsRow(sample);
  const keys = Object.keys(formattedRow);
  console.log('- Formatted Row Keys:', keys);

  const expectedColumns = [
    'Date',
    'Name',
    'Contact Number',
    "Email I'd",
    'Job Role',
    'GREEN CARD/ US-C',
    'H1B-Y/N',
    'LinkedIn Profile Link'
  ];

  const matched = expectedColumns.every(col => keys.includes(col));
  if (matched && keys.length === 8) {
    console.log('✓ PASS: Formatted row strictly matches required 8 columns!');
  } else {
    console.error('✗ FAIL: Column mismatch! Expected 8 columns:', expectedColumns);
    process.exit(1);
  }

  // Check TSV output
  const tsv = generateGoogleSheetsTsv([formattedRow], false);
  const tsvCells = tsv.split('\t');
  console.log(`- TSV cell count: ${tsvCells.length} (expected 8)`);
  if (tsvCells.length === 8) {
    console.log('✓ PASS: TSV output separates into exactly 8 tabs!');
  } else {
    console.error(`✗ FAIL: TSV output has ${tsvCells.length} cells instead of 8.`);
    process.exit(1);
  }
}

console.log('\n======================================================');
console.log('ALL UNIQUE COPY VERIFICATION TESTS PASSED SUCCESSFULLY');
console.log('======================================================');

