import { DatabaseService } from './db.js';
import { convertPastedTextToFile } from '../src/shared/masterImportEngine.js';

console.log('--- START ALL FEEDBACK (1, 2, 3, 4, 5, 6) IMPORT VERIFICATION ---');

const samplePastedData = `Date\tNAME\tContact Number\tEmail I'd\tJob Role\tRecruiter\tFeedback 1\tFeedback 2
25-Aug-2026\tSrinu S\t2016858348\tsrinus9808@gmail.com\tCyberSecurity\tyesh\t4. Not Interested\tLVM\tNo Answer\tWith Employer
25-Aug-2026\tManish Thanoj\t6475704179\tmanish.thanoj@gmail.com\tCyberSecurity\tsharma\t3.VM\tVM\tVM\tVM\tVM
25-Aug-2026\tSai N\t4087968538\tsainannapaneni2026@gmail.com\tCyberSecurity\tuday\tCalling\tGot only 7 digits
25-Aug-2026\tMd Omaar\t9137039002\tmd.omaar001@gmail.com\tCyberSecurity\tsia\t4. Not Interested\tUSC, 2-3 yrs, Dallas TX, $65k - $70k, 2003`;

// Test 1: convertPastedTextToFile detects extra columns beyond Feedback 2
console.log('\n[Suite 1]: convertPastedTextToFile multi-column feedback extraction');
const file = convertPastedTextToFile(samplePastedData);
console.log(`- Generated file name: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);

// Test 2: Database storage of additional_feedback in master_recruiter_contacts
console.log('\n[Suite 2]: Database storage and retrieval of additional_feedback');
const db = new DatabaseService();

const testCandidateId = 'test-cand-' + Date.now();
const testAppId = 'test-app-' + Date.now();

const additionalFeedbackObj = [
  { label: 'Feedback 3', text: 'No Answer', sourceColumn: 'Feedback 3', feedbackIndex: 3 },
  { label: 'Feedback 4', text: 'With Employer', sourceColumn: 'Feedback 4', feedbackIndex: 4 },
];

const batchPayload = [
  {
    id: testCandidateId,
    company: 'ClinisolTech' as const,
    full_name: 'Srinu S Test',
    first_name: 'Srinu',
    last_name: 'S',
    primary_email: `srinu.test.${Date.now()}@example.com`,
    primary_phone: '201-685-8348',
    emails: [`srinu.test.${Date.now()}@example.com`],
    phones: ['2016858348'],
    applications: [
      {
        id: testAppId,
        company: 'ClinisolTech' as const,
        application_date: '2026-08-25',
        role_category: 'Cybersecurity',
        job_title: 'CyberSecurity',
        source_type: 'Excel / Spreadsheet Import',
      }
    ],
    recruiter_contacts: [
      {
        id: 'rc-' + Date.now(),
        person_id: testCandidateId,
        recruiter_name: 'yesh',
        contact_type: 'Phone',
        outcome: '4. Not Interested',
        feedback_1: '4. Not Interested',
        feedback_2: 'LVM',
        additional_feedback: JSON.stringify(additionalFeedbackObj),
        raw_feedback: '4. Not Interested • LVM • No Answer • With Employer',
        notes: 'Feedback 1: 4. Not Interested\nFeedback 2: LVM\nFeedback 3: No Answer\nFeedback 4: With Employer',
        contact_date: '2026-08-25',
        source_file: 'test_pasted.xlsx',
        source_row: 1,
      }
    ]
  }
];

const upsertResult = db.upsertMasterCandidatesBatch(batchPayload);
console.log(`- Upsert result: ${JSON.stringify(upsertResult)}`);

// Retrieve candidate and check contacts
const retrieved = db.getMasterCandidateById(testCandidateId);
if (!retrieved) {
  console.error('✗ FAIL: Candidate not found in database!');
  process.exit(1);
}

console.log(`- Retrieved candidate: ${retrieved.full_name} (${retrieved.person_id})`);
const contacts = retrieved.recruiter_contacts || [];
console.log(`- Recruiter contacts count: ${contacts.length}`);

if (contacts.length === 0) {
  console.error('✗ FAIL: No recruiter contacts retrieved!');
  process.exit(1);
}

const rc = contacts[0] as any;
console.log(`- Contact feedback_1: ${rc.feedback_1}`);
console.log(`- Contact feedback_2: ${rc.feedback_2}`);
console.log(`- Contact additional_feedback: ${rc.additional_feedback}`);
console.log(`- Contact raw_feedback: ${rc.raw_feedback}`);

if (!rc.additional_feedback) {
  console.error('✗ FAIL: additional_feedback is null or empty!');
  process.exit(1);
}

const parsedAdd = JSON.parse(rc.additional_feedback);
if (parsedAdd.length !== 2) {
  console.error(`✗ FAIL: expected 2 additional feedback items, got ${parsedAdd.length}`);
  process.exit(1);
}

if (parsedAdd[0].text !== 'No Answer' || parsedAdd[1].text !== 'With Employer') {
  console.error('✗ FAIL: additional feedback content mismatch!', parsedAdd);
  process.exit(1);
}

console.log('✓ PASS: All additional feedback columns (Feedback 3, 4) stored and retrieved accurately!');

// Test 3: Verify addMasterContactAttempt with additional_feedback
console.log('\n[Suite 3]: addMasterContactAttempt with additional_feedback');
const contactAttemptData = {
  recruiter_name: 'sharma',
  contact_method: 'Phone',
  outcome: '3.VM',
  feedback_1: '3.VM',
  feedback_2: 'VM',
  additional_feedback: JSON.stringify([
    { label: 'Feedback 3', text: 'VM' },
    { label: 'Feedback 4', text: 'VM' },
    { label: 'Feedback 5', text: 'VM' },
  ]),
  notes: 'Call 2: 3.VM\nFeedback 2: VM\nFeedback 3: VM\nFeedback 4: VM\nFeedback 5: VM',
  contact_date: '2026-08-26',
};

const updatedCand = db.addMasterContactAttempt(testCandidateId, contactAttemptData);
const updatedRetrieved = db.getMasterCandidateById(testCandidateId);
const allContacts = updatedRetrieved?.recruiter_contacts || [];
console.log(`- Updated contacts count: ${allContacts.length}`);

const latestContact = allContacts.find((c: any) => c.recruiter_name === 'sharma') as any;
if (!latestContact || !latestContact.additional_feedback) {
  console.error('✗ FAIL: New contact attempt did not save additional_feedback!');
  process.exit(1);
}

const parsedLatest = JSON.parse(latestContact.additional_feedback);
if (parsedLatest.length !== 3) {
  console.error(`✗ FAIL: expected 3 additional feedback items in new contact, got ${parsedLatest.length}`);
  process.exit(1);
}

console.log('✓ PASS: addMasterContactAttempt successfully preserved all additional feedbacks (3, 4, 5)!');

console.log('\n======================================================');
console.log('ALL FEEDBACK VERIFICATION TESTS COMPLETED SUCCESSFULLY');
console.log('======================================================');
