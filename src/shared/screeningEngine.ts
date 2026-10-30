import { AnswerValue, ParsedScreeningInfo, ScreeningRule, ScreeningStatus } from '../types';
import { classifySouthAsianOrigin, OriginResult } from './southAsianOriginClassifier.js';

/**
 * Normalizes answer text to standard YES, NO, MISSING, or UNCLEAR
 * Preserves the original raw answer for auditing.
 */
export function normalizeAnswer(rawAnswer: string | undefined | null): AnswerValue {
  if (!rawAnswer) return 'MISSING';
  const trimmed = rawAnswer.trim().toLowerCase();
  if (trimmed === '' || trimmed === 'n/a' || trimmed === 'na' || trimmed === 'null' || trimmed === 'undefined') return 'MISSING';

  if (trimmed === 'yes' || trimmed === 'y' || trimmed === 'true' || trimmed === '1') {
    return 'YES';
  }
  if (trimmed === 'no' || trimmed === 'n' || trimmed === 'false' || trimmed === '0') {
    return 'NO';
  }

  // Check if string starts with yes or no
  if (/^yes\b/i.test(trimmed)) return 'YES';
  if (/^no\b/i.test(trimmed)) return 'NO';

  // Negative phrases like "I do not require", "will not require", "not needed", "no sponsorship"
  if (/^(?:i\s+do\s+not|will\s+not|do\s+not|not\s+required|not\s+needed|no\s+sponsorship|none)\b/i.test(trimmed)) {
    return 'NO';
  }
  if (/\b(?:do\s+not\s+require|will\s+not\s+require|not\s+require)\b/i.test(trimmed)) {
    return 'NO';
  }

  // Positive phrases like "I will require", "require sponsorship"
  if (/\b(?:will\s+require|require\s+sponsorship|need\s+sponsorship)\b/i.test(trimmed)) {
    return 'YES';
  }

  return 'UNCLEAR';
}

/**
 * Normalizes question string for fuzzy/tolerant semantic comparison
 */
export function normalizeQuestion(rawQuestion: string): string {
  return rawQuestion
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // replace punctuation with spaces
    .replace(/\s+/g, ' ')     // collapse whitespace
    .trim();
}

export function isGreenCardQuestion(q: string): boolean {
  const norm = normalizeQuestion(q);
  // Matches variations like:
  // "Do You Have a Green Card or US Citizen ?"
  // "GREEN CARD/ US-C", "GREEN CARD", "US CITIZEN", "GC/USC", "GC", "US-C", "CITIZENSHIP"
  if (norm.includes('green card') || norm.includes('greencard')) return true;
  if (norm.includes('us citizen') || norm.includes('citizen') || norm.includes('permanent resident')) return true;
  if (norm.includes('us c') || norm.includes('usc') || norm.includes('gc')) return true;
  return false;
}

export function isFutureSponsorshipQuestion(q: string): boolean {
  const norm = normalizeQuestion(q);
  // Matches variations like:
  // "Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)?"
  // "H1B-Y/N", "H1B", "H-1B", "SPONSORSHIP", "VISA SPONSORSHIP", "FUTURE SPONSORSHIP"
  if (norm.includes('sponsorship') || norm.includes('sponsor')) return true;
  if (norm.includes('h1b') || norm.includes('h 1b') || norm.includes('h 1 b')) return true;
  if (norm.includes('visa required') || norm.includes('require visa') || norm.includes('visa status')) return true;
  if (norm.includes('employment visa') || norm.includes('work visa')) return true;
  return false;
}

export function isWorkAuthQuestion(q: string): boolean {
  const norm = normalizeQuestion(q);
  // Matches: "Are you legally authorized to work in the United States?", "WORK AUTH", "WORK AUTHORIZATION"
  if (norm.includes('work auth') || norm.includes('work authorization')) return true;
  return (
    (norm.includes('legally authorized') || norm.includes('authorized to work')) &&
    (norm.includes('united states') || norm.includes('us') || norm.includes('u s'))
  );
}

/**
 * Parses raw LinkedIn screening questions into structured question-answer pairs
 */
export function parseScreeningQuestionsText(rawText: string | undefined | null): {
  pairs: { question: string; answer: string; normalizedKey?: string }[];
  greenCardRaw: string;
  sponsorshipRaw: string;
  workAuthRaw: string;
} {
  const result = {
    pairs: [] as { question: string; answer: string; normalizedKey?: string }[],
    greenCardRaw: '',
    sponsorshipRaw: '',
    workAuthRaw: '',
  };

  if (!rawText || !rawText.trim()) {
    return result;
  }

  const text = rawText.trim();

  // Strategy 1: Targeted regular expressions supporting diverse delimiters (comma, pipe, semicolon, newline)
  // 1. Extract Green Card answer
  const gcMatch = text.match(
    /(?:Do\s+You\s+Have\s+a\s+Green\s+Card\s+or\s+US\s+Citizen|Do\s+you\s+have\s+a\s+green\s+card|green\s+card\s+or\s+us\s+citizen|green\s+card|us\s+citizen|gc\s*\/\s*usc|\bgc\b|\busc\b|permanent\s+resident)[^?:]*?(?:\?\s*:\s*|\?\s*|\s*:\s*)(Yes\b|No\b|true\b|false\b|Y\b|N\b|[^,;|:\n\r]+?)(?=(?:[,;|]|\r?\n|$))/i
  );
  if (gcMatch && gcMatch[1]) {
    result.greenCardRaw = gcMatch[1].trim();
  }

  // 2. Extract Sponsorship answer (e.g. "Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)?")
  const spMatch = text.match(
    /(?:Will\s+you\s+now[^\n\r?:]*?require\s+sponsorship[^\n\r?:]*?|Will\s+you\s+require\s+sponsorship[^\n\r?:]*?|Do\s+you\s+now\s+or\s+in\s+the\s+future\s+require\s+visa\s+sponsorship[^\n\r?:]*?|require\s+sponsorship|visa\s+sponsorship|future\s+sponsorship|\bh1b\b|\bh-1b\b)[^?:]*?(?:\?\s*:\s*|\?\s*|\s*:\s*)(Yes\b|No\b|true\b|false\b|Y\b|N\b|[^,;|:\n\r]+?)(?=(?:[,;|]|\r?\n|$))/i
  );
  if (spMatch && spMatch[1]) {
    result.sponsorshipRaw = spMatch[1].trim();
  }

  // 3. Extract US Work Auth answer
  const waMatch = text.match(
    /(?:Are\s+you\s+legally\s+authorized\s+to\s+work\s+in\s+the\s+United\s+States|authorized\s+to\s+work\s+in\s+the\s+united\s+states|authorized\s+to\s+work|legally\s+authorized|work\s+authorization|work\s+auth)[^?:]*?(?:\?\s*:\s*|\?\s*|\s*:\s*)(Yes\b|No\b|true\b|false\b|Y\b|N\b|[^,;|:\n\r]+?)(?=(?:[,;|]|\r?\n|$))/i
  );
  if (waMatch && waMatch[1]) {
    result.workAuthRaw = waMatch[1].trim();
  }

  // Strategy 2: Segmentation of Q&A blocks
  // Find questions/labels followed by colon and answer
  const qaRegex = /(?:^|,\s*)(.+?)\s*:\s*([^,\n\r]+?)(?=(?:,\s*[^:\n\r]+?\s*:)|$)/g;
  let match: RegExpExecArray | null;
  while ((match = qaRegex.exec(text)) !== null) {
    const q = match[1].trim();
    const a = match[2].trim();
    let key: string | undefined = undefined;

    if (isGreenCardQuestion(q)) {
      key = 'GREEN_CARD_CITIZEN';
      if (!result.greenCardRaw) result.greenCardRaw = a;
    } else if (isFutureSponsorshipQuestion(q)) {
      key = 'FUTURE_SPONSORSHIP';
      if (!result.sponsorshipRaw) result.sponsorshipRaw = a;
    } else if (isWorkAuthQuestion(q)) {
      key = 'US_WORK_AUTH';
      if (!result.workAuthRaw) result.workAuthRaw = a;
    }

    result.pairs.push({
      question: q,
      answer: a,
      normalizedKey: key,
    });
  }

  // If regex found pairs, ensure we have pairs recorded for the 3 target questions
  if (result.pairs.length === 0) {
    // Fallback: Check if colon-separated
    const parts = text.split(/,\s*(?=[A-Z][a-z])/);
    for (const part of parts) {
      const colonIdx = part.lastIndexOf(':');
      if (colonIdx !== -1) {
        const q = part.substring(0, colonIdx).trim();
        const a = part.substring(colonIdx + 1).trim();
        let key: string | undefined = undefined;
        if (isGreenCardQuestion(q)) {
          key = 'GREEN_CARD_CITIZEN';
          if (!result.greenCardRaw) result.greenCardRaw = a;
        } else if (isFutureSponsorshipQuestion(q)) {
          key = 'FUTURE_SPONSORSHIP';
          if (!result.sponsorshipRaw) result.sponsorshipRaw = a;
        } else if (isWorkAuthQuestion(q)) {
          key = 'US_WORK_AUTH';
          if (!result.workAuthRaw) result.workAuthRaw = a;
        }
        result.pairs.push({ question: q, answer: a, normalizedKey: key });
      }
    }
  }

  // If specific extractions found values not in pairs, add them
  if (result.greenCardRaw && !result.pairs.some(p => p.normalizedKey === 'GREEN_CARD_CITIZEN')) {
    result.pairs.push({
      question: 'Do You Have a Green Card or US Citizen ?',
      answer: result.greenCardRaw,
      normalizedKey: 'GREEN_CARD_CITIZEN',
    });
  }
  if (result.sponsorshipRaw && !result.pairs.some(p => p.normalizedKey === 'FUTURE_SPONSORSHIP')) {
    result.pairs.push({
      question: 'Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)?',
      answer: result.sponsorshipRaw,
      normalizedKey: 'FUTURE_SPONSORSHIP',
    });
  }
  // 4. Smart Legal & Talent Acquisition Derivation:
  // If the job posting completely omitted any future sponsorship question, but the candidate confirmed Green Card / US Citizen:
  // Under US federal immigration law, US Citizens and Permanent Residents (Green Card holders) never require visa sponsorship.
  // We infer sponsorshipRaw = 'No' (inherent to US Citizen / Permanent Resident status)
  const hasAnySponsorshipMention = /(?:sponsorship|visa\s+status|employment\s+visa|\bh1b\b|\bh-1b\b)/i.test(text);
  if (!result.sponsorshipRaw && !hasAnySponsorshipMention && result.greenCardRaw) {
    const gcClean = normalizeAnswer(result.greenCardRaw);
    if (gcClean === 'YES') {
      result.sponsorshipRaw = 'No';
      if (!result.pairs.some(p => p.normalizedKey === 'FUTURE_SPONSORSHIP')) {
        result.pairs.push({
          question: 'Future Visa Sponsorship (Inferred: GC / US-C does not require sponsorship)',
          answer: 'No',
          normalizedKey: 'FUTURE_SPONSORSHIP',
        });
      }
    }
  }

  return result;
}

/**
 * Deterministic Evaluation of Screening Rules
 *
 * Rules:
 * Mandatory Rule 1: Green Card / US Citizen MUST be YES
 * Mandatory Rule 2: Future Sponsorship MUST be NO
 *
 * Combined Logic:
 * Green Card == YES AND Sponsorship == NO => PASS
 *
 * Missing / Unclear / Blank => MANUAL REVIEW (Never auto-pass!)
 * Violations => FAIL
 */
export function evaluateScreening(
  rawText: string | undefined | null,
  activeRules?: ScreeningRule[],
  originContext?: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    headline?: string;
    educationInstitution?: string;
    location?: string;
    email?: string;
  },
  nameMatchResult?: {
    category: string;
    score: number;
    matchedPattern?: string;
    matchedReferenceName?: string;
  }
): ParsedScreeningInfo {
  const parsed = parseScreeningQuestionsText(rawText);

  const gcAnswer = normalizeAnswer(parsed.greenCardRaw);
  const spAnswer = normalizeAnswer(parsed.sponsorshipRaw);
  const waAnswer = normalizeAnswer(parsed.workAuthRaw);

  const reasons: string[] = [];
  let gcStatus: 'PASS' | 'FAIL' | 'MANUAL_REVIEW' = 'MANUAL_REVIEW';
  let spStatus: 'PASS' | 'FAIL' | 'MANUAL_REVIEW' = 'MANUAL_REVIEW';
  let waStatus: 'PASS' | 'FAIL' | 'MANUAL_REVIEW' | undefined = undefined;

  let originEvaluation: OriginResult | undefined = undefined;
  if (originContext) {
    originEvaluation = classifySouthAsianOrigin(
      originContext.fullName,
      originContext.firstName,
      originContext.lastName,
      originContext.headline,
      originContext.educationInstitution,
      originContext.location,
      originContext.email
    );
  }

  // Rule 1: Green Card / US Citizen
  if (gcAnswer === 'YES') {
    gcStatus = 'PASS';
  } else if (gcAnswer === 'NO') {
    gcStatus = 'FAIL';
  } else {
    gcStatus = 'MANUAL_REVIEW';
  }

  // Rule 2: Future Sponsorship
  if (spAnswer === 'NO') {
    spStatus = 'PASS';
  } else if (spAnswer === 'YES') {
    spStatus = 'FAIL';
  } else {
    spStatus = 'MANUAL_REVIEW';
  }

  // Optional Rule: US Work Authorization (if provided or active)
  if (parsed.workAuthRaw) {
    if (waAnswer === 'YES') {
      waStatus = 'PASS';
    } else if (waAnswer === 'NO') {
      waStatus = 'FAIL';
    } else {
      waStatus = 'MANUAL_REVIEW';
    }
  }

  let overallStatus: ScreeningStatus = 'MANUAL_REVIEW';

  // Check if any mandatory answer is missing/unclear
  const isGcMissing = gcAnswer === 'MISSING' || gcAnswer === 'UNCLEAR';
  const isSpMissing = spAnswer === 'MISSING' || spAnswer === 'UNCLEAR';

  // STEP 1: Mandatory Legal & Visa Screening Check
  // Examples:
  // YES / NO => PASS (Proceed to Step 2)
  // NO / NO => FAIL
  // YES / YES => FAIL
  // NO / YES => FAIL
  // YES / MISSING => MANUAL REVIEW
  // MISSING / NO => MANUAL REVIEW

  if (gcStatus === 'FAIL' && spStatus === 'FAIL') {
    overallStatus = 'FAIL';
    reasons.push('Both mandatory screening requirements failed.');
  } else if (gcStatus === 'FAIL' && isSpMissing) {
    overallStatus = 'FAIL';
    reasons.push('Green Card / US Citizen requirement failed.');
    reasons.push('Mandatory sponsorship answer is missing/unclear.');
  } else if (spStatus === 'FAIL' && isGcMissing) {
    overallStatus = 'FAIL';
    reasons.push('Future Sponsorship requirement failed.');
    reasons.push('Mandatory Green Card / US Citizen answer is missing/unclear.');
  } else if (gcStatus === 'FAIL') {
    overallStatus = 'FAIL';
    reasons.push('Green Card / US Citizen requirement failed.');
  } else if (spStatus === 'FAIL') {
    overallStatus = 'FAIL';
    reasons.push('Future Sponsorship requirement failed.');
  } else if (isGcMissing && isSpMissing) {
    overallStatus = 'MANUAL_REVIEW';
    reasons.push('Both mandatory screening answers missing or unverified.');
  } else if (isGcMissing) {
    overallStatus = 'MANUAL_REVIEW';
    reasons.push('Mandatory Green Card / US Citizen answer missing or unclear.');
  } else if (isSpMissing) {
    overallStatus = 'MANUAL_REVIEW';
    reasons.push('Mandatory sponsorship answer missing or unclear.');
  } else if (gcStatus === 'PASS' && spStatus === 'PASS') {
    // Check optional third rule if enabled as mandatory in configuration
    const waRule = activeRules?.find(r => r.questionKey === 'US_WORK_AUTH');
    let mandatoryWorkAuthPassed = true;
    if (waRule && waRule.status === 'ACTIVE' && waRule.isMandatory) {
      if (waAnswer !== 'YES') {
        overallStatus = waAnswer === 'NO' ? 'FAIL' : 'MANUAL_REVIEW';
        reasons.push('US Work Authorization requirement failed.');
        mandatoryWorkAuthPassed = false;
      }
    }

    if (mandatoryWorkAuthPassed) {
      if (originContext) {
        const isOriginVerified = Boolean(
          originEvaluation?.isSouthAsian ||
          (nameMatchResult && nameMatchResult.category === 'Strong Match' && nameMatchResult.score >= 0.85)
        );

        if (isOriginVerified) {
          overallStatus = 'PASS';
          reasons.push('Mandatory job-related screening requirements passed (Green Card / US Citizen: YES, Future Sponsorship: NO) and regional origin / reference match verified.');
          if (originEvaluation && originEvaluation.matchReason) {
            reasons.push(`Reference Origin Data: ${originEvaluation.countryMatch || 'South Asian'}: ${originEvaluation.matchReason}`);
          }
          if (nameMatchResult && nameMatchResult.matchedPattern) {
            reasons.push(`Reference Match: ${nameMatchResult.category} (${Math.round(nameMatchResult.score * 100)}%) - ${nameMatchResult.matchedPattern}`);
          }
        } else {
          // Subject to Origin Rule: Non-South Asian / No Match routes to MANUAL REVIEW
          overallStatus = 'MANUAL_REVIEW';
          reasons.push('Legal work authorization passed (GC: YES, Sponsorship: NO), but regional origin / reference name pattern not definitively verified (routed to manual recruiter review).');
          if (originEvaluation && originEvaluation.matchReason) {
            reasons.push(`Origin Check: ${originEvaluation.matchReason}`);
          }
        }
      } else {
        overallStatus = 'PASS';
        reasons.push('Mandatory job-related screening requirements passed (Green Card / US Citizen: YES, Future Sponsorship: NO).');
      }
    }
  } else {
    overallStatus = 'MANUAL_REVIEW';
    reasons.push('Screening answers could not be definitively validated.');
  }

  return {
    greenCardCitizenAnswer: gcAnswer,
    greenCardCitizenRaw: parsed.greenCardRaw,
    greenCardCitizenStatus: gcStatus,
    futureSponsorshipAnswer: spAnswer,
    futureSponsorshipRaw: parsed.sponsorshipRaw,
    futureSponsorshipStatus: spStatus,
    usWorkAuthAnswer: waAnswer,
    usWorkAuthRaw: parsed.workAuthRaw,
    usWorkAuthStatus: waStatus,
    originResult: originEvaluation,
    status: overallStatus,
    reasons,
    rawText: rawText || '',
    allParsedPairs: parsed.pairs,
  };
}
