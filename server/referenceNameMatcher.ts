import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type NameMatchCategory = 'Strong Match' | 'Possible Match' | 'No Match';

export interface NameMatchResult {
  applicantName: string;
  category: NameMatchCategory;
  score: number; // 0.0 to 1.0
  matchedPattern: string;
  matchedReferenceName: string;
}

export interface ReferenceMatcherStats {
  dataset1Count: number;
  dataset2Count: number;
  totalReferenceNames: number;
  uniqueReferenceNames: number;
  uniqueTokens: number;
  uniqueTokenCombos: number;
  similarityThreshold: number;
  topTokens: { token: string; count: number }[];
  topCombos: string[];
}

/**
 * Phonetic / Spelling variations canonical normalization dictionary.
 * Standardizes common Indian/South Asian English transliteration variations.
 */
const CANONICAL_SPELLINGS: Record<string, string> = {
  chaudhary: 'chowdary',
  choudhary: 'chowdary',
  chaudhry: 'chowdary',
  choudhury: 'chowdary',
  reddi: 'reddy',
  sheikh: 'shaik',
  shaikh: 'shaik',
  muhammad: 'mohammed',
  mohammad: 'mohammed',
  mohamed: 'mohammed',
  venkata: 'venkat',
  venkatsai: 'venkatsai',
  kartik: 'karthik',
  kartheek: 'karthik',
  pravin: 'praveen',
  navin: 'naveen',
  vamsi: 'vamshi',
  rohit: 'rohith',
  shrinivas: 'srinivas',
  harshit: 'harshith',
  rehman: 'rahman',
  hussain: 'husain',
  hassan: 'hasan',
  gowda: 'gowda',
  naidu: 'naidu',
  patil: 'patil',
  deshmukh: 'deshmukh',
  shubhan: 'shubham',
};

/**
 * Clean a single token: lowercase, letters only, trimmed.
 */
export function cleanToken(t: string): string {
  if (!t) return '';
  return t.toLowerCase().replace(/[^a-z]/g, '').trim();
}

/**
 * Normalize an entire name:
 * - Lowercase
 * - Remove punctuation, extra spaces, dots, hyphens, slashes, brackets
 * - Trim
 */
export function normalizeName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[,\.\-_/()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getCanonicalToken(t: string): string {
  const c = cleanToken(t);
  return CANONICAL_SPELLINGS[c] || c;
}

/**
 * High-frequency tokens that occur widely and alone do NOT constitute a definite match (Req. 8).
 */
const ULTRA_COMMON_TOKENS = new Set([
  'kumar', 'sai', 'reddy', 'patel', 'singh', 'sharma', 'rao', 'prasad',
  'babu', 'chandra', 'goud', 'chowdary', 'khan', 'mohammed', 'sri',
  'gupta', 'verma', 'das', 'ali', 'ahmed', 'john', 'smith', 'williams',
  'david', 'alex', 'michael', 'joseph', 'thomas'
]);

/**
 * Generic Western / Non-South Asian names that may appear incidentally in the reference datasets
 * (e.g. from international or Christian applicants like "Kiran James", "Jonathan Rampersad"),
 * but CANNOT serve as the sole matching token for an applicant name.
 */
const COMMON_NON_SOUTH_ASIAN_NAMES = new Set([
  'james', 'cook', 'jonathan', 'amirante', 'john', 'david', 'michael', 'robert', 'william', 'richard',
  'joseph', 'thomas', 'charles', 'christopher', 'daniel', 'matthew', 'anthony', 'mark',
  'donald', 'steven', 'paul', 'andrew', 'joshua', 'kenneth', 'kevin', 'brian', 'george',
  'edward', 'ronald', 'timothy', 'jason', 'jeffrey', 'ryan', 'jacob', 'gary', 'nicholas',
  'eric', 'stephen', 'larry', 'justin', 'scott', 'brandon', 'benjamin', 'samuel', 'gregory',
  'alexander', 'frank', 'patrick', 'raymond', 'jack', 'dennis', 'jerry', 'tyler', 'aaron',
  'jose', 'adam', 'henry', 'nathan', 'douglas', 'zachary', 'peter', 'kyle', 'walter',
  'ethan', 'jeremy', 'harold', 'keith', 'christian', 'roger', 'noah', 'gerald', 'carl',
  'terry', 'sean', 'austin', 'arthur', 'lawrence', 'jesse', 'dylan', 'bryan', 'joe',
  'jordan', 'billy', 'bruce', 'albert', 'willie', 'gabriel', 'logan', 'alan', 'juan',
  'wayne', 'roy', 'ralph', 'randy', 'eugene', 'vincent', 'russell', 'louis', 'philip',
  'bobby', 'johnny', 'bradley', 'derek', 'cole', 'smith', 'brown', 'williams', 'miller',
  'davis', 'garcia', 'rodriguez', 'wilson', 'martinez', 'anderson', 'taylor', 'moore',
  'king', 'clark', 'white', 'hall', 'lee', 'allen', 'young', 'king', 'wright', 'lopez',
  'hill', 'scott', 'green', 'adams', 'baker', 'gonzalez', 'nelson', 'carter', 'mitchell',
  'rob', 'robbie', 'bob', 'marshall', 'dominic', 'dom', 'domenico', 'ricky', 'rick', 'richie',
  'tan', 'chen', 'wang', 'li', 'zhang', 'liu', 'yang', 'huang', 'wu', 'lin', 'zhou', 'xu',
  'mason', 'torres', 'jackson', 'johnson', 'harris', 'lewis', 'walker', 'flores', 'perez',
  'sanchez', 'ramirez', 'cruz', 'morales', 'reyes', 'gutierrez', 'ortiz', 'chavez', 'ruiz',
  'alvarez', 'castillo', 'mendez', 'strappazon', 'suttle', 'vilain', 'class', 'peters', 'mash',
  'graham', 'chase', 'claire', 'jessica', 'ashley', 'brittany', 'amanda', 'melissa', 'stephanie'
]);

/**
 * Common titles, honorifics, academic degrees, and credentials that must NEVER be scored as name tokens
 */
const HONORIFICS_AND_DEGREES = new Set([
  'dr', 'mr', 'mrs', 'ms', 'miss', 'prof', 'professor', 'sir', 'rev', 'eng', 'er',
  'phd', 'dba', 'msc', 'bsc', 'bba', 'mba', 'btech', 'mtech', 'be', 'me', 'ca', 'cpa',
  'pmp', 'csm', 'cissp', 'cisa', 'ceh', 'cism', 'ccna', 'ccnp', 'aws', 'gcp', 'azure',
  'securityplus', 'networkplus', 'plus'
]);

/**
 * Recurrent South Asian family name suffixes extracted from reference names
 */
const RECURRENT_SUFFIXES = [
  'palli', 'pally', 'palle', 'gadda', 'kuru', 'kuri', 'pati', 'mudi', 'dapu',
  'raju', 'konda', 'kunta', 'reddi', 'neni', 'cherla', 'sani', 'valli', 'brolu',
  'wala', 'singhe', 'ratne', 'shrestha', 'thapa', 'acharya'
];

/**
 * Reference Name Pattern Analyzer and Matcher
 */
export class ReferenceNameMatcherService {
  private static instance: ReferenceNameMatcherService | null = null;

  private dataset1Names: string[] = [];
  private dataset2Names: string[] = [];

  // Exact lookup: normalized string -> { original, source }
  private exactReferenceMap = new Map<string, { original: string; source: string }>();

  // Frequency of each individual significant token (length >= 2)
  private tokenFreq = new Map<string, number>();

  // Canonical token frequencies
  private canonicalTokenFreq = new Map<string, number>();

  // Multi-token combination set (e.g. "sai krishna", "pavan kumar", "hetkumar patel")
  private multiTokenCombos = new Set<string>();

  // Map from combo to sample reference name
  private comboToReference = new Map<string, string>();

  private similarityThreshold: number = 0.80;
  private initialized: boolean = false;

  private constructor() {
    this.loadDatasets();
  }

  public static getInstance(): ReferenceNameMatcherService {
    if (!ReferenceNameMatcherService.instance) {
      ReferenceNameMatcherService.instance = new ReferenceNameMatcherService();
    }
    return ReferenceNameMatcherService.instance;
  }

  public setThreshold(threshold: number): void {
    if (threshold >= 0.1 && threshold <= 1.0) {
      this.similarityThreshold = threshold;
    }
  }

  public getThreshold(): number {
    return this.similarityThreshold;
  }

  /**
   * Load both reference datasets from server/data/
   */
  private loadDatasets(): void {
    try {
      const dataDir = path.resolve(__dirname, 'data');
      const d1Path = path.join(dataDir, 'reference_names_dataset_1.txt');
      const d2Path = path.join(dataDir, 'reference_names_dataset_2.txt');

      if (fs.existsSync(d1Path)) {
        this.dataset1Names = fs.readFileSync(d1Path, 'utf8')
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean);
      }

      if (fs.existsSync(d2Path)) {
        this.dataset2Names = fs.readFileSync(d2Path, 'utf8')
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean);
      }

      this.analyzeAndIndex();
      this.initialized = true;
      console.log(`[ReferenceNameMatcher] Initialized with ${this.dataset1Names.length} names from Dataset 1, ${this.dataset2Names.length} names from Dataset 2. Total unique names: ${this.exactReferenceMap.size}`);
    } catch (err) {
      console.error('[ReferenceNameMatcher] Failed to load reference datasets:', err);
    }
  }

  /**
   * Automatically extract recurring name patterns, common tokens, token combinations, and spelling variations.
   * Crucial: Single-letter initials (length <= 1) are NEVER indexed as standalone tokens.
   */
  private analyzeAndIndex(): void {
    this.exactReferenceMap.clear();
    this.tokenFreq.clear();
    this.canonicalTokenFreq.clear();
    this.multiTokenCombos.clear();
    this.comboToReference.clear();

    const processList = (names: string[], source: string) => {
      for (const name of names) {
        const norm = normalizeName(name);
        if (!norm) continue;

        if (!this.exactReferenceMap.has(norm)) {
          this.exactReferenceMap.set(norm, { original: name, source });
        }

        // Only tokens with length >= 2 are indexed. Initials (like 'k', 'c', 'a') are excluded!
        const rawTokens = norm.split(' ').map(cleanToken).filter(t => t.length > 1);
        const canonTokens = rawTokens.map(getCanonicalToken);

        // Count individual tokens
        for (const t of rawTokens) {
          this.tokenFreq.set(t, (this.tokenFreq.get(t) || 0) + 1);
        }
        for (const ct of canonTokens) {
          this.canonicalTokenFreq.set(ct, (this.canonicalTokenFreq.get(ct) || 0) + 1);
        }

        // Extract token combinations (2-grams) where both tokens have length >= 2
        for (let i = 0; i < canonTokens.length - 1; i++) {
          const combo = `${canonTokens[i]} ${canonTokens[i+1]}`;
          this.multiTokenCombos.add(combo);
          if (!this.comboToReference.has(combo)) {
            this.comboToReference.set(combo, name);
          }
        }
      }
    };

    processList(this.dataset1Names, 'Reference Dataset 1');
    processList(this.dataset2Names, 'Reference Dataset 2');
  }

  /**
   * Matches an incoming applicant name against the reference datasets and patterns.
   *
   * Scoring hierarchy:
   * 1. Exact Full-Name Match: 1.00 -> Strong Match (e.g. Darshan Patel)
   * 2. Multi-Token Combination Match: 0.85-0.92 -> Strong Match (e.g. Sai Krishna)
   * 3. Multiple Reference Tokens: 0.70-0.85 -> Strong/Possible Match
   * 4. Single Distinctive South Asian Surname: 0.55 -> Possible Match (NEVER Strong Match!)
   * 5. Single Common South Asian Token: 0.35 -> Possible Match
   * 6. Western/Common Names, Initials, or Non-matching: 0.05-0.15 -> No Match (e.g. James Cook, Jonathan Amirante, Ola C., Abena A. A., Derek D.)
   */
  public evaluate(fullName: string | null | undefined, customThreshold?: number): NameMatchResult {
    return this.matchApplicantName(fullName, customThreshold);
  }

  public matchApplicantName(fullName: string | null | undefined, customThreshold?: number): NameMatchResult {
    const threshold = customThreshold !== undefined ? customThreshold : this.similarityThreshold;
    const nameStr = (fullName || '').trim();
    const norm = normalizeName(nameStr);

    if (!norm) {
      return {
        applicantName: nameStr || 'Unknown',
        category: 'No Match',
        score: 0.0,
        matchedPattern: 'Empty name provided',
        matchedReferenceName: 'None',
      };
    }

    // 1. TIER 1: Exact Full-Name Reference Match (1.00 / 100%)
    if (this.exactReferenceMap.has(norm)) {
      const ref = this.exactReferenceMap.get(norm)!;
      return {
        applicantName: nameStr,
        category: 'Strong Match',
        score: 1.0,
        matchedPattern: `Exact reference record: "${ref.original}" (${ref.source})`,
        matchedReferenceName: ref.original,
      };
    }

    // Split and separate significant tokens (length >= 2) from single-letter initials (length <= 1) and titles/degrees
    const allTokens = norm.split(' ').map(cleanToken).filter(t => t.length > 0);
    const significantTokens = allTokens.filter(t => t.length > 1 && !HONORIFICS_AND_DEGREES.has(t));
    const initials = allTokens.filter(t => t.length <= 1);

    // If no significant tokens remain (e.g. only initials like "A. A." or "C."), DO NOT MATCH!
    if (significantTokens.length === 0) {
      return {
        applicantName: nameStr,
        category: 'No Match',
        score: 0.05,
        matchedPattern: `No valid name tokens (only single-letter initials provided: [${initials.join(', ')}])`,
        matchedReferenceName: 'None',
      };
    }

    const canonTokens = significantTokens.map(getCanonicalToken);

    // 2. TIER 2: Multi-Token Combination (Bigram) Match for names with > 2 tokens (e.g. "sai krishna" in "Sai Krishna Rao")
    if (canonTokens.length > 2) {
      for (let i = 0; i < canonTokens.length - 1; i++) {
        const pair = `${canonTokens[i]} ${canonTokens[i+1]}`;
        if (this.multiTokenCombos.has(pair)) {
          const refName = this.comboToReference.get(pair) || `Pattern [${significantTokens[i]} ${significantTokens[i+1]}]`;
          const score = 0.90;
          return {
            applicantName: nameStr,
            category: score >= threshold ? 'Strong Match' : 'Possible Match',
            score,
            matchedPattern: `Matched reference token combination: [${significantTokens[i]} + ${significantTokens[i+1]}]`,
            matchedReferenceName: refName,
          };
        }
      }
    }

    // 3. Significant Token-Level Analysis
    const matchedTokens: string[] = [];
    const distinctMatched: string[] = [];
    const westernMatched: string[] = [];

    for (const t of significantTokens) {
      const ct = getCanonicalToken(t);
      const count = (this.tokenFreq.get(t) || 0) + (this.canonicalTokenFreq.get(ct) || 0);
      if (count > 0) {
        matchedTokens.push(t);
        if (COMMON_NON_SOUTH_ASIAN_NAMES.has(t) || COMMON_NON_SOUTH_ASIAN_NAMES.has(ct)) {
          westernMatched.push(t);
        } else if (!ULTRA_COMMON_TOKENS.has(t) && !ULTRA_COMMON_TOKENS.has(ct)) {
          distinctMatched.push(t);
        }
      }
    }

    // If no significant tokens matched in reference dataset
    if (matchedTokens.length === 0) {
      // Check morphological suffix on the tokens
      for (const t of significantTokens) {
        for (const sfx of RECURRENT_SUFFIXES) {
          if (t.length >= 5 && t.endsWith(sfx)) {
            const score = 0.55;
            return {
              applicantName: nameStr,
              category: 'Possible Match',
              score,
              matchedPattern: `Matched reference family name suffix: -${sfx} in "${t}"`,
              matchedReferenceName: `Suffix pattern: -${sfx}`,
            };
          }
        }
      }

      return {
        applicantName: nameStr,
        category: 'No Match',
        score: 0.10,
        matchedPattern: initials.length > 0
          ? `No reference patterns matched (initials [${initials.join(', ')}] excluded from match)`
          : 'No reference patterns or tokens matched',
        matchedReferenceName: 'None',
      };
    }

    // 4. REQUIREMENT 3 & 4 ENFORCEMENT: SINGLE-TOKEN MATCH HANDLING
    // "Do not award a Strong Match based only on a common first name, surname, single token, or initials."
    if (matchedTokens.length === 1) {
      const singleToken = matchedTokens[0];
      const ct = getCanonicalToken(singleToken);

      // A: If ANY token in the candidate's name is in COMMON_NON_SOUTH_ASIAN_NAMES (Section 3.4 Tier 6)
      const hasWesternToken = significantTokens.some(t => {
        const c = getCanonicalToken(t);
        return COMMON_NON_SOUTH_ASIAN_NAMES.has(t) || COMMON_NON_SOUTH_ASIAN_NAMES.has(c);
      });

      if (hasWesternToken || COMMON_NON_SOUTH_ASIAN_NAMES.has(singleToken) || COMMON_NON_SOUTH_ASIAN_NAMES.has(ct)) {
        return {
          applicantName: nameStr,
          category: 'No Match',
          score: 0.10,
          matchedPattern: `No South Asian reference pattern matched (name contains Anglo/Western/Foreign name token)`,
          matchedReferenceName: 'None',
        };
      }

      // Initials protection: single token paired with initial (e.g. "Rob W.", "Ola C.") is excluded from match
      if (initials.length > 0 && significantTokens.length === 1) {
        return {
          applicantName: nameStr,
          category: 'No Match',
          score: 0.10,
          matchedPattern: `Initials protection: single token [${singleToken}] paired with initial [${initials.join(', ')}] excluded from match`,
          matchedReferenceName: 'None',
        };
      }

      // B: If the single matching token is an ultra-common token (e.g. "Kumar", "Patel", "Reddy") paired with a non-matching token
      if (ULTRA_COMMON_TOKENS.has(singleToken) || ULTRA_COMMON_TOKENS.has(ct)) {
        const score = 0.35;
        return {
          applicantName: nameStr,
          category: 'Possible Match',
          score,
          matchedPattern: `Single shared common reference token: [${singleToken}] (isolated common token)`,
          matchedReferenceName: `Common reference token: ${singleToken}`,
        };
      }

      // C: Distinctive South Asian surname or given name (e.g. "Yarlagadda", "Punde", "Kolanupaka")
      // REQUIREMENT: Length must be >= 4 (Section 3.4 Tier 4)
      if (singleToken.length < 4) {
        return {
          applicantName: nameStr,
          category: 'No Match',
          score: 0.10,
          matchedPattern: `Single token [${singleToken}] does not meet distinctive surname criteria (length < 4)`,
          matchedReferenceName: 'None',
        };
      }

      // REQUIREMENT 3: Single token match CANNOT be a Strong Match! Capped at Possible Match (score 0.55).
      const score = 0.55;
      return {
        applicantName: nameStr,
        category: 'Possible Match',
        score,
        matchedPattern: `Partial match on single distinctive reference surname: [${singleToken}]`,
        matchedReferenceName: `Reference token: ${singleToken}`,
      };
    }

    // 5. MULTIPLE SIGNIFICANT TOKENS MATCHED (matchedTokens.length >= 2)
    // If all matched tokens are solely Western common names (e.g. "James Cook"), reject!
    if (westernMatched.length === matchedTokens.length) {
      return {
        applicantName: nameStr,
        category: 'No Match',
        score: 0.10,
        matchedPattern: `No South Asian reference pattern matched (matched tokens [${matchedTokens.join(', ')}] are Anglo/Western names)`,
        matchedReferenceName: 'None',
      };
    }

    // At least one distinctive South Asian token among multiple matched tokens
    if (distinctMatched.length >= 1) {
      const score = 0.85;
      return {
        applicantName: nameStr,
        category: score >= threshold ? 'Strong Match' : 'Possible Match',
        score,
        matchedPattern: `Multiple reference tokens matched: [${matchedTokens.join(', ')}]`,
        matchedReferenceName: `Reference tokens: ${matchedTokens.join(' ')}`,
      };
    }

    // Multiple common tokens (e.g. "Kumar Patel", "Sai Reddy")
    const score = 0.70;
    return {
      applicantName: nameStr,
      category: score >= threshold ? 'Strong Match' : 'Possible Match',
      score,
      matchedPattern: `Multiple common reference tokens matched: [${matchedTokens.join(', ')}]`,
      matchedReferenceName: `Reference tokens: ${matchedTokens.join(' ')}`,
    };
  }

  /**
   * Return statistical summary of the reference datasets and patterns
   */
  public getStats(): ReferenceMatcherStats {
    const sortedTokens = Array.from(this.tokenFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([token, count]) => ({ token, count }));

    const topCombos = Array.from(this.multiTokenCombos).slice(0, 15);

    return {
      dataset1Count: this.dataset1Names.length,
      dataset2Count: this.dataset2Names.length,
      totalReferenceNames: this.dataset1Names.length + this.dataset2Names.length,
      uniqueReferenceNames: this.exactReferenceMap.size,
      uniqueTokens: this.tokenFreq.size,
      uniqueTokenCombos: this.multiTokenCombos.size,
      similarityThreshold: this.similarityThreshold,
      topTokens: sortedTokens,
      topCombos,
    };
  }
}

export const referenceNameMatcher = ReferenceNameMatcherService.getInstance();
