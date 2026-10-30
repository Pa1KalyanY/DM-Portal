import * as XLSX from 'xlsx';

export type TargetColumn =
  | 'full_name'
  | 'first_name'
  | 'last_name'
  | 'email'
  | 'secondary_email'
  | 'phone'
  | 'secondary_phone'
  | 'location'
  | 'preferred_location'
  | 'job_title'
  | 'job_id'
  | 'company'
  | 'date_applied'
  | 'current_stage'
  | 'gender'
  | 'linkedin_url'
  | 'owner'
  | 'recruiter_feedback'
  | 'green_card_answer'
  | 'sponsorship_answer'
  | 'us_work_auth_answer'
  | 'resume_link'
  | 'ignore';

export interface ColumnMappingConfig {
  sourceColumn: string;
  targetColumn: TargetColumn;
  confidence: number;
  sampleValues: string[];
  warning?: string;
}

export interface WorkbookPreviewResult {
  fileName: string;
  fileType: 'xlsx' | 'xls' | 'csv' | 'tsv' | 'pasted';
  fileSize?: number;
  totalRows: number;
  validRowsEstimate: number;
  emptyRowsCount: number;
  headers: string[];
  sampleRows: Record<string, any>[];
  mappings: ColumnMappingConfig[];
  availableSheets: string[];
  selectedSheet: string;
  warnings: string[];
}

export const TARGET_COLUMN_METADATA: Record<TargetColumn, { label: string; category: string; description: string; required?: boolean }> = {
  full_name: { label: 'Candidate Full Name', category: 'Identity', description: 'Complete name of candidate (First + Last)', required: true },
  first_name: { label: 'First Name', category: 'Identity', description: 'Candidate given name' },
  last_name: { label: 'Last Name', category: 'Identity', description: 'Candidate family/surname' },
  email: { label: 'Primary Email', category: 'Contact', description: 'Primary candidate email address', required: true },
  secondary_email: { label: 'Secondary Email', category: 'Contact', description: 'Alternative email' },
  phone: { label: 'Primary Phone', category: 'Contact', description: 'Normalized phone number', required: true },
  secondary_phone: { label: 'Secondary Phone', category: 'Contact', description: 'Alternative phone' },
  job_title: { label: 'Job Role / Title', category: 'Application', description: 'Position applied for or role code (DA, AWS, etc.)' },
  job_id: { label: 'Job Requisition ID', category: 'Application', description: 'Unique job/slot code (e.g. AT-001, CT-001)' },
  company: { label: 'Company Entity', category: 'Application', description: 'Target company workspace (AaraTech or ClinisolTech)' },
  date_applied: { label: 'Application Date', category: 'Application', description: 'Original source application or processing date' },
  location: { label: 'Location (City, State)', category: 'Candidate Info', description: 'Current residence/metro area' },
  preferred_location: { label: 'Preferred Location / Relocation', category: 'Candidate Info', description: 'Desired work location or Open to US' },
  gender: { label: 'Gender', category: 'Candidate Info', description: 'Candidate gender (Male / Female / Unspecified)' },
  linkedin_url: { label: 'LinkedIn Profile URL', category: 'Candidate Info', description: 'Direct link to LinkedIn profile' },
  owner: { label: 'Assigned Recruiter / Owner', category: 'Recruitment', description: 'Recruiter handling lead (e.g. Adam, Alex)' },
  current_stage: { label: 'Application Stage', category: 'Recruitment', description: 'Workflow stage (Applied, Review, Shortlisted)' },
  recruiter_feedback: { label: 'Recruiter Feedback / Notes', category: 'Recruitment', description: 'Verbatim interview notes & touchpoint remarks' },
  green_card_answer: { label: 'GC / US Citizen Answer', category: 'Screening', description: 'Work authorization question (Yes / No)' },
  sponsorship_answer: { label: 'Visa Sponsorship Answer', category: 'Screening', description: 'Future visa sponsorship requirement (Yes / No)' },
  us_work_auth_answer: { label: 'US Work Auth Answer', category: 'Screening', description: 'Legally authorized to work in US (Yes / No)' },
  resume_link: { label: 'Resume Document Link', category: 'Recruitment', description: 'Google Drive, ATS or web resume URL' },
  ignore: { label: '— Ignore Column —', category: 'Special', description: 'Do not import this column' },
};

export const TECH_ROLES_SET = new Set([
  'da', 'ba', 'de', 'qa', 'pm', 'dev', 'sre', 'edi', 'aws', 'dotnet', '.net', 'java', 'python',
  'react', 'angular', 'fullstack', 'frontend', 'backend', 'devops', 'cloud', 'salesforce',
  'sap', 'oracle', 'sql', 'etl', 'data analyst', 'business analyst', 'data engineer',
  'software engineer', 'cyber security', 'cybersecurity', 'scrum master', 'tester', 'c#', 'c++', 'golang'
]);

export function isATSJobRoleTitle(val: any): boolean {
  if (!val) return false;
  const s = String(val).trim().toLowerCase();
  const clean = s.replace(/[^a-z0-9]/g, '');
  return TECH_ROLES_SET.has(clean) || TECH_ROLES_SET.has(s);
}

export function isDateString(val: any): boolean {
  if (!val) return false;
  const s = String(val).trim();
  if (/(feedback|notes?|remarks?|comments?|touchpoint|call|review|status|interview|candidate|owner|recruiter|job|role|email|phone|location|name|score|lead|gender|title|company|stage|\bfb\b)/i.test(s)) {
    return false;
  }
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) return true;
  if (/^\d{1,2}[-/][a-zA-Z]{3,9}[-/]\d{2,4}/.test(s)) return true;
  if (/^[a-zA-Z]{3,9}[-/]\d{1,2}[-/]\d{2,4}/.test(s)) return true;
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(s)) return true;
  if (/\b(19|20)\d{2}\b/.test(s)) {
    const d = new Date(s);
    return !isNaN(d.getTime()) && s.length >= 6 && /\d/.test(s);
  }
  return false;
}

export const COLUMN_PATTERNS: Record<TargetColumn, string[]> = {
  full_name: [
    'candidate full name', 'full name', 'candidate name', 'applicant name', 'name', 'applicant',
    'candidate', 'person name', 'lead name', 'contact name'
  ],
  first_name: ['first name', 'fname', 'given name', 'forename'],
  last_name: ['last name', 'lname', 'surname', 'family name'],
  email: [
    'email i d', 'email id', 'email', 'email address', 'primary email', 'e-mail', 'mail',
    'contact email', 'candidate email'
  ],
  secondary_email: ['secondary email', 'alternate email', 'alt email', 'other email', 'email 2'],
  phone: [
    'contact number', 'phone number', 'phone', 'contact', 'mobile', 'mobile number', 'cell',
    'cell phone', 'primary phone', 'telephone'
  ],
  secondary_phone: [
    'secondary phone', 'alternate phone', 'alt phone', 'other phone', 'phone 2', 'mobile 2', 'secondary contact'
  ],
  job_title: [
    'job title', 'role', 'position', 'job role', 'job', 'designation', 'title', 'opening',
    'req title', 'profile', 'da', 'ba', 'de', 'edi', 'aws', 'qa'
  ],
  job_id: ['job id', 'req id', 'requisition id', 'job code', 'requisition', 'req #', 'job #'],
  company: ['company', 'entity', 'organization', 'client', 'workspace', 'account'],
  date_applied: [
    'date assigned', 'date applied', 'application date', 'applied date', 'date', 'assigned date',
    'ingestion date', 'import date', 'timestamp', 'date today'
  ],
  location: [
    'location', 'city', 'state', 'current location', 'candidate location', 'city state',
    'city / state', 'city/state', 'metro', 'address', 'location / city / state', 'residence'
  ],
  preferred_location: [
    'preferred location', 'relocation', 'desired location', 'target location', 'preferred city',
    'relocate', 'open to relocate'
  ],
  gender: ['gender', 'sex', 'salutation', 'title', 'mr/ms', 'honorific'],
  linkedin_url: [
    'linkedin profile link', 'linkedin profile', 'linkedin url', 'linkedin', 'profile url',
    'profile link', 'linkedin link'
  ],
  owner: [
    'recruiter', 'recruiter name', 'recruiters', 'recuter', 'reciuter', 'ownwer',
    'owner', 'owners', 'owner name', 'assigned owner', 'assigned recruiter',
    'lead recruiter', 'lead owner', 'assigned to', 'assignee', 'sourcer',
    'recruiter owner', 'owner recruiter', 'recruiter/owner', 'owner/recruiter',
    'contacted by', 'interviewer', 'adam', 'alex'
  ],
  current_stage: ['current stage', 'stage', 'application stage', 'status', 'pipeline stage'],
  recruiter_feedback: [
    'original feedback', 'recruiter feedback', 'feedback', 'feedback 1', 'feedback 2', 'feedback 3', 'feedback1', 'feedback2',
    'fb', 'fb 1', 'fb 2', 'fb 3', 'fb1', 'fb2', 'fb3', 'f/b', 'f/b 1', 'f/b 2',
    'notes', 'note', 'notes 1', 'notes 2', 'recruiter notes', 'recruiter note', 'candidate notes',
    'remarks', 'remark', 'comments', 'comment', 'screening notes', 'screening note', 'screening', 'touchpoint',
    'touchpoints', 'touchpoint 1', 'summary notes', 'candidate feedback', 'candidate remarks',
    'status notes', 'contact notes', 'disposition', 'discussion', 'follow up', 'follow-up'
  ],
  green_card_answer: [
    'do you have a green card or us citizen', 'green card or us citizen', 'green card / us citizen',
    'green card / us-c', 'green card/us-c', 'gc / us-c', 'gc/us-c', 'green card', 'us citizen',
    'citizenship', 'work authorization citizen'
  ],
  sponsorship_answer: [
    'will you now, or in the future, require sponsorship for employment visa status',
    'require sponsorship', 'visa sponsorship', 'sponsorship requirement', 'sponsorship',
    'h1b', 'h-1b', 'h1b visa-y/n', 'h1b visa y/n', 'h1b visa'
  ],
  us_work_auth_answer: [
    'are you legally authorized to work in the united states', 'legally authorized to work',
    'authorized to work in us', 'us work auth', 'work authorization', 'work auth'
  ],
  resume_link: ['resume link', 'resume', 'cv link', 'cv', 'google drive link', 'resume url'],
  ignore: ['serial number', 's no', 'sno', 'sl no', 'id', '#', 'row', 'index']
};

/**
 * Automatically maps raw headers from uploaded file or text to normalized target columns
 */
export function autoDetectMappings(headers: string[], sampleRows: Record<string, any>[] = []): ColumnMappingConfig[] {
  return headers.map(header => {
    const cleanHeader = header
      .toLowerCase()
      .trim()
      .replace(/([a-z])(\d)/g, '$1 $2')
      .replace(/[_\W]+/g, ' ')
      .trim();

    let bestTarget: TargetColumn = 'ignore';
    let highestScore = 0;
    let reason = 'Default unmapped';

    // 0. Priority detection for Recruiter / Owner fields (including common typos e.g. recuter, reciuter, ownwer)
    if (
      /^(owner|recruiter|recuter|reciuter|ownwer|recruiter name|owner name|assigned owner|assigned recruiter|lead recruiter|lead owner|assigned to|assignee|recruiter owner|owner recruiter|sourcer)$/i.test(cleanHeader) ||
      (/\b(owner|recruiter|recuter|reciuter|ownwer)\b/i.test(cleanHeader) && !/(feedback|notes?|remarks?|comments?|touchpoint|round|screening)/i.test(cleanHeader))
    ) {
      bestTarget = 'owner';
      highestScore = 1.0;
      reason = 'Auto-detected Recruiter / Owner field';
    }

    // 1. Exact string matches against explicit patterns
    if (highestScore < 1.0) {
      for (const [target, patterns] of Object.entries(COLUMN_PATTERNS) as [TargetColumn, string[]][]) {
        for (const pattern of patterns) {
          if (cleanHeader === pattern) {
            bestTarget = target;
            highestScore = 1.0;
            reason = `Exact match for "${pattern}"`;
            break;
          }
        }
        if (highestScore === 1.0) break;
      }
    }

    // 2. Substring inclusion if no exact match
    if (highestScore < 1.0) {
      for (const [target, patterns] of Object.entries(COLUMN_PATTERNS) as [TargetColumn, string[]][]) {
        for (const pattern of patterns) {
          if (cleanHeader.includes(pattern)) {
            if (highestScore < 0.88) {
              bestTarget = target;
              highestScore = 0.88;
              reason = `Header contains "${pattern}"`;
            }
          } else if (cleanHeader.length >= 4 && pattern.includes(cleanHeader)) {
            if (highestScore < 0.72) {
              bestTarget = target;
              highestScore = 0.72;
              reason = `Header matches prefix/alias "${pattern}"`;
            }
          }
        }
      }
    }

    // Extract sample values from first 10 rows
    const sampleValues: string[] = [];
    for (const row of (sampleRows || []).slice(0, 10)) {
      const val = row[header];
      if (val !== undefined && val !== null && String(val).trim()) {
        sampleValues.push(String(val).trim());
      }
    }

    // 3. Secondary value-based content intelligence
    if (sampleValues.length > 0) {
      // Date value check
      if (sampleValues.some(v => isDateString(v)) && (highestScore < 0.95 || bestTarget === 'ignore')) {
        bestTarget = 'date_applied';
        highestScore = 0.95;
        reason = 'Sample values contain dates';
      }
      // Email format check
      else if (sampleValues.some(v => v.includes('@') && v.includes('.')) && (highestScore < 0.95 || bestTarget === 'ignore')) {
        bestTarget = 'email';
        highestScore = 0.98;
        reason = 'Sample values contain email addresses (@)';
      }
      // LinkedIn URL check
      else if (sampleValues.some(v => v.toLowerCase().includes('linkedin.com/in'))) {
        bestTarget = 'linkedin_url';
        highestScore = 0.98;
        reason = 'Sample values contain LinkedIn profile URLs';
      }
      // Phone digits check
      else if (sampleValues.some(v => v.replace(/\D/g, '').length >= 10) && bestTarget !== 'email' && bestTarget !== 'date_applied') {
        if (highestScore < 0.92) {
          bestTarget = 'phone';
          highestScore = 0.92;
          reason = 'Sample values contain 10+ phone digits';
        }
      }
      // Work Auth / Citizen / Sponsorship Yes/No values check
      else if (sampleValues.every(v => /^(yes|no|y|n|true|false)$/i.test(v))) {
        if (cleanHeader.includes('sponsor') || cleanHeader.includes('h1b')) {
          bestTarget = 'sponsorship_answer';
          highestScore = 0.95;
          reason = 'Sample values are Yes/No for Sponsorship';
        } else if (cleanHeader.includes('citizen') || cleanHeader.includes('green') || cleanHeader.includes('gc')) {
          bestTarget = 'green_card_answer';
          highestScore = 0.95;
          reason = 'Sample values are Yes/No for Green Card/Citizen';
        }
      }
      // Long sentences or feedback keywords & recruiter acronyms
      else if (
        sampleValues.some(v =>
          v.length > 20 ||
          /(opt|cpt|h1b|visa|citizen|green card|interview|call back|masters|desi|looking|package|\$|\blvm\b|left\s*vm|voicemail|jd\s*sent|no\s*answer|\brnr\b|not\s*interested|call\s*tomorrow|scheduled|attended|shortlisted|c2c|w2|\b1099\b)/i.test(v)
        )
      ) {
        if (bestTarget === 'ignore' || highestScore < 0.85) {
          bestTarget = 'recruiter_feedback';
          highestScore = 0.90;
          reason = 'Sample values contain recruiter feedback notes';
        }
      }
    }

    // 4. CRITICAL SAFEGUARD 1: ATS Job Role codes (DA, BA, AWS, EDI, QA) MUST NEVER be mapped to Candidate Name!
    if (bestTarget === 'full_name' && (isATSJobRoleTitle(cleanHeader) || sampleValues.some(v => isATSJobRoleTitle(v)))) {
      bestTarget = 'job_title';
      highestScore = 0.98;
      reason = 'Safeguard triggered: Role code prevented from mapping to Candidate Name';
    }

    // 5. CRITICAL SAFEGUARD 2: Do not map to email if samples lack @ and header does not say email
    const isExplicitEmailHeader = /(email|e-mail|e mail|\bmail\b)/i.test(cleanHeader);
    if (bestTarget === 'email' && !isExplicitEmailHeader && sampleValues.length > 0 && !sampleValues.some(v => v.includes('@'))) {
      bestTarget = 'ignore';
      highestScore = 0;
      reason = 'Safeguard triggered: Sample values lack @ symbol';
    }

    let warning: string | undefined;
    if (highestScore < 0.75 && bestTarget !== 'ignore') {
      warning = `Low confidence mapping (${Math.round(highestScore * 100)}%). Please verify.`;
    }

    return {
      sourceColumn: header,
      targetColumn: bestTarget,
      confidence: highestScore,
      sampleValues,
      warning,
    };
  });
}

/**
 * Parses raw array buffer of XLSX, XLS or CSV and provides preview with sheet selection
 */
export function parseWorkbookForPreview(
  data: ArrayBuffer | Uint8Array,
  fileName: string,
  selectedSheet?: string
): WorkbookPreviewResult {
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const availableSheets = workbook.SheetNames || [];
  
  if (availableSheets.length === 0) {
    throw new Error('Workbook contains no readable sheets.');
  }

  let targetSheetName = (selectedSheet && availableSheets.includes(selectedSheet))
    ? selectedSheet
    : availableSheets[0];

  // If first sheet has 0 rows, check if another sheet has data
  if (!selectedSheet && availableSheets.length > 1) {
    const firstSheet = workbook.Sheets[targetSheetName];
    const firstRows = XLSX.utils.sheet_to_json<Record<string, any>>(firstSheet, { defval: '' });
    if (firstRows.length === 0) {
      for (const sName of availableSheets) {
        const sSheet = workbook.Sheets[sName];
        const sRows = XLSX.utils.sheet_to_json<Record<string, any>>(sSheet, { defval: '' });
        if (sRows.length > 0) {
          targetSheetName = sName;
          break;
        }
      }
    }
  }

  const worksheet = workbook.Sheets[targetSheetName];
  if (!worksheet) {
    throw new Error(`Sheet "${targetSheetName}" could not be loaded.`);
  }

  // Convert worksheet to JSON rows
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
  
  // Detect empty rows
  let emptyRowsCount = 0;
  const filteredRows: Record<string, any>[] = [];

  for (const r of rawRows) {
    const hasValues = Object.values(r).some(v => v !== null && v !== undefined && String(v).trim().length > 0);
    if (!hasValues) {
      emptyRowsCount++;
    } else {
      filteredRows.push(r);
    }
  }

  if (filteredRows.length === 0) {
    throw new Error(`Sheet "${targetSheetName}" does not contain any application data rows.`);
  }

  const headers = Object.keys(filteredRows[0] || {});
  const sampleRows = filteredRows.slice(0, 10);
  const mappings = autoDetectMappings(headers, sampleRows);

  const fileExt = fileName.split('.').pop()?.toLowerCase() || '';
  const fileType: 'xlsx' | 'xls' | 'csv' | 'tsv' | 'pasted' =
    fileExt === 'csv' ? 'csv' : fileExt === 'xls' ? 'xls' : fileExt === 'tsv' ? 'tsv' : 'xlsx';

  const warnings: string[] = [];
  if (availableSheets.length > 1) {
    warnings.push(`Workbook contains ${availableSheets.length} sheets. You are currently viewing sheet: "${targetSheetName}".`);
  }
  if (emptyRowsCount > 0) {
    warnings.push(`Detected and automatically skipped ${emptyRowsCount} blank row(s).`);
  }

  const hasName = mappings.some(m => m.targetColumn === 'full_name');
  const hasContact = mappings.some(m => m.targetColumn === 'email' || m.targetColumn === 'phone');
  if (!hasName) {
    warnings.push('Warning: No column is mapped to Candidate Full Name. Please manually select the name column.');
  }
  if (!hasContact) {
    warnings.push('Warning: No column is mapped to Primary Email or Primary Phone. At least one contact field is required.');
  }

  return {
    fileName,
    fileType,
    totalRows: filteredRows.length,
    validRowsEstimate: filteredRows.length,
    emptyRowsCount,
    headers,
    sampleRows,
    mappings,
    availableSheets,
    selectedSheet: targetSheetName,
    warnings,
  };
}

/**
 * Parses pasted text (TSV or CSV or Block) and converts into workbook preview
 */
export function parsePastedTextForPreview(text: string, customLabel?: string): WorkbookPreviewResult {
  if (!text || !text.trim()) {
    throw new Error('Please paste text rows before previewing.');
  }

  const lines = text.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.length > 0);
  if (lines.length === 0) {
    throw new Error('Pasted text contains no valid lines.');
  }

  // Detect delimiter: tab or comma
  const firstLine = lines[0];
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount >= commaCount && tabCount > 0 ? '\t' : (commaCount > 0 ? ',' : '\t');

  let headers: string[] = [];
  let dataLines: string[] = [];

  // Determine if line 1 looks like headers or candidate row
  const firstTokens = firstLine.split(delimiter).map(t => t.trim().replace(/^["']|["']$/g, ''));
  const hasEmailOrPhoneInFirst = firstTokens.some(t => t.includes('@') || t.replace(/\D/g, '').length >= 10);

  if (hasEmailOrPhoneInFirst) {
    // Inferred headers based on column count
    headers = firstTokens.map((_, idx) => `Column_${idx + 1}`);
    dataLines = lines;
  } else {
    headers = firstTokens.map((t, idx) => t || `Column_${idx + 1}`);
    dataLines = lines.slice(1);
  }

  const rawRows: Record<string, any>[] = [];
  for (const line of dataLines) {
    if (!line.trim()) continue;
    const tokens = line.split(delimiter).map(t => t.trim().replace(/^["']|["']$/g, ''));
    const rowObj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = tokens[idx] !== undefined ? tokens[idx] : '';
    });
    rawRows.push(rowObj);
  }

  if (rawRows.length === 0) {
    throw new Error('Pasted text does not contain any application data rows.');
  }

  const sampleRows = rawRows.slice(0, 10);
  const mappings = autoDetectMappings(headers, sampleRows);
  const warnings: string[] = [];

  const hasName = mappings.some(m => m.targetColumn === 'full_name');
  const hasContact = mappings.some(m => m.targetColumn === 'email' || m.targetColumn === 'phone');
  if (!hasName) {
    warnings.push('Warning: No column is mapped to Candidate Full Name.');
  }
  if (!hasContact) {
    warnings.push('Warning: No column is mapped to Primary Email or Phone.');
  }

  return {
    fileName: customLabel || 'Pasted Application Rows',
    fileType: 'pasted',
    totalRows: rawRows.length,
    validRowsEstimate: rawRows.length,
    emptyRowsCount: 0,
    headers,
    sampleRows,
    mappings,
    availableSheets: ['Pasted_Data'],
    selectedSheet: 'Pasted_Data',
    warnings,
  };
}
