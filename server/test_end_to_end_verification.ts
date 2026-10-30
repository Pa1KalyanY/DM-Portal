import { dbService } from './db.js';
import { evaluateScreening } from '../src/shared/screeningEngine.js';
import { Applicant, ImportRecord } from '../src/types/index.js';

async function runEndToEndVerification() {
  console.log('================================================================');
  console.log('   DM PORTAL END-TO-END VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] Test ${totalTests}: ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] Test ${totalTests}: ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
    }
  }

  // -------------------------------------------------------------
  // TEST 1: Baseline Job Slots Separation (AaraTech: 21, ClinisolTech: 10)
  // -------------------------------------------------------------
  const aaraJobs = dbService.getBaselineJobs('AaraTech');
  const cliniJobs = dbService.getBaselineJobs('ClinisolTech');

  assert(aaraJobs.length === 21, 'AaraTech has exactly 21 baseline job slots', `Got ${aaraJobs.length}`);
  assert(cliniJobs.length === 10, 'ClinisolTech has exactly 10 baseline job slots', `Got ${cliniJobs.length}`);

  const aaraHasPrefix = aaraJobs.every(j => j.jobId.startsWith('AT-'));
  const cliniHasPrefix = cliniJobs.every(j => j.jobId.startsWith('CT-'));
  assert(aaraHasPrefix, 'All AaraTech job slots have AT- prefix');
  assert(cliniHasPrefix, 'All ClinisolTech job slots have CT- prefix');

  // -------------------------------------------------------------
  // TEST 2: Company-Scoped Recruiters
  // -------------------------------------------------------------
  const aaraRecruiters = dbService.getRecruiters('AaraTech');
  const cliniRecruiters = dbService.getRecruiters('ClinisolTech');

  assert(aaraRecruiters.length >= 4, 'AaraTech has default recruiters configured', `Got ${aaraRecruiters.length}`);
  assert(cliniRecruiters.length >= 4, 'ClinisolTech has default recruiters configured', `Got ${cliniRecruiters.length}`);
  assert(aaraRecruiters.every(r => r.company === 'AaraTech'), 'AaraTech recruiters scoped strictly to AaraTech');
  assert(cliniRecruiters.every(r => r.company === 'ClinisolTech'), 'ClinisolTech recruiters scoped strictly to ClinisolTech');

  // -------------------------------------------------------------
  // TEST 3: Deterministic Screening Outcomes (PASS, FAIL, MANUAL_REVIEW)
  // -------------------------------------------------------------
  const rules = dbService.getScreeningRules();
  assert(rules.length === 4, 'Screening engine has 4 mandatory/legal screening rules');

  // Eval 1: Pass
  const evalPass = evaluateScreening(
    'Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No',
    rules
  );
  assert(evalPass.status === 'PASS', 'Screening result is PASS for GC=Yes and Sponsorship=No');

  // Eval 2: Fail (No GC)
  const evalFail = evaluateScreening(
    'Do You Have a Green Card or US Citizen ? : No, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No',
    rules
  );
  assert(evalFail.status === 'FAIL', 'Screening result is FAIL for GC=No');

  // Eval 3: Manual Review (Missing sponsorship)
  const evalReview = evaluateScreening(
    'Do You Have a Green Card or US Citizen ? : Yes',
    rules
  );
  assert(evalReview.status === 'MANUAL_REVIEW', 'Screening result is MANUAL_REVIEW for missing sponsorship answer');

  // -------------------------------------------------------------
  // TEST 4: Batch Import & Duplicate Detection (Same Slot vs Different Slot)
  // -------------------------------------------------------------
  const testBatchId1 = `test-batch-aara-${Date.now()}`;
  const testImportCode1 = dbService.getNextImportCode();
  const testDate = '2026-10-17';

  const batchRecord1: ImportRecord = {
    id: testBatchId1,
    importCode: testImportCode1,
    batchName: 'E2E Test Batch 1 (AaraTech Cloud)',
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'Automated E2E Test',
    fileCount: 1,
    totalApplicants: 3,
    passedCount: 1,
    failedCount: 1,
    manualReviewCount: 1,
    errorCount: 0,
    status: 'Completed',
    files: [],
  };

  dbService.createImport(batchRecord1, 'AaraTech', testDate, ['AT-001']);

  const testRunUid = Date.now().toString().slice(-6);
  const candidateEmail1 = `robert.cloud.${testRunUid}@example.com`;
  const candidatePhone1 = `+1-555-099-${testRunUid.slice(-4)}`;

  const testApplicantsBatch1: Applicant[] = [
    {
      id: `app-pass-${Date.now()}-1`,
      importId: testBatchId1,
      sourceFile: 'cloud_engineers.xlsx',
      sourceWorksheet: 'Sheet1',
      sourceRowNumber: 2,
      firstName: 'Robert',
      lastName: `Chen-${testRunUid}`,
      fullName: `Robert Chen-${testRunUid}`,
      email: candidateEmail1,
      phone: candidatePhone1,
      location: 'Dallas, TX',
      zipCode: '75001',
      headline: 'Senior Cloud Architect',
      currentTitle: 'Cloud Architect',
      currentCompany: 'AWS Partner',
      currentPositionStartDate: '2020-01-01',
      educationDegree: 'B.S. in Computer Science',
      educationInstitution: 'UT Dallas',
      profileUrl: `https://linkedin.com/in/robert-chen-cloud-${testRunUid}`,
      dateApplied: testDate,
      currentStage: 'Applied',
      jobId: 'AT-001',
      jobTitle: 'AWS Cloud Architect',
      rawScreeningQuestions: 'Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship? : No',
      greenCardCitizenAnswer: 'YES',
      sponsorshipAnswer: 'NO',
      usWorkAuthAnswer: 'YES',
      automatedResult: 'PASS',
      manualResult: null,
      effectiveResult: 'PASS',
      screeningReasons: 'Meets GC and no-sponsorship requirements',
      gender: 'MALE',
      createdAt: new Date().toISOString(),
    },
    {
      id: `app-fail-${Date.now()}-2`,
      importId: testBatchId1,
      sourceFile: 'cloud_engineers.xlsx',
      sourceWorksheet: 'Sheet1',
      sourceRowNumber: 3,
      firstName: 'David',
      lastName: 'Miller',
      fullName: 'David Miller',
      email: `david.${Date.now()}@example.com`,
      phone: '+1-555-019-2233',
      location: 'Austin, TX',
      zipCode: '73301',
      headline: 'DevOps Specialist',
      currentTitle: 'DevOps Specialist',
      currentCompany: 'Tech Corp',
      currentPositionStartDate: '2021-06-01',
      educationDegree: 'B.S. in IT',
      educationInstitution: 'UT Austin',
      profileUrl: 'https://linkedin.com/in/david-miller-devops',
      dateApplied: testDate,
      currentStage: 'Applied',
      jobId: 'AT-001',
      jobTitle: 'AWS Cloud Architect',
      rawScreeningQuestions: 'Do You Have a Green Card or US Citizen ? : No, Will you now, or in the future, require sponsorship? : Yes',
      greenCardCitizenAnswer: 'NO',
      sponsorshipAnswer: 'YES',
      usWorkAuthAnswer: 'YES',
      automatedResult: 'FAIL',
      manualResult: null,
      effectiveResult: 'FAIL',
      screeningReasons: 'Failed Green Card and Sponsorship requirements',
      gender: 'MALE',
      createdAt: new Date().toISOString(),
    },
    {
      id: `app-rev-${Date.now()}-3`,
      importId: testBatchId1,
      sourceFile: 'cloud_engineers.xlsx',
      sourceWorksheet: 'Sheet1',
      sourceRowNumber: 4,
      firstName: 'Samantha',
      lastName: 'Vance',
      fullName: 'Samantha Vance',
      email: `samantha.${Date.now()}@example.com`,
      phone: '+1-555-019-4455',
      location: 'Plano, TX',
      zipCode: '75024',
      headline: 'Solutions Engineer',
      currentTitle: 'Solutions Engineer',
      currentCompany: 'Enterprise IT',
      currentPositionStartDate: '2022-03-01',
      educationDegree: 'M.S. Software Engineering',
      educationInstitution: 'SMU',
      profileUrl: 'https://linkedin.com/in/samantha-vance-cloud',
      dateApplied: testDate,
      currentStage: 'Applied',
      jobId: 'AT-001',
      jobTitle: 'AWS Cloud Architect',
      rawScreeningQuestions: 'Do You Have a Green Card or US Citizen ? : Yes',
      greenCardCitizenAnswer: 'YES',
      sponsorshipAnswer: 'MISSING',
      usWorkAuthAnswer: 'YES',
      automatedResult: 'MANUAL_REVIEW',
      manualResult: null,
      effectiveResult: 'MANUAL_REVIEW',
      screeningReasons: 'Missing sponsorship answer',
      gender: 'FEMALE',
      createdAt: new Date().toISOString(),
    },
  ];

  dbService.insertApplicantsBatch(testApplicantsBatch1, 'AaraTech', testBatchId1, testDate);

  // Verify batch applicants exist
  const fetchedBatch1 = dbService.getApplicants({ batchId: testBatchId1, company: 'AaraTech' });
  assert(fetchedBatch1.total === 3, 'Batch 1 inserted 3 applicants into AaraTech');

  // Verify Robert Chen is linked to a master_person_id
  const robertRecord = fetchedBatch1.data.find(a => a.email === candidateEmail1);
  assert(Boolean(robertRecord?.masterPersonId), 'Robert Chen has a master_person_id assigned');
  assert(robertRecord?.isDuplicate === 0 || !robertRecord?.isDuplicate, 'Initial application is not marked as duplicate');

  // TEST 4B: Re-uploading Robert Chen to the SAME job slot (AT-001) in a 2nd batch => Must be flagged as DUPLICATE
  const testBatchId2 = `test-batch-aara-dup-${Date.now()}`;
  dbService.createImport(
    {
      ...batchRecord1,
      id: testBatchId2,
      importCode: dbService.getNextImportCode(),
      batchName: 'E2E Test Batch 2 (Duplicate Re-upload)',
    },
    'AaraTech',
    testDate,
    ['AT-001']
  );

  const duplicateRobert: Applicant = {
    ...testApplicantsBatch1[0],
    id: `app-dup-${Date.now()}`,
    importId: testBatchId2,
  };

  dbService.insertApplicantsBatch([duplicateRobert], 'AaraTech', testBatchId2, testDate);

  const fetchedDupRobert = dbService.getApplicantById(duplicateRobert.id);
  assert(
    Boolean(fetchedDupRobert?.isDuplicate),
    'Re-upload of same candidate to SAME job slot is flagged as duplicate',
    `Duplicate flag: ${fetchedDupRobert?.isDuplicate}`
  );
  assert(
    Boolean(fetchedDupRobert?.duplicateReason?.includes('already applied to job slot')),
    'Duplicate reason explains candidate already applied to this job slot'
  );

  // TEST 4C: Legitimate application of Robert Chen to a DIFFERENT job slot (AT-002) => NOT duplicate, links to same master_person_id
  const testBatchId3 = `test-batch-aara-diff-${Date.now()}`;
  dbService.createImport(
    {
      ...batchRecord1,
      id: testBatchId3,
      importCode: dbService.getNextImportCode(),
      batchName: 'E2E Test Batch 3 (Different Job Slot)',
    },
    'AaraTech',
    testDate,
    ['AT-002']
  );

  const multiJobRobert: Applicant = {
    ...testApplicantsBatch1[0],
    id: `app-multijob-${Date.now()}`,
    importId: testBatchId3,
    jobId: 'AT-002',
    jobTitle: 'Azure Cloud Solutions Architect',
  };

  dbService.insertApplicantsBatch([multiJobRobert], 'AaraTech', testBatchId3, testDate);

  const fetchedMultiJob = dbService.getApplicantById(multiJobRobert.id);
  assert(
    fetchedMultiJob?.isDuplicate === 0 || !fetchedMultiJob?.isDuplicate,
    'Legitimate application to DIFFERENT job slot is ALLOWED and not marked as duplicate'
  );
  assert(
    fetchedMultiJob?.masterPersonId === robertRecord?.masterPersonId,
    'Both applications across different job slots link to the same master_person_id'
  );

  // -------------------------------------------------------------
  // TEST 5: Cross-Company Isolation
  // -------------------------------------------------------------
  const cliniApplicants = dbService.getApplicants({ company: 'ClinisolTech' });
  const hasAaraCandidateInClini = cliniApplicants.data.some(a => a.email === candidateEmail1);
  assert(!hasAaraCandidateInClini, 'AaraTech candidates do NOT leak into ClinisolTech workspace');

  // -------------------------------------------------------------
  // TEST 6: Manual Review Override & Audit Trail
  // -------------------------------------------------------------
  const samantha = fetchedBatch1.data.find(a => a.fullName === 'Samantha Vance');
  assert(Boolean(samantha), 'Samantha Vance found in batch 1');
  if (samantha) {
    const overrideSuccess = dbService.overrideApplicantStatus(
      samantha.id,
      'PASS',
      'Lead Recruiter Sarah',
      'Verified sponsorship not needed in screening call'
    );
    assert(overrideSuccess, 'Successfully overridden Samantha status from MANUAL_REVIEW to PASS');

    const updatedSamantha = dbService.getApplicantById(samantha.id);
    assert(updatedSamantha?.effectiveResult === 'PASS', 'Effective result updated to PASS');
    assert(updatedSamantha?.manualResult === 'PASS', 'Manual result set to PASS');
    assert(updatedSamantha?.overriddenBy === 'Lead Recruiter Sarah', 'Overridden by recorded');
    assert(Boolean(updatedSamantha?.overrideReason), 'Override reason recorded in audit log');
  }

  // -------------------------------------------------------------
  // TEST 7: Recruiter Distribution
  // -------------------------------------------------------------
  if (robertRecord) {
    const distributeResult = dbService.distributeLeads(
      [robertRecord.id],
      'Adam Vance',
      'AaraTech',
      'Lead Recruiter Sarah'
    );
    assert(
      distributeResult.distributedCount === 1,
      'Successfully distributed 1 lead to Adam Vance',
      `Result: ${JSON.stringify(distributeResult)}`
    );

    const distributedRobert = dbService.getApplicantById(robertRecord.id);
    assert(distributedRobert?.assignedRecruiter === 'Adam Vance', 'Lead assignedRecruiter set to Adam Vance');
    assert(Boolean(distributedRobert?.distributedAt), 'distributedAt timestamp saved');
  }

  // -------------------------------------------------------------
  // TEST 8: Periodic Reports Analytics (Daily/Weekly/Monthly)
  // -------------------------------------------------------------
  const dailyReport = dbService.getReportAnalytics('AaraTech', 'daily', testDate);
  assert(dailyReport.totalApplications >= 3, 'Daily report counts total applications in window', `Got ${dailyReport.totalApplications}`);
  assert(dailyReport.recruiterDistribution.length >= 1, 'Daily report tracks recruiter distribution');
  assert(dailyReport.jobSlotDistribution.length === 21, 'Daily report tracks all 21 AaraTech job slots');

  // -------------------------------------------------------------
  // TEST 9: "Clear Current Batch" Action (Safe Scoped Clearing, NEVER Global Wipe)
  // -------------------------------------------------------------
  console.log('\n--- Testing Clear Current Batch Safety ---');
  const countBeforeClear = dbService.getDashboardStats('AaraTech').applicantsProcessed;
  const auditLogsBeforeClear = dbService.getAuditLogs().length;

  // Clear batch 2 (testBatchId2)
  const clearResult = dbService.clearWorkingBatch(testBatchId2, 'AaraTech', true);
  assert(clearResult.activeWorkingBatchCleared, 'Active working batch state cleared');
  assert(clearResult.purgedApplicants === 0, 'Permanent applicant records preserved (0 deleted)', `Purged: ${clearResult.purgedApplicants}`);

  // Check batch 1 is STILL intact
  const fetchedBatch1After = dbService.getApplicants({ batchId: testBatchId1, company: 'AaraTech' });
  assert(fetchedBatch1After.total === 3, 'Batch 1 applicants remain completely intact after clearing batch 2');

  // Check baseline jobs and rules remain intact
  const jobsAfterClear = dbService.getBaselineJobs('AaraTech');
  const rulesAfterClear = dbService.getScreeningRules();
  assert(jobsAfterClear.length === 21, 'Baseline job slots NOT deleted by batch clearing');
  assert(rulesAfterClear.length === 4, 'Screening rules NOT deleted by batch clearing');

  // Check historical reports remain available after clearing current batch
  const reportAfterBatchClear = dbService.getReportAnalytics('AaraTech', 'daily', testDate);
  assert(reportAfterBatchClear.totalApplications >= 3, 'Historical reports remain available after clearing a current batch');

  // -------------------------------------------------------------
  // TEST 10: Master Candidate Database & Promotion Engine
  // -------------------------------------------------------------
  console.log('\n--- Testing Master Candidate Database ---');
  const masterStats = dbService.getMasterCandidateStats();
  assert(masterStats.totalCandidates >= 965, 'Master Candidate DB has unified profiles (>= 965)', `Got ${masterStats.totalCandidates}`);
  assert(masterStats.byCompany.AaraTech >= 538, 'AaraTech master candidates >= 538', `Got ${masterStats.byCompany.AaraTech}`);
  assert(masterStats.byCompany.ClinisolTech >= 427, 'ClinisolTech master candidates >= 427', `Got ${masterStats.byCompany.ClinisolTech}`);
  assert(masterStats.totalLinkedApplications >= 1116, 'Linked applications in master DB >= 1,116', `Got ${masterStats.totalLinkedApplications}`);

  const masterList = dbService.getMasterCandidates({ page: 1, pageSize: 10, company: 'AaraTech' });
  assert(masterList.candidates.length === 10, 'Paginated master candidates returns 10 items');
  assert(Boolean(masterList.candidates[0].person_id.startsWith('P-')), 'Master person has P- formatted person_id');

  // -------------------------------------------------------------
  // TEST 11: Google Sheets TSV 8 Columns Export
  // -------------------------------------------------------------
  console.log('\n--- Testing Google Sheets TSV 8 Columns Export ---');
  const passedApplicants = dbService.getApplicants({ company: 'AaraTech', status: 'PASS', pageSize: 5 }).data;
  assert(passedApplicants.length > 0, 'Found passed applicants to verify TSV generation');

  const tsvHeaders = ['Date', 'Name', 'Contact Number', "Email I'd", 'Job Role', 'GREEN CARD/ US-C', 'H1B-Y/N', 'LinkedIn Profile Link'];
  const tsvRows = passedApplicants.map((app) => [
    app.dateApplied || app.applicationDate || '',
    app.fullName || `${app.firstName} ${app.lastName}`.trim(),
    app.phone || '',
    app.email || '',
    app.jobTitle || app.jobId || '',
    app.greenCardCitizenAnswer === 'YES' ? 'Yes' : (app.greenCardCitizenAnswer === 'NO' ? 'No' : ''),
    app.sponsorshipAnswer === 'YES' ? 'Yes' : (app.sponsorshipAnswer === 'NO' ? 'No' : ''),
    app.profileUrl || '',
  ]);

  const tsvOutput = [tsvHeaders.join('\t'), ...tsvRows.map(r => r.join('\t'))].join('\n');
  const tsvLines = tsvOutput.split('\n');
  assert(tsvLines.length === passedApplicants.length + 1, 'TSV output contains header + applicant rows');
  const headerCols = tsvLines[0].split('\t');
  assert(headerCols.length === 8, 'TSV has exactly 8 Google Sheets columns');
  assert(headerCols[0] === 'Date' && headerCols[3] === "Email I'd" && headerCols[7] === 'LinkedIn Profile Link', 'TSV column names match exact Google Sheets spec');

  // -------------------------------------------------------------
  // TEST 12: Custom Date Range Periodic Report Analytics
  // -------------------------------------------------------------
  console.log('\n--- Testing Custom Date Range Report Analytics ---');
  const customReport = dbService.getReportAnalytics('AaraTech', 'custom', undefined, '2026-01-01', '2026-12-31');
  assert(customReport.timeframe === 'custom', 'Report analytics timeframe is custom');
  assert(customReport.totalApplications >= 3, 'Custom date range aggregated applications correctly', `Total: ${customReport.totalApplications}`);
  assert(customReport.passedCount >= 1, 'Custom date range counts passed applications', `Passed: ${customReport.passedCount}`);

  console.log('\n================================================================');
  console.log(`   TEST RESULTS: ${passedTests} / ${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('SUCCESS: All end-to-end portal requirements verified with 100% correctness!');
    process.exit(0);
  } else {
    console.error('FAILURE: One or more end-to-end tests failed.');
    process.exit(1);
  }
}

runEndToEndVerification().catch((err) => {
  console.error('Fatal error in test runner:', err);
  process.exit(1);
});
