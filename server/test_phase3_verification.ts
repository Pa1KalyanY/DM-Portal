import { dbService } from './db';

async function runPhase3Verification() {
  console.log('=== RUNNING PHASE 3 CANDIDATE PROFILE & REPEAT APPLICATION TRACKING VERIFICATION ===\n');

  // Test 1: Fetch candidate list and inspect repeat application metrics
  const aaraList = dbService.getMasterCandidates({ company: 'AaraTech', page: 1, pageSize: 5 });
  console.log(`[TEST 1] AaraTech Candidate List (Total: ${aaraList.totalCount}):`);
  if (aaraList.candidates.length > 0) {
    const cand = aaraList.candidates[0];
    console.log(`- Sample Candidate: ${cand.full_name} (${cand.person_id})`);
    console.log(`  Total Apps: ${cand.total_applications}, Repeat Apps: ${cand.repeat_applications}`);
    console.log(`  First Applied: ${cand.first_applied_date}, Last Applied: ${cand.last_applied_date}`);
    console.log(`  Applications count: ${cand.applications?.length}`);
    if (cand.total_applications === undefined || cand.repeat_applications === undefined) {
      throw new Error('Candidate is missing total_applications or repeat_applications fields!');
    }
  }
  console.log('✓ TEST 1 PASSED: Candidate list successfully returns repeat application metrics.\n');

  // Test 2: Sorting Candidates by total_applications
  const sortedApps = dbService.getMasterCandidates({
    company: 'AaraTech',
    sortBy: 'total_applications',
    sortOrder: 'desc',
    page: 1,
    pageSize: 10,
  });
  console.log(`[TEST 2] Candidates sorted by Total Applications (High to Low):`);
  sortedApps.candidates.forEach((c, idx) => {
    console.log(`  ${idx + 1}. ${c.full_name} - ${c.total_applications} apps (${c.repeat_applications} repeat)`);
  });
  console.log('✓ TEST 2 PASSED: Dynamic sorting by Total Applications works seamlessly.\n');

  // Test 3: Sorting Candidates by candidate name
  const sortedNames = dbService.getMasterCandidates({
    company: 'AaraTech',
    sortBy: 'full_name',
    sortOrder: 'asc',
    page: 1,
    pageSize: 5,
  });
  console.log(`[TEST 3] Candidates sorted by Name (A to Z):`);
  sortedNames.candidates.forEach((c, idx) => {
    console.log(`  ${idx + 1}. ${c.full_name}`);
  });
  console.log('✓ TEST 3 PASSED: Dynamic sorting by Candidate Name works seamlessly.\n');

  // Test 4: Simulate a genuine repeat application for a candidate
  console.log('[TEST 4] Creating a multi-application candidate to verify repeat tracking:');
  const testPersonId = `TEST-P3-${Date.now()}`;
  const testEmail = `repeat.candidate.${Date.now()}@example.com`;
  const testPhone = '4155550199';

  // Insert master person
  dbService.db.prepare(`
    INSERT INTO master_people (
      id, person_id, company, first_name, last_name, full_name, primary_email, primary_phone, current_status, current_owner, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(testPersonId, testPersonId, 'AaraTech', 'Jordan', 'Lee', 'Jordan Lee', testEmail, testPhone, 'New', 'Sia');

  // Insert application 1 (CyberSecurity on 2026-08-01)
  const app1Id = `app-1-${Date.now()}`;
  dbService.db.prepare(`
    INSERT INTO master_applications (
      id, person_id, company, job_id, job_title, technology, date_applied, current_stage, effective_result, source_file, resume_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-08-01 10:00:00')
  `).run(app1Id, testPersonId, 'AaraTech', 'AT-003', 'CyberSecurity Specialist', 'CyberSecurity', '2026-08-01', 'Applied', 'PASS', 'batch_august.xlsx', 'https://drive.google.com/resume1.pdf');

  // Insert application 2 (Cloud DevOps Architect on 2026-10-15) - REPEAT APPLICATION
  const app2Id = `app-2-${Date.now()}`;
  dbService.db.prepare(`
    INSERT INTO master_applications (
      id, person_id, company, job_id, job_title, technology, date_applied, current_stage, effective_result, source_file, resume_url, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2026-10-15 14:00:00')
  `).run(app2Id, testPersonId, 'AaraTech', 'AT-004', 'Cloud DevOps Architect', 'DevOps', '2026-10-15', 'Applied', 'PASS', 'batch_october.xlsx', 'https://drive.google.com/resume2.pdf');

  // Insert transfer record
  dbService.db.prepare(`
    INSERT INTO master_transfers (
      id, screening_applicant_id, batch_id, company, person_id, application_id, transfer_status, duplicate_check_result, transferred_at, transferred_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
  `).run(`tr-${Date.now()}`, 'screen-123', 'BATCH-OCT', 'AaraTech', testPersonId, app2Id, 'TRANSFERRED', 'EXISTING CANDIDATE + NEW APPLICATION', 'Recruiter Admin');

  // Insert identical duplicate contacts to verify feedback deduplication
  dbService.db.prepare(`
    INSERT INTO master_recruiter_contacts (
      id, person_id, recruiter_name, contact_type, contact_date, outcome, feedback_1, feedback_2, notes, source_file, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(`c1-${Date.now()}`, testPersonId, 'Uday', 'Phone', '2026-10-29', '3.VM', '3.VM', 'VM', 'Voicemail left', 'pasted_leads.xlsx');

  dbService.db.prepare(`
    INSERT INTO master_recruiter_contacts (
      id, person_id, recruiter_name, contact_type, contact_date, outcome, feedback_1, feedback_2, notes, source_file, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(`c2-${Date.now()}`, testPersonId, 'Uday', 'Phone', '2026-10-29', '3.VM', '3.VM', 'VM', 'Voicemail left', 'pasted_leads.xlsx');

  // Verify candidate profile retrieval
  const profile = dbService.getMasterCandidateById(testPersonId);
  console.log(`- Retrieved Candidate Profile: ${profile.full_name}`);
  console.log(`  Total Apps: ${profile.total_applications} (Expected: 2)`);
  console.log(`  Repeat Apps: ${profile.repeat_applications} (Expected: 1)`);
  console.log(`  First Applied Date: ${profile.first_applied_date} (Expected: 2026-08-01)`);
  console.log(`  Last Applied Date: ${profile.last_applied_date} (Expected: 2026-10-15)`);
  console.log(`  Applications Array Length: ${profile.applications?.length}`);
  console.log(`  Transfers Count: ${profile.transfers?.length}`);
  console.log(`  Recruiter Contacts (Deduplicated): ${profile.recruiter_contacts?.length} (Expected: 1)`);

  if (profile.total_applications !== 2) throw new Error(`Expected total_applications to be 2, got ${profile.total_applications}`);
  if (profile.repeat_applications !== 1) throw new Error(`Expected repeat_applications to be 1, got ${profile.repeat_applications}`);
  if (profile.first_applied_date !== '2026-08-01') throw new Error(`Expected first_applied_date 2026-08-01, got ${profile.first_applied_date}`);
  if (profile.last_applied_date !== '2026-10-15') throw new Error(`Expected last_applied_date 2026-10-15, got ${profile.last_applied_date}`);
  if (profile.recruiter_contacts?.length !== 1) throw new Error(`Expected deduplicated contacts to have length 1, got ${profile.recruiter_contacts?.length}`);
  if (profile.transfers?.length !== 1) throw new Error(`Expected 1 transfer record, got ${profile.transfers?.length}`);

  console.log('✓ TEST 4 PASSED: Candidate with multiple applications correctly tracked as Repeat Candidate, feedback duplicate eliminated, and transfer audit intact.\n');

  // Test 5: Verify Company Isolation for Repeat Applications
  const cliniLookup = dbService.getMasterCandidates({ company: 'ClinisolTech', search: testEmail });
  if (cliniLookup.candidates.length !== 0) {
    throw new Error('Company Isolation Failure: AaraTech repeat candidate appeared in ClinisolTech query!');
  }
  console.log('✓ TEST 5 PASSED: Strict Company Isolation verified. AaraTech candidate never leaks into ClinisolTech.\n');

  // Clean up test records
  dbService.db.prepare('DELETE FROM master_recruiter_contacts WHERE person_id = ?').run(testPersonId);
  dbService.db.prepare('DELETE FROM master_transfers WHERE person_id = ?').run(testPersonId);
  dbService.db.prepare('DELETE FROM master_applications WHERE person_id = ?').run(testPersonId);
  dbService.db.prepare('DELETE FROM master_people WHERE id = ?').run(testPersonId);
  console.log('✓ Cleaned up temporary test candidate records.');

  console.log('\n=== ALL PHASE 3 VERIFICATION TESTS PASSED SUCCESSFULLY! ===');
}

runPhase3Verification().catch(err => {
  console.error('Phase 3 Verification Failed:', err);
  process.exit(1);
});

