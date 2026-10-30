// Historical Recruiting Data Import & Column Mapping Engine
// Parses XLSX / CSV, runs normalization & multi-identifier duplicate matching

import * as XLSX from 'xlsx';
import { TargetColumn, ColumnMappingConfig, ImportPreviewData } from '../types/import';
import { normalizeEmail, normalizePhone, normalizeLinkedInUrl, parseAndNormalizeName, isATSJobRoleTitle, isPhoneNumber, extractCandidateNameFromEmail, cleanJobTitle } from './normalization';
import { evaluateDuplicateMatch } from './matchingEngine';
import { detectGender } from './genderDetection';
import { Person, PersonEmail, PersonPhone, ImportRecord, PossibleMatch, CompanyName, IncompleteRecord, IncompleteReason } from '../types/database';
import { generateUuid } from './uuid';
import { geminiService } from './geminiService';

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

  // Month-day-year e.g. Jan-21-2025
  const mdyMatch = s.match(/^([a-zA-Z]{3,9})[-/ ](\d{1,2})[-/ ](\d{2,4})$/);
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

  // Fallback to JS Date ONLY if string contains date separators or month names and no percentage/note characters
  if (/[-\/.]|[a-zA-Z]{3}/.test(s) && !s.includes('%') && s.length <= 25) {
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
  'sap', 'oracle', 'sql', 'etl', 'data analyst', 'business analyst', 'data engineer',
  'software engineer', 'cyber security', 'scrum master', 'tester', 'c#', 'c++', 'golang'
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

  // 1. Standard formatted US/Intl phone
  const phonePattern = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/;
  const match = s.match(phonePattern);
  if (match) {
    const nonPhoneChars = s.replace(match[0], '').trim();
    if (nonPhoneChars.length <= 5) {
      return match[0].trim();
    }
  }

  // 2. Pure 10 to 12 digits (with standard phone punctuation)
  const cleanFormat = s.replace(/[-+().\s]/g, '');
  if (/^\d{10,12}$/.test(cleanFormat)) {
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

export function isScreeningNote(val: any): boolean {
  if (!val || typeof val !== 'string') return false;
  const s = val.trim();
  const lower = s.toLowerCase();

  // If text is a valid clean human name (letters only, <= 5 words), it is NOT a screening note!
  const words = s.split(/\s+/);
  if (words.length <= 5 && /^[A-Za-z\s.'-]+$/.test(s)) {
    const hasScreeningKeywords = words.some(w => CONVERSATIONAL_WORDS.has(w.toLowerCase()));
    if (!hasScreeningKeywords && !/^(female|male|someone|voice\s*mail|not\s*interested)/i.test(s)) {
      return false;
    }
  }

  if (s.length > 50) return true; // Sentences longer than 50 chars are notes
  if (/^(he is|she is|he was|she was|he'll|she'll|not a|not on|not interested|female|male|us citizen|citizen|opt|f1|h1b|green card|having|gc|age|assessment|birth year|years|exp|looking|expected|expecting|package|rate|salary|underage|call|called|interview|interested|rejected|joined|notice|open to|submitted|review|pending|no answer|voicemail|attended|discuss|discussed|meeting|remote|currently|already|working|unable|will|stem|valid|invalid|girl|boy|wants|waiting|declined|no resposne|no response)/i.test(lower)) return true;
  if (/(call\s*back|busy|employer|driving|remote|relocate|relocsate|staffing|sheduled|scheduled|connect|position|visa issue|vissa issue|masters|bachelors|opt ead|stem opt|f1 opt|option not available|no response)/i.test(lower)) return true;
  if (s.includes('$') || s.includes('/hr') || s.includes('per hour')) return true;
  if (s.includes('/') && /\d/.test(s)) return true;
  return false;
}

export function isHeaderOrLabelWord(val: any): boolean {
  if (!val || typeof val !== 'string') return false;
  const s = val.trim().toLowerCase().replace(/[_\W]+/g, ' ').trim();
  return /^(location|current location|candidate location|city|state|country|address|region|metro|preferred location|job role|job title|role|position|domain|recruiter|owner|assigned owner|feedback|feedback 1|feedback 2|notes|comments|remarks|candidate name|full name|name|status|date|date assigned|contact|phone|email|team|gender|experience|years of experience)$/i.test(s);
}

const STOP_WORDS = /^(mba|ms|bs|b\.?tech|m\.?tech|bca|mca|ph\.?d|pmp|safe|agilist|gc|opt|cpt|f1|h1b|us citizen|citizen|green card|\d+\+?\s*years?|\d+\s*yrs?|exp|looking|open|assessment)/i;

export function isValidCandidateName(name: string | null | undefined): boolean {
  if (!name || typeof name !== 'string') return false;
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 50) return false;
  if (/\d/.test(clean)) return false; // Names NEVER contain numbers (like '4 years', '2 Years')!
  if (isPhoneNumber(clean)) return false;
  if (isRoleOrTech(clean)) return false;
  if (isLocationOrCountry(clean)) return false; // Locations (United States, New Jersey, etc.) are NOT names!
  if (isHeaderOrLabelWord(clean)) return false; // Column headers are NOT names!
  if (isScreeningNote(clean)) return false; // Screening notes/remarks are NOT names!
  if (/^(female(\s+candidate)?|male(\s+candidate)?|candidate|voice\s*mail|voicemail|someone|someone\s+picked|call|middle\s+of\s+something|not\s+a\s+desi|desi|us\s+citizen|green\s+card|opt|f1|h1b|location|job\s*role|job\s*title|role|name)$/i.test(clean)) return false;

  const words = clean.toLowerCase().split(/\s+/);
  if (words.length > 5) return false; // Human names never exceed 5 words!
  if (words.some(w => CONVERSATIONAL_WORDS.has(w))) return false;
  if (words.some(w => ['years', 'year', 'exp', 'candidate', 'voicemail', 'visa', 'mail', 'dropped', 'droped', 'something', 'location', 'role', 'country', 'city', 'state'].includes(w))) return false;

  return /^[A-Za-z\s.'-]+$/.test(clean);
}

export function extractCandidateName(text: any): { name: string | null; remaining: string } {
  if (!text) return { name: null, remaining: '' };
  let s = String(text).trim();

  // If text starts with notes, pronouns, or screening phrases, it is NOT a candidate name
  if (/^(he is|she is|he was|she was|not a|female|male|candidate|us citizen|citizen|opt|f1|h1b|gc|green card|age|looking|open to|rate|salary|\$|\d+\s*years?|\d+\s*yrs?|voice\s*mail|someone)/i.test(s)) {
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
  recruiter_name: ['recruiter', 'recruiter name', 'sourcer', 'recruiter assigned', 'contacted by', 'interviewer', 'adam', 'alex'],
  recruiter_feedback: [
    'recruiter feedback',
    'feedback',
    'feedback 1',
    'feedback 2',
    'feedback 3',
    'feedback1',
    'feedback2',
    'notes',
    'recruiter notes',
    'comments',
    'recruiter comments',
    'recruiter comment',
    'call notes',
    'original feedback',
    'remarks',
    'touchpoint notes',
    'touchpoint',
    'status notes',
    'screening notes',
    'candidate notes',
    'review',
    'summary',
  ],
  contact_date: ['contact date', 'call date', 'activity date', 'outreach date', 'last contact'],
  contact_type: ['contact type', 'channel', 'mode', 'method', 'type'],
  resume_link: ['resume', 'resume link', 'resume url', 'cv', 'cv link', 'google drive link', 'resume document'],
  status: ['candidate status', 'operational status', 'talent status'],
  owner: ['current owner', 'owner', 'account manager', 'lead recruiter', 'assigned owner', 'assigned to', 'adam', 'alex', 'recruiter'],
  gender: ['gender', 'sex', 'salutation', 'title', 'mr/ms', 'prefix', 'gender identity'],
  ignore: [],
};

/**
 * Detects whether a column header represents recruiter feedback/notes dynamically,
 * returning its metadata (numeric index if numbered, preserved label, and flag).
 * Handles:
 * - Feedback 1, Feedback 2, Feedback 3, ..., Feedback 10, Feedback 50
 * - Feedback1, Feedback2, Feedback10
 * - Feedback (without number)
 * - Recruiter Feedback, Recruiter Feedback 1, Recruiter Feedback 2
 * - Recruiter Notes, Recruiter Note, Recruiter Notes 1
 * - Follow-up Notes, Follow up Notes, Followup Notes
 * - Comments, Remarks, Call Notes, Touchpoint Notes, Screening Notes
 */
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

  // Exclude non-feedback headers even if they contain common substring patterns
  if (/^(candidate\s*name|full\s*name|first\s*name|last\s*name|name|recruiter\s*name|email|contact|phone|role|job|company|date|status|location|city|state|zip)/i.test(clean)) {
    // Exception: "recruiter feedback", "recruiter notes", "recruiter comments", "recruiter remarks" ARE feedback
    if (!/^(recruiter\s*(feedback|notes?|comments?|remarks?))/i.test(clean)) {
      return { isFeedback: false, feedbackIndex: null, feedbackLabel: trimmed };
    }
  }

  // 1. Numbered Feedback: "Feedback 1", "Feedback 2", "Feedback10", "Feedback - 3", etc.
  const fbNumMatch = clean.match(/^(?:recruiter\s*)?feedback\s*(\d+)$/i);
  if (fbNumMatch) {
    const num = parseInt(fbNumMatch[1], 10);
    return {
      isFeedback: true,
      feedbackIndex: num,
      feedbackLabel: `Feedback ${num}`,
    };
  }

  // 2. Unnumbered Feedback: "Feedback", "Recruiter Feedback"
  if (/^(?:recruiter\s*)?feedback$/i.test(clean)) {
    return {
      isFeedback: true,
      feedbackIndex: null,
      feedbackLabel: trimmed || 'Feedback',
    };
  }

  // 3. Numbered Note/Comment/Remark: "Recruiter Note 1", "Notes 2", "Comment 3", "Follow-up Notes 2"
  const noteNumMatch = clean.match(/^(?:recruiter\s*notes?|follow[\s-]*up\s*notes?|followup\s*notes?|notes?|comments?|remarks?|call\s*notes?|touchpoint\s*notes?|screening\s*notes?)\s*(\d+)$/i);
  if (noteNumMatch) {
    const num = parseInt(noteNumMatch[1], 10);
    return {
      isFeedback: true,
      feedbackIndex: num,
      feedbackLabel: trimmed,
    };
  }

  // 4. Unnumbered Notes/Comments/Remarks
  if (/^(recruiter\s*notes?|follow[\s-]*up\s*notes?|followup\s*notes?|call\s*notes?|touchpoint\s*notes?|touchpoint|comments?|remarks?|screening\s*notes?|original\s*feedback)$/i.test(clean)) {
    return {
      isFeedback: true,
      feedbackIndex: null,
      feedbackLabel: trimmed,
    };
  }

  // 5. Generic feedback pattern as fallback (e.g. "Screening Round Feedback", "Client Feedback")
  if (/(feedback|notes?|remarks?|comments?|touchpoint)/i.test(clean) && !/(name|email|phone|date|role|title|location|city|owner|company)/i.test(clean)) {
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
 * Automatically maps raw headers from uploaded file to normalized target columns
 */
export function autoDetectMappings(headers: string[], sampleRows: Record<string, any>[] = []): ColumnMappingConfig[] {
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

    // 0. Dynamic Recruiter Feedback detection (handles Feedback 1..N, Follow-up Notes, Comments, etc.)
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
    } else if (cleanHeader === 'recruiter' || cleanHeader === 'assigned owner' || cleanHeader === 'owner') {
      bestTarget = 'owner';
      highestScore = 1.0;
    } else if (
      /(feedback|notes?|remarks?|comments?|touchpoint|screening)/i.test(cleanHeader) &&
      !/(name|email|phone|date|role|title|location|city)/i.test(cleanHeader)
    ) {
      bestTarget = 'recruiter_feedback';
      highestScore = 1.0;
      feedbackLabel = header.trim();
    } else if (cleanHeader === 'date' || cleanHeader === 'date assigned' || cleanHeader === 'date applied') {
      bestTarget = 'date_applied';
      highestScore = 1.0;
    } else if (cleanHeader === 'name' || cleanHeader === 'candidate name' || cleanHeader === 'candidate full name' || cleanHeader === 'full name') {
      bestTarget = 'full_name';
      highestScore = 1.0;
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

    // Extract sample values from first few rows
    const sampleValues: string[] = [];
    for (const row of (sampleRows || []).slice(0, 8)) {
      const val = row[header];
      if (val !== undefined && val !== null && String(val).trim()) {
        sampleValues.push(String(val).trim());
      }
    }

    // Secondary intelligence: infer from sample content ONLY if header was not already an exact match
    if (highestScore < 1.0 && sampleValues.length > 0) {
      if (sampleValues.some(v => isDateString(v))) {
        bestTarget = 'date_applied';
        highestScore = 0.98;
      } else if (sampleValues.some(v => v.includes('@') && v.includes('.'))) {
        bestTarget = 'email';
        highestScore = 0.98;
      } else if (sampleValues.some(v => v.toLowerCase().includes('linkedin.com/in'))) {
        bestTarget = 'linkedin_url';
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
          /(citizen|green card|opt|visa|underage|desi|experience|bachelors|masters|package|\$|per hour|\/hr|call back|not on|he is|she is|interview|assessment|looking|expecting)/i.test(
            v
          )
        )
      ) {
        if (bestTarget === 'ignore' || highestScore < 0.85) {
          bestTarget = 'recruiter_feedback';
          highestScore = 0.90;
          feedbackLabel = header.trim();
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
      feedbackIndex: bestTarget === 'recruiter_feedback' ? feedbackIndex : undefined,
      feedbackLabel: bestTarget === 'recruiter_feedback' ? (feedbackLabel || header.trim()) : undefined,
    };
  });
}

/**
 * Parse uploaded file (XLSX, XLS, CSV) into raw JSON rows and preview headers
 */
export async function parseFileForPreview(file: File, selectedSheet?: string): Promise<ImportPreviewData> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  
  const availableSheets = workbook.SheetNames || [];
  let targetSheetName = (selectedSheet && availableSheets.includes(selectedSheet))
    ? selectedSheet
    : (availableSheets[0] || 'Sheet1');

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

  // Convert to JSON
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
  
  if (rawRows.length === 0) {
    throw new Error(`Sheet "${targetSheetName}" is empty or does not contain data rows.`);
  }

  const headers = Object.keys(rawRows[0] || {});
  const sampleRows = rawRows.slice(0, 20);
  const mappings = autoDetectMappings(headers, sampleRows);

  const fileExt = file.name.split('.').pop()?.toLowerCase();
  const fileType: 'xlsx' | 'xls' | 'csv' = fileExt === 'csv' ? 'csv' : fileExt === 'xls' ? 'xls' : 'xlsx';

  return {
    fileName: file.name,
    fileType,
    fileSize: file.size,
    totalRows: rawRows.length,
    headers,
    sampleRows,
    mappings,
    availableSheets,
    selectedSheet: targetSheetName,
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
    if (isScreeningNote(s)) return null;
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
    } else if (/^(assigned\s*owner|assigned\s*recruiter|owner|recruiter|sourcer)$/i.test(raw)) {
      if (mapping['Assigned Owner'] === undefined) {
        mapping['Assigned Owner'] = i;
        score++;
      }
    } else if (/^(date\s*assigned|assigned\s*date|applied\s*date|date\s*applied|date)$/i.test(raw)) {
      if (mapping['Date Assigned'] === undefined) {
        mapping['Date Assigned'] = i;
        score++;
      }
    } else {
      const fbDetect = detectFeedbackHeader(cells[i]);
      if (fbDetect.isFeedback) {
        const label = fbDetect.feedbackLabel || cells[i].trim();
        if (mapping[label] === undefined) {
          mapping[label] = i;
          score++;
        }
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
      'Assigned Owner': 'Adam',
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
      const alreadyHasName = Boolean(isName && current['Candidate Full Name'] && (current['Email Address'] || current['Phone Number']));

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
  let owner = 'Adam';
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
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i++; // skip \n of \r\n
      }
      if (current.trim().length > 0) {
        lines.push(current);
      }
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) {
    lines.push(current);
  }
  return lines;
}

function unpackMultiCandidateRow(cells: string[]): string[][] {
  if (cells.length <= 8) return [cells];

  const chunks: string[][] = [];
  let currentChunk: string[] = [];

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i].trim();
    const isNewCandidateStart =
      i >= 4 &&
      (
        isDateString(cell) ||
        (isValidCandidateName(cell) && i + 1 < cells.length && (extractCleanPhone(cells[i + 1]) !== null || cells[i + 1].includes('@') || normalizeEmail(cells[i + 1]) !== null))
      );

    if (isNewCandidateStart && currentChunk.some(c => c.trim().length > 0)) {
      chunks.push(currentChunk);
      currentChunk = [cell];
    } else {
      currentChunk.push(cell);
    }
  }

  if (currentChunk.some(c => c.trim().length > 0)) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [cells];
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
    // Identify all detected feedback column headers dynamically
    const feedbackHeaderKeys = Object.keys(headerMapping).filter(k => detectFeedbackHeader(k).isFeedback);

    for (let rIdx = 1; rIdx < rawRows.length; rIdx++) {
      const r = rawRows[rIdx];
      if (!r || r.every(c => !c || !c.trim())) continue;

      const cand: Record<string, any> = {
        'Date Assigned': (headerMapping['Date Assigned'] !== undefined ? r[headerMapping['Date Assigned']] : '') || new Date().toISOString().slice(0, 10),
        'Candidate Full Name': headerMapping['Candidate Full Name'] !== undefined ? r[headerMapping['Candidate Full Name']] || '' : '',
        'Phone Number': headerMapping['Phone Number'] !== undefined ? r[headerMapping['Phone Number']] || '' : '',
        'Email Address': headerMapping['Email Address'] !== undefined ? r[headerMapping['Email Address']] || '' : '',
        'Location': headerMapping['Location'] !== undefined ? r[headerMapping['Location']] || '' : '',
        'Job Title': headerMapping['Job Title'] !== undefined ? r[headerMapping['Job Title']] || '' : '',
        'Assigned Owner': (headerMapping['Assigned Owner'] !== undefined ? r[headerMapping['Assigned Owner']] : '') || 'Adam',
      };

      // Populate every detected feedback column dynamically
      for (const fKey of feedbackHeaderKeys) {
        const colIdx = headerMapping[fKey];
        if (colIdx !== undefined) {
          cand[fKey] = r[colIdx] || '';
        }
      }
      if (feedbackHeaderKeys.length === 0) {
        cand['Recruiter Feedback'] = '';
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
        const targetFeedbackKey = feedbackHeaderKeys[0] || 'Recruiter Feedback';
        cand[targetFeedbackKey] = cand[targetFeedbackKey] ? `${cand[targetFeedbackKey]}\n${ownerNote}` : ownerNote;
        cand['Assigned Owner'] = 'Adam';
      }

      // Pre-clean name if empty from any feedback column
      if (!cand['Candidate Full Name']) {
        for (const fKey of feedbackHeaderKeys) {
          if (cand[fKey]) {
            const extracted = extractCandidateName(cand[fKey]);
            if (extracted.name) {
              cand['Candidate Full Name'] = extracted.name;
              cand[fKey] = extracted.remaining;
              break;
            }
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
      if (!cand['Email Address']) {
        for (const fKey of feedbackHeaderKeys) {
          if (cand[fKey]) {
            const mailMatch = String(cand[fKey]).match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (mailMatch) {
              cand['Email Address'] = mailMatch[1];
              break;
            }
          }
        }
      }

      // If Candidate Full Name is still missing, attempt extraction from Email Address
      if (!cand['Candidate Full Name'] && cand['Email Address']) {
        const nameFromEmail = extractCandidateNameFromEmail(cand['Email Address']);
        if (nameFromEmail) {
          cand['Candidate Full Name'] = nameFromEmail;
        }
      }

      const allFeedbackText = feedbackHeaderKeys.map(k => String(cand[k] || '')).filter(Boolean).join(' ');

      // Location Fallback: "in location if state or city nother then simply put united states"
      cand['Location'] = resolveCandidateLocation(
        cand['Location'],
        allFeedbackText,
        cand['Phone Number']
      );

      // Auto-detect candidate gender
      if (!cand['Gender'] || cand['Gender'] === 'Unspecified') {
        cand['Gender'] = detectGender(
          cand['Gender'],
          null,
          cand['Candidate Full Name'],
          allFeedbackText
        );
      }

      if (cand['Candidate Full Name'] || cand['Email Address'] || cand['Phone Number']) {
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
          if (!currentCandidate['Candidate Full Name'] && currentCandidate['Email Address']) {
            const nameFromEmail = extractCandidateNameFromEmail(currentCandidate['Email Address']);
            if (nameFromEmail) {
              currentCandidate['Candidate Full Name'] = nameFromEmail;
            }
          }
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

        if (currentCandidate['Candidate Full Name'] || currentCandidate['Email Address'] || currentCandidate['Phone Number']) {
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
        'Assigned Owner': 'Adam',
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
          if (!activeCand['Recruiter Feedback']) {
            activeCand['Recruiter Feedback'] = combinedNote;
          } else if (!activeCand['Feedback 2']) {
            activeCand['Feedback 2'] = combinedNote;
          } else {
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
        (hasName && currentCandidate['Candidate Full Name'] && (currentCandidate['Email Address'] || currentCandidate['Phone Number']))
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
  selectedSheet?: string
): Promise<ImportExecutionResult> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const sheetName = (selectedSheet && workbook.SheetNames.includes(selectedSheet))
    ? selectedSheet
    : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

  const mappingLookup: Record<string, TargetColumn> = {};
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
  let contactsCreated = 0;

  // Active pool of people (contains existing + newly created within this same import run)
  const candidatePool: Person[] = [...existingPeople];
  let lastValidAppDate = '';

  for (let idx = 0; idx < rawRows.length; idx++) {
    const row = rawRows[idx];
    const rowNumber = idx + 2; // Accounting for 1-indexed Excel header row

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
      let rawContactDate: string | undefined;
      let rawContactType: string | undefined;
      let rawResumeLink: string | undefined;
      let rawStatus: string | undefined;
      let rawOwner: string | undefined;
      let rawGender: string | undefined;

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

      let rawRecruiterFeedback = rowFeedbackItems.map(f => f.text).join('\n');

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
          case 'owner': rawOwner = sVal; break;
          case 'gender': rawGender = sVal; break;
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
        rawOwner = 'Adam';
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
      // Pre-clean 3b: If rawFullName is still missing, attempt extraction from email address
      if (!rawFullName && rawEmail) {
        const nameFromEmail = extractCandidateNameFromEmail(rawEmail);
        if (nameFromEmail) {
          rawFullName = nameFromEmail;
        }
      }
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

      // Determine Owner (Support Adam, Alex, or explicit owner)
      const determinedOwner = rawOwner || rawRecruiterName || 'Unassigned';

      // MANDATORY CRITERIA:
      // A candidate profile is complete if they have a valid candidate name AND at least one contact method (Email OR Phone)!
      const hasValidName = Boolean(fullName && fullName.trim().length > 0 && isValidCandidateName(fullName));
      const hasEmail = Boolean(emailNorm);
      const hasPhone = Boolean(phoneNorm);
      const isCompleteProfile = hasValidName && (hasEmail || hasPhone);

      if (!isCompleteProfile) {
        let reason: IncompleteReason = 'missing_both';
        let description = 'Missing candidate contact information';

        if (hasValidName && !hasEmail && !hasPhone) {
          reason = 'missing_both';
          description = 'Missing Contact Information (No Email or Phone provided)';
        } else if (!hasValidName && (hasEmail || hasPhone)) {
          reason = 'missing_name';
          description = 'Missing candidate full name';
        }

        // STRICT GUARD: Only stage as incomplete if there is a real candidate profile to rescue!
        // A row with NO valid name AND NO email AND NO phone is an orphan recruiter note, NOT a candidate!
        if (hasValidName || hasEmail || hasPhone) {
          newIncompleteRecords.push({
            id: generateUuid(),
            missing_reason: reason,
            missing_description: description,
            date_assigned: appDate,
            raw_name: hasValidName ? fullName : null,
            raw_email: emailNorm ? emailNorm.original : (rawEmail || null),
            raw_phone: phoneNorm ? phoneNorm.original : (rawPhone || null),
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
        const pComp = p.current_company || (p.applications && p.applications.find(a => a.company)?.company);
        return pComp === company;
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
              phone_original: phoneNorm.original,
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

        // Attach new application if job title provided
        let newApp: any = null;
        if (rawJobTitle) {
          applicationsCreated++;
          if (!targetPerson.applications) targetPerson.applications = [];
          newApp = {
            id: generateUuid(),
            person_id: targetPerson.id,
            company,
            job_id: rawJobId || null,
            job_title: rawJobTitle,
            date_applied: appDate,
            current_stage: rawCurrentStage || 'Applied',
            resume_link: rawResumeLink || null,
            source_file: file.name,
            source_row: rowNumber,
            source_import_id: importId,
            created_at: now,
            updated_at: now,
          };
          targetPerson.applications.unshift(newApp);
        }

        // Attach each populated feedback column as a separate, traceable RecruiterContact with idempotency
        if (rowFeedbackItems.length > 0) {
          if (!targetPerson.recruiter_contacts) targetPerson.recruiter_contacts = [];
          for (const fb of rowFeedbackItems) {
            const isDup = isDuplicateContact(targetPerson.recruiter_contacts, {
              text: fb.text,
              feedbackLabel: fb.feedbackLabel,
              columnIndex: fb.columnIndex,
              contactDate,
              sourceFile: file.name,
              sourceRow: rowNumber,
              recruiterName: determinedOwner !== 'Unassigned' ? determinedOwner : (rawRecruiterName || 'Adam'),
            });

            if (!isDup) {
              contactsCreated++;
              targetPerson.recruiter_contacts.unshift({
                id: generateUuid(),
                person_id: targetPerson.id,
                application_id: newApp ? newApp.id : null,
                recruiter_name: determinedOwner !== 'Unassigned' ? determinedOwner : (rawRecruiterName || 'Adam'),
                contact_date: contactDate,
                contact_type: rawContactType || 'Phone',
                original_feedback: fb.text, // 100% VERBATIM!
                feedback_label: fb.feedbackLabel,
                column_index: fb.columnIndex,
                import_id: importId,
                source: `Import ${importId} | ${fb.feedbackLabel}`,
                source_file: file.name,
                source_row: rowNumber,
                created_at: now,
              });
            }
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
          primary_phone: phoneNorm ? phoneNorm.normalized : null,
          secondary_phone: rawSecondaryPhone ? (normalizePhone(rawSecondaryPhone)?.normalized || rawSecondaryPhone) : null,
          location: resolveCandidateLocation(rawLocation, rawRecruiterFeedback, phoneNorm?.normalized || rawPhone),
          preferred_location: rawPreferredLocation || (/open to us|open to relocate/i.test(rawRecruiterFeedback || '') ? 'Open to US' : null),
          zip_code: null,
          headline: rawJobTitle || null,
          current_title: rawJobTitle || null,
          current_company: company,
          linkedin_url: linkedInNorm,
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
                phone_original: phoneNorm.original,
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
                  phone_original: secP.original,
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
          current_stage: rawCurrentStage || 'Applied',
          resume_link: rawResumeLink || null,
          source_file: file.name,
          source_row: rowNumber,
          source_import_id: importId,
          created_at: appDate ? `${appDate}T12:00:00.000Z` : now,
          updated_at: now,
        };
        createdPerson.applications!.push(newApp);

        if (rowFeedbackItems.length > 0) {
          for (const fb of rowFeedbackItems) {
            contactsCreated++;
            createdPerson.recruiter_contacts!.push({
              id: generateUuid(),
              person_id: newPersonUuid,
              application_id: newApp.id,
              recruiter_name: determinedOwner !== 'Unassigned' ? determinedOwner : (rawRecruiterName || 'Adam'),
              contact_date: contactDate,
              contact_type: rawContactType || 'Phone',
              original_feedback: fb.text, // VERBATIM
              feedback_label: fb.feedbackLabel,
              column_index: fb.columnIndex,
              import_id: importId,
              source: `Import ${importId} | ${fb.feedbackLabel}`,
              source_file: file.name,
              source_row: rowNumber,
              created_at: contactDate ? `${contactDate}T12:00:00.000Z` : now,
            });
          }
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
            current_owner: original.owner || 'Adam',
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
              phone_original: res.extractedPhone || rPhoneNorm.normalized,
              phone_normalized: rPhoneNorm.normalized,
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
              recruiter_name: original.owner || 'Adam',
              contact_date: original.date_assigned,
              contact_type: 'Phone',
              original_feedback: original.recruiter_feedback, // 100% VERBATIM!
              feedback_label: 'Recruiter Feedback',
              column_index: null,
              import_id: importId,
              source: `Import ${importId} (Gemini AI Auto-Rescue) | Recruiter Feedback`,
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
                cA.applications!.push({ ...a, person_id: cA.id });
              });
            }
            if (cB.recruiter_contacts) {
              if (!cA.recruiter_contacts) cA.recruiter_contacts = [];
              cB.recruiter_contacts.forEach(c => {
                cA.recruiter_contacts!.unshift({ ...c, person_id: cA.id });
              });
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
