/**
 * URL Classification and Safe Handling Module
 * Implements strict rules specified in Part 3 of Master Candidate Database Specification:
 * - linkedin.com -> LinkedIn Profile URL
 * - drive.google.com -> Resume URL
 * - Neither -> unclassified source link (preserved without guessing)
 */

export interface ClassifiedUrls {
  linkedinUrl: string | null;
  resumeUrl: string | null;
  unclassifiedUrls: string[];
}

/**
 * Extracts all URLs from any mixed text string (e.g. "Yes No https://drive.google.com/file/d/1g... / https://linkedin.com/in/...")
 */
export function extractUrlsFromText(text: any): string[] {
  if (!text || typeof text !== 'string') return [];
  const s = text.trim();
  if (!s || s === '—' || /^(n\/?a|none|null|undefined|not available|missing)$/i.test(s)) return [];

  const urlRegex = /(?:https?:\/\/|www\.)[^\s<>"',]+|(?:drive\.google\.com|linkedin\.com)\/[^\s<>"',]+/gi;
  const matches = s.match(urlRegex) || [];
  return matches.map(m => m.trim().replace(/[.,;:)\]]+$/, '')).filter(Boolean);
}

/**
 * Classifies a single URL into 'linkedin' | 'resume' | 'unclassified'
 */
export function classifyUrl(rawInput: any): { type: 'linkedin' | 'resume' | 'unclassified'; cleanUrl: string | null } {
  if (!rawInput || typeof rawInput !== 'string') {
    return { type: 'unclassified', cleanUrl: null };
  }

  let s = rawInput.trim();
  if (!s || s === '—' || /^(n\/?a|none|null|undefined|not available|missing)$/i.test(s)) {
    return { type: 'unclassified', cleanUrl: null };
  }

  // If text contains embedded URL (e.g. "Yes No https://drive.google.com/..."), extract pure URL
  const extracted = extractUrlsFromText(s);
  if (extracted.length > 0) {
    s = extracted[0];
  }

  // Ensure safe protocol
  let normalized = s;
  if (!/^https?:\/\//i.test(normalized)) {
    if (/^(?:www\.)?(?:linkedin\.com|drive\.google\.com|[a-z0-9-]+\.[a-z]{2,})/i.test(normalized)) {
      normalized = `https://${normalized}`;
    }
  }

  const lower = normalized.toLowerCase();

  // Rule 1: Contains linkedin.com -> LinkedIn Profile
  if (lower.includes('linkedin.com')) {
    return { type: 'linkedin', cleanUrl: normalized };
  }

  // Rule 2: Contains drive.google.com -> Resume
  if (lower.includes('drive.google.com')) {
    return { type: 'resume', cleanUrl: normalized };
  }

  // Rule 3: Matches neither rule -> Unclassified link
  return { type: 'unclassified', cleanUrl: normalized };
}

/**
 * Given multiple potential URL inputs, separates them into LinkedIn, Resume, and Unclassified
 */
export function classifyMultipleUrls(inputs: any[]): ClassifiedUrls {
  let linkedinUrl: string | null = null;
  let resumeUrl: string | null = null;
  const unclassifiedUrls: string[] = [];

  for (const raw of inputs) {
    if (!raw) continue;
    
    // Check if raw string contains multiple URLs
    if (typeof raw === 'string') {
      const extractedList = extractUrlsFromText(raw);
      const toProcess = extractedList.length > 0 ? extractedList : [raw];
      for (const item of toProcess) {
        const { type, cleanUrl } = classifyUrl(item);
        if (!cleanUrl) continue;

        if (type === 'linkedin' && !linkedinUrl) {
          linkedinUrl = cleanUrl;
        } else if (type === 'resume' && !resumeUrl) {
          resumeUrl = cleanUrl;
        } else if (cleanUrl && !unclassifiedUrls.includes(cleanUrl) && cleanUrl !== linkedinUrl && cleanUrl !== resumeUrl) {
          unclassifiedUrls.push(cleanUrl);
        }
      }
    } else {
      const { type, cleanUrl } = classifyUrl(raw);
      if (!cleanUrl) continue;

      if (type === 'linkedin' && !linkedinUrl) {
        linkedinUrl = cleanUrl;
      } else if (type === 'resume' && !resumeUrl) {
        resumeUrl = cleanUrl;
      } else if (cleanUrl && !unclassifiedUrls.includes(cleanUrl)) {
        unclassifiedUrls.push(cleanUrl);
      }
    }
  }

  return { linkedinUrl, resumeUrl, unclassifiedUrls };
}

/**
 * Merges new URLs into existing URLs non-destructively:
 * - A blank or invalid incoming URL must NOT erase an existing valid URL.
 */
export function mergeUrls(
  existing: { linkedinUrl?: string | null; resumeUrl?: string | null; unclassifiedUrls?: string[] },
  incoming: { linkedinUrl?: string | null; resumeUrl?: string | null; unclassifiedUrls?: string[] }
): ClassifiedUrls {
  const finalLinkedin = (incoming.linkedinUrl && incoming.linkedinUrl.trim()) || existing.linkedinUrl || null;
  const finalResume = (incoming.resumeUrl && incoming.resumeUrl.trim()) || existing.resumeUrl || null;

  const existingUnclass = existing.unclassifiedUrls || [];
  const incomingUnclass = incoming.unclassifiedUrls || [];
  const combinedUnclass = Array.from(new Set([...existingUnclass, ...incomingUnclass]))
    .filter(Boolean)
    .filter(u => u !== finalLinkedin && u !== finalResume);

  return {
    linkedinUrl: finalLinkedin,
    resumeUrl: finalResume,
    unclassifiedUrls: combinedUnclass,
  };
}
