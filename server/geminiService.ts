/**
 * Gemini AI Integration for Origin & Gender Classification
 * Uses Google AI Studio Gemini API (100% Free Tier: 15 RPM / 1M TPM / 1500 RPD)
 * Models: gemini-2.5-flash (primary), gemini-3.5-flash-lite, gemini-flash-latest
 */

export interface GeminiApplicantInput {
  id: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  educationInstitution?: string;
  location?: string;
}

export interface GeminiClassificationResult {
  id: string;
  isSouthAsian: boolean;
  originRegion: 'SOUTH_ASIAN' | 'OTHER';
  originCountry: string; // 'India' | 'Pakistan' | 'Bangladesh' | 'Nepal' | 'Sri Lanka' | other
  gender: 'MALE' | 'FEMALE' | 'UNSPECIFIED';
  genderConfidence: number; // 0.0 - 1.0
  confidence: number; // 0.0 - 1.0
  reason: string;
}

const CANDIDATE_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
];

/**
 * Fetch wrapper with automatic retry on 503 (high demand) and 429 (rate limit)
 */
async function callGeminiWithRetry(url: string, bodyObj: any, maxRetries = 3): Promise<Response> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyObj),
      });

      if (resp.status === 503 || resp.status === 429) {
        attempt++;
        const delay = 1500 * Math.pow(1.5, attempt);
        console.warn(`[Gemini API] Got ${resp.status}, retrying in ${Math.round(delay)}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      return resp;
    } catch (e: any) {
      attempt++;
      if (attempt >= maxRetries) throw e;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyObj),
  });
}

/**
 * Validates a Gemini API Key with a lightweight ping
 */
export async function validateGeminiApiKey(apiKey: string): Promise<{ valid: boolean; model?: string; error?: string }> {
  const trimmed = (apiKey || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'API key is required' };
  }

  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${trimmed}`;
      const resp = await callGeminiWithRetry(url, {
        contents: [{ parts: [{ text: 'Respond with JSON: {"status":"ok"}' }] }],
        generationConfig: { responseMimeType: 'application/json' },
      });

      if (resp.ok) {
        return { valid: true, model };
      }

      const errText = await resp.text();
      if (resp.status === 400 || resp.status === 403) {
        return { valid: false, error: `Invalid Gemini API Key or permissions issue: ${resp.status} ${errText.slice(0, 150)}` };
      }
    } catch (err: any) {
      // Try next model
    }
  }

  return { valid: false, error: 'Unable to reach Gemini API endpoint. Check internet connection and API key.' };
}

/**
 * Classifies a batch of applicants in chunks of up to 25 items
 */
export async function classifyApplicantsWithGemini(
  applicants: GeminiApplicantInput[],
  apiKey: string,
  onBatchProgress?: (processed: number, total: number) => void
): Promise<GeminiClassificationResult[]> {
  const trimmedKey = (apiKey || '').trim();
  if (!trimmedKey) {
    throw new Error('Gemini API key is required');
  }

  const results: GeminiClassificationResult[] = [];
  const BATCH_SIZE = 20;
  const total = applicants.length;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = applicants.slice(i, i + BATCH_SIZE);
    const chunkResults = await processSingleBatch(chunk, trimmedKey);
    results.push(...chunkResults);

    if (onBatchProgress) {
      onBatchProgress(Math.min(i + chunk.length, total), total);
    }

    // Delay between batches to respect free tier rate limits (15 RPM)
    if (i + BATCH_SIZE < total) {
      await new Promise(res => setTimeout(res, 1500));
    }
  }

  return results;
}

async function processSingleBatch(
  chunk: GeminiApplicantInput[],
  apiKey: string
): Promise<GeminiClassificationResult[]> {
  const prompt = `You are an expert South Asian onomastic, linguistic, and cultural researcher specializing in demographic and candidate profile analysis.
Analyze the following candidate profiles and classify:
1. South Asian Origin: Does the candidate originate from South Asia (specifically: India, Pakistan, Bangladesh, Nepal, or Sri Lanka) based on their first name, family name/lineage, educational institution, headline, or location?
   - isSouthAsian: true ONLY if the candidate's name or background belongs to India, Pakistan, Bangladesh, Nepal, or Sri Lanka.
   - isSouthAsian: false if Western, European, Hispanic/Latin, African, East Asian (Chinese, Japanese, Korean), Middle Eastern/Arab, Central Asian, etc.
   - originCountry: Specific country name ("India", "Pakistan", "Bangladesh", "Nepal", "Sri Lanka", or identified country/region if other, e.g. "Nigeria", "China", "United States", "Mexico", etc.).
   - originRegion: "SOUTH_ASIAN" or "OTHER".
2. Gender:
   - gender: "MALE" | "FEMALE" | "UNSPECIFIED" based on their first name and cultural naming conventions.
   - genderConfidence: number between 0.0 and 1.0.
3. Reason:
   - reason: A concise explanation (e.g. "Siva Mutukuri: Siva is a South Indian male name, Mutukuri is a Telugu surname").

Return a valid JSON array of objects with EXACTLY this structure for all ${chunk.length} items:
[
  {
    "id": "applicant_id",
    "isSouthAsian": true/false,
    "originRegion": "SOUTH_ASIAN" or "OTHER",
    "originCountry": "India",
    "gender": "MALE" or "FEMALE" or "UNSPECIFIED",
    "genderConfidence": 0.95,
    "confidence": 0.95,
    "reason": "Brief explanation"
  }
]

Candidate list to evaluate:
${JSON.stringify(chunk.map(c => ({
  id: c.id,
  fullName: c.fullName,
  firstName: c.firstName || '',
  lastName: c.lastName || '',
  headline: c.headline || '',
  educationInstitution: c.educationInstitution || '',
  location: c.location || '',
})), null, 2)}`;

  let lastError: any = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const resp = await callGeminiWithRetry(url, {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Gemini API error ${resp.status}: ${errText.slice(0, 200)}`);
      }

      const data = await resp.json() as any;
      let rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      rawText = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(rawText);

      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => ({
          id: String(item.id),
          isSouthAsian: Boolean(item.isSouthAsian),
          originRegion: item.isSouthAsian ? 'SOUTH_ASIAN' : 'OTHER',
          originCountry: item.originCountry || (item.isSouthAsian ? 'South Asia' : 'Other'),
          gender: ['MALE', 'FEMALE', 'UNSPECIFIED'].includes(item.gender) ? item.gender : 'UNSPECIFIED',
          genderConfidence: typeof item.genderConfidence === 'number' ? item.genderConfidence : 0.8,
          confidence: typeof item.confidence === 'number' ? item.confidence : 0.9,
          reason: String(item.reason || 'AI Evaluated'),
        }));
      }
    } catch (err: any) {
      lastError = err;
      // Try next model
    }
  }

  console.error('[Gemini Service] Batch processing error:', lastError?.message || lastError);
  return chunk.map(c => ({
    id: c.id,
    isSouthAsian: false,
    originRegion: 'OTHER',
    originCountry: 'Unknown',
    gender: 'UNSPECIFIED',
    genderConfidence: 0,
    confidence: 0,
    reason: `AI classification failed: ${lastError?.message || 'Network error'}`,
  }));
}
