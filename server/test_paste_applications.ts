import { analyzePastedApplications, parseRawGrid } from '../src/shared/tabularParser.js';
import { dbService } from './db.js';
import { evaluateScreening } from '../src/shared/screeningEngine.js';

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, msg: string) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${msg}`);
    throw new Error(`Test assertion failed: ${msg}`);
  }
}

async function runTests() {
  console.log('=== TEST SUITE: DIRECT PASTE APPLICATIONS (LINKEDIN RECRUITMENT FILTER) ===\n');

  // Test 1: Grid parsing of Tab-Separated Values (TSV from Excel)
  console.log('1. Raw TSV and RFC-4180 Grid Parsing');
  const tsvText = `Candidate Name\tEmail\tPhone\tRole\tGreen Card / US Citizen\tVisa Sponsorship
"Doe, John"\tjohndoe@test.com\t+1 555-0101\t"Senior Java\nDeveloper"\tYes\tNo
Jane Smith\tjanesmith@test.com\t555-0102\tCloud Architect\tNo\tYes`;

  const grid = parseRawGrid(tsvText);
  assert(grid.length === 3, 'Correctly parsed 3 rows (header + 2 data rows) with multiline cells');
  assert(grid[1][0] === 'Doe, John', 'Preserved quoted comma name: "Doe, John"');
  assert(grid[1][3].includes('Senior Java\nDeveloper'), 'Preserved multiline cell inside quotes');

  // Test 2: Pasted data with headers analysis
  console.log('\n2. Header Detection & Column Mapping');
  const analysis1 = analyzePastedApplications(tsvText, { jobId: 'AT-01', jobTitle: 'Senior Java Developer' });
  assert(analysis1.hasHeaders === true, 'Detected presence of header row');
  assert(analysis1.totalRows === 2, 'Total data rows is 2');
  assert(analysis1.validRows === 2, 'Both rows are valid');
  assert(analysis1.missingRequiredFields.length === 0, 'No missing required fields');
  assert(analysis1.rows[0].fullName === 'Doe, John', 'Mapped fullName correctly');
  assert(analysis1.rows[0].email === 'johndoe@test.com', 'Mapped email correctly');
  assert(analysis1.rows[0].greenCardAnswer === 'Yes', 'Mapped greenCardAnswer correctly');
  assert(analysis1.rows[0].sponsorshipAnswer === 'No', 'Mapped sponsorshipAnswer correctly');

  // Test 3: Pasted data without headers (Standard 8-column layout)
  console.log('\n3. Pasted Data Without Headers (Standard 8-Column Layout)');
  const raw8Col = `2026-10-19\tAlex Johnson\t555-0201\talex@test.com\tFull Stack Dev\tYes\tNo\thttps://linkedin.com/in/alexj
2026-10-19\tBrenda Lee\t555-0202\tbrenda@test.com\tData Engineer\tNo\tYes\thttps://linkedin.com/in/brendal`;

  const analysis8Col = analyzePastedApplications(raw8Col);
  assert(analysis8Col.hasHeaders === false, 'Correctly identified raw data without headers');
  assert(analysis8Col.totalRows === 2, 'Total rows is 2');
  assert(analysis8Col.validRows === 2, 'Both rows parsed as valid');
  assert(analysis8Col.rows[0].fullName === 'Alex Johnson', 'Inferred Alex Johnson as name');
  assert(analysis8Col.rows[0].email === 'alex@test.com', 'Inferred email');
  assert(analysis8Col.rows[0].phone === '5550201' || analysis8Col.rows[0].phone === '555-0201', 'Inferred sanitized phone (5550201)');
  assert(analysis8Col.rows[0].greenCardAnswer === 'Yes', 'Inferred GC answer Yes');
  assert(analysis8Col.rows[0].sponsorshipAnswer === 'No', 'Inferred Sponsorship answer No');

  // Test 4: Empty rows and whitespace handling
  console.log('\n4. Empty Lines and Whitespace Resilience');
  const dirtyText = `\n\nCandidate Name\tEmail\tPhone\tRole\tGreen Card / US Citizen\tVisa Sponsorship\n\n
Chris Martin\tchris@test.com\t555-0301\tDevOps\tYes\tNo\n
\t\t\t\t\t\n
\n`;
  const analysisDirty = analyzePastedApplications(dirtyText);
  assert(analysisDirty.totalRows === 1, 'Ignored blank/empty rows and parsed exactly 1 valid candidate');
  assert(analysisDirty.rows[0].fullName === 'Chris Martin', 'Parsed Chris Martin correctly');

  // Test 5: Missing required columns detection
  console.log('\n5. Missing Required Columns & Explanatory Feedback');
  const missingNameText = `Location\tHeadline\tCurrent Company\nNew York\tManager\tAcme Corp`;
  const analysisMissing = analyzePastedApplications(missingNameText);
  assert(analysisMissing.missingRequiredFields.includes('Candidate Name'), 'Identifies missing Candidate Name');
  assert(analysisMissing.missingRequiredFields.includes('Contact Information (Email or Phone)'), 'Identifies missing Contact Information');
  assert(analysisMissing.validRows === 0, 'No rows are marked valid when essential fields are absent');

  // Test 6: Screening rules applied to pasted data
  console.log('\n6. Shared Recruitment Screening Engine on Pasted Rows');
  const rules = dbService.getScreeningRules();
  assert(rules.length >= 3, 'Screening rules loaded from database');

  // Candidate A: GC=Yes, Sponsorship=No, Verified Name -> PASS
  const evalA = evaluateScreening(
    'Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No',
    rules,
    { fullName: 'Darshan Patel' }
  );
  assert(evalA.status === 'PASS', 'Candidate with GC=Yes, Sponsorship=No evaluated as PASS');

  // Candidate B: GC=No, Sponsorship=Yes -> FAIL
  const evalB = evaluateScreening(
    'Do You Have a Green Card or US Citizen ? : No, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : Yes',
    rules,
    { fullName: 'Jane Smith' }
  );
  assert(evalB.status === 'FAIL', 'Candidate with GC=No, Sponsorship=Yes evaluated as FAIL');

  // Candidate C: GC=Yes, Sponsorship=MISSING -> MANUAL_REVIEW
  const evalC = evaluateScreening(
    'Do You Have a Green Card or US Citizen ? : Yes',
    rules,
    { fullName: 'Alex Johnson' }
  );
  assert(evalC.status === 'MANUAL_REVIEW', 'Candidate with missing sponsorship evaluated as MANUAL_REVIEW');

  // Test 7: Full Persistence Pipeline, Batch Tracking, Duplicate Prevention & Company Scoping
  console.log('\n7. Database Persistence, Batch Metadata, and Duplicate Detection');
  const testCompany = 'AaraTech';
  const testImportId = `imp-paste-test-${Date.now()}`;
  const testImportCode = dbService.getNextImportCode();
  const testAppDate = '2026-10-19';
  const testJobSlot = 'AT-01';

  const testApplicants = [
    {
      id: `app-test-p1-${Date.now()}`,
      importId: testImportId,
      sourceFile: 'Direct Clipboard Paste',
      sourceWorksheet: 'Pasted Data',
      sourceRowNumber: 1,
      firstName: 'PastedCandidate',
      lastName: 'One',
      fullName: 'PastedCandidate One',
      email: `paste.candidate1.${Date.now()}@test.com`,
      phone: '5551234567',
      location: 'Dallas, TX',
      zipCode: '75001',
      headline: 'Senior Java Engineer',
      currentTitle: 'Senior Java Developer',
      currentCompany: 'Tech Corp',
      currentPositionStartDate: '2020-01-01',
      educationDegree: 'B.S.',
      educationInstitution: 'UT Dallas',
      profileUrl: `https://linkedin.com/in/pasted-one-${Date.now()}`,
      dateApplied: testAppDate,
      currentStage: 'Applied',
      jobId: testJobSlot,
      jobTitle: 'Senior Java Developer',
      jobUrl: '',
      atsJobId: '',
      minSalary: '',
      maxSalary: '',
      currencyCode: '',
      compensationPeriod: '',
      hiringProjectId: '',
      hiringProjectTitle: '',
      contractId: '',
      contractName: '',
      gender: 'MALE' as const,
      genderConfidence: 0.9,
      rawScreeningQuestions: 'GC: Yes, Sponsorship: No',
      greenCardCitizenAnswer: 'YES',
      sponsorshipAnswer: 'NO',
      usWorkAuthAnswer: 'YES',
      automatedResult: 'PASS' as const,
      manualResult: null,
      effectiveResult: 'PASS' as const,
      screeningReasons: 'Meets GC and Sponsorship requirements',
      overrideReason: null,
      overriddenBy: null,
      overriddenAt: null,
      rawRowData: {},
      createdAt: new Date().toISOString(),
    },
    {
      id: `app-test-p2-${Date.now()}`,
      importId: testImportId,
      sourceFile: 'Direct Clipboard Paste',
      sourceWorksheet: 'Pasted Data',
      sourceRowNumber: 2,
      firstName: 'PastedCandidate',
      lastName: 'Two',
      fullName: 'PastedCandidate Two',
      email: `paste.candidate2.${Date.now()}@test.com`,
      phone: '5559876543',
      location: 'Chicago, IL',
      zipCode: '60601',
      headline: 'Cloud Engineer',
      currentTitle: 'Cloud Architect',
      currentCompany: 'Cloud Systems',
      currentPositionStartDate: '2021-01-01',
      educationDegree: 'M.S.',
      educationInstitution: 'UIC',
      profileUrl: `https://linkedin.com/in/pasted-two-${Date.now()}`,
      dateApplied: testAppDate,
      currentStage: 'Applied',
      jobId: testJobSlot,
      jobTitle: 'Cloud Architect',
      jobUrl: '',
      atsJobId: '',
      minSalary: '',
      maxSalary: '',
      currencyCode: '',
      compensationPeriod: '',
      hiringProjectId: '',
      hiringProjectTitle: '',
      contractId: '',
      contractName: '',
      gender: 'FEMALE' as const,
      genderConfidence: 0.9,
      rawScreeningQuestions: 'GC: No, Sponsorship: Yes',
      greenCardCitizenAnswer: 'NO',
      sponsorshipAnswer: 'YES',
      usWorkAuthAnswer: 'YES',
      automatedResult: 'FAIL' as const,
      manualResult: null,
      effectiveResult: 'FAIL' as const,
      screeningReasons: 'Requires visa sponsorship',
      overrideReason: null,
      overriddenBy: null,
      overriddenAt: null,
      rawRowData: {},
      createdAt: new Date().toISOString(),
    },
  ];

  const testImportRecord = {
    id: testImportId,
    importCode: testImportCode,
    batchName: 'Pasted Applications Test Batch',
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'Recruiter Admin',
    fileCount: 1,
    totalApplicants: 2,
    passedCount: 1,
    failedCount: 1,
    manualReviewCount: 0,
    errorCount: 0,
    status: 'Completed' as const,
    files: [
      {
        filename: 'Direct Clipboard Paste',
        fileSize: 1024,
        rowCount: 2,
        jobId: testJobSlot,
        jobTitle: 'Senior Java Developer',
        status: 'PROCESSED' as const,
      },
    ],
  };

  // Create import batch record
  dbService.createImport(testImportRecord, testCompany, testAppDate, [testJobSlot]);
  // Insert applicants with duplicate checking and company scoping
  dbService.insertApplicantsBatch(testApplicants, testCompany, testImportId, testAppDate);

  // Promote to master CRM
  dbService.promoteApplicationsToMaster(testCompany, testApplicants.map(a => a.id));

  // Verify batch exists in imports history
  const recentImports = dbService.getImports(10, testCompany);
  const foundImport = recentImports.find(i => i.id === testImportId);
  assert(!!foundImport, 'Pasted batch record saved in database imports table');
  assert(foundImport?.batchName === 'Pasted Applications Test Batch', 'Batch name recorded accurately');
  assert(foundImport?.totalApplicants === 2, 'Batch applicant count recorded accurately');

  // Verify applicants appear in permanent history
  const savedApps = dbService.getApplicants({ company: testCompany, batchId: testImportId } as any).data;
  assert(savedApps.length === 2, 'Both pasted applicants retrieved from permanent database table');
  assert(savedApps[0].company === 'AaraTech', 'Applicants scoped strictly to active company workspace');

  // Test 8: Prevent accidental duplicate on re-pasting same candidate to same job slot
  console.log('\n8. Duplicate Detection on Repeated Pastes');
  const repeatedApplicants = [
    {
      ...testApplicants[0],
      id: `app-test-p1-dup-${Date.now()}`,
      sourceRowNumber: 1,
    },
  ];
  const secondImportId = `imp-paste-second-${Date.now()}`;
  dbService.createImport({
    ...testImportRecord,
    id: secondImportId,
    importCode: dbService.getNextImportCode(),
    batchName: 'Repeated Paste Batch',
  }, testCompany, testAppDate, [testJobSlot]);

  dbService.insertApplicantsBatch(repeatedApplicants, testCompany, secondImportId, testAppDate);
  const reimportedApps = dbService.getApplicants({ company: testCompany, batchId: secondImportId } as any).data;
  assert(reimportedApps.length === 1, 'Repeated paste row processed');
  assert(reimportedApps[0].isDuplicate === true, 'Repeated candidate to same job slot correctly flagged as duplicate (is_duplicate = 1)');
  assert(reimportedApps[0].duplicateReason?.includes('already applied'), 'Duplicate reason clearly documented in audit trail');

  // Test 9: Legitimate application to DIFFERENT job slot remains allowed
  console.log('\n9. Legitimate Multi-Slot Application Permitted');
  const differentSlotApplicant = [
    {
      ...testApplicants[0],
      id: `app-test-p1-diffslot-${Date.now()}`,
      jobId: 'AT-02',
      jobTitle: 'AWS DevOps Engineer',
      sourceRowNumber: 1,
    },
  ];
  const thirdImportId = `imp-paste-third-${Date.now()}`;
  dbService.createImport({
    ...testImportRecord,
    id: thirdImportId,
    importCode: dbService.getNextImportCode(),
    batchName: 'Different Slot Batch',
  }, testCompany, testAppDate, ['AT-02']);

  dbService.insertApplicantsBatch(differentSlotApplicant, testCompany, thirdImportId, testAppDate);
  const diffSlotApps = dbService.getApplicants({ company: testCompany, batchId: thirdImportId } as any).data;
  assert(diffSlotApps.length === 1, 'Applicant applied to different job slot');
  assert(diffSlotApps[0].isDuplicate === false, 'Application to DIFFERENT job slot is NOT marked duplicate (is_duplicate = 0)');

  // Test 10: Company Separation (AaraTech vs ClinisolTech)
  console.log('\n10. Cross-Company Workspace Separation');
  const clinisolApps = dbService.getApplicants({ company: 'ClinisolTech', batchId: testImportId } as any).data;
  assert(clinisolApps.length === 0, 'AaraTech pasted batch does not leak into ClinisolTech workspace');

  console.log(`\n======================================================`);
  console.log(`ALL TESTS PASSED: ${passedTests}/${totalTests} (100% Success)`);
  console.log(`======================================================\n`);
}

runTests().catch(err => {
  console.error('\nTest suite execution failed:', err);
  process.exit(1);
});
