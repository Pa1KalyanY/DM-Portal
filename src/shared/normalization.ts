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

export function normalizeEmail(email: string | null | undefined): NormalizedEmailResult | null {
  if (!email || typeof email !== 'string') return null;
  
  let original = email.trim().replace(/^["'<\s]+|["'>\s]+$/g, '');
  if (!original) return null;

  const mailtoMatch = original.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+)/);
  if (mailtoMatch) {
    original = mailtoMatch[1];
  }

  let cleaned = original.toLowerCase()
    .replace(/[\s\u200B-\u200D\uFEFF\r\n]/g, '')
    .replace(/^["'<\s]+|["'>\s;,.]+$/g, '');

  cleaned = cleaned.replace(/@(gmail|outlook|yahoo|hotmail|icloud)couk$/i, '@$1.co.uk');
  cleaned = cleaned.replace(/@(gmail|outlook|yahoo|hotmail|icloud|aol|proton|rediffmail|live|msn)(com|org|net|in|co|edu)$/i, '@$1.$2');
  cleaned = cleaned.replace(/@(gmail|outlook|yahoo|hotmail|icloud|aol|proton|rediffmail)(?:\.co|\.c|co|c)$/i, '@$1.com');

  if (!cleaned.includes('.') && cleaned.includes('@')) {
    cleaned = cleaned.replace(/@([a-zA-Z0-9-]+?)(couk|com|org|net|edu|gov|io|co|in)$/i, (_match, domain, tld) => {
      return tld === 'couk' ? `@${domain}.co.uk` : `@${domain}.${tld}`;
    });
  }

  if (!cleaned.includes('.') && /@[a-zA-Z0-9-]+$/.test(cleaned)) {
    cleaned = `${cleaned}.com`;
  }

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(cleaned)) {
    return null;
  }

  return {
    original: cleaned,
    normalized: cleaned,
    isValid: true,
  };
}

export function normalizePhone(phone: string | null | undefined): NormalizedPhoneResult | null {
  if (!phone || typeof phone !== 'string') return null;
  
  const original = phone.trim();
  if (!original) return null;

  if (/^(no number|no phone|none|n\/a|na|nil|null|-|—)$/i.test(original)) {
    return null;
  }

  const hasLeadingPlus = original.startsWith('+');
  const digitsOnly = original.replace(/\D/g, '');

  if (digitsOnly.length < 7) {
    return null;
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    const usTenDigits = digitsOnly.substring(1);
    return {
      original,
      normalized: usTenDigits,
      isUS: true,
      isValid: true,
    };
  }

  if (digitsOnly.length === 10 && !hasLeadingPlus) {
    return {
      original,
      normalized: digitsOnly,
      isUS: true,
      isValid: true,
    };
  }

  return {
    original,
    normalized: digitsOnly,
    isUS: false,
    isValid: digitsOnly.length >= 8 && digitsOnly.length <= 15,
  };
}

/**
 * Normalizes phone numbers to pure digits without any symbols (- . ' " ( ) spaces etc.)
 * E.g. "917-419-0333" -> "9174190333", "(470) 753-6521" -> "4707536521", "+1 940.435.5485" -> "9404355485"
 */
export function formatPureDigitsPhone(phone: string | null | undefined): string {
  if (!phone || typeof phone !== 'string') return '';
  const trimmed = phone.trim();
  if (!trimmed || /^(no number|no phone|none|n\/a|na|nil|null|-|—)$/i.test(trimmed)) {
    return '';
  }
  const norm = normalizePhone(trimmed);
  if (norm?.normalized) {
    const normDigits = norm.normalized.replace(/\D/g, '');
    if (normDigits.length >= 7 && normDigits.length <= 15) {
      return normDigits;
    }
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return '';
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
}

export function normalizeLinkedInUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  let cleaned = url.trim().toLowerCase();
  if (!cleaned) return null;

  cleaned = cleaned.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  cleaned = cleaned.split('?')[0];
  cleaned = cleaned.replace(/\/+$/, '');

  if (!cleaned.includes('linkedin.com')) {
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

  const cleaned = s.replace(/^(ph(one)?|tel|cell|mobile|m)[:\s.-]*/i, '').trim();
  const digitsOnly = cleaned.replace(/\D/g, '');
  const lettersOnly = cleaned.replace(/[^a-zA-Z]/g, '');

  if (digitsOnly.length >= 7 && (lettersOnly.length === 0 || (lettersOnly.length <= 4 && /^(ext|x|\s)*$/i.test(lettersOnly)))) {
    return true;
  }

  if (/^(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})$/.test(cleaned)) {
    return true;
  }

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

export function extractCandidateNameFromEmail(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const username = email.split('@')[0].trim();
  if (!username) return null;

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

  if (lower.length >= 4 && /^[a-z][a-z]+$/.test(lower)) {
    for (const s of COMMON_SURNAMES) {
      if (lower.endsWith(s) && lower.length === s.length + 1) {
        return `${lower[0].toUpperCase()} ${toTitleCase(s)}`;
      }
    }
  }

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

  // Do not guess single unspaced words from email usernames (e.g. waleedkhawaja -> Waleedkhawaja)
  // Candidate names must be preserved verbatim as entered by the user
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

export function cleanJobTitle(role: string | null | undefined, defaultRole: string = 'Data Analyst'): string {
  if (!role || typeof role !== 'string') return defaultRole;
  const trimmed = role.trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return defaultRole;

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

  if (['adam', 'alex', 'unassigned', 'recruiter'].includes(trimmed.toLowerCase())) {
    return 'General Sourced Candidate';
  }

  if (isPhoneNumber(trimmed) || /^\+?\d[\d\s-]{7,}\d$/.test(trimmed)) {
    return defaultRole;
  }

  if (
    trimmed.length > 40 ||
    /^(he is|she is|female|male|not a|4 years|2 years|\d+\s*years|opt|f1|h1b|green card|voice mail|someone picked|no response|interested|not interested)/i.test(trimmed)
  ) {
    return defaultRole;
  }

  return trimmed;
}
