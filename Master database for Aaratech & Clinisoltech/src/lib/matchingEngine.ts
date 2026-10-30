// Duplicate Matching & Safe Auto-Merge Engine for AaraTech Master Database
// Conforms strictly to the Antigravity Master Specification & Decision Rules Table

import { Person, CompanyName, PossibleMatch } from '../types/database';

export type MatchDecisionType = 'MATCHED' | 'POSSIBLE_MATCH' | 'NEW_PERSON';

export type DuplicateDecisionOutcome = 'AUTO_MERGE' | 'MANUAL_REVIEW' | 'NO_MATCH';

export interface DuplicateDecisionResult {
  decision: DuplicateDecisionOutcome;
  confidenceScore: number;
  reason: string;
  ruleTriggered: string;
  nameMatchStatus: 'Exact' | 'Similar' | 'Different';
  emailMatchStatus: 'Match' | 'Different' | 'Missing';
  phoneMatchStatus: 'Match' | 'Different' | 'Missing';
  matchedEmail?: string;
  matchedPhone?: string;
  conflicts: string[];
}

export interface MatchCandidateCriteria {
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  normalizedEmail?: string | null;
  normalizedPhone?: string | null;
  normalizedLinkedIn?: string | null;
  targetCompany?: CompanyName;
}

export interface MatchResult {
  decision: MatchDecisionType;
  matchedPerson?: Person;
  matchReason?: string;
  confidenceScore: number; // 0 to 1
  ruleTriggered: string;
}

// -------------------------------------------------------------
// SECTION 3: NAME NORMALIZATION & COMPARISON
// -------------------------------------------------------------

/**
 * Safe name-normalization function:
 * - Trims leading and trailing spaces
 * - Collapses repeated internal spaces
 * - Case-insensitive (lowercase)
 * - Normalizes harmless Unicode differences (NFKD)
 * Note: Keeps original name unchanged in historical records; used for comparison only.
 */
export function normalizeCandidateName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics harmlessly
    .toLowerCase()
    .trim()
    .replace(/[.'’`]+/g, '') // harmless punctuation
    .replace(/\s+/g, ' ');
}

/**
 * Calculates string similarity using Levenshtein distance (0.0 to 1.0)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;
  const l1 = str1.length;
  const l2 = str2.length;
  const maxLen = Math.max(l1, l2);
  if (maxLen === 0) return 1.0;

  const matrix: number[][] = [];
  for (let i = 0; i <= l1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= l2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= l1; i++) {
    for (let j = 1; j <= l2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const distance = matrix[l1][l2];
  return 1.0 - distance / maxLen;
}

/**
 * Compares two candidate names:
 * - Exact: exact normalized or joined/separated formatting match (e.g., "SaiVenkat" === "Sai Venkat", "MADHU" === "Madhu")
 * - Similar: close typo, spelling variation, initial/abbreviation (e.g. "Jason" vs "Janson", "Ravi K" vs "Ravi Kumar")
 * - Different: distinct names (e.g. "Sandeep G" vs "Sandeep Kumar", "Siva Pavan Kumar C" vs "Pavan Chowdary")
 */
export function compareCandidateNames(nameA?: string | null, nameB?: string | null): 'Exact' | 'Similar' | 'Different' {
  const normA = normalizeCandidateName(nameA);
  const normB = normalizeCandidateName(nameB);

  if (!normA || !normB) return 'Different';
  if (normA === normB) return 'Exact';

  // Section 3: Recognize joined and separated words when the name tokens are otherwise equivalent!
  // e.g. "SaiVenkat" and "Sai Venkat" -> formatting match (Exact)
  // e.g. "MADHU" and "Madhu" -> formatting match (Exact)
  // e.g. "UdayKiran" and "Uday Kiran" -> formatting match (Exact)
  const compactA = normA.replace(/[\s\-_]+/g, '');
  const compactB = normB.replace(/[\s\-_]+/g, '');
  if (compactA === compactB) {
    return 'Exact';
  }

  const tokensA = normA.split(' ');
  const tokensB = normB.split(' ');

  // Safeguard: Check for initials / abbreviations vs full names (Section 3: Ravi K vs Ravi Kumar -> Similar)
  if (tokensA.length >= 2 && tokensB.length >= 2) {
    const lastA = tokensA[tokensA.length - 1];
    const lastB = tokensB[tokensB.length - 1];
    const firstA = tokensA[0];
    const firstB = tokensB[0];

    // Initial check on last name (e.g. "Ravi K" vs "Ravi Kumar", "Sai depu" vs "Sai D")
    if (firstA === firstB && ((lastA.length === 1 && lastB.startsWith(lastA)) || (lastB.length === 1 && lastA.startsWith(lastB)))) {
      return 'Similar';
    }

    // Initial check on first name (e.g. "K Ravi" vs "Kumar Ravi")
    if (lastA === lastB && ((firstA.length === 1 && firstB.startsWith(firstA)) || (firstB.length === 1 && firstA.startsWith(firstB)))) {
      return 'Similar';
    }

    // Middle token / initial check (e.g. "Sai Deepu Reddy" vs "Sai D Reddy")
    if (tokensA.length === 3 && tokensB.length === 3 && firstA === firstB && lastA === lastB) {
      const midA = tokensA[1];
      const midB = tokensB[1];
      if ((midA.length === 1 && midB.startsWith(midA)) || (midB.length === 1 && midA.startsWith(midB))) {
        return 'Similar';
      }
    }

    // 2-token vs 3-token name variations (e.g. "Sai Deepu" vs "Sai Deepu Reddy" or "Sai D" vs "Sai Depu Reddy")
    if ((tokensA.length === 2 && tokensB.length === 3) || (tokensA.length === 3 && tokensB.length === 2)) {
      const two = tokensA.length === 2 ? tokensA : tokensB;
      const three = tokensA.length === 3 ? tokensA : tokensB;
      if (two[0] === three[0]) {
        if (two[1].length === 1 && (three[1].startsWith(two[1]) || (three[2] && three[2].startsWith(two[1])))) {
          return 'Similar';
        }
        if (two[1] === three[1] || two[1] === three[2]) {
          return 'Similar';
        }
      }
    }

    // If last names are different and not a 1-character typo, classify as Different
    if (lastA !== lastB && calculateStringSimilarity(lastA, lastB) < 0.75) {
      return 'Different';
    }
  }

  // Calculate overall string similarity
  const sim = calculateStringSimilarity(normA, normB);
  if (sim >= 0.82) {
    return 'Similar';
  }

  return 'Different';
}

// -------------------------------------------------------------
// SECTION 4: EMAIL NORMALIZATION & COMPARISON
// -------------------------------------------------------------

export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Validates and extracts canonical email for comparison.
 * Does NOT strip dots or plus-addressing globally.
 */
export function normalizeEmailForComparison(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null;
  const s = email.trim().toLowerCase();
  if (!s || !EMAIL_REGEX.test(s)) return null;
  if (/^(none|n\/a|na|null|undefined|-|—|no@email\.com)$/i.test(s)) return null;
  return s;
}

export function compareEmails(
  emailsA: (string | null | undefined)[] | string | null | undefined,
  emailsB: (string | null | undefined)[] | string | null | undefined
): { status: 'Match' | 'Different' | 'Missing'; matchedEmail?: string } {
  const listA = Array.isArray(emailsA) ? emailsA : [emailsA];
  const listB = Array.isArray(emailsB) ? emailsB : [emailsB];
  const validA = new Set<string>();
  for (const e of listA) {
    const norm = normalizeEmailForComparison(e);
    if (norm) validA.add(norm);
  }

  const validB = new Set<string>();
  for (const e of listB) {
    const norm = normalizeEmailForComparison(e);
    if (norm) validB.add(norm);
  }

  if (validA.size === 0 || validB.size === 0) {
    return { status: 'Missing' };
  }

  for (const ea of validA) {
    if (validB.has(ea)) {
      return { status: 'Match', matchedEmail: ea };
    }
  }

  return { status: 'Different' };
}

// -------------------------------------------------------------
// SECTION 5: PHONE NORMALIZATION & COMPARISON
// -------------------------------------------------------------

/**
 * Normalizes phone number digits for comparison:
 * - Strips formatting characters (spaces, dashes, parentheses, dots)
 * - Standardizes US 10-digit / international numbers
 * - Treats placeholders / blanks as null
 */
export function normalizePhoneForComparison(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;
  const s = phone.trim();
  if (/^(no number|no phone|none|n\/a|na|nil|null|-|—)$/i.test(s)) return null;

  const digits = s.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  if (/^0{7,}$/.test(digits) || digits === '1234567890') return null;

  // Case: US 11 digits starting with 1
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.substring(1);
  }

  // Case: US 10 digits
  if (digits.length === 10) {
    return digits;
  }

  // Case: International with plus sign
  if (s.startsWith('+')) {
    return `+${digits}`;
  }

  return digits;
}

export function comparePhones(
  phonesA: (string | null | undefined)[] | string | null | undefined,
  phonesB: (string | null | undefined)[] | string | null | undefined
): { status: 'Match' | 'Different' | 'Missing'; matchedPhone?: string } {
  const listA = Array.isArray(phonesA) ? phonesA : [phonesA];
  const listB = Array.isArray(phonesB) ? phonesB : [phonesB];
  const validA = new Set<string>();
  for (const p of listA) {
    const norm = normalizePhoneForComparison(p);
    if (norm) validA.add(norm);
  }

  const validB = new Set<string>();
  for (const p of listB) {
    const norm = normalizePhoneForComparison(p);
    if (norm) validB.add(norm);
  }

  if (validA.size === 0 || validB.size === 0) {
    return { status: 'Missing' };
  }

  for (const pa of validA) {
    if (validB.has(pa)) {
      return { status: 'Match', matchedPhone: pa };
    }
  }

  return { status: 'Different' };
}

// -------------------------------------------------------------
// SECTION 6 & 7: AUTHORITATIVE DUPLICATE DECISION ENGINE
// -------------------------------------------------------------

/**
 * Extracts all email strings from a candidate profile (primary, secondary, and historical)
 */
export function getAllCandidateEmails(p: Person): string[] {
  const list: string[] = [];
  if (p.primary_email) list.push(p.primary_email);
  if (p.secondary_email) list.push(p.secondary_email);
  if (p.emails) {
    for (const e of p.emails) {
      if (e.email) list.push(e.email);
    }
  }
  return Array.from(new Set(list));
}

/**
 * Extracts all phone strings from a candidate profile (primary, secondary, and historical)
 */
export function getAllCandidatePhones(p: Person): string[] {
  const list: string[] = [];
  if (p.primary_phone) list.push(p.primary_phone);
  if (p.secondary_phone) list.push(p.secondary_phone);
  if (p.phones) {
    for (const ph of p.phones) {
      if (ph.phone_original) list.push(ph.phone_original);
      else if (ph.phone_normalized) list.push(ph.phone_normalized);
    }
  }
  return Array.from(new Set(list));
}

/**
 * Authoritative Duplicate Evaluation between Candidate A and Candidate B.
 * Applies the mandatory decision table strictly to AaraTech candidates.
 */
export function evaluateCandidatePair(
  candidateA: Person,
  candidateB: Person,
  options?: {
    separatedPairs?: Set<string>;
    unmergedPairs?: Set<string>;
    contradictoryIdentity?: boolean;
  }
): DuplicateDecisionResult {
  const compA = candidateA.current_company || candidateA.applications?.[0]?.company || 'AaraTech';
  const compB = candidateB.current_company || candidateB.applications?.[0]?.company || 'AaraTech';

  // SECTION 2: STRICT COMPANY ISOLATION
  // Apply rules exclusively to AaraTech. Cross-company comparisons are strictly NO_MATCH.
  if (compA !== 'AaraTech' || compB !== 'AaraTech' || compA !== compB) {
    return {
      decision: 'NO_MATCH',
      confidenceScore: 0.0,
      reason: 'Candidates belong to different companies or not within AaraTech database. Cross-company merging is strictly blocked.',
      ruleTriggered: 'RULE_COMPANY_ISOLATION_BLOCKED',
      nameMatchStatus: 'Different',
      emailMatchStatus: 'Missing',
      phoneMatchStatus: 'Missing',
      conflicts: ['Cross-company separation: AaraTech and ClinisolTech must never be merged.'],
    };
  }

  // Same person ID comparison check
  if (candidateA.id === candidateB.id) {
    return {
      decision: 'NO_MATCH',
      confidenceScore: 0.0,
      reason: 'Same candidate profile evaluated against itself.',
      ruleTriggered: 'RULE_SELF_PROFILE',
      nameMatchStatus: 'Exact',
      emailMatchStatus: 'Match',
      phoneMatchStatus: 'Match',
      conflicts: [],
    };
  }

  // Check if previously separated by recruiter
  const pairKey1 = `${candidateA.id}:${candidateB.id}`;
  const pairKey2 = `${candidateB.id}:${candidateA.id}`;
  const isSeparated = Boolean(
    options?.separatedPairs && (options.separatedPairs.has(pairKey1) || options.separatedPairs.has(pairKey2))
  );

  const isUnmerged = Boolean(
    options?.unmergedPairs && (options.unmergedPairs.has(pairKey1) || options.unmergedPairs.has(pairKey2))
  );

  const nameMatchStatus = compareCandidateNames(candidateA.full_name, candidateB.full_name);
  const emailRes = compareEmails(getAllCandidateEmails(candidateA), getAllCandidateEmails(candidateB));
  const phoneRes = comparePhones(getAllCandidatePhones(candidateA), getAllCandidatePhones(candidateB));

  const emailMatchStatus = emailRes.status;
  const phoneMatchStatus = phoneRes.status;

  const conflicts: string[] = [];
  if (isSeparated) {
    conflicts.push('Previously marked as Not The Same Person by recruiter. Automatic merge strictly prohibited.');
  }

  if (isUnmerged) {
    conflicts.push('Previously unmerged profiles. Automatic merge strictly prohibited, requires manual confirmation.');
  }

  if (options?.contradictoryIdentity) {
    conflicts.push('Contradictory identity evidence detected. Manual review required.');
  }

  // Check conflicting identity evidence (e.g. known different IDs)
  if (candidateA.merged_into_id && candidateA.merged_into_id !== candidateB.id) {
    conflicts.push(`Profile A is already merged into ${candidateA.merged_into_id}. Transitive merge chain safety check required.`);
  }
  if (candidateB.merged_into_id && candidateB.merged_into_id !== candidateA.id) {
    conflicts.push(`Profile B is already merged into ${candidateB.merged_into_id}. Transitive merge chain safety check required.`);
  }

  const conflictRule = isSeparated
    ? 'BLOCKED_PREVIOUSLY_SEPARATED'
    : isUnmerged
    ? 'BLOCKED_PREVIOUSLY_UNMERGED'
    : 'CONFLICT_OVERRIDE_MANUAL_REVIEW';

  // -------------------------------------------------------------
  // MANDATORY DECISION TABLE EVALUATION (USER RECRUITING RULES)
  // -------------------------------------------------------------

  const hasMatchingEmail = emailMatchStatus === 'Match';
  const hasMatchingPhone = phoneMatchStatus === 'Match';
  const hasAnyMatchingContact = hasMatchingEmail || hasMatchingPhone;
  const hasBothMatchingContacts = hasMatchingEmail && hasMatchingPhone;

  // RULE 2: Exact Name + at least one contact match (Email OR Phone) -> AUTO_MERGE
  // User Rule: "if Name is matched and email or phone number is matched then consider as same profiles then merged"
  if (nameMatchStatus === 'Exact' && hasAnyMatchingContact) {
    if (conflicts.length > 0) {
      return {
        decision: 'MANUAL_REVIEW',
        confidenceScore: 0.90,
        reason: `Exact name and matching contact details, but conflicting identity information exists: ${conflicts.join('; ')}`,
        ruleTriggered: conflictRule,
        nameMatchStatus,
        emailMatchStatus,
        phoneMatchStatus,
        matchedEmail: emailRes.matchedEmail,
        matchedPhone: phoneRes.matchedPhone,
        conflicts,
      };
    }
    return {
      decision: 'AUTO_MERGE',
      confidenceScore: hasBothMatchingContacts ? 1.0 : 0.96,
      reason: hasBothMatchingContacts
        ? `Exact normalized name and matching verified Email (${emailRes.matchedEmail}) & Phone (${phoneRes.matchedPhone}). Merged into same profile.`
        : hasMatchingEmail
        ? `Exact normalized name and matching verified Email (${emailRes.matchedEmail}). Merged into same profile.`
        : `Exact normalized name and matching verified Phone (${phoneRes.matchedPhone}). Merged into same profile.`,
      ruleTriggered: hasBothMatchingContacts
        ? 'RULE_EXACT_NAME_EMAIL_PHONE_MATCH'
        : hasMatchingEmail
        ? 'RULE_EXACT_NAME_EMAIL_MATCH'
        : 'RULE_EXACT_NAME_PHONE_MATCH',
      nameMatchStatus,
      emailMatchStatus,
      phoneMatchStatus,
      matchedEmail: emailRes.matchedEmail,
      matchedPhone: phoneRes.matchedPhone,
      conflicts,
    };
  }

  // RULE 1: Names matched (Exact or Similar) but phone and email are different (or no contact overlap) -> DIFFERENT PROFILES!
  // User Rule: "if Names matched but phone and emial is diffrent then consider as diffrent profiles"
  if ((nameMatchStatus === 'Exact' || nameMatchStatus === 'Similar') && !hasAnyMatchingContact) {
    return {
      decision: 'NO_MATCH',
      confidenceScore: 0.0,
      reason: `Name matched ("${candidateA.full_name}" vs "${candidateB.full_name}"), but phone and email are different. Considered as different profiles per recruiting policy.`,
      ruleTriggered: 'RULE_SAME_NAME_DIFF_CONTACTS_DISTINCT_PROFILES',
      nameMatchStatus,
      emailMatchStatus,
      phoneMatchStatus,
      conflicts,
    };
  }

  // RULE 4: Name variation like "Sai depu" vs "Sai D" (Similar) and both phone & email matched -> MANUAL REVIEW
  // User Rule: "soeme Names or like Sai depu or Sai D but phone number & email matched then it is same profile ,but make it as a manual review"
  if (nameMatchStatus === 'Similar' && hasBothMatchingContacts) {
    return {
      decision: 'MANUAL_REVIEW',
      confidenceScore: 0.88,
      reason: `Name variation detected ("${candidateA.full_name}" vs "${candidateB.full_name}"), but verified phone number (${phoneRes.matchedPhone}) & email (${emailRes.matchedEmail}) match. Flagged for manual review.`,
      ruleTriggered: 'RULE_SIMILAR_NAME_BOTH_CONTACTS_MANUAL_REVIEW',
      nameMatchStatus,
      emailMatchStatus,
      phoneMatchStatus,
      matchedEmail: emailRes.matchedEmail,
      matchedPhone: phoneRes.matchedPhone,
      conflicts,
    };
  }

  // RULE 3: Name doesn't match, but email and phone are matched -> MANUAL REVIEW
  // User Rule: "if Name dosenst match ,but email and phone is matched then manual review"
  if (nameMatchStatus === 'Different' && hasBothMatchingContacts) {
    return {
      decision: 'MANUAL_REVIEW',
      confidenceScore: 0.82,
      reason: `Names differ ("${candidateA.full_name}" vs "${candidateB.full_name}"), but both Email (${emailRes.matchedEmail}) and Phone (${phoneRes.matchedPhone}) match. Flagged for manual review.`,
      ruleTriggered: 'RULE_DIFF_NAME_BOTH_CONTACTS_MANUAL_REVIEW',
      nameMatchStatus,
      emailMatchStatus,
      phoneMatchStatus,
      matchedEmail: emailRes.matchedEmail,
      matchedPhone: phoneRes.matchedPhone,
      conflicts,
    };
  }

  // Fallback: Similar name with single contact match -> MANUAL REVIEW
  if (nameMatchStatus === 'Similar' && hasAnyMatchingContact) {
    return {
      decision: 'MANUAL_REVIEW',
      confidenceScore: 0.75,
      reason: `Similar names ("${candidateA.full_name}" vs "${candidateB.full_name}") with single matching contact. Flagged for manual review.`,
      ruleTriggered: 'RULE_SIMILAR_NAME_SINGLE_CONTACT_MATCH',
      nameMatchStatus,
      emailMatchStatus,
      phoneMatchStatus,
      matchedEmail: emailRes.matchedEmail,
      matchedPhone: phoneRes.matchedPhone,
      conflicts,
    };
  }

  // All other cases: Different Name + 0 or 1 contact match -> NO_MATCH
  return {
    decision: 'NO_MATCH',
    confidenceScore: 0.0,
    reason: 'No reliable duplicate evidence found. Different candidate profiles.',
    ruleTriggered: 'RULE_NO_MATCH',
    nameMatchStatus,
    emailMatchStatus,
    phoneMatchStatus,
    conflicts,
  };
}

// -------------------------------------------------------------
// IMPORT-TIME EVALUATION
// -------------------------------------------------------------

/**
 * Evaluates an incoming candidate against existing database people during file import.
 * Strictly adheres to the decision table:
 * - Only exact normalized name + at least one contact match auto-matches
 * - Any different name with matching contact routes to POSSIBLE_MATCH for manual review!
 */
export function evaluateDuplicateMatch(
  incoming: MatchCandidateCriteria,
  existingPeople: Person[]
): MatchResult {
  const incEmail = normalizeEmailForComparison(incoming.normalizedEmail);
  const incPhone = normalizePhoneForComparison(incoming.normalizedPhone);
  const incLinkedIn = incoming.normalizedLinkedIn ? incoming.normalizedLinkedIn.trim().toLowerCase() : null;

  let bestPossibleMatch: { person: Person; reason: string; score: number; rule: string } | null = null;

  for (const person of existingPeople) {
    // Strict Company Isolation
    if (incoming.targetCompany) {
      const personCompany =
        person.current_company ||
        (person.applications && person.applications.find(a => a.company)?.company) ||
        'AaraTech';
      if (personCompany !== incoming.targetCompany) {
        continue;
      }
    }

    const nameStatus = compareCandidateNames(person.full_name, incoming.fullName);
    const emailRes = compareEmails(getAllCandidateEmails(person), incEmail ? [incEmail] : []);
    const phoneRes = comparePhones(getAllCandidatePhones(person), incPhone ? [incPhone] : []);

    const hasMatchingEmail = emailRes.status === 'Match';
    const hasMatchingPhone = phoneRes.status === 'Match';
    const personLinkedIn = person.linkedin_url ? person.linkedin_url.trim().toLowerCase() : null;
    const hasMatchingLinkedIn = Boolean(
      incLinkedIn && personLinkedIn && (personLinkedIn.includes(incLinkedIn) || incLinkedIn.includes(personLinkedIn))
    );
    const hasAnyMatchingContact = hasMatchingEmail || hasMatchingPhone || hasMatchingLinkedIn;
    const hasBothMatchingContacts = hasMatchingEmail && hasMatchingPhone;

    // RULE 2: Exact Name + at least one contact match (Email OR Phone) -> AUTO-MERGE (MATCHED)
    // User Rule: "if Name is matched and email or phone number is matched then consider as same profiles then merged"
    if (nameStatus === 'Exact' && hasAnyMatchingContact) {
      let reason = `Exact normalized name and matching verified contact (${hasMatchingEmail ? incEmail : incPhone})`;
      if (hasBothMatchingContacts) {
        reason = `Exact normalized name and matching verified Email (${incEmail}) & Phone (${incPhone})`;
      } else if (hasMatchingLinkedIn) {
        reason = `Exact normalized name and matching verified LinkedIn profile`;
      }
      return {
        decision: 'MATCHED',
        matchedPerson: person,
        matchReason: reason,
        confidenceScore: 0.98,
        ruleTriggered: 'RULE_EXACT_NAME_CONTACT_MATCH',
      };
    }

    // RULE 1: Names matched but phone and email are different -> DIFFERENT PROFILES!
    // User Rule: "if Names matched but phone and emial is diffrent then consider as diffrent profiles"
    // => DO NOT flag as possible match. Continue searching.
    if ((nameStatus === 'Exact' || nameStatus === 'Similar') && !hasAnyMatchingContact) {
      continue;
    }

    // RULE 4: Name variation like "Sai depu" vs "Sai D" (Similar) and phone & email matched -> MANUAL REVIEW (POSSIBLE_MATCH)
    // User Rule: "soeme Names or like Sai depu or Sai D but phone number & email matched then it is same profile ,but make it as a manual review"
    if (nameStatus === 'Similar' && hasBothMatchingContacts) {
      if (!bestPossibleMatch || bestPossibleMatch.score < 0.88) {
        bestPossibleMatch = {
          person,
          reason: `Name variation (${incoming.fullName} vs ${person.full_name}) with matching Email (${incEmail}) & Phone (${incPhone}). Flagged for manual review.`,
          score: 0.88,
          rule: 'RULE_SIMILAR_NAME_BOTH_CONTACTS_MANUAL_REVIEW',
        };
      }
      continue;
    }

    // RULE 3: Name doesn't match, but email and phone is matched -> MANUAL REVIEW (POSSIBLE_MATCH)
    // User Rule: "if Name dosenst match ,but email and phone is matched then manual review"
    if (nameStatus === 'Different' && hasBothMatchingContacts) {
      if (!bestPossibleMatch || bestPossibleMatch.score < 0.82) {
        bestPossibleMatch = {
          person,
          reason: `Names differ (${incoming.fullName} vs ${person.full_name}), but both Email (${incEmail}) and Phone (${incPhone}) match. Flagged for manual review.`,
          score: 0.82,
          rule: 'RULE_DIFF_NAME_BOTH_CONTACTS_MANUAL_REVIEW',
        };
      }
      continue;
    }

    // Fallback: Similar name with single contact match -> MANUAL REVIEW
    if (nameStatus === 'Similar' && hasAnyMatchingContact) {
      if (!bestPossibleMatch || bestPossibleMatch.score < 0.75) {
        bestPossibleMatch = {
          person,
          reason: `Similar names (${incoming.fullName} vs ${person.full_name}) with matching ${hasMatchingEmail ? 'Email' : 'Phone'}. Flagged for manual review.`,
          score: 0.75,
          rule: 'RULE_SIMILAR_NAME_SINGLE_CONTACT_MATCH',
        };
      }
      continue;
    }
  }

  if (bestPossibleMatch) {
    return {
      decision: 'POSSIBLE_MATCH',
      matchedPerson: bestPossibleMatch.person,
      matchReason: bestPossibleMatch.reason,
      confidenceScore: bestPossibleMatch.score,
      ruleTriggered: bestPossibleMatch.rule,
    };
  }

  return {
    decision: 'NEW_PERSON',
    matchReason: 'No existing matching records found',
    confidenceScore: 0.0,
    ruleTriggered: 'RULE_NEW_PERSON',
  };
}
