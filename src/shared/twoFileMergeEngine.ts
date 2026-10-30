/**
 * Bidirectional Two-File Merge Engine
 * Specification Reference: PART 2, PART 3, PART 4, PART 5, PART 6
 * 
 * Supports:
 * - Order A: File 1 (Candidate Collection) -> File 2 (Recruiter Assignment & Feedback)
 * - Order B: File 2 (Recruiter Assignment & Feedback) -> File 1 (Candidate Collection)
 * 
 * Guarantees:
 * - Exactly ONE candidate record with a single stable Candidate ID (P-XXXXXX)
 * - Zero lost data, zero duplicated profiles
 * - Blank incoming values NEVER overwrite existing valid fields
 * - Strict URL classification: linkedin.com -> LinkedIn, drive.google.com -> Resume
 * - Distinct dates: application_collected_date vs recruiter_assigned_date
 * - Complete separation of Recruiter Assignments vs Contact Attempts
 */

import { Person, Application, RecruiterContact, RecruiterAssignment, CompanyName } from '../types/masterDatabase';
import { classifyMultipleUrls, mergeUrls, extractUrlsFromText } from './urlClassifier';
import { normalizeEmail, normalizePhone, formatPureDigitsPhone, parseAndNormalizeName, cleanJobTitle } from './normalization';
import { generateUuid } from './uuid';

export type SourceFileType = 'file1_collection' | 'file2_recruiter' | 'generic';

export interface FileDetectionResult {
  type: SourceFileType;
  confidence: number;
  detectedHeaders: {
    nameCol?: string;
    emailCol?: string;
    phoneCol?: string;
    dateCol?: string;
    recruiterCol?: string;
    feedbackCol?: string;
    feedback2Col?: string;
    urlCol?: string;
    jobCol?: string;
  };
}

/**
 * Detects whether an uploaded workbook/sheet corresponds to File 1 or File 2
 */
export function detectSourceFileType(headers: string[]): FileDetectionResult {
  const normHeaders = headers.map(h => String(h || '').trim().toLowerCase());
  
  let file1Score = 0;
  let file2Score = 0;

  const result: FileDetectionResult = {
    type: 'generic',
    confidence: 0,
    detectedHeaders: {},
  };

  headers.forEach((h, idx) => {
    const raw = String(h || '').trim();
    const l = raw.toLowerCase();

    // Name
    if (/candidate|full\s*name|^name$/i.test(l)) {
      result.detectedHeaders.nameCol = raw;
    }
    // Email
    if (/email|e-mail|mail\s*id/i.test(l)) {
      result.detectedHeaders.emailCol = raw;
    }
    // Phone
    if (/phone|contact|mobile|cell|tel/i.test(l)) {
      result.detectedHeaders.phoneCol = raw;
    }
    // Job
    if (/role|job|title|position|req/i.test(l)) {
      result.detectedHeaders.jobCol = raw;
    }
    // Recruiter / Owner
    if (/recruiter|owner|assigned\s*to|assigned\s*owner|sourcer/i.test(l)) {
      file2Score += 3;
      result.detectedHeaders.recruiterCol = raw;
    }
    // Feedback / Notes / Call status
    if (/feedback|call\s*status|outcome|remarks|touchpoint|fb/i.test(l)) {
      file2Score += 3;
      if (!result.detectedHeaders.feedbackCol) {
        result.detectedHeaders.feedbackCol = raw;
      } else if (!result.detectedHeaders.feedback2Col) {
        result.detectedHeaders.feedback2Col = raw;
      }
    }
    // Collection date (File 1) vs Assigned Date (File 2)
    if (/date\s*assigned|assigned\s*date/i.test(l)) {
      file2Score += 4;
      result.detectedHeaders.dateCol = raw;
    } else if (/apply\s*date|date\s*applied|collection\s*date|intake\s*date/i.test(l)) {
      file1Score += 4;
      result.detectedHeaders.dateCol = raw;
    } else if (/date/i.test(l)) {
      result.detectedHeaders.dateCol = raw;
    }
    // Screening / Visa (File 1)
    if (/green\s*card|us-c|sponsorship|h1b|work\s*auth/i.test(l)) {
      file1Score += 2;
    }
    // URLs
    if (/linkedin|resume|link|url/i.test(l)) {
      result.detectedHeaders.urlCol = raw;
      if (/linkedin/i.test(l)) file1Score += 1;
    }
  });

  if (file2Score >= 3 && file2Score > file1Score) {
    result.type = 'file2_recruiter';
    result.confidence = Math.min(100, file2Score * 15);
  } else if (file1Score >= 2) {
    result.type = 'file1_collection';
    result.confidence = Math.min(100, file1Score * 20);
  } else {
    result.type = 'generic';
    result.confidence = 50;
  }

  return result;
}

export interface MergeProvenance {
  sourceFile: string;
  sourceRow?: number;
  importType: SourceFileType;
  importTimestamp?: string;
}

export interface IncomingCandidateRecord {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  secondary_email?: string | null;
  phone?: string | null;
  secondary_phone?: string | null;
  location?: string | null;
  company?: string | null;
  job_title?: string | null;
  job_id?: string | null;
  linkedin_url?: string | null;
  resume_url?: string | null;
  raw_urls?: string[];
  application_collected_date?: string | null;
  recruiter_assigned_date?: string | null;
  assigned_recruiter?: string | null;
  call_status?: string | null;
  feedback_1?: string | null;
  feedback_2?: string | null;
  notes?: string | null;
  status?: string | null;
  gender?: string | null;
}

/**
 * Merges incoming candidate data into an existing Person profile non-destructively.
 * Works symmetrically for both File 1 -> File 2 and File 2 -> File 1.
 */
export function mergeCandidateNonDestructive(
  existing: Person,
  incoming: IncomingCandidateRecord,
  provenance: MergeProvenance
): { merged: Person; wasEnriched: boolean } {
  const now = provenance.importTimestamp || new Date().toISOString();
  let wasEnriched = false;

  const merged: Person = {
    ...existing,
    emails: [...(existing.emails || [])],
    phones: [...(existing.phones || [])],
    applications: [...(existing.applications || [])],
    recruiter_contacts: [...(existing.recruiter_contacts || [])],
    assignments: [...(existing.assignments || [])],
  };

  // 1. Name: If existing is a phone number or placeholder, update with valid incoming name
  if (incoming.full_name && incoming.full_name.trim()) {
    const trimmed = incoming.full_name.trim();
    if (!merged.full_name || merged.full_name === 'Candidate' || /^\+?\d{7,}$/.test(merged.full_name.replace(/\D/g, ''))) {
      const { fullName, firstName, lastName } = parseAndNormalizeName(trimmed);
      merged.full_name = fullName;
      merged.first_name = firstName;
      merged.last_name = lastName;
      wasEnriched = true;
    }
  }

  // 2. Email: Add to emails collection non-destructively
  if (incoming.email && incoming.email.includes('@')) {
    const norm = normalizeEmail(incoming.email);
    if (norm) {
      const exists = merged.emails!.some(e => e.normalized_email === norm.normalized);
      if (!exists) {
        merged.emails!.push({
          id: generateUuid(),
          person_id: merged.id,
          email: norm.original,
          normalized_email: norm.normalized,
          is_primary: !merged.primary_email,
          source: provenance.sourceFile,
          first_seen_at: now,
          last_seen_at: now,
          created_at: now,
        });
        if (!merged.primary_email) {
          merged.primary_email = norm.original;
        } else if (!merged.secondary_email && merged.primary_email.toLowerCase() !== norm.normalized) {
          merged.secondary_email = norm.original;
        }
        wasEnriched = true;
      }
    }
  }

  // 3. Phone: Add to phones collection non-destructively
  if (incoming.phone && incoming.phone.trim()) {
    const norm = normalizePhone(incoming.phone) || (incoming.phone.replace(/\D/g, '').length >= 7 ? {
      original: incoming.phone.trim(),
      normalized: formatPureDigitsPhone(incoming.phone) || incoming.phone.replace(/\D/g, ''),
      isValid: true,
    } : null);

    if (norm) {
      const exists = merged.phones!.some(p => p.phone_normalized === norm.normalized);
      if (!exists) {
        merged.phones!.push({
          id: generateUuid(),
          person_id: merged.id,
          phone_original: norm.original,
          phone_normalized: norm.normalized,
          is_primary: !merged.primary_phone,
          source: provenance.sourceFile,
          first_seen_at: now,
          last_seen_at: now,
          created_at: now,
        });
        if (!merged.primary_phone) {
          merged.primary_phone = norm.original;
        } else if (!merged.secondary_phone && merged.primary_phone.replace(/\D/g, '') !== norm.normalized) {
          merged.secondary_phone = norm.original;
        }
        wasEnriched = true;
      }
    }
  }

  // 4. URLs: Strict Classification & Non-Destructive Merging
  const allIncomingUrlStrings = [
    incoming.linkedin_url,
    incoming.resume_url,
    ...(incoming.raw_urls || []),
    // Extract any URLs embedded in feedback 1 or feedback 2
    ...extractUrlsFromText(incoming.feedback_1),
    ...extractUrlsFromText(incoming.feedback_2),
    ...extractUrlsFromText(incoming.notes),
  ].filter(Boolean) as string[];

  const classifiedIncoming = classifyMultipleUrls(allIncomingUrlStrings);

  const existingUnclassified = Array.isArray(merged.unclassified_links)
    ? merged.unclassified_links
    : (typeof (merged as any).unclassified_links === 'string'
        ? JSON.parse((merged as any).unclassified_links || '[]')
        : []);

  const mergedUrls = mergeUrls(
    {
      linkedinUrl: merged.linkedin_url,
      resumeUrl: (merged as any).resume_url,
      unclassifiedUrls: existingUnclassified,
    },
    classifiedIncoming
  );

  if (mergedUrls.linkedinUrl && mergedUrls.linkedinUrl !== merged.linkedin_url) {
    merged.linkedin_url = mergedUrls.linkedinUrl;
    wasEnriched = true;
  }
  if (mergedUrls.resumeUrl && mergedUrls.resumeUrl !== (merged as any).resume_url) {
    (merged as any).resume_url = mergedUrls.resumeUrl;
    wasEnriched = true;
  }
  if (mergedUrls.unclassifiedUrls.length > 0) {
    (merged as any).unclassified_links = mergedUrls.unclassifiedUrls;
  }

  // 5. Logical Dates: Keep separate!
  // File 1: application_collected_date
  if (incoming.application_collected_date && !merged.application_collected_date) {
    merged.application_collected_date = incoming.application_collected_date;
    wasEnriched = true;
  }
  // File 2: recruiter_assigned_date
  if (incoming.recruiter_assigned_date && !merged.recruiter_assigned_date) {
    merged.recruiter_assigned_date = incoming.recruiter_assigned_date;
    wasEnriched = true;
  }

  // 6. Recruiter Assignment: Add chronological assignment record
  const recruiter = (incoming.assigned_recruiter || '').trim();
  if (recruiter && recruiter.toLowerCase() !== 'unassigned') {
    const assignDate = incoming.recruiter_assigned_date || incoming.application_collected_date || now.split('T')[0];
    
    // Check if this assignment already exists
    const existingAssign = (merged.assignments || []).find(
      a => a.recruiter_name.toLowerCase() === recruiter.toLowerCase() && a.assigned_date === assignDate
    );

    if (!existingAssign) {
      // Mark prior active assignments as Reassigned
      if (merged.assignments) {
        merged.assignments.forEach(a => {
          if (a.status === 'Current') a.status = 'Reassigned';
        });
      }

      const newAssignment: RecruiterAssignment = {
        id: `mra-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        person_id: merged.id,
        recruiter_name: recruiter,
        assigned_date: assignDate,
        status: 'Current',
        created_at: now,
        created_by: provenance.sourceFile,
      };

      merged.assignments = [newAssignment, ...(merged.assignments || [])];
      merged.current_owner = recruiter;
      merged.recruiter_assigned_date = assignDate;
      merged.last_assignment_date = assignDate;

      if (!merged.first_assigned_recruiter) {
        merged.first_assigned_recruiter = recruiter;
      }
      wasEnriched = true;
    }
  }

  // 7. Recruiter Contact & Feedback: Add contact attempt if genuine contact or feedback is present
  const feedbackText = [incoming.feedback_1, incoming.feedback_2, incoming.notes].filter(Boolean).join('\n').trim();
  const callStatus = incoming.call_status || incoming.status;

  if (feedbackText || (callStatus && callStatus !== 'New')) {
    const cDate = incoming.recruiter_assigned_date || now.split('T')[0];
    const recName = recruiter || merged.current_owner || 'Adam';

    // Duplicate contact check
    const isDuplicateContact = (merged.recruiter_contacts || []).some(
      rc => rc.recruiter_name.toLowerCase() === recName.toLowerCase() &&
            (rc.original_feedback === feedbackText || rc.raw_feedback === feedbackText)
    );

    if (!isDuplicateContact) {
      const contactRecord: RecruiterContact = {
        id: `mrc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        person_id: merged.id,
        recruiter_name: recName,
        contact_type: 'Phone',
        contact_date: cDate,
        contact_method: 'Phone',
        outcome: callStatus || 'Feedback Recorded',
        feedback_1: incoming.feedback_1 || undefined,
        feedback_2: incoming.feedback_2 || undefined,
        original_feedback: feedbackText,
        raw_feedback: feedbackText,
        notes: feedbackText,
        source_file: provenance.sourceFile,
        created_at: now,
      };

      merged.recruiter_contacts = [contactRecord, ...(merged.recruiter_contacts || [])];
      merged.last_contacted_by = recName;
      merged.latest_contact_outcome = contactRecord.outcome;
      merged.last_contact_date = cDate;

      if (!merged.first_confirmed_contacted_by) {
        merged.first_confirmed_contacted_by = recName;
      }
      wasEnriched = true;
    }
  }

  // 8. Application: Preserve or attach application record
  const appRole = cleanJobTitle(incoming.job_title || merged.current_title || 'Candidate Application');
  const appCompany: CompanyName = (incoming.company as CompanyName) || (merged.company === 'ClinisolTech' ? 'ClinisolTech' : 'AaraTech');

  const existingApp = (merged.applications || []).find(
    a => a.company === appCompany && a.job_title.toLowerCase() === appRole.toLowerCase()
  );

  const hasIncomingAppData = Boolean(incoming.job_title || incoming.job_id || incoming.application_collected_date || incoming.status);
  if (!existingApp && hasIncomingAppData) {
    const newApp: Application = {
      id: `ma-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      person_id: merged.id,
      company: appCompany,
      job_id: incoming.job_id || null,
      job_title: appRole,
      date_applied: incoming.application_collected_date || incoming.recruiter_assigned_date || now.split('T')[0],
      current_stage: incoming.status || merged.current_status || 'Applied',
      source_file: provenance.sourceFile,
      source_row: provenance.sourceRow || 0,
      resume_link: mergedUrls.resumeUrl || undefined,
      created_at: now,
      updated_at: now,
    };
    merged.applications = [newApp, ...(merged.applications || [])];
    wasEnriched = true;
  }

  // 9. Update timestamps
  if (wasEnriched) {
    merged.updated_at = now;
    merged.last_activity_at = now;
  }

  return { merged, wasEnriched };
}
