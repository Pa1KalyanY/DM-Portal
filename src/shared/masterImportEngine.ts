// Historical Recruiting Data Import & Column Mapping Engine
// Parses XLSX / CSV, runs normalization & multi-identifier duplicate matching

import * as XLSX from 'xlsx';
import { TargetColumn, ColumnMappingConfig, ImportPreviewData, RowCountDiagnostics } from '../types/masterImport';
import { normalizeEmail, normalizePhone, formatPureDigitsPhone, normalizeLinkedInUrl, parseAndNormalizeName, isATSJobRoleTitle, isPhoneNumber, extractCandidateNameFromEmail, cleanJobTitle } from './normalization';
import { evaluateDuplicateMatch, isPlaceholderOrInvalidName } from './matchingEngine';
import { detectGender } from './genderDetection';
import { Person, PersonEmail, PersonPhone, ImportRecord, PossibleMatch, CompanyName, IncompleteRecord, IncompleteReason, RecruiterContact, RecruiterAssignment, Application } from '../types/masterDatabase';
import { generateUuid } from './uuid';
import { geminiService } from '../services/masterGeminiService';
import { classifyUrl, extractUrlsFromText } from './urlClassifier';
import { detectSourceFileType } from './twoFileMergeEngine';

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
};

/**
 * Robust date parser that handles:
 * - 21-Jan-2025, 1-May-2025, 21-Jan-25
 * - Jan-21-2025
 * - 2025-01-21
 * - 01/21/2025 or 21/01/2025
 * - Excel date serial numbers like 45678
 * Returns YYYY-MM-DD or null
 */
export function parseDateStringToYMD(val: any): string | null {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  if (!s || s.length < 6 || /^\d{4}$/.test(s)) return null;

  // Reject strings containing common recruiter note words
  if (/(year|years|age|citizen|visa|opt|exp|analyst|developer|candidate|degree|bachelors|masters|\$)/i.test(s)) {
    return null;
  }

  // Excel serial number (e.g. 45678)
  // Non-date keywords safeguard: Feedback, notes, headers, names are NEVER dates!
  if (/(feedback|notes?|remarks?|comments?|touchpoint|call|review|status|interview|candidate|owner|recruiter|job|role|email|phone|location|name|score|lead|gender|title|company|stage|\bfb\b)/i.test(s)) {
    return null;
  }

  if (/^\d{5}$/.test(s)) {
    const excelEpoch = new Date(1899, 11, 30);
    const d = new Date(excelEpoch.getTime() + Number(s) * 86400000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Day-month-year e.g. 21-Jan-2025, 1-May-2025, 21-Jan-25
  const dmyMatch = s.match(/^(\d{1,2})[-/ ]([a-zA-Z]{3,9})[-/ ](\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const monStr = dmyMatch[2].toLowerCase();
    let year = dmyMatch[3];
    if (year.length === 2) year = '20' + year;
    const month = MONTH_MAP[monStr] || MONTH_MAP[monStr.slice(0, 3)];
    if (month) return `${year}-${month}-${day}`;
  }

  // Month-day-year e.g. Jan-21-2025 or Jan 21, 2025
  const mdyMatch = s.match(/^([a-zA-Z]{3,9})[-/ ](\d{1,2})(?:[-/ ]|, )(\d{2,4})$/);
  if (mdyMatch) {
    const monStr = mdyMatch[1].toLowerCase();
    const day = mdyMatch[2].padStart(2, '0');
    let year = mdyMatch[3];
    if (year.length === 2) year = '20' + year;
    const month = MONTH_MAP[monStr] || MONTH_MAP[monStr.slice(0, 3)];
    if (month) return `${year}-${month}-${day}`;
  }

  // ISO YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // MM/DD/YYYY or DD/MM/YYYY
  const slashMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (slashMatch) {
    const p1 = Number(slashMatch[1]);
    const p2 = Number(slashMatch[2]);
    let year = slashMatch[3];
    if (year.length === 2) year = '20' + year;
    if (p1 > 12) {
      return `${year}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
    return `${year}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
  }

  // Fallback to JS Date ONLY if string contains an explicit 4-digit year (19xx or 20xx)
  if (/\b(19|20)\d{2}\b/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      if (y >= 1990 && y <= 2050) {
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
  }

  return null;
}

export function isDateString(val: any): boolean {
  return parseDateStringToYMD(val) !== null;
}

export const TECH_ROLES_SET = new Set([
  'da', 'ba', 'de', 'qa', 'pm', 'dev', 'sre', 'edi', 'aws', 'dotnet', '.net', 'java', 'python',
  'react', 'angular', 'fullstack', 'frontend', 'backend', 'devops', 'cloud', 'salesforce',
  'sap', 'oracle', 'sql', 'etl', 'data analyst', 'dataanalyst', 'business analyst', 'businessanalyst',
  'data engineer', 'dataengineer', 'software engineer', 'softwareengineer', 'cyber security', 'cybersecurity',
  'scrum master', 'scrummaster', 'tester', 'c#', 'c++', 'golang'
]);

export function isRoleOrTech(s: any): boolean {
  if (!s) return false;
  const str = String(s).trim().toLowerCase();
  const clean = str.replace(/[^a-z0-9]/g, '');
  return TECH_ROLES_SET.has(clean) || TECH_ROLES_SET.has(str) || isATSJobRoleTitle(s);
}

export function extractCleanPhone(val: any): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (/^(no number|no phone|none|n\/a)$/i.test(s)) {
    return '';
  }

  // Reject strings containing feedback / screening notes keywords or text
  if (/(opt|cpt|f1|h1b|visa|citizen|masters|bachelors|relocate|call|busy|employer|driving|scheduled|interview|unable|exp|year|age|\$)/i.test(s)) {
    return null;
  }

  const rawDigits = s.replace(/\D/g, '');
  if (rawDigits.length < 7 || rawDigits.length > 15) {
    return null;
  }

  // 1. Standard formatted US/Intl phone
  const phonePattern = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/;
  const match = s.match(phonePattern);
  if (match) {
    const nonPhoneChars = s.replace(match[0], '').trim();
    if (nonPhoneChars.length <= 5) {
      return match[0].trim();
    }
  }

  // 2. Pure 7 to 15 digits (with standard phone punctuation)
  const cleanFormat = s.replace(/[-+().\s]/g, '');
  if (/^\d{7,15}$/.test(cleanFormat)) {
    return s.replace(/[.,;]+$/, '').trim();
  }

  return null;
}

export const CONVERSATIONAL_WORDS = new Set([
  'he', 'she', 'they', 'it', 'we', 'i', 'iam', 'his', 'her', 'their', 'my',
  'was', 'is', 'are', 'were', 'been', 'being', 'have', 'has', 'had', 'having',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
  'call', 'calling', 'called', 'back', 'busy', 'driving', 'invalid', 'number',
  'looking', 'open', 'remote', 'position', 'job', 'work', 'working', 'employer',
  'employee', 'staffing', 'firm', 'agency', 'interested', 'not', 'no', 'none',
  'unable', 'connect', 'connected', 'answer', 'voicemail', 'mail', 'message',
  'tomorrow', 'tommorow', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday', 'later', 'already', 'scheduled', 'sheduled', 'think',
  'girl', 'boy', 'guy', 'someone', 'candidate', 'interview', 'round', 'car',
  'train', 'training', 'system', 'data', 'provide', 'proving', 'according',
  'drop', 'dropped', 'response', 'option', 'available', 'resposne'
]);

export const KNOWN_RECRUITERS = new Set([
  'adam', 'alex', 'sia', 'sharma', 'uday', 'yesh', 'kiran', 'neha', 'priya',
  'sarah', 'david', 'elena', 'marcus', 'rachel', 'chen', 'carter', 'jenkins',
  'miller', 'rostova', 'vance', 'green', 'priya sharma', 'sarah jenkins',
  'david miller', 'alex carter', 'dr. elena rostova', 'elena rostova',
  'marcus vance', 'rachel green', 'david chen', 'uday kiran'
]);

export function isKnownRecruiter(val: any): boolean {
  if (!val || typeof val !== 'string') return false;
  const clean = val.trim().toLowerCase().replace(/^(recruiter|owner)[:\s.-]*/i, '').trim();
  if (KNOWN_RECRUITERS.has(clean)) return true;
  const parts = clean.split(/\s+/);
  if (parts.length === 1 && KNOWN_RECRUITERS.has(parts[0])) return true;
  if (parts.length >= 2 && (KNOWN_RECRUITERS.has(parts[0]) || KNOWN_RECRUITERS.has(parts[parts.length - 1]))) {
    return true;
  }
  return false;
}

export function isScreeningNote(val: any): boolean {
  if (!val || typeof val !== 'string') return false;
  const s = val.trim();
  const lower = s.toLowerCase();

  // Numbered status or feedback note (e.g. "3.VM", "4. Not Interested", "1. Calling", "2. Hold", "1. Invalid number")
  if (/^\d+[.)\s]+(vm|lvm|not\s*interested|calling|hold|interested|call|voice\s*mail|connected|busy|no\s*answer|rnr|invalid\s*number)/i.test(lower)) return true;
  // Common short recruiter disposition notes
  if (/^(3\.vm|4\.\s*not\s*interested|1\.\s*invalid\s*number|\d+\.\s*vm|vm|lvm|rnr|hold|calling|call\s*back|no\s*answer|not\s*interested|interested|follow-up|followup|disconnected|need\s*time|wrong\s*number)$/i.test(lower)) return true;

  // If text is a valid clean human name (letters only, <= 5 words), it is NOT a screening note!
  const words = s.split(/\s+/);
  if (words.length <= 5 && /^[A-Za-z\s.'-]+$/.test(s)) {
    if (/^(calling|hold|vm|lvm|rnr|interested|not interested|follow up|followup|disconnected|need time)$/i.test(lower)) {
      return true;
    }
    const hasScreeningKeywords = words.some(w => CONVERSATIONAL_WORDS.has(w.toLowerCase()));
    if (!hasScreeningKeywords && !/^(female|male|someone|voice\s*mail|not\s*interested|disconnected|need\s*time)/i.test(lower)) {
      return false;
    }
  }

  if (s.length > 50) return true; // Sentences longer than 50 chars are notes
  if (/^(he is|she is|he was|she was|he'll|she'll|not a|not on|not interested|female|male|us citizen|citizen|opt|f1|h1b|green card|having|gc|age|assessment|birth year|years|exp|looking|expected|expecting|package|rate|salary|underage|call|called|interview|interested|rejected|joined|notice|open to|submitted|review|pending|no answer|voicemail|attended|discuss|discussed|meeting|remote|currently|already|working|unable|will|stem|valid|invalid|girl|boy|wants|waiting|declined|no resposne|no response|disconnected|need time|wrong number)/i.test(lower)) return true;
  if (/(call\s*back|busy|employer|driving|remote|relocate|relocsate|staffing|sheduled|scheduled|connect|position|visa issue|vissa issue|masters|bachelors|opt ead|stem opt|f1 opt|option not available|no response|wrong number|need time|disconnected)/i.test(lower)) return true;
  if (s.includes('$') || s.includes('/hr') || s.includes('per hour')) return true;
  if (s.includes('/') && /\d/.test(s)) return true;
  return false;
}

export function isHeaderOrLabelWord(val: any): boolean {
  if (!val || typeof val !== 'string') return false;
  const s = val.trim().toLowerCase().replace(/[_\W]+/g, ' ').trim();
  return /^(location|current location|candidate location|city|state|country|address|region|metro|preferred location|job role|job title|role|position|domain|recruiter|owner|assigned owner|feedback|feedback 1|feedback 2|notes|comments|remarks|candidate name|full name|name|status|date|date assigned|contact|phone|email|team|gender|experience|years of experience|green card|greencard|gc|h1b|h-1b|visa|visa status|work authorization)$/i.test(s);
}

const STOP_WORDS = /^(mba|ms|bs|b\.?tech|m\.?tech|bca|mca|ph\.?d|pmp|safe|agilist|gc|opt|cpt|f1|h1b|us citizen|citizen|green card|\d+\+?\s*years?|\d+\s*yrs?|exp|looking|open|assessment)/i;

export function isValidCandidateName(name: string | null | undefined): boolean {
  if (!name || typeof name !== 'string') return false;
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 50) return false;
  if (/\d/.test(clean)) return false; // Names NEVER contain numbers (like '4 years', '2 Years')!
  if (isPhoneNumber(clean)) return false;
  if (isRoleOrTech(clean)) return false;
  if (isKnownRecruiter(clean)) return false; // Recruiters are NOT candidate names!
  if (isLocationOrCountry(clean)) return false; // Locations (United States, New Jersey, etc.) are NOT names!
  if (isHeaderOrLabelWord(clean)) return false; // Column headers are NOT names!
  if (isScreeningNote(clean)) return false; // Screening notes/remarks are NOT names!
  if (/^(yes|no|y|n|none|n\/a|na|nil|null|undefined|unknown|unspecified|female(\s+candidate)?|male(\s+candidate)?|candidate|voice\s*mail|voicemail|someone|someone\s+picked|call|middle\s+of\s+something|not\s+a\s+desi|desi|us\s+citizen|green\s+card|opt|f1|h1b|location|job\s*role|job\s*title|role|name|disconnected|need\s*time|calling|hold|not\s*interested)$/i.test(clean)) return false;

  const words = clean.toLowerCase().split(/\s+/);
  if (words.length > 5) return false; // Human names never exceed 5 words!
  if (words.some(w => CONVERSATIONAL_WORDS.has(w))) return false;
  if (words.some(w => ['years', 'year', 'exp', 'candidate', 'voicemail', 'visa', 'mail', 'dropped', 'droped', 'something', 'location', 'role', 'country', 'city', 'state', 'disconnected', 'calling', 'hold'].includes(w))) return false;

  return /^[A-Za-z\s.'-]+$/.test(clean);
}

export function extractCandidateName(text: any): { name: string | null; remaining: string } {
  if (!text) return { name: null, remaining: '' };
  let s = String(text).trim();

  // If text starts with notes, pronouns, or screening phrases, it is NOT a candidate name
  if (/^(he is|she is|he was|she was|not a|female|male|candidate|us citizen|citizen|opt|f1|h1b|gc|green card|age|looking|open to|rate|salary|\$|\d+\s*years?|\d+\s*yrs?|voice\s*mail|someone|disconnected|need time|calling|hold|not interested)/i.test(s)) {
    return { name: null, remaining: s };
  }

  if (isScreeningNote(s)) {
    return { name: null, remaining: s };
  }

  // If it's a role or phone number
  if (isRoleOrTech(s) || isPhoneNumber(s)) {
    return { name: null, remaining: s };
  }

  // Check if comma exists (e.g. "Rohan Sharma, MBA US Citizen...")
  if (s.includes(',')) {
    const parts = s.split(',');
    let candidateName = parts[0].trim();
    const remaining = parts.slice(1).join(',').trim();
    candidateName = candidateName.replace(/\s+(pmp|csm|safe|ph\.?d|agilist)$/i, '').trim();

    if (isValidCandidateName(candidateName) && candidateName.split(/\s+/).length <= 5) {
      return { name: candidateName, remaining };
    }
  }

  // Check if hyphen or dash exists (e.g. "Name - notes")
  if (s.includes(' - ') || s.includes(' – ')) {
    const parts = s.split(/\s+[-–]\s+/);
    let candidateName = parts[0].trim();
    const remaining = parts.slice(1).join(' - ').trim();
    candidateName = candidateName.replace(/\s+(pmp|csm|safe|ph\.?d|agilist)$/i, '').trim();
    if (isValidCandidateName(candidateName) && candidateName.split(/\s+/).length <= 5) {
      return { name: candidateName, remaining };
    }
  }

  // Word-by-word scan before stop words (e.g. "VENKATA SAI KRISHNA REDDY YERUVA F1 OPT - Open")
  const words = s.split(/\s+/);
  const nameWords: string[] = [];
  let stopIdx = -1;

  for (let i = 0; i < words.length; i++) {
    const w = words[i].replace(/[,.]/g, '');
    if (STOP_WORDS.test(w) || STOP_WORDS.test(words[i])) {
      stopIdx = i;
      break;
    }
    if (/^\d+$/.test(w) && i >= 2) {
      stopIdx = i;
      break;
    }
    nameWords.push(words[i]);
  }

  if (stopIdx > 0 && nameWords.length >= 2 && nameWords.length <= 5) {
    let extractedName = nameWords.join(' ').replace(/[,.-]$/, '').trim();
    extractedName = extractedName.replace(/\s+(pmp|csm|safe|ph\.?d|agilist)$/i, '').trim();
    const remaining = words.slice(stopIdx).join(' ').trim();
    if (isValidCandidateName(extractedName)) {
      return { name: extractedName, remaining };
    }
  }

  // If entire string is 1 to 5 words of pure name
  if (isValidCandidateName(s) && words.length <= 5) {
    return { name: s, remaining: '' };
  }

  return { name: null, remaining: s };
}

export const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]);

export const US_STATES = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut', 'delaware', 'florida', 'georgia',
  'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas', 'kentucky', 'louisiana', 'maine', 'maryland',
  'massachusetts', 'michigan', 'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new jersey',
  'new mexico', 'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina',
  'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington', 'west virginia', 'wisconsin', 'wyoming'
]);

export const US_CITIES = new Set([
  'austin', 'dallas', 'houston', 'san antonio', 'fort worth', 'el paso', 'arlington', 'plano', 'frisco', 'irving', 'garland',
  'san jose', 'san francisco', 'san diego', 'los angeles', 'sacramento', 'fremont', 'oakland', 'sunnyvale', 'santa clara',
  'chicago', 'naperville', 'aurora', 'atlanta', 'alpharetta', 'marietta', 'duluth', 'charlotte', 'raleigh', 'durham', 'cary',
  'seattle', 'bellevue', 'redmond', 'boston', 'cambridge', 'new york', 'brooklyn', 'queens', 'manhattan', 'jersey city', 'edison',
  'princeton', 'newark', 'philadelphia', 'pittsburgh', 'phoenix', 'tempe', 'scottsdale', 'chandler', 'denver', 'boulder',
  'tampa', 'orlando', 'miami', 'jacksonville', 'minneapolis', 'st paul', 'detroit', 'ann arbor', 'columbus', 'cincinnati',
  'cleveland', 'indianapolis', 'st louis', 'st. louis', 'saint louis', 'greater st louis', 'greater st. louis', 'kansas city',
  'portland', 'salt lake city', 'nashville', 'memphis', 'milwaukee', 'bay area', 'silicon valley',
  'baltimore', 'richmond', 'mclean', 'herndon', 'reston', 'sterling', 'ashburn', 'fairfax', 'washington dc'
]);

export function isLocationOrCountry(val: any): boolean {
  if (!val || typeof val !== 'string') return false;
  const clean = val.trim();
  const lower = clean.toLowerCase();
  const upper = clean.toUpperCase();
  const lowerNoPunct = lower.replace(/[.'-]/g, ' ').replace(/\s+/g, ' ').trim();

  // Header/label words matching location
  if (/^(location|current\s*location|candidate\s*location|city|state|country|address|region|metro|preferred\s*location)$/i.test(lower)) return true;

  // Countries
  if (['united states', 'usa', 'us', 'india', 'canada', 'uk', 'united kingdom'].includes(lower)) return true;

  // States & State Codes
  if (US_STATES.has(lower) || US_STATES.has(lowerNoPunct) || US_STATE_CODES.has(upper)) return true;

  // Cities & Metros
  if (US_CITIES.has(lower) || US_CITIES.has(lowerNoPunct)) return true;
  if (/^(greater|central|northern|southern|bay\s*area|metro|tri-state)\s+[a-z\s.'-]+$/i.test(lower)) return true;
  if (/^(remote|hybrid|onsite|open\s*to\s*us|nationwide|relocation\s*open|open\s*to\s*relocate)$/i.test(lower)) return true;

  // Standard City, ST or City, State
  if (/^[A-Za-z\s.'-]+,\s*([A-Za-z]{2}|[A-Za-z\s]+)$/.test(clean)) return true;
  return false;
}

export const AREA_CODE_MAP: Record<string, string> = {
  '512': 'Austin, TX', '737': 'Austin, TX', '214': 'Dallas, TX', '469': 'Dallas, TX', '972': 'Dallas, TX',
  '817': 'Fort Worth, TX', '713': 'Houston, TX', '281': 'Houston, TX', '832': 'Houston, TX',
  '210': 'San Antonio, TX', '726': 'San Antonio, TX',
  '312': 'Chicago, IL', '773': 'Chicago, IL', '872': 'Chicago, IL', '331': 'Chicago, IL', '630': 'Chicago, IL', '847': 'Chicago, IL',
  '404': 'Atlanta, GA', '678': 'Atlanta, GA', '470': 'Atlanta, GA', '770': 'Atlanta, GA',
  '704': 'Charlotte, NC', '980': 'Charlotte, NC', '919': 'Raleigh, NC', '984': 'Raleigh, NC',
  '408': 'San Jose, CA', '669': 'San Jose, CA', '415': 'San Francisco, CA', '628': 'San Francisco, CA', '510': 'San Francisco / Bay Area, CA',
  '213': 'Los Angeles, CA', '310': 'Los Angeles, CA', '323': 'Los Angeles, CA', '818': 'Los Angeles, CA', '619': 'San Diego, CA', '858': 'San Diego, CA',
  '206': 'Seattle, WA', '425': 'Seattle, WA',
  '212': 'New York, NY', '718': 'New York, NY', '917': 'New York, NY', '646': 'New York, NY', '347': 'New York, NY',
  '201': 'Jersey City, NJ', '551': 'Jersey City, NJ', '732': 'Central NJ', '848': 'Central NJ', '908': 'Central NJ', '609': 'Princeton, NJ',
  '215': 'Philadelphia, PA', '267': 'Philadelphia, PA',
  '480': 'Phoenix, AZ', '602': 'Phoenix, AZ', '623': 'Phoenix, AZ',
  '303': 'Denver, CO', '720': 'Denver, CO',
  '813': 'Tampa, FL', '407': 'Orlando, FL', '305': 'Miami, FL', '786': 'Miami, FL',
  '612': 'Minneapolis, MN', '651': 'St. Paul, MN',
  '313': 'Detroit, MI', '248': 'Detroit, MI', '586': 'Detroit, MI',
  '614': 'Columbus, OH', '380': 'Columbus, OH', '317': 'Indianapolis, IN',
  '314': 'St. Louis, MO', '615': 'Nashville, TN', '629': 'Nashville, TN',
  '703': 'Northern VA', '571': 'Northern VA', '202': 'Washington, DC',
  '503': 'Portland, OR', '971': 'Portland, OR', '801': 'Salt Lake City, UT',
};

export function inferLocationFromPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  let areaCode = '';
  if (digits.length === 10) {
    areaCode = digits.slice(0, 3);
  } else if (digits.length === 11 && digits.startsWith('1')) {
    areaCode = digits.slice(1, 4);
  }
  return AREA_CODE_MAP[areaCode] || null;
}

export function extractLocationFromFeedback(feedback?: string | null): string | null {
  if (!feedback) return null;
  const s = String(feedback);
  const cityStateMatch = s.match(/\b([A-Z][a-zA-Z\s]{2,20}),\s*([A-Z]{2})\b/);
  if (cityStateMatch) {
    const city = cityStateMatch[1].trim();
    const st = cityStateMatch[2].toUpperCase();
    if (US_STATE_CODES.has(st) || US_CITIES.has(city.toLowerCase())) {
      return `${city}, ${st}`;
    }
    return `${city}, ${st}`;
  }
  const metroMatch = s.match(/\b(Central NJ|Northern VA|Jersey City|Bay Area|Silicon Valley)\b/i);
  if (metroMatch) {
    return metroMatch[1];
  }
  return null;
}

/**
 * Normalizes and resolves candidate location.
 * User requirement: "in location if state or city nother then simply put united states"
 */
export function resolveCandidateLocation(
  rawLocation?: string | null,
  feedback?: string | null,
  phone?: string | null
): string {
  let loc = (rawLocation || '').trim();

  // If raw location is empty, dash, placeholder or general unspecific text
  if (
    !loc ||
    loc === '—' ||
    loc === '-' ||
    /^n\/?a$/i.test(loc) ||
    /^none$/i.test(loc) ||
    /^null$/i.test(loc) ||
    /^undefined$/i.test(loc) ||
    /^(open to us|open to relocate|nationwide|anywhere in us|remote|us|usa|united states)$/i.test(loc)
  ) {
    loc = '';
  }

  // 1. Try to extract specific City, State from feedback notes if raw location didn't provide one
  if (!loc) {
    const feedbackLoc = extractLocationFromFeedback(feedback);
    if (feedbackLoc && !/^(open to us|united states)$/i.test(feedbackLoc)) {
      loc = feedbackLoc;
    }
  }

  // 2. Try to infer from Phone area code
  if (!loc) {
    const phoneLoc = inferLocationFromPhone(phone);
    if (phoneLoc) {
      loc = phoneLoc;
    }
  }

  // 3. Check if raw location is already a known city or state
  if (loc) {
    const lower = loc.toLowerCase();
    const isStateCode = US_STATE_CODES.has(loc.toUpperCase());
    const isStateName = US_STATES.has(lower);
    const isCity = US_CITIES.has(lower);
    const hasCityStatePattern = /,\s*[A-Z]{2}\b/i.test(loc) || /central nj|northern va|jersey city/i.test(lower);

    if (isStateCode || isStateName || isCity || hasCityStatePattern) {
      return loc;
    }
  }

  // 4. Fallback: "in location if state or city nother then simply put united states"
  return loc || 'United States';
}

export const COLUMN_PATTERNS: Record<TargetColumn, string[]> = {
  full_name: ['full name', 'candidate name', 'applicant name', 'name', 'candidate', 'person name'],
  first_name: ['first name', 'firstname', 'first_name', 'candidate first name', 'f name', 'fname'],
  last_name: ['last name', 'lastname', 'last_name', 'candidate last name', 'l name', 'lname', 'surname'],
  email: [
    'email',
    'email address',
    'emailaddress',
    'candidate email',
    'primary email',
    'e-mail',
    'mail',
    'email i d',
    'email id',
    'email i',
  ],
  phone: [
    'phone',
    'phone number',
    'mobile',
    'mobile number',
    'cell',
    'cell phone',
    'contact number',
    'telephone',
  ],
  linkedin_url: ['linkedin', 'linkedin url', 'profile url', 'linkedin profile', 'social url', 'linkedin link'],
  location: [
    'location',
    'city',
    'state',
    'city/state',
    'city, state',
    'metro',
    'address',
    'current location',
    'candidate location',
    'location / city / state',
    'location city state',
  ],
  preferred_location: [
    'preferred location',
    'relocation',
    'open to',
    'preferred city',
    'desired location',
    'target location',
  ],
  secondary_email: [
    'secondary email',
    'alternate email',
    'alt email',
    'other email',
    'personal email',
    'email 2',
  ],
  secondary_phone: [
    'secondary phone',
    'alternate phone',
    'alt phone',
    'other phone',
    'alternate contact',
    'mobile 2',
    'phone 2',
  ],
  company: ['company', 'entity', 'organization', 'client', 'firm'],
  job_title: ['job title', 'job', 'position', 'role', 'title', 'opening', 'job role', 'req title', 'da', 'ba', 'edi', 'aws', 'data analyst', 'business analyst'],
  job_id: ['job id', 'job_id', 'req id', 'requisition id', 'ats id', 'ats_job_id', 'req #'],
  date_applied: [
    'date assigned',
    'assigned date',
    'date applied',
    'applied date',
    'assign date',
    'assigned on',
    'application date',
    'submission date',
    'date',
    'applied on',
  ],
  current_stage: ['current stage', 'stage', 'status', 'application status', 'pipeline stage', 'step'],
  recruiter_name: [
    'recruiter', 'recruiter name', 'recruiters', 'recuter', 'reciuter', 'sourcer', 'recruiter assigned',
    'assigned recruiter', 'contacted by', 'interviewer', 'adam', 'alex'
  ],
  recruiter_feedback: [
    'recruiter feedback',
    'feedback',
    'feedback 1',
    'feedback 2',
    'feedback 3',
    'feedback1',
    'feedback2',
    'fb',
    'fb 1',
    'fb 2',
    'fb 3',
    'fb1',
    'fb2',
    'fb3',
    'f/b',
    'f/b 1',
    'f/b 2',
    'notes',
    'note',
    'notes 1',
    'notes 2',
    'note 1',
    'note 2',
    'recruiter notes',
    'recruiter note',
    'recruiter notes 1',
    'recruiter notes 2',
    'candidate notes',
    'candidate feedback',
    'candidate remarks',
    'comments',
    'comment',
    'comments 1',
    'recruiter comments',
    'recruiter comment',
    'call notes',
    'call note',
    'call notes 1',
    'calling notes',
    'original feedback',
    'original notes',
    'remarks',
    'remark',
    'remarks 1',
    'recruiter remarks',
    'recruiter remark',
    'touchpoint notes',
    'touchpoint',
    'touchpoints',
    'touchpoint 1',
    'touchpoint 2',
    'status notes',
    'status feedback',
    'contact notes',
    'contact feedback',
    'screening notes',
    'screening note',
    'screening feedback',
    'screening round',
    'screening',
    'interview notes',
    'interview feedback',
    'interview comments',
    'interview remarks',
    'round 1 feedback',
    'review',
    'review notes',
    'summary notes',
    'discussion',
    'discussion notes',
    'disposition',
    'disposition notes',
    'follow up',
    'follow-up',
    'followup',
    'follow-up notes',
    'follow up notes',
    'client feedback',
  ],
  contact_date: ['contact date', 'call date', 'activity date', 'outreach date', 'last contact'],
  contact_type: ['contact type', 'channel', 'mode', 'method', 'type'],
  resume_link: [
    'resume', 'resume link', 'resume url', 'cv', 'cv link', 'google drive link', 'resume document',
    'resume link / linkedin profile', 'resume link / linkedin', 'resume link/linkedin profile', 'resume / linkedin', 'resume link/linkedin'
  ],
  status: ['candidate status', 'operational status', 'talent status'],
  owner: [
    'current owner', 'owner', 'owners', 'recruiter', 'recruiter name', 'recruiters', 'recuter', 'reciuter',
    'recruiter/owner', 'owner/recruiter', 'recruiter owner', 'owner recruiter', 'account manager',
    'lead recruiter', 'lead owner', 'assigned owner', 'assigned recruiter', 'assigned to', 'assignee', 'adam', 'alex', 'sourcer'
  ],
  gender: ['gender', 'sex', 'salutation', 'title', 'mr/ms', 'prefix', 'gender identity'],
  green_card: [
    'green card/ us-c', 'green card / us-c', 'green card/us-c', 'green card / us citizen',
    'green card or us citizen', 'green card', 'gc / us-c', 'gc/us-c', 'us citizen', 'us-c',
    'do you have a green card or us citizen ?', 'do you have a green card or us citizen',
    'gc us c', 'green card us c', 'greencard'
  ],
  h1b_status: [
    'h1b-y/n', 'h1b - y/n', 'h1b/y/n', 'h1b', 'h1-b', 'h1b y/n', 'visa sponsorship',
    'will you now or in the future require sponsorship', 'sponsorship required', 'work authorization',
    'h1b y n', 'h1b yn', 'h 1b y n', 'h 1b', 'h1b visa', 'h1b visa y n'
  ],
  ignore: [],
};

/**
 * Comprehensive recruiter feedback header detection.
 * Supports:
 * - Feedback 1, Feedback 2, Feedback 3 ... Feedback 10, Feedback 20 (numbered)
 * - Feedback1, Feedback2 (no space)
 * - Feedback - 1, Feedback_1, Feedback #1
 * - Feedback (without number)
 * - Recruiter Feedback, Recruiter Feedback 1, Recruiter Feedback 2
 * - Candidate Feedback, Candidate Notes, Candidate Remarks
 * - FB, FB 1, FB 2, FB1, FB2, F/B, F/B 1, F/B 2
 * - Notes, Note, Notes 1, Notes 2, Recruiter Notes, Recruiter Note
 * - Follow-up Notes, Follow up Notes, Followup Notes, Follow up, Follow-up
 * - Comments, Remarks, Call Notes, Touchpoint Notes, Screening Notes
 * - Discussion, Disposition, Review, Status Notes, Contact Notes
 */
// EXPLICIT NON-FEEDBACK HEADERS: Check these first to avoid false positives!
export const NON_FEEDBACK_EXACT_HEADERS = new Set([
  'candidate name', 'candidate full name', 'full name', 'first name', 'last name', 'name',
  'applicant name', 'consultant name', 'person name',
  'email', 'email address', 'primary email', 'secondary email', 'alt email', 'email id', 'email i d',
  'phone', 'phone number', 'primary phone', 'secondary phone', 'mobile', 'mobile number', 'contact number',
  'job title', 'job role', 'role', 'position', 'opening', 'req title', 'ats job id', 'job id', 'req id',
  'company', 'entity', 'organization', 'client', 'firm',
  'location', 'city', 'state', 'zip', 'zip code', 'metro', 'address', 'current location', 'candidate location',
  'preferred location', 'desired location', 'relocation',
  'date', 'date applied', 'applied date', 'date assigned', 'assigned date', 'submission date',
  'status', 'candidate status', 'operational status', 'pipeline stage', 'stage', 'current stage',
  'resume', 'resume link', 'resume url', 'cv', 'cv link',
  'linkedin', 'linkedin url', 'linkedin profile', 'profile url',
  'gender', 'sex', 'salutation',
  'recruiter', 'recruiter name', 'assigned owner', 'owner', 'lead recruiter', 'sourcer'
]);

export function detectFeedbackHeader(header: string): {
  isFeedback: boolean;
  feedbackIndex: number | null;
  feedbackLabel: string;
} {
  if (!header || typeof header !== 'string') {
    return { isFeedback: false, feedbackIndex: null, feedbackLabel: '' };
  }

  const trimmed = header.trim();
  const clean = trimmed
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[-_#:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (NON_FEEDBACK_EXACT_HEADERS.has(clean)) {
    return { isFeedback: false, feedbackIndex: null, feedbackLabel: trimmed };
  }

  // Pure non-feedback fields safeguard (unless accompanied by an explicit feedback word)
  const hasFeedbackKeyword =
    /(feedback|notes?|remarks?|comments?|touchpoint|touch\s*point|discussion|disposition|follow[\s-]*up|screening|\bfb\b|\bfb\s*\d+\b|f\/b|review|interview)/i.test(clean) ||
    /(feedback|notes?|remarks?|comments?|touchpoint|touch\s*point|discussion|disposition|follow[\s-]*up|screening|\bfb\d*\b|f\/b|review|interview)/i.test(trimmed);
  if (!hasFeedbackKeyword) {
    return { isFeedback: false, feedbackIndex: null, feedbackLabel: trimmed };
  }

  // Safeguard: If header is primarily a non-feedback field with no feedback context, exclude
  if (/^(candidate\s*name|full\s*name|first\s*name|last\s*name|recruiter\s*name|owner\s*name)$/i.test(clean)) {
    return { isFeedback: false, feedbackIndex: null, feedbackLabel: trimmed };
  }

  // 1. Numbered Feedback: "Feedback 1", "Feedback 2", "Feedback 1 - Adam", "Feedback 1 (Adam)", "Feedback #1", "Feedback_1"
  // Also: "FB 1", "FB1", "FB 2", "FB2", "F/B 1", "F/B 2", "Round 1 Feedback"
  const fbNumMatch = clean.match(/^(?:recruiter\s*|candidate\s*|round\s*)?(?:feedback|\bfb\b|f\/b)\s*(\d+)/i) ||
                     clean.match(/\b(?:feedback|\bfb\b|f\/b)\s*(\d+)\b/i);
  if (fbNumMatch) {
    const num = parseInt(fbNumMatch[1], 10);
    return {
      isFeedback: true,
      feedbackIndex: num,
      feedbackLabel: `Feedback ${num}`,
    };
  }

  // 2. Numbered Notes / Comments / Remarks / Touchpoint / Interview
  // e.g. "Notes 1", "Notes 2", "Recruiter Notes 1", "Comment 2", "Touchpoint 1", "Follow-up 1", "Interview 1"
  const noteNumMatch = clean.match(/^(?:recruiter\s*|candidate\s*|call\s*|screening\s*)?(?:notes?|comments?|remarks?|touchpoint|touch\s*point|follow[\s-]*up|discussion|disposition|interview)\s*(\d+)/i) ||
                       clean.match(/\b(?:notes?|comments?|remarks?|touchpoint|follow[\s-]*up|interview)\s*(\d+)\b/i);
  if (noteNumMatch) {
    const num = parseInt(noteNumMatch[1], 10);
    return {
      isFeedback: true,
      feedbackIndex: num,
      feedbackLabel: trimmed,
    };
  }

  // 3. Unnumbered Feedback variants: "Feedback", "Recruiter Feedback", "Candidate Feedback", "FB", "F/B", "Client Feedback"
  if (/^(?:recruiter\s*|candidate\s*|client\s*|team\s*|internal\s*|screening\s*|interview\s*)?(?:feedback|\bfb\b|f\/b)$/i.test(clean)) {
    return {
      isFeedback: true,
      feedbackIndex: null,
      feedbackLabel: trimmed || 'Feedback',
    };
  }

  // 4. Unnumbered Notes / Comments / Remarks / Touchpoint / Follow up / Discussion / Disposition / Screening
  if (/^(?:recruiter\s*|candidate\s*|call\s*|screening\s*|touchpoint\s*|interview\s*|original\s*|status\s*|contact\s*)?(?:notes?|comments?|remarks?|touchpoint|touch\s*point|follow[\s-]*up|discussion|disposition|original\s*feedback)$/i.test(clean)) {
    return {
      isFeedback: true,
      feedbackIndex: null,
      feedbackLabel: trimmed,
    };
  }

  // 5. Compound headers with Feedback / Notes (e.g. "Date / Feedback", "Feedback 1 - Adam", "Feedback - Alex", "Notes - Recruiter")
  if (hasFeedbackKeyword) {
    const numMatch = clean.match(/\b(\d+)\b/);
    const num = numMatch ? parseInt(numMatch[1], 10) : null;
    return {
      isFeedback: true,
      feedbackIndex: num,
      feedbackLabel: trimmed,
    };
  }

  return { isFeedback: false, feedbackIndex: null, feedbackLabel: trimmed };
}

/**
 * Detects whether a row is an instructional / sub-header / metadata row
 * (e.g. Row containing "Candidate Full Name: Email I'd", "Recruiter Feedback: GREEN CARD/ US-C",
 *  "Feedback 2: H1B-Y/N Resume Link / Linkedin Profile") rather than a real candidate.
 */
export function isSubheaderRow(row: Record<string, any> | string[], headers?: string[]): boolean {
  if (!row) return false;

  if (Array.isArray(row)) {
    const cells = row.map(c => String(c || '').trim());
    const hasSubheaderKeywords = cells.some(v =>
      /^(email\s*i'?d|email|green\s*card\s*\/\s*us-?c|h1b-?y\/?n|resume\s*link|linkedin\s*profile|screening\s*questions|column\s*#?\d+)$/i.test(v) ||
      (/\bgreen\s*card\b/i.test(v) && /\bus-?c\b/i.test(v)) ||
      (/\bh1b\b/i.test(v) && /\bresume\b/i.test(v)) ||
      (/\bresume\s*link\b/i.test(v) && /\blinkedin\b/i.test(v))
    );

    const hasRealEmail = cells.some(c => c.includes('@') && c.includes('.') && !/^(email|email\s*i'?d|e-mail)$/i.test(c));
    const hasRealPhone = cells.some(c => c.replace(/\D/g, '').length >= 10);

    return hasSubheaderKeywords && (!hasRealEmail || !hasRealPhone);
  } else {
    const values = Object.values(row).map(v => String(v || '').trim());
    const nameVal = String(
      row['Candidate Full Name'] || row['Candidate Name'] || row['Full Name'] || row['Name'] || ''
    ).trim().toLowerCase();

    // 1. Is name column a header word (e.g. "Email I'd", "Candidate Name", "Name", "Role")?
    const isNameHeaderWord = /^(email\s*i'?d|email|phone|contact|name|candidate\s*name|full\s*name|job\s*title|role|header|col\s*#?\d+)$/i.test(nameVal);

    // 2. Does any cell contain clear subheader keywords?
    const hasSubheaderKeywords = values.some(v =>
      /^(green\s*card\s*\/\s*us-?c|h1b-?y\/?n|resume\s*link|linkedin\s*profile|screening\s*questions|instructions?|column\s*name)$/i.test(v) ||
      (/\bgreen\s*card\b/i.test(v) && /\bus-?c\b/i.test(v)) ||
      (/\bh1b\b/i.test(v) && /\bresume\b/i.test(v)) ||
      (/\bresume\s*link\b/i.test(v) && /\blinkedin\b/i.test(v))
    );

    const hasRealEmail = values.some(v => v.includes('@') && v.includes('.') && !/^(email|email\s*i'?d|e-mail)$/i.test(v));
    const hasRealPhone = values.some(v => {
      const d = v.replace(/\D/g, '');
      return d.length >= 10 && d.length <= 15;
    });

    if ((isNameHeaderWord || hasSubheaderKeywords) && (!hasRealEmail || !hasRealPhone)) {
      return true;
    }

    return false;
  }
}

/**
 * Automatically maps raw headers from uploaded file to normalized target columns
 * Enhanced with Subheader Annotations and Sample Content Pattern Intelligence
 */
export function autoDetectMappings(
  headers: string[],
  sampleRows: Record<string, any>[] = [],
  subheaders: Record<string, string> = {}
): ColumnMappingConfig[] {
  return headers.map((header, colIdx) => {
    const cleanHeader = header
      .toLowerCase()
      .trim()
      .replace(/([a-z])(\d)/g, '$1 $2')
      .replace(/[_\W]+/g, ' ')
      .trim();
    let bestTarget: TargetColumn = 'ignore';
    let highestScore = 0;
    let feedbackIndex: number | null = null;
    let feedbackLabel: string | undefined = undefined;

    // Extract sample values from first few rows
    const sampleValues: string[] = [];
    for (const row of (sampleRows || []).slice(0, 10)) {
      const val = row[header];
      if (val !== undefined && val !== null && String(val).trim()) {
        sampleValues.push(String(val).trim());
      }
    }

    const subheaderText = subheaders && subheaders[header] ? String(subheaders[header]).trim() : '';
    const subheaderLower = subheaderText.toLowerCase();

    // Check if sample values or subheader contain Google Drive Resume links or LinkedIn Profile links
    const hasDriveUrl = sampleValues.some(v => v.toLowerCase().includes('drive.google.com'));
    const hasLinkedInUrl = sampleValues.some(v => v.toLowerCase().includes('linkedin.com/in') || v.toLowerCase().includes('linkedin.com'));
    const hasResumeInSubheader = subheaderLower.includes('resume');
    const hasLinkedInInSubheader = subheaderLower.includes('linkedin');

    // 0. PRIORITY 0: Direct Green Card & H1B Detection (Subheader hints or explicit cleanHeader)
    if (
      subheaderLower.includes('green card') ||
      subheaderLower.includes('us-c') ||
      subheaderLower.includes('us citizen') ||
      subheaderLower.includes('gc/us-c') ||
      subheaderLower.includes('gc / us-c') ||
      cleanHeader.includes('green card') ||
      cleanHeader === 'gc us c' ||
      cleanHeader === 'us c' ||
      cleanHeader === 'us citizen' ||
      cleanHeader.includes('greencard')
    ) {
      bestTarget = 'green_card';
      highestScore = 1.0;
    } else if (
      (subheaderLower.includes('h1b') && !subheaderLower.includes('resume') && !subheaderLower.includes('drive')) ||
      cleanHeader.includes('h1b') ||
      cleanHeader.includes('h 1b') ||
      cleanHeader === 'visa' ||
      cleanHeader.includes('visa sponsorship') ||
      cleanHeader === 'h1b y n' ||
      cleanHeader === 'h1b yn' ||
      cleanHeader.startsWith('h1b')
    ) {
      bestTarget = 'h1b_status';
      highestScore = 1.0;
    } else if (hasDriveUrl || (hasResumeInSubheader && !hasLinkedInUrl)) {
      bestTarget = 'resume_link';
      highestScore = 1.0;
    } else if (hasLinkedInUrl || (hasLinkedInInSubheader && !hasDriveUrl)) {
      bestTarget = 'linkedin_url';
      highestScore = 1.0;
    } else if (cleanHeader.includes('resume') || cleanHeader.includes('cv') || cleanHeader.includes('drive')) {
      bestTarget = 'resume_link';
      highestScore = 1.0;
    } else if (cleanHeader.includes('linkedin')) {
      bestTarget = 'linkedin_url';
      highestScore = 1.0;
    } else {
      // 0b. Dynamic Recruiter Feedback detection (handles Feedback 1..N, Follow-up Notes, Comments, etc.)
      const fbDetect = detectFeedbackHeader(header);
      if (fbDetect.isFeedback) {
        bestTarget = 'recruiter_feedback';
        highestScore = 1.0;
        feedbackIndex = fbDetect.feedbackIndex;
        feedbackLabel = fbDetect.feedbackLabel;
      } else if (cleanHeader === 'email i d' || cleanHeader === 'email id' || cleanHeader === 'email' || cleanHeader === 'email address' || cleanHeader === 'primary email') {
        bestTarget = 'email';
        highestScore = 1.0;
      } else if (cleanHeader === 'secondary email' || cleanHeader === 'alternate email' || cleanHeader === 'alt email' || cleanHeader === 'other email' || cleanHeader === 'email 2') {
        bestTarget = 'secondary_email';
        highestScore = 1.0;
      } else if (cleanHeader === 'role' || cleanHeader === 'job title' || cleanHeader === 'da' || cleanHeader === 'ba' || cleanHeader === 'edi' || cleanHeader === 'aws') {
        bestTarget = 'job_title';
        highestScore = 1.0;
      } else if (cleanHeader === 'contact number' || cleanHeader === 'phone' || cleanHeader === 'phone number' || cleanHeader === 'contact' || cleanHeader === 'primary phone') {
        bestTarget = 'phone';
        highestScore = 1.0;
      } else if (cleanHeader === 'secondary phone' || cleanHeader === 'alternate phone' || cleanHeader === 'alt phone' || cleanHeader === 'other phone' || cleanHeader === 'phone 2' || cleanHeader === 'mobile 2') {
        bestTarget = 'secondary_phone';
        highestScore = 1.0;
      } else if (
        cleanHeader === 'location' ||
        cleanHeader === 'city' ||
        cleanHeader === 'state' ||
        cleanHeader === 'current location' ||
        cleanHeader === 'candidate location' ||
        cleanHeader === 'city state' ||
        cleanHeader === 'city / state' ||
        cleanHeader === 'city/state' ||
        cleanHeader === 'metro' ||
        cleanHeader === 'address' ||
        cleanHeader === 'location / city / state' ||
        cleanHeader === 'location city state'
      ) {
        bestTarget = 'location';
        highestScore = 1.0;
      } else if (
        cleanHeader === 'preferred location' ||
        cleanHeader === 'relocation' ||
        cleanHeader === 'desired location' ||
        cleanHeader === 'target location' ||
        cleanHeader === 'preferred city'
      ) {
        bestTarget = 'preferred_location';
        highestScore = 1.0;
      } else if (
        /(feedback|notes?|remarks?|comments?|touchpoint|screening)/i.test(cleanHeader) &&
        !/(name|email|phone|date|role|title|location|city)/i.test(cleanHeader)
      ) {
        bestTarget = 'recruiter_feedback';
        highestScore = 1.0;
        feedbackLabel = header.trim();
      } else if (
        /^(owner|recruiter|recuter|reciuter|ownwer|recruiter name|owner name|assigned owner|assigned recruiter|lead recruiter|lead owner|assigned to|assignee|recruiter owner|owner recruiter|sourcer)$/i.test(cleanHeader) ||
        (/\b(owner|recruiter|recuter|reciuter|ownwer)\b/i.test(cleanHeader) && !/(feedback|notes?|remarks?|comments?|touchpoint|round|screening)/i.test(cleanHeader))
      ) {
        bestTarget = 'owner';
        highestScore = 1.0;
      } else if (cleanHeader === 'date' || cleanHeader === 'date assigned' || cleanHeader === 'date applied') {
        bestTarget = 'date_applied';
        highestScore = 1.0;
      } else if (cleanHeader === 'name' || cleanHeader === 'candidate name' || cleanHeader === 'candidate full name' || cleanHeader === 'full name') {
        bestTarget = 'full_name';
        highestScore = 1.0;
      }
    }

    if (highestScore < 1.0) {
      for (const [target, patterns] of Object.entries(COLUMN_PATTERNS) as [TargetColumn, string[]][]) {
        for (const pattern of patterns) {
          if (cleanHeader === pattern) {
            bestTarget = target;
            highestScore = 1.0;
            break;
          } else if (cleanHeader.includes(pattern)) {
            if (highestScore < 0.85) {
              bestTarget = target;
              highestScore = 0.85;
            }
          } else if (cleanHeader.length >= 4 && pattern.includes(cleanHeader)) {
            if (highestScore < 0.7) {
              bestTarget = target;
              highestScore = 0.7;
            }
          }
        }
        if (highestScore === 1.0) break;
      }
    }

    // Special cases: DA / BA / EDI / AWS are Requisitions or Job Titles, NOT Candidate Names!
    if (cleanHeader === 'da' || cleanHeader === 'ba' || cleanHeader === 'edi' || cleanHeader === 'aws' || cleanHeader === 'role' || cleanHeader === 'position') {
      bestTarget = 'job_title';
      highestScore = 0.98;
    }

    // Secondary intelligence: infer from sample content ONLY if header was not already an exact match
    if (highestScore < 1.0 && sampleValues.length > 0) {
      if (sampleValues.some(v => isDateString(v))) {
        bestTarget = 'date_applied';
        highestScore = 0.98;
      } else if (sampleValues.some(v => v.includes('@') && v.includes('.'))) {
        bestTarget = 'email';
        highestScore = 0.98;
      } else if (sampleValues.some(v => v.toLowerCase().includes('linkedin.com/in') || v.toLowerCase().includes('linkedin.com'))) {
        bestTarget = 'linkedin_url';
        highestScore = 0.98;
      } else if (sampleValues.some(v => v.toLowerCase().includes('drive.google.com'))) {
        bestTarget = 'resume_link';
        highestScore = 0.98;
      } else if (sampleValues.some(v => ['adam', 'alex', 'unassigned'].includes(v.toLowerCase().trim()))) {
        bestTarget = 'owner';
        highestScore = 0.98;
      } else if (sampleValues.some(v => ['ba', 'da', 'edi', 'aws', 'qa', 'pm', 'developer', 'engineer', 'analyst', 'data analyst', 'business analyst'].includes(v.toLowerCase().trim()))) {
        bestTarget = 'job_title';
        highestScore = 0.98;
      } else if (sampleValues.some(v => v.replace(/\D/g, '').length >= 10)) {
        bestTarget = 'phone';
        highestScore = 0.95;
      } else if (
        sampleValues.some(v =>
          v.length > 20 ||
          /(citizen|green card|opt|visa|underage|desi|experience|bachelors|masters|package|\$|per hour|\/hr|call back|not on|he is|she is|interview|assessment|looking|expecting|\blvm\b|left\s*vm|voicemail|jd\s*sent|no\s*answer|\brnr\b|ring\s*no\s*response|not\s*interested|call\s*tomorrow|scheduled|attended|shortlisted|rejected|c2c|w2|\b1099\b|opt\s*ead|\bvm\b|calling|wrong\s*number|busy|hold|employer|split)/i.test(
            v
          )
        )
      ) {
        if (bestTarget === 'ignore' || highestScore < 0.85) {
          bestTarget = 'recruiter_feedback';
          highestScore = 0.90;
          feedbackLabel = header.trim();
        }
      } else if (
        sampleValues.length > 0 &&
        (!cleanHeader || /^(__empty|column\s*\d+|unnamed)/i.test(cleanHeader) || !NON_FEEDBACK_EXACT_HEADERS.has(cleanHeader))
      ) {
        // Any unmapped extra column with text that is not phone, email, date -> Recruiter Feedback / Notes
        const isNotCoreData = !sampleValues.some(v => isPhoneNumber(v) || v.includes('@') || isDateString(v));
        if (isNotCoreData && (bestTarget === 'ignore' || highestScore < 0.85)) {
          bestTarget = 'recruiter_feedback';
          highestScore = 0.88;
          feedbackLabel = cleanHeader && !/^(__empty|unnamed)/i.test(cleanHeader) ? header.trim() : `Feedback ${colIdx + 1}`;
          feedbackIndex = colIdx + 1;
        }
      }
    }

    // CRITICAL SAFEGUARD 1: Candidate Full Name MUST NEVER be mapped to a column containing role codes (DA, BA, AWS, EDI)!
    let safeguardApplied = false;
    if (bestTarget === 'full_name' && sampleValues.some(v => isATSJobRoleTitle(v))) {
      bestTarget = 'job_title';
      highestScore = 0.98;
      safeguardApplied = true;
    }

    // SAFEGUARD 2: Only drop email target if header is NOT an explicit email header (never drop 'Email', 'Email Address', 'Email ID')
    const isExplicitEmailHeader = /(email|e-mail|e mail|\bmail\b)/i.test(cleanHeader);
    if (bestTarget === 'email' && !isExplicitEmailHeader && sampleValues.length > 0 && !sampleValues.some(v => v.includes('@'))) {
      bestTarget = 'ignore';
    }

    return {
      sourceColumn: header,
      targetColumn: bestTarget,
      confidence: highestScore,
      sampleValues,
      safeguardApplied,
      columnIndex: colIdx,
      subheader: subheaderText || undefined,
      feedbackIndex: bestTarget === 'recruiter_feedback' ? feedbackIndex : undefined,
      feedbackLabel: bestTarget === 'recruiter_feedback' ? (feedbackLabel || header.trim()) : undefined,
    };
  });
}

/**
 * Parse uploaded file (XLSX, XLS, CSV) into raw JSON rows and preview headers
 * Detects and extracts secondary sub-header rows to prevent garbage candidates in preview!
 */
export function getAccurateWorksheetRange(worksheet: XLSX.WorkSheet): XLSX.Range | null {
  if (!worksheet) return null;
  let minR = Infinity, maxR = -1;
  let minC = Infinity, maxC = -1;

  for (const key of Object.keys(worksheet)) {
    if (key.startsWith('!')) continue;
    try {
      const cell = XLSX.utils.decode_cell(key);
      if (cell.r < minR) minR = cell.r;
      if (cell.r > maxR) maxR = cell.r;
      if (cell.c < minC) minC = cell.c;
      if (cell.c > maxC) maxC = cell.c;
    } catch {}
  }

  if (maxR === -1 || maxC === -1) return null;
  return { s: { r: minR, c: minC }, e: { r: maxR, c: maxC } };
}

/**
 * Parse uploaded file (XLSX, XLS, CSV) into raw JSON rows, preview headers, and comprehensive row-count diagnostics
 * Detects and extracts secondary sub-header rows to prevent garbage candidates in preview!
 */
/**
 * Detects and automatically splits columns that merge H1B Y/N and Resume Link into a single cell
 * (e.g. Header/Subheader "H1B-Y/N Resume Link / Linkedin Profile" with values "No https://drive.google.com/...")
 */
export function splitMergedH1bColumns(
  headers: string[],
  subheaders: Record<string, string>,
  rows: Record<string, any>[]
): { headers: string[]; subheaders: Record<string, string>; rows: Record<string, any>[] } {
  const mergedCols: string[] = [];
  for (const h of headers) {
    const sub = (subheaders[h] || '').toLowerCase();
    const head = h.toLowerCase();
    const sampleVals = rows.slice(0, 15).map(r => String(r[h] || '').trim()).filter(Boolean);

    const isMerged = (
      (sub.includes('h1b') && (sub.includes('resume') || sub.includes('link') || sub.includes('profile') || sub.includes('drive'))) ||
      (head.includes('h1b') && (head.includes('resume') || head.includes('link') || head.includes('profile') || head.includes('drive'))) ||
      sampleVals.some(v => /^(yes|no|y|n)\s+https?:\/\//i.test(v) || /(https?:\/\/\S+)\s+(yes|no|y|n)$/i.test(v))
    );

    if (isMerged) {
      mergedCols.push(h);
    }
  }

  if (mergedCols.length === 0) {
    return { headers, subheaders, rows };
  }

  const newHeaders: string[] = [];
  const newSubheaders: Record<string, string> = { ...subheaders };
  const newRows = rows.map(r => ({ ...r }));

  for (const h of headers) {
    if (mergedCols.includes(h)) {
      const h1bCol = 'H1B - Y/N';
      const resumeCol = 'Resume Link';
      newHeaders.push(h1bCol, resumeCol);
      newSubheaders[h1bCol] = 'H1B Visa (Yes/No)';
      newSubheaders[resumeCol] = 'Resume Link (Google Drive)';
      delete newSubheaders[h];

      for (const r of newRows) {
        const val = String(r[h] || '').trim();
        const m = val.match(/^(yes|no|y|n)\s+(https?:\/\/\S+)/i) || val.match(/(https?:\/\/\S+)\s+(yes|no|y|n)$/i);
        if (m) {
          r[h1bCol] = m[1].toLowerCase().startsWith('y') ? 'Yes' : 'No';
          r[resumeCol] = m[2];
        } else if (/^(yes|no|y|n)$/i.test(val)) {
          r[h1bCol] = val.toLowerCase().startsWith('y') ? 'Yes' : 'No';
          r[resumeCol] = '';
        } else if (/^https?:\/\//i.test(val)) {
          r[h1bCol] = '';
          r[resumeCol] = val;
        } else {
          r[h1bCol] = val;
          r[resumeCol] = '';
        }
        delete r[h];
      }
    } else {
      newHeaders.push(h);
    }
  }

  return { headers: newHeaders, subheaders: newSubheaders, rows: newRows };
}

export async function parseFileForPreview(file: File, selectedSheet?: string): Promise<ImportPreviewData> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  
  const availableSheets = workbook.SheetNames || [];
  const sheetRowCounts: Record<string, number> = {};
  let totalRowsAllSheets = 0;

  for (const sName of availableSheets) {
    const sSheet = workbook.Sheets[sName];
    if (sSheet) {
      const sRange = getAccurateWorksheetRange(sSheet);
      if (sRange) {
        const existingR = sSheet['!ref'] ? XLSX.utils.decode_range(sSheet['!ref']) : null;
        if (!existingR || sRange.e.r > existingR.e.r || sRange.e.c > existingR.e.c) {
          sSheet['!ref'] = XLSX.utils.encode_range(sRange);
        }
      }
      const sRows = XLSX.utils.sheet_to_json<Record<string, any>>(sSheet, { defval: '', blankrows: false });
      const nonEmpties = sRows.filter(r => Object.values(r).some(v => v !== undefined && v !== null && String(v).trim().length > 0));
      sheetRowCounts[sName] = nonEmpties.length;
      totalRowsAllSheets += nonEmpties.length;
    } else {
      sheetRowCounts[sName] = 0;
    }
  }

  // Pick target sheet: if selectedSheet is provided and exists, use it.
  // Otherwise, select the sheet with the most rows (or availableSheets[0]).
  let targetSheetName = (selectedSheet && availableSheets.includes(selectedSheet))
    ? selectedSheet
    : '';

  if (!targetSheetName) {
    let maxRows = -1;
    for (const sName of availableSheets) {
      const c = sheetRowCounts[sName] || 0;
      if (c > maxRows) {
        maxRows = c;
        targetSheetName = sName;
      }
    }
    if (!targetSheetName) targetSheetName = availableSheets[0] || 'Sheet1';
  }

  const worksheet = workbook.Sheets[targetSheetName];
  if (!worksheet) {
    throw new Error(`Sheet "${targetSheetName}" not found in workbook.`);
  }

  // Ensure worksheet !ref includes all data cells and does not truncate
  const accurateRange = getAccurateWorksheetRange(worksheet);
  if (accurateRange) {
    const existingRange = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null;
    if (!existingRange || accurateRange.e.r > existingRange.e.r || accurateRange.e.c > existingRange.e.c) {
      worksheet['!ref'] = XLSX.utils.encode_range(accurateRange);
    }
  }

  // Convert to JSON
  let rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '', blankrows: false });
  
  if (rawRows.length === 0) {
    throw new Error(`Sheet "${targetSheetName}" is empty or does not contain data rows.`);
  }

  const headers = Object.keys(rawRows[0] || {});

  // Detect and extract subheader / annotation row (e.g. Row 1 containing "Candidate Full Name: Email I'd", "Recruiter Feedback: GREEN CARD/ US-C")
  const subheaders: Record<string, string> = {};
  let subheaderRowDetected = false;
  if (rawRows.length > 0 && isSubheaderRow(rawRows[0], headers)) {
    subheaderRowDetected = true;
    const subheaderRow = rawRows[0];
    for (const h of headers) {
      const val = String(subheaderRow[h] ?? '').trim();
      if (val) {
        subheaders[h] = val;
      }
    }
    // Remove the subheader row from candidate data rows
    rawRows = rawRows.slice(1);
  }

  // Automatically split merged H1B + Resume Link column if present
  const splitResult = splitMergedH1bColumns(headers, subheaders, rawRows);
  const activeHeaders = splitResult.headers;
  const activeSubheaders = splitResult.subheaders;
  rawRows = splitResult.rows;

  const sampleRows = rawRows.slice(0, 20);
  const mappings = autoDetectMappings(activeHeaders, sampleRows, activeSubheaders);

  // Diagnostic calculations for the selected worksheet
  const physicalRows = accurateRange ? Math.max(0, accurateRange.e.r - accurateRange.s.r) : rawRows.length;
  const nonEmptyRows = rawRows.filter(r => Object.values(r).some(v => v !== undefined && v !== null && String(v).trim().length > 0)).length;

  let validCandidateRows = 0;
  let missingRequiredRows = 0;
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();
  let duplicateRowsInFile = 0;

  for (const r of rawRows) {
    let nameVal = '';
    let emailVal = '';
    let phoneVal = '';

    for (const [k, v] of Object.entries(r)) {
      if (!v) continue;
      const s = String(v).trim();
      const lowerKey = k.toLowerCase();
      if (/name|candidate/i.test(lowerKey) && !nameVal && isValidCandidateName(s)) {
        nameVal = s;
      } else if (/email/i.test(lowerKey) && !emailVal) {
        const norm = normalizeEmail(s);
        if (norm && norm.isValid) emailVal = norm.normalized;
      } else if (/phone|contact|mobile/i.test(lowerKey) && !phoneVal) {
        const norm = normalizePhone(s);
        if (norm && norm.isValid) phoneVal = norm.normalized;
      }
    }

    // Fallback: scan all cells if not mapped by header key
    if (!emailVal || !phoneVal || !nameVal) {
      for (const v of Object.values(r)) {
        if (!v) continue;
        const s = String(v).trim();
        if (!emailVal) {
          const norm = normalizeEmail(s);
          if (norm && norm.isValid) { emailVal = norm.normalized; continue; }
        }
        if (!phoneVal) {
          const norm = normalizePhone(s);
          if (norm && norm.isValid) { phoneVal = norm.normalized; continue; }
        }
        if (!nameVal && isValidCandidateName(s)) {
          nameVal = s;
        }
      }
    }

    const isComplete = Boolean(nameVal && emailVal && phoneVal);
    if (isComplete) {
      validCandidateRows++;
    } else {
      missingRequiredRows++;
    }

    let isDup = false;
    if (emailVal && seenEmails.has(emailVal)) isDup = true;
    if (phoneVal && seenPhones.has(phoneVal)) isDup = true;
    if (isDup) duplicateRowsInFile++;
    if (emailVal) seenEmails.add(emailVal);
    if (phoneVal) seenPhones.add(phoneVal);
  }

  const diagnostics: RowCountDiagnostics = {
    physicalRows,
    nonEmptyRows,
    validCandidateRows,
    missingRequiredRows,
    duplicateRowsInFile,
    excludedByFilterRows: 0,
    availableToImportRows: rawRows.length,
    totalRowsAllSheets,
    sheetRowCounts,
  };

  const fileExt = file.name.split('.').pop()?.toLowerCase();
  const fileType: 'xlsx' | 'xls' | 'csv' = fileExt === 'csv' ? 'csv' : fileExt === 'xls' ? 'xls' : 'xlsx';

  return {
    fileName: file.name,
    fileType,
    fileSize: file.size,
    totalRows: rawRows.length,
    headers: activeHeaders,
    sampleRows,
    mappings,
    availableSheets,
    selectedSheet: targetSheetName,
    subheaders: activeSubheaders,
    subheaderRowDetected,
    diagnostics,
  };
}

/**
 * Converts raw copied/pasted text (from Excel, Google Sheets, TSV, or CSV)
 * into a structured File object that can be seamlessly processed by parseFileForPreview and executeImport.
 * Auto-detects whether row 1 is a header or already a candidate data row!
 */
export function detectHeaderColumns(cells: string[]): Record<string, number> | null {
  // A row is NEVER a header row if ANY cell is an actual candidate data value:
  // 1. Contains an email (@)
  // 2. Contains a phone number (\d{7,})
  // 3. Contains a date (e.g. 24-Apr-2025, 2025-04-24)
  // 4. Contains screening notes / feedback (e.g. "Female/1/OPT", "Voice mail", "years exp")
  for (const c of cells) {
    if (!c) continue;
    const s = String(c).trim();
    if (s.includes('@')) return null;
    if (isDateString(s)) return null;
    if (isPhoneNumber(s) || extractCleanPhone(s) !== null) return null;
    const isVisaOrCommonHeader = /^(h1b|h-1b|green card|greencard|gc|visa|visa status|work authorization|citizenship|citizen)$/i.test(s);
    if (!detectFeedbackHeader(s).isFeedback && !isVisaOrCommonHeader && isScreeningNote(s)) return null;
  }

  const mapping: Record<string, number> = {};
  let score = 0;
  for (let i = 0; i < cells.length; i++) {
    const raw = cells[i].trim().toLowerCase().replace(/[_\W]+/g, ' ').trim();
    if (!raw) continue;

    if (/^(secondary\s*email|alt\s*email|other\s*email|email\s*2)$/i.test(raw)) {
      if (mapping['Secondary Email'] === undefined) mapping['Secondary Email'] = i;
    } else if (/^(email|e\s*mail|email\s*address|email\s*id|email\s*i\s*d)$/i.test(raw)) {
      if (mapping['Email Address'] === undefined) {
        mapping['Email Address'] = i;
        score++;
      }
    } else if (/^(secondary\s*phone|alt\s*phone|other\s*phone|phone\s*2|mobile\s*2)$/i.test(raw)) {
      if (mapping['Secondary Phone'] === undefined) mapping['Secondary Phone'] = i;
    } else if (/^(phone|phone\s*number|primary\s*phone|contact\s*number|mobile|mobile\s*number|contact)$/i.test(raw)) {
      if (mapping['Phone Number'] === undefined) {
        mapping['Phone Number'] = i;
        score++;
      }
    } else if (/^(preferred\s*location|desired\s*location)$/i.test(raw)) {
      if (mapping['Preferred Location'] === undefined) mapping['Preferred Location'] = i;
    } else if (/^(location|current\s*location|candidate\s*location|city\s*state|metro|address)$/i.test(raw)) {
      if (mapping['Location'] === undefined) {
        mapping['Location'] = i;
        score++;
      }
    } else if (/^(candidate\s*name|candidate\s*full\s*name|full\s*name|name|applicant\s*name|consultant\s*name)$/i.test(raw)) {
      if (mapping['Candidate Full Name'] === undefined) {
        mapping['Candidate Full Name'] = i;
        score += 2; // Having an explicit Name header is a strong signal!
      }
    } else if (/^(job\s*title|job\s*role|role|position|job)$/i.test(raw)) {
      if (mapping['Job Title'] === undefined) {
        mapping['Job Title'] = i;
        score++;
      }
    } else if (/^(assigned\s*owner|assigned\s*recruiter|owner|recruiter|recuter|reciuter|ownwer|recruiter\s*owner|owner\s*recruiter|sourcer|recruiter\s*name|owner\s*name)$/i.test(raw)) {
      if (mapping['Assigned Owner'] === undefined) {
        mapping['Assigned Owner'] = i;
        score++;
      }
    } else if (/^(date\s*assigned|assigned\s*date|applied\s*date|date\s*applied|date)$/i.test(raw)) {
      if (mapping['Date Assigned'] === undefined) {
        mapping['Date Assigned'] = i;
        score++;
      }
    } else if (/^(green\s*card|greencard|gc)$/i.test(raw)) {
      if (mapping['Green Card'] === undefined) {
        mapping['Green Card'] = i;
        score++;
      }
    } else if (/^(h1b|h-1b|visa|visa\s*status|work\s*authorization)$/i.test(raw)) {
      if (mapping['H1B'] === undefined) {
        mapping['H1B'] = i;
        score++;
      }
    } else {
      const fbDetect = detectFeedbackHeader(cells[i]);
      if (fbDetect.isFeedback) {
        mapping[cells[i].trim()] = i;
        score++;
      }
    }
  }

  // Must have matched at least 2 distinct standard column headers, and either Name or both Email & Phone
  return score >= 2 && (mapping['Candidate Full Name'] !== undefined || (mapping['Email Address'] !== undefined && mapping['Phone Number'] !== undefined)) ? mapping : null;
}

/**
 * Smart Parser for Vertical Multi-Line Record Blocks
 * Handles pasted candidate data where each candidate's fields are listed line-by-line
 * (e.g. Date, Name, Phone, Email, Location, Job Role, Recruiter, Feedback)
 */
export function parseVerticalCandidateBlocks(lines: string[]): Record<string, any>[] {
  const candidates: Record<string, any>[] = [];
  let current: Record<string, any> | null = null;

  const commit = () => {
    if (current && (current['Candidate Full Name'] || current['Email Address'] || current['Phone Number'])) {
      current['Location'] = resolveCandidateLocation(
        current['Location'],
        (current['Recruiter Feedback'] || '') + ' ' + (current['Feedback 2'] || ''),
        current['Phone Number']
      );
      candidates.push({ ...current });
    }
    current = null;
  };

  const startCandidate = (dateVal?: string) => {
    commit();
    current = {
      'Date Assigned': dateVal || new Date().toISOString().slice(0, 10),
      'Candidate Full Name': '',
      'Phone Number': '',
      'Email Address': '',
      'Location': '',
      'Job Title': '',
      'Assigned Owner': 'Unassigned',
      'Recruiter Feedback': '',
      'Feedback 2': '',
    };
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 1. Check if line is a Date (e.g. 24-Apr-2025, 2025-04-24, 04/24/2025)
    const parsedDate = parseDateStringToYMD(line);

    // 2. Check email (standard email or markdown link [email](mailto:email))
    const mailMatch = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);

    // 3. Check phone
    const phoneVal = extractCleanPhone(line);

    // 4. Check recruiter / owner
    const isOwner = ['adam', 'alex', 'unassigned'].includes(line.toLowerCase());

    // 5. Check role
    const isRole = isRoleOrTech(line);

    // 6. Check location
    const isLoc = isLocationOrCountry(line);

    // 7. Check screening note / feedback
    const isNote = isScreeningNote(line);

    // 8. Check candidate name
    const isName = !isNote && isValidCandidateName(line);

    // 9. Check gender (e.g. Female, Male)
    const isGender = /^(female|male)$/i.test(line);

    // Boundary decisions:
    if (parsedDate) {
      startCandidate(parsedDate);
      continue;
    }

    if (!current) {
      startCandidate();
    } else {
      // If current candidate already has this field and we encounter another, it's a new candidate!
      const alreadyHasEmail = Boolean(mailMatch && current['Email Address']);
      const alreadyHasPhone = Boolean(phoneVal && current['Phone Number']);
      const alreadyHasName = Boolean(isName && current['Candidate Full Name']);

      if (alreadyHasEmail || alreadyHasPhone || alreadyHasName) {
        startCandidate();
      }
    }

    if (mailMatch && !current!['Email Address']) {
      current!['Email Address'] = mailMatch[1];
    } else if (phoneVal && !current!['Phone Number']) {
      current!['Phone Number'] = phoneVal;
    } else if (isOwner) {
      current!['Assigned Owner'] = line.charAt(0).toUpperCase() + line.slice(1).toLowerCase();
    } else if (isGender && !current!['Gender']) {
      current!['Gender'] = line.charAt(0).toUpperCase() + line.slice(1).toLowerCase();
    } else if (isRole && !current!['Job Title']) {
      current!['Job Title'] = line;
    } else if (isLoc && !current!['Location']) {
      current!['Location'] = line;
    } else if (isName && !current!['Candidate Full Name']) {
      current!['Candidate Full Name'] = line;
    } else {
      // Everything else is Recruiter Feedback / Notes!
      if (!current!['Recruiter Feedback']) {
        current!['Recruiter Feedback'] = line;
      } else if (!current!['Feedback 2']) {
        current!['Feedback 2'] = line;
      } else {
        current!['Feedback 2'] += '\n' + line;
      }
    }
  }

  commit();
  return candidates;
}

export function parseHorizontalCandidateLine(line: string): Record<string, any> | null {
  const sTrim = line.trim();
  if (!sTrim) return null;
  let s = sTrim;

  // 1. Date at start (e.g. 20-Nov-2025, 2025-11-20, 11/20/2025)
  let date = '';
  const dateMatch = s.match(/^(\d{1,2}-[a-zA-Z]{3,9}-\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+/);
  if (dateMatch) {
    date = dateMatch[1];
    s = s.slice(dateMatch[0].length).trim();
  }

  // 1b. Pre-clean markdown email links and brackets before column segmentation
  // e.g. "priyanka killi[priyanka.killi9@gmail.com](mailto:priyanka.killi9@gmail.com)" -> "priyanka killi priyanka.killi9@gmail.com"
  s = s.replace(/\[\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s*\](?:\(mailto:[^\s)]+\))?/gi, ' $1 ')
       .replace(/mailto:\s*([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi, ' $1 ')
       .replace(/<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>/gi, ' $1 ');

  // 2. Email anywhere in line
  let email = '';
  const emailMatch = s.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  let beforeEmail = '';
  let afterEmail = '';
  if (emailMatch) {
    email = emailMatch[1];
    const emailIdx = s.indexOf(emailMatch[0]);
    beforeEmail = s.slice(0, emailIdx).trim();
    afterEmail = s.slice(emailIdx + emailMatch[0].length).trim();
    // Clean trailing mailto artifacts from afterEmail
    afterEmail = afterEmail.replace(/^\(mailto:[^\s)]+\)\s*/i, '').trim();
  } else {
    beforeEmail = s;
  }

  // 3. Name and Phone from beforeEmail
  let name = beforeEmail.replace(/[\[\]()<>,]/g, '').trim();
  let phone = '';
  const noNumberMatch = beforeEmail.match(/\s+(no\s*number|none|no\s*phone|n\/a)$/i);
  const phoneMatch = beforeEmail.match(/\s+((?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10}))$/);

  if (noNumberMatch) {
    phone = '';
    name = beforeEmail.slice(0, noNumberMatch.index).replace(/[\[\]()<>,]/g, '').trim();
  } else if (phoneMatch) {
    phone = phoneMatch[1].replace(/[-.()\s]/g, '');
    name = beforeEmail.slice(0, phoneMatch.index).replace(/[\[\]()<>,]/g, '').trim();
  }

  // 4. Role, Owner, Location, Feedback from afterEmail
  let location = 'United States';
  let role = 'General Sourced Candidate';
  let owner = 'Unassigned';
  let feedback = afterEmail;

  const ownerMatch = afterEmail.match(/\b(alex|adam)\b/i);
  if (ownerMatch) {
    owner = ownerMatch[1].charAt(0).toUpperCase() + ownerMatch[1].slice(1).toLowerCase();
    const idx = ownerMatch.index ?? 0;
    const beforeOwner = afterEmail.slice(0, idx).trim();
    feedback = afterEmail.slice(idx + ownerMatch[0].length).trim();

    let rem = beforeOwner;
    const locMatch = rem.match(/^(united\s*states|unitedstates|us|usa|texas|new\s*york|nj|ca|il|tx)\s+/i);
    if (locMatch) {
      location = locMatch[1].replace(/unitedstates/i, 'United States');
      rem = rem.slice(locMatch[0].length).trim();
    }
    if (rem) {
      role = rem;
    }
  }

  return {
    'Date Assigned': date || new Date().toISOString().slice(0, 10),
    'Candidate Full Name': name,
    'Phone Number': phone,
    'Email Address': email,
    'Location': location,
    'Job Title': role,
    'Assigned Owner': owner,
    'Recruiter Feedback': feedback,
  };
}

/**
 * Converts raw copied/pasted text (from Excel, Google Sheets, TSV, or CSV)
 * into a structured File object that can be seamlessly processed by parseFileForPreview and executeImport.
 * Auto-detects whether row 1 is a header or already a candidate data row!
 */
function splitRespectingQuotes(text: string): string[] {
  // If the text contains tabs (tab-separated rows copied directly from Excel, Google Sheets, or TSV),
  // lines are ALWAYS delimited by newlines!
  // Isolated double quotes in recruiter feedback/notes (e.g. ,"$65-$70K or 5'10" or "VM")
  // MUST NEVER swallow subsequent candidate rows!
  if (text.includes('\t')) {
    return text
      .split(/\r?\n/)
      .map(l => l.trimEnd())
      .filter(l => l.trim().length > 0);
  }

  // For CSV or other delimited text, safely split respecting genuine field-level quotes
  // without runaway multi-line concatenation:
  const lines: string[] = [];
  const rawSplit = text.split(/\r?\n/);
  let buffer = '';
  let inQuotes = false;
  let linesAccumulated = 0;

  for (const rawLine of rawSplit) {
    if (!rawLine.trim() && !inQuotes) continue;

    if (!inQuotes) {
      let qCount = 0;
      for (let i = 0; i < rawLine.length; i++) {
        if (rawLine[i] === '"') qCount++;
      }
      if (qCount % 2 !== 0 && rawLine.includes(',')) {
        inQuotes = true;
        buffer = rawLine;
        linesAccumulated = 1;
      } else {
        lines.push(rawLine);
      }
    } else {
      buffer += '\n' + rawLine;
      linesAccumulated++;
      let qCount = 0;
      for (let i = 0; i < rawLine.length; i++) {
        if (rawLine[i] === '"') qCount++;
      }
      // If closing quote found OR safety limit reached (e.g. 3 lines without close)
      if (qCount % 2 !== 0 || linesAccumulated >= 3) {
        inQuotes = false;
        lines.push(buffer);
        buffer = '';
        linesAccumulated = 0;
      }
    }
  }

  if (buffer) {
    lines.push(buffer);
  }

  return lines.filter(l => l.trim().length > 0);
}

function unpackMultiCandidateRow(cells: string[]): string[][] {
  return [cells];
}

export function convertPastedTextToFile(rawText: string, customName?: string): File {
  const clean = rawText.trim();
  if (!clean) {
    throw new Error('Pasted text is empty. Please copy and paste data rows from Excel, Google Sheets, or CSV.');
  }

  const rawLines = splitRespectingQuotes(clean);
  if (rawLines.length === 0) {
    throw new Error('Pasted text contains no valid lines.');
  }

  // Fast-track A: Check if input is a Horizontal Single-Line Stream (one entire candidate per line)
  // MUST NOT trigger on tab-delimited or pipe-delimited data which is structured spreadsheet tables!
  const hasTabsOrPipesCheck = rawLines.some(l => l.includes('\t') || l.includes('|'));
  const isHorizontalStream = !hasTabsOrPipesCheck && rawLines.filter(l => {
    const hasDate = Boolean(l.match(/\b(\d{1,2}-[a-zA-Z]{3,9}-\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/));
    const hasEmail = Boolean(l.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/));
    return hasDate && hasEmail;
  }).length >= Math.min(2, Math.floor(rawLines.length * 0.15));

  if (isHorizontalStream) {
    const horizontalCandidates = rawLines.map(line => parseHorizontalCandidateLine(line)).filter(Boolean);
    if (horizontalCandidates.length > 0) {
      const worksheet = XLSX.utils.json_to_sheet(horizontalCandidates);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Pasted_Leads');

      const xlsxArray = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
      const fileName = customName || `pasted_leads_${new Date().toISOString().slice(0, 10)}.xlsx`;

      return new File([xlsxArray], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    }
  }

  // Fast-track B: Check if input is a Vertical Multi-Line Stream (one field per line)
  const hasTabsOrPipes = rawLines.some(l => l.includes('\t') || l.includes('|'));
  const hasCommas = rawLines.some(l => l.includes(',') && (l.includes('@') || l.replace(/\D/g, '').length >= 10));

  if (!hasTabsOrPipes && !hasCommas && rawLines.length >= 3) {
    const verticalCandidates = parseVerticalCandidateBlocks(rawLines);
    if (verticalCandidates.length > 0) {
      const worksheet = XLSX.utils.json_to_sheet(verticalCandidates);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Pasted_Leads');

      const xlsxArray = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
      const fileName = customName || `pasted_leads_${new Date().toISOString().slice(0, 10)}.xlsx`;

      return new File([xlsxArray], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    }
  }

  // Break lines into cells respecting delimiters (tab, pipe, CSV)
  const rawRows: string[][] = [];

  for (const line of rawLines) {
    let cells: string[] = [];
    if (line.includes('\t')) {
      cells = line.split('\t').map(c => c.trim().replace(/^["']+|["']+$/g, '').replace(/[\r\n]+/g, ' ').trim());
    } else if (line.includes('|')) {
      cells = line.split('|').map(c => c.trim().replace(/^["']+|["']+$/g, '').replace(/[\r\n]+/g, ' ').trim());
    } else if (line.includes(',') && (line.includes('@') || line.replace(/\D/g, '').length >= 10)) {
      // Line contains commas AND contact info -> CSV row
      const rowCells: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          rowCells.push(cur.trim().replace(/^["']+|["']+$/g, '').replace(/[\r\n]+/g, ' ').trim());
          cur = '';
        } else {
          cur += char;
        }
      }
      rowCells.push(cur.trim().replace(/^["']+|["']+$/g, '').replace(/[\r\n]+/g, ' ').trim());
      cells = rowCells;
    } else {
      cells = [line.trim()];
    }

    const unpacked = unpackMultiCandidateRow(cells);
    for (const uCells of unpacked) {
      if (uCells.some(c => c.length > 0)) {
        rawRows.push(uCells);
      }
    }
  }

  const jsonRows: Record<string, any>[] = [];

  // STRATEGY 1: Structured Header Detection
  // When copying directly from Excel or Google Sheets, Row 0 contains table headers!
  const headerMapping = rawRows.length > 1 ? detectHeaderColumns(rawRows[0]) : null;

  if (headerMapping) {
    let startIdx = 1;
    if (rawRows.length > 2 && isSubheaderRow(rawRows[1])) {
      startIdx = 2;
    }
    for (let rIdx = startIdx; rIdx < rawRows.length; rIdx++) {
      const r = rawRows[rIdx];
      if (!r || r.every(c => !c || !c.trim())) continue;
      if (isSubheaderRow(r)) continue;

      const cand: Record<string, any> = {
        'Date Assigned': (headerMapping['Date Assigned'] !== undefined ? r[headerMapping['Date Assigned']] : '') || new Date().toISOString().slice(0, 10),
        'Candidate Full Name': headerMapping['Candidate Full Name'] !== undefined ? r[headerMapping['Candidate Full Name']] || '' : '',
        'Phone Number': headerMapping['Phone Number'] !== undefined ? r[headerMapping['Phone Number']] || '' : '',
        'Email Address': headerMapping['Email Address'] !== undefined ? r[headerMapping['Email Address']] || '' : '',
        'Location': headerMapping['Location'] !== undefined ? r[headerMapping['Location']] || '' : '',
        'Job Title': headerMapping['Job Title'] !== undefined ? r[headerMapping['Job Title']] || '' : '',
        'Assigned Owner': (headerMapping['Assigned Owner'] !== undefined ? r[headerMapping['Assigned Owner']] : '') || 'Unassigned',
      };

      // Capture all dynamic feedback headers (Feedback 1..N, Notes, Comments, etc.) preserving exact header names
      const feedbackHeaderKeys = Object.keys(headerMapping).filter(k => detectFeedbackHeader(k).isFeedback);
      for (const fbKey of feedbackHeaderKeys) {
        const colIdx = headerMapping[fbKey];
        if (colIdx !== undefined && r[colIdx] !== undefined && r[colIdx] !== null && String(r[colIdx]).trim() && !cand[fbKey]) {
          cand[fbKey] = String(r[colIdx]).trim();
        }
      }

      // Capture ANY and ALL additional unmapped columns with text (e.g. Feedback 3, Feedback 4, Feedback 5, Feedback 6...)
      const mappedColIndices = new Set(Object.values(headerMapping));
      let nextFeedbackNum = 3;
      while (cand[`Feedback ${nextFeedbackNum}`] || headerMapping[`Feedback ${nextFeedbackNum}`] !== undefined) {
        nextFeedbackNum++;
      }

      for (let cIdx = 0; cIdx < r.length; cIdx++) {
        if (mappedColIndices.has(cIdx)) continue;
        const cellVal = r[cIdx] !== undefined && r[cIdx] !== null ? String(r[cIdx]).trim() : '';
        if (!cellVal) continue;

        // Check if URL
        if (cellVal.includes('drive.google.com') || cellVal.includes('/file/d/') || cellVal.includes('docs.google.com')) {
          if (!cand['Resume Link']) { cand['Resume Link'] = cellVal; continue; }
        }
        if (cellVal.includes('linkedin.com/in') || cellVal.includes('linkedin.com')) {
          if (!cand['LinkedIn Profile']) { cand['LinkedIn Profile'] = cellVal; continue; }
        }

        // Additional recruiter feedback / call outcome / notes
        const fbFieldKey = `Feedback ${nextFeedbackNum}`;
        cand[fbFieldKey] = cellVal;
        nextFeedbackNum++;
      }

      if (headerMapping['Secondary Email'] !== undefined && r[headerMapping['Secondary Email']]) {
        cand['Secondary Email'] = r[headerMapping['Secondary Email']];
      }
      if (headerMapping['Secondary Phone'] !== undefined && r[headerMapping['Secondary Phone']]) {
        cand['Secondary Phone'] = r[headerMapping['Secondary Phone']];
      }
      if (headerMapping['Preferred Location'] !== undefined && r[headerMapping['Preferred Location']]) {
        cand['Preferred Location'] = r[headerMapping['Preferred Location']];
      }
      if (headerMapping['Green Card'] !== undefined && r[headerMapping['Green Card']]) {
        cand['Green Card'] = r[headerMapping['Green Card']];
      }
      if (headerMapping['H1B'] !== undefined && r[headerMapping['H1B']]) {
        cand['H1B'] = r[headerMapping['H1B']];
      }

      // Pre-clean 0: If Candidate Full Name is actually a phone number, move to Phone Number!
      if (cand['Candidate Full Name'] && isPhoneNumber(cand['Candidate Full Name'])) {
        if (!cand['Phone Number']) {
          cand['Phone Number'] = cand['Candidate Full Name'];
        }
        cand['Candidate Full Name'] = '';
      }

      // Pre-clean 0b: If Job Title is actually a Recruiter name (e.g. Adam, Alex)
      if (cand['Job Title'] && ['adam', 'alex', 'unassigned'].includes(String(cand['Job Title']).toLowerCase().trim())) {
        if (!cand['Assigned Owner'] || cand['Assigned Owner'] === 'Adam') {
          cand['Assigned Owner'] = cand['Job Title'];
        }
        cand['Job Title'] = 'General Sourced Candidate';
      }

      // Pre-clean 0c: If Assigned Owner contains screening notes or feedback
      if (cand['Assigned Owner'] && (
        String(cand['Assigned Owner']).length > 25 ||
        /^(he is|she is|female|male|not a|4 years|2 years|\d+\s*years|opt|f1|h1b|green card|voice mail|someone picked)/i.test(String(cand['Assigned Owner']))
      )) {
        const ownerNote = cand['Assigned Owner'];
        if (ownerNote.toLowerCase().includes('female candidate')) {
          cand['Gender'] = 'Female';
        }
        cand['Recruiter Feedback'] = cand['Recruiter Feedback'] ? `${cand['Recruiter Feedback']}\n${ownerNote}` : ownerNote;
        cand['Assigned Owner'] = 'Unassigned';
      }

      // Pre-clean name if empty
      if (!cand['Candidate Full Name']) {
        if (cand['Recruiter Feedback']) {
          const extracted = extractCandidateName(cand['Recruiter Feedback']);
          if (extracted.name) {
            cand['Candidate Full Name'] = extracted.name;
            cand['Recruiter Feedback'] = extracted.remaining;
          }
        }
        if (!cand['Candidate Full Name'] && cand['Feedback 2']) {
          const extracted = extractCandidateName(cand['Feedback 2']);
          if (extracted.name) {
            cand['Candidate Full Name'] = extracted.name;
            cand['Feedback 2'] = extracted.remaining;
          }
        }
      }

      // Pre-clean tech role in name
      if (cand['Candidate Full Name'] && isRoleOrTech(cand['Candidate Full Name'])) {
        if (!cand['Job Title'] || cand['Job Title'] === 'General Sourced Candidate') {
          cand['Job Title'] = cand['Candidate Full Name'];
        }
        cand['Candidate Full Name'] = '';
      }

      // Pre-clean location or header word in name
      if (cand['Candidate Full Name'] && (isLocationOrCountry(cand['Candidate Full Name']) || isHeaderOrLabelWord(cand['Candidate Full Name']))) {
        if (!cand['Location']) {
          cand['Location'] = cand['Candidate Full Name'];
        }
        cand['Candidate Full Name'] = '';
      }

      // Clean phone number
      if (cand['Phone Number']) {
        const cleanedP = extractCleanPhone(cand['Phone Number']);
        if (cleanedP !== null) cand['Phone Number'] = cleanedP;
      }

      // Pre-clean and ensure Email Address:
      // If Email Address is empty or does not contain '@', scan ALL cells of row r!
      if (!cand['Email Address'] || !cand['Email Address'].includes('@')) {
        for (const c of r) {
          if (!c) continue;
          const mailMatch = String(c).match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (mailMatch) {
            cand['Email Address'] = mailMatch[1];
            break;
          }
        }
      }
      if (!cand['Email Address'] && cand['Recruiter Feedback']) {
        const mailMatch = String(cand['Recruiter Feedback']).match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (mailMatch) cand['Email Address'] = mailMatch[1];
      }
      if (!cand['Email Address'] && cand['Feedback 2']) {
        const mailMatch = String(cand['Feedback 2']).match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (mailMatch) cand['Email Address'] = mailMatch[1];
      }

      // Name must be explicitly provided in candidate row, never guessed from email address
      cand['Candidate Full Name'] = cand['Candidate Full Name'] || '';

      // Location Fallback: "in location if state or city nother then simply put united states"
      cand['Location'] = resolveCandidateLocation(
        cand['Location'],
        (cand['Recruiter Feedback'] || '') + ' ' + (cand['Feedback 2'] || ''),
        cand['Phone Number']
      );

      // Auto-detect candidate gender
      if (!cand['Gender'] || cand['Gender'] === 'Unspecified') {
        cand['Gender'] = detectGender(
          cand['Gender'],
          null,
          cand['Candidate Full Name'],
          (cand['Recruiter Feedback'] || '') + ' ' + (cand['Feedback 2'] || '')
        );
      }

      if (cand['Candidate Full Name'] || cand['Email Address'] || cand['Phone Number'] || cand['Recruiter Feedback'] || cand['Job Title']) {
        jsonRows.push(cand);
      }
    }
  } else {
    // STRATEGY 2: Intelligent heuristic cell classifier for un-headed / freeform text
    const classifyCell = (rawVal: any): { type: string; value?: string } => {
      if (!rawVal) return { type: 'empty' };
      let val = String(rawVal).trim().replace(/^["']|["']$/g, '');
      if (!val) return { type: 'empty' };

      // Clean pure table header words
      const normVal = val.toLowerCase().replace(/[_\W]+/g, ' ').trim();
      if (/^(date|name|candidate name|candidate full name|contact number|contact|phone|phone number|email|email address|email i'?d|role|job role|job title|job|recruiter|assigned owner|owner|feedback|feedback 1|feedback 2|feedback \d+|location|current location|city|state|preferred location|column \d+|team|consultant name|client name|domain|rate|round|comments)$/i.test(normVal)) {
        return { type: 'header_label', value: val };
      }

      if (val.includes(',, date assigened') || val.includes(',, date assigned')) {
        val = val.split(/,, date assign/i)[0].trim();
      }

      // 1. Email check
      const normalizedEmailResult = normalizeEmail(val);
      if (normalizedEmailResult && normalizedEmailResult.isValid) {
        return { type: 'email', value: normalizedEmailResult.normalized };
      }
      if (val.includes('@') && !isScreeningNote(val)) {
        const mailMatch = val.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+)/);
        if (mailMatch) {
          const healed = normalizeEmail(mailMatch[1]);
          if (healed && healed.isValid) {
            return { type: 'email', value: healed.normalized };
          }
        }
      }

      // 2. Recruiter / Owner check
      if (['adam', 'alex', 'unassigned'].includes(val.toLowerCase())) {
        return { type: 'recruiter', value: val };
      }

      // 3. Job Role check
      if (/^(da|ba|edi|aws|qa|pm|dev|data analyst|business analyst|cyber security|engineer|developer|sre)$/i.test(val) || isATSJobRoleTitle(val) || isRoleOrTech(val)) {
        return { type: 'role', value: val.toUpperCase() };
      }

      // 4. Date check
      const parsedDate = parseDateStringToYMD(val);
      if (parsedDate) {
        return { type: 'date', value: parsedDate };
      }

      // 5. Phone check
      const isPhoneNeg = /^(no number|no phone|none|n\/a)$/i.test(val);
      if (isPhoneNeg) {
        return { type: 'phone', value: '' };
      }
      const cleanPhone = extractCleanPhone(val);
      if (cleanPhone) {
        return { type: 'phone', value: cleanPhone };
      }

      // 6. Comprehensive Location check:
      // Supports: "Dallas, TX", "Austin", "Chicago", "TX", "CA", "Dallas TX", "Atlanta GA", "Remote", "Open to US"
      const trimmedUpper = val.toUpperCase().trim();
      const trimmedLower = val.toLowerCase().trim();
      const isStateCode = US_STATE_CODES.has(trimmedUpper);
      const isStateName = US_STATES.has(trimmedLower);
      const isKnownCity = US_CITIES.has(trimmedLower);
      const isCityWithStateNoComma = /^[A-Za-z\s.'-]+\s+([A-Za-z]{2})$/.test(val) && US_STATE_CODES.has(val.split(/\s+/).pop()?.toUpperCase() || '');
      const isLocationFormatted =
        /^[A-Za-z\s.'-]+,\s*([A-Za-z]{2}|[A-Za-z\s]+)$/.test(val) &&
        !isRoleOrTech(val) &&
        val.length <= 40;
      const isExplicitLocation =
        /^(remote|hybrid|onsite|open to us|nationwide|relocation open|open to relocate)$/i.test(val);

      if (isLocationFormatted || isStateCode || isStateName || isKnownCity || isCityWithStateNoComma || isExplicitLocation || isLocationOrCountry(val)) {
        return { type: 'location', value: val };
      }

      // 7. Recruiter Feedback / Notes check
      if (isScreeningNote(val)) {
        return { type: 'feedback', value: val };
      }

      // 8. Candidate Full Name check (Never classify locations, countries, or header words as names!)
      if (isValidCandidateName(val)) {
        return { type: 'name', value: val };
      }

      return { type: 'feedback', value: val };
    };

    let currentCandidate: Record<string, any> | null = null;

    const commitCandidate = () => {
      if (currentCandidate) {
        if (currentCandidate['Candidate Full Name'] && isPhoneNumber(currentCandidate['Candidate Full Name'])) {
          if (!currentCandidate['Phone Number']) {
            currentCandidate['Phone Number'] = currentCandidate['Candidate Full Name'];
          }
          currentCandidate['Candidate Full Name'] = '';
        }

        if (!currentCandidate['Candidate Full Name']) {
          if (currentCandidate['Recruiter Feedback']) {
            const extracted = extractCandidateName(currentCandidate['Recruiter Feedback']);
            if (extracted.name) {
              currentCandidate['Candidate Full Name'] = extracted.name;
              currentCandidate['Recruiter Feedback'] = extracted.remaining;
            }
          }
          if (!currentCandidate['Candidate Full Name'] && currentCandidate['Feedback 2']) {
            const extracted = extractCandidateName(currentCandidate['Feedback 2']);
            if (extracted.name) {
              currentCandidate['Candidate Full Name'] = extracted.name;
              currentCandidate['Feedback 2'] = extracted.remaining;
            }
          }
          currentCandidate['Candidate Full Name'] = currentCandidate['Candidate Full Name'] || '';
        }

        if (currentCandidate['Candidate Full Name'] && isRoleOrTech(currentCandidate['Candidate Full Name'])) {
          if (!currentCandidate['Job Title']) {
            currentCandidate['Job Title'] = currentCandidate['Candidate Full Name'];
          }
          currentCandidate['Candidate Full Name'] = '';
        }

        if (currentCandidate['Candidate Full Name'] && (isLocationOrCountry(currentCandidate['Candidate Full Name']) || isHeaderOrLabelWord(currentCandidate['Candidate Full Name']))) {
          if (!currentCandidate['Location']) {
            currentCandidate['Location'] = currentCandidate['Candidate Full Name'];
          }
          currentCandidate['Candidate Full Name'] = '';
        }

        if (currentCandidate['Phone Number']) {
          const cleanedPhone = extractCleanPhone(currentCandidate['Phone Number']);
          if (cleanedPhone !== null) {
            currentCandidate['Phone Number'] = cleanedPhone;
          }
        }

        // Email Fallback: Scan feedback notes if email is missing or lacks '@'
        if (!currentCandidate['Email Address'] || !currentCandidate['Email Address'].includes('@')) {
          if (currentCandidate['Recruiter Feedback']) {
            const mailMatch = String(currentCandidate['Recruiter Feedback']).match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (mailMatch) currentCandidate['Email Address'] = mailMatch[1];
          }
          if (!currentCandidate['Email Address'] && currentCandidate['Feedback 2']) {
            const mailMatch = String(currentCandidate['Feedback 2']).match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (mailMatch) currentCandidate['Email Address'] = mailMatch[1];
          }
        }

        // Location Fallback: "in location if state or city nother then simply put united states"
        currentCandidate['Location'] = resolveCandidateLocation(
          currentCandidate['Location'],
          (currentCandidate['Recruiter Feedback'] || '') + ' ' + (currentCandidate['Feedback 2'] || ''),
          currentCandidate['Phone Number']
        );

        // Auto-detect candidate gender
        if (!currentCandidate['Gender'] || currentCandidate['Gender'] === 'Unspecified') {
          currentCandidate['Gender'] = detectGender(
            currentCandidate['Gender'],
            null,
            currentCandidate['Candidate Full Name'],
            (currentCandidate['Recruiter Feedback'] || '') + ' ' + (currentCandidate['Feedback 2'] || '')
          );
        }

        if (currentCandidate['Candidate Full Name'] || currentCandidate['Email Address'] || currentCandidate['Phone Number'] || currentCandidate['Recruiter Feedback'] || currentCandidate['Job Title']) {
          jsonRows.push(currentCandidate);
        }
      }
      currentCandidate = null;
    };

    const startNewCandidate = (dateVal?: string) => {
      commitCandidate();
      currentCandidate = {
        'Date Assigned': dateVal || new Date().toISOString().slice(0, 10),
        'Candidate Full Name': '',
        'Phone Number': '',
        'Email Address': '',
        'Location': '',
        'Job Title': '',
        'Assigned Owner': 'Unassigned',
        'Recruiter Feedback': '',
        'Feedback 2': '',
      };
    };

    for (const row of rawRows) {
      const nonEmpties = row.map(c => classifyCell(c)).filter(c => c.type !== 'empty' && c.type !== 'header_label');
      if (nonEmpties.length === 0) continue;

      const isOnlyFeedback = nonEmpties.every(c => c.type === 'feedback');
      if (isOnlyFeedback) {
        const activeCand = currentCandidate as Record<string, any> | null;
        if (activeCand) {
          const combinedNote = nonEmpties.map(c => c.value).filter(Boolean).join(' ');
          const noteMail = combinedNote.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          const notePhone = extractCleanPhone(combinedNote);
          const noteName = isValidCandidateName(combinedNote);
          if (noteMail || notePhone || (noteName && (activeCand['Email Address'] || activeCand['Phone Number'] || activeCand['Candidate Full Name']))) {
            startNewCandidate();
            if (noteMail) currentCandidate!['Email Address'] = noteMail[1];
            if (notePhone) currentCandidate!['Phone Number'] = notePhone;
            if (noteName) currentCandidate!['Candidate Full Name'] = combinedNote;
            continue;
          }

          if (!activeCand['Recruiter Feedback']) {
            activeCand['Recruiter Feedback'] = combinedNote;
          } else if (!activeCand['Feedback 2']) {
            activeCand['Feedback 2'] = combinedNote;
          } else if (activeCand['Feedback 2'].length < 2000) {
            activeCand['Feedback 2'] += '\n' + combinedNote;
          }
        }
        continue;
      }

      const dateItem = nonEmpties.find(c => c.type === 'date');
      const hasDate = Boolean(dateItem);
      const hasEmail = nonEmpties.some(c => c.type === 'email');
      const hasName = nonEmpties.some(c => c.type === 'name');
      const hasPhone = nonEmpties.some(c => c.type === 'phone' && c.value);

      if (hasDate) {
        startNewCandidate(dateItem?.value);
      } else if (!currentCandidate) {
        startNewCandidate();
      } else if (
        (hasEmail && currentCandidate['Email Address']) ||
        (hasPhone && currentCandidate['Phone Number']) ||
        (hasName && currentCandidate['Candidate Full Name'])
      ) {
        startNewCandidate();
      }

      for (const item of nonEmpties) {
        switch (item.type) {
          case 'date':
            if (item.value) currentCandidate!['Date Assigned'] = item.value;
            break;
          case 'email':
            if (!currentCandidate!['Email Address'] && item.value) {
              currentCandidate!['Email Address'] = item.value;
            }
            break;
          case 'phone':
            if (!currentCandidate!['Phone Number'] && item.value !== undefined) {
              currentCandidate!['Phone Number'] = item.value;
            }
            break;
          case 'location':
            if (!currentCandidate!['Location'] && item.value) {
              currentCandidate!['Location'] = item.value;
            }
            break;
          case 'role':
            if (!currentCandidate!['Job Title'] && item.value) {
              currentCandidate!['Job Title'] = item.value;
            }
            break;
          case 'recruiter':
            if (item.value) currentCandidate!['Assigned Owner'] = item.value;
            break;
          case 'name':
            if (!currentCandidate!['Candidate Full Name'] && item.value) {
              currentCandidate!['Candidate Full Name'] = item.value;
            } else if (item.value) {
              if (!currentCandidate!['Recruiter Feedback']) {
                currentCandidate!['Recruiter Feedback'] = item.value;
              } else if (!currentCandidate!['Feedback 2']) {
                currentCandidate!['Feedback 2'] = item.value;
              } else {
                currentCandidate!['Feedback 2'] += '\n' + item.value;
              }
            }
            break;
          case 'feedback':
            if (item.value) {
              if (!currentCandidate!['Recruiter Feedback']) {
                currentCandidate!['Recruiter Feedback'] = item.value;
              } else if (!currentCandidate!['Feedback 2']) {
                currentCandidate!['Feedback 2'] = item.value;
              } else {
                currentCandidate!['Feedback 2'] += '\n' + item.value;
              }
            }
            break;
        }
      }
    }

    commitCandidate();
  }

  if (jsonRows.length === 0) {
    throw new Error('No valid candidate rows could be parsed from the pasted text.');
  }

  // Convert assembled candidate records to XLSX Worksheet & Workbook
  const worksheet = XLSX.utils.json_to_sheet(jsonRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Pasted_Leads');

  const xlsxArray = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  const fileName = customName || `pasted_leads_${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new File([xlsxArray], fileName, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export interface ImportExecutionResult {
  importRecord: ImportRecord;
  newPeople: Person[];
  updatedPeople: Person[];
  newPossibleMatches: PossibleMatch[];
  newIncompleteRecords: IncompleteRecord[];
  errorRows: { row: number; reason: string; rawData: any }[];
}

/**
 * Idempotency safeguard for recruiter contacts.
 * Prevents duplicate recruiter contacts when the same file or row is re-imported.
 */
export function isDuplicateContact(
  existing: RecruiterContact[],
  newItem: {
    text: string;
    feedbackLabel?: string | null;
    columnIndex?: number | null;
    contactDate?: string | null;
    sourceFile?: string | null;
    sourceRow?: number | null;
    recruiterName?: string | null;
  }
): boolean {
  if (!existing || existing.length === 0) return false;
  const normNewText = (newItem.text || '').trim().toLowerCase();
  if (!normNewText) return false;

  return existing.some(c => {
    const normExistingText = (c.original_feedback || '').trim().toLowerCase();
    if (normExistingText !== normNewText) return false;

    // Condition 1: Same source file and row number
    if (
      newItem.sourceFile &&
      c.source_file &&
      c.source_file === newItem.sourceFile &&
      newItem.sourceRow &&
      c.source_row &&
      c.source_row === newItem.sourceRow
    ) {
      if (
        (newItem.feedbackLabel && c.feedback_label && newItem.feedbackLabel.toLowerCase().trim() === c.feedback_label.toLowerCase().trim()) ||
        (newItem.columnIndex !== undefined && newItem.columnIndex !== null && c.column_index !== undefined && c.column_index !== null && newItem.columnIndex === c.column_index) ||
        (!newItem.feedbackLabel && !c.feedback_label)
      ) {
        return true;
      }
    }

    // Condition 2: Same feedback label (e.g. "Feedback 1")
    if (
      newItem.feedbackLabel &&
      c.feedback_label &&
      c.feedback_label.toLowerCase().trim() === newItem.feedbackLabel.toLowerCase().trim()
    ) {
      return true;
    }

    // Condition 2b: feedback label embedded in c.source
    if (
      newItem.feedbackLabel &&
      c.source &&
      c.source.toLowerCase().includes(newItem.feedbackLabel.toLowerCase().trim())
    ) {
      return true;
    }

    // Condition 3: Same contact date and same feedback label
    if (
      newItem.contactDate &&
      c.contact_date &&
      c.contact_date === newItem.contactDate &&
      (!newItem.feedbackLabel || !c.feedback_label || newItem.feedbackLabel.toLowerCase().trim() === c.feedback_label.toLowerCase().trim())
    ) {
      return true;
    }

    return false;
  });
}

/**
 * Execute actual import processing through the normalization & matching pipeline
 */
export async function executeImport(
  file: File,
  mappings: ColumnMappingConfig[],
  existingPeople: Person[],
  onProgress?: (processed: number, total: number) => void,
  targetCompanyOverride: 'AaraTech' | 'ClinisolTech' | 'auto' = 'auto',
  targetGenderOverride: 'auto' | 'Male' | 'Female' = 'auto',
  selectedSheet?: string,
  targetOwnerOverride: string = 'auto'
): Promise<ImportExecutionResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const sheetName = (selectedSheet && workbook.SheetNames.includes(selectedSheet))
    ? selectedSheet
    : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Sheet "${sheetName}" not found in workbook.`);
  }
  const accurateRange = getAccurateWorksheetRange(worksheet);
  if (accurateRange) {
    const existingRange = worksheet['!ref'] ? XLSX.utils.decode_range(worksheet['!ref']) : null;
    if (!existingRange || accurateRange.e.r > existingRange.e.r || accurateRange.e.c > existingRange.e.c) {
      worksheet['!ref'] = XLSX.utils.encode_range(accurateRange);
    }
  }
  let rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '', blankrows: false });

  // Filter out instructional / sub-header / metadata rows
  const subheaders: Record<string, string> = {};
  if (rawRows.length > 0 && isSubheaderRow(rawRows[0], Object.keys(rawRows[0]))) {
    const subheaderRow = rawRows[0];
    for (const h of Object.keys(subheaderRow)) {
      const val = String(subheaderRow[h] ?? '').trim();
      if (val) subheaders[h] = val;
    }
    rawRows = rawRows.slice(1);
  }

  // Automatically split merged H1B + Resume Link column consistently with preview
  const splitResult = splitMergedH1bColumns(Object.keys(rawRows[0] || {}), subheaders, rawRows);
  rawRows = splitResult.rows;

  const mappingLookup: Record<string, TargetColumn> = {};
  mappings.forEach(m => {
    mappingLookup[m.sourceColumn] = m.targetColumn;
  });
  if (!mappingLookup['H1B - Y/N']) {
    mappingLookup['H1B - Y/N'] = 'h1b_status';
  }
  if (!mappingLookup['Resume Link']) {
    mappingLookup['Resume Link'] = 'resume_link';
  }
  mappings.forEach(m => {
    mappingLookup[m.sourceColumn] = m.targetColumn;
  });

  // Track all dynamic recruiter feedback mappings in source column order
  const feedbackMappings = mappings.filter(m => m.targetColumn === 'recruiter_feedback');
  feedbackMappings.sort((a, b) => (a.columnIndex ?? 0) - (b.columnIndex ?? 0));

  const importId = 'IMP-' + String(Date.now()).slice(-6);
  const now = new Date().toISOString();

  const newPeople: Person[] = [];
  const updatedPeople: Person[] = [];
  const newPossibleMatches: PossibleMatch[] = [];
  const newIncompleteRecords: IncompleteRecord[] = [];
  const errorRows: { row: number; reason: string; rawData: any }[] = [];

  let newPeopleCount = 0;
  let matchedPeopleCount = 0;
  let possibleMatchesCount = 0;
  let applicationsCreated = 0;
  let matchedApplicationsCount = 0;
  let unresolvedApplicationsCount = 0;
  let assignmentsCreated = 0;
  let contactsCreated = 0;

  // Active pool of people (contains existing + newly created within this same import run)
  const candidatePool: Person[] = [...existingPeople];
  let lastValidAppDate = '';

  const sampleHeaders = rawRows.length > 0 ? Object.keys(rawRows[0]) : mappings.map(m => m.sourceColumn);
  const detectedFileType = detectSourceFileType(sampleHeaders);
  const isFile1 = detectedFileType.type === 'file1_collection' || sampleHeaders.some(h => /green\s*card|h1b|resume\s*link/i.test(h));
  const isFile2 = detectedFileType.type === 'file2_recruiter' || sampleHeaders.some(h => /recruiter|feedback|call\s*status/i.test(h));

  for (let idx = 0; idx < rawRows.length; idx++) {
    const row = rawRows[idx];
    const rowNumber = idx + 2; // Accounting for 1-indexed Excel header row

    // Skip any instructional subheader rows that may appear
    if (isSubheaderRow(row, Object.keys(row))) {
      continue;
    }

    try {
      // 1. Extract values by column mapping
      let rawFullName: string | undefined;
      let rawFirstName: string | undefined;
      let rawLastName: string | undefined;
      let rawEmail: string | undefined;
      let rawSecondaryEmail: string | undefined;
      let rawPhone: string | undefined;
      let rawSecondaryPhone: string | undefined;
      let rawLinkedIn: string | undefined;
      let rawLocation: string | undefined;
      let rawPreferredLocation: string | undefined;
      let rawCompany: string | undefined;
      let rawJobTitle: string | undefined;
      let rawJobId: string | undefined;
      let rawDateApplied: string | undefined;
      let rawCurrentStage: string | undefined;
      let rawRecruiterName: string | undefined;
      let rawRecruiterFeedback: string | undefined;
      let rawContactDate: string | undefined;
      let rawContactType: string | undefined;
      let rawResumeLink: string | undefined;
      let rawStatus: string | undefined;
      let rawOwner: string | undefined;
      let rawGender: string | undefined;
      let rawGreenCard: string | undefined;
      let rawH1bStatus: string | undefined;

      // Extract all populated feedback columns as separate traceable items
      interface RowFeedbackItem {
        sourceColumn: string;
        feedbackLabel: string;
        columnIndex: number | null;
        feedbackIndex: number | null;
        text: string;
      }
      const rowFeedbackItems: RowFeedbackItem[] = [];

      for (const fm of feedbackMappings) {
        const val = row[fm.sourceColumn];
        if (val !== undefined && val !== null) {
          const sVal = String(val).trim();
          if (sVal) {
            rowFeedbackItems.push({
              sourceColumn: fm.sourceColumn,
              feedbackLabel: fm.feedbackLabel || fm.sourceColumn,
              columnIndex: fm.columnIndex ?? null,
              feedbackIndex: fm.feedbackIndex ?? null,
              text: sVal,
            });
          }
        }
      }

      // Capture ANY additional columns with text (e.g. Feedback 3, Feedback 4, Feedback 5, Feedback 6...)
      for (const [colName, val] of Object.entries(row)) {
        if (val === undefined || val === null) continue;
        const sVal = String(val).trim();
        if (!sVal) continue;
        const target = mappingLookup[colName];
        if (target && target !== 'ignore' && target !== 'recruiter_feedback') continue;
        if (rowFeedbackItems.some(f => f.sourceColumn === colName)) continue;
        if (isPhoneNumber(sVal) || sVal.includes('@') || isDateString(sVal)) continue;

        const fbDetect = detectFeedbackHeader(colName);
        const fbLabel = fbDetect.isFeedback
          ? fbDetect.feedbackLabel
          : (colName.startsWith('__EMPTY') || /^column\s*\d+/i.test(colName) ? `Feedback ${rowFeedbackItems.length + 1}` : colName);
        rowFeedbackItems.push({
          sourceColumn: colName,
          feedbackLabel: fbLabel,
          columnIndex: null,
          feedbackIndex: fbDetect.feedbackIndex || (rowFeedbackItems.length + 1),
          text: sVal,
        });
      }

      rawRecruiterFeedback = rowFeedbackItems.map(f => f.text).join('\n');

      for (const [colName, val] of Object.entries(row)) {
        const target = mappingLookup[colName];
        if (!target || target === 'ignore' || val === undefined || val === null) continue;
        const sVal = String(val).trim();
        if (!sVal) continue;

        switch (target) {
          case 'full_name': rawFullName = sVal; break;
          case 'first_name': rawFirstName = sVal; break;
          case 'last_name': rawLastName = sVal; break;
          case 'email': rawEmail = sVal; break;
          case 'secondary_email': rawSecondaryEmail = sVal; break;
          case 'phone': rawPhone = sVal; break;
          case 'secondary_phone': rawSecondaryPhone = sVal; break;
          case 'linkedin_url': rawLinkedIn = sVal; break;
          case 'location': rawLocation = sVal; break;
          case 'preferred_location': rawPreferredLocation = sVal; break;
          case 'company': rawCompany = sVal; break;
          case 'job_title': rawJobTitle = sVal; break;
          case 'job_id': rawJobId = sVal; break;
          case 'date_applied': rawDateApplied = sVal; break;
          case 'current_stage': rawCurrentStage = sVal; break;
          case 'recruiter_feedback':
            // Already captured with full column metadata in rowFeedbackItems
            break;
          case 'contact_date': rawContactDate = sVal; break;
          case 'contact_type': rawContactType = sVal; break;
          case 'resume_link': rawResumeLink = sVal; break;
          case 'status': rawStatus = sVal; break;
          case 'owner':
            rawOwner = sVal;
            break;
          case 'recruiter_name':
            rawRecruiterName = sVal;
            if (!rawOwner) rawOwner = sVal;
            break;
          case 'gender': rawGender = sVal; break;
          case 'green_card': rawGreenCard = sVal; break;
          case 'h1b_status': rawH1bStatus = sVal; break;
        }
      }

      // Safeguard: If rawResumeLink contains merged H1B (e.g. "No https://drive.google.com/...")
      if (rawResumeLink) {
        const m = rawResumeLink.match(/^(yes|no|y|n)\s+(https?:\/\/\S+)/i) || rawResumeLink.match(/(https?:\/\/\S+)\s+(yes|no|y|n)$/i);
        if (m) {
          const isY = m[1].toLowerCase().startsWith('y');
          const isN = m[1].toLowerCase().startsWith('n');
          if ((isY || isN) && !rawH1bStatus) {
            rawH1bStatus = isY ? 'Yes' : 'No';
          }
          rawResumeLink = m[2];
        }
      }
      if (rawH1bStatus) {
        const m = rawH1bStatus.match(/^(yes|no|y|n)\s+(https?:\/\/\S+)/i) || rawH1bStatus.match(/(https?:\/\/\S+)\s+(yes|no|y|n)$/i);
        if (m) {
          const isY = m[1].toLowerCase().startsWith('y');
          rawH1bStatus = isY ? 'Yes' : 'No';
          if (!rawResumeLink) {
            rawResumeLink = m[2];
          }
        }
      }

      // Direct column-header fallback for Green Card & H1B if not explicitly mapped
      if (!rawGreenCard) {
        for (const [k, v] of Object.entries(row)) {
          if (/green\s*card|us-c|us citizen/i.test(k) && v) {
            rawGreenCard = String(v).trim();
            break;
          }
        }
      }
      if (!rawH1bStatus) {
        for (const [k, v] of Object.entries(row)) {
          const s = String(v || '').trim();
          if (/h1b/i.test(k)) {
            const m = s.match(/^(yes|no|y|n)\b/i);
            rawH1bStatus = m ? (m[1].toLowerCase().startsWith('y') ? 'Yes' : 'No') : s;
            break;
          } else {
            const m = s.match(/^(yes|no|y|n)\s+https?:\/\//i);
            if (m) {
              rawH1bStatus = m[1].toLowerCase().startsWith('y') ? 'Yes' : 'No';
              if (!rawResumeLink) {
                const urlMatch = s.match(/https?:\/\/\S+/i);
                if (urlMatch) rawResumeLink = urlMatch[0];
              }
              break;
            }
          }
        }
      }

      // Pre-clean 0a: If rawFullName is a phone number, move to rawPhone!
      if (rawFullName && isPhoneNumber(rawFullName)) {
        if (!rawPhone) rawPhone = rawFullName;
        rawFullName = undefined;
      }
      // Pre-clean 0b: If rawJobTitle is a recruiter name, move to rawOwner!
      if (rawJobTitle && ['adam', 'alex', 'unassigned'].includes(rawJobTitle.toLowerCase().trim())) {
        if (!rawOwner || rawOwner === 'Unassigned') rawOwner = rawJobTitle;
        rawJobTitle = 'General Sourced Candidate';
      }
      // Pre-clean 0b-2: If rawJobTitle is an email address, rescue email if missing and set to Data Analyst!
      if (rawJobTitle && (rawJobTitle.includes('@') || /@(gmail|outlook|yahoo)/i.test(rawJobTitle) || /\b(gmailcom|outlookcom|yahoocom)\b/i.test(rawJobTitle))) {
        if (!rawEmail) rawEmail = rawJobTitle;
        rawJobTitle = 'Data Analyst';
      } else if (rawJobTitle) {
        rawJobTitle = cleanJobTitle(rawJobTitle);
      }
      // Pre-clean 0b-3: Rescue Job Title from Recruiter Feedback if Job Title is blank and feedback is an ATS tech role (e.g. CyberSecurity, AWS, Data Analyst)
      if ((!rawJobTitle || rawJobTitle === 'General Sourced Candidate') && rawRecruiterFeedback) {
        const feedbackLines = rawRecruiterFeedback.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
        for (const line of feedbackLines) {
          if (isRoleOrTech(line) && !line.includes('@') && !isPhoneNumber(line)) {
            rawJobTitle = cleanJobTitle(line);
            break;
          }
        }
      }
      // Pre-clean 0c: If rawOwner is actually recruiter feedback/screening notes:
      if (rawOwner && (
        rawOwner.length > 25 ||
        /^(he is|she is|female|male|not a|4 years|2 years|\d+\s*years|opt|f1|h1b|green card|voice mail|someone picked)/i.test(rawOwner)
      )) {
        const ownerNote = rawOwner;
        if (ownerNote.toLowerCase().includes('female candidate')) {
          rawGender = 'Female';
        }
        rawRecruiterFeedback = rawRecruiterFeedback ? `${rawRecruiterFeedback}\n${ownerNote}` : ownerNote;
        rowFeedbackItems.push({
          sourceColumn: 'Assigned Owner Notes',
          feedbackLabel: 'Screening Notes',
          columnIndex: null,
          feedbackIndex: null,
          text: ownerNote,
        });
        rawOwner = 'Unassigned';
      }

      if (rowFeedbackItems.length === 0 && rawRecruiterFeedback) {
        rowFeedbackItems.push({
          sourceColumn: 'Recruiter Feedback',
          feedbackLabel: 'Recruiter Feedback',
          columnIndex: null,
          feedbackIndex: null,
          text: rawRecruiterFeedback,
        });
      }

      // Pre-clean 1: If rawFullName is an ATS job role abbreviation or tech stack, prevent it from becoming candidate name!
      if (rawFullName && isRoleOrTech(rawFullName)) {
        if (!rawJobTitle || rawJobTitle === 'General Sourced Candidate') rawJobTitle = rawFullName;
        rawFullName = undefined;
      }
      // Pre-clean 1b: If rawFullName is a location, country, or header word, move to location!
      if (rawFullName && (isLocationOrCountry(rawFullName) || isHeaderOrLabelWord(rawFullName))) {
        if (!rawLocation) rawLocation = rawFullName;
        rawFullName = undefined;
      }
      // Pre-clean 0d: If rawFullName contains markdown email link or brackets (e.g. "priyanka killi[priyanka...](mailto:...)")
      if (rawFullName && (rawFullName.includes('[') || rawFullName.includes('mailto:') || rawFullName.includes('@'))) {
        const mailMatch = rawFullName.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (mailMatch && !rawEmail) {
          rawEmail = mailMatch[1];
        }
        rawFullName = rawFullName.replace(/\[.*?\](\(.*?\))?/g, '').replace(/mailto:[^\s)]+/g, '').trim();
      }

      // Pre-clean 1c: If rawFullName fails candidate name validation, discard it!
      if (rawFullName && !isValidCandidateName(rawFullName)) {
        rawFullName = undefined;
      }
      // Pre-clean 2: If rawFullName contains '@' and rawEmail is empty, move to rawEmail
      if (rawFullName && rawFullName.includes('@') && !rawEmail) {
        rawEmail = rawFullName;
        rawFullName = undefined;
      }
      // Pre-clean 3: If rawFullName is missing or empty, attempt extraction from rawRecruiterFeedback
      if (!rawFullName && rawRecruiterFeedback) {
        const extracted = extractCandidateName(rawRecruiterFeedback);
        if (extracted.name) {
          rawFullName = extracted.name;
        }
      }
      // Pre-clean 3b: Name is strictly compulsory and must never be synthesized from email without spaces
      rawFullName = rawFullName || undefined;
      // Pre-clean 3c: If rawEmail is still missing, scan ALL cell values of row for any email address or auto-healed email
      if (!rawEmail) {
        for (const [colName, val] of Object.entries(row)) {
          if (!val) continue;
          const sVal = String(val).trim();
          const mailMatch = sVal.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (mailMatch) {
            rawEmail = mailMatch[1];
            break;
          }
          const healed = normalizeEmail(sVal);
          if (healed && healed.isValid && !['adam', 'alex', 'unassigned'].includes(healed.original.toLowerCase())) {
            rawEmail = healed.original;
            break;
          }
        }
      }
      if (!rawEmail && rawRecruiterFeedback) {
        const mailMatch = rawRecruiterFeedback.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (mailMatch) {
          rawEmail = mailMatch[1];
        } else {
          const healed = normalizeEmail(rawRecruiterFeedback);
          if (healed && healed.isValid) {
            rawEmail = healed.original;
          }
        }
      }
      // Pre-clean 3d: If rawPhone is still missing, extract literal phone from rawRecruiterFeedback
      if (!rawPhone && rawRecruiterFeedback) {
        const phoneMatch = extractCleanPhone(rawRecruiterFeedback);
        if (phoneMatch) {
          rawPhone = phoneMatch;
        } else {
          const pMatch = rawRecruiterFeedback.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b)/);
          if (pMatch) {
            const cleanP = extractCleanPhone(pMatch[0]);
            if (cleanP) {
              rawPhone = cleanP;
            }
          }
        }
      }
      // Pre-clean 4: Clean phone number
      if (rawPhone) {
        const cleanedPhone = extractCleanPhone(rawPhone);
        if (cleanedPhone !== null) {
          rawPhone = cleanedPhone;
        }
      }

      // 2. Normalize identity fields
      const { fullName, firstName, lastName } = parseAndNormalizeName(rawFullName, rawFirstName, rawLastName);
      const emailNorm = normalizeEmail(rawEmail);
      const phoneNorm = normalizePhone(rawPhone);
      const linkedInNorm = normalizeLinkedInUrl(rawLinkedIn);

      // Extract and strictly classify URLs from all row cells (Part 3)
      const allRowText = Object.values(row).map(v => String(v || '')).join(' ');
      const extractedUrls = extractUrlsFromText(allRowText);
      let rowLinkedInUrl: string | null = null;
      let rowResumeUrl: string | null = null;
      const rowUnclassifiedUrls: string[] = [];

      for (const u of extractedUrls) {
        const c = classifyUrl(u);
        if (c.type === 'linkedin' && !rowLinkedInUrl && c.cleanUrl) {
          rowLinkedInUrl = c.cleanUrl;
        } else if (c.type === 'resume' && !rowResumeUrl && c.cleanUrl) {
          rowResumeUrl = c.cleanUrl;
        } else if (c.cleanUrl && !rowUnclassifiedUrls.includes(c.cleanUrl)) {
          if (c.cleanUrl !== rowLinkedInUrl && c.cleanUrl !== rowResumeUrl) {
            rowUnclassifiedUrls.push(c.cleanUrl);
          }
        }
      }

      if (rawResumeLink) {
        const c = classifyUrl(rawResumeLink);
        if (c.type === 'resume' && c.cleanUrl && !rowResumeUrl) {
          rowResumeUrl = c.cleanUrl;
        } else if (c.type === 'linkedin' && c.cleanUrl && !rowLinkedInUrl) {
          rowLinkedInUrl = c.cleanUrl;
        }
      }
      if (rawLinkedIn) {
        const c = classifyUrl(rawLinkedIn);
        if (c.type === 'linkedin' && c.cleanUrl && !rowLinkedInUrl) {
          rowLinkedInUrl = c.cleanUrl;
        } else if (c.type === 'resume' && c.cleanUrl && !rowResumeUrl) {
          rowResumeUrl = c.cleanUrl;
        }
      }

      const autoDetectedGender = detectGender(rawGender, firstName, fullName, rawRecruiterFeedback);
      const detectedGender = targetGenderOverride !== 'auto'
        ? targetGenderOverride
        : autoDetectedGender;

      // Determine Company: Target selection override or row content
      let company: CompanyName = targetCompanyOverride !== 'auto' ? targetCompanyOverride : 'AaraTech';
      if (targetCompanyOverride === 'auto' && rawCompany) {
        if (rawCompany.toLowerCase().includes('clinisol')) {
          company = 'ClinisolTech';
        } else if (rawCompany.toLowerCase().includes('aara')) {
          company = 'AaraTech';
        }
      }

      // Format Application Date / Assigned Date using exact original date from row
      let appDate = '';
      if (rawDateApplied) {
        const parsed = parseDateStringToYMD(rawDateApplied);
        if (parsed) {
          appDate = parsed;
          lastValidAppDate = parsed;
        }
      }
      if (!appDate && lastValidAppDate) {
        appDate = lastValidAppDate;
      }
      if (!appDate) {
        appDate = new Date().toISOString().split('T')[0];
      }

      // Format Contact Date
      let contactDate = appDate;
      if (rawContactDate) {
        const parsedContact = parseDateStringToYMD(rawContactDate);
        if (parsedContact) {
          contactDate = parsedContact;
        }
      }

      // Determine Owner (Support Adam, Alex, explicit owner column, or targetOwnerOverride; default to Unassigned)
      const determinedOwner = rawOwner || rawRecruiterName || (targetOwnerOverride && targetOwnerOverride !== 'auto' && targetOwnerOverride !== 'Unassigned' ? targetOwnerOverride : 'Unassigned');

      // MANDATORY CRITERIA (Strict User Requirement):
      // Name, Phone Number, and Email are STRICTLY COMPULSORY!
      // If ANY of these three is missing (or phone has fewer than 7 valid digits, or email is invalid, or name is invalid),
      // the row MUST be pushed to Manual Review (Incomplete Records) rather than accepted as a master candidate profile.
      const cleanPhoneDigits = formatPureDigitsPhone(rawPhone || (phoneNorm ? phoneNorm.normalized : ''));
      const hasValidPhone = Boolean(cleanPhoneDigits && cleanPhoneDigits.length >= 7 && (phoneNorm ? phoneNorm.isValid : true));
      const hasValidName = Boolean(fullName && fullName.trim().length >= 2 && isValidCandidateName(fullName));
      const hasEmail = Boolean(emailNorm && emailNorm.isValid);
      const isCompleteProfile = hasValidName && hasEmail && hasValidPhone;

      if (!isCompleteProfile) {
        let reason: IncompleteReason = 'missing_both';
        let description = 'Missing required candidate information';

        if (!hasValidName && !hasEmail && !hasValidPhone) {
          reason = 'missing_both';
          description = 'Missing Name, Email, and Phone Number';
        } else if (!hasValidName && !hasValidPhone) {
          reason = 'missing_both';
          description = 'Missing Candidate Name and Phone Number';
        } else if (!hasValidName && !hasEmail) {
          reason = 'missing_both';
          description = 'Missing Candidate Name and Email Address';
        } else if (!hasEmail && !hasValidPhone) {
          reason = 'missing_both';
          description = 'Missing Candidate Email and Phone Number';
        } else if (!hasValidName) {
          reason = 'missing_name';
          description = 'Missing candidate full name';
        } else if (!hasEmail) {
          reason = 'missing_email';
          description = 'Missing valid candidate email address';
        } else if (!hasValidPhone) {
          reason = 'missing_phone';
          description = 'Missing valid candidate phone number';
        }

        // Only push to incomplete records if there is some candidate data present in the row
        if (hasValidName || hasEmail || hasValidPhone || rawFullName || rawEmail || rawPhone) {
          newIncompleteRecords.push({
            id: generateUuid(),
            missing_reason: reason,
            missing_description: description,
            date_assigned: appDate,
            raw_name: hasValidName ? fullName : (rawFullName || null),
            raw_email: emailNorm ? emailNorm.original : (rawEmail || null),
            raw_phone: cleanPhoneDigits || (phoneNorm ? phoneNorm.original : (rawPhone || null)),
            raw_role: rawJobTitle || null,
            company,
            owner: determinedOwner,
            recruiter_feedback: rawRecruiterFeedback || null,
            source_file: file.name,
            source_row: rowNumber,
            created_at: now,
            updated_at: now,
          });
        }
        continue;
      }

      // STRICT COMPANY ISOLATION:
      // Candidate pool for duplicate check is strictly filtered to candidates of the EXACT SAME company!
      const companyCandidatePool = candidatePool.filter(p => {
        const pComp = p.company || p.current_company || (p.applications && p.applications.find(a => a.company)?.company);
        return !company || pComp === company || p.company === 'Both';
      });

      // 3. Run Duplicate Matching Engine strictly within the same company pool
      const matchResult = evaluateDuplicateMatch(
        {
          fullName,
          firstName,
          lastName,
          normalizedEmail: emailNorm ? emailNorm.normalized : null,
          normalizedPhone: phoneNorm ? phoneNorm.normalized : null,
          normalizedLinkedIn: linkedInNorm,
          targetCompany: company,
        },
        companyCandidatePool
      );

      // 4. Branch based on match decision
      if (matchResult.decision === 'MATCHED' && matchResult.matchedPerson) {
        // Direct match: Attach new historical data to existing master person
        matchedPeopleCount++;
        const targetPerson = matchResult.matchedPerson;

        // Name Repair: If targetPerson had a placeholder or corrupted name (e.g. "Yes", "Unknown") and incoming row has a valid candidate name, repair it!
        if (isPlaceholderOrInvalidName(targetPerson.full_name) && isValidCandidateName(fullName)) {
          targetPerson.full_name = fullName;
          targetPerson.first_name = firstName;
          targetPerson.last_name = lastName;
        }

        // Populate or refine gender if previously unspecified
        if ((!targetPerson.gender || targetPerson.gender === 'Unspecified') && detectedGender !== 'Unspecified') {
          targetPerson.gender = detectedGender;
        }

        // Section 11: Populate location and preferred location if missing on target profile
        if (!targetPerson.location || /^(open to us|united states)$/i.test(targetPerson.location)) {
          targetPerson.location = resolveCandidateLocation(rawLocation, rawRecruiterFeedback, phoneNorm?.normalized || rawPhone);
        }
        if (!targetPerson.preferred_location) {
          targetPerson.preferred_location = rawPreferredLocation || (/open to us|open to relocate/i.test(rawRecruiterFeedback || '') ? 'Open to US' : null);
        }

        // Section 9: Attach secondary email and phone
        if (!targetPerson.secondary_email && rawSecondaryEmail) {
          targetPerson.secondary_email = rawSecondaryEmail;
        }
        if (!targetPerson.secondary_phone && rawSecondaryPhone) {
          targetPerson.secondary_phone = rawSecondaryPhone;
        }

        // Attach email if not already present
        if (emailNorm) {
          if (!targetPerson.emails) targetPerson.emails = [];
          const exists = targetPerson.emails.some(e => e.normalized_email === emailNorm.normalized);
          if (!exists) {
            targetPerson.emails.push({
              id: generateUuid(),
              person_id: targetPerson.id,
              email: emailNorm.original,
              normalized_email: emailNorm.normalized,
              is_primary: false,
              source: `Import ${importId}`,
              source_file: file.name,
              source_row: rowNumber,
              first_seen_at: now,
              last_seen_at: now,
              created_at: now,
            });
          }
        }

        // Attach phone if not already present
        if (phoneNorm) {
          if (!targetPerson.phones) targetPerson.phones = [];
          const exists = targetPerson.phones.some(p => p.phone_normalized === phoneNorm.normalized);
          if (!exists) {
            targetPerson.phones.push({
              id: generateUuid(),
              person_id: targetPerson.id,
              phone_original: phoneNorm.normalized,
              phone_normalized: phoneNorm.normalized,
              is_primary: false,
              source: `Import ${importId}`,
              source_file: file.name,
              source_row: rowNumber,
              first_seen_at: now,
              last_seen_at: now,
              created_at: now,
            });
          }
        }

        // Non-destructive URL enrichment (Part 3)
        if (rowLinkedInUrl && !targetPerson.linkedin_url) {
          targetPerson.linkedin_url = rowLinkedInUrl;
        }
        if (rowResumeUrl && !(targetPerson as any).resume_url) {
          (targetPerson as any).resume_url = rowResumeUrl;
        }

        // Visa / Screening status enrichment (Part 1 & 4)
        if (rawGreenCard && !targetPerson.green_card) {
          targetPerson.green_card = rawGreenCard;
        }
        if (rawH1bStatus && !targetPerson.h1b_status) {
          targetPerson.h1b_status = rawH1bStatus;
        }

        // Distinct Logical Dates (Part 4)
        if (isFile1 && appDate && !targetPerson.application_collected_date) {
          targetPerson.application_collected_date = appDate;
        }
        if (isFile2 && appDate) {
          targetPerson.recruiter_assigned_date = appDate;
          targetPerson.last_assignment_date = appDate;
        }

        // Recruiter Assignment History (Part 6)
        if (determinedOwner && determinedOwner !== 'Unassigned' && determinedOwner !== 'Adam') {
          targetPerson.current_owner = determinedOwner;
          if (!targetPerson.first_assigned_recruiter) {
            targetPerson.first_assigned_recruiter = determinedOwner;
          }
          if (!targetPerson.assignments) targetPerson.assignments = [];
          const assignDate = (isFile2 ? appDate : targetPerson.recruiter_assigned_date) || now.split('T')[0];
          const asgnExists = targetPerson.assignments.some(
            a => a.recruiter_name.toLowerCase() === determinedOwner.toLowerCase() && a.assigned_date === assignDate
          );
          if (!asgnExists) {
            assignmentsCreated++;
            targetPerson.assignments.forEach(a => { if (a.status === 'Current') a.status = 'Reassigned'; });
            targetPerson.assignments.unshift({
              id: generateUuid(),
              person_id: targetPerson.id,
              recruiter_name: determinedOwner,
              assigned_date: assignDate,
              status: 'Current',
              created_by: file.name,
              created_at: now,
            });
            targetPerson.last_assignment_date = assignDate;
          }
        }

        // Section 5: Separate Person Matching from Application Matching
        let activeAppId: string | null = null;
        let applicationMatched = false;
        let applicationUncertain = false;

        if (!targetPerson.applications) targetPerson.applications = [];

        const normIncomingRole = rawJobTitle ? rawJobTitle.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
        let matchedApp = targetPerson.applications.find(a => 
          a.company === company && (
            (normIncomingRole && (a.job_title || '').toLowerCase().replace(/[^a-z0-9]/g, '') === normIncomingRole) ||
            (a.job_id && rawJobId && a.job_id === rawJobId)
          )
        );

        if (!matchedApp && isFile2) {
          // Rule 5.2 & 5.4: Do not create a new application simply because the recruiter file includes a job title!
          // If the candidate has exactly one application in this company, attach to that application:
          const compApps = targetPerson.applications.filter(a => a.company === company);
          if (compApps.length === 1) {
            matchedApp = compApps[0];
          } else if (compApps.length > 1) {
            // Multiple applications exist and none match incoming role: flag as uncertain!
            applicationUncertain = true;
          }
        }

        if (matchedApp) {
          applicationMatched = true;
          activeAppId = matchedApp.id;
          matchedApplicationsCount++;
          // Consolidate non-destructively:
          if (!matchedApp.resume_link && (rowResumeUrl || rawResumeLink)) {
            matchedApp.resume_link = rowResumeUrl || rawResumeLink;
          }
          if (rawGreenCard && !(matchedApp as any).green_card) {
            (matchedApp as any).green_card = rawGreenCard;
          }
          if (rawH1bStatus && !(matchedApp as any).h1b_status) {
            (matchedApp as any).h1b_status = rawH1bStatus;
          }
          if (isFile1 && appDate && !(matchedApp as any).application_collected_date) {
            (matchedApp as any).application_collected_date = appDate;
          }
          if (isFile2 && appDate) {
            (matchedApp as any).recruiter_assigned_date = appDate;
          }
          if (rawCurrentStage && rawCurrentStage !== 'Applied' && matchedApp.current_stage === 'Applied') {
            matchedApp.current_stage = rawCurrentStage;
          }
          matchedApp.updated_at = now;
        } else if (!isFile2 && rawJobTitle) {
          // Genuinely distinct application for a different role in File 1
          applicationsCreated++;
          const newApp = {
            id: generateUuid(),
            person_id: targetPerson.id,
            company,
            job_id: rawJobId || null,
            job_title: rawJobTitle,
            date_applied: appDate,
            application_collected_date: isFile1 ? appDate : null,
            recruiter_assigned_date: isFile2 ? appDate : null,
            green_card: rawGreenCard || null,
            h1b_status: rawH1bStatus || null,
            current_stage: rawCurrentStage || 'Applied',
            resume_link: rowResumeUrl || rawResumeLink || null,
            source_file: file.name,
            source_row: rowNumber,
            source_import_id: importId,
            created_at: now,
            updated_at: now,
          };
          targetPerson.applications.unshift(newApp);
          activeAppId = newApp.id;
          matchedApplicationsCount++;
        } else if (isFile2) {
          // File 2 row where candidate has no applications or multiple ambiguous applications
          applicationUncertain = true;
          unresolvedApplicationsCount++;
        }

        // Section 6: Preserve Recruiter Assignments and Feedback (100% Verbatim & Traceable)
        if (rowFeedbackItems.length > 0) {
          if (!targetPerson.recruiter_contacts) targetPerson.recruiter_contacts = [];
          const f1Item = rowFeedbackItems.find(f => f.feedbackIndex === 1 || f.feedbackLabel.toLowerCase().includes('feedback 1')) || rowFeedbackItems[0];
          const f2Item = rowFeedbackItems.find(f => (f.feedbackIndex === 2 || f.feedbackLabel.toLowerCase().includes('feedback 2')) && f !== f1Item) || (rowFeedbackItems.length > 1 && rowFeedbackItems[1] !== f1Item ? rowFeedbackItems[1] : null);

          const f1 = f1Item?.text || null;
          const f2 = f2Item?.text || null;
          const additionalItems = rowFeedbackItems.filter(f => f !== f1Item && f !== f2Item);

          const allTexts = rowFeedbackItems.map(f => f.text).filter(Boolean);
          const rawFeedbackCombined = allTexts.join(' • ');
          const notesCombined = rowFeedbackItems.map(f => `${f.feedbackLabel}: ${f.text}`).join('\n');
          const additionalFeedbackJson = additionalItems.length > 0 ? JSON.stringify(additionalItems.map(f => ({
            label: f.feedbackLabel,
            text: f.text,
            sourceColumn: f.sourceColumn,
            feedbackIndex: f.feedbackIndex,
          }))) : null;

          const recName = determinedOwner !== 'Unassigned' ? determinedOwner : (rawRecruiterName || 'Recruiter');

          const isDup = isDuplicateContact(targetPerson.recruiter_contacts, {
            text: rawFeedbackCombined,
            feedbackLabel: rowFeedbackItems[0]?.feedbackLabel,
            columnIndex: rowFeedbackItems[0]?.columnIndex,
            contactDate,
            sourceFile: file.name,
            sourceRow: rowNumber,
            recruiterName: recName,
          });

          if (!isDup) {
            contactsCreated++;
            targetPerson.recruiter_contacts.unshift({
              id: generateUuid(),
              person_id: targetPerson.id,
              application_id: activeAppId,
              recruiter_name: recName,
              contact_date: contactDate,
              contact_type: rawContactType || 'Phone',
              contact_method: rawContactType || 'Phone',
              outcome: f1 || 'Logged',
              feedback_1: f1,
              feedback_2: f2,
              additional_feedback: additionalFeedbackJson,
              original_feedback: rawFeedbackCombined, // 100% VERBATIM!
              raw_feedback: rawFeedbackCombined,
              notes: notesCombined,
              feedback_label: rowFeedbackItems[0]?.feedbackLabel,
              column_index: rowFeedbackItems[0]?.columnIndex,
              import_id: importId,
              source: `Import ${importId} | ${rowFeedbackItems.map(f => f.feedbackLabel).join(', ')}`,
              source_file: file.name,
              source_row: rowNumber,
              application_unresolved: applicationUncertain,
              created_at: now,
            });
          }

          targetPerson.last_contacted_by = determinedOwner !== 'Unassigned' ? determinedOwner : (rawRecruiterName || targetPerson.last_contacted_by || null);
          targetPerson.last_contact_date = contactDate;
          targetPerson.latest_contact_outcome = rowFeedbackItems[0]?.text?.slice(0, 50) || targetPerson.latest_contact_outcome || null;
          if (!targetPerson.first_confirmed_contacted_by && targetPerson.last_contacted_by) {
            targetPerson.first_confirmed_contacted_by = targetPerson.last_contacted_by;
          }
        }

        targetPerson.last_activity_at = now;
        if (!updatedPeople.some(p => p.id === targetPerson.id)) {
          updatedPeople.push(targetPerson);
        }

      } else {
        // NEW PERSON or POSSIBLE MATCH
        newPeopleCount++;
        const newPersonUuid = generateUuid();
        const personNumber = 1000 + candidatePool.length + 1;
        const humanPersonId = `P-${String(personNumber).padStart(6, '0')}`;

        const createdPerson: Person = {
          id: newPersonUuid,
          person_id: humanPersonId,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          gender: detectedGender,
          primary_email: emailNorm ? emailNorm.original : null,
          secondary_email: rawSecondaryEmail ? (normalizeEmail(rawSecondaryEmail)?.original || rawSecondaryEmail) : null,
          primary_phone: phoneNorm ? phoneNorm.normalized : (rawPhone ? formatPureDigitsPhone(rawPhone) : null),
          secondary_phone: rawSecondaryPhone ? (normalizePhone(rawSecondaryPhone)?.normalized || formatPureDigitsPhone(rawSecondaryPhone)) : null,
          location: resolveCandidateLocation(rawLocation, rawRecruiterFeedback, phoneNorm?.normalized || rawPhone),
          preferred_location: rawPreferredLocation || (/open to us|open to relocate/i.test(rawRecruiterFeedback || '') ? 'Open to US' : null),
          zip_code: null,
          headline: rawJobTitle || null,
          current_title: rawJobTitle || null,
          current_company: company,
          company,
          linkedin_url: rowLinkedInUrl || linkedInNorm,
          resume_url: rowResumeUrl || null,
          unclassified_links: rowUnclassifiedUrls,
          green_card: rawGreenCard || null,
          h1b_status: rawH1bStatus || null,
          application_collected_date: isFile1 ? appDate : null,
          recruiter_assigned_date: isFile2 ? appDate : null,
          first_assigned_recruiter: (determinedOwner && determinedOwner !== 'Unassigned' && determinedOwner !== 'Adam') ? determinedOwner : null,
          last_assignment_date: isFile2 ? appDate : null,
          current_status: (rawStatus as any) || 'New',
          current_owner: determinedOwner,
          created_at: appDate ? `${appDate}T12:00:00.000Z` : now,
          updated_at: now,
          last_activity_at: now,
          emails: (() => {
            const list: PersonEmail[] = [];
            if (emailNorm) {
              list.push({
                id: generateUuid(),
                person_id: newPersonUuid,
                email: emailNorm.original,
                normalized_email: emailNorm.normalized,
                is_primary: true,
                source: `Import ${importId}`,
                source_file: file.name,
                source_row: rowNumber,
                first_seen_at: now,
                last_seen_at: now,
                created_at: now,
              });
            }
            if (rawSecondaryEmail) {
              const sec = normalizeEmail(rawSecondaryEmail);
              if (sec && (!emailNorm || sec.normalized !== emailNorm.normalized)) {
                list.push({
                  id: generateUuid(),
                  person_id: newPersonUuid,
                  email: sec.original,
                  normalized_email: sec.normalized,
                  is_primary: false,
                  source: `Import ${importId}`,
                  source_file: file.name,
                  source_row: rowNumber,
                  first_seen_at: now,
                  last_seen_at: now,
                  created_at: now,
                });
              }
            }
            return list;
          })(),
          phones: (() => {
            const list: PersonPhone[] = [];
            if (phoneNorm) {
              list.push({
                id: generateUuid(),
                person_id: newPersonUuid,
                phone_original: phoneNorm.normalized,
                phone_normalized: phoneNorm.normalized,
                is_primary: true,
                source: `Import ${importId}`,
                source_file: file.name,
                source_row: rowNumber,
                first_seen_at: now,
                last_seen_at: now,
                created_at: now,
              });
            }
            if (rawSecondaryPhone) {
              const secP = normalizePhone(rawSecondaryPhone);
              if (secP && (!phoneNorm || secP.normalized !== phoneNorm.normalized)) {
                list.push({
                  id: generateUuid(),
                  person_id: newPersonUuid,
                  phone_original: secP.normalized,
                  phone_normalized: secP.normalized,
                  is_primary: false,
                  source: `Import ${importId}`,
                  source_file: file.name,
                  source_row: rowNumber,
                  first_seen_at: now,
                  last_seen_at: now,
                  created_at: now,
                });
              }
            }
            return list;
          })(),
          assignments: (() => {
            if (determinedOwner && determinedOwner !== 'Unassigned' && determinedOwner !== 'Adam') {
              return [{
                id: generateUuid(),
                person_id: newPersonUuid,
                recruiter_name: determinedOwner,
                assigned_date: isFile2 ? appDate : (appDate || now.split('T')[0]),
                status: 'Current' as const,
                created_by: file.name,
                created_at: now,
              }];
            }
            return [];
          })(),
          applications: [],
          recruiter_contacts: [],
          status_history: [],
        };

        const appJobTitle = rawJobTitle || 'General Sourced Candidate';
        applicationsCreated++;
        const newApp = {
          id: generateUuid(),
          person_id: newPersonUuid,
          company,
          job_id: rawJobId || null,
          job_title: appJobTitle,
          date_applied: appDate,
          application_collected_date: isFile1 ? appDate : null,
          recruiter_assigned_date: isFile2 ? appDate : null,
          green_card: rawGreenCard || null,
          h1b_status: rawH1bStatus || null,
          current_stage: rawCurrentStage || 'Applied',
          resume_link: rowResumeUrl || rawResumeLink || null,
          source_file: file.name,
          source_row: rowNumber,
          source_import_id: importId,
          created_at: appDate ? `${appDate}T12:00:00.000Z` : now,
          updated_at: now,
        };
        createdPerson.applications!.push(newApp);

        if (rowFeedbackItems.length > 0) {
          const f1Item = rowFeedbackItems.find(f => f.feedbackIndex === 1 || f.feedbackLabel.toLowerCase().includes('feedback 1')) || rowFeedbackItems[0];
          const f2Item = rowFeedbackItems.find(f => (f.feedbackIndex === 2 || f.feedbackLabel.toLowerCase().includes('feedback 2')) && f !== f1Item) || (rowFeedbackItems.length > 1 && rowFeedbackItems[1] !== f1Item ? rowFeedbackItems[1] : null);

          const f1 = f1Item?.text || null;
          const f2 = f2Item?.text || null;
          const additionalItems = rowFeedbackItems.filter(f => f !== f1Item && f !== f2Item);

          const allTexts = rowFeedbackItems.map(f => f.text).filter(Boolean);
          const rawFeedbackCombined = allTexts.join(' • ');
          const notesCombined = rowFeedbackItems.map(f => `${f.feedbackLabel}: ${f.text}`).join('\n');
          const additionalFeedbackJson = additionalItems.length > 0 ? JSON.stringify(additionalItems.map(f => ({
            label: f.feedbackLabel,
            text: f.text,
            sourceColumn: f.sourceColumn,
            feedbackIndex: f.feedbackIndex,
          }))) : null;

          contactsCreated++;
          createdPerson.recruiter_contacts!.push({
            id: generateUuid(),
            person_id: newPersonUuid,
            application_id: newApp.id,
            recruiter_name: determinedOwner !== 'Unassigned' ? determinedOwner : (rawRecruiterName || 'Recruiter'),
            contact_date: contactDate,
            contact_type: rawContactType || 'Phone',
            contact_method: rawContactType || 'Phone',
            outcome: f1 || 'Logged',
            feedback_1: f1,
            feedback_2: f2,
            additional_feedback: additionalFeedbackJson,
            original_feedback: rawFeedbackCombined, // VERBATIM
            raw_feedback: rawFeedbackCombined,
            notes: notesCombined,
            feedback_label: rowFeedbackItems[0]?.feedbackLabel,
            column_index: rowFeedbackItems[0]?.columnIndex,
            import_id: importId,
            source: `Import ${importId} | ${rowFeedbackItems.map(f => f.feedbackLabel).join(', ')}`,
            source_file: file.name,
            source_row: rowNumber,
            created_at: contactDate ? `${contactDate}T12:00:00.000Z` : now,
          });

          createdPerson.last_contacted_by = determinedOwner !== 'Unassigned' ? determinedOwner : (rawRecruiterName || null);
          createdPerson.last_contact_date = contactDate;
          createdPerson.first_confirmed_contacted_by = createdPerson.last_contacted_by;
          createdPerson.latest_contact_outcome = rowFeedbackItems[0]?.text?.slice(0, 50) || null;
        }

        // Add to pool and newPeople
        candidatePool.push(createdPerson);
        newPeople.push(createdPerson);

        // If this was flagged as a POSSIBLE MATCH against an existing candidate, create a PossibleMatch item
        if (matchResult.decision === 'POSSIBLE_MATCH' && matchResult.matchedPerson) {
          possibleMatchesCount++;
          const pmCode = `PM-${String(Date.now()).slice(-6)}`;
          newPossibleMatches.push({
            id: generateUuid(),
            match_code: pmCode,
            candidate_a_id: matchResult.matchedPerson.id,
            candidate_b_id: createdPerson.id,
            match_reason: matchResult.matchReason || 'Potential duplicate flagged for recruiter review',
            status: 'pending',
            created_at: now,
          });
        }
      }

      if (onProgress && (idx + 1) % 10 === 0) {
        onProgress(idx + 1, rawRows.length);
      }
      // Yield to UI thread every 50 rows so progress bar updates and browser never blocks
      if ((idx + 1) % 50 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    } catch (err: any) {
      errorRows.push({
        row: rowNumber,
        reason: err.message || 'Processing error',
        rawData: row,
      });
    }
  }

  // Ensure progress bar explicitly reaches 100% total rows
  if (onProgress) {
    onProgress(rawRows.length, rawRows.length);
  }

  // =========================================================================
  // AUTOMATIC GEMINI AI RESOLUTION (RUNS AUTOMATICALLY WHEN PROBLEMS OCCUR)
  // Handles:
  // 1. Incomplete records (auto-rescues candidate names, phones, emails from notes)
  // 2. Possible duplicate matches (auto-verifies and merges confirmed matches)
  // =========================================================================
  try {
    // 1. AUTO-RESCUE INCOMPLETE PROFILES (Runs automatically on problematic rows)
    if (newIncompleteRecords.length > 0 && geminiService.hasApiKey()) {
      const rescueResults = await geminiService.rescueIncompleteProfiles(newIncompleteRecords);
      const rescuedIds = new Set<string>();

      for (const res of rescueResults) {
        const original = newIncompleteRecords.find(r => r.id === res.recordId);
        if (!original) continue;

        let resName = res.extractedName ? res.extractedName.trim() : '';
        if (!resName && original.raw_name) {
          const cleanRaw = original.raw_name
            .replace(/\[\s*.*?\s*\](?:\(mailto:[^\s)]+\))?/gi, '')
            .replace(/mailto:[^\s)]+/gi, '')
            .replace(/<[^\s>]+>/gi, '')
            .replace(/[\[\]()<>]/g, '')
            .trim();
          if (isValidCandidateName(cleanRaw)) resName = cleanRaw;
        }

        const rEmailNorm = normalizeEmail(res.extractedEmail) || (original.raw_email && !['adam', 'alex', 'unassigned'].includes(original.raw_email.toLowerCase()) ? normalizeEmail(original.raw_email) : null);
        const rPhoneNorm = normalizePhone(res.extractedPhone) || (original.raw_phone ? normalizePhone(original.raw_phone) : null);

        if (res.isRescueable && resName && rPhoneNorm && rEmailNorm) {
          const { fullName: rFullName, firstName: rFirst, lastName: rLast } = parseAndNormalizeName(resName);

          const rPersonUuid = generateUuid();
          const rPersonNum = 1000 + candidatePool.length + 1;
          const rHumanId = `P-${String(rPersonNum).padStart(6, '0')}`;

          const rescuedPerson: Person = {
            id: rPersonUuid,
            person_id: rHumanId,
            first_name: rFirst,
            last_name: rLast,
            full_name: rFullName,
            gender: res.extractedGender !== 'Unspecified' ? res.extractedGender : (targetGenderOverride !== 'auto' ? targetGenderOverride : 'Unspecified'),
            primary_email: rEmailNorm ? rEmailNorm.original : (res.extractedEmail || null),
            secondary_email: null,
            primary_phone: rPhoneNorm ? rPhoneNorm.normalized : (res.extractedPhone || null),
            secondary_phone: null,
            location: res.extractedLocation || resolveCandidateLocation(null, original.recruiter_feedback, rPhoneNorm?.normalized || res.extractedPhone),
            preferred_location: null,
            zip_code: null,
            headline: res.extractedRole || original.raw_role || 'General Sourced Candidate',
            current_title: res.extractedRole || original.raw_role || 'General Sourced Candidate',
            current_company: original.company,
            linkedin_url: null,
            current_status: 'New',
            current_owner: original.owner || 'Unassigned',
            created_at: original.date_assigned ? `${original.date_assigned}T12:00:00.000Z` : now,
            updated_at: now,
            last_activity_at: now,
            emails: rEmailNorm ? [{
              id: generateUuid(),
              person_id: rPersonUuid,
              email: rEmailNorm.original,
              normalized_email: rEmailNorm.normalized,
              is_primary: true,
              source: `Import ${importId} (Gemini AI Auto-Rescue)`,
              source_file: file.name,
              source_row: original.source_row,
              first_seen_at: now,
              last_seen_at: now,
              created_at: now,
            }] : [],
            phones: rPhoneNorm ? [{
              id: generateUuid(),
              person_id: rPersonUuid,
              phone_original: rPhoneNorm ? rPhoneNorm.normalized : (res.extractedPhone ? formatPureDigitsPhone(res.extractedPhone) : ''),
              phone_normalized: rPhoneNorm ? rPhoneNorm.normalized : (res.extractedPhone ? formatPureDigitsPhone(res.extractedPhone) : ''),
              is_primary: true,
              source: `Import ${importId} (Gemini AI Auto-Rescue)`,
              source_file: file.name,
              source_row: original.source_row,
              first_seen_at: now,
              last_seen_at: now,
              created_at: now,
            }] : [],
            applications: [{
              id: generateUuid(),
              person_id: rPersonUuid,
              company: original.company,
              job_id: null,
              job_title: res.extractedRole || original.raw_role || 'General Sourced Candidate',
              date_applied: original.date_assigned,
              current_stage: 'Applied',
              resume_link: null,
              source_file: file.name,
              source_row: original.source_row,
              source_import_id: importId,
              created_at: original.date_assigned ? `${original.date_assigned}T12:00:00.000Z` : now,
              updated_at: now,
            }],
            recruiter_contacts: original.recruiter_feedback ? [{
              id: generateUuid(),
              person_id: rPersonUuid,
              application_id: null,
              recruiter_name: original.owner || 'Recruiter',
              contact_date: original.date_assigned,
              contact_type: 'Phone',
              original_feedback: original.recruiter_feedback, // 100% VERBATIM!
              source: `Import ${importId} (Gemini AI Auto-Rescue)`,
              source_file: file.name,
              source_row: original.source_row,
              created_at: original.date_assigned ? `${original.date_assigned}T12:00:00.000Z` : now,
            }] : [],
            status_history: [],
          };

          candidatePool.push(rescuedPerson);
          newPeople.push(rescuedPerson);
          newPeopleCount++;
          applicationsCreated++;
          if (original.recruiter_feedback) contactsCreated++;
          rescuedIds.add(original.id);
        }
      }

      if (rescuedIds.size > 0) {
        const remaining = newIncompleteRecords.filter(r => !rescuedIds.has(r.id));
        newIncompleteRecords.length = 0;
        newIncompleteRecords.push(...remaining);
      }

      // Filter out orphan notes that lack both candidate name and contact information
      const legitimateIncomplete = newIncompleteRecords.filter(r => {
        const name = (r.raw_name || '').trim();
        const email = (r.raw_email || '').trim();
        const phone = (r.raw_phone || '').trim();
        const hasName = Boolean(name && !isLocationOrCountry(name) && !isRoleOrTech(name) && !isHeaderOrLabelWord(name) && !isScreeningNote(name) && isValidCandidateName(name));
        const hasEmail = Boolean(email && email.includes('@') && !['adam', 'alex', 'unassigned'].includes(email.toLowerCase()));
        const hasPhone = Boolean(phone && extractCleanPhone(phone));
        return hasName || hasEmail || hasPhone;
      });
      newIncompleteRecords.length = 0;
      newIncompleteRecords.push(...legitimateIncomplete);
    }

    // 2. AUTO-VERIFY AND MERGE POSSIBLE DUPLICATE MATCHES
    if (newPossibleMatches.length > 0 && geminiService.hasApiKey()) {
      const matchPairs: PossibleMatch[] = newPossibleMatches.map(pm => {
        const cA = candidatePool.find(p => p.id === pm.candidate_a_id) || existingPeople.find(p => p.id === pm.candidate_a_id);
        const cB = candidatePool.find(p => p.id === pm.candidate_b_id) || newPeople.find(p => p.id === pm.candidate_b_id);
        return {
          ...pm,
          candidate_a: cA,
          candidate_b: cB,
        };
      }).filter(pm => Boolean(pm.candidate_a && pm.candidate_b));

      if (matchPairs.length > 0) {
        const verifications = await geminiService.verifyPossibleMatches(matchPairs);
        const autoMergedIds = new Set<string>();

        for (const v of verifications) {
          if (v.recommendedAction === 'AUTO_MERGE' && v.confidence >= 75) {
            const pm = matchPairs.find(m => m.id === v.matchId);
            if (!pm || !pm.candidate_a || !pm.candidate_b) continue;

            const cA = pm.candidate_a;
            const cB = pm.candidate_b;

            // Merge Candidate B into Candidate A
            if (cB.emails) {
              if (!cA.emails) cA.emails = [];
              cB.emails.forEach(e => {
                if (!cA.emails!.some(ae => ae.normalized_email === e.normalized_email)) {
                  cA.emails!.push({ ...e, person_id: cA.id, is_primary: false });
                }
              });
            }
            if (cB.phones) {
              if (!cA.phones) cA.phones = [];
              cB.phones.forEach(p => {
                if (!cA.phones!.some(ap => ap.phone_normalized === p.phone_normalized)) {
                  cA.phones!.push({ ...p, person_id: cA.id, is_primary: false });
                }
              });
            }
            if (cB.applications) {
              if (!cA.applications) cA.applications = [];
              cB.applications.forEach(a => {
                const normRole = (a.job_title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const exist = cA.applications!.find(ca => 
                  ca.company === a.company && (ca.job_title || '').toLowerCase().replace(/[^a-z0-9]/g, '') === normRole
                );
                if (exist) {
                  exist.resume_link = exist.resume_link || a.resume_link;
                  exist.date_applied = exist.date_applied || a.date_applied;
                  exist.application_collected_date = exist.application_collected_date || (a as any).application_collected_date;
                  exist.recruiter_assigned_date = exist.recruiter_assigned_date || (a as any).recruiter_assigned_date;
                  exist.green_card = exist.green_card || (a as any).green_card;
                  exist.h1b_status = exist.h1b_status || (a as any).h1b_status;
                  if (applicationsCreated > 0) applicationsCreated--;
                } else {
                  cA.applications!.push({ ...a, person_id: cA.id });
                }
              });
            }
            if (cB.assignments) {
              if (!cA.assignments) cA.assignments = [];
              cB.assignments.forEach(asgn => {
                const exist = cA.assignments!.some(
                  ca => ca.recruiter_name.toLowerCase() === asgn.recruiter_name.toLowerCase() && ca.assigned_date === asgn.assigned_date
                );
                if (!exist) {
                  cA.assignments!.push({ ...asgn, person_id: cA.id });
                }
              });
            }
            if (cB.recruiter_contacts) {
              if (!cA.recruiter_contacts) cA.recruiter_contacts = [];
              cB.recruiter_contacts.forEach(c => {
                const isDup = cA.recruiter_contacts!.some(
                  ac => ac.recruiter_name.toLowerCase() === c.recruiter_name.toLowerCase() &&
                        (ac.original_feedback === c.original_feedback || ac.notes === c.notes)
                );
                if (!isDup) {
                  cA.recruiter_contacts!.unshift({ ...c, person_id: cA.id });
                }
              });
            }
            if (cB.green_card && !cA.green_card) cA.green_card = cB.green_card;
            if (cB.h1b_status && !cA.h1b_status) cA.h1b_status = cB.h1b_status;
            if (cB.application_collected_date && !cA.application_collected_date) cA.application_collected_date = cB.application_collected_date;
            if (cB.recruiter_assigned_date && !cA.recruiter_assigned_date) cA.recruiter_assigned_date = cB.recruiter_assigned_date;
            if (cB.resume_url && !cA.resume_url) cA.resume_url = cB.resume_url;
            if (cB.linkedin_url && !cA.linkedin_url) cA.linkedin_url = cB.linkedin_url;
            if (cB.current_owner && cB.current_owner !== 'Unassigned' && (!cA.current_owner || cA.current_owner === 'Unassigned')) {
              cA.current_owner = cB.current_owner;
            }

            // Remove Candidate B from newPeople and pool
            const bIdx = newPeople.findIndex(p => p.id === cB.id);
            if (bIdx !== -1) {
              newPeople.splice(bIdx, 1);
              newPeopleCount--;
              matchedPeopleCount++;
            }
            const bPoolIdx = candidatePool.findIndex(p => p.id === cB.id);
            if (bPoolIdx !== -1) {
              candidatePool.splice(bPoolIdx, 1);
            }

            if (!updatedPeople.some(p => p.id === cA.id)) {
              updatedPeople.push(cA);
            }

            autoMergedIds.add(pm.id);
          }
        }

        if (autoMergedIds.size > 0) {
          const remainingMatches = newPossibleMatches.filter(m => !autoMergedIds.has(m.id));
          newPossibleMatches.length = 0;
          newPossibleMatches.push(...remainingMatches);
          possibleMatchesCount = newPossibleMatches.length;
        }
      }
    }
  } catch (aiErr) {
    console.warn('Gemini AI automatic background resolution skipped:', aiErr);
  }

  const importRecord: ImportRecord = {
    id: importId,
    file_name: file.name,
    file_size_bytes: file.size,
    file_type: file.name.split('.').pop()?.toLowerCase() === 'csv' ? 'csv' : 'xlsx',
    import_status: errorRows.length === rawRows.length ? 'failed' : 'completed',
    total_rows: rawRows.length,
    processed_rows: rawRows.length - errorRows.length,
    new_people: newPeopleCount,
    matched_people: matchedPeopleCount,
    possible_matches: possibleMatchesCount,
    applications_created: applicationsCreated,
    matched_applications: matchedApplicationsCount,
    unresolved_applications: unresolvedApplicationsCount,
    assignments_created: assignmentsCreated,
    contacts_created: contactsCreated,
    errors: errorRows.length,
    error_details: errorRows.slice(0, 50).map(e => ({
      row: e.row,
      field: 'row_processing',
      rejected_value: JSON.stringify(e.rawData),
      reason: e.reason,
    })),
    uploaded_by: 'Admin Recruiter',
    started_at: now,
    completed_at: new Date().toISOString(),
    created_at: now,
  };

  return {
    importRecord,
    newPeople,
    updatedPeople,
    newPossibleMatches,
    newIncompleteRecords,
    errorRows,
  };
}
