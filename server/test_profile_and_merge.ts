import { dbService } from './db.js';
import { classifyUrl } from '../src/shared/urlClassifier.js';

async function runProfileAndMergeTests() {
  console.log('================================================================');
  console.log('   MASTER CANDIDATE PROFILE & TWO-FILE MERGE TEST SUITE');
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

  // --- 1. Clean Slate for Testing ---
  console.log('Cleaning master database for fresh test run...');
  dbService.clearAllMasterData();

  const countPeople = () => ((dbService as any).db.prepare('SELECT COUNT(*) as c FROM master_people').get().c);
  const countApps = () => ((dbService as any).db.prepare('SELECT COUNT(*) as c FROM master_applications').get().c);
  const countAssignments = () => ((dbService as any).db.prepare('SELECT COUNT(*) as c FROM master_recruiter_assignments').get().c);
  const countContacts = () => ((dbService as any).db.prepare('SELECT COUNT(*) as c FROM master_recruiter_contacts').get().c);

  assert(countPeople() === 0, 'Initial master people count is 0');
  assert(countApps() === 0, 'Initial master applications count is 0');

  // --- 2. Synthetic Data Fixtures based on User Files ---
  // File 1 Sample (14 candidates from LinkedIn intake on 25-Aug-2026)
  const file1Candidates = [
    {
      full_name: 'rushil kosaraju',
      primary_email: 'rushilkosaraju2@gmail.com',
      primary_phone: '2143349058',
      job_title: 'CyberSecurity',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/1gfC3wvRcu2l7EAKCxpVih-g9GRSTkDac/view?usp=drivesdk',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_1_LinkedIn_Collection.xlsx',
      source_row: 2,
    },
    {
      full_name: 'Muhammad Nasir',
      primary_email: 'bilal.n221@gmail.com',
      primary_phone: '5719929598',
      job_title: 'CyberSecurity',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/1nALNkUkinZUlDV6tCJsl6CScqeTCRt3o/view?usp=drivesdk',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_1_LinkedIn_Collection.xlsx',
      source_row: 3,
    },
    {
      full_name: 'Mohammed Aijaz Hussain',
      primary_email: 'mhdaijaz.hussain@gmail.com',
      primary_phone: '3128014296',
      job_title: 'CyberSecurity',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/1jSWaUjBecY9ChG_owvAuK9f55bWIX79e/view?usp=drivesdk',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_1_LinkedIn_Collection.xlsx',
      source_row: 4,
    },
    {
      full_name: 'Siddhartha Nandiraju',
      primary_email: 'vvssiddhartha@gmail.com',
      primary_phone: '205479189',
      job_title: 'CyberSecurity',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/12yHx54AQlgAlh-b7VihE64DxZo-vESi-/view?usp=drivesdk',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_1_LinkedIn_Collection.xlsx',
      source_row: 5,
    },
    {
      full_name: 'Atharva Shinde',
      primary_email: 'atharva9803@gmail.com',
      primary_phone: '6465845923',
      job_title: 'CyberSecurity',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/1cegRC--ELt_ObNXs6rrQHll1RFVBVYQa/view?usp=drivesdk',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_1_LinkedIn_Collection.xlsx',
      source_row: 6,
    },
    {
      full_name: 'Safwan Azam Ashraf',
      primary_email: 'safwanazam99@gmail.com',
      primary_phone: '9132957237',
      job_title: 'CyberSecurity',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/1lufkuBvy9c0DG7O9-UwHpqM9j-Rj1Hcp/view?usp=drivesdk',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_1_LinkedIn_Collection.xlsx',
      source_row: 7,
    },
    {
      full_name: 'Yusuf Ahmedjeelani',
      primary_email: 'yusuf.k.a@outlook.com',
      primary_phone: '8479226947',
      job_title: 'CyberSecurity',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/1qO2m4bYY02lehtHhf5Pc4CfqiNWKNC8y/view?usp=drivesdk',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_1_LinkedIn_Collection.xlsx',
      source_row: 8,
    },
    {
      full_name: 'Adnan Khan',
      primary_email: 'fahadkhan94957@gmail.com',
      primary_phone: '8722436374',
      job_title: 'AWS',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/1WANc57jtEtliXwXBoxVhMqX9gNr5nG_f/view?usp=drivesdk',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_1_LinkedIn_Collection.xlsx',
      source_row: 9,
    },
    {
      full_name: 'RAHMAN SHAREEF',
      primary_email: 'mohammabdrah234@gmail.com',
      primary_phone: '2248173474',
      job_title: 'AWS',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/1uSK9QPIi0lgmBd4RHpHcfulrXFroMfGX/view?usp=drivesdk',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_1_LinkedIn_Collection.xlsx',
      source_row: 10,
    },
    {
      full_name: 'Anoop Mathew',
      primary_email: 'anoopkmathew4u@gmail.com',
      primary_phone: '3015251447',
      job_title: 'AWS',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/111QpM9fDAk6aexn6UBaN6e-2jnbAWBmu/view?usp=drivesdk',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_1_LinkedIn_Collection.xlsx',
      source_row: 11,
    },
    {
      full_name: 'Srinu S',
      primary_email: 'sai.srinu270501@gmail.com',
      primary_phone: '6862074719',
      job_title: 'AWS',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/1BGnvbNk3TomGWWOP-jWDRavwZiYtTfXv/view?usp=drivesdk',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_1_LinkedIn_Collection.xlsx',
      source_row: 12,
    },
    {
      full_name: 'Bipin Sai Yadav Jala',
      primary_email: 'jalabipinsaiyadav45@gmail.com',
      primary_phone: '2199003536',
      job_title: 'AWS',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/1E_akX6D4iy5jGQ93cTraeQPPbYMLm_Sq/view?usp=drivesdk',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_1_LinkedIn_Collection.xlsx',
      source_row: 13,
    },
    {
      full_name: 'Manthan Patel',
      primary_email: 'patelmanthan265@gmail.com',
      primary_phone: '8642548951',
      job_title: 'AWS',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/1uQHrhAg6VMGFrr8LSht6rMwSi9wEbkuM/view?usp=drivesdk',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_1_LinkedIn_Collection.xlsx',
      source_row: 14,
    },
    {
      full_name: 'Vishal Raj',
      primary_email: 'jamalpurvishalraj50@gmail.com',
      primary_phone: '9013521225',
      job_title: 'AWS',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/12r8CZuU-dhKUCrkREjSePOLltmx3h7c-/view?usp=drivesdk',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_1_LinkedIn_Collection.xlsx',
      source_row: 15,
    },
  ];

  // File 2 Sample (24 candidates: 14 matching from File 1 + 10 new candidates on 26-Aug-2026)
  const file2Candidates = [
    // Merging 14 candidates from File 1
    {
      full_name: 'rushil kosaraju',
      primary_email: 'rushilkosaraju2@gmail.com',
      primary_phone: '2143349058',
      job_title: 'CyberSecurity',
      recruiter: 'uday',
      feedback_1: 'Calling',
      feedback_2: 'USC,6-7 Years, Z+ Secuirty 3+years Expiered,Dallas TX,Will to Relocation ,$65-$70K per anum,2003',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 2,
    },
    {
      full_name: 'Muhammad Nasir',
      primary_email: 'bilal.n221@gmail.com',
      primary_phone: '5719929598',
      job_title: 'CyberSecurity',
      recruiter: 'sia',
      feedback_1: '4. Not Interested',
      feedback_2: 'Repeated, Already done with assessment. DOB:2003',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 3,
    },
    {
      full_name: 'Mohammed Aijaz Hussain',
      primary_email: 'mhdaijaz.hussain@gmail.com',
      primary_phone: '3128014296',
      job_title: 'CyberSecurity',
      recruiter: 'yesh',
      feedback_1: '4. Not Interested',
      feedback_2: 'Not Intrested',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 4,
    },
    {
      full_name: 'Siddhartha Nandiraju',
      primary_email: 'vvssiddhartha@gmail.com',
      primary_phone: '205479189',
      job_title: 'CyberSecurity',
      recruiter: 'sharma',
      feedback_1: 'Calling',
      feedback_2: 'Got Only 9 numbers',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 5,
    },
    {
      full_name: 'Atharva Shinde',
      primary_email: 'atharva9803@gmail.com',
      primary_phone: '6465845923',
      job_title: 'CyberSecurity',
      recruiter: 'uday',
      feedback_1: 'Calling',
      feedback_2: 'he is Busy , Cb after Some Time',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 6,
    },
    {
      full_name: 'Safwan Azam Ashraf',
      primary_email: 'safwanazam99@gmail.com',
      primary_phone: '9132957237',
      job_title: 'CyberSecurity',
      recruiter: 'sia',
      feedback_1: '4. Not Interested',
      feedback_2: 'OPT, not looking for market',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 7,
    },
    {
      full_name: 'Yusuf Ahmedjeelani',
      primary_email: 'yusuf.k.a@outlook.com',
      primary_phone: '8479226947',
      job_title: 'CyberSecurity',
      recruiter: 'yesh',
      feedback_1: '4. Not Interested',
      feedback_2: 'LVM USC 2004 born',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 8,
    },
    {
      full_name: 'Adnan Khan',
      primary_email: 'fahadkhan94957@gmail.com',
      primary_phone: '8722436374',
      job_title: 'AWS',
      recruiter: 'sharma',
      feedback_1: '3.VM',
      feedback_2: 'GC EAD 09 - IL - IN - MI - MN - AR - MISSORUI - Bachlors - 2018 - aws - 3 years - Devops - 6 years',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 9,
    },
    {
      full_name: 'RAHMAN SHAREEF',
      primary_email: 'mohammabdrah234@gmail.com',
      primary_phone: '2248173474',
      job_title: 'AWS',
      recruiter: 'uday',
      feedback_1: '4. Not Interested',
      feedback_2: 'Not interested in marketing',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 10,
    },
    {
      full_name: 'Anoop Mathew',
      primary_email: 'anoopkmathew4u@gmail.com',
      primary_phone: '3015251447',
      job_title: 'AWS',
      recruiter: 'sia',
      feedback_1: '2. Prospective - D',
      feedback_2: 'GC, 4yrs, MD',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 11,
    },
    {
      full_name: 'Srinu S',
      primary_email: 'sai.srinu270501@gmail.com',
      primary_phone: '6862074719',
      job_title: 'AWS',
      recruiter: 'yesh',
      feedback_1: '4. Not Interested',
      feedback_2: 'LVM No Answer With Employer',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 12,
    },
    {
      full_name: 'Bipin Sai Yadav Jala',
      primary_email: 'jalabipinsaiyadav45@gmail.com',
      primary_phone: '2199003536',
      job_title: 'AWS',
      recruiter: 'sharma',
      feedback_1: '4. Not Interested',
      feedback_2: 'Not Intrested OPT - Not Intrested.',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 13,
    },
    {
      full_name: 'Manthan Patel',
      primary_email: 'patelmanthan265@gmail.com',
      primary_phone: '8642548951',
      job_title: 'AWS',
      recruiter: 'uday',
      feedback_1: '3.VM',
      feedback_2: 'he will check the email abd CB',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 14,
    },
    {
      full_name: 'Vishal Raj',
      primary_email: 'jamalpurvishalraj50@gmail.com',
      primary_phone: '9013521225',
      job_title: 'AWS',
      recruiter: 'sia',
      feedback_1: '4. Not Interested',
      feedback_2: 'GC, have own corp, asked for mail',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 15,
    },

    // 10 Additional Candidates from File 2 on 26-Aug-2026
    {
      full_name: 'Karan',
      primary_email: 'kjsarao2002@gmail.com',
      primary_phone: '2106056603',
      job_title: 'CyberSecurity',
      recruiter: 'uday',
      feedback_1: '3.VM',
      feedback_2: 'No mail Box',
      recruiter_assigned_date: '2026-08-26',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 16,
    },
    {
      full_name: 'Rahul Reddy',
      primary_email: 'rrrbuthkur@gmail.com',
      primary_phone: '3185230353',
      job_title: 'CyberSecurity',
      recruiter: 'sia',
      feedback_1: '4. Not Interested',
      feedback_2: 'disconnected',
      recruiter_assigned_date: '2026-08-26',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 17,
    },
    {
      full_name: 'Jishnu Sivaprasad',
      primary_email: 'jishnu.sivapra@gmail.com',
      primary_phone: '6365156242',
      job_title: 'CyberSecurity',
      recruiter: 'yesh',
      feedback_1: '1. Invalid number',
      feedback_2: 'Wrong number',
      recruiter_assigned_date: '2026-08-26',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 18,
    },
    {
      full_name: 'Manish Thanoj',
      primary_email: 'manishthanoj@gmail.com',
      primary_phone: '7036753732',
      job_title: 'CyberSecurity',
      recruiter: 'sharma',
      feedback_1: '3.VM',
      feedback_2: 'VM VM VM VM',
      recruiter_assigned_date: '2026-08-26',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 19,
    },
    {
      full_name: 'Rajanikanth Sumbet',
      primary_email: 'sumbetraj@gmail.com',
      primary_phone: '9253892425',
      job_title: 'CyberSecurity',
      recruiter: 'uday',
      feedback_1: '4. Not Interested',
      feedback_2: 'Not looking for any opportunity',
      recruiter_assigned_date: '2026-08-26',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 20,
    },
    {
      full_name: 'Abhi N.',
      primary_email: 'abhimehta4553@gmail.com',
      primary_phone: '6823923024',
      job_title: 'CyberSecurity',
      recruiter: 'sia',
      feedback_1: '3.VM',
      feedback_2: "Said he'll CB",
      recruiter_assigned_date: '2026-08-26',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 21,
    },
    {
      full_name: 'Sanjay Reddy Gunnam',
      primary_email: 'gunnamsanjayreddy14@gmail.com',
      primary_phone: '2818324345',
      job_title: 'CyberSecurity',
      recruiter: 'yesh',
      feedback_1: '4. Not Interested',
      feedback_2: '',
      recruiter_assigned_date: '2026-08-26',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 22,
    },
    {
      full_name: 'Raj Jagtap',
      primary_email: 'raj.j@protectmymails.com',
      primary_phone: '2692076230',
      job_title: 'CyberSecurity',
      recruiter: 'sharma',
      feedback_1: '4. Not Interested',
      feedback_2: 'Having An Employer Having An Employer.',
      recruiter_assigned_date: '2026-08-26',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 23,
    },
    {
      full_name: 'Rajesh Pabboju',
      primary_email: 'rajesh.pabboju17@gmail.com',
      primary_phone: '3145810610',
      job_title: 'AWS',
      recruiter: 'uday',
      feedback_1: '4. Not Interested',
      feedback_2: 'OPT EAD - SEP 2027.',
      recruiter_assigned_date: '2026-08-26',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 24,
    },
    {
      full_name: 'Vinay Kumar Kadam',
      primary_email: 'kadamvinaykumar19@gmail.com',
      primary_phone: '6123562456',
      job_title: 'AWS',
      recruiter: 'sia',
      feedback_1: '4. Not Interested',
      feedback_2: 'STEM OPT, need sometime',
      recruiter_assigned_date: '2026-08-26',
      company: 'AaraTech' as const,
      source_file: 'File_2_Recruiter_Feedback.xlsx',
      source_row: 25,
    },
  ];

  // --- TEST CASE 1: Ingest File 1 (14 Candidates) ---
  console.log('\n--- Test Phase 1: Ingesting File 1 (14 LinkedIn Collection records) ---');
  const res1 = dbService.upsertMasterCandidatesBatch(file1Candidates, 'AaraTech');
  assert(res1.upserted === 14, 'Batch 1 upserted 14 candidates');
  assert(countPeople() === 14, 'Total master people count is exactly 14');
  assert(countApps() === 14, 'Total master applications count is exactly 14');

  // Verify first candidate fields
  const rushil1 = dbService.getMasterCandidateById(res1.peopleIds[0]);
  assert(rushil1 !== null, 'Candidate Rushil exists in master DB');
  assert(rushil1.green_card === 'Yes', 'Rushil has green_card = "Yes"');
  assert(rushil1.h1b_status === 'No', 'Rushil has h1b_status = "No"');
  assert(rushil1.application_collected_date === '2026-08-25', 'Rushil collection date is 2026-08-25');
  assert(rushil1.resume_url?.includes('drive.google.com'), 'Rushil resume_url contains drive.google.com link');
  assert(rushil1.applications.length === 1, 'Rushil has exactly 1 application');

  // --- TEST CASE 2: Ingest File 2 (24 Candidates including the 14 from File 1) ---
  console.log('\n--- Test Phase 2: Ingesting File 2 (24 Recruiter Feedback records) ---');
  const res2 = dbService.upsertMasterCandidatesBatch(file2Candidates, 'AaraTech');
  
  // Total people MUST be 24 (14 merged + 10 new)
  assert(countPeople() === 24, `Total master people is EXACTLY 24 (actual: ${countPeople()})`);
  // Total applications MUST be 24 (the 14 matching candidates must NOT get duplicate applications!)
  assert(countApps() === 24, `Total master applications is EXACTLY 24 (actual: ${countApps()})`);

  // Verify merged candidate #1 (Rushil)
  const rushilMerged = dbService.getMasterCandidateById(rushil1.id);
  assert(rushilMerged !== null, 'Rushil profile fetched successfully after merge');
  assert(rushilMerged.applications.length === 1, `Rushil STILL has exactly 1 application (not duplicated, actual: ${rushilMerged.applications.length})`);
  assert(rushilMerged.green_card === 'Yes', 'Rushil preserved green_card = "Yes" despite blank in File 2');
  assert(rushilMerged.h1b_status === 'No', 'Rushil preserved h1b_status = "No" despite blank in File 2');
  assert(rushilMerged.resume_url?.includes('drive.google.com'), 'Rushil preserved resume_url despite blank in File 2');
  assert(rushilMerged.current_owner === 'uday', 'Rushil current owner set to "uday" from File 2');
  assert(rushilMerged.assignments.length >= 1, 'Rushil has recruiter assignment recorded');
  assert(rushilMerged.assignments.some(a => a.recruiter_name === 'uday'), 'Recruiter assignment record specifies "uday"');
  assert(rushilMerged.recruiter_contacts.length >= 1, 'Rushil has recruiter contact recorded');
  const rushilContact = rushilMerged.recruiter_contacts[0];
  assert(rushilContact.feedback_1 === 'Calling', 'Contact feedback_1 is "Calling"');
  assert(rushilContact.feedback_2?.includes('Z+ Secuirty'), 'Contact feedback_2 preserves verbatim feedback text');

  // Verify candidate #2 (Muhammad Nasir)
  const nasir = dbService.getMasterCandidates('AaraTech').candidates.find(c => c.primary_email === 'bilal.n221@gmail.com');
  assert(nasir !== undefined, 'Muhammad Nasir profile exists');
  assert(nasir?.applications?.length === 1, 'Muhammad Nasir has exactly 1 application');
  assert(nasir?.green_card === 'Yes', 'Muhammad Nasir preserved green_card = "Yes"');
  assert(nasir?.current_owner === 'sia', 'Muhammad Nasir recruiter owner is "sia"');
  const nasirFull = dbService.getMasterCandidateById(nasir!.id);
  assert(nasirFull?.recruiter_contacts[0]?.feedback_1 === '4. Not Interested', 'Muhammad Nasir feedback_1 is "4. Not Interested"');
  assert(nasirFull?.recruiter_contacts[0]?.feedback_2?.includes('Already done with assessment'), 'Muhammad Nasir feedback_2 preserved verbatim');

  // Verify new candidate #15 (Karan) from File 2
  const karan = dbService.getMasterCandidates('AaraTech').candidates.find(c => c.primary_email === 'kjsarao2002@gmail.com');
  assert(karan !== undefined, 'Karan profile created from File 2');
  assert(karan?.current_owner === 'uday', 'Karan recruiter is "uday"');
  assert(karan?.applications?.length === 1, 'Karan has exactly 1 application');

  // --- TEST CASE 3: Idempotency (Re-import File 1) ---
  console.log('\n--- Test Phase 3: Idempotency Test (Re-importing File 1) ---');
  const res3 = dbService.upsertMasterCandidatesBatch(file1Candidates, 'AaraTech');
  assert(countPeople() === 24, `People count remains 24 after re-importing File 1 (actual: ${countPeople()})`);
  assert(countApps() === 24, `Applications count remains 24 after re-importing File 1 (actual: ${countApps()})`);

  // --- TEST CASE 4: Idempotency (Re-import File 2) ---
  console.log('\n--- Test Phase 4: Idempotency Test (Re-importing File 2) ---');
  const res4 = dbService.upsertMasterCandidatesBatch(file2Candidates, 'AaraTech');
  assert(countPeople() === 24, `People count remains 24 after re-importing File 2 (actual: ${countPeople()})`);
  assert(countApps() === 24, `Applications count remains 24 after re-importing File 2 (actual: ${countApps()})`);

  // --- TEST CASE 5: Legitimate Distinct Application for Different Role ---
  console.log('\n--- Test Phase 5: Preserving Distinct Application for Different Role ---');
  const distinctAppCandidate = [
    {
      full_name: 'rushil kosaraju',
      primary_email: 'rushilkosaraju2@gmail.com',
      primary_phone: '2143349058',
      job_title: 'Cloud Architect', // Genuinely different role
      green_card: 'Yes',
      h1b_status: 'No',
      company: 'AaraTech' as const,
      source_file: 'Cloud_Architecture_Applications.xlsx',
      source_row: 2,
    },
  ];
  dbService.upsertMasterCandidatesBatch(distinctAppCandidate, 'AaraTech');
  assert(countPeople() === 24, 'People count remains 24 (same person)');
  assert(countApps() === 25, `Applications count increased to 25 for different role (actual: ${countApps()})`);
  const rushil2Apps = dbService.getMasterCandidateById(rushil1.id);
  assert(rushil2Apps.applications.length === 2, 'Rushil now has 2 distinct applications for different roles');

  // --- TEST CASE 6: Strict URL Classification Rules ---
  console.log('\n--- Test Phase 6: URL Classification Rules ---');
  const resumeClass = classifyUrl('https://drive.google.com/file/d/1gfC3wvRcu2l7EAKCxpVih-g9GRSTkDac/view?usp=drivesdk');
  assert(resumeClass.type === 'resume', 'drive.google.com URL classified as "resume"');

  const linkedinClass = classifyUrl('https://www.linkedin.com/in/rushil-kosaraju-983b271a0/');
  assert(linkedinClass.type === 'linkedin', 'linkedin.com URL classified as "linkedin"');

  const unclassifiedClass = classifyUrl('https://github.com/rushil-kosaraju');
  assert(unclassifiedClass.type === 'unclassified', 'github.com URL classified as "unclassified" (preserved without guessing)');

  // --- TEST CASE 7: Company Isolation ---
  console.log('\n--- Test Phase 7: Strict Company Isolation ---');
  const cliniCandidate = [
    {
      full_name: 'Rushil Kosaraju Clini',
      primary_email: 'rushil.clini@gmail.com',
      primary_phone: '2143349099',
      job_title: 'Clinical Data Manager',
      company: 'ClinisolTech' as const,
      source_file: 'Clinisol_Intake.xlsx',
      source_row: 2,
    },
  ];
  dbService.upsertMasterCandidatesBatch(cliniCandidate, 'ClinisolTech');
  const aaraCandidates = dbService.getMasterCandidates('AaraTech').candidates;
  const cliniCandidates = dbService.getMasterCandidates('ClinisolTech').candidates;
  assert(aaraCandidates.length === 24, `AaraTech has exactly 24 candidates (actual: ${aaraCandidates.length})`);
  assert(cliniCandidates.length === 1, `ClinisolTech has exactly 1 candidate (actual: ${cliniCandidates.length})`);
  assert(aaraCandidates.every(c => c.company === 'AaraTech'), 'All AaraTech candidates belong to AaraTech');
  assert(cliniCandidates.every(c => c.company === 'ClinisolTech'), 'All ClinisolTech candidates belong to ClinisolTech');

  // --- TEST CASE 8: Reverse Order Test (File 2 followed by File 1) ---
  console.log('\n--- Test Phase 8: Reverse Ingestion Order Test (File 2 followed by File 1) ---');
  const reverseFile2 = [
    {
      full_name: 'Priya Sharma',
      primary_email: 'priya.sharma992@gmail.com',
      primary_phone: '9845012345',
      job_title: 'Full Stack Engineer',
      recruiter: 'uday',
      feedback_1: 'Calling',
      feedback_2: 'Interested in frontend roles',
      recruiter_assigned_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'Reverse_File2.xlsx',
      source_row: 2,
    },
  ];
  const revRes1 = dbService.upsertMasterCandidatesBatch(reverseFile2, 'AaraTech');
  const priyaAfterFile2 = dbService.getMasterCandidateById(revRes1.peopleIds[0]);
  assert(priyaAfterFile2.current_owner === 'uday', 'Priya has recruiter = uday from File 2');

  const reverseFile1 = [
    {
      full_name: 'Priya Sharma',
      primary_email: 'priya.sharma992@gmail.com',
      primary_phone: '9845012345',
      job_title: 'Full Stack Engineer',
      green_card: 'Yes',
      h1b_status: 'No',
      resume_url: 'https://drive.google.com/file/d/priya_resume/view',
      application_collected_date: '2026-08-25',
      company: 'AaraTech' as const,
      source_file: 'Reverse_File1.xlsx',
      source_row: 2,
    },
  ];
  const revRes2 = dbService.upsertMasterCandidatesBatch(reverseFile1, 'AaraTech');
  const priyaAfterFile1 = dbService.getMasterCandidateById(revRes1.peopleIds[0]);
  assert(priyaAfterFile1.green_card === 'Yes', 'Priya enriched with green_card = "Yes" from File 1');
  assert(priyaAfterFile1.h1b_status === 'No', 'Priya enriched with h1b_status = "No" from File 1');
  assert(priyaAfterFile1.resume_url?.includes('drive.google.com'), 'Priya enriched with resume_url from File 1');
  assert(priyaAfterFile1.current_owner === 'uday', 'Priya preserved recruiter = uday from File 2');
  assert(priyaAfterFile1.applications.length === 1, 'Priya has exactly 1 application after both file imports');

  // --- Final Results Summary ---
  console.log('\n================================================================');
  console.log(`   TEST RUN COMPLETED: ${passed}/${total} TESTS PASSED (${Math.round((passed/total)*100)}%)`);
  console.log('================================================================\n');

  if (passed === total) {
    console.log('ALL TESTS PASSED PERFECTLY!');
  } else {
    console.error(`FAILED ${total - passed} TESTS.`);
    process.exit(1);
  }
}

runProfileAndMergeTests().catch((err) => {
  console.error('Test runner encountered unexpected error:', err);
  process.exit(1);
});
