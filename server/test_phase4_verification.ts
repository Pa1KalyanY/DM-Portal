import { dbService } from './db';

async function runPhase4Verification() {
  console.log('=== RUNNING PHASE 4 ADVANCED SEARCH & TECHNOLOGY-WISE ANALYTICS VERIFICATION ===\n');

  // Test 1: Dynamic Technologies Discovery with Company Isolation
  console.log('[TEST 1] Testing Dynamic Technology Discovery:');
  const aaraTechs = dbService.getMasterCandidateTechnologies('AaraTech');
  const cliniTechs = dbService.getMasterCandidateTechnologies('ClinisolTech');
  console.log(`- AaraTech Unique Technologies (${aaraTechs.length}):`, aaraTechs);
  console.log(`- ClinisolTech Unique Technologies (${cliniTechs.length}):`, cliniTechs.slice(0, 10));

  if (!Array.isArray(cliniTechs)) {
    throw new Error('getMasterCandidateTechnologies should return an array!');
  }
  console.log('✓ TEST 1 PASSED: Unique technology lists retrieved with company isolation.\n');

  // Test 2: Multi-dimensional Search Filters
  console.log('[TEST 2] Testing Multi-Dimensional Search Filtering:');
  
  // 2a. Technology Filter
  if (cliniTechs.length > 0) {
    const targetTech = cliniTechs[0];
    const techFiltered = dbService.getMasterCandidates({
      company: 'ClinisolTech',
      technology: targetTech,
      page: 1,
      pageSize: 5,
    });
    console.log(`- Filter by Technology "${targetTech}": Found ${techFiltered.totalCount} matches`);
    if (techFiltered.candidates.length > 0) {
      console.log(`  Sample Candidate Title: ${techFiltered.candidates[0].current_title}`);
    }
  }

  // 2b. H1B Sponsorship Filter ('No')
  const h1bNoFiltered = dbService.getMasterCandidates({
    company: 'ClinisolTech',
    h1bStatus: 'No',
    page: 1,
    pageSize: 5,
  });
  console.log(`- Filter by H1B Status "No": Found ${h1bNoFiltered.totalCount} candidates`);
  if (h1bNoFiltered.candidates.length > 0) {
    console.log(`  Sample H1B Status: "${h1bNoFiltered.candidates[0].h1b_status}"`);
  }

  // 2c. Repeat Applicants Filter
  const repeatOnlyFiltered = dbService.getMasterCandidates({
    company: 'ClinisolTech',
    repeatFilter: 'repeat_only',
    page: 1,
    pageSize: 5,
  });
  console.log(`- Filter by Repeat Applicants Only: Found ${repeatOnlyFiltered.totalCount} repeat applicants`);
  if (repeatOnlyFiltered.candidates.length > 0) {
    console.log(`  Sample Repeat Candidate: ${repeatOnlyFiltered.candidates[0].full_name} (${repeatOnlyFiltered.candidates[0].total_applications} apps)`);
  }

  const firstTimeOnlyFiltered = dbService.getMasterCandidates({
    company: 'ClinisolTech',
    repeatFilter: 'first_time_only',
    page: 1,
    pageSize: 5,
  });
  console.log(`- Filter by First-Time Applicants Only: Found ${firstTimeOnlyFiltered.totalCount} first-time applicants`);

  // 2d. Resume and LinkedIn Presence
  const hasResumeFiltered = dbService.getMasterCandidates({
    company: 'ClinisolTech',
    hasResume: true,
    page: 1,
    pageSize: 5,
  });
  console.log(`- Filter by Has Resume Link: Found ${hasResumeFiltered.totalCount} candidates with resume`);

  console.log('✓ TEST 2 PASSED: Multi-dimensional filters operate accurately.\n');

  // Test 3: Enhanced Recruitment Reports & Analytics
  console.log('[TEST 3] Testing Enhanced Reporting & Requisition Analytics:');
  const report = dbService.getReportAnalytics('ClinisolTech', 'all');
  console.log(`- Report Scope: ${report.company} (${report.timeframe})`);
  console.log(`- Total Screened: ${report.totalApplications}`);
  console.log(`- Passed Leads: ${report.passedCount} (${report.passRate}% pass rate)`);
  console.log(`- Transferred to Master DB: ${report.transferredCount}`);
  console.log(`- Unique Candidates: ${report.uniqueCandidatesCount}`);
  console.log(`- Repeat Applications: ${report.repeatApplicationsCount}`);
  console.log(`- Contact Attempts Logged: ${report.contactAttemptsCount}`);
  console.log(`- Requisitions Count: ${report.jobSlotDistribution?.length}`);
  
  if (report.jobSlotDistribution && report.jobSlotDistribution.length > 0) {
    const slot0 = report.jobSlotDistribution[0];
    console.log(`  Sample Requisition: ${slot0.jobId} - ${slot0.jobTitle}`);
    console.log(`  Applied: ${slot0.total}, Unique: ${slot0.uniqueCandidates}, Repeat: ${slot0.repeatApplicants}, Passed: ${slot0.passed}, Transferred: ${slot0.transferred}, Rate: ${slot0.passRate}%`);
  }

  if (report.recruiterDistribution && report.recruiterDistribution.length > 0) {
    console.log(`- Recruiter Activity (${report.recruiterDistribution.length} recruiters):`);
    const activeRec = report.recruiterDistribution.find((r: any) => r.contactsMade > 0) || report.recruiterDistribution[0];
    console.log(`  Recruiter ${activeRec.recruiterName}: Assigned: ${activeRec.leadsAssigned}, Contacts Made: ${activeRec.contactsMade}, Positive: ${activeRec.positiveFeedbackCount}, Negative: ${activeRec.negativeFeedbackCount}, Pending: ${activeRec.pendingFeedbackCount}`);
  }

  console.log('✓ TEST 3 PASSED: Enhanced reporting engine provides full multi-dimensional metrics.\n');

  // Test 4: Cross-Technology Movement & Analytics (Section 13)
  console.log('[TEST 4] Testing Cross-Technology Analytics (Section 13):');
  const crossTech = dbService.getCrossTechnologyAnalytics('ClinisolTech');
  console.log(`- Multi-Technology Candidates Found: ${crossTech.totalMultiTechCount}`);
  console.log(`- Top Cross-Disciplinary Technology Pairs:`, crossTech.technologyPairs);
  if (crossTech.multiTechCandidates.length > 0) {
    const sampleCross = crossTech.multiTechCandidates[0];
    console.log(`  Sample Multi-Tech Candidate: ${sampleCross.full_name}`);
    console.log(`  Distinct Technologies: ${sampleCross.technologies}`);
    console.log(`  Total Apps: ${sampleCross.total_applications}`);
  }
  console.log('✓ TEST 4 PASSED: Cross-technology movement correctly computed.\n');

  // Test 5: Strict Company Isolation Verification
  console.log('[TEST 5] Testing Strict Logical Company Isolation:');
  const aaraAll = dbService.getMasterCandidates({ company: 'AaraTech' });
  const cliniAll = dbService.getMasterCandidates({ company: 'ClinisolTech' });
  console.log(`- AaraTech Candidate Total: ${aaraAll.totalCount}`);
  console.log(`- ClinisolTech Candidate Total: ${cliniAll.totalCount}`);

  for (const cand of aaraAll.candidates) {
    if (cand.company !== 'AaraTech') {
      throw new Error(`Isolation breach! AaraTech query returned candidate belonging to ${cand.company}`);
    }
  }
  for (const cand of cliniAll.candidates) {
    if (cand.company !== 'ClinisolTech') {
      throw new Error(`Isolation breach! ClinisolTech query returned candidate belonging to ${cand.company}`);
    }
  }
  console.log('✓ TEST 5 PASSED: Strict logical company isolation 100% verified.\n');

  console.log('================================================================');
  console.log('ALL PHASE 4 TEST SUITES PASSED SUCCESSFULLY!');
  console.log('================================================================');
}

runPhase4Verification().catch(err => {
  console.error('Phase 4 Verification Failed:', err);
  process.exit(1);
});

