/**
 * Centralized Date & Time Utility for Recruitment & Digital Marketing Portal
 * Adheres strictly to Part 3 of the System Specification:
 * - Standard display format: DD-MMM-YYYY (e.g. 15-Oct-2026)
 * - Pure date-only handling with 0 timezone shift
 * - No silent substitution of today's date on missing values
 * - Safe handling of Excel serial numbers, ISO strings, slash formats
 * - Protection against 'Invalid Date', 'NaN', and unintended 1970 epoch dates
 */

export const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export const MONTH_LOOKUP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

/**
 * Checks if a date string represents an invalid or unintended epoch date (e.g. 1970-01-01)
 */
export function isEpochOrInvalidDate(val: any): boolean {
  if (!val) return true;
  const s = String(val).trim();
  if (!s || s === '0' || s === 'undefined' || s === 'null' || s === 'NaN') return true;
  if (
    /^1970[-/.]01[-/.]01/.test(s) ||
    /^01[-/.]01[-/.]1970/.test(s) ||
    /^1[-/.]1[-/.]1970/.test(s) ||
    /^01-Jan-1970/i.test(s) ||
    /^1969-12-31/.test(s) ||
    /^31[-/.]12[-/.]1969/.test(s)
  ) return true;
  return false;
}

/**
 * Pure date string parser returning standard 'YYYY-MM-DD' without timezone jitter.
 * Safely handles:
 * - YYYY-MM-DD
 * - DD-MMM-YYYY / DD-MMMM-YYYY
 * - MM/DD/YYYY or DD/MM/YYYY
 * - Excel 5-digit serial numbers (e.g. 45678)
 * - ISO timestamps (e.g. 2026-10-15T12:00:00.000Z)
 */
export function parseDateToYMD(val: any): string | null {
  if (val === undefined || val === null) return null;
  if (isEpochOrInvalidDate(val)) return null;

  // Handle Date object
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const s = String(val).trim();
  if (!s || s.length < 5) return null;

  // 1. Direct ISO YYYY-MM-DD
  const isoMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = String(Number(isoMatch[2])).padStart(2, '0');
    const d = String(Number(isoMatch[3])).padStart(2, '0');
    const mNum = Number(m);
    const dNum = Number(d);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${y}-${m}-${d}`;
    }
  }

  // 2. Day-MonthName-Year (e.g. 15-Oct-2026, 15-October-2026, 15/Oct/2026)
  const dmyMatch = s.match(/^(\d{1,2})[-/ ]([a-zA-Z]{3,12})[-/ ](\d{2,4})$/);
  if (dmyMatch) {
    const d = String(Number(dmyMatch[1])).padStart(2, '0');
    const monStr = dmyMatch[2].toLowerCase();
    let year = dmyMatch[3];
    if (year.length === 2) year = '20' + year;
    const monthIdx = MONTH_LOOKUP[monStr] ?? MONTH_LOOKUP[monStr.slice(0, 3)];
    if (monthIdx !== undefined) {
      const m = String(monthIdx + 1).padStart(2, '0');
      return `${year}-${m}-${d}`;
    }
  }

  // 3. MonthName-Day-Year (e.g. Oct-15-2026, October 15, 2026)
  const mdyMatch = s.match(/^([a-zA-Z]{3,12})[-/ ](\d{1,2})(?:[-/ ]|, )(\d{2,4})$/);
  if (mdyMatch) {
    const monStr = mdyMatch[1].toLowerCase();
    const d = String(Number(mdyMatch[2])).padStart(2, '0');
    let year = mdyMatch[3];
    if (year.length === 2) year = '20' + year;
    const monthIdx = MONTH_LOOKUP[monStr] ?? MONTH_LOOKUP[monStr.slice(0, 3)];
    if (monthIdx !== undefined) {
      const m = String(monthIdx + 1).padStart(2, '0');
      return `${year}-${m}-${d}`;
    }
  }

  // 4. Excel date serial number (e.g. 45678)
  if (/^\d{5}$/.test(s)) {
    const num = Number(s);
    if (num >= 35000 && num <= 65000) {
      // Excel epoch begins Dec 30, 1899
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const utcMs = excelEpoch.getTime() + num * 86400000;
      const d = new Date(utcMs);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  }

  // 5. Slash or Dash numeric format (MM/DD/YYYY or DD/MM/YYYY)
  const slashMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (slashMatch) {
    const p1 = Number(slashMatch[1]);
    const p2 = Number(slashMatch[2]);
    let year = slashMatch[3];
    if (year.length === 2) year = '20' + year;
    if (p1 > 12) {
      // Must be DD/MM/YYYY
      return `${year}-${String(p2).padStart(2, '0')}-${String(p1).padStart(2, '0')}`;
    }
    // Default standard MM/DD/YYYY
    return `${year}-${String(p1).padStart(2, '0')}-${String(p2).padStart(2, '0')}`;
  }

  // Fallback: Javascript Date parsing if valid 4-digit year present
  if (/\b(19|20)\d{2}\b/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      if (y >= 1980 && y <= 2050) {
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    }
  }

  return null;
}

/**
 * Standard Portal Date Formatter.
 * Formats any valid date, ISO string, or date-only string into standard 'DD-MMM-YYYY'.
 * Examples:
 * - '2026-10-15' -> '15-Oct-2026'
 * - '2026-10-15T00:00:00Z' -> '15-Oct-2026'
 * - '15-Oct-2026' -> '15-Oct-2026'
 * - null, undefined, '', '1970-01-01' -> fallback (default '—')
 */
export function formatDateDisplay(val: any, fallback = '—'): string {
  if (val === undefined || val === null || isEpochOrInvalidDate(val)) {
    return fallback;
  }

  // If already in DD-MMM-YYYY format:
  const str = String(val).trim();
  if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(str)) {
    return str;
  }

  // If already in D-MMM-YYYY format:
  const shortDmy = str.match(/^(\d{1})-([A-Za-z]{3})-(\d{4})$/);
  if (shortDmy) {
    return `0${shortDmy[1]}-${shortDmy[2]}-${shortDmy[3]}`;
  }

  // Parse pure date YYYY-MM-DD
  const ymd = parseDateToYMD(val);
  if (!ymd) return fallback;

  const parts = ymd.split('-');
  if (parts.length === 3) {
    const year = parts[0];
    const monthNum = parseInt(parts[1], 10);
    const day = parts[2].padStart(2, '0');
    if (monthNum >= 1 && monthNum <= 12) {
      const monthName = MONTH_NAMES_SHORT[monthNum - 1];
      return `${day}-${monthName}-${year}`;
    }
  }

  return fallback;
}

/**
 * Formats a timestamp with both date and time: 'DD-MMM-YYYY hh:mm A'
 * Example: '15-Oct-2026 02:30 PM'
 */
export function formatDateTimeDisplay(val: any, fallback = '—'): string {
  if (val === undefined || val === null || isEpochOrInvalidDate(val)) {
    return fallback;
  }

  const d = val instanceof Date ? val : new Date(val);
  if (isNaN(d.getTime())) {
    // If it cannot be parsed as a full timestamp, fall back to pure date
    return formatDateDisplay(val, fallback);
  }

  const datePart = formatDateDisplay(d, fallback);
  if (datePart === fallback) return fallback;

  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12
  const strHours = String(hours).padStart(2, '0');

  return `${datePart} ${strHours}:${minutes} ${ampm}`;
}

/**
 * Returns today's date in pure 'YYYY-MM-DD' anchored to authoritative recruitment timezone (America/New_York - EST/EDT)
 */
export function getTodayYMD(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

/**
 * Returns today's date in standard display 'DD-MMM-YYYY'
 */
export function getTodayDisplayDate(): string {
  return formatDateDisplay(getTodayYMD());
}
