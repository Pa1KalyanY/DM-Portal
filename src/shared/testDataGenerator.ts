import * as XLSX from 'xlsx';

/**
 * Generates the Acceptance Test scenario files specified in Section 36 of the specification
 */
export function generateAcceptanceTestFiles(): {
  fileA: { name: string; blob: Blob };
  fileB: { name: string; blob: Blob };
  fileC: { name: string; blob: Blob };
} {
  // File A
  const dataA = [
    {
      'Full Name': 'John Smith',
      'Email': 'john@gmail.com',
      'Phone': '214-334-9058',
      'Company': 'AaraTech',
      'Job Title': 'Data Analyst',
      'Application Date': '2025-01-01',
      'Recruiter': 'Recruiter A',
      'Recruiter Feedback': 'LVM',
      'Resume Link': 'https://drive.google.com/file/d/john-smith-da-2025',
    },
    {
      'Full Name': 'Priya Patel',
      'Email': 'priya.patel@biopharm.com',
      'Phone': '408-555-9012',
      'Company': 'ClinisolTech',
      'Job Title': 'Clinical Research Associate (CRA)',
      'Application Date': '2025-02-14',
      'Recruiter': 'Sarah Jenkins',
      'Recruiter Feedback': 'Phase II Oncology experience, Good communication',
      'Resume Link': 'https://drive.google.com/file/d/priya-patel-cra',
    },
    {
      'Full Name': 'Michael Chang',
      'Email': 'm.chang@cloudcore.net',
      'Phone': '415-321-7788',
      'Company': 'AaraTech',
      'Job Title': 'Cloud DevOps Architect',
      'Application Date': '2025-03-20',
      'Recruiter': 'Adam',
      'Recruiter Feedback': 'AWS Certified Solutions Architect, negotiable on rate',
      'Resume Link': '',
    }
  ];

  // File B (Contains John Smith with different email but SAME normalized phone -> Should match!)
  const dataB = [
    {
      'Full Name': 'John Smith',
      'Email': 'john2@gmail.com',
      'Phone': '2143349058',
      'Company': 'AaraTech',
      'Job Title': 'CyberSecurity Specialist',
      'Application Date': '2026-08-15',
      'Recruiter': 'Recruiter B',
      'Recruiter Feedback': 'JD sent',
      'Resume Link': 'https://drive.google.com/file/d/john-smith-cyber-2026',
    },
    {
      'Full Name': 'Aisha Al-Mansoor',
      'Email': 'aisha.mansoor@genomics.org',
      'Phone': '+1 (617) 890-4411',
      'Company': 'ClinisolTech',
      'Job Title': 'Biostatistician',
      'Application Date': '2026-08-18',
      'Recruiter': 'Sarah Jenkins',
      'Recruiter Feedback': 'Strong SAS/R skill set. Needs H1B sponsorship.',
      'Resume Link': 'https://drive.google.com/file/d/aisha-stat-resume',
    }
  ];

  // File C (Contains John Smith with DIFFERENT phone and DIFFERENT email -> Should NOT auto-merge!)
  const dataC = [
    {
      'Full Name': 'John Smith',
      'Email': 'smith_other@example.com',
      'Phone': '469-555-0199',
      'Company': 'ClinisolTech',
      'Job Title': 'Biostatistician',
      'Application Date': '2026-09-10',
      'Recruiter': 'Recruiter C',
      'Recruiter Feedback': 'No answer',
      'Resume Link': 'https://drive.google.com/file/d/john-smith-biostat-alt',
    },
    {
      'Full Name': 'David O\'Connor',
      'Email': 'doconnor@apexsystems.com',
      'Phone': '972-555-0182',
      'Company': 'AaraTech',
      'Job Title': 'Senior Full Stack Engineer',
      'Application Date': '2026-09-12',
      'Recruiter': 'Nicholas',
      'Recruiter Feedback': 'Interview scheduled for Tuesday 10am',
      'Resume Link': '',
    }
  ];

  const makeXlsxBlob = (data: any[]): Blob => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
    const u8 = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([u8], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  };

  return {
    fileA: { name: 'Section36_FileA_JohnSmith_Historical.xlsx', blob: makeXlsxBlob(dataA) },
    fileB: { name: 'Section36_FileB_JohnSmith_Cyber.xlsx', blob: makeXlsxBlob(dataB) },
    fileC: { name: 'Section36_FileC_JohnSmith_Unrelated.xlsx', blob: makeXlsxBlob(dataC) },
  };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
