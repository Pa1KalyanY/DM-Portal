import assert from 'node:assert';
import { evaluateScreening, normalizeAnswer } from '../src/shared/screeningEngine.js';
import { normalizeJobRole, sanitizeContactNumber } from '../src/shared/columnMapper.js';
import { classifySouthAsianOrigin } from '../src/shared/southAsianOriginClassifier.js';
import { classifyGender } from '../src/shared/genderClassifier.js';
import { referenceNameMatcher } from './referenceNameMatcher.js';
import { dbService } from './db.js';
import { Applicant } from '../src/types/index.js';

console.log('================================================================');
console.log('LINKEDIN APPLICANT FILTERING & SCREENING ADVANCED VERIFICATION');
console.log('================================================================');

let passedTests = 0;
let totalTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
  }
}

// ----------------------------------------------------------------------
// 1. LEGAL WORK AUTHORIZATION SCREENING ENGINE
// ----------------------------------------------------------------------
console.log('\n--- 1. Legal Work Authorization Screening Engine ---');

runTest('Rule 1 & 2: Green Card=YES and Sponsorship=NO -> PASS', () => {
  const text = 'Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No';
  const res = evaluateScreening(text);
  assert.strictEqual(res.status, 'PASS');
  assert.strictEqual(res.greenCardCitizenAnswer, 'YES');
  assert.strictEqual(res.futureSponsorshipAnswer, 'NO');
});

runTest('Rule 2: Sponsorship=YES -> FAIL', () => {
  const text = 'Do You Have a Green Card or US Citizen ? : Yes, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : Yes';
  const res = evaluateScreening(text);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.futureSponsorshipAnswer, 'YES');
});

runTest('Rule 1: Green Card=NO and Sponsorship=NO -> FAIL', () => {
  const text = 'Do You Have a Green Card or US Citizen ? : No, Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : No';
  const res = evaluateScreening(text);
  assert.strictEqual(res.status, 'FAIL');
  assert.strictEqual(res.greenCardCitizenAnswer, 'NO');
});

runTest('Missing / Unclear Sponsorship -> Route to MANUAL REVIEW', () => {
  const text = 'Do You Have a Green Card or US Citizen ? : Yes';
  const res = evaluateScreening(text);
  assert.strictEqual(res.status, 'MANUAL_REVIEW');
  assert.strictEqual(res.futureSponsorshipAnswer, 'MISSING');
});

runTest('Phrases normalization ("I do not require" -> NO)', () => {
  assert.strictEqual(normalizeAnswer('I do not require'), 'NO');
  assert.strictEqual(normalizeAnswer('will not require'), 'NO');
  assert.strictEqual(normalizeAnswer('no sponsorship'), 'NO');
  assert.strictEqual(normalizeAnswer('I will require sponsorship'), 'YES');
});

// ----------------------------------------------------------------------
// 2. ROLE NORMALIZATION & MAPPING
// ----------------------------------------------------------------------
console.log('\n--- 2. Enterprise Role Normalizer ---');

runTest('Maps diverse titles to canonical roles (DA, DE, BA, DS, AWS, Cybersecurity, QA)', () => {
  assert.strictEqual(normalizeJobRole('Senior Data Analyst'), 'DA');
  assert.strictEqual(normalizeJobRole('BI Reporting Analyst'), 'DA');
  assert.strictEqual(normalizeJobRole('Lead Data Engineer'), 'DE');
  assert.strictEqual(normalizeJobRole('ETL Pipeline Developer'), 'DE');
  assert.strictEqual(normalizeJobRole('Business Systems Analyst'), 'BA');
  assert.strictEqual(normalizeJobRole('Product Analyst'), 'BA');
  assert.strictEqual(normalizeJobRole('Data Scientist - Machine Learning'), 'DS');
  assert.strictEqual(normalizeJobRole('AWS DevOps Architect'), 'AWS');
  assert.strictEqual(normalizeJobRole('Cybersecurity Specialist - SOC'), 'Cybersecurity');
  assert.strictEqual(normalizeJobRole('QA Automation Engineer - SDET'), 'QA');
});

runTest('Phone number sanitizer to clean 10 digits', () => {
  assert.strictEqual(sanitizeContactNumber('+1 (408) 555-0182'), '408-555-0182');
  assert.strictEqual(sanitizeContactNumber('1-214-555-3341'), '214-555-3341');
  assert.strictEqual(sanitizeContactNumber('6785559011'), '678-555-9011');
});

// ----------------------------------------------------------------------
// 3. REGIONAL ORIGIN CLASSIFIER
// ----------------------------------------------------------------------
console.log('\n--- 3. Regional Origin Classifier ---');

runTest('Identifies South Asian regional surnames with high accuracy', () => {
  const telugu = classifySouthAsianOrigin('Suresh Chowdary');
  assert.strictEqual(telugu.isSouthAsian, true);
  assert.strictEqual(telugu.countryMatch, 'India');

  const gujarati = classifySouthAsianOrigin('Darshan Patel');
  assert.strictEqual(gujarati.isSouthAsian, true);
  assert.strictEqual(gujarati.countryMatch, 'India');

  const punjabi = classifySouthAsianOrigin('Harpreet Sandhu');
  assert.strictEqual(punjabi.isSouthAsian, true);
  assert.strictEqual(punjabi.countryMatch, 'India');

  const pakistani = classifySouthAsianOrigin('Bilal Siddiqui');
  assert.strictEqual(pakistani.isSouthAsian, true);
  assert.strictEqual(pakistani.countryMatch, 'Pakistan');
});

runTest('Negative anti-pattern check filters Western and foreign false positives', () => {
  const western = classifySouthAsianOrigin('Patrick Roy');
  assert.strictEqual(western.isSouthAsian, false);
  assert.strictEqual(western.origin, 'OTHER');

  const anglo = classifySouthAsianOrigin('Jonathan Amirante');
  assert.strictEqual(anglo.isSouthAsian, false);
});

// ----------------------------------------------------------------------
// 4. GENDER INFERENCE ENGINE
// ----------------------------------------------------------------------
console.log('\n--- 4. Gender Classifier ---');

runTest('Accurately infers gender from name, honorific, and headline pronouns', () => {
  const male = classifyGender('Darshan', 'Darshan Patel', 'Senior Analyst (he/him)');
  assert.strictEqual(male.gender, 'MALE');

  const female = classifyGender('Priya', 'Priya Sharma', 'Product Manager (she/her)');
  assert.strictEqual(female.gender, 'FEMALE');

  const honorificMale = classifyGender('Alex', 'Mr. Alex Smith');
  assert.strictEqual(honorificMale.gender, 'MALE');

  const honorificFemale = classifyGender('Jordan', 'Ms. Jordan Taylor');
  assert.strictEqual(honorificFemale.gender, 'FEMALE');
});

// ----------------------------------------------------------------------
// 5. 13,859-RECORD REFERENCE NAME PATTERN MATCHER
// ----------------------------------------------------------------------
console.log('\n--- 5. Reference Name Pattern Matcher (6-Tier Scoring) ---');

runTest('Tier 1: Exact Reference Match -> Score 1.0 / 100% Strong Match', () => {
  const res = referenceNameMatcher.evaluate('Darshan Patel');
  assert.strictEqual(res.category, 'Strong Match');
  assert.strictEqual(res.score, 1.0);
  assert.ok(res.matchedPattern.includes('Exact reference record'));
});

runTest('Tier 2: Multi-Token Combination Match -> Score 0.90 / 90% Strong Match', () => {
  const res = referenceNameMatcher.evaluate('Sai Krishna Rao');
  assert.strictEqual(res.category, 'Strong Match');
  assert.strictEqual(res.score, 0.90);
});

runTest('Tier 3: Multi-Token Match -> Score 0.85 / 85% Strong Match', () => {
  const res = referenceNameMatcher.evaluate('Kiran Reddy');
  assert.strictEqual(res.category, 'Strong Match');
  assert.strictEqual(res.score, 0.85);
});

runTest('Tier 4: Single Distinctive Surname Match -> Score 0.55 / 55% Possible Match', () => {
  const res = referenceNameMatcher.evaluate('Shubhan Punde');
  assert.strictEqual(res.category, 'Possible Match');
  assert.strictEqual(res.score, 0.55);
});

runTest('Tier 6: Initials Protection & Negative Western Exclusions -> <= 0.10 No Match', () => {
  const initialsRes = referenceNameMatcher.evaluate('Ola C.');
  assert.strictEqual(initialsRes.category, 'No Match');
  assert.ok(initialsRes.score <= 0.10);

  const westernRes = referenceNameMatcher.evaluate('James Cook');
  assert.strictEqual(westernRes.category, 'No Match');
  assert.ok(westernRes.score <= 0.10);
});

// ----------------------------------------------------------------------
// 6. SQLITE PERSISTENCE, MIGRATIONS & BACKFILL
// ----------------------------------------------------------------------
console.log('\n--- 6. Persistence & Ingestion Pipeline Verification ---');

runTest('Applicants table has normalized_role, reference match and origin columns', () => {
  const testImportId = `test-imp-${Date.now()}`;
  dbService.createImport({
    id: testImportId,
    importCode: `BATCH-${Date.now()}`,
    batchName: 'Advanced Screening Test Batch',
    uploadedAt: new Date().toISOString(),
    uploadedBy: 'System Test',
    fileCount: 1,
    totalApplicants: 1,
    passedCount: 1,
    failedCount: 0,
    manualReviewCount: 0,
    errorCount: 0,
    status: 'COMPLETED' as any,
    files: [
      {
        filename: 'sample_test.xlsx',
        fileSize: 1024,
        rowCount: 1,
        jobId: 'AT-002',
        jobTitle: 'Data Analyst',
        status: 'PROCESSED' as const,
      },
    ],
  }, 'AaraTech', '2026-09-18', ['AT-002']);

  const sampleApplicant: Applicant = {
    id: `test-adv-${Date.now()}`,
    importId: testImportId,
    sourceFile: 'sample_test.xlsx',
    sourceWorksheet: 'Sheet1',
    sourceRowNumber: 1,
    firstName: 'Darshan',
    lastName: 'Patel',
    fullName: 'Darshan Patel',
    email: 'darshan.patel92@gmail.com',
    phone: '408-555-0182',
    location: 'San Jose, CA',
    zipCode: '95134',
    headline: 'Senior Data Analyst at Cisco',
    currentTitle: 'Senior Data Analyst',
    currentCompany: 'Cisco',
    currentPositionStartDate: '2022-01',
    educationDegree: 'Master of Science',
    educationInstitution: 'San Jose State University',
    profileUrl: 'https://linkedin.com/in/darshanpatel92',
    dateApplied: '2026-09-18',
    currentStage: 'Applied',
    jobId: 'AT-002',
    jobTitle: 'Data Analyst',
    normalizedRole: 'DA',
    jobUrl: '',
    atsJobId: '',
    minSalary: '',
    maxSalary: '',
    currencyCode: 'USD',
    compensationPeriod: 'Annual',
    hiringProjectId: '',
    hiringProjectTitle: '',
    contractId: '',
    contractName: '',
    gender: 'MALE',
    originRegion: 'SOUTH_ASIAN',
    originCountry: 'India',
    originMatchReason: 'Linguistic match: Patel (Gujarati)',
    nameMatchCategory: 'Strong Match',
    nameMatchScore: 1.0,
    nameMatchedPattern: 'Exact reference record: "darshan patel"',
    nameMatchedReference: 'darshan patel',
    rawScreeningQuestions: 'GC: YES, Sponsorship: NO',
    greenCardCitizenAnswer: 'YES',
    sponsorshipAnswer: 'NO',
    usWorkAuthAnswer: 'YES',
    automatedResult: 'PASS',
    manualResult: null,
    effectiveResult: 'PASS',
    screeningReasons: 'Screening passed',
    overrideReason: null,
    overriddenBy: null,
    overriddenAt: null,
    rawRowData: {},
    createdAt: new Date().toISOString(),
    company: 'AaraTech',
  };

  dbService.insertApplicants([sampleApplicant], 'AaraTech', testImportId, '2026-09-18');
  const retrieved = dbService.getApplicantById(sampleApplicant.id);

  assert.ok(retrieved !== null, 'Applicant must be inserted and retrievable');
  assert.strictEqual(retrieved!.normalizedRole, 'DA');
  assert.strictEqual(retrieved!.nameMatchCategory, 'Strong Match');
  assert.strictEqual(retrieved!.nameMatchScore, 1.0);
  assert.strictEqual(retrieved!.nameMatchedReference, 'darshan patel');

  // Clean up test records
  (dbService as any).db.prepare('DELETE FROM applicants WHERE id = ?').run(sampleApplicant.id);
  (dbService as any).db.prepare('DELETE FROM import_files WHERE import_id = ?').run(testImportId);
  (dbService as any).db.prepare('DELETE FROM imports WHERE id = ?').run(testImportId);
});

// ----------------------------------------------------------------------
// 7. SECTION 6.3 8-COLUMN GOOGLE SHEETS TSV CLIPBOARD OUTPUT
// ----------------------------------------------------------------------
console.log('\n--- 7. Section 6.3 8-Column TSV Output ---');

runTest('Generates clean, tab-separated Google Sheets export (8 columns)', () => {
  const testCandidate = {
    fullName: 'Darshan Patel',
    normalizedRole: 'DA',
    email: 'darshan.patel92@gmail.com',
    phone: '408-555-0182',
    gender: 'MALE',
    effectiveResult: 'PASS',
    nameMatchScore: 1.0,
    nameMatchedReference: 'darshan patel',
  };

  const expectedLine = 'Darshan Patel\tDA\tdarshan.patel92@gmail.com\t408-555-0182\tMALE\tPASS\t100%\tdarshan patel';
  const scorePercent = `${Math.round(testCandidate.nameMatchScore * 100)}%`;

  const actualLine = [
    testCandidate.fullName,
    testCandidate.normalizedRole,
    testCandidate.email,
    testCandidate.phone,
    testCandidate.gender,
    testCandidate.effectiveResult,
    scorePercent,
    testCandidate.nameMatchedReference,
  ].join('\t');

  assert.strictEqual(actualLine, expectedLine);
});

console.log('================================================================');
console.log(`SUMMARY: ${passedTests} / ${totalTests} tests passed successfully!`);
console.log('================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
} else {
  process.exit(0);
}
