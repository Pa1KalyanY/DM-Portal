import fs from 'node:fs';
import path from 'node:path';
import { DatabaseService } from './db.js';

console.log('--- START COMPANY ISOLATED CLEAR VERIFICATION TESTS ---');

const TEST_DB_PATH = path.resolve(process.cwd(), 'server', 'test_isolated_clear.db');
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

// Pass custom DB path so production DB is NEVER touched during testing
const db = new DatabaseService(TEST_DB_PATH);

// 1. Seed AaraTech candidate
const aaraCandId = 'test-aara-' + Date.now();
const aaraAppId = 'test-aara-app-' + Date.now();

const aaraPayload = [
  {
    id: aaraCandId,
    company: 'AaraTech' as const,
    full_name: 'AaraTech Candidate Alpha',
    first_name: 'AaraTech',
    last_name: 'Candidate Alpha',
    primary_email: `aara.${Date.now()}@aaratech.com`,
    primary_phone: '555-100-2001',
    applications: [
      {
        id: aaraAppId,
        company: 'AaraTech' as const,
        application_date: '2026-10-31',
        job_title: 'Full Stack Engineer',
        role_category: 'Full Stack',
      }
    ],
    recruiter_contacts: [
      {
        id: 'rc-aara-' + Date.now(),
        person_id: aaraCandId,
        recruiter_name: 'Sarah Jenkins',
        contact_type: 'Phone',
        outcome: 'Connected',
        feedback_1: 'Calling',
        feedback_2: 'Interested in AaraTech',
        contact_date: '2026-10-31',
      }
    ]
  }
];

// 2. Seed ClinisolTech candidate
const cliniCandId = 'test-clini-' + Date.now();
const cliniAppId = 'test-clini-app-' + Date.now();

const cliniPayload = [
  {
    id: cliniCandId,
    company: 'ClinisolTech' as const,
    full_name: 'ClinisolTech Candidate Beta',
    first_name: 'ClinisolTech',
    last_name: 'Candidate Beta',
    primary_email: `clini.${Date.now()}@clinisoltech.com`,
    primary_phone: '555-200-3002',
    applications: [
      {
        id: cliniAppId,
        company: 'ClinisolTech' as const,
        application_date: '2026-10-31',
        job_title: 'Clinical Data Manager',
        role_category: 'Clinical',
      }
    ],
    recruiter_contacts: [
      {
        id: 'rc-clini-' + Date.now(),
        person_id: cliniCandId,
        recruiter_name: 'David Chen',
        contact_type: 'Phone',
        outcome: 'Connected',
        feedback_1: 'Calling',
        feedback_2: 'Interested in ClinisolTech',
        contact_date: '2026-10-31',
      }
    ]
  }
];

const r1 = db.upsertMasterCandidatesBatch(aaraPayload);
const r2 = db.upsertMasterCandidatesBatch(cliniPayload);

const aaraBefore = db.getMasterCandidateById(r1.peopleIds![0]);
const cliniBefore = db.getMasterCandidateById(r2.peopleIds![0]);

if (!aaraBefore || !cliniBefore) {
  console.error('✗ FAIL: Seeded candidates not created!');
  process.exit(1);
}

console.log(`- Seeded AaraTech: ${aaraBefore.full_name} (${aaraBefore.id}), Company: ${aaraBefore.company}`);
console.log(`- Seeded ClinisolTech: ${cliniBefore.full_name} (${cliniBefore.id}), Company: ${cliniBefore.company}`);

// 3. Clear ONLY AaraTech
console.log('\n[Suite 1]: Executing clearAllMasterData("AaraTech")...');
db.clearAllMasterData('AaraTech');

// Verify AaraTech is deleted
const aaraAfter = db.getMasterCandidateById(r1.peopleIds![0]);
if (aaraAfter) {
  console.error('✗ FAIL: AaraTech candidate was NOT cleared!');
  process.exit(1);
}
console.log('✓ PASS: AaraTech candidate successfully wiped from database.');

// Verify ClinisolTech is 100% PRESERVED
const cliniAfter = db.getMasterCandidateById(r2.peopleIds![0]);
if (!cliniAfter) {
  console.error('✗ FAIL CRITICAL: ClinisolTech candidate was wiped when clearing AaraTech!');
  process.exit(1);
}

if (!cliniAfter.applications || cliniAfter.applications.length === 0) {
  console.error('✗ FAIL: ClinisolTech applications were lost!');
  process.exit(1);
}

if (!cliniAfter.recruiter_contacts || cliniAfter.recruiter_contacts.length === 0) {
  console.error('✗ FAIL: ClinisolTech recruiter contacts were lost!');
  process.exit(1);
}

console.log('✓ PASS: ClinisolTech candidate, applications, and recruiter feedback 100% preserved!');
console.log(`  - Preserved Full Name: ${cliniAfter.full_name}`);
console.log(`  - Preserved Applications: ${cliniAfter.applications.length}`);
console.log(`  - Preserved Recruiter Contacts: ${cliniAfter.recruiter_contacts.length}`);

// 4. Now clear ClinisolTech
console.log('\n[Suite 2]: Executing clearAllMasterData("ClinisolTech")...');
db.clearAllMasterData('ClinisolTech');

const cliniFinal = db.getMasterCandidateById(r2.peopleIds![0]);
if (cliniFinal) {
  console.error('✗ FAIL: ClinisolTech candidate was NOT cleared when requested!');
  process.exit(1);
}
console.log('✓ PASS: ClinisolTech candidate successfully wiped when requested.');

console.log('\n================================================================');
console.log('ALL COMPANY-ISOLATED CLEAR VERIFICATION TESTS PASSED (100%)');
console.log('================================================================');

try {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
} catch (e) {
  // ignore
}
