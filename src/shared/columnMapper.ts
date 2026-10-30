/**
 * Flexible LinkedIn Recruiter & Spreadsheets column mapping engine.
 * Matches common variations in column headers, while preserving original values.
 */

export interface ColumnDefinition {
  canonicalKey: string;
  label: string;
  patterns: (string | RegExp)[];
  isRequired?: boolean;
}

export const CANONICAL_COLUMNS: ColumnDefinition[] = [
  {
    canonicalKey: 'fullName',
    label: 'Full Name',
    patterns: ['full name', 'fullname', 'candidate name', 'applicant name', 'name', 'person name'],
  },
  {
    canonicalKey: 'firstName',
    label: 'First Name',
    patterns: ['first name', 'firstname', 'first_name', 'first', 'given name'],
  },
  {
    canonicalKey: 'lastName',
    label: 'Last Name',
    patterns: ['last name', 'lastname', 'last_name', 'last', 'surname', 'family name'],
  },
  {
    canonicalKey: 'email',
    label: 'Email Address',
    patterns: [
      'email address',
      'email',
      'emailaddress',
      'candidate email',
      'e-mail',
      "email i'd",
      'email id',
      'candidate email id',
      'e mail',
    ],
  },
  {
    canonicalKey: 'phone',
    label: 'Phone Number',
    patterns: [
      'phone number',
      'phone',
      'phonenumber',
      'mobile number',
      'mobile',
      'candidate phone',
      'cell phone',
      'telephone',
      'contact number',
      'contact no',
      'contact',
      'mobile no',
    ],
  },
  {
    canonicalKey: 'location',
    label: 'General Location',
    patterns: ['general location', 'location', 'candidate location', 'city, state', 'city', 'address', 'current location'],
  },
  {
    canonicalKey: 'zipCode',
    label: 'ZIP Code',
    patterns: ['zip code', 'zip', 'zipcode', 'postal code', 'postalcode'],
  },
  {
    canonicalKey: 'headline',
    label: 'Headline',
    patterns: ['headline', 'professional headline', 'candidate headline', 'summary'],
  },
  {
    canonicalKey: 'currentTitle',
    label: 'Current Title',
    patterns: ['current title', 'job title (current)', 'title', 'position', 'current position', 'most recent title'],
  },
  {
    canonicalKey: 'currentCompany',
    label: 'Current Company',
    patterns: ['current company', 'company', 'employer', 'current organization', 'most recent company', 'company name'],
  },
  {
    canonicalKey: 'currentPositionStartDate',
    label: 'Current Position Start Date',
    patterns: ['current position start date', 'position start date', 'start date'],
  },
  {
    canonicalKey: 'educationDegree',
    label: 'Education Degree',
    patterns: ['education degree', 'degree', 'degree name', 'highest degree', 'education'],
  },
  {
    canonicalKey: 'educationInstitution',
    label: 'Education Institution',
    patterns: ['education institution', 'institution', 'university', 'college', 'school'],
  },
  {
    canonicalKey: 'profileUrl',
    label: 'Profile URL',
    patterns: [
      'profile url',
      'linkedin url',
      'linkedin profile',
      'profile link',
      'url',
      'linkedin profile url',
      'resume link',
      'resume',
      'cv link',
      'cv',
      'attachment',
    ],
  },
  {
    canonicalKey: 'dateApplied',
    label: 'Date Applied',
    patterns: ['date applied', 'application date', 'applied date', 'created date', 'submission date', 'applied on', 'date'],
  },
  {
    canonicalKey: 'currentStage',
    label: 'Current Stage',
    patterns: ['current stage', 'stage', 'status', 'application stage', 'applicant stage', 'workflow stage'],
  },
  {
    canonicalKey: 'jobId',
    label: 'Job ID',
    patterns: ['job id', 'linkedin job id', 'job req id', 'requisition id', 'job number', 'jobid'],
  },
  {
    canonicalKey: 'jobTitle',
    label: 'Job Title',
    patterns: ['job title', 'position title', 'job name', 'requisition title', 'role', 'job role', 'jobtitle', 'designation'],
  },
  {
    canonicalKey: 'jobUrl',
    label: 'Job URL',
    patterns: ['job url', 'linkedin job url', 'job link'],
  },
  {
    canonicalKey: 'atsJobId',
    label: 'ATS Job ID',
    patterns: ['ats job id', 'internal job id', 'ats id', 'atsjobid'],
  },
  {
    canonicalKey: 'minSalary',
    label: 'Minimum Salary',
    patterns: ['minimum salary', 'min salary', 'salary min'],
  },
  {
    canonicalKey: 'maxSalary',
    label: 'Maximum Salary',
    patterns: ['maximum salary', 'max salary', 'salary max'],
  },
  {
    canonicalKey: 'currencyCode',
    label: 'Currency Code',
    patterns: ['currency code', 'currency'],
  },
  {
    canonicalKey: 'compensationPeriod',
    label: 'Compensation Period',
    patterns: ['compensation period', 'pay period', 'frequency'],
  },
  {
    canonicalKey: 'hiringProjectId',
    label: 'Hiring Project ID',
    patterns: ['hiring project id', 'project id'],
  },
  {
    canonicalKey: 'hiringProjectTitle',
    label: 'Hiring Project Title',
    patterns: ['hiring project title', 'project title', 'hiring project'],
  },
  {
    canonicalKey: 'contractId',
    label: 'Contract ID',
    patterns: ['contract id'],
  },
  {
    canonicalKey: 'contractName',
    label: 'Contract Name',
    patterns: ['contract name'],
  },
  {
    canonicalKey: 'greenCardCitizenAnswer',
    label: 'Green Card / US Citizen',
    patterns: [
      'do you have a green card or us citizen ?',
      'do you have a green card or us citizen',
      'green card/ us-c',
      'green card / us-c',
      'green card/us-c',
      'green card / us citizen',
      'green card or us citizen',
      'green card',
      'us-c',
      'us citizen',
      'gc/usc',
      'gc / usc',
      'gc',
      'usc',
      'citizenship',
      'permanent resident',
    ],
  },
  {
    canonicalKey: 'sponsorshipAnswer',
    label: 'Visa Sponsorship',
    patterns: [
      'will you now, or in the future, require sponsorship for employment visa status (e.g. h-1b visa status)?',
      'will you now, or in the future, require sponsorship for employment visa status (e.g. h-1b visa status)',
      'will you now, or in the future, require sponsorship',
      'require sponsorship for employment visa status',
      'h1b-y/n',
      'h1b y/n',
      'h1b (y/n)',
      'h1b',
      'h-1b',
      'visa sponsorship',
      'sponsorship required',
      'sponsorship',
      'require sponsorship',
      'require visa',
      'future sponsorship',
      'need sponsorship',
      'need visa',
    ],
  },
  {
    canonicalKey: 'usWorkAuthAnswer',
    label: 'US Work Authorization',
    patterns: [
      'work authorization',
      'work auth',
      'authorized to work',
      'legally authorized',
      'us work auth',
    ],
  },
  {
    canonicalKey: 'rawScreeningQuestions',
    label: 'Screening Questions',
    patterns: ['screening questions', 'screening question', 'application questions', 'pre-screening questions', 'screening', 'questions'],
  },
  {
    canonicalKey: 'gender',
    label: 'Gender',
    patterns: ['gender', 'sex', 'candidate gender', 'applicant gender'],
  },
];

export function detectHeaderMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}; // canonicalKey -> rawHeader

  for (const rawHeader of headers) {
    if (!rawHeader) continue;
    const rawTrimmed = rawHeader.trim();
    const rawLower = rawTrimmed.toLowerCase();
    const cleanHeader = rawLower.replace(/[_\s\-\/]+/g, ' ').trim();

    // Pass 1: Try exact match first
    let matchedCol: ColumnDefinition | undefined;

    for (const col of CANONICAL_COLUMNS) {
      if (mapping[col.canonicalKey]) continue;

      const isExact = col.patterns.some(p => {
        if (typeof p === 'string') {
          const cleanPattern = p.toLowerCase().replace(/[_\s\-\/]+/g, ' ').trim();
          return cleanHeader === cleanPattern || rawLower === p.toLowerCase();
        }
        return false;
      });

      if (isExact) {
        matchedCol = col;
        break;
      }
    }

    // Pass 2: If no exact match, try contains / regex
    if (!matchedCol) {
      for (const col of CANONICAL_COLUMNS) {
        if (mapping[col.canonicalKey]) continue;

        const isMatch = col.patterns.some(pattern => {
          if (typeof pattern === 'string') {
            const cleanPattern = pattern.toLowerCase().replace(/[_\s\-\/]+/g, ' ').trim();
            // Don't match short single-word patterns with includes (e.g. avoid 'name' matching 'company name')
            if (cleanPattern.length <= 4) return cleanHeader === cleanPattern;
            return cleanHeader.includes(cleanPattern);
          } else if (pattern instanceof RegExp) {
            return pattern.test(cleanHeader);
          }
          return false;
        });

        if (isMatch) {
          matchedCol = col;
          break;
        }
      }
    }

    if (matchedCol) {
      mapping[matchedCol.canonicalKey] = rawHeader;
    }
  }

  return mapping;
}

/**
 * Extracts normalized row data using the detected column mapping
 * while retaining the 100% untouched raw row object.
 */
export function extractRowValues(
  rawRow: Record<string, any>,
  mapping: Record<string, string>
): {
  normalized: Record<string, string>;
  rawRow: Record<string, any>;
} {
  const normalized: Record<string, string> = {};

  for (const col of CANONICAL_COLUMNS) {
    const rawHeader = mapping[col.canonicalKey];
    if (rawHeader && rawRow[rawHeader] !== undefined && rawRow[rawHeader] !== null) {
      normalized[col.canonicalKey] = String(rawRow[rawHeader]).trim();
    } else {
      normalized[col.canonicalKey] = '';
    }
  }

  // Name resolution:
  let full = normalized['fullName'] || '';
  let first = normalized['firstName'] || '';
  let last = normalized['lastName'] || '';

  // Defensive guard against broken screening question fragments masquerading as names:
  const isScreeningFragment = (str: string) => {
    const s = str.trim();
    return (
      s.startsWith(':') ||
      /^\s*(yes|no)\b/i.test(s) ||
      /are you legally authorized/i.test(s) ||
      /require sponsorship/i.test(s) ||
      /green card/i.test(s) ||
      /how many years of work/i.test(s)
    );
  };

  if (isScreeningFragment(full) || isScreeningFragment(first)) {
    const fragment = full || first;
    normalized['rawScreeningQuestions'] = normalized['rawScreeningQuestions']
      ? `${normalized['rawScreeningQuestions']} ${fragment}`
      : fragment;
    full = 'Unnamed Applicant';
    first = 'Unnamed';
    last = '';
  }

  if (full && (!first || !last)) {
    // If fullName is e.g. "Raj Jagtap" or "Vinay Kumar Kadam", split it!
    const tokens = full.trim().split(/\s+/);
    if (!first) first = tokens[0] || '';
    if (!last) last = tokens.slice(1).join(' ') || '';
    normalized['firstName'] = first;
    normalized['lastName'] = last;
  } else if (!full && (first || last)) {
    full = `${first} ${last}`.trim();
    normalized['fullName'] = full || 'Unnamed Applicant';
  } else if (!full) {
    normalized['fullName'] = 'Unnamed Applicant';
  }

  // Screening questions resolution:
  // If rawScreeningQuestions is empty, but separate columns for Green Card and/or Sponsorship are present:
  const gcAnswer = normalized['greenCardCitizenAnswer'] || '';
  const spAnswer = normalized['sponsorshipAnswer'] || '';
  const waAnswer = normalized['usWorkAuthAnswer'] || '';
  if (!normalized['rawScreeningQuestions'] && (gcAnswer || spAnswer || waAnswer)) {
    const parts: string[] = [];
    if (gcAnswer) {
      parts.push(`Do You Have a Green Card or US Citizen ? : ${gcAnswer}`);
    }
    if (spAnswer) {
      parts.push(`Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)? : ${spAnswer}`);
    }
    if (waAnswer) {
      parts.push(`Are you legally authorized to work in the United States? : ${waAnswer}`);
    }
    normalized['rawScreeningQuestions'] = parts.join(', ');
  }

  // Contact Number sanitization:
  if (normalized['phone']) {
    normalized['phone'] = sanitizeContactNumber(normalized['phone']);
  }

  return {
    normalized,
    rawRow,
  };
}

/**
 * Sanitizes contact/mobile phone numbers according to recruiter specifications:
 * - Removes "+1" prefix (or leading "1" if 11-digit US number)
 * - Removes ALL symbols: -, ., (), _, spaces, slashes, plus signs, brackets
 * - Returns clean digits only (or empty string if none)
 */
export function sanitizeContactNumber(rawPhone: string | number | null | undefined, formatHyphen: boolean = true): string {
  if (rawPhone === null || rawPhone === undefined) return '';
  let str = String(rawPhone).trim();
  if (!str) return '';

  // Remove leading '+1' or '+ 1'
  str = str.replace(/^\+\s*1\s*/, '');

  // Remove any symbols like - . ( ) _ spaces, plus signs, brackets, etc.
  // Leave ONLY digits
  const digits = str.replace(/\D/g, '');

  // If after stripping it is 11 digits starting with 1 (e.g. 1 followed by 10-digit US number)
  let cleanDigits = digits;
  if (digits.length === 11 && digits.startsWith('1')) {
    cleanDigits = digits.slice(1);
  }

  if (formatHyphen && cleanDigits.length === 10) {
    return `${cleanDigits.slice(0, 3)}-${cleanDigits.slice(3, 6)}-${cleanDigits.slice(6)}`;
  }

  return cleanDigits;
}

export interface GoogleSheetsRow {
  'Date': string;
  'Name': string;
  'Contact Number': string;
  'Email I\'d': string;
  'Job Role': string;
  'GREEN CARD/ US-C': string;
  'H1B-Y/N': string;
  'LinkedIn Profile Link': string;
}

export const GOOGLE_SHEETS_COLUMNS = [
  'Date',
  'Name',
  'Contact Number',
  "Email I'd",
  'Job Role',
  'GREEN CARD/ US-C',
  'H1B-Y/N',
  'LinkedIn Profile Link',
] as const;

/**
 * Normalizes job roles into standardized categories:
 * - Data Analyst -> DA
 * - Data Engineer -> DE
 * - Business Analyst -> BA
 * - Data Scientist -> DS
 * - AWS / Cloud / DevOps -> AWS
 * - Cybersecurity -> Cybersecurity
 * - QA / Automation -> QA
 */
export function normalizeJobRole(rawRole: string | undefined | null, fallbackContext?: string | null): string {
  const check = (str: string | undefined | null): string | null => {
    if (!str) return null;
    const lower = str.trim().toLowerCase();
    if (!lower) return null;

    // Exact standard acronyms
    if (lower === 'da' || lower === 'd.a.' || lower === 'da analyst') return 'DA';
    if (lower === 'de' || lower === 'd.e.' || lower === 'de engineer') return 'DE';
    if (lower === 'ba' || lower === 'b.a.' || lower === 'ba analyst') return 'BA';
    if (lower === 'ds' || lower === 'd.s.' || lower === 'ds scientist') return 'DS';
    if (lower === 'aws' || lower === 'aws engineer') return 'AWS';
    if (lower === 'qa' || lower === 'sdet') return 'QA';
    if (lower === 'cybersecurity' || lower === 'cyber security') return 'Cybersecurity';

    // 1. Cybersecurity (priority 1 so "Cyber Security Analyst" -> Cybersecurity, not DA)
    if (
      lower.includes('cyber') ||
      lower.includes('security') ||
      lower.includes('infosec') ||
      lower.includes('soc') ||
      lower.includes('appsec') ||
      lower.includes('netsec') ||
      lower.includes('penetration') ||
      lower.startsWith('cy-') ||
      lower.startsWith('cy ') ||
      /\bcy\b/i.test(lower)
    ) {
      return 'Cybersecurity';
    }

    // 2. Business Analyst & Product Analyst -> BA (priority 2 so "Business Analyst" / "Product Analyst" -> BA, not DA)
    if (
      /\bbus[a-z]*\s*an[a-z]*/i.test(lower) || // matches business analyst, busimness anlyst, business anlyst, etc.
      /\bprod[a-z]*\s*an[a-z]*/i.test(lower) || // matches product analyst, product-analyst, etc.
      lower.includes('business system') ||
      lower.includes('business-analyst') ||
      lower.includes('product analyst') ||
      lower.includes('product-analyst') ||
      lower.includes('business process') ||
      /\bbsa\b/i.test(lower) ||
      /\bba\b/i.test(lower)
    ) {
      return 'BA';
    }

    // 3. Data Engineer -> DE (priority 3 so "Data Engineer" / "Dataengineer" -> DE, not DA)
    if (
      /\bdata\s*engineer/i.test(lower) ||
      /\bdataengineer/i.test(lower) ||
      /\bdata-engineer/i.test(lower) ||
      /\bdata\s*engineering/i.test(lower) ||
      /\bbig\s*data/i.test(lower) ||
      /\bdata\s*platform/i.test(lower) ||
      /\bdata\s*pipeline/i.test(lower) ||
      /\banalytics\s*engineer/i.test(lower) ||
      /\betl\b/i.test(lower) ||
      /\bdatabricks\b/i.test(lower) ||
      /\bsnowflake\b/i.test(lower) ||
      /\bde\b/i.test(lower)
    ) {
      return 'DE';
    }

    // 4. Data Scientist & ML Engineer -> DS (priority 4 so "Data Scientist" / "ML Engineer" -> DS, not DA/DE)
    if (
      /\bdata\s*scien/i.test(lower) ||
      /\bdatascien/i.test(lower) ||
      /\bdata-scien/i.test(lower) ||
      /\bapplied\s*scientist/i.test(lower) ||
      /\bml\s*scientist/i.test(lower) ||
      /\bmachine\s*learning\s*scientist/i.test(lower) ||
      /\bmachine\s*learning\s*engineer/i.test(lower) ||
      /\bml\s*engineer/i.test(lower) ||
      /\bmachine\s*learning/i.test(lower) ||
      /\bai\s*engineer/i.test(lower) ||
      /\bai\s*scientist/i.test(lower) ||
      /\bds\b/i.test(lower)
    ) {
      return 'DS';
    }

    // 5. Data Analyst -> DA
    if (
      /\bdata\s*an[a-z]*/i.test(lower) || // data analyst, data anlyst, data analytics, data-analyst
      /\bdataanalytics/i.test(lower) ||
      /\bdataanalyst/i.test(lower) ||
      lower.includes('business intelligence') ||
      lower.includes('bi analyst') ||
      lower.includes('power bi') ||
      lower.includes('tableau') ||
      lower.includes('reporting analyst') ||
      lower.includes('analytics consultant') ||
      lower.includes('bi developer') ||
      /\bda\b/i.test(lower) ||
      (lower.includes('analyst') && !lower.includes('system') && !lower.includes('financial')) ||
      (lower.includes('data') && !lower.includes('center'))
    ) {
      return 'DA';
    }

    // 6. AWS / Cloud / DevOps
    if (
      lower.includes('aws') ||
      lower.includes('devops') ||
      lower.includes('cloud') ||
      lower.includes('sre') ||
      lower.includes('site reliability') ||
      lower.includes('platform') ||
      lower.includes('infrastructure') ||
      lower.includes('linux engineer') ||
      lower.includes('kubernetes') ||
      lower.includes('terraform')
    ) {
      return 'AWS';
    }

    // 7. QA / Testing
    if (
      /\bqa\b/i.test(lower) ||
      /\bsdet\b/i.test(lower) ||
      lower.includes('quality assurance') ||
      lower.includes('software tester') ||
      lower.includes('test engineer') ||
      lower.includes('automation engineer') ||
      /\btester\b/i.test(lower)
    ) {
      return 'QA';
    }

    return null;
  };

  const primary = check(rawRole);
  if (primary) return primary;

  if (fallbackContext) {
    const secondary = check(fallbackContext);
    if (secondary) return secondary;
  }

  return rawRole?.trim() || '';
}

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats a Date object or string into standard DD-MMM-YYYY (e.g. 15-Oct-2026, 21-Oct-2026)
 */
export function formatDayMonthYear(dateInput?: string | Date): string {
  if (!dateInput) return getTodayDateString();
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) {
    const str = String(dateInput).trim();
    if (/^\d{1,2}-[A-Za-z]{3}-\d{4}$/.test(str)) return str;
    return getTodayDateString();
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Returns today's date string formatted as DD-MMM-YYYY (e.g. 15-Oct-2026, 21-Oct-2026)
 */
export function getTodayDateString(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function formatGoogleSheetsRow(
  applicant: {
    dateApplied?: string;
    applicationDate?: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string;
    jobTitle?: string;
    sourceFile?: string;
    headline?: string;
    currentTitle?: string;
    greenCardCitizenAnswer?: string;
    sponsorshipAnswer?: string;
    profileUrl?: string;
    rawRowData?: Record<string, any>;
  },
  useTodayDate: boolean = true
): GoogleSheetsRow {
  const raw = applicant.rawRowData || {};
  const rawPhone = applicant.phone || raw['Contact Number'] || raw['Phone Number'] || raw['Phone'] || raw['Mobile Number'] || raw['Mobile'] || raw['Contact'] || '';
  // Phone normalized without any symbols, spaces, or +1 -> only numbers (e.g. 3615167370)
  const contactNum = sanitizeContactNumber(rawPhone, false);

  let gcVal = '';
  if ((applicant as any).green_card || (applicant as any).greenCard) gcVal = (applicant as any).green_card || (applicant as any).greenCard;
  else if (applicant.greenCardCitizenAnswer === 'YES') gcVal = 'Yes';
  else if (applicant.greenCardCitizenAnswer === 'NO') gcVal = 'No';
  else if (raw['GREEN CARD/ US-C']) gcVal = String(raw['GREEN CARD/ US-C']).trim();
  else if (applicant.greenCardCitizenAnswer && applicant.greenCardCitizenAnswer !== 'MISSING' && applicant.greenCardCitizenAnswer !== 'UNCLEAR') gcVal = applicant.greenCardCitizenAnswer;
  else gcVal = '';

  let h1bVal = '';
  if ((applicant as any).h1b_status || (applicant as any).h1bStatus) h1bVal = (applicant as any).h1b_status || (applicant as any).h1bStatus;
  else if (applicant.sponsorshipAnswer === 'NO') h1bVal = 'No';
  else if (applicant.sponsorshipAnswer === 'YES') h1bVal = 'Yes';
  else if (raw['H1B-Y/N']) h1bVal = String(raw['H1B-Y/N']).trim();
  else if (applicant.sponsorshipAnswer && applicant.sponsorshipAnswer !== 'MISSING' && applicant.sponsorshipAnswer !== 'UNCLEAR') h1bVal = applicant.sponsorshipAnswer;
  else h1bVal = '';

  const rawRole = applicant.jobTitle || raw['Job Role'] || raw['Job Title'] || raw['Role'] || '';
  const fallbackContext = [
    applicant.sourceFile || raw['Source File'] || '',
    applicant.headline || raw['Headline'] || '',
    applicant.currentTitle || raw['Current Title'] || raw['Title'] || '',
    raw['Job Name'] || '',
  ].filter(Boolean).join(' ');

  const normalizedRole = normalizeJobRole(rawRole, fallbackContext);

  let profileLink = applicant.profileUrl || raw['LinkedIn Profile Link'] || raw['LinkedIn Profile'] || raw['LinkedIn URL'] || raw['Profile URL'] || '';
  const mdMatch = profileLink.match(/\[.*?\]\((https?:\/\/[^\s\)]+)\)/);
  if (mdMatch) {
    profileLink = mdMatch[1];
  } else {
    profileLink = profileLink.replace(/^\[+|\]+$/g, '').trim();
  }

  // Use portal ingestion date (or today's date if none) formatted as DD-MMM-YYYY (e.g. 21-Oct-2026, 17-Oct-2026)
  const targetDateInput = applicant.applicationDate || (useTodayDate ? getTodayDateString() : (applicant.dateApplied || raw['Date'] || raw['Date Applied']));
  const dateValue = formatDayMonthYear(targetDateInput);

  return {
    'Date': dateValue,
    'Name': applicant.fullName || '',
    'Contact Number': contactNum,
    "Email I'd": applicant.email || raw["Email I'd"] || raw['Email Id'] || raw['Email'] || raw['Email Address'] || '',
    'Job Role': normalizedRole,
    'GREEN CARD/ US-C': gcVal,
    'H1B-Y/N': h1bVal,
    'LinkedIn Profile Link': profileLink,
  };
}

export function generateGoogleSheetsTsv(rows: GoogleSheetsRow[], includeHeaders: boolean = false): string {
  const sanitizeCell = (val: string) => String(val || '').replace(/[\t\r\n]+/g, ' ').trim();
  const lines: string[] = [];

  if (includeHeaders) {
    lines.push(GOOGLE_SHEETS_COLUMNS.join('\t'));
  }

  for (const row of rows) {
    const line = [
      sanitizeCell(row['Date']),
      sanitizeCell(row['Name']),
      sanitizeCell(row['Contact Number']),
      sanitizeCell(row["Email I'd"]),
      sanitizeCell(row['Job Role']),
      sanitizeCell(row['GREEN CARD/ US-C']),
      sanitizeCell(row['H1B-Y/N']),
      sanitizeCell(row['LinkedIn Profile Link']),
    ].join('\t');
    lines.push(line);
  }

  return lines.join('\r\n');
}


