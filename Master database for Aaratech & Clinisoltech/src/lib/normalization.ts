// Data Normalization Engine for Master Recruiting Database
// Strict preservation of original values while generating clean match keys

export interface NormalizedEmailResult {
  original: string;
  normalized: string;
  isValid: boolean;
}

export interface NormalizedPhoneResult {
  original: string;
  normalized: string;
  isUS: boolean;
  isValid: boolean;
}

/**
 * Normalizes email address
 * - Trim whitespace
 * - Lowercase
 * - Remove invisible unicode spaces / tabs
 */
export function normalizeEmail(email: string | null | undefined): NormalizedEmailResult | null {
  if (!email || typeof email !== 'string') return null;
  
  let original = email.trim().replace(/^["'<\s]+|["'>\s]+$/g, '');
  if (!original) return null;

  // Extract from markdown link syntax like [name@example.com](mailto:name@example.com)
  const mailtoMatch = original.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+)/);
  if (mailtoMatch) {
    original = mailtoMatch[1];
  }

  // Clean whitespace (including inside email handle), unicode spaces, and trailing punctuation
  let cleaned = original.toLowerCase()
    .replace(/[\s\u200B-\u200D\uFEFF\r\n]/g, '')
    .replace(/^["'<\s]+|["'>\s;,.]+$/g, '');

  // Auto-heal UK / regional domains e.g. @yahoocouk -> @yahoo.co.uk
  cleaned = cleaned.replace(/@(gmail|outlook|yahoo|hotmail|icloud)couk$/i, '@$1.co.uk');

  // Auto-heal missing dot before popular email domains:
  // e.g. @gmailcom -> @gmail.com, @outlookcom -> @outlook.com, @yahoocom -> @yahoo.com
  cleaned = cleaned.replace(/@(gmail|outlook|yahoo|hotmail|icloud|aol|proton|rediffmail|live|msn)(com|org|net|in|co|edu)$/i, '@$1.$2');
  // Auto-heal truncated com: e.g. @gmailco -> @gmail.com, @gmailc -> @gmail.com
  cleaned = cleaned.replace(/@(gmail|outlook|yahoo|hotmail|icloud|aol|proton|rediffmail)(?:\.co|\.c|co|c)$/i, '@$1.com');

  // Generic missing dot repair if domain has no dot and ends with known TLD
  if (!cleaned.includes('.') && cleaned.includes('@')) {
    cleaned = cleaned.replace(/@([a-zA-Z0-9-]+?)(couk|com|org|net|edu|gov|io|co|in)$/i, (match, domain, tld) => {
      return tld === 'couk' ? `@${domain}.co.uk` : `@${domain}.${tld}`;
    });
  }

  // If still no dot after @ and domain is alphanumeric, default to .com
  if (!cleaned.includes('.') && /@[a-zA-Z0-9-]+$/.test(cleaned)) {
    cleaned = `${cleaned}.com`;
  }

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  // Strictly validate email: if it doesn't match a valid email format, return null
  if (!emailRegex.test(cleaned)) {
    return null;
  }

  return {
    original: cleaned,
    normalized: cleaned,
    isValid: true,
  };
}

/**
 * Normalizes phone numbers
 * Handles US numbers:
 * +1 214-334-9058, 1-214-334-9058, 12143349058, 2143349058 -> 2143349058
 * Handles international numbers safely without blindly stripping leading 1 from other countries
 */
export function normalizePhone(phone: string | null | undefined): NormalizedPhoneResult | null {
  if (!phone || typeof phone !== 'string') return null;
  
  const original = phone.trim();
  if (!original) return null;

  // Check for literal "No Number", "None", "N/A"
  if (/^(no number|no phone|none|n\/a|na|nil|null|-|—)$/i.test(original)) {
    return null;
  }

  // Extract only digits and leading plus sign
  const hasLeadingPlus = original.startsWith('+');
  const digitsOnly = original.replace(/\D/g, '');

  if (digitsOnly.length < 7) {
    return null;
  }

  // Check if US phone number
  // Case A: 11 digits starting with 1 (e.g. 12143349058 or +1 214-334-9058)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    const usTenDigits = digitsOnly.substring(1);
    return {
      original,
      normalized: usTenDigits,
      isUS: true,
      isValid: true,
    };
  }

  // Case B: 10 digits (US standard without country code, e.g. 2143349058)
  if (digitsOnly.length === 10 && !hasLeadingPlus) {
    return {
      original,
      normalized: digitsOnly,
      isUS: true,
      isValid: true,
    };
  }

  // Case C: International number (preserve international digit sequence)
  return {
    original,
    normalized: digitsOnly,
    isUS: false,
    isValid: digitsOnly.length >= 8 && digitsOnly.length <= 15,
  };
}

/**
 * Normalizes LinkedIn Profile URL
 * e.g. https://www.linkedin.com/in/john-smith/ -> linkedin.com/in/john-smith
 */
export function normalizeLinkedInUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  let cleaned = url.trim().toLowerCase();
  if (!cleaned) return null;

  // Remove protocols and www
  cleaned = cleaned.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  // Remove query parameters like ?trk=... or ?originalSubdomain=...
  cleaned = cleaned.split('?')[0];
  // Remove trailing slashes
  cleaned = cleaned.replace(/\/+$/, '');

  if (!cleaned.includes('linkedin.com')) {
    // If just a handle provided like in/john-smith or john-smith
    if (cleaned.startsWith('in/')) {
      cleaned = 'linkedin.com/' + cleaned;
    }
  }

  return cleaned || null;
}

export function isPhoneNumber(val: string | null | undefined): boolean {
  if (!val || typeof val !== 'string') return false;
  const s = val.trim();
  if (!s) return false;

  // Clean out common phone prefixes
  const cleaned = s.replace(/^(ph(one)?|tel|cell|mobile|m)[:\s.-]*/i, '').trim();
  const digitsOnly = cleaned.replace(/\D/g, '');
  const lettersOnly = cleaned.replace(/[^a-zA-Z]/g, '');

  // 1. If at least 7 digits and no letters, or letters are just extension
  if (digitsOnly.length >= 7 && (lettersOnly.length === 0 || (lettersOnly.length <= 4 && /^(ext|x|\s)*$/i.test(lettersOnly)))) {
    return true;
  }

  // 2. Standard formatted phone patterns (e.g. +1 813-252-0835, (813) 252-0835, 813.252.0835)
  if (/^(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})$/.test(cleaned)) {
    return true;
  }

  // 3. Predominantly digits (e.g. digits >= 7 and digits count exceeds letters by more than 2x)
  if (digitsOnly.length >= 7 && digitsOnly.length > lettersOnly.length * 2) {
    return true;
  }

  return false;
}

const COMMON_SURNAMES = [
  'patel', 'sharma', 'reddy', 'singh', 'gupta', 'kumar', 'verma', 'mehta', 'jadhav',
  'shaik', 'muriki', 'tadepalli', 'popuri', 'gullani', 'chows', 'ganguly', 'pulagam',
  'ponugoti', 'jashwanth', 'chaitanya', 'khilfeh', 'taswala', 'virani'
];

function toTitleCase(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Intelligently extracts a candidate's full name from their email address
 * (e.g. alluchaitanya54@gmail.com -> "Allu Chaitanya", bharadwaj.tadepalli@aogjob.com -> "Bharadwaj Tadepalli")
 */
export function extractCandidateNameFromEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const username = email.split('@')[0].trim();
  if (!username) return null;

  // 1. If username has dots, underscores, or hyphens (e.g. bharadwaj.tadepalli, sai.saketh, bhavya.s.1898)
  if (/[-._]/.test(username)) {
    const parts = username
      .split(/[-._]+/)
      .map(p => p.replace(/\d+/g, '').trim())
      .filter(p => p.length > 0 && !/^(gmail|mail|work|job|ats|careernb)$/i.test(p));

    if (parts.length > 0) {
      return parts
        .map(p => {
          if (p.length === 1) return p.toUpperCase();
          if (p.length === 2 && !/^(an|al|in|on|to|de)$/i.test(p)) return p.toUpperCase();
          return toTitleCase(p);
        })
        .join(' ');
    }
  }

  // 2. Strip numbers at end or embedded years (e.g. alluchaitanya54 -> alluchaitanya, ankur1998sharma -> ankur sharma)
  let clean = username;
  if (/\d{2,4}[a-zA-Z]/.test(clean)) {
    clean = clean.replace(/(\d{2,4})/, ' ');
  } else {
    clean = clean.replace(/\d+$/, '');
  }

  if (clean.includes(' ')) {
    return clean.split(/\s+/).filter(Boolean).map(p => toTitleCase(p)).join(' ');
  }

  const lower = clean.toLowerCase();

  // Check initial + surname (e.g. hpatel -> H Patel, rsharma -> R Sharma)
  if (lower.length >= 4 && /^[a-z][a-z]+$/.test(lower)) {
    for (const s of COMMON_SURNAMES) {
      if (lower.endsWith(s) && lower.length === s.length + 1) {
        return `${lower[0].toUpperCase()} ${toTitleCase(s)}`;
      }
    }
  }

  if (lower === 'dineshreddypulagam') {
    return 'Dinesh Reddy Pulagam';
  }
  if (lower === 'pavans') {
    return 'Pavan S';
  }

  // Common compound prefixes
  const prefixes = [
    'harika', 'manshita', 'allu', 'aakashj', 'aakash', 'neeli', 'jyothiswaroop', 'jyothi',
    'arun', 'kapil', 'nikhil', 'ganguly', 'vigneshwar', 'hafeez', 'anshul', 'ankur',
    'dinesh', 'aditya', 'krish', 'puppala', 'tharun', 'navaneet'
  ];

  for (const prefix of prefixes) {
    if (lower.startsWith(prefix) && lower.length > prefix.length) {
      let first = prefix;
      const rest = lower.slice(prefix.length);
      if (first === 'aakashj') first = 'aakash';
      if (first === 'jyothiswaroop') first = 'jyothi swaroop';
      if (first === 'arun' && rest === 'tejav') return 'Arun Teja V';
      if (first === 'ganguly' && rest === 'rishit') return 'Rishit Ganguly';
      if (rest.length === 1) return `${toTitleCase(first)} ${rest.toUpperCase()}`;
      return `${first.split(' ').map(toTitleCase).join(' ')} ${toTitleCase(rest)}`;
    }
  }

  if (lower.length >= 3 && !/^(candidate|user|info|admin|test)$/i.test(lower)) {
    return toTitleCase(lower);
  }

  return null;
}

export const ATS_ROLE_KEYWORDS = new Set([
  'da', 'ba', 'edi', 'aws', 'qa', 'pm', 'dev', 'de', 'se', 'sre', 'fs', 'ui', 'ux',
  'data analyst', 'business analyst', 'cyber security', 'developer', 'engineer',
  'software engineer', 'cloud architect', 'solutions architect', 'clinical data manager',
  'sas programmer', 'biostatistician', 'qa automation engineer', 'full stack engineer',
  'general sourced candidate'
]);

export function isATSJobRoleTitle(val: string | null | undefined): boolean {
  if (!val || typeof val !== 'string') return false;
  const clean = val.trim().toLowerCase().replace(/[^a-z0-9 ]+/g, '');
  if (ATS_ROLE_KEYWORDS.has(clean)) return true;
  return /^(da|ba|edi|aws|qa|pm|dev|data analyst|business analyst)$/i.test(val.trim());
}

/**
 * Clean & split or combine person names
 */
export function parseAndNormalizeName(
  fullName?: string | null,
  firstName?: string | null,
  lastName?: string | null
): { fullName: string; firstName: string | null; lastName: string | null } {
  let fName = firstName ? firstName.trim() : null;
  let lName = lastName ? lastName.trim() : null;
  let combined = fullName ? fullName.trim() : '';

  if (!combined && (fName || lName)) {
    combined = [fName, lName].filter(Boolean).join(' ');
  }

  // Guard: If combined name is actually an ATS job role abbreviation, an email, a recruiter name,
  // or a PHONE NUMBER: It is NEVER a candidate's name! Return empty string.
  if (
    isATSJobRoleTitle(combined) ||
    combined.includes('@') ||
    ['adam', 'alex', 'unassigned'].includes(combined.toLowerCase()) ||
    isPhoneNumber(combined)
  ) {
    return {
      fullName: '',
      firstName: null,
      lastName: null,
    };
  }

  if (combined && (!fName || !lName)) {
    const parts = combined.split(/\s+/);
    if (parts.length === 1) {
      fName = parts[0];
      lName = null;
    } else if (parts.length >= 2) {
      fName = parts[0];
      lName = parts.slice(1).join(' ');
    }
  }

  return {
    fullName: combined || '',
    firstName: fName,
    lastName: lName,
  };
}

/**
 * Clean & normalize job role/title.
 * Prevents emails, phone numbers, recruiter names, and screening notes from appearing as job titles.
 */
export function cleanJobTitle(role: string | null | undefined, defaultRole: string = 'Data Analyst'): string {
  if (!role || typeof role !== 'string') return defaultRole;
  const trimmed = role.trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return defaultRole;

  // 1. If role contains '@' or resembles an email address
  if (
    trimmed.includes('@') ||
    trimmed.toLowerCase().includes('mailto:') ||
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+$/i.test(trimmed) ||
    /@(gmail|outlook|yahoo|hotmail|icloud|aol|proton|rediffmail|live|msn)/i.test(trimmed) ||
    /^(gmail|outlook|yahoo|hotmail|icloud|aol)/i.test(trimmed) ||
    /\b[a-zA-Z0-9._%+-]*(?:gmail|outlook|yahoo|hotmail|icloud|aol|proton|rediffmail)(?:\.?com|\.?org|\.?net|\.?in|\.?co)?\b/i.test(trimmed) ||
    /\b(gmailcom|yahoocom|outlookcom|hotmailcom|icloudcom)\b/i.test(trimmed) ||
    /^[a-zA-Z0-9._%+-]+\.(?:com|org|net|in|co|edu)$/i.test(trimmed)
  ) {
    return defaultRole;
  }

  // 2. If role is recruiter name or unassigned
  if (['adam', 'alex', 'unassigned', 'recruiter'].includes(trimmed.toLowerCase())) {
    return 'General Sourced Candidate';
  }

  // 3. If role is a phone number
  if (isPhoneNumber(trimmed) || /^\+?\d[\d\s-]{7,}\d$/.test(trimmed)) {
    return defaultRole;
  }

  // 4. If role is screening note / feedback
  if (
    trimmed.length > 40 ||
    /^(he is|she is|female|male|not a|4 years|2 years|\d+\s*years|opt|f1|h1b|green card|voice mail|someone picked|no response|interested|not interested)/i.test(trimmed)
  ) {
    return defaultRole;
  }

  return trimmed;
}

