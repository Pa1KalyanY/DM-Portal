/**
 * Robust Tabular Data Parser (TSV & CSV) for LinkedIn Recruiter & Spreadsheets.
 * 
 * Handles:
 * 1. RFC 4180 standard quotes enclosing multiline cells (e.g. headlines with linebreaks, multiline screening Q&A).
 * 2. Unquoted multiline splits from direct browser copy/paste:
 *    - Screening question continuations (": No, Are you legally authorized...")
 *    - Mid-row headline / summary splits (headline continuation + shifted columns)
 * 3. Both Tab-delimited (Excel/Sheets clipboard copy) and Comma-delimited (CSV) data.
 */

import * as XLSX from 'xlsx';
import { detectHeaderMapping, extractRowValues, CANONICAL_COLUMNS } from './columnMapper.js';

export interface ParseTabularResult {
  rows: Record<string, any>[];
  delimiter: string;
  repairedRowCount: number;
}

export interface PastedRowPreview {
  rowIndex: number;
  fullName: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  gender?: string;
  location?: string;
  jobId: string;
  jobTitle: string;
  greenCardAnswer: string;
  sponsorshipAnswer: string;
  usWorkAuthAnswer?: string;
  profileUrl?: string;
  dateApplied?: string;
  rawQuestions?: string;
  isValid: boolean;
  errors: string[];
  rawRow: Record<string, string>;
}

export interface PastedDataAnalysis {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  hasHeaders: boolean;
  headers: string[];
  mappedFields: Record<string, string>;
  missingRequiredFields: string[];
  rows: PastedRowPreview[];
}

/**
 * Main parser entry point: Parses tabular text from clipboard or raw CSV/TSV,
 * repairing any multiline row breaks and aligning scrambled columns.
 */
export function parseTabularText(rawText: string): Record<string, any>[] {
  const text = (rawText || '').trim();
  if (!text) return [];

  // Step 1: Attempt to parse using SheetJS XLSX.read
  // SheetJS handles quoted cells, multiline cells, and delimiter detection natively.
  let rawRows: Record<string, any>[] = [];
  try {
    const wb = XLSX.read(text, { type: 'string', raw: true });
    if (wb.SheetNames && wb.SheetNames.length > 0) {
      const sheet = wb.Sheets[wb.SheetNames[0]];
      rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    }
  } catch (err) {
    console.warn('[parseTabularText] SheetJS parse failed, falling back to RFC-4180 parser:', err);
  }

  // Step 2: Fallback to custom RFC-4180 parser if SheetJS failed or returned 0 rows
  if (!rawRows || rawRows.length === 0) {
    rawRows = parseRfc4180(text);
  }

  // Step 3: Run intelligent row repairing on the parsed rows to heal any unquoted multiline splits
  return repairSplitRows(rawRows);
}

/**
 * Standard RFC-4180 compliant CSV / TSV parser that tracks quotes properly.
 */
export function parseRfc4180(text: string): Record<string, any>[] {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount >= commaCount ? '\t' : ',';

  const rawGrid: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped double quote ("") inside quoted string
        currentCell += '"';
        i++;
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      currentCell = '';
      if (currentRow.some((c) => c.length > 0)) {
        rawGrid.push(currentRow);
      }
      currentRow = [];
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      rawGrid.push(currentRow);
    }
  }

  if (rawGrid.length < 2) return [];

  const headers = rawGrid[0].map((h) => h.replace(/^["']|["']$/g, '').trim());
  const jsonRows: Record<string, any>[] = [];

  for (let i = 1; i < rawGrid.length; i++) {
    const r = rawGrid[i];
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx] : '';
    });
    jsonRows.push(obj);
  }

  return jsonRows;
}

/**
 * Intelligent row repair algorithm:
 * Identifies orphaned / fragmented rows caused by unquoted line breaks in:
 * 1. "Screening Questions" (e.g. Row begins with ": No, Are you legally authorized...")
 * 2. "Headline" / "Summary" (e.g. Row cuts off at Headline, and next row starts with headline continuation + shifted columns)
 * Stitches them back to their rightful applicant row with 100% column alignment.
 */
export function repairSplitRows(rows: Record<string, any>[]): Record<string, any>[] {
  if (!rows || rows.length === 0) return [];

  const cleaned: Record<string, any>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = { ...rows[i] };
    const prevRow = cleaned[cleaned.length - 1];

    // Check 0: Duplicated header row (e.g. from pasting multiple batches or pages together)
    if (isHeaderRow(row)) {
      continue;
    }

    // Check 1: Screening Question continuation
    if (isScreeningQuestionContinuation(row)) {
      if (prevRow) {
        const continuationText = String(row['First Name'] || Object.values(row)[0] || '').trim();
        const sqKey =
          prevRow['Screening Questions'] !== undefined
            ? 'Screening Questions'
            : prevRow['Currency Code'] !== undefined
            ? 'Currency Code'
            : 'Screening Questions';
        const existingSQ = prevRow[sqKey] || '';
        prevRow[sqKey] = existingSQ ? `${existingSQ} ${continuationText}` : continuationText;
      }
      continue;
    }

    // Check 2: Mid-row split (e.g. newline inside Headline)
    if (prevRow && isMidRowHeadlineContinuation(row, prevRow)) {
      mergeShiftedHeadlineRow(prevRow, row);
      continue;
    }

    // Check 3: Completely empty row
    const nonBlankCount = Object.values(row).filter((v) => String(v || '').trim().length > 0).length;
    if (nonBlankCount === 0) {
      continue;
    }

    cleaned.push(row);
  }

  return cleaned;
}

/**
 * Checks if a row is a duplicated header row.
 */
function isHeaderRow(row: Record<string, any>): boolean {
  const fn = String(row['First Name'] || Object.values(row)[0] || '').trim().toLowerCase();
  const ln = String(row['Last Name'] || Object.values(row)[1] || '').trim().toLowerCase();
  const em = String(row['Email Address'] || Object.values(row)[2] || '').trim().toLowerCase();

  return (
    (fn === 'first name' && (ln === 'last name' || em === 'email address' || em === 'email')) ||
    (fn === 'name' && (ln === 'email' || em === 'email')) ||
    (fn === 'full name' && (ln === 'email' || em === 'email'))
  );
}

/**
 * Checks if a row is a continuation fragment of a multiline screening question.
 */
function isScreeningQuestionContinuation(row: Record<string, any>): boolean {
  const keysWithVals = Object.keys(row).filter((k) => String(row[k] || '').trim().length > 0);
  const fn = String(row['First Name'] || Object.values(row)[0] || '').trim();

  // If at most 2 columns populated and the text starts with ":" or typical screening phrases
  if (keysWithVals.length <= 2) {
    if (
      fn.startsWith(':') ||
      /^\s*(yes|no)\b/i.test(fn) ||
      /are you legally authorized/i.test(fn) ||
      /powershell/i.test(fn) ||
      /require sponsorship/i.test(fn) ||
      /sponsorship for employment/i.test(fn) ||
      /green card/i.test(fn) ||
      /how many years/i.test(fn) ||
      /work authorization/i.test(fn) ||
      /please submit a resume/i.test(fn) ||
      /mobile phone number/i.test(fn) ||
      /email address/i.test(fn)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if prevRow was truncated mid-row at Headline, and row contains the rest of the fields.
 */
function isMidRowHeadlineContinuation(row: Record<string, any>, prevRow: Record<string, any>): boolean {
  const email = String(row['Email Address'] || '').trim();
  const prevHeadline = String(prevRow?.['Headline'] || '').trim();
  const prevTitle = String(prevRow?.['Current Title'] || '').trim();

  // If previous row has a Headline but no Current Title,
  // and the current row's "Email Address" does not contain "@" (looks like a company name e.g. "Procter & Gamble", "Bank of America")
  if (!prevTitle && prevHeadline && email && !email.includes('@')) {
    return true;
  }
  return false;
}

/**
 * Merges a shifted row where a newline split the row at Headline.
 * In the shifted row:
 * - First Name is Headline continuation
 * - Last Name is Current Title
 * - Email Address is Current Company
 * - Phone Number is Start Date
 * - General Location is Education Degree
 * - ZIP Code is Education Institution
 * - Headline is Profile URL
 * - Current Title is Date Applied
 * - Current Company is Current Stage
 * - Current Position Start Date is Job ID
 * - Education Degree is Job Title
 * - Education Institution is Job URL
 * - Profile URL is ATS Job ID
 * - Date Applied is Min Salary
 * - Current Stage is Max Salary
 * - Job ID is Currency Code
 * - Job Title is Compensation Period
 * - Job URL is Hiring Project ID
 * - ATS Job ID is Hiring Project Title
 * - Minimum Salary is Contract ID
 * - Maximum Salary is Contract Name
 * - Currency Code is Screening Questions
 */
function mergeShiftedHeadlineRow(prevRow: Record<string, any>, row: Record<string, any>): void {
  prevRow['Headline'] = `${prevRow['Headline']} | ${row['First Name']}`.trim();
  prevRow['Current Title'] = row['Last Name'] || '';
  prevRow['Current Company'] = row['Email Address'] || '';
  prevRow['Current Position Start Date'] = row['Phone Number'] || '';
  prevRow['Education Degree'] = row['General Location'] || '';
  prevRow['Education Institution'] = row['ZIP Code'] || '';
  prevRow['Profile URL'] = row['Headline'] || '';
  prevRow['Date Applied'] = row['Current Title'] || '';
  prevRow['Current Stage'] = row['Current Company'] || '';
  prevRow['Job ID'] = row['Current Position Start Date'] || '';
  prevRow['Job Title'] = row['Education Degree'] || '';
  prevRow['Job URL'] = row['Education Institution'] || '';
  prevRow['ATS Job ID'] = row['Profile URL'] || '';
  prevRow['Minimum Salary'] = row['Date Applied'] || '';
  prevRow['Maximum Salary'] = row['Current Stage'] || '';
  prevRow['Currency Code'] = row['Job ID'] || '';
  prevRow['Compensation Period'] = row['Job Title'] || '';
  prevRow['Hiring Project ID'] = row['Job URL'] || '';
  prevRow['Hiring Project Title'] = row['ATS Job ID'] || '';
  prevRow['Contract ID'] = row['Minimum Salary'] || '';
  prevRow['Contract Name'] = row['Maximum Salary'] || '';
  prevRow['Screening Questions'] = row['Currency Code'] || '';
}

/**
 * Parses raw tabular text (TSV or CSV) into a 2D string grid: string[][]
 */
export function parseRawGrid(text: string): string[][] {
  const cleanText = (text || '').trim();
  if (!cleanText) return [];

  const firstLine = cleanText.split(/\r?\n/)[0] || '';
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = tabCount >= commaCount ? '\t' : ',';

  const grid: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      currentCell = '';
      if (currentRow.some((c) => c.length > 0)) {
        grid.push(currentRow);
      }
      currentRow = [];
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some((c) => c.length > 0)) {
      grid.push(currentRow);
    }
  }

  return grid;
}

/**
 * Intelligent parser & validator for pasted application lists (with or without headers)
 */
export function analyzePastedApplications(
  text: string,
  defaultJob?: { jobId?: string; jobTitle?: string }
): PastedDataAnalysis {
  const grid = parseRawGrid(text);
  if (grid.length === 0) {
    return {
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      hasHeaders: false,
      headers: [],
      mappedFields: {},
      missingRequiredFields: ['Candidate Data'],
      rows: [],
    };
  }

  const row0 = grid[0];
  const hasEmailInRow0 = row0.some((c) => c.includes('@') && c.includes('.'));
  const hasUrlInRow0 = row0.some((c) => /^https?:\/\//i.test(c) || /linkedin\.com/i.test(c));

  const knownHeaderTerms = [
    'name', 'full name', 'first name', 'last name', 'candidate', 'applicant',
    'email', 'phone', 'contact', 'mobile',
    'job', 'title', 'role', 'position', 'req',
    'green card', 'us-c', 'citizen', 'citizenship', 'sponsorship', 'h1b', 'visa',
    'location', 'headline', 'status', 'stage', 'date'
  ];
  const headerMatchCount = row0.filter((c) => {
    const cl = c.toLowerCase().trim();
    return knownHeaderTerms.some((term) => cl === term || cl.includes(term));
  }).length;

  const hasHeaders = !hasEmailInRow0 && !hasUrlInRow0 && (headerMatchCount >= 2 || (row0.length <= 4 && headerMatchCount >= 1));

  let headers: string[] = [];
  let dataRows: string[][] = [];

  if (hasHeaders) {
    headers = row0.map((h, i) => h.trim() || `Column ${i + 1}`);
    dataRows = grid.slice(1);
  } else {
    dataRows = grid;
    // Check if exactly 8 columns (matching standard layout variations)
    if (row0.length === 8) {
      // Check if Verification & Matching format (Candidate Name, Role, Email, Phone, Gender, Status, Match Score, Reference):
      // In this format: Column 2 contains '@' (email), Column 4 has gender ('MALE'|'FEMALE'|'UNSPECIFIED'), or Column 5 has status ('PASS'|'FAIL'|'MANUAL_REVIEW')
      const isVerificationFormat = dataRows.some(r => {
        const c2 = (r[2] || '').trim();
        const c4 = (r[4] || '').trim().toUpperCase();
        const c5 = (r[5] || '').trim().toUpperCase();
        const c6 = (r[6] || '').trim();
        return (c2.includes('@') && (c4 === 'MALE' || c4 === 'FEMALE' || c4 === 'UNSPECIFIED' || c5 === 'PASS' || c5 === 'FAIL' || c5.includes('MANUAL') || c6.includes('%')));
      });

      if (isVerificationFormat) {
        headers = [
          'Candidate Name',
          'Job Role',
          'Email Address',
          'Phone Number',
          'Gender',
          'Screening Questions',
          'Match Score',
          'Matched Reference',
        ];
      } else {
        const isDateFirst = dataRows.some(r => {
          const c0 = (r[0] || '').trim();
          const c3 = (r[3] || '').trim();
          return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(c0) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(c0) || c3.includes('@');
        });

        if (isDateFirst) {
          headers = [
            'Date Applied',
            'Candidate Name',
            'Contact Number',
            'Email Address',
            'Job Role',
            'Green Card / US-C',
            'H1B (Y/N)',
            'LinkedIn URL',
          ];
        } else {
          // If column 0 is a name and column 2 is an email
          const col0HasName = dataRows.some(r => /^[a-zA-Z\s\.\,\'\-]+$/.test((r[0] || '').trim()));
          const col2HasEmail = dataRows.some(r => (r[2] || '').includes('@'));

          if (col0HasName && col2HasEmail) {
            headers = [
              'Candidate Name',
              'Job Role',
              'Email Address',
              'Phone Number',
              'Gender',
              'Screening Questions',
              'Match Score',
              'Matched Reference',
            ];
          } else {
            headers = [
              'Date Applied',
              'Candidate Name',
              'Contact Number',
              'Email Address',
              'Job Role',
              'Green Card / US-C',
              'H1B (Y/N)',
              'LinkedIn URL',
            ];
          }
        }
      }
    } else {
      // Inferred columns based on row contents
      const inferredHeaders: string[] = [];
      for (let colIdx = 0; colIdx < row0.length; colIdx++) {
        const colVals = dataRows.map((r) => r[colIdx] || '').filter(Boolean);
        if (colVals.some((v) => v.includes('@') && v.includes('.'))) {
          inferredHeaders.push('Email Address');
        } else if (colVals.some((v) => /^https?:\/\//i.test(v) || /linkedin\.com/i.test(v))) {
          inferredHeaders.push('Profile URL');
        } else if (colVals.some((v) => /^\+?[\d\s\-\(\)]{7,15}$/.test(v) && (v.match(/\d/g) || []).length >= 7)) {
          inferredHeaders.push('Phone Number');
        } else if (colVals.some((v) => /^(yes|no)$/i.test(v.trim()))) {
          if (!inferredHeaders.includes('Green Card / US Citizen')) {
            inferredHeaders.push('Green Card / US Citizen');
          } else {
            inferredHeaders.push('Visa Sponsorship');
          }
        } else if (colVals.some((v) => /^(male|female|unspecified)$/i.test(v.trim()))) {
          inferredHeaders.push('Gender');
        } else if (colIdx === 0 && colVals.some((v) => /^[a-zA-Z\s\.\,\'\-]+$/.test(v))) {
          inferredHeaders.push('Full Name');
        } else {
          inferredHeaders.push(`Column ${colIdx + 1}`);
        }
      }
      headers = inferredHeaders;
    }
  }

  const mapping = detectHeaderMapping(headers);

  const missingRequiredFields: string[] = [];
  if (!mapping['fullName'] && !mapping['firstName']) {
    missingRequiredFields.push('Candidate Name');
  }
  if (!mapping['email'] && !mapping['phone']) {
    missingRequiredFields.push('Contact Information (Email or Phone)');
  }

  const parsedRows: PastedRowPreview[] = [];
  let validRows = 0;
  let invalidRows = 0;

  dataRows.forEach((r, idx) => {
    // Skip completely blank lines
    if (!r.some((c) => c.trim().length > 0)) return;

    const rawObj: Record<string, string> = {};
    headers.forEach((h, colI) => {
      rawObj[h] = r[colI] || '';
    });

    const { normalized } = extractRowValues(rawObj, mapping);

    const name = normalized['fullName'] || (normalized['firstName'] ? `${normalized['firstName']} ${normalized['lastName'] || ''}`.trim() : '');
    const email = normalized['email'] || '';
    const phone = normalized['phone'] || '';
    // Priority: If the recruiter explicitly selected a relevant job slot (defaultJob), assign all applicants to that slot!
    const jobId = (defaultJob?.jobId && defaultJob.jobId !== 'ALL') ? defaultJob.jobId : (normalized['jobId'] || 'PASTE-JOB');
    const jobTitle = (defaultJob?.jobId && defaultJob.jobId !== 'ALL' && defaultJob?.jobTitle) ? defaultJob.jobTitle : (normalized['jobTitle'] || defaultJob?.jobTitle || 'General Requisition');
    const gc = normalized['greenCardCitizenAnswer'] || '';
    const sponsor = normalized['sponsorshipAnswer'] || '';
    const auth = normalized['usWorkAuthAnswer'] || '';
    const rawQuestions = normalized['rawScreeningQuestions'] || '';

    const errors: string[] = [];
    if (!name || name === 'Unnamed Applicant') {
      errors.push('Missing Candidate Name');
    }
    if (!email && !phone) {
      errors.push('Missing Contact Info (Email or Phone)');
    }

    const isValid = errors.length === 0;
    if (isValid) validRows++;
    else invalidRows++;

    parsedRows.push({
      rowIndex: idx + 1,
      fullName: name,
      firstName: normalized['firstName'],
      lastName: normalized['lastName'],
      email,
      phone,
      gender: normalized['gender'],
      location: normalized['location'],
      jobId,
      jobTitle,
      greenCardAnswer: gc,
      sponsorshipAnswer: sponsor,
      usWorkAuthAnswer: auth,
      profileUrl: normalized['profileUrl'],
      dateApplied: normalized['dateApplied'],
      rawQuestions,
      isValid,
      errors,
      rawRow: rawObj,
    });
  });

  return {
    totalRows: parsedRows.length,
    validRows,
    invalidRows,
    hasHeaders,
    headers,
    mappedFields: mapping,
    missingRequiredFields,
    rows: parsedRows,
  };
}
