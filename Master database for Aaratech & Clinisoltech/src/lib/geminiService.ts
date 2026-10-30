// Gemini AI Re-Verification & Intelligent Rescue Engine
// For AaraTech & ClinisolTech Master Candidate Database
// Connects directly to Google Gemini 1.5 Flash / 2.0 Flash API

import * as XLSX from 'xlsx';
import { Person, PossibleMatch, IncompleteRecord, CompanyName, Gender } from '../types/database';
import { extractCleanPhone, isValidCandidateName } from './importEngine';
import { normalizeEmail, normalizePhone } from './normalization';

const GEMINI_API_STORAGE_KEY = 'aat_gemini_api_key';

export interface GeminiExtractedCandidate {
  dateAssigned: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  location: string;
  jobTitle: string;
  owner: string;
  feedback: string;
  gender: Gender;
  company: CompanyName;
  isOrphan: boolean;
  confidence: number;
}

export interface GeminiMatchVerification {
  matchId: string;
  isSamePerson: boolean;
  confidence: number; // 0 to 100
  recommendedAction: 'AUTO_MERGE' | 'MANUAL_REVIEW' | 'REJECT';
  reasoning: string;
  mergedName: string;
  mergedEmail: string | null;
  mergedPhone: string | null;
  mergedLocation: string | null;
  insights: string;
}

export interface GeminiIncompleteRescue {
  recordId: string;
  isRescueable: boolean;
  isOrphanNote: boolean;
  confidence: number; // 0 to 100
  extractedName: string | null;
  extractedPhone: string | null;
  extractedEmail: string | null;
  extractedRole: string | null;
  extractedLocation: string | null;
  extractedGender: Gender;
  extractedNotes: string | null;
  reasoning: string;
}

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_MODEL_STORAGE_KEY = 'aat_gemini_model';

export const geminiService = {
  /**
   * Get configured Gemini model preference
   */
  getModel(): string {
    try {
      const stored = localStorage.getItem(GEMINI_MODEL_STORAGE_KEY);
      if (stored && stored.trim()) return stored.trim();
    } catch {}
    return DEFAULT_MODEL;
  },

  /**
   * Set Gemini model preference
   */
  setModel(model: string): void {
    try {
      localStorage.setItem(GEMINI_MODEL_STORAGE_KEY, model.trim());
    } catch {}
  },

  /**
   * Get configured Gemini API key (localStorage or env)
   */
  getApiKey(): string | null {
    try {
      const local = localStorage.getItem(GEMINI_API_STORAGE_KEY);
      if (local && local.trim()) return local.trim();
    } catch {}
    const envKey = (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (envKey && typeof envKey === 'string' && envKey.trim()) {
      return envKey.trim();
    }
    return '';
  },

  /**
   * Save Gemini API key to localStorage
   */
  setApiKey(key: string): void {
    try {
      localStorage.setItem(GEMINI_API_STORAGE_KEY, key.trim());
    } catch {}
  },

  /**
   * Remove Gemini API key from localStorage
   */
  clearApiKey(): void {
    try {
      localStorage.removeItem(GEMINI_API_STORAGE_KEY);
    } catch {}
  },

  /**
   * Check if Gemini API key is configured
   */
  hasApiKey(): boolean {
    return Boolean(this.getApiKey());
  },

  /**
   * Helper to strip markdown code blocks from model JSON output
   */
  stripMarkdownCodeFences(text: string): string {
    let clean = text.trim();
    if (clean.startsWith('```json')) {
      clean = clean.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
    } else if (clean.startsWith('```')) {
      clean = clean.replace(/^```\s*/, '').replace(/```\s*$/, '').trim();
    }
    return clean;
  },

  /**
   * Test connection to Gemini API with a minimal probe request
   */
  async testConnection(model?: string): Promise<{ success: boolean; message: string; modelUsed?: string }> {
    const key = this.getApiKey();
    if (!key) {
      return { success: false, message: 'Gemini API key is not set. Please provide a key.' };
    }
    const targetModel = model || this.getModel();
    try {
      const raw = await this.callGemini(
        'Respond ONLY with valid JSON: {"status": "ok", "message": "Gemini connection active"}',
        targetModel
      );
      const clean = this.stripMarkdownCodeFences(raw);
      const parsed = JSON.parse(clean);
      if (parsed.status === 'ok') {
        return { success: true, message: `Connected to Google Gemini (${targetModel}) successfully!`, modelUsed: targetModel };
      }
      return { success: true, message: `Connected to Gemini (${targetModel})!`, modelUsed: targetModel };
    } catch (err: any) {
      return { success: false, message: err.message || 'Gemini connection failed.' };
    }
  },

  /**
   * Core caller to Google Gemini REST API (with automatic model fallback)
   */
  async callGemini(prompt: string, model?: string): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Gemini API Key is not configured. Please enter your Gemini API key in Settings or the AI modal.');
    }

    const preferredModel = model || this.getModel();
    const candidateModels = [
      'gemini-2.5-flash-lite',
      preferredModel,
      'gemini-2.5-flash',
      'gemini-3.8-flash',
    ].filter((m, i, arr) => arr.indexOf(m) === i);

    let lastError: Error | null = null;

    for (const m of candidateModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${apiKey}`;

        const requestBody = {
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.1, // low temperature for deterministic, high-accuracy extraction
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errText = await response.text();
          let msg = `Gemini API Error (${response.status}): ${response.statusText}`;
          try {
            const parsed = JSON.parse(errText);
            if (parsed.error?.message) {
              msg = parsed.error.message;
            }
          } catch {}

          // If model is not found (404), quota exceeded (429), or unavailable (503), try the next candidate model!
          if (
            response.status === 404 ||
            response.status === 429 ||
            response.status === 503 ||
            msg.toLowerCase().includes('not found') ||
            msg.toLowerCase().includes('quota') ||
            msg.toLowerCase().includes('rate limit') ||
            msg.toLowerCase().includes('unavailable')
          ) {
            console.warn(`Model ${m} returned ${response.status} (${msg}). Trying fallback model...`);
            lastError = new Error(msg);
            continue;
          }
          throw new Error(msg);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        const text = candidate?.content?.parts?.[0]?.text;

        if (!text) {
          throw new Error('No response generated by Gemini AI.');
        }

        return text.trim();
      } catch (err: any) {
        lastError = err;
        console.warn(`Gemini call to model ${m} failed: ${err.message}. Trying next candidate model...`);
        continue;
      }
    }

    throw lastError || new Error('Failed to connect to Google Gemini API across all models.');
  },

  /**
   * AI Re-Verification for Possible Matches
   * Prompts Gemini to compare Candidate A and Candidate B and determine if they are identical
   */
  async verifyPossibleMatches(
    matches: PossibleMatch[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<GeminiMatchVerification[]> {
    const results: GeminiMatchVerification[] = [];
    const chunkSize = 5; // Process in chunks of 5 pairs to prevent payload limits

    for (let i = 0; i < matches.length; i += chunkSize) {
      const batch = matches.slice(i, i + chunkSize);

      const promptPairs = batch.map((m, idx) => {
        const a = m.candidate_a;
        const b = m.candidate_b;
        return {
          matchId: m.id,
          candidateA: {
            personId: a?.person_id || 'A',
            fullName: a?.full_name || '',
            emails: a?.emails?.map(e => e.email) || [a?.primary_email].filter(Boolean),
            phones: a?.phones?.map(p => p.phone_original) || [a?.primary_phone].filter(Boolean),
            location: a?.location || '',
            role: a?.current_title || a?.headline || '',
            notes: a?.recruiter_contacts?.map(r => r.original_feedback).join(' | ') || '',
            company: a?.current_company || '',
          },
          candidateB: {
            personId: b?.person_id || 'B',
            fullName: b?.full_name || '',
            emails: b?.emails?.map(e => e.email) || [b?.primary_email].filter(Boolean),
            phones: b?.phones?.map(p => p.phone_original) || [b?.primary_phone].filter(Boolean),
            location: b?.location || '',
            role: b?.current_title || b?.headline || '',
            notes: b?.recruiter_contacts?.map(r => r.original_feedback).join(' | ') || '',
            company: b?.current_company || '',
          },
          currentReason: m.match_reason || '',
        };
      });

      const prompt = `You are the Lead Data Quality & Identity Resolution AI for AaraTech & ClinisolTech Master Candidate Database.
Analyze these pairs of candidates flagged as "Possible Duplicate Matches".
For each pair, strictly evaluate if Candidate A and Candidate B represent the EXACT SAME human individual or two completely different people.

MANDATORY USER RECRUITING RULES & CONSTRAINTS:
1. RULE 2 (EXACT NAME + MATCHING CONTACT):
   - If Candidate A and Candidate B have the EXACT SAME candidate name AND matching Email OR matching Phone, recommend "AUTO_MERGE" (Confirmed same person).
2. RULE 1 (NAMES MATCH BUT CONTACTS DIFFER):
   - If Candidate A and Candidate B have the same or similar names, BUT their phone numbers AND email addresses are completely DIFFERENT, recommend "REJECT" (These are different people who happen to share a name! NEVER MERGE!).
3. RULE 3 (DIFFERENT NAME + BOTH CONTACTS MATCH):
   - If Candidate A and Candidate B have completely DIFFERENT names, BUT their Email AND Phone Number BOTH match, recommend "MANUAL_REVIEW" (Flag for manual human review - DO NOT auto-merge!).
4. RULE 4 (NAME VARIATION/NICKNAME + BOTH CONTACTS MATCH):
   - If Candidate A and Candidate B have name variations or initials (e.g. "Sai depu" vs "Sai D", "Ravi K" vs "Ravi Kumar") AND their Email AND Phone Number BOTH match, recommend "MANUAL_REVIEW" (Flag for manual human review - DO NOT auto-merge!).
5. STRICT DATA INTEGRITY - ZERO FABRICATIONS:
   - NEVER invent or generate names!
   - NEVER alter spelling of candidate names!
   - NEVER alter phone numbers, emails, or recruiter feedback!
   - All historical recruiter feedback and contact details must be preserved 100% verbatim!

Input Candidate Pairs:
${JSON.stringify(promptPairs, null, 2)}

Respond with JSON adhering to this schema:
[
  {
    "matchId": "string",
    "isSamePerson": boolean,
    "confidence": number (0 to 100),
    "recommendedAction": "AUTO_MERGE" | "MANUAL_REVIEW" | "REJECT",
    "reasoning": "Clear concise explanation of why this decision was reached",
    "mergedName": "Cleanest canonical full name",
    "mergedEmail": "Canonical email or null",
    "mergedPhone": "Canonical phone number or null",
    "mergedLocation": "Canonical location or null",
    "insights": "Key findings (e.g. 'Unites email from profile A with phone from profile B')"
  }
]`;

      try {
        const rawJson = await this.callGemini(prompt);
        const clean = this.stripMarkdownCodeFences(rawJson);
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          results.push(...parsed);
        }
      } catch (err: any) {
        console.error('Gemini batch verification error:', err);
        // Fallback for this batch
        batch.forEach(m => {
          results.push({
            matchId: m.id,
            isSamePerson: false,
            confidence: 0,
            recommendedAction: 'MANUAL_REVIEW',
            reasoning: `Gemini evaluation failed: ${err.message || 'Unknown error'}`,
            mergedName: m.candidate_a?.full_name || '',
            mergedEmail: m.candidate_a?.primary_email || null,
            mergedPhone: m.candidate_a?.primary_phone || null,
            mergedLocation: m.candidate_a?.location || null,
            insights: 'Error contacting Gemini API.',
          });
        });
      }

      if (onProgress) {
        onProgress(Math.min(i + chunkSize, matches.length), matches.length);
      }
    }

    return results;
  },

  /**
   * AI Re-Verification & Rescue for Incomplete Profiles
   * Prompts Gemini to parse unstructured recruiter notes, extract missing phone numbers,
   * emails, names, roles, and distinguish real candidates from orphan call logs.
   */
  async rescueIncompleteProfiles(
    records: IncompleteRecord[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<GeminiIncompleteRescue[]> {
    const results: GeminiIncompleteRescue[] = [];
    const chunkSize = 5; // 5 incomplete records per batch for fast deterministic execution

    for (let i = 0; i < records.length; i += chunkSize) {
      const batch = records.slice(i, i + chunkSize);

      const promptRecords = batch.map(r => ({
        recordId: r.id,
        rawName: r.raw_name || '',
        rawEmail: r.raw_email || '',
        rawPhone: r.raw_phone || '',
        rawRole: r.raw_role || '',
        company: r.company || 'AaraTech',
        recruiterFeedback: r.recruiter_feedback || '',
        owner: r.owner || 'Adam',
      }));

      const prompt = `You are the Lead Candidate Extraction & Contact Verification AI for AaraTech & ClinisolTech.
Review these "Incomplete Profiles" which are currently stuck because of missing contact info, shifted columns, or noisy text.

YOUR OBJECTIVES (STRICT VERBATIM DATA INTEGRITY - ZERO MODIFICATIONS):
1. Identify if this is a REAL CANDIDATE or an ANONYMOUS ORPHAN CALL LOG:
   - Real candidate: Has an actual human person's name or contact info, or their name/phone/email is embedded inside the feedback notes.
   - Anonymous orphan call log: Remarks with no human name and no contact details (e.g. "unable to connect", "currently busy call back on monday", "he was driving and said he'll call back", "invalid number", "open to us f opt indiana", "girl for the da job", "not interested to work with staffing firm"). Mark these with "isOrphanNote": true, "isRescueable": false.
2. Extract ANY phone number (VERBATIM ONLY):
   - Look in rawPhone, recruiterFeedback, and rawName.
   - Extract valid 10-digit US/Intl phone number (e.g. 9409773739, 412-618-9686, (347) 470-6886).
   - Filter out years (2024, 2025, 2000, 1998) or salary figures ($100k, 13/Citizen).
   - NEVER invent digits or area codes!
3. Extract ANY email address (VERBATIM ONLY):
   - Look in rawEmail, recruiterFeedback, and markdown links like [email](mailto:email) in rawName.
   - If rawName has an email attached like "priyanka killi[priyanka.killi9@gmail.com](mailto:priyanka.killi9@gmail.com)", extract the email to extractedEmail!
   - NEVER alter spelling of email addresses!
4. Extract canonical Candidate Full Name (VERBATIM ONLY):
   - If rawName has markdown or brackets, clean off the markdown to get the human name (e.g. "priyanka killi").
   - If embedded in feedback, extract only the literal human name (e.g. "Sai Chaitanya Reddy", "Devinder kumar").
   - NEVER invent or generate new names! If no person name exists, return null.
   - NEVER output sentences, pronouns, or recruiter remarks as candidate names!
5. Extract Role / Tech (DA, BA, AWS, DotNet, Java, Python, QA, SRE).
6. Extract Location (City/State or United States).
7. Extract Gender (Male, Female, or Unspecified).
8. IMMUTABLE FEEDBACK: Do NOT alter, summarize, or edit the recruiter feedback notes. Keep them 100% intact.
9. RESCUE CRITERIA:
   - If candidate has a valid human name AND at least one contact method (email OR phone), set "isRescueable": true!

Input Incomplete Records:
${JSON.stringify(promptRecords, null, 2)}

Respond with JSON adhering to this schema:
[
  {
    "recordId": "string",
    "isRescueable": boolean,
    "isOrphanNote": boolean,
    "confidence": number,
    "extractedName": "string or null",
    "extractedPhone": "string or null",
    "extractedEmail": "string or null",
    "extractedRole": "string or null",
    "extractedLocation": "string or null",
    "extractedGender": "Male" | "Female" | "Unspecified",
    "extractedNotes": "string or null",
    "reasoning": "string"
  }
]`;

      try {
        const rawJson = await this.callGemini(prompt);
        const clean = this.stripMarkdownCodeFences(rawJson);
        const parsed = JSON.parse(clean);
        if (Array.isArray(parsed)) {
          const sanitized = parsed.map(item => {
            const origRec = batch.find(b => b.id === item.recordId);
            const rawP = item.extractedPhone;
            const cleanedP = rawP ? (extractCleanPhone(rawP) || normalizePhone(rawP)?.normalized || String(rawP).trim()) : null;
            const rawE = item.extractedEmail;
            const cleanedE = rawE ? (normalizeEmail(rawE)?.original || String(rawE).trim()) : null;

            // Resolve name: prefer extracted clean name, or fallback to original raw_name if it is a valid human name
            let resName = item.extractedName ? item.extractedName.trim() : null;
            if (!resName && origRec?.raw_name) {
              const cleanedRaw = origRec.raw_name
                .replace(/\[\s*.*?\s*\](?:\(mailto:[^\s)]+\))?/gi, '')
                .replace(/mailto:[^\s)]+/gi, '')
                .replace(/<[^\s>]+>/gi, '')
                .replace(/[\[\]()<>]/g, '')
                .trim();
              if (cleanedRaw && isValidCandidateName(cleanedRaw)) {
                resName = cleanedRaw;
              }
            }

            // Re-verify isRescueable flag: Valid Name AND at least one contact method (Email OR Phone)
            const hasName = Boolean(resName && resName.length >= 2);
            const finalEmail = cleanedE || (origRec?.raw_email ? normalizeEmail(origRec.raw_email)?.original : null);
            const finalPhone = cleanedP || (origRec?.raw_phone ? (normalizePhone(origRec.raw_phone)?.normalized || extractCleanPhone(origRec.raw_phone)) : null);
            const verifiedRescueable = hasName && (Boolean(finalEmail) || Boolean(finalPhone));

            const conf = typeof item.confidence === 'number'
              ? (item.confidence <= 1 ? Math.round(item.confidence * 100) : Math.round(item.confidence))
              : (verifiedRescueable ? 90 : 20);

            return {
              ...item,
              confidence: conf,
              isRescueable: verifiedRescueable,
              extractedName: resName,
              extractedPhone: cleanedP,
              extractedEmail: cleanedE,
            };
          });
          results.push(...sanitized);
        }
      } catch (err: any) {
        console.error('Gemini incomplete rescue batch error:', err);
        // Smart fallback recovery so valid candidates are never dropped
        batch.forEach(r => {
          let name = (r.raw_name || '').trim();
          let email = (r.raw_email || '').trim();
          let phone = (r.raw_phone || '').trim();
          const feedback = (r.recruiter_feedback || '').trim();

          if (name && (name.includes('[') || name.includes('mailto:') || name.includes('@'))) {
            const mailMatch = name.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (mailMatch && !email) email = mailMatch[1];
            name = name.replace(/\[.*?\](\(.*?\))?/g, '').replace(/mailto:[^\s)]+/g, '').replace(/<.*?>/g, '').trim();
          }
          if (!email && feedback) {
            const mailMatch = feedback.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (mailMatch) email = mailMatch[1];
          }
          if (!phone && feedback) {
            const pMatch = feedback.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b)/);
            if (pMatch) phone = pMatch[0].replace(/[-.()\s]/g, '');
          }

          const hasName = Boolean(name && name.length >= 2);
          const hasContact = Boolean(email || (phone && phone.length >= 7));
          const isRescueable = hasName && hasContact;
          const isOrphan = !hasName && !email && !phone;

          results.push({
            recordId: r.id,
            isRescueable,
            isOrphanNote: isOrphan,
            confidence: isRescueable ? 90 : 0,
            extractedName: name || null,
            extractedPhone: phone ? (normalizePhone(phone)?.normalized || phone) : null,
            extractedEmail: email ? (normalizeEmail(email)?.original || email) : null,
            extractedRole: r.raw_role || null,
            extractedLocation: null,
            extractedGender: 'Unspecified',
            extractedNotes: r.recruiter_feedback || null,
            reasoning: isRescueable ? 'Smart contact recovery extracted name/contact from notes' : `AI evaluation error: ${err.message || 'Unknown error'}`,
          });
        });
      }

      if (onProgress) {
        onProgress(Math.min(i + chunkSize, records.length), records.length);
      }
    }

    return results;
  },

  /**
   * Direct Ingestion Extraction with Gemini AI:
   * Parses raw copy-pasted blocks (vertical text, semi-structured leads, unstructured notes)
   * into clean, verified candidate rows directly at input time.
   * Strictly enforces:
   * 1. 100% verbatim names (no name generation, no spelling alteration)
   * 2. 100% verbatim phone numbers & emails
   * 3. 100% verbatim recruiter feedback (never summarized or edited)
   */
  async extractCandidatesFromRawText(
    rawText: string,
    targetCompany: CompanyName = 'AaraTech',
    targetGender: 'auto' | 'Male' | 'Female' = 'auto',
    onProgress?: (msg: string) => void
  ): Promise<{
    candidates: GeminiExtractedCandidate[];
    rawTotal: number;
    orphanNotesCount: number;
  }> {
    const clean = rawText.trim();
    if (!clean) {
      throw new Error('Input text is empty. Please paste candidate leads.');
    }

    // Split text into candidate chunks to avoid token limits
    const lines = clean.split(/\r?\n/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];

    // Group by date lines or size (~80 lines per chunk)
    for (const line of lines) {
      const isDateBoundary = /^\s*(\d{1,2}[-/ ][a-zA-Z]{3,9}[-/ ]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s*$/.test(line.trim());
      if (isDateBoundary && currentChunk.length >= 60) {
        chunks.push(currentChunk.join('\n'));
        currentChunk = [];
      }
      currentChunk.push(line);
      if (currentChunk.length >= 120) {
        chunks.push(currentChunk.join('\n'));
        currentChunk = [];
      }
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
    }

    const allExtracted: GeminiExtractedCandidate[] = [];
    let orphanCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      if (onProgress) {
        onProgress(`Processing lead block ${i + 1} of ${chunks.length} with Google Gemini AI...`);
      }

      const prompt = `You are the Lead Candidate Extraction & Contact Verification AI for AaraTech & ClinisolTech.
The user has provided raw candidate leads.

YOUR MISSION:
Extract EVERY valid candidate into a clean, structured JSON array with 100% precision.

CRITICAL INTEGRITY RULES (STRICT VERBATIM - ZERO HALLUCINATIONS / ZERO MODIFICATIONS):
1. CANDIDATE FULL NAME:
   - Extract the exact literal human name from the text (e.g. "AKHIL M", "Sai Chaitanya Reddy", "Sai A", "Mohammed K Iqbal", "Devinder kumar", "Sherpa Rinzin").
   - NEVER create or invent a name. If there is no human name, leave it null.
   - NEVER alter or 'correct' the spelling of any name. Keep it 100% VERBATIM.
   - NEVER use pronouns ("he", "she"), roles ("BA", "Dot Net"), locations ("United States"), or screening notes ("looking for remote oppertunity") as candidate names.

2. PHONE NUMBER:
   - Extract the literal phone number string from the text (e.g. "9409773739", "4126189686", "4694516533", "3475314025", "5165139234", "(347) 470-6886").
   - Extract valid 10-digit US/Intl numbers.
   - NEVER invent phone numbers. NEVER confuse years (2025, 2011, 2016, 2001, 1989) or salary ($100k) with phone numbers!

3. EMAIL ADDRESS:
   - Extract the exact literal email string from the text.
   - NEVER alter spelling of email addresses. Keep it 100% VERBATIM.

4. RECRUITER FEEDBACK / NOTES:
   - Keep ALL original screening notes, feedback, rates, visa status, remarks 100% VERBATIM.
   - NEVER summarize, shorten, clean up, or alter feedback notes! For example, "3+/Masters 2025/ OPT EAD/TX/Relocate/2001/Java/" or "13/Citizen/Masters 2011/TX/Relocate/26/expectations are around 100k because he has 13 years of experience" must be preserved word-for-word.

5. DATE ASSIGNED:
   - Extract date in YYYY-MM-DD or original format (e.g. "2025-04-24", "24-Apr-2025"). Default to "${new Date().toISOString().slice(0, 10)}" if absent.

6. JOB TITLE / TECH:
   - Extract role or tech stack (e.g. "Dot Net", "AWS", "BA", "Java").

7. LOCATION:
   - Extract city, state, or country (e.g. "Texas, United States", "New York, United States", "United States"). Default to "United States" if unspecified.

8. ASSIGNED OWNER:
   - Extract recruiter or owner name (e.g. "Alex", "Adam").

9. GENDER:
   - Detect gender from name / notes: "Male", "Female", or "Unspecified".

10. ORPHAN LOGS:
    - If a block is purely a call note with no human name and no phone/email (e.g. "called back, busy", "invalid number"), mark it with "isOrphan": true.

Target Company: ${targetCompany}
Target Gender Setting: ${targetGender}

Raw Leads Input:
${chunkText}

Respond ONLY with valid JSON array adhering to this schema:
[
  {
    "dateAssigned": "string",
    "fullName": "string",
    "phone": "string" | null,
    "email": "string" | null,
    "location": "string",
    "jobTitle": "string",
    "owner": "string",
    "feedback": "string",
    "gender": "Male" | "Female" | "Unspecified",
    "isOrphan": boolean,
    "confidence": number
  }
]`;

      try {
        const rawJson = await this.callGemini(prompt);
        const cleanJson = this.stripMarkdownCodeFences(rawJson);
        const parsed = JSON.parse(cleanJson);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.isOrphan || (!item.fullName && !item.phone && !item.email)) {
              orphanCount++;
              continue;
            }

            const rawP = item.phone;
            const cleanedP = rawP ? (extractCleanPhone(rawP) || normalizePhone(rawP) || rawP) : null;
            const rawE = item.email;
            const cleanedE = rawE ? (normalizeEmail(rawE) || rawE) : null;

            allExtracted.push({
              dateAssigned: item.dateAssigned || new Date().toISOString().slice(0, 10),
              fullName: item.fullName || 'Candidate',
              phone: cleanedP,
              email: cleanedE,
              location: item.location || 'United States',
              jobTitle: item.jobTitle || 'General Sourced Candidate',
              owner: item.owner || 'Alex',
              feedback: item.feedback || '',
              gender: (targetGender !== 'auto' ? targetGender : item.gender) || 'Unspecified',
              company: targetCompany,
              isOrphan: false,
              confidence: item.confidence || 95,
            });
          }
        }
      } catch (err: any) {
        console.error('Error during Gemini candidate chunk extraction:', err);
        throw new Error(`Gemini AI Extraction failed on block ${i + 1}: ${err.message || 'Unknown error'}`);
      }
    }

    return {
      candidates: allExtracted,
      rawTotal: allExtracted.length + orphanCount,
      orphanNotesCount: orphanCount,
    };
  },

  /**
   * Converts Gemini AI extracted candidates into a standard Excel Workbook File
   * ready for immediate Preview & Column Mapping in ImportView.
   */
  createWorkbookFromCandidates(
    candidates: GeminiExtractedCandidate[],
    customName?: string
  ): File {
    const rows = candidates.map(c => ({
      'Date Assigned': c.dateAssigned,
      'Candidate Full Name': c.fullName,
      'Phone Number': c.phone || '',
      'Email Address': c.email || '',
      'Location': c.location || 'United States',
      'Job Title': c.jobTitle || 'General Sourced Candidate',
      'Assigned Owner': c.owner || 'Alex',
      'Recruiter Feedback': c.feedback || '',
      'Gender': c.gender || 'Unspecified',
      'Company': c.company,
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Gemini_Verified_Leads');

    const xlsxArray = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const fileName = customName || `gemini_verified_leads_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new File([xlsxArray], fileName, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  },

  /**
   * Pre-import AI verification for uploaded spreadsheets:
   * Scans rows where phone or email or name might be missing or buried in notes,
   * extracts missing contact details verbatim from notes, and updates rows before import.
   */
  async enhanceRowsWithGemini(
    rows: Record<string, any>[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ updatedRows: Record<string, any>[]; enhancedCount: number }> {
    const updatedRows = [...rows.map(r => ({ ...r }))];
    const candidateIndices: number[] = [];

    // Find rows that lack phone or email or clean name but have some text/feedback
    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      const hasPhone = Object.entries(row).some(([k, v]) => /phone|mobile|cell/i.test(k) && String(v || '').trim().length >= 10);
      const hasEmail = Object.entries(row).some(([k, v]) => /email|mail/i.test(k) && String(v || '').includes('@'));
      const hasNotes = Object.entries(row).some(([k, v]) => /feedback|note|remark|comment/i.test(k) && String(v || '').trim().length > 5);

      if ((!hasPhone || !hasEmail) && hasNotes) {
        candidateIndices.push(i);
      }
    }

    if (candidateIndices.length === 0) {
      return { updatedRows, enhancedCount: 0 };
    }

    let enhancedCount = 0;
    const chunkSize = 10;

    for (let i = 0; i < candidateIndices.length; i += chunkSize) {
      const batchIndices = candidateIndices.slice(i, i + chunkSize);
      const batchRows = batchIndices.map((rowIdx, bIdx) => ({
        batchIdx: bIdx,
        rowIdx,
        rowData: updatedRows[rowIdx],
      }));

      const prompt = `You are the Lead Candidate Contact Verification AI.
Review these spreadsheet rows that are missing phone numbers or emails.
Extract ANY phone number or email address buried in the feedback, notes, or name fields.
Keep everything strictly verbatim. Never invent phone numbers or emails.

Rows to inspect:
${JSON.stringify(batchRows, null, 2)}

Respond ONLY with JSON array:
[
  {
    "batchIdx": number,
    "extractedPhone": string | null,
    "extractedEmail": string | null
  }
]`;

      try {
        const rawJson = await this.callGemini(prompt);
        const cleanJson = this.stripMarkdownCodeFences(rawJson);
        const parsed = JSON.parse(cleanJson);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            const batchEntry = batchRows[item.batchIdx];
            if (!batchEntry) continue;
            const targetRow = updatedRows[batchEntry.rowIdx];
            let modified = false;

            if (item.extractedPhone) {
              const cleanedP = extractCleanPhone(item.extractedPhone) || item.extractedPhone;
              const phoneKey = Object.keys(targetRow).find(k => /phone/i.test(k)) || 'Phone Number';
              if (!targetRow[phoneKey] || String(targetRow[phoneKey]).trim().length < 10) {
                targetRow[phoneKey] = cleanedP;
                modified = true;
              }
            }

            if (item.extractedEmail) {
              const cleanedE = normalizeEmail(item.extractedEmail) || item.extractedEmail;
              const emailKey = Object.keys(targetRow).find(k => /email/i.test(k)) || 'Email Address';
              if (!targetRow[emailKey] || !String(targetRow[emailKey]).includes('@')) {
                targetRow[emailKey] = cleanedE;
                modified = true;
              }
            }

            if (modified) enhancedCount++;
          }
        }
      } catch (err) {
        console.error('Error enhancing rows batch:', err);
      }

      if (onProgress) {
        onProgress(Math.min(i + chunkSize, candidateIndices.length), candidateIndices.length);
      }
    }

    return { updatedRows, enhancedCount };
  },
};

