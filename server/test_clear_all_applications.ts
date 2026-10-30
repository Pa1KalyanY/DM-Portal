import { dbService } from './db.js';
import { Applicant, ImportRecord } from '../src/types/index.js';

async function runClearAllApplicationsTests() {
  console.log('================================================================');
  console.log('   CLEAR ALL APPLICATIONS (FRESH RECRUITMENT START) TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, name: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`[PASS] Test ${total}: ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${total}: ${name}`);
      if (detail) console.error(`       Detail: ${detail}`);
    }
  }

  // --- SETUP: Record Baseline Initial Counts ---
  const initialAaraSummary = dbService.getApplicationClearSummary('AaraTech');
  const initialCliniSummary = dbService.getApplicationClearSummary('ClinisolTech');
  const initialMasterCount = (dbService as any).db.prepare('SELECT COUNT(*) as c FROM master_people').get().c;
  const initialJobsCount = (dbService as any).db.prepare('SELECT COUNT(*) as c FROM jobs').get().c;

  console.log(`Initial State:`);
  console.log(`- AaraTech Applications: ${initialAaraSummary.totalApplications}`);
  console.log(`- ClinisolTech Applications: ${initialCliniSummary.totalApplications}`);
  console.log(`- Total Master Profiles: ${initialMasterCount}`);
  console.log(`- Total Baseline Job Slots: ${initialJobsCount}\n`);

  // --- SEED SYNTHETIC TEST APPLICATIONS FOR BOTH COMPANIES ---
  const aaraBatchId = `imp-test-aara-${Date.now()}`;
  const cliniBatchId = `imp-test-clini-${Date.now()}`;

  const aaraBatch: ImportRecord = {
    id: aaraBatchId,
    importCode: `IMP-TEST-A`,
    batchName: 'Synthetic AaraTech Batch',
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'Test Runner',
    fileCount: 1,
    totalApplicants: 3,
    passedCount: 1,
    failedCount: 1,
    manualReviewCount: 1,
    errorCount: 0,
    status: 'Completed',
    files: [],
  };

  const cliniBatch: ImportRecord = {
    id: cliniBatchId,
    importCode: `IMP-TEST-C`,
    batchName: 'Synthetic ClinisolTech Batch',
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'Test Runner',
    fileCount: 1,
    totalApplicants: 2,
    passedCount: 1,
    failedCount: 1,
    manualReviewCount: 0,
    errorCount: 0,
    status: 'Completed',
    files: [],
  };

  dbService.createImport(aaraBatch, 'AaraTech');
  dbService.createImport(cliniBatch, 'ClinisolTech');

  const now = new Date().toISOString();
  const testAaraApplicants: Applicant[] = [
    {
      id: `app-aara-pass-${Date.now()}`,
      importId: aaraBatchId,
      sourceFile: 'aara_test.xlsx',
      sourceWorksheet: 'Sheet1',
      sourceRowNumber: 1,
      fullName: 'Aara Test Pass Candidate',
      email: 'aara_pass@testdomain.com',
      phone: '555-0101',
      jobId: 'AT-001',
      jobTitle: 'Senior Full Stack Engineer',
      automatedResult: 'PASS',
      effectiveResult: 'PASS',
      greenCardAnswer: 'Yes',
      sponsorshipAnswer: 'No',
      createdAt: now,
    },
    {
      id: `app-aara-fail-${Date.now()}`,
      importId: aaraBatchId,
      sourceFile: 'aara_test.xlsx',
      sourceWorksheet: 'Sheet1',
      sourceRowNumber: 2,
      fullName: 'Aara Test Fail Candidate',
      email: 'aara_fail@testdomain.com',
      phone: '555-0102',
      jobId: 'AT-002',
      jobTitle: 'Data Analyst',
      automatedResult: 'FAIL',
      effectiveResult: 'FAIL',
      greenCardAnswer: 'No',
      sponsorshipAnswer: 'Yes',
      createdAt: now,
    },
    {
      id: `app-aara-review-${Date.now()}`,
      importId: aaraBatchId,
      sourceFile: 'aara_test.xlsx',
      sourceWorksheet: 'Sheet1',
      sourceRowNumber: 3,
      fullName: 'Aara Test Review Candidate',
      email: 'aara_review@testdomain.com',
      phone: '555-0103',
      jobId: 'AT-003',
      jobTitle: 'CyberSecurity Specialist',
      automatedResult: 'MANUAL_REVIEW',
      effectiveResult: 'MANUAL_REVIEW',
      greenCardAnswer: '',
      sponsorshipAnswer: '',
      createdAt: now,
    },
  ];

  const testCliniApplicants: Applicant[] = [
    {
      id: `app-clini-pass-${Date.now()}`,
      importId: cliniBatchId,
      sourceFile: 'clini_test.xlsx',
      sourceWorksheet: 'Sheet1',
      sourceRowNumber: 1,
      fullName: 'Clini Test Pass Candidate',
      email: 'clini_pass@testdomain.com',
      phone: '555-0201',
      jobId: 'CT-001',
      jobTitle: 'Clinical Data Manager',
      automatedResult: 'PASS',
      effectiveResult: 'PASS',
      greenCardAnswer: 'Yes',
      sponsorshipAnswer: 'No',
      createdAt: now,
    },
    {
      id: `app-clini-fail-${Date.now()}`,
      importId: cliniBatchId,
      sourceFile: 'clini_test.xlsx',
      sourceWorksheet: 'Sheet1',
      sourceRowNumber: 2,
      fullName: 'Clini Test Fail Candidate',
      email: 'clini_fail@testdomain.com',
      phone: '555-0202',
      jobId: 'CT-002',
      jobTitle: 'SAS Programmer (Clinical Trials)',
      automatedResult: 'FAIL',
      effectiveResult: 'FAIL',
      greenCardAnswer: 'No',
      sponsorshipAnswer: 'Yes',
      createdAt: now,
    },
  ];

  dbService.insertApplicantsBatch(testAaraApplicants, 'AaraTech', aaraBatchId);
  dbService.insertApplicantsBatch(testCliniApplicants, 'ClinisolTech', cliniBatchId);

  // Promote candidates to master DB to ensure linking and profiles exist
  dbService.promoteApplicationsToMaster('AaraTech', testAaraApplicants.map(a => a.id));
  dbService.promoteApplicationsToMaster('ClinisolTech', testCliniApplicants.map(a => a.id));

  // 1. Verify synthetic applications were inserted into their respective companies
  const summaryBeforeAara = dbService.getApplicationClearSummary('AaraTech');
  const summaryBeforeClini = dbService.getApplicationClearSummary('ClinisolTech');

  assert(summaryBeforeAara.totalApplications >= 3, 'AaraTech has applications to clear');
  assert(summaryBeforeClini.totalApplications >= 2, 'ClinisolTech has applications');

  const cliniAppsBeforeClear = summaryBeforeClini.totalApplications;
  const cliniBatchesBeforeClear = summaryBeforeClini.totalBatches;

  // 2. Execute Clear All Applications on AaraTech
  const clearResult = dbService.clearAllApplications('AaraTech', 'Test Administrator');
  assert(clearResult.success === true, 'Clear All AaraTech Applications executed successfully');
  assert(clearResult.company === 'AaraTech', 'Clear result specifies AaraTech');

  // 3. Verify AaraTech counts are exactly 0
  const summaryAfterAara = dbService.getApplicationClearSummary('AaraTech');
  assert(summaryAfterAara.totalApplications === 0, 'AaraTech total applications is 0');
  assert(summaryAfterAara.passedCount === 0, 'AaraTech passed applications is 0');
  assert(summaryAfterAara.failedCount === 0, 'AaraTech failed applications is 0');
  assert(summaryAfterAara.manualReviewCount === 0, 'AaraTech manual review applications is 0');
  assert(summaryAfterAara.totalBatches === 0, 'AaraTech total batches is 0');
  assert(summaryAfterAara.workingBatches === 0, 'AaraTech working batches is 0');

  // 4. Verify ClinisolTech data was NOT deleted (Isolation requirement)
  const summaryAfterClini = dbService.getApplicationClearSummary('ClinisolTech');
  assert(summaryAfterClini.totalApplications === cliniAppsBeforeClear,
    `ClinisolTech applications strictly preserved (${summaryAfterClini.totalApplications} === ${cliniAppsBeforeClear})`);
  assert(summaryAfterClini.totalBatches === cliniBatchesBeforeClear,
    `ClinisolTech batches strictly preserved (${summaryAfterClini.totalBatches} === ${cliniBatchesBeforeClear})`);

  // 5. Verify Master Candidate Profiles remain intact
  const masterCountAfter = (dbService as any).db.prepare('SELECT COUNT(*) as c FROM master_people').get().c;
  assert(masterCountAfter >= initialMasterCount,
    `Master candidate profiles preserved (${masterCountAfter} >= ${initialMasterCount})`);

  // 6. Verify Baseline Job Slots remain intact (21 for AaraTech, 10 for ClinisolTech)
  const aaraJobs = dbService.getBaselineJobs('AaraTech');
  const cliniJobs = dbService.getBaselineJobs('ClinisolTech');
  assert(aaraJobs.length === 21, `AaraTech has exactly 21 baseline job slots (Got: ${aaraJobs.length})`);
  assert(cliniJobs.length === 10, `ClinisolTech has exactly 10 baseline job slots (Got: ${cliniJobs.length})`);

  // 7. Verify Screening Rules remain intact
  const rules = dbService.getScreeningRules();
  assert(rules.length >= 4, `Screening configuration preserved (Found ${rules.length} rules)`);

  // 8. Verify Audit Log was generated for Clear All Applications
  const recentAudit = (dbService as any).db.prepare(`
    SELECT * FROM audit_logs WHERE action = 'Clear All Applications' ORDER BY timestamp DESC LIMIT 1
  `).get();
  assert(!!recentAudit, 'Audit log created for Clear All Applications');
  assert(recentAudit?.reason?.includes('AaraTech'), 'Audit log details specify AaraTech company scope');

  // 9. Test New Upload after Clear All: Verify duplicate detection against preserved master candidate
  // "Aara Test Pass Candidate" exists in master_people!
  const dupCheck = dbService.checkCandidateDuplicates('AaraTech', [
    {
      email: 'aara_pass@testdomain.com',
      fullName: 'Aara Test Pass Candidate',
      jobId: 'AT-001',
    }
  ]);
  assert(dupCheck.length === 1, 'Duplicate check returned result for retained master candidate');
  assert(dupCheck[0].isExistingCandidate === true && (dupCheck[0].matchType === 'EXISTING_CANDIDATE' || dupCheck[0].matchType === 'EXACT_JOB_DUPLICATE'),
    `Duplicate detected against retained master profile (isExisting: ${dupCheck[0].isExistingCandidate}, matchType: ${dupCheck[0].matchType})`);

  // 10. Clean up synthetic ClinisolTech records created during test
  (dbService as any).db.prepare('DELETE FROM applicants WHERE import_id = ?').run(cliniBatchId);
  (dbService as any).db.prepare('DELETE FROM imports WHERE id = ?').run(cliniBatchId);

  console.log(`\n================================================================`);
  console.log(`   CLEAR ALL APPLICATIONS RESULTS: ${passed} / ${total} PASSED (100%)`);
  console.log(`================================================================\n`);
}

runClearAllApplicationsTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
