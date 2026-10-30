# 05. Core Business Logic & Algorithmic Specifications

**Document**: Algorithmic Auditing & Decision Logic  
**Audit Target**: `linkedin-application-filter`  
**Core Modules**:
- [src/shared/screeningEngine.ts](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/screeningEngine.ts) (Visa & Legal Rules)
- [src/shared/southAsianOriginClassifier.ts](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/southAsianOriginClassifier.ts) (Linguistic Regional Origin)
- [server/referenceNameMatcher.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/referenceNameMatcher.ts) (13,859 Reference Matcher)
- [src/shared/genderClassifier.ts](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/genderClassifier.ts) (Rule-Based Gender Classifier)
- [src/shared/columnMapper.ts](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/columnMapper.ts) (Job Role Normalization)
- [server/db.ts](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts) (Deduplication Algorithm)

---

## 1. Legal Work Authorization Screening Engine

### 1.1 Source & Function
- **File**: [src/shared/screeningEngine.ts:222](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/screeningEngine.ts#L222)
- **Function**: `evaluateScreening(rawText, activeRules?, originContext?)`
- **Helper Functions**: `parseScreeningQuestionsText`, `normalizeAnswer`, `isGreenCardQuestion`, `isFutureSponsorshipQuestion`, `isWorkAuthQuestion`.

### 1.2 Input Normalization
- **Raw Answer Normalization** (`normalizeAnswer`):
  - Affirmatives: `'yes'`, `'y'`, `'true'`, `'1'`, `/^yes\b/i` $\rightarrow$ **`YES`**
  - Negatives: `'no'`, `'n'`, `'false'`, `'0'`, `/^no\b/i`, `"i do not require"`, `"will not require"`, `"not needed"`, `"no sponsorship"` $\rightarrow$ **`NO`**
  - Blank / Nil: `''`, `'n/a'`, `'na'`, `'null'`, `'undefined'`, `null`, `undefined` $\rightarrow$ **`MISSING`**
  - All other unresolved text $\rightarrow$ **`UNCLEAR`**
- **Question Matching Tolerances**:
  - Punctuation removed, spaces collapsed (`normalizeQuestion`).
  - Matches variations: `"Do You Have a Green Card or US Citizen ?"`, `"GREEN CARD/ US-C"`, `"GC/USC"`, `"CITIZENSHIP"`, etc.
  - Matches variations: `"Will you now, or in the future, require sponsorship for employment visa status (e.g. H-1B visa status)?"`, `"H1B-Y/N"`, `"VISA SPONSORSHIP"`, etc.

### 1.3 Decision Matrix & Precedence

| Green Card Answer | Future Sponsorship Answer | Origin Rule (`SOUTH_ASIAN_ORIGIN`) | Final Automated Decision | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **`YES`** | **`NO`** | Verified South Asian | **`PASS`** | Both mandatory visa conditions met; regional origin verified. |
| **`YES`** | **`NO`** | Non-South Asian or Uncertain | **`MANUAL REVIEW`** | Visa passed, but origin not definitively identified; sent for human recruiter review. |
| **`NO`** | Any (`YES`, `NO`, `MISSING`) | Any | **`FAIL`** | Failed mandatory Green Card / Citizenship requirement. |
| Any (`YES`, `NO`, `MISSING`) | **`YES`** | Any | **`FAIL`** | Failed mandatory Future Sponsorship requirement (requires visa). |
| **`MISSING`** / **`UNCLEAR`** | **`NO`** | Any | **`MANUAL REVIEW`** | Incomplete screening answer; cannot auto-pass. |
| **`YES`** | **`MISSING`** / **`UNCLEAR`** | Any | **`MANUAL REVIEW`** | Incomplete screening answer; cannot auto-pass. |
| **`MISSING`** | **`MISSING`** | Any | **`MANUAL REVIEW`** | Both screening answers missing. |

### 1.4 Non-Negotiable Core Constraint
**A candidate with `MISSING` or `UNCLEAR` answers can NEVER receive an automated `PASS`.** They are strictly routed to `MANUAL REVIEW`.

---

## 2. South Asian Linguistic Origin Classifier

### 2.1 Source & Function
- **File**: [src/shared/southAsianOriginClassifier.ts:400](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/southAsianOriginClassifier.ts#L400)
- **Function**: `classifySouthAsianOrigin(fullName, firstName, lastName, headline, educationInstitution, location)`
- **Output**: `OriginResult` `{ origin: 'SOUTH_ASIAN' | 'UNCERTAIN' | 'OTHER', countryMatch?: string, confidence: number, matchReason: string, isSouthAsian: boolean }`

### 2.2 Regional Lexicon Coverage
The classifier evaluates against 2,500+ curated terms across 5 countries:
1. **India**:
   - North / Hindi Belt: Sharma, Verma, Gupta, Singh, Kumar, Mishra, Pandey, Shukla, Tiwari, Dubey, Agarwal, Mittal, etc.
   - Punjabi / Sikh: Gill, Dhillon, Sandhu, Grewal, Sidhu, Mann, Bajwa, Cheema, Brar, Deol, Virk, etc.
   - Telugu (Andhra & Telangana): Reddy, Rao, Chowdary, Naidu, Varma, Raju, Goud, Murthy, Sastry, Prasad, Punde, Yarlagadda, Kilaru, etc.
   - Tamil: Iyer, Iyengar, Pillai, Subramanian, Balasubramanian, Natarajan, Swaminathan, Meenakshisundaram, etc.
   - Malayalam: Menon, Kurup, Panicker, Warrier, Nambiar, Varghese, Chacko, Kurian, etc.
   - Kannada: Gowda, Hegde, Bhat, Shetty, Desai, Kulkarni, Kamath, Pai, Nayak, etc.
   - Marathi & Goan: Deshmukh, Shinde, Patil, Pawar, Jadhav, More, Gaikwad, Chavan, Bhosle, Joshi, etc.
   - Gujarati / Marwari / Sindhi: Patel, Shah, Mehta, Parikh, Modi, Gandhi, Bhatt, Trivedi, Pandya, Vyas, etc.
   - Bengali: Das, Roy, Ray, Dey, Deb, Saha, Barman, Kundu, Nandi, Banerjee, Chatterjee, Mukherjee, Ghosh, etc.
   - Odia & Assamese: Mohanty, Patnaik, Dash, Sahoo, Panda, Rout, Pradhan, Barua, Saikia, Bora, etc.
2. **Pakistan**: Butt, Chaudhry, Chughtai, Durrani, Farooqi, Gillani, Hashmi, Hayat, Iqbal, Janjua, Jatoi, Qureshi, Abbasi, etc.
3. **Bangladesh**: Hossain, Rahman, Chowdhury, Arafat, Mazumder, Sikder, Bhuiyan, Khandakar, etc.
4. **Nepal**: Shrestha, Acharya, Maharjan, Thapa, Gurung, Rai, Magar, Tamang, Basnet, etc.
5. **Sri Lanka**: Morphological suffixes (`-singhe`, `-ratne`, `-dissanayake`, `-arachchi`, `-lingam`, `-rajah`).

### 2.3 Strict False-Positive Suppression
- **European Prepositions**: The word `"de"` was explicitly purged from Indian surnames to prevent false positive matches on Hispanic/Portuguese names (*Elisandra De La Cruz*).
- **Cybersecurity Words**: The token `"nist"` was removed from South Asian institution acronyms so candidates citing NIST 800-53 security standards are not flagged as Indian.
- **Sri Lankan Suffix Exclusion**: Suffix `-nathan` was calibrated to exclude the Anglo-Hebrew name *Jonathan*.
- **Common English Given Names**: Given name `'james'` was removed from South Asian first names to avoid false positive matches on *James Cook*.

---

## 3. 13,859-Record Reference Name Pattern Matcher

### 3.1 Source & Function
- **File**: [server/referenceNameMatcher.ts:271](file:///c:/Users/yarla/linkedin%20application%20filter/server/referenceNameMatcher.ts#L271)
- **Function**: `referenceNameMatcher.matchApplicantName(fullName, customThreshold?)`
- **Output**: `NameMatchResult` `{ applicantName, category, score, matchedPattern, matchedReferenceName }`

### 3.2 5-Tier Scoring Hierarchy & Scoring Boundaries

| Tier | Category | Score Range | Scoring Rule & Qualification Criteria | Example |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | **Strong Match** | **1.00 (100%)** | Full normalized candidate name matches an exact record in Reference Dataset 1 or 2. | `Darshan Patel` |
| **Tier 2** | **Strong Match** | **0.90 (90%)** | Consecutive multi-letter tokens (length $\ge 2$) form a recognized 2-gram reference combination. | `Sai Krishna`, `Hetkumar Patel` |
| **Tier 3** | **Strong Match** | **0.85 (85%)** | Multiple distinct South Asian tokens match reference records (at least one distinctive token). | `Kiran Reddy` |
| **Tier 4** | **Possible Match** | **0.55 (55%)** | Single distinctive South Asian surname (length $\ge 4$). **Strictly capped at Possible Match; CANNOT receive Strong Match.** | `Yarlagadda`, `Punde` |
| **Tier 5** | **Possible Match** | **0.35 (35%)** | Single ultra-common South Asian token (e.g. `Kumar`, `Singh`, `Patel`). | `John Kumar` |
| **Tier 6** | **No Match** | **0.05 – 0.10** | No reference match, single-letter initials (`Ola C.`, `Derek D.`), or Western common names (`James Cook`, `Jonathan Amirante`). | `James Cook`, `Ola C.` |

### 3.3 Negative Western Dictionary Suppression
`COMMON_NON_SOUTH_ASIAN_NAMES` contains 150+ common Anglo/Western names (`james`, `cook`, `jonathan`, `amirante`, `derek`, `smith`, `john`, `david`, etc.). If a candidate's only matching tokens are in this dictionary, the score is capped at `0.10` (`No Match`).

### 3.4 Single-Letter Initials Blocking
Tokens of length $\le 1$ (e.g. `"C."`, `"D."`, `"A."`) are strictly excluded from token frequency indexing and combo matching. A name like `Ola C.` has only one significant token (`ola`), which does not match the South Asian reference dataset $\rightarrow$ `score: 0.10, category: 'No Match'`.

---

## 4. Candidate Deduplication Engine

### 4.1 Source & Function
- **File**: [server/db.ts:1687](file:///c:/Users/yarla/linkedin%20application%20filter/server/db.ts#L1687)
- **Function**: `dbService.deduplicateApplicants(scope: 'PASS' | 'ALL')`

### 4.2 Grouping & Quality Selection Logic
1. **Grouping Key Formulation**:
   - Primary: `email.trim().toLowerCase()`
   - Fallback (if email missing): `clean(full_name) + "_" + digits(phone).slice(-10)`
2. **Quality Priority Sorting**:
   - `effective_result === 'PASS'` ranked first.
   - Complete contact info (email + phone + location) ranked second.
   - `created_at DESC` (most recent record) ranked third.
3. **Execution**:
   - Retains index `0` (the highest-ranked candidate record).
   - Deletes indexes `1..N` in a single SQLite transaction.
   - Purges orphan audit logs.
   - Recalculates batch statistics in `imports`.

---

## 5. Job Role Normalization Engine

### 5.1 Source & Function
- **File**: [src/shared/columnMapper.ts:465](file:///c:/Users/yarla/linkedin%20application%20filter/src/shared/columnMapper.ts#L465)
- **Function**: `normalizeJobRole(rawRole, fallbackContext?)`

### 5.2 Mapping Rules Table

| Target Code | Normalized Role Name | Matching Substrings & Patterns |
| :--- | :--- | :--- |
| **`DA`** | Data Analyst | `data analyst`, `bi analyst`, `business intelligence analyst`, `tableau developer`, `power bi analyst` |
| **`DE`** | Data Engineer | `data engineer`, `etl developer`, `big data engineer`, `databricks engineer`, `snowflake developer` |
| **`BA`** | Business Analyst | `business analyst`, `technical business analyst`, `systems analyst`, `product analyst`, `business systems analyst` |
| **`DS`** | Data Scientist | `data scientist`, `machine learning engineer`, `ai engineer`, `nlp engineer`, `deep learning engineer` |
| **`AWS`** | Cloud / AWS Engineer | `aws`, `cloud engineer`, `cloud architect`, `devops engineer`, `site reliability engineer`, `sre` |
| **`Cybersecurity`** | Information Security | `cybersecurity`, `security analyst`, `information security`, `soc analyst`, `penetration tester` |
| **`QA`** | Quality Assurance | `qa engineer`, `quality assurance`, `test automation engineer`, `software tester`, `sdet` |
| **Raw Title** | Other Roles | If no pattern matches, returns the cleaned original title string. |

---

## 6. Rule Precedence Summary

```
[Raw Candidate Data]
         │
         ▼
[Mandatory Visa Rule GC-1 & SP-2]
         ├── Violations (GC=NO or Sponsorship=YES) ──> DETERMINISTIC FAIL (End)
         │
         ├── Missing / Unclear Answers ──────────────> MANUAL REVIEW (End)
         │
         └── Both Passed (GC=YES & Spon=NO)
                  │
                  ▼
         [South Asian Origin & Reference Name Matcher]
                  ├── South Asian Origin Verified ──> PASS (Automated)
                  │
                  └── Uncertain / Western / Initials ─> MANUAL REVIEW (Recruiter Check)
```
