// Unified Database Service Layer for AaraTech & ClinisolTech Master Candidate Database
// Connects to live Supabase PostgreSQL tables + Native IndexedDB Permanent Local Database
// Guaranteed permanent storage (No 5MB LocalStorage limits, no data loss on refresh or browser close)

import { getSupabaseClient } from './supabase';
import { indexedDBService } from './indexedDb';
import { api } from '../api/client';
import { generateUuid } from '../shared/uuid';
import {
  Person,
  PersonEmail,
  PersonPhone,
  Application,
  RecruiterContact,
  Job,
  ImportRecord,
  PossibleMatch,
  PersonStatusHistory,
  AuditLog,
  MergeHistory,
  Gender,
  IncompleteRecord,
  IncompleteReason,
  CompanyName,
  CandidateStatus,
} from '../types/masterDatabase';
import { normalizeEmail, normalizePhone, formatPureDigitsPhone, parseAndNormalizeName, isPhoneNumber, extractCandidateNameFromEmail, cleanJobTitle } from '../shared/normalization';
import { detectGender } from '../shared/genderDetection';
import { geminiService } from './masterGeminiService';
import { isRoleOrTech, extractCleanPhone, extractCandidateName, isValidCandidateName, isLocationOrCountry, isHeaderOrLabelWord, isScreeningNote } from '../shared/masterImportEngine';
import {
  evaluateCandidatePair,
  DuplicateDecisionOutcome,
  DuplicateDecisionResult,
  normalizeCandidateName,
  compareCandidateNames,
  compareEmails,
  comparePhones,
} from '../shared/matchingEngine';

// Initial baseline jobs for AaraTech (21 slots) and ClinisolTech (10 slots)
export const INITIAL_JOBS: Job[] = [
  // AaraTech (21 Jobs)
  { id: '11111111-0000-4000-a000-000000000001', company: 'AaraTech', job_id: 'AT-001', job_title: 'Senior Full Stack Engineer', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000002', company: 'AaraTech', job_id: 'AT-002', job_title: 'Data Analyst', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000003', company: 'AaraTech', job_id: 'AT-003', job_title: 'CyberSecurity Specialist', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000004', company: 'AaraTech', job_id: 'AT-004', job_title: 'Cloud DevOps Architect', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000005', company: 'AaraTech', job_id: 'AT-005', job_title: 'Python Backend Developer', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000006', company: 'AaraTech', job_id: 'AT-006', job_title: 'React Frontend Specialist', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000007', company: 'AaraTech', job_id: 'AT-007', job_title: 'Machine Learning Engineer', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000008', company: 'AaraTech', job_id: 'AT-008', job_title: 'Systems Administrator', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000009', company: 'AaraTech', job_id: 'AT-009', job_title: 'QA Automation Engineer', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000010', company: 'AaraTech', job_id: 'AT-010', job_title: 'Technical Project Manager', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000011', company: 'AaraTech', job_id: 'AT-011', job_title: 'Database Administrator (PostgreSQL)', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000012', company: 'AaraTech', job_id: 'AT-012', job_title: 'Network Security Engineer', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000013', company: 'AaraTech', job_id: 'AT-013', job_title: 'Java Microservices Developer', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000014', company: 'AaraTech', job_id: 'AT-014', job_title: 'Solutions Architect', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000015', company: 'AaraTech', job_id: 'AT-015', job_title: 'Business Intelligence Developer', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000016', company: 'AaraTech', job_id: 'AT-016', job_title: 'Scrum Master', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000017', company: 'AaraTech', job_id: 'AT-017', job_title: 'Mobile App Developer (Flutter/iOS)', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000018', company: 'AaraTech', job_id: 'AT-018', job_title: 'Site Reliability Engineer (SRE)', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000019', company: 'AaraTech', job_id: 'AT-019', job_title: 'ERP Technical Consultant', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000020', company: 'AaraTech', job_id: 'AT-020', job_title: 'SOC Analyst', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '11111111-0000-4000-a000-000000000021', company: 'AaraTech', job_id: 'AT-021', job_title: 'Product Owner - Technical', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },

  // ClinisolTech (10 Jobs)
  { id: '22222222-0000-4000-a000-000000000001', company: 'ClinisolTech', job_id: 'CT-001', job_title: 'Clinical Data Manager', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '22222222-0000-4000-a000-000000000002', company: 'ClinisolTech', job_id: 'CT-002', job_title: 'SAS Programmer (Clinical Trials)', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '22222222-0000-4000-a000-000000000003', company: 'ClinisolTech', job_id: 'CT-003', job_title: 'Regulatory Affairs Specialist', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '22222222-0000-4000-a000-000000000004', company: 'ClinisolTech', job_id: 'CT-004', job_title: 'Biostatistician', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '22222222-0000-4000-a000-000000000005', company: 'ClinisolTech', job_id: 'CT-005', job_title: 'Clinical Research Associate (CRA)', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '22222222-0000-4000-a000-000000000006', company: 'ClinisolTech', job_id: 'CT-006', job_title: 'Pharmacovigilance Scientist', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '22222222-0000-4000-a000-000000000007', company: 'ClinisolTech', job_id: 'CT-007', job_title: 'Medical Writer', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '22222222-0000-4000-a000-000000000008', company: 'ClinisolTech', job_id: 'CT-008', job_title: 'Clinical Operations Lead', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '22222222-0000-4000-a000-000000000009', company: 'ClinisolTech', job_id: 'CT-009', job_title: 'Validation Engineer (CSV)', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
  { id: '22222222-0000-4000-a000-000000000010', company: 'ClinisolTech', job_id: 'CT-010', job_title: 'QA Auditor - GxP', status: 'Active', created_at: '2026-01-10T09:00:00Z', updated_at: '2026-01-10T09:00:00Z' },
];

export const SEED_PEOPLE: Person[] = [];
export const INITIAL_POSSIBLE_MATCHES: PossibleMatch[] = [];
export const INITIAL_IMPORTS: ImportRecord[] = [];

// Helper for chunking arrays when upserting to Supabase
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// Concurrent chunked upsert helper: batches multiple chunks with Promise.all to eliminate serial round-trip delays
async function parallelChunkUpsert<T>(
  client: any,
  table: string,
  rows: T[],
  chunkSize: number = 250,
  concurrency: number = 3,
  onProgress?: (processed: number, total: number) => void
): Promise<void> {
  if (!rows || rows.length === 0) return;
  const chunks = chunkArray(rows, chunkSize);
  let processed = 0;

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (chunk) => {
        try {
          const { error } = await client.from(table).upsert(chunk, { onConflict: 'id' });
          if (error) {
            console.warn(`Supabase ${table} chunk upsert warning:`, error);
          }
        } catch (err) {
          console.warn(`Supabase ${table} network error:`, err);
        }
      })
    );
    processed += batch.reduce((acc, c) => acc + c.length, 0);
    if (onProgress) {
      onProgress(Math.min(processed, rows.length), rows.length);
    }
  }
}

// In-Memory Storage Cache with IndexedDB Permanent Persistence
class LocalDatabaseStore {
  people: Person[] = [];
  jobs: Job[] = [];
  imports: ImportRecord[] = [];
  possibleMatches: PossibleMatch[] = [];
  auditLogs: AuditLog[] = [];
  mergeHistories: MergeHistory[] = [];
  incompleteRecords: IncompleteRecord[] = [];
  separatedPairs: string[] = [];
  autoMergeEnabled: boolean = true;

  public initPromise: Promise<void>;
  public isReady: boolean = false;

  constructor() {
    this.initPromise = this.init();
  }

  async init(): Promise<void> {
    try {
      // 1. Primary permanent storage: Native IndexedDB
      const [dbPeople, dbJobs, dbImports, dbMatches, dbAudit, dbMerges, dbIncomplete] = await Promise.all([
        indexedDBService.getAll<Person>('people'),
        indexedDBService.getAll<Job>('jobs'),
        indexedDBService.getAll<ImportRecord>('imports'),
        indexedDBService.getAll<PossibleMatch>('possibleMatches'),
        indexedDBService.getAll<AuditLog>('auditLogs'),
        indexedDBService.getAll<MergeHistory>('mergeHistories'),
        indexedDBService.getAll<IncompleteRecord>('incompleteRecords'),
      ]);

      // Authoritative backend SQLite sync: if backend reports master database is empty (0 candidates),
      // synchronize local IndexedDB store by purging cached records immediately
      try {
        const apiRes = await api.getMasterCandidates({ page: 1, pageSize: 1 });
        if (apiRes && apiRes.success && apiRes.totalCount === 0) {
          dbPeople.length = 0;
          this.people = [];
          await indexedDBService.clearStore('people');
          localStorage.setItem('aat_store_cleared', 'true');
        }
      } catch (e) {
        // Backend offline, will use local dbPeople
      }

      if (dbPeople.length > 0) {
        for (const p of dbPeople) {
          p.current_title = cleanJobTitle(p.current_title);
          p.headline = cleanJobTitle(p.headline);
          if (p.applications && p.applications.length > 1) {
            const uniqueApps: any[] = [];
            for (const app of p.applications) {
              app.job_title = cleanJobTitle(app.job_title);
              const normRole = (app.job_title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const existing = uniqueApps.find((u: any) =>
                u.company === app.company &&
                (u.job_title || '').toLowerCase().replace(/[^a-z0-9]/g, '') === normRole
              );
              if (existing) {
                if (!existing.resume_link && app.resume_link) {
                  existing.resume_link = app.resume_link;
                }
              } else {
                uniqueApps.push(app);
              }
            }
            p.applications = uniqueApps;
          } else if (p.applications) {
            for (const a of p.applications) {
              a.job_title = cleanJobTitle(a.job_title);
            }
          }
        }
        this.people = dbPeople;
      } else {
        // If store was explicitly cleared by the user, do not resurrect legacy candidate data!
        const wasCleared = localStorage.getItem('aat_store_cleared') === 'true';
        if (!wasCleared) {
          // 1. Try loading from backend SQLite Master Database API (the primary source of truth)
          try {
            const apiRes = await api.getMasterCandidates({ page: 1, pageSize: 1500 });
            if (apiRes && apiRes.success && apiRes.candidates && apiRes.candidates.length > 0) {
              this.people = apiRes.candidates;
              await indexedDBService.putBatch('people', this.people);
            }
          } catch (apiErr) {
            console.warn('Backend API initial master candidates load fallback:', apiErr);
          }
        }

        // 2. Fallback: check legacy localStorage for migration
        if (this.people.length === 0) {
          try {
            const storedPeople = localStorage.getItem('aat_store_people');
            if (storedPeople) {
              const parsed = JSON.parse(storedPeople);
              if (Array.isArray(parsed) && parsed.length > 0) {
                this.people = parsed;
                await indexedDBService.putBatch('people', this.people);
              }
            }
          } catch {}
        }

        // 3. Fallback: load directly from live Supabase cloud PostgreSQL if available
        if (this.people.length === 0) {
          const client = getSupabaseClient();
          if (client) {
            try {
              let allRemote: Person[] = [];
              let from = 0;
              while (true) {
                const { data: batch, error: batchErr } = await client
                  .from('people')
                  .select('*, emails:person_emails(*), phones:person_phones(*), applications(*), recruiter_contacts(*)')
                  .is('merged_into_id', null)
                  .range(from, from + 999);
                if (batchErr || !batch || batch.length === 0) break;
                allRemote = allRemote.concat(batch as Person[]);
                if (batch.length < 1000) break;
                from += 1000;
              }
              if (allRemote.length > 0) {
                for (const p of allRemote) {
                  p.current_title = cleanJobTitle(p.current_title);
                  p.headline = cleanJobTitle(p.headline);
                  if (p.applications) {
                    for (const a of p.applications) {
                      a.job_title = cleanJobTitle(a.job_title);
                    }
                  }
                }
                this.people = allRemote;
                await indexedDBService.putBatch('people', this.people);
              }
            } catch (supErr) {
              console.warn('Initial Supabase people load fallback warning:', supErr);
            }
          }
        }
      }

      if (dbJobs.length > 0) {
        this.jobs = dbJobs;
      } else {
        this.jobs = JSON.parse(JSON.stringify(INITIAL_JOBS));
        await indexedDBService.putBatch('jobs', this.jobs);
      }

      if (dbImports.length > 0) {
        this.imports = dbImports;
      } else {
        try {
          const storedImports = localStorage.getItem('aat_store_imports');
          if (storedImports) {
            const parsed = JSON.parse(storedImports);
            if (Array.isArray(parsed) && parsed.length > 0) {
              this.imports = parsed;
              await indexedDBService.putBatch('imports', this.imports);
            }
          }
        } catch {}

        if (this.imports.length === 0) {
          const client = getSupabaseClient();
          if (client) {
            try {
              const { data: remoteImports } = await client.from('imports').select('*');
              if (remoteImports && remoteImports.length > 0) {
                this.imports = remoteImports as ImportRecord[];
                await indexedDBService.putBatch('imports', this.imports);
              }
            } catch {}
          }
        }
      }

      if (dbMatches.length > 0) {
        this.possibleMatches = dbMatches;
      }

      if (dbAudit.length > 0) {
        this.auditLogs = dbAudit;
      }

      if (dbMerges.length > 0) {
        this.mergeHistories = dbMerges;
      }

      if (dbIncomplete && dbIncomplete.length > 0) {
        // Automatic Deduplication & Email Auto-Healing Pass on incompleteRecords
        const seenSignatures = new Set<string>();
        const cleanIncomplete: IncompleteRecord[] = [];
        let prunedCount = 0;

        for (const inc of dbIncomplete) {
          // Auto-heal raw_email if malformed (e.g. krishnak543@outlookcom -> krishnak543@outlook.com)
          if (inc.raw_email) {
            const healed = normalizeEmail(inc.raw_email);
            if (healed && healed.isValid && !['adam', 'alex', 'unassigned'].includes(healed.original.toLowerCase())) {
              inc.raw_email = healed.original;
            }
          }

          // Composite signature to deduplicate identical records from repeated imports
          const sig = `${inc.source_file || ''}|${inc.source_row || ''}|${(inc.raw_name || '').toLowerCase().trim()}|${(inc.raw_email || '').toLowerCase().trim()}|${(inc.raw_phone || '').replace(/\D/g, '')}|${(inc.recruiter_feedback || '').toLowerCase().trim().slice(0, 40)}`;

          if (seenSignatures.has(sig)) {
            prunedCount++;
            continue;
          }
          seenSignatures.add(sig);

          const rawName = (inc.raw_name || '').trim();
          const hasName = Boolean(rawName && isValidCandidateName(rawName) && !isLocationOrCountry(rawName) && !isRoleOrTech(rawName) && !isHeaderOrLabelWord(rawName) && !isScreeningNote(rawName));
          const emailNorm = inc.raw_email ? normalizeEmail(inc.raw_email) : null;
          const phoneNorm = inc.raw_phone ? (normalizePhone(inc.raw_phone) || (extractCleanPhone(inc.raw_phone) ? { original: inc.raw_phone, normalized: extractCleanPhone(inc.raw_phone)!, isValid: true } : null)) : null;
          const hasEmail = Boolean(emailNorm);
          const hasPhone = Boolean(phoneNorm);

          // A profile is complete if they have a valid candidate name AND at least one contact method (email or phone)
          if (hasName && (hasEmail || hasPhone)) {
            // Check if this candidate already exists in people
            const existingPerson = this.people.find(p => {
              const nameMatch = (p.full_name || '').toLowerCase().trim() === (inc.raw_name || '').toLowerCase().trim();
              const pEmail = (p.primary_email || '').toLowerCase().trim();
              const incEmail = (inc.raw_email || '').toLowerCase().trim();
              const pPhone = (p.primary_phone || '').replace(/\D/g, '');
              const incPhone = (inc.raw_phone || '').replace(/\D/g, '');
              const emailMatch = Boolean(incEmail && pEmail && incEmail === pEmail);
              const phoneMatch = Boolean(incPhone && pPhone && (incPhone === pPhone || incPhone.endsWith(pPhone) || pPhone.endsWith(incPhone)));
              return (nameMatch && (emailMatch || phoneMatch)) || (emailMatch && phoneMatch);
            });

            if (!existingPerson) {
              const { fullName, firstName, lastName } = parseAndNormalizeName(inc.raw_name!);
              const now = new Date().toISOString();
              const appDate = inc.date_assigned || now.split('T')[0];

              const existingIds = this.people.map(p => {
                const match = p.person_id?.match(/P-(\d+)/);
                return match ? parseInt(match[1], 10) : 0;
              });
              const nextSeq = (Math.max(0, ...existingIds) + 1).toString().padStart(6, '0');
              const personIdCode = `P-${nextSeq}`;
              const personUuid = generateUuid();
              const detectedGender = detectGender('Unspecified', firstName, fullName, inc.recruiter_feedback || '');
              const cleanRole = cleanJobTitle(inc.raw_role);

              const restoredPerson: Person = {
                id: personUuid,
                person_id: personIdCode,
                first_name: firstName || null,
                last_name: lastName || null,
                full_name: fullName,
                gender: detectedGender,
                primary_email: emailNorm ? emailNorm.original : null,
                primary_phone: phoneNorm ? phoneNorm.original : null,
                location: null,
                zip_code: null,
                headline: cleanRole,
                current_title: cleanRole,
                current_company: inc.company,
                linkedin_url: null,
                current_status: 'Assigned',
                current_owner: inc.owner || 'Unassigned',
                created_at: now,
                updated_at: now,
                last_activity_at: `${appDate}T00:00:00Z`,
                emails: emailNorm ? [{
                  id: generateUuid(),
                  person_id: personUuid,
                  email: emailNorm.original,
                  normalized_email: emailNorm.normalized,
                  is_primary: true,
                  source: 'auto_promotion',
                  first_seen_at: now,
                  last_seen_at: now,
                  created_at: now,
                }] : [],
                phones: phoneNorm ? [{
                  id: generateUuid(),
                  person_id: personUuid,
                  phone_original: phoneNorm.original,
                  phone_normalized: phoneNorm.normalized,
                  is_primary: true,
                  source: 'auto_promotion',
                  first_seen_at: now,
                  last_seen_at: now,
                  created_at: now,
                }] : [],
                applications: [{
                  id: generateUuid(),
                  person_id: personUuid,
                  company: inc.company,
                  job_title: cleanRole,
                  date_applied: appDate,
                  current_stage: 'Assigned',
                  source_file: inc.source_file || 'import_restoration',
                  source_row: inc.source_row || 0,
                  created_at: now,
                  updated_at: now,
                }],
                recruiter_contacts: inc.recruiter_feedback ? [{
                  id: generateUuid(),
                  person_id: personUuid,
                  recruiter_name: inc.owner || 'Recruiter',
                  contact_date: appDate,
                  contact_type: 'Phone',
                  original_feedback: inc.recruiter_feedback,
                  source_file: inc.source_file || 'import_restoration',
                  created_at: now,
                }] : [],
              };

              this.people.unshift(restoredPerson);
              indexedDBService.putBatch('people', [restoredPerson]).catch(() => {});
            }

            // Do not keep in incomplete queue!
            prunedCount++;
            continue;
          }

          if (hasName && !hasEmail && !hasPhone) {
            inc.missing_reason = 'missing_both';
            inc.missing_description = 'Missing Contact Information (No Email or Phone provided)';
          } else if (!hasName && (hasEmail || hasPhone)) {
            inc.missing_reason = 'missing_name';
            inc.missing_description = 'Missing candidate full name';
          }

          cleanIncomplete.push(inc);
        }

        this.incompleteRecords = cleanIncomplete;
        if (prunedCount > 0 || cleanIncomplete.length !== dbIncomplete.length) {
          indexedDBService.clearStore('incompleteRecords').then(() => {
            indexedDBService.putBatch('incompleteRecords', cleanIncomplete);
          }).catch(() => {});
        }
      } else {
        const client = getSupabaseClient();
        if (client) {
          try {
            const { data: remoteIncomplete } = await client.from('incomplete_records').select('*');
            if (remoteIncomplete && remoteIncomplete.length > 0) {
              this.incompleteRecords = remoteIncomplete as IncompleteRecord[];
              await indexedDBService.putBatch('incompleteRecords', this.incompleteRecords);
            }
          } catch {}
        }
      }

      try {
        const storedSeparated = localStorage.getItem('aat_store_separated_pairs');
        if (storedSeparated) {
          this.separatedPairs = JSON.parse(storedSeparated);
        }
        const storedAutoMerge = localStorage.getItem('aat_auto_merge_enabled');
        if (storedAutoMerge !== null) {
          this.autoMergeEnabled = storedAutoMerge === 'true';
        }
      } catch {}

      // Automatically heal any candidate records where phone numbers were misplaced as candidate names
      await this.healAllCandidateData();

      this.isReady = true;
    } catch (e) {
      console.warn('Error loading from IndexedDB:', e);
      this.isReady = true;
    }
  }

  async healAllCandidateData(): Promise<number> {
    let healedCount = 0;
    const client = getSupabaseClient();
    const now = new Date().toISOString();

    for (const p of this.people) {
      let candidateModified = false;

      // 1. Phone number normalization to pure digits (without -, ., '', (), spaces, or symbols)
      if (p.primary_phone) {
        const purePrimary = formatPureDigitsPhone(p.primary_phone);
        if (purePrimary && purePrimary !== p.primary_phone) {
          p.primary_phone = purePrimary;
          candidateModified = true;
        }
      }
      if (p.secondary_phone) {
        const pureSec = formatPureDigitsPhone(p.secondary_phone);
        if (pureSec && pureSec !== p.secondary_phone) {
          p.secondary_phone = pureSec;
          candidateModified = true;
        }
      }
      if (p.phones && p.phones.length > 0) {
        for (const ph of p.phones) {
          const purePh = formatPureDigitsPhone(ph.phone_normalized || ph.phone_original);
          if (purePh && (ph.phone_original !== purePh || ph.phone_normalized !== purePh)) {
            ph.phone_original = purePh;
            ph.phone_normalized = purePh;
            candidateModified = true;
          }
        }
      }

      // 2. Ensure candidate has a designated recruiter owner or Unassigned
      if (!p.current_owner || p.current_owner.trim() === '' || p.current_owner === 'Adam') {
        p.current_owner = 'Unassigned';
        candidateModified = true;
      }

      if (isPhoneNumber(p.full_name)) {
        const rawPhone = p.full_name.trim();
        const cleanPhone = formatPureDigitsPhone(rawPhone);

        if (!p.primary_phone) {
          p.primary_phone = cleanPhone;
          candidateModified = true;
        }

        if (!p.phones || p.phones.length === 0) {
          const phoneNorm = normalizePhone(rawPhone);
          p.phones = [
            {
              id: generateUuid(),
              person_id: p.id,
              phone_original: phoneNorm ? phoneNorm.normalized : cleanPhone,
              phone_normalized: phoneNorm ? phoneNorm.normalized : cleanPhone,
              is_primary: true,
              first_seen_at: p.created_at || now,
              last_seen_at: p.updated_at || now,
              created_at: p.created_at || now,
            },
          ];
          candidateModified = true;
        }

        if (p.current_title && ['adam', 'alex', 'unassigned'].includes(p.current_title.toLowerCase().trim())) {
          p.current_title = 'General Sourced Candidate';
          candidateModified = true;
        }
        if (p.headline && ['adam', 'alex', 'unassigned'].includes(p.headline.toLowerCase().trim())) {
          p.headline = 'General Sourced Candidate';
          candidateModified = true;
        }
        if (p.applications && p.applications.length > 0) {
          for (const app of p.applications) {
            if (app.job_title && ['adam', 'alex', 'unassigned'].includes(app.job_title.toLowerCase().trim())) {
              app.job_title = 'General Sourced Candidate';
              candidateModified = true;
            }
          }
        }

        if (
          p.current_owner &&
          (p.current_owner.length > 25 ||
            /^(he is|she is|female candidate|male|not a|4 years|2 years|\d+\s*years|opt|f1|h1b|green card|voice mail|someone picked)/i.test(
              p.current_owner
            ))
        ) {
          const noteText = p.current_owner.trim();
          if (noteText.toLowerCase().includes('female candidate')) {
            p.gender = 'Female';
          }
          if (!p.recruiter_contacts) {
            p.recruiter_contacts = [];
          }
          if (!p.recruiter_contacts.some(c => c.original_feedback === noteText)) {
            p.recruiter_contacts.push({
              id: generateUuid(),
              person_id: p.id,
              recruiter_name: 'Recruiter',
              original_feedback: noteText,
              contact_date: p.created_at ? p.created_at.split('T')[0] : now.split('T')[0],
              contact_type: 'Phone',
              created_at: p.created_at || now,
            });
          }
          p.current_owner = 'Unassigned';
          candidateModified = true;
        }

        let recoveredName: string | null = null;
        if (p.recruiter_contacts && p.recruiter_contacts.length > 0) {
          for (const c of p.recruiter_contacts) {
            if (c.original_feedback) {
              const ext = extractCandidateName(c.original_feedback);
              if (ext.name && isValidCandidateName(ext.name)) {
                recoveredName = ext.name;
                break;
              }
            }
          }
        }

        if ((!recoveredName || !isValidCandidateName(recoveredName)) && p.primary_email) {
          const nameFromEmail = extractCandidateNameFromEmail(p.primary_email);
          if (nameFromEmail && isValidCandidateName(nameFromEmail)) {
            recoveredName = nameFromEmail;
          }
        }

        if (recoveredName) {
          p.full_name = recoveredName;
          const parts = recoveredName.split(' ');
          p.first_name = parts[0];
          p.last_name = parts.slice(1).join(' ') || null;
          candidateModified = true;
        }
      }

      if (candidateModified) {
        p.updated_at = now;
        healedCount++;

        if (client) {
          try {
            client
              .from('people')
              .update({
                full_name: p.full_name,
                first_name: p.first_name,
                last_name: p.last_name,
                primary_phone: p.primary_phone,
                current_title: p.current_title,
                headline: p.current_title,
                current_owner: p.current_owner,
                gender: p.gender,
                updated_at: now,
              })
              .eq('id', p.id)
              .then();
          } catch {}
        }
      }
    }

    if (healedCount > 0) {
      await indexedDBService.putBatch('people', this.people);
    }

    return healedCount;
  }

  async ensureInitialized(): Promise<void> {
    if (!this.isReady) {
      await this.initPromise;
    }
  }

  async saveToStorage(): Promise<void> {
    try {
      // 1. High-capacity permanent browser storage via IndexedDB
      await Promise.all([
        indexedDBService.putBatch('people', this.people),
        indexedDBService.putBatch('jobs', this.jobs),
        indexedDBService.putBatch('imports', this.imports),
        indexedDBService.putBatch('possibleMatches', this.possibleMatches),
        indexedDBService.putBatch('auditLogs', this.auditLogs),
        indexedDBService.putBatch('mergeHistories', this.mergeHistories),
        indexedDBService.putBatch('incompleteRecords', this.incompleteRecords),
      ]);

      // 2. Set storage flag
      if (this.people.length > 0) {
        localStorage.removeItem('aat_store_cleared');
      } else {
        localStorage.setItem('aat_store_cleared', 'true');
      }

      // 3. Lightweight cache in localStorage if within safe limits (< 2MB)
      try {
        localStorage.setItem('aat_store_jobs', JSON.stringify(this.jobs));
        localStorage.setItem('aat_store_imports', JSON.stringify(this.imports.slice(0, 50)));
        localStorage.setItem('aat_store_separated_pairs', JSON.stringify(this.separatedPairs));
        localStorage.setItem('aat_auto_merge_enabled', String(this.autoMergeEnabled));
      } catch {}
    } catch (e) {
      console.warn('Permanent storage persistence error:', e);
    }
  }

  async clearAllCandidateData(company: CompanyName | 'all' = 'all'): Promise<void> {
    if (company && company !== 'all') {
      // Company-Scoped Clear: Strictly preserve other company's candidate data (Prompt Section 2)!
      this.people = this.people.filter(p => p.company !== company);
      this.imports = this.imports.filter(i => (i as any).company !== company);
      this.possibleMatches = this.possibleMatches.filter(m => (m as any).company !== company);
      this.incompleteRecords = this.incompleteRecords.filter(r => (r as any).company !== company);

      try {
        // Keep other company's data in IndexedDB
        const allPeople = await indexedDBService.getAll<Person>('people');
        const keptPeople = allPeople.filter(p => p.company !== company);
        await indexedDBService.clearStore('people');
        if (keptPeople.length > 0) {
          await indexedDBService.putBatch('people', keptPeople);
        }

        const allInc = await indexedDBService.getAll<IncompleteRecord>('incompleteRecords');
        const keptInc = allInc.filter(r => r.company !== company);
        await indexedDBService.clearStore('incompleteRecords');
        if (keptInc.length > 0) {
          await indexedDBService.putBatch('incompleteRecords', keptInc);
        }

        const allMatches = await indexedDBService.getAll<PossibleMatch>('possibleMatches');
        const keptMatches = allMatches.filter(m => (m as any).company !== company);
        await indexedDBService.clearStore('possibleMatches');
        if (keptMatches.length > 0) {
          await indexedDBService.putBatch('possibleMatches', keptMatches);
        }

        // Update local memory cache without nuking other company
        localStorage.setItem('aat_store_people', JSON.stringify(this.people));
      } catch (e) {
        console.warn(`Storage clear notice for ${company}:`, e);
      }

      try {
        window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { action: 'cleared-company', company } }));
      } catch {}
      return;
    }

    // Global clear across all companies
    this.people = [];
    this.imports = [];
    this.possibleMatches = [];
    this.auditLogs = [];
    this.mergeHistories = [];
    this.incompleteRecords = [];
    this.jobs = JSON.parse(JSON.stringify(INITIAL_JOBS));

    try {
      await indexedDBService.clearAll();
      await indexedDBService.putBatch('jobs', this.jobs);
      localStorage.setItem('aat_store_cleared', 'true');
      localStorage.removeItem('aat_store_people');
      localStorage.removeItem('aat_store_imports');
      localStorage.removeItem('aat_store_matches');
      localStorage.removeItem('aat_store_audit');
      localStorage.removeItem('aat_store_merges');
    } catch (e) {
      console.warn('Storage clear notice:', e);
    }
    try {
      window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { action: 'cleared-all' } }));
    } catch {}
  }

  resetToDefaults() {
    this.clearAllCandidateData();
  }
}

const localStore = new LocalDatabaseStore();

/**
 * Extract the most recent application date or creation date for a candidate
 */
export function getCandidateDateApplied(p: Person): string {
  if (p.applications && p.applications.length > 0) {
    const dates = p.applications.map(a => a.date_applied).filter(Boolean);
    if (dates.length > 0) {
      dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
      return dates[0];
    }
  }
  return p.created_at ? p.created_at.split('T')[0] : '';
}

export const dbService = {
  /**
   * Clear candidate data for a specific company or all companies with strict company isolation
   */
  async clearAllData(company: CompanyName | 'all' = 'all'): Promise<void> {
    await localStore.clearAllCandidateData(company);
    try {
      await api.clearAllMasterCandidates(company);
    } catch (e) {
      console.warn(`Backend remote clear notice for ${company}:`, e);
    }
    const client = getSupabaseClient();
    if (client) {
      try {
        if (company && company !== 'all') {
          await client.from('possible_matches').delete().eq('company', company);
          await client.from('people').delete().eq('company', company);
          await client.from('applications').delete().eq('company', company);
          await client.from('imports').delete().eq('company', company);
          try {
            await client.from('incomplete_records').delete().eq('company', company);
          } catch {}
        } else {
          await client.from('possible_matches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await client.from('recruiter_contacts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await client.from('person_status_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await client.from('merge_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await client.from('applications').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await client.from('person_emails').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await client.from('person_phones').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await client.from('people').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await client.from('imports').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          await client.from('audit_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          try {
            await client.from('incomplete_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          } catch {}
        }
      } catch (e) {
        console.warn('Supabase remote clear error:', e);
      }
    }
  },

  /**
   * Reset local database to demo seed data
   */
  resetLocalDatabase() {
    localStore.resetToDefaults();
  },

  /**
   * Helper to get candidate date applied
   */
  getCandidateDateApplied(p: Person): string {
    return getCandidateDateApplied(p);
  },

  /**
   * Fetch paginated list of candidate profiles
   */
  async getCandidates(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    company?: string;
    status?: string;
    owner?: string;
    jobTitle?: string;
    technology?: string;
    repeatFilter?: string;
    h1bStatus?: string;
    greenCard?: string;
    hasResume?: boolean;
    hasLinkedIn?: boolean;
    gender?: string;
    dateFrom?: string;
    dateTo?: string;
    contactFilter?: 'all' | 'missing_phone' | 'missing_email';
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<{ candidates: Person[]; totalCount: number }> {
    await localStore.ensureInitialized();
    const client = getSupabaseClient();
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;

    // 1. Primary permanent store: Backend SQLite Master Database API
    try {
      const apiRes = await api.getMasterCandidates({
        ...params,
        technology: params.technology || params.jobTitle,
      });
      if (apiRes && apiRes.success) {
        // Authoritative backend response received
        if (apiRes.totalCount === 0) {
          // If the backend has 0 records, purge any stale candidate records from localStore and IndexedDB
          if (!params.search && (!params.status || params.status === 'All') && (!params.owner || params.owner === 'All') && (!params.gender || params.gender === 'All')) {
            if (params.company && params.company !== 'All' && params.company !== 'Both') {
              localStore.people = localStore.people.filter(p => {
                const pComp = p.current_company || (p.applications && p.applications.find(a => a.company)?.company);
                return pComp !== params.company;
              });
              indexedDBService.clearStore('people').then(() => {
                if (localStore.people.length > 0) {
                  indexedDBService.putBatch('people', localStore.people);
                }
              }).catch(() => {});
            } else {
              localStore.people = [];
              indexedDBService.clearStore('people').catch(() => {});
            }
          }
        }
        return { candidates: apiRes.candidates || [], totalCount: apiRes.totalCount || 0 };
      }
    } catch (apiErr) {
      console.warn('Backend /api/master-candidates fetch fallback to local/supabase:', apiErr);
    }

    // Check if live Supabase is active
    if (client) {
      try {
        let query = client
          .from('people')
          .select('*, emails:person_emails(*), phones:person_phones(*), applications(*), recruiter_contacts(*)', { count: 'exact' })
          .is('merged_into_id', null);

        if (params.search) {
          const s = `%${params.search}%`;
          query = query.or(`full_name.ilike.${s},person_id.ilike.${s},primary_email.ilike.${s},secondary_email.ilike.${s},primary_phone.ilike.${s},secondary_phone.ilike.${s},location.ilike.${s},preferred_location.ilike.${s},linkedin_url.ilike.${s}`);
        }

        if (params.company && params.company !== 'All') {
          query = query.eq('current_company', params.company);
        }

        if (params.status && params.status !== 'All') {
          query = query.eq('current_status', params.status);
        }

        if (params.owner && params.owner !== 'All') {
          query = query.eq('current_owner', params.owner);
        }

        if (params.gender && params.gender !== 'All') {
          query = query.eq('gender', params.gender);
        }

        if (params.contactFilter === 'missing_phone') {
          query = query.or('primary_phone.is.null,primary_phone.eq.""');
        } else if (params.contactFilter === 'missing_email') {
          query = query.or('primary_email.is.null,primary_email.eq.""');
        }

        // Pagination
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.range(from, to).order('created_at', { ascending: params.sortOrder === 'asc' });

        const { data, count, error } = await query;
        if (!error && data && data.length > 0) {
          let supList = data as Person[];
          if (params.dateFrom) {
            supList = supList.filter(p => getCandidateDateApplied(p) >= params.dateFrom!);
          }
          if (params.dateTo) {
            supList = supList.filter(p => getCandidateDateApplied(p) <= params.dateTo!);
          }
          // Sort by Date Applied (Newest first)
          supList.sort((a, b) => {
            const dateA = new Date(getCandidateDateApplied(a) || a.created_at).getTime();
            const dateB = new Date(getCandidateDateApplied(b) || b.created_at).getTime();
            return params.sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
          });

          for (const p of supList) {
            p.current_title = cleanJobTitle(p.current_title);
            p.headline = cleanJobTitle(p.headline);
            if (p.applications) {
              for (const a of p.applications) {
                a.job_title = cleanJobTitle(a.job_title);
              }
            }
          }

          return { candidates: supList, totalCount: count || supList.length };
        }
      } catch (err) {
        console.warn('Supabase getCandidates query fallback to local store:', err);
      }
    }

    // Local permanent store implementation
    let list = localStore.people.filter(p => !p.merged_into_id);

    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(p =>
        p.full_name.toLowerCase().includes(q) ||
        p.person_id.toLowerCase().includes(q) ||
        (p.primary_email && p.primary_email.toLowerCase().includes(q)) ||
        (p.secondary_email && p.secondary_email.toLowerCase().includes(q)) ||
        (p.primary_phone && p.primary_phone.includes(q)) ||
        (p.secondary_phone && p.secondary_phone.includes(q)) ||
        (p.location && p.location.toLowerCase().includes(q)) ||
        (p.preferred_location && p.preferred_location.toLowerCase().includes(q)) ||
        (p.linkedin_url && p.linkedin_url.toLowerCase().includes(q)) ||
        (p.emails && p.emails.some(e => e.email.toLowerCase().includes(q))) ||
        (p.phones && p.phones.some(ph => ph.phone_normalized.includes(q) || ph.phone_original.includes(q)))
      );
    }

    if (params.status && params.status !== 'All') {
      list = list.filter(p => p.current_status === params.status);
    }

    if (params.owner && params.owner !== 'All') {
      list = list.filter(p => p.current_owner === params.owner);
    }

    if (params.company && params.company !== 'All') {
      list = list.filter(p => {
        const pComp = p.current_company || (p.applications && p.applications.find(a => a.company)?.company);
        return pComp === params.company;
      });
    }

    if (params.gender && params.gender !== 'All') {
      list = list.filter(p => (p.gender || 'Unspecified') === params.gender);
    }

    if (params.contactFilter === 'missing_phone') {
      list = list.filter(p => !p.primary_phone || p.primary_phone.trim() === '' || p.primary_phone === '—');
    } else if (params.contactFilter === 'missing_email') {
      list = list.filter(p => !p.primary_email || p.primary_email.trim() === '');
    }

    if (params.hasResume) {
      list = list.filter(p => p.applications && p.applications.some(a => Boolean(a.resume_link)));
    }

    if (params.hasLinkedIn) {
      list = list.filter(p => Boolean(p.linkedin_url));
    }

    if (params.dateFrom) {
      list = list.filter(p => getCandidateDateApplied(p) >= params.dateFrom!);
    }

    if (params.dateTo) {
      list = list.filter(p => getCandidateDateApplied(p) <= params.dateTo!);
    }

    // Sort by Date Applied (Newest first) by default
    list.sort((a, b) => {
      if (params.sortBy === 'name') {
        return a.full_name.localeCompare(b.full_name);
      }
      if (params.sortBy === 'last_activity_at') {
        return new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime();
      }
      const dateA = new Date(getCandidateDateApplied(a) || a.created_at).getTime();
      const dateB = new Date(getCandidateDateApplied(b) || b.created_at).getTime();
      return params.sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
    });

    const totalCount = list.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = list.slice(startIndex, startIndex + pageSize);

    for (const p of paginated) {
      p.current_title = cleanJobTitle(p.current_title);
      p.headline = cleanJobTitle(p.headline);
      if (p.applications) {
        for (const a of p.applications) {
          a.job_title = cleanJobTitle(a.job_title);
        }
      }
    }

    return { candidates: paginated, totalCount };
  },

  /**
   * Fetch single candidate profile with all child tables
   */
  async getCandidateById(personIdOrUuid: string): Promise<Person | null> {
    await localStore.ensureInitialized();

    // 1. Primary permanent store: Backend SQLite Master Database API
    try {
      const apiRes = await api.getMasterCandidateById(personIdOrUuid);
      if (apiRes && apiRes.success && apiRes.candidate) {
        return apiRes.candidate;
      }
    } catch (apiErr) {
      console.warn('Backend /api/master-candidates/:id fetch fallback to local/supabase:', apiErr);
    }

    const client = getSupabaseClient();
    if (client) {
      try {
        const { data, error } = await client
          .from('people')
          .select('*, emails:person_emails(*), phones:person_phones(*), applications(*), recruiter_contacts(*), status_history:person_status_history(*)')
          .or(`id.eq.${personIdOrUuid},person_id.eq.${personIdOrUuid}`)
          .single();

        if (!error && data) {
          const p = data as Person;
          p.current_title = cleanJobTitle(p.current_title);
          p.headline = cleanJobTitle(p.headline);
          if (p.applications) {
            for (const a of p.applications) {
              a.job_title = cleanJobTitle(a.job_title);
            }
          }
          return p;
        }
      } catch (e) {
        console.warn('Supabase getCandidateById fallback to local store:', e);
      }
    }

    const found = localStore.people.find(
      p => p.id === personIdOrUuid || p.person_id === personIdOrUuid
    );
    if (found) {
      const p = JSON.parse(JSON.stringify(found)) as Person;
      p.current_title = cleanJobTitle(p.current_title);
      p.headline = cleanJobTitle(p.headline);
      if (p.applications) {
        for (const a of p.applications) {
          a.job_title = cleanJobTitle(a.job_title);
        }
      }
      return p;
    }
    return null;
  },

  /**
   * Update candidate status and record status history
   */
  async updateStatus(personId: string, newStatus: any, changedBy: string, reason?: string): Promise<boolean> {
    await localStore.ensureInitialized();
    const client = getSupabaseClient();
    const candidate = await this.getCandidateById(personId);
    if (!candidate) return false;

    const oldStatus = candidate.current_status;
    const now = new Date().toISOString();
    const historyId = generateUuid();
    const auditId = generateUuid();

    // Authoritative backend SQLite sync
    try {
      await api.updateMasterCandidate(candidate.id, { current_status: newStatus, reason }, changedBy);
    } catch (e) {
      console.warn('Backend SQLite update candidate status error:', e);
    }

    if (client) {
      try {
        await client.from('people').update({ current_status: newStatus, last_activity_at: now }).eq('id', candidate.id);
        await client.from('person_status_history').insert({
          id: historyId,
          person_id: candidate.id,
          old_status: oldStatus,
          new_status: newStatus,
          changed_by: changedBy,
          reason: reason || null,
          created_at: now,
        });
        await client.from('audit_log').insert({
          id: auditId,
          user_id: changedBy,
          action: 'status_change',
          entity_type: 'person',
          entity_id: candidate.person_id,
          details: { oldStatus, newStatus, reason },
          created_at: now,
        });
      } catch (err) {
        console.error('Failed to update status in Supabase:', err);
      }
    }

    // Local permanent store update
    const target = localStore.people.find(p => p.id === candidate.id);
    if (target) {
      target.current_status = newStatus;
      target.last_activity_at = now;
      if (!target.status_history) target.status_history = [];
      target.status_history.unshift({
        id: historyId,
        person_id: target.id,
        old_status: oldStatus,
        new_status: newStatus,
        changed_by: changedBy,
        reason: reason || null,
        created_at: now,
      });
      localStore.auditLogs.unshift({
        id: auditId,
        user_id: changedBy,
        action: 'status_change',
        entity_type: 'person',
        entity_id: target.person_id,
        details: { oldStatus, newStatus, reason },
        created_at: now,
      });
      await localStore.saveToStorage();
    }

    window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { entity: 'candidate', action: 'status_updated', candidateId: candidate.id } }));
    return true;
  },

  /**
   * Update candidate owner
   */
  async updateOwner(personId: string, newOwner: string, changedBy: string): Promise<boolean> {
    await localStore.ensureInitialized();
    const candidate = await this.getCandidateById(personId);
    if (!candidate) return false;

    const oldOwner = candidate.current_owner;
    const now = new Date().toISOString();
    const auditId = generateUuid();
    const client = getSupabaseClient();

    // Authoritative backend SQLite sync
    try {
      await api.updateMasterCandidate(candidate.id, { current_owner: newOwner }, changedBy);
    } catch (e) {
      console.warn('Backend SQLite update candidate owner error:', e);
    }

    if (client) {
      try {
        await client.from('people').update({ current_owner: newOwner, last_activity_at: now }).eq('id', candidate.id);
        await client.from('audit_log').insert({
          id: auditId,
          user_id: changedBy,
          action: 'owner_change',
          entity_type: 'person',
          entity_id: candidate.person_id,
          details: { oldOwner, newOwner },
          created_at: now,
        });
      } catch (e) {
        console.error('Supabase update owner error:', e);
      }
    }

    const target = localStore.people.find(p => p.id === candidate.id);
    if (target) {
      target.current_owner = newOwner;
      target.last_activity_at = now;
      localStore.auditLogs.unshift({
        id: auditId,
        user_id: changedBy,
        action: 'owner_change',
        entity_type: 'person',
        entity_id: target.person_id,
        details: { oldOwner, newOwner },
        created_at: now,
      });
      await localStore.saveToStorage();
    }

    window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { entity: 'candidate', action: 'owner_updated', candidateId: candidate.id } }));
    return true;
  },

  /**
   * Update candidate gender
   */
  async updateGender(personId: string, newGender: Gender, changedBy: string = 'Digital Marketing Team'): Promise<boolean> {
    await localStore.ensureInitialized();
    const candidate = localStore.people.find(p => p.id === personId || p.person_id === personId);
    if (!candidate) return false;

    const oldGender = candidate.gender || 'Unspecified';
    const now = new Date().toISOString();
    const auditId = generateUuid();

    // Authoritative backend SQLite sync
    try {
      await api.updateMasterCandidate(candidate.id, { gender: newGender }, changedBy);
    } catch (e) {
      console.warn('Backend SQLite update candidate gender error:', e);
    }

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('people').update({ gender: newGender, updated_at: now }).eq('id', candidate.id);
      } catch (e) {
        console.warn('Supabase gender update error:', e);
      }
    }

    candidate.gender = newGender;
    candidate.updated_at = now;
    localStore.auditLogs.unshift({
      id: auditId,
      user_id: changedBy,
      action: 'status_change',
      entity_type: 'person',
      entity_id: candidate.person_id,
      details: { field: 'gender', oldGender, newGender },
      created_at: now,
    });
    await localStore.saveToStorage();

    window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { entity: 'candidate', action: 'gender_updated', candidateId: candidate.id } }));
    return true;
  },

  /**
   * Add a new recruiter contact (Verbatim text preserved)
   */
  async addRecruiterContact(
    personId: string,
    recruiterName: string,
    contactType: string,
    rawFeedback: string,
    contactDate?: string
  ): Promise<boolean> {
    await localStore.ensureInitialized();
    const candidate = await this.getCandidateById(personId);
    if (!candidate) return false;

    const now = new Date().toISOString();
    const cDate = contactDate || new Date().toISOString().split('T')[0];
    const client = getSupabaseClient();

    const newContact: RecruiterContact = {
      id: generateUuid(),
      person_id: candidate.id,
      recruiter_name: recruiterName,
      contact_date: cDate,
      contact_type: contactType,
      original_feedback: rawFeedback, // Exact verbatim text
      created_at: now,
    };

    // Authoritative backend SQLite sync
    try {
      await api.addMasterRecruiterContact(candidate.id, {
        recruiterName,
        contactType,
        notes: rawFeedback,
        contactDate: cDate,
      });
    } catch (e) {
      console.warn('Backend SQLite add recruiter contact error:', e);
    }

    if (client) {
      try {
        await client.from('recruiter_contacts').insert(newContact);
        await client.from('people').update({ last_activity_at: now }).eq('id', candidate.id);
      } catch (e) {
        console.error('Supabase insert contact error:', e);
      }
    }

    const target = localStore.people.find(p => p.id === candidate.id);
    if (target) {
      if (!target.recruiter_contacts) target.recruiter_contacts = [];
      target.recruiter_contacts.unshift(newContact);
      target.last_activity_at = now;
      await localStore.saveToStorage();
    }

    window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { entity: 'candidate', action: 'contact_added', candidateId: candidate.id } }));
    return true;
  },

  /**
   * Reassign candidate recruiter with full audit tracking, preserving previous assignments & contact history (Part 6)
   */
  async reassignRecruiter(
    personId: string,
    recruiterName: string,
    assignedDate?: string,
    reason?: string,
    user: string = 'Recruiter Admin'
  ): Promise<{ success: boolean; candidate?: Person; error?: string }> {
    try {
      const res = await api.reassignMasterCandidate(personId, { recruiterName, assignedDate, reason }, user);
      if (res && res.success) {
        const cand = localStore.people.find(p => p.id === personId || p.person_id === personId);
        if (cand) {
          cand.current_owner = recruiterName;
          cand.last_assignment_date = assignedDate || new Date().toISOString().split('T')[0];
          await localStore.saveToStorage();
        }
        window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { entity: 'candidate', action: 'reassigned', candidateId: personId } }));
        return { success: true, candidate: res.candidate };
      }
      return { success: false, error: 'Failed to reassign candidate' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to reassign candidate' };
    }
  },

  /**
   * Record a genuine contact attempt and its outcome/feedback without changing owner or overwriting history (Part 6)
   */
  async addContactAttempt(
    personId: string,
    attempt: {
      recruiterName: string;
      contactMethod?: string;
      outcome?: string;
      feedback1?: string;
      feedback2?: string;
      notes?: string;
      contactDate?: string;
      nextFollowUp?: string;
      sourceFile?: string;
    },
    user: string = 'Recruiter Admin'
  ): Promise<{ success: boolean; candidate?: Person; error?: string }> {
    try {
      const res = await api.addMasterContactAttempt(personId, attempt, user);
      if (res && res.success) {
        const cand = localStore.people.find(p => p.id === personId || p.person_id === personId);
        if (cand) {
          cand.last_contacted_by = attempt.recruiterName;
          cand.latest_contact_outcome = attempt.outcome || 'Logged';
          cand.last_contact_date = attempt.contactDate || new Date().toISOString().split('T')[0];
          await localStore.saveToStorage();
        }
        window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { entity: 'candidate', action: 'contact_added', candidateId: personId } }));
        return { success: true, candidate: res.candidate };
      }
      return { success: false, error: 'Failed to record contact attempt' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to record contact attempt' };
    }
  },

  /**
   * Update candidate profile with full audit logging, secondary contacts,
   * contact retention (never discard old contacts), and post-edit automatic duplicate detection (Section 8, 9, 14).
   */
  async updateCandidateProfile(
    personId: string,
    updates: {
      full_name?: string;
      primary_email?: string | null;
      secondary_email?: string | null;
      primary_phone?: string | null;
      secondary_phone?: string | null;
      location?: string | null;
      preferred_location?: string | null;
      headline?: string | null;
      current_title?: string | null;
      current_status?: CandidateStatus;
      current_owner?: string | null;
      linkedin_url?: string | null;
      resume_url?: string | null;
      green_card?: string | null;
      h1b_status?: string | null;
      current_company?: CompanyName;
      gender?: Gender;
    },
    updatedBy: string = 'Recruiter'
  ): Promise<{
    success: boolean;
    person?: Person;
    error?: string;
    autoMerged?: boolean;
    mergedWithPersonId?: string;
  }> {
    await localStore.ensureInitialized();
    const candidate = localStore.people.find(p => p.id === personId || p.person_id === personId);
    if (!candidate) {
      try {
        const apiRes = await api.updateMasterCandidate(personId, updates, updatedBy);
        if (apiRes && apiRes.success) {
          window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { entity: 'candidate', action: 'updated', candidateId: personId } }));
          return { success: true, person: apiRes.candidate };
        }
      } catch (err: any) {
        return { success: false, error: err.message || 'Candidate profile not found' };
      }
      return { success: false, error: 'Candidate profile not found' };
    }

    // Strict Company Isolation (Section 2)
    const company = candidate.current_company || candidate.applications?.[0]?.company || 'AaraTech';
    if (updates.current_company && updates.current_company !== company) {
      return { success: false, error: 'Cross-company candidate reassignment is blocked' };
    }

    // Validation (Section 8)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (updates.primary_email && updates.primary_email.trim() && !emailRegex.test(updates.primary_email.trim())) {
      return { success: false, error: 'Primary email has an invalid format' };
    }
    if (updates.secondary_email && updates.secondary_email.trim() && !emailRegex.test(updates.secondary_email.trim())) {
      return { success: false, error: 'Secondary email has an invalid format' };
    }
    if (updates.primary_phone && updates.primary_phone.trim()) {
      const digits = updates.primary_phone.replace(/\D/g, '');
      if (digits.length < 7) {
        return { success: false, error: 'Primary phone must contain at least 7 digits' };
      }
    }
    if (updates.secondary_phone && updates.secondary_phone.trim()) {
      const digits = updates.secondary_phone.replace(/\D/g, '');
      if (digits.length < 7) {
        return { success: false, error: 'Secondary phone must contain at least 7 digits' };
      }
    }

    const now = new Date().toISOString();
    const fieldsToTrack: (keyof typeof updates)[] = [
      'full_name',
      'primary_email',
      'secondary_email',
      'primary_phone',
      'secondary_phone',
      'location',
      'preferred_location',
      'headline',
      'current_title',
      'current_status',
      'current_owner',
      'linkedin_url',
      'resume_url',
      'green_card',
      'h1b_status',
      'current_company',
    ];

    let contactOrNameChanged = false;

    // Track audit logs for every changed field (Section 14)
    for (const field of fieldsToTrack) {
      if (updates[field] !== undefined) {
        const oldVal = (candidate as any)[field] ?? null;
        const newVal = updates[field] ?? null;
        if (oldVal !== newVal) {
          if (['full_name', 'primary_email', 'secondary_email', 'primary_phone', 'secondary_phone'].includes(field)) {
            contactOrNameChanged = true;
          }
          localStore.auditLogs.unshift({
            id: generateUuid(),
            user_id: updatedBy,
            action: 'profile_edit',
            entity_type: 'person',
            entity_id: candidate.person_id,
            details: {
              field,
              previous_value: oldVal,
              new_value: newVal,
            },
            created_at: now,
          });
        }
      }
    }

    // Contact Retention Logic (Section 9):
    // "When a primary contact is changed, do not automatically discard the old value.
    // Allow it to be retained as a secondary or historical contact where appropriate."
    if (updates.primary_email !== undefined) {
      const oldEmail = candidate.primary_email;
      const newEmail = updates.primary_email ? updates.primary_email.trim() : null;
      if (oldEmail && newEmail && oldEmail.toLowerCase() !== newEmail.toLowerCase()) {
        if (!candidate.emails) candidate.emails = [];
        // Demote existing primary email to secondary / historical
        const existingPrimary = candidate.emails.find(e => e.email.toLowerCase() === oldEmail.toLowerCase());
        if (existingPrimary) {
          existingPrimary.is_primary = false;
        } else {
          candidate.emails.push({
            id: generateUuid(),
            person_id: candidate.id,
            email: oldEmail,
            normalized_email: normalizeEmail(oldEmail)?.normalized || oldEmail.toLowerCase(),
            is_primary: false,
            first_seen_at: candidate.created_at,
            last_seen_at: now,
            created_at: now,
          });
        }
        if (updates.secondary_email === undefined && !candidate.secondary_email) {
          candidate.secondary_email = oldEmail;
        }
      }

      if (newEmail) {
        if (!candidate.emails) candidate.emails = [];
        const existing = candidate.emails.find(e => e.email.toLowerCase() === newEmail.toLowerCase());
        if (existing) {
          existing.is_primary = true;
        } else {
          candidate.emails.unshift({
            id: generateUuid(),
            person_id: candidate.id,
            email: newEmail,
            normalized_email: normalizeEmail(newEmail)?.normalized || newEmail.toLowerCase(),
            is_primary: true,
            first_seen_at: now,
            last_seen_at: now,
            created_at: now,
          });
        }
      }
      candidate.primary_email = newEmail;
    }

    if (updates.secondary_email !== undefined) {
      const secEmail = updates.secondary_email ? updates.secondary_email.trim() : null;
      candidate.secondary_email = secEmail;
      if (secEmail) {
        if (!candidate.emails) candidate.emails = [];
        const existing = candidate.emails.find(e => e.email.toLowerCase() === secEmail.toLowerCase());
        if (!existing) {
          candidate.emails.push({
            id: generateUuid(),
            person_id: candidate.id,
            email: secEmail,
            normalized_email: normalizeEmail(secEmail)?.normalized || secEmail.toLowerCase(),
            is_primary: false,
            first_seen_at: now,
            last_seen_at: now,
            created_at: now,
          });
        }
      }
    }

    if (updates.primary_phone !== undefined) {
      const oldPhone = candidate.primary_phone;
      const newPhone = updates.primary_phone ? updates.primary_phone.trim() : null;
      const oldNorm = normalizePhone(oldPhone)?.normalized || (oldPhone ? oldPhone.replace(/\D/g, '') : '');
      const newNorm = normalizePhone(newPhone)?.normalized || (newPhone ? newPhone.replace(/\D/g, '') : '');
      if (oldPhone && newPhone && oldNorm !== newNorm) {
        if (!candidate.phones) candidate.phones = [];
        // Demote existing primary phone to secondary / historical
        const existingPrimary = candidate.phones.find(p => p.phone_normalized === oldNorm);
        if (existingPrimary) {
          existingPrimary.is_primary = false;
        } else {
          candidate.phones.push({
            id: generateUuid(),
            person_id: candidate.id,
            phone_original: oldPhone,
            phone_normalized: oldNorm,
            is_primary: false,
            first_seen_at: candidate.created_at,
            last_seen_at: now,
            created_at: now,
          });
        }
        if (updates.secondary_phone === undefined && !candidate.secondary_phone) {
          candidate.secondary_phone = oldPhone;
        }
      }

      if (newPhone) {
        if (!candidate.phones) candidate.phones = [];
        const existing = candidate.phones.find(p => p.phone_normalized === newNorm);
        if (existing) {
          existing.is_primary = true;
        } else {
          candidate.phones.unshift({
            id: generateUuid(),
            person_id: candidate.id,
            phone_original: newPhone,
            phone_normalized: newNorm,
            is_primary: true,
            first_seen_at: now,
            last_seen_at: now,
            created_at: now,
          });
        }
      }
      candidate.primary_phone = newPhone;
    }

    if (updates.secondary_phone !== undefined) {
      const secPhone = updates.secondary_phone ? updates.secondary_phone.trim() : null;
      candidate.secondary_phone = secPhone;
      if (secPhone) {
        if (!candidate.phones) candidate.phones = [];
        const norm = normalizePhone(secPhone)?.normalized || secPhone.replace(/\D/g, '');
        const existing = candidate.phones.find(p => p.phone_normalized === norm);
        if (!existing) {
          candidate.phones.push({
            id: generateUuid(),
            person_id: candidate.id,
            phone_original: secPhone,
            phone_normalized: norm,
            is_primary: false,
            first_seen_at: now,
            last_seen_at: now,
            created_at: now,
          });
        }
      }
    }

    // Apply other editable fields
    if (updates.full_name !== undefined) {
      candidate.full_name = updates.full_name.trim();
      const parts = candidate.full_name.split(' ');
      candidate.first_name = parts[0] || null;
      candidate.last_name = parts.slice(1).join(' ') || null;
    }
    if (updates.location !== undefined) candidate.location = updates.location ? updates.location.trim() : null;
    if (updates.preferred_location !== undefined) candidate.preferred_location = updates.preferred_location ? updates.preferred_location.trim() : null;
    if (updates.headline !== undefined) candidate.headline = updates.headline ? updates.headline.trim() : null;
    if (updates.current_title !== undefined) candidate.current_title = updates.current_title ? updates.current_title.trim() : null;
    if (updates.current_status !== undefined) candidate.current_status = updates.current_status;
    if (updates.current_owner !== undefined) candidate.current_owner = updates.current_owner ? updates.current_owner.trim() : null;
    if (updates.linkedin_url !== undefined) candidate.linkedin_url = updates.linkedin_url ? updates.linkedin_url.trim() : null;
    if (updates.resume_url !== undefined) candidate.resume_url = updates.resume_url ? updates.resume_url.trim() : null;
    if (updates.green_card !== undefined) candidate.green_card = updates.green_card ? updates.green_card.trim() : null;
    if (updates.h1b_status !== undefined) candidate.h1b_status = updates.h1b_status ? updates.h1b_status.trim() : null;
    if (updates.current_company !== undefined) candidate.current_company = updates.current_company;
    if (updates.gender !== undefined) candidate.gender = updates.gender;

    candidate.updated_at = now;
    candidate.last_activity_at = now;

    await localStore.saveToStorage();

    // Sync to Supabase
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('people').update({
          full_name: candidate.full_name,
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          gender: candidate.gender,
          primary_email: candidate.primary_email,
          secondary_email: candidate.secondary_email,
          primary_phone: candidate.primary_phone,
          secondary_phone: candidate.secondary_phone,
          location: candidate.location,
          preferred_location: candidate.preferred_location,
          headline: candidate.headline,
          current_title: candidate.current_title,
          current_status: candidate.current_status,
          current_owner: candidate.current_owner,
          linkedin_url: candidate.linkedin_url,
          current_company: candidate.current_company,
          updated_at: now,
          last_activity_at: now,
        }).eq('id', candidate.id);
      } catch (err) {
        console.warn('Supabase updateCandidateProfile error:', err);
      }
    }

    // Authoritative backend SQLite sync
    try {
      await api.updateMasterCandidate(candidate.id, updates, updatedBy);
    } catch (apiErr) {
      console.warn('Backend updateMasterCandidate error:', apiErr);
    }

    // Post-edit duplicate check (Section 9 & 2):
    // "After a user edits a name, email, or phone, rerun duplicate detection.
    // Apply automatic merging only if the updated profile satisfies every automatic merge condition."
    if (contactOrNameChanged && company === 'AaraTech') {
      const separatedSet = new Set(localStore.separatedPairs);
      const peers = localStore.people.filter(p =>
        p.id !== candidate.id &&
        !p.merged_into_id &&
        (p.current_company || p.applications?.[0]?.company || 'AaraTech') === 'AaraTech'
      );

      for (const peer of peers) {
        const evalRes = evaluateCandidatePair(candidate, peer, { separatedPairs: separatedSet });
        if (evalRes.decision === 'AUTO_MERGE') {
          const appsTarget = peer.applications?.length || 0;
          const appsCand = candidate.applications?.length || 0;
          const target = appsTarget >= appsCand ? peer : candidate;
          const source = appsTarget >= appsCand ? candidate : peer;

          const merged = await this.mergeCandidates(target.id, source.id, 'Post-Edit Auto-Merge Engine', {
            rule: evalRes.ruleTriggered,
            reason: evalRes.reason,
            isAutomatic: true,
            matchingFields: {
              name: candidate.full_name,
              email: evalRes.matchedEmail,
              phone: evalRes.matchedPhone,
            },
          });

          if (merged) {
            return {
              success: true,
              person: target,
              autoMerged: true,
              mergedWithPersonId: peer.person_id,
            };
          }
        } else if (evalRes.decision === 'MANUAL_REVIEW') {
          const exists = localStore.possibleMatches.some(pm =>
            (pm.candidate_a_id === candidate.id && pm.candidate_b_id === peer.id) ||
            (pm.candidate_a_id === peer.id && pm.candidate_b_id === candidate.id)
          );
          if (!exists) {
            const pmCode = `PM-${String(Date.now()).slice(-6)}`;
            localStore.possibleMatches.unshift({
              id: generateUuid(),
              match_code: pmCode,
              candidate_a_id: candidate.id,
              candidate_b_id: peer.id,
              match_reason: evalRes.reason,
              status: 'pending',
              created_at: now,
              name_match_status: evalRes.nameMatchStatus,
              email_match_status: evalRes.emailMatchStatus,
              phone_match_status: evalRes.phoneMatchStatus,
              decision_category: 'Manual review',
              conflicts: evalRes.conflicts,
              rule_triggered: evalRes.ruleTriggered,
            });
            await localStore.saveToStorage();
          }
        }
      }
    }

    return { success: true, person: candidate, autoMerged: false };
  },

  /**
   * Batch update gender for selected candidates
   */
  async batchUpdateGender(
    personIds: string[],
    gender: Gender,
    updatedBy: string = 'Recruiter Admin'
  ): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    await localStore.ensureInitialized();
    if (!personIds || personIds.length === 0) {
      return { success: false, updatedCount: 0, error: 'No candidates selected' };
    }

    const idSet = new Set(personIds);
    const now = new Date().toISOString();
    const updatedPeople: Person[] = [];

    for (const p of localStore.people) {
      if (idSet.has(p.id) || idSet.has(p.person_id)) {
        p.gender = gender;
        p.updated_at = now;
        updatedPeople.push(p);
      }
    }

    if (updatedPeople.length === 0) {
      return { success: false, updatedCount: 0, error: 'No matching candidates found' };
    }

    await localStore.saveToStorage();
    await indexedDBService.putBatch('people', updatedPeople);

    // Sync to Supabase in chunks
    const client = getSupabaseClient();
    if (client) {
      try {
        const matchingUuids = updatedPeople.map(p => p.id);
        const chunkSize = 100;
        for (let i = 0; i < matchingUuids.length; i += chunkSize) {
          const chunk = matchingUuids.slice(i, i + chunkSize);
          await client.from('people').update({ gender, updated_at: now }).in('id', chunk);
        }
      } catch (err) {
        console.warn('Supabase batchUpdateGender remote sync warning:', err);
      }
    }

    // Authoritative backend SQLite sync
    try {
      await api.batchUpdateMasterCandidates(personIds, { gender }, updatedBy);
    } catch (e) {
      console.warn('Backend SQLite batchUpdateMasterCandidates error:', e);
    }

    window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { entity: 'candidate', action: 'batch_gender_updated' } }));
    return { success: true, updatedCount: updatedPeople.length };
  },

  /**
   * Delete candidate from master database across all storage layers
   */
  async deleteCandidate(personId: string, user = 'Recruiter Admin'): Promise<boolean> {
    await localStore.ensureInitialized();
    const candidate = localStore.people.find(p => p.id === personId || p.person_id === personId);
    if (!candidate) return false;

    try {
      await api.deleteMasterCandidate(candidate.id, user);
    } catch (e) {
      console.warn('Backend SQLite delete master candidate error:', e);
    }

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('people').delete().eq('id', candidate.id);
      } catch (e) {
        console.warn('Supabase delete error:', e);
      }
    }

    localStore.people = localStore.people.filter(p => p.id !== candidate.id);
    await localStore.saveToStorage();
    await indexedDBService.deleteItem('people', candidate.id);

    window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { entity: 'candidate', action: 'deleted', candidateId: candidate.id } }));
    return true;
  },

  /**
   * Batch update gender for all candidates matching current active filters
   */
  async batchUpdateGenderByFilter(
    params: {
      search?: string;
      company?: string;
      status?: string;
      owner?: string;
      gender?: string;
      contactFilter?: 'all' | 'missing_phone' | 'missing_email';
      hasResume?: boolean;
      hasLinkedIn?: boolean;
      dateFrom?: string;
      dateTo?: string;
    },
    newGender: Gender,
    updatedBy: string = 'Recruiter Admin'
  ): Promise<{ success: boolean; updatedCount: number; error?: string }> {
    await localStore.ensureInitialized();

    const res = await this.getCandidates({
      ...params,
      page: 1,
      pageSize: 50000,
    });

    const matchingIds = res.candidates.map(c => c.id);
    return this.batchUpdateGender(matchingIds, newGender, updatedBy);
  },

  /**
   * Automatically detect and update gender for selected candidates or all candidates
   * using smart AI / heuristic name and screening notes detection.
   */
  async batchAutoDetectGender(
    personIds?: string[],
    updatedBy: string = 'Recruiter Admin'
  ): Promise<{
    success: boolean;
    updatedCount: number;
    maleCount: number;
    femaleCount: number;
    unchangedCount: number;
    totalMale: number;
    totalFemale: number;
    totalUnspecified: number;
    alreadyCategorized: number;
    error?: string;
  }> {
    await localStore.ensureInitialized();
    const idSet = personIds && personIds.length > 0 ? new Set(personIds) : null;
    const now = new Date().toISOString();
    const updatedPeople: Person[] = [];
    let maleCount = 0;
    let femaleCount = 0;
    let unchangedCount = 0;
    let alreadyCategorized = 0;

    for (const p of localStore.people) {
      if (idSet && !idSet.has(p.id) && !idSet.has(p.person_id)) continue;

      if (p.gender && p.gender !== 'Unspecified') {
        alreadyCategorized++;
      }

      // Extract notes/feedback from candidate if available (check original_feedback, notes_feedback, feedback, headline, current_title)
      const feedbackNotes = (p.recruiter_contacts || [])
        .map((rc: any) => rc.notes_feedback || rc.original_feedback || rc.feedback || '')
        .join(' ') + ' ' + (p.headline || '') + ' ' + (p.current_title || '');
      const detected = detectGender(null, p.first_name, p.full_name, feedbackNotes);

      if (detected !== 'Unspecified' && detected !== p.gender) {
        p.gender = detected;
        p.updated_at = now;
        updatedPeople.push(p);
        if (detected === 'Male') maleCount++;
        else if (detected === 'Female') femaleCount++;
      } else {
        unchangedCount++;
      }
    }

    if (updatedPeople.length > 0) {
      await localStore.saveToStorage();
      await indexedDBService.putBatch('people', updatedPeople);

      // Parallel chunked remote sync to Supabase with proper arguments
      const client = getSupabaseClient();
      if (client) {
        try {
          const updates = updatedPeople.map(p => ({
            id: p.id,
            gender: p.gender,
            updated_at: now,
          }));
          await parallelChunkUpsert(client, 'people', updates, 250, 3);
        } catch (err) {
          console.warn('Supabase batchAutoDetectGender sync warning:', err);
        }
      }
    }

    // Compute complete store breakdown
    let totalMale = 0;
    let totalFemale = 0;
    let totalUnspecified = 0;
    for (const p of localStore.people) {
      if (p.gender === 'Male') totalMale++;
      else if (p.gender === 'Female') totalFemale++;
      else totalUnspecified++;
    }

    return {
      success: true,
      updatedCount: updatedPeople.length,
      maleCount,
      femaleCount,
      unchangedCount,
      totalMale,
      totalFemale,
      totalUnspecified,
      alreadyCategorized,
    };
  },

  /**
   * Manually add a new candidate with full validation and duplicate detection (Section 2, 8).
   */
  async createCandidate(
    candidateData: {
      full_name: string;
      primary_email?: string | null;
      secondary_email?: string | null;
      primary_phone?: string | null;
      secondary_phone?: string | null;
      location?: string | null;
      preferred_location?: string | null;
      current_title?: string | null;
      headline?: string | null;
      current_company?: CompanyName;
      current_status?: CandidateStatus;
      current_owner?: string | null;
      linkedin_url?: string | null;
      gender?: Gender;
    },
    createdBy: string = 'Recruiter'
  ): Promise<{
    success: boolean;
    person?: Person;
    error?: string;
    autoMerged?: boolean;
    mergedWithPersonId?: string;
  }> {
    await localStore.ensureInitialized();
    const name = (candidateData.full_name || '').trim();
    if (!name) {
      return { success: false, error: 'Full name is required' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (candidateData.primary_email && candidateData.primary_email.trim() && !emailRegex.test(candidateData.primary_email.trim())) {
      return { success: false, error: 'Primary email has an invalid format' };
    }
    if (candidateData.secondary_email && candidateData.secondary_email.trim() && !emailRegex.test(candidateData.secondary_email.trim())) {
      return { success: false, error: 'Secondary email has an invalid format' };
    }
    if (candidateData.primary_phone && candidateData.primary_phone.trim()) {
      const digits = candidateData.primary_phone.replace(/\D/g, '');
      if (digits.length < 7) {
        return { success: false, error: 'Primary phone must contain at least 7 digits' };
      }
    }
    if (candidateData.secondary_phone && candidateData.secondary_phone.trim()) {
      const digits = candidateData.secondary_phone.replace(/\D/g, '');
      if (digits.length < 7) {
        return { success: false, error: 'Secondary phone must contain at least 7 digits' };
      }
    }

    const now = new Date().toISOString();
    const uuid = generateUuid();
    const pCode = `P-${String(Math.floor(100000 + Math.random() * 900000))}`;
    const nameParts = name.split(' ');
    const firstName = nameParts[0] || null;
    const lastName = nameParts.slice(1).join(' ') || null;

    const company = candidateData.current_company || 'AaraTech';
    const email = candidateData.primary_email ? candidateData.primary_email.trim() : null;
    const secEmail = candidateData.secondary_email ? candidateData.secondary_email.trim() : null;
    const phone = candidateData.primary_phone ? candidateData.primary_phone.trim() : null;
    const secPhone = candidateData.secondary_phone ? candidateData.secondary_phone.trim() : null;

    const newPerson: Person = {
      id: uuid,
      person_id: pCode,
      first_name: firstName,
      last_name: lastName,
      full_name: name,
      gender: candidateData.gender || detectGender(name),
      primary_email: email,
      secondary_email: secEmail,
      primary_phone: phone,
      secondary_phone: secPhone,
      location: candidateData.location ? candidateData.location.trim() : null,
      preferred_location: candidateData.preferred_location ? candidateData.preferred_location.trim() : null,
      zip_code: null,
      headline: candidateData.headline ? candidateData.headline.trim() : candidateData.current_title ? candidateData.current_title.trim() : null,
      current_title: candidateData.current_title ? candidateData.current_title.trim() : null,
      current_company: company,
      linkedin_url: candidateData.linkedin_url ? candidateData.linkedin_url.trim() : null,
      current_status: candidateData.current_status || 'Open',
      current_owner: candidateData.current_owner ? candidateData.current_owner.trim() : createdBy,
      created_at: now,
      updated_at: now,
      last_activity_at: now,
      emails: [],
      phones: [],
      applications: [],
      recruiter_contacts: [],
    };

    if (email) {
      newPerson.emails!.push({
        id: generateUuid(),
        person_id: uuid,
        email,
        normalized_email: normalizeEmail(email)?.normalized || email.toLowerCase(),
        is_primary: true,
        first_seen_at: now,
        last_seen_at: now,
        created_at: now,
      });
    }
    if (secEmail) {
      newPerson.emails!.push({
        id: generateUuid(),
        person_id: uuid,
        email: secEmail,
        normalized_email: normalizeEmail(secEmail)?.normalized || secEmail.toLowerCase(),
        is_primary: false,
        first_seen_at: now,
        last_seen_at: now,
        created_at: now,
      });
    }

    if (phone) {
      newPerson.phones!.push({
        id: generateUuid(),
        person_id: uuid,
        phone_original: phone,
        phone_normalized: normalizePhone(phone)?.normalized || phone.replace(/\D/g, ''),
        is_primary: true,
        first_seen_at: now,
        last_seen_at: now,
        created_at: now,
      });
    }
    if (secPhone) {
      newPerson.phones!.push({
        id: generateUuid(),
        person_id: uuid,
        phone_original: secPhone,
        phone_normalized: normalizePhone(secPhone)?.normalized || secPhone.replace(/\D/g, ''),
        is_primary: false,
        first_seen_at: now,
        last_seen_at: now,
        created_at: now,
      });
    }

    localStore.people.unshift(newPerson);

    // Audit log
    localStore.auditLogs.unshift({
      id: generateUuid(),
      user_id: createdBy,
      action: 'profile_edit',
      entity_type: 'person',
      entity_id: newPerson.person_id,
      details: {
        action: 'manual_create',
        name,
        company,
      },
      created_at: now,
    });

    await localStore.saveToStorage();

    // Supabase sync
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('people').insert({
          id: newPerson.id,
          person_id: newPerson.person_id,
          first_name: newPerson.first_name,
          last_name: newPerson.last_name,
          full_name: newPerson.full_name,
          gender: newPerson.gender,
          primary_email: newPerson.primary_email,
          secondary_email: newPerson.secondary_email,
          primary_phone: newPerson.primary_phone,
          secondary_phone: newPerson.secondary_phone,
          location: newPerson.location,
          preferred_location: newPerson.preferred_location,
          headline: newPerson.headline,
          current_title: newPerson.current_title,
          current_company: newPerson.current_company,
          current_status: newPerson.current_status,
          current_owner: newPerson.current_owner,
          linkedin_url: newPerson.linkedin_url,
          created_at: now,
          updated_at: now,
          last_activity_at: now,
        });
      } catch (err) {
        console.warn('Supabase createCandidate sync error:', err);
      }
    }

    // Duplicate detection check
    if (company === 'AaraTech') {
      const separatedSet = new Set(localStore.separatedPairs);
      const peers = localStore.people.filter(p =>
        p.id !== newPerson.id &&
        !p.merged_into_id &&
        (p.current_company || p.applications?.[0]?.company || 'AaraTech') === 'AaraTech'
      );

      for (const peer of peers) {
        const evalRes = evaluateCandidatePair(newPerson, peer, { separatedPairs: separatedSet });
        if (evalRes.decision === 'AUTO_MERGE') {
          const merged = await this.mergeCandidates(peer.id, newPerson.id, 'Safe Auto-Merge Engine', {
            rule: evalRes.ruleTriggered,
            reason: evalRes.reason,
            isAutomatic: true,
            matchingFields: {
              name: newPerson.full_name,
              email: evalRes.matchedEmail,
              phone: evalRes.matchedPhone,
            },
          });

          if (merged) {
            return {
              success: true,
              person: peer,
              autoMerged: true,
              mergedWithPersonId: peer.person_id,
            };
          }
        } else if (evalRes.decision === 'MANUAL_REVIEW') {
          const pmCode = `PM-${String(Date.now()).slice(-6)}`;
          localStore.possibleMatches.unshift({
            id: generateUuid(),
            match_code: pmCode,
            candidate_a_id: peer.id,
            candidate_b_id: newPerson.id,
            match_reason: evalRes.reason,
            status: 'pending',
            created_at: now,
            name_match_status: evalRes.nameMatchStatus,
            email_match_status: evalRes.emailMatchStatus,
            phone_match_status: evalRes.phoneMatchStatus,
            decision_category: 'Manual review',
            conflicts: evalRes.conflicts,
            rule_triggered: evalRes.ruleTriggered,
          });
          await localStore.saveToStorage();
        }
      }
    }

    return { success: true, person: newPerson, autoMerged: false };
  },

  /**
   * Sweeps candidate pool (default AaraTech) and immediately auto-merges
   * any eligible high-confidence duplicate pairs.
   * Conforms to Sections 2, 6, 7, 15 of Antigravity Master Spec.
   */
  async autoMergeEligibleCandidates(company: 'AaraTech' | 'ClinisolTech' = 'AaraTech'): Promise<{
    mergedCount: number;
    mergedPairs: { targetId: string; sourceId: string; reason: string }[];
  }> {
    await localStore.ensureInitialized();
    if (company !== 'AaraTech') {
      // Logic strictly within AaraTech database
      return { mergedCount: 0, mergedPairs: [] };
    }

    const separatedSet = new Set(localStore.separatedPairs);
    const activeCandidates = localStore.people.filter(p => {
      const pComp = p.current_company || p.applications?.[0]?.company || 'AaraTech';
      return pComp === company && !p.merged_into_id;
    });

    let mergedCount = 0;
    const mergedPairs: { targetId: string; sourceId: string; reason: string }[] = [];

    for (let i = 0; i < activeCandidates.length; i++) {
      for (let j = i + 1; j < activeCandidates.length; j++) {
        const candA = activeCandidates[i];
        const candB = activeCandidates[j];

        if (candA.merged_into_id || candB.merged_into_id) continue;

        const res = evaluateCandidatePair(candA, candB, { separatedPairs: separatedSet });
        if (res.decision === 'AUTO_MERGE') {
          const appsA = candA.applications?.length || 0;
          const appsB = candB.applications?.length || 0;
          const target = appsB > appsA ? candB : candA;
          const source = appsB > appsA ? candA : candB;

          const success = await this.mergeCandidates(target.id, source.id, 'Automatic Deduplication Engine', {
            rule: res.ruleTriggered,
            reason: res.reason,
            isAutomatic: true,
            matchingFields: {
              name: candA.full_name,
              email: res.matchedEmail,
              phone: res.matchedPhone,
            },
          });

          if (success) {
            mergedCount++;
            mergedPairs.push({
              targetId: target.person_id,
              sourceId: source.person_id,
              reason: res.reason,
            });

            // Mark any pending possible match records as merged
            localStore.possibleMatches.forEach(pm => {
              if (
                (pm.candidate_a_id === target.id && pm.candidate_b_id === source.id) ||
                (pm.candidate_a_id === source.id && pm.candidate_b_id === target.id)
              ) {
                pm.status = 'merged';
                pm.reviewed_by = 'Automatic Deduplication Engine';
                pm.reviewed_at = new Date().toISOString();
              }
            });
          }
        }
      }
    }

    if (mergedCount > 0) {
      await localStore.saveToStorage();
    }

    return { mergedCount, mergedPairs };
  },

  /**
   * Resolves canonical root person for a given person ID (Section 12: Chain safety).
   * Traverses merged_into_id links to prevent circular references or transitive chains.
   */
  resolveCanonicalPerson(personId: string, visited: Set<string> = new Set()): Person | undefined {
    if (visited.has(personId)) {
      console.warn('Circular merge reference detected for', personId);
      return localStore.people.find(p => p.id === personId);
    }
    visited.add(personId);
    const person = localStore.people.find(p => p.id === personId || p.person_id === personId);
    if (!person) return undefined;
    if (person.merged_into_id && person.merged_into_id !== person.id) {
      return this.resolveCanonicalPerson(person.merged_into_id, visited);
    }
    return person;
  },

  /**
   * Merge Candidates: combines emails, phones, applications, recruiter_contacts from source to target.
   * Strictly adheres to Sections 2, 8, 10, 11, 12 of Antigravity Master Spec.
   */
  async mergeCandidates(
    targetPersonId: string,
    sourcePersonId: string,
    mergedBy: string = 'Admin',
    decisionMetadata?: {
      rule?: string;
      reason?: string;
      isAutomatic?: boolean;
      matchingFields?: { name?: string; email?: string; phone?: string };
    }
  ): Promise<boolean> {
    await localStore.ensureInitialized();
    const rawTarget = localStore.people.find(p => p.id === targetPersonId || p.person_id === targetPersonId);
    const rawSource = localStore.people.find(p => p.id === sourcePersonId || p.person_id === sourcePersonId);

    if (!rawTarget || !rawSource || rawTarget.id === rawSource.id) return false;

    // Resolve canonical profiles (Section 12: Chain safety)
    const target = this.resolveCanonicalPerson(rawTarget.id) || rawTarget;
    const source = this.resolveCanonicalPerson(rawSource.id) || rawSource;

    if (target.id === source.id) {
      return true; // Already merged into the same canonical profile
    }

    // STRICT COMPANY ISOLATION (Section 2): AaraTech and ClinisolTech can NEVER be merged
    const targetComp = target.current_company || (target.applications && target.applications[0]?.company) || 'AaraTech';
    const sourceComp = source.current_company || (source.applications && source.applications[0]?.company) || 'AaraTech';
    if (targetComp !== 'AaraTech' || sourceComp !== 'AaraTech' || targetComp !== sourceComp) {
      console.warn('Cross-company merge blocked:', targetComp, 'vs', sourceComp);
      return false;
    }

    // Check if previously separated (Section 7 & 12)
    const pairKey1 = `${target.id}:${source.id}`;
    const pairKey2 = `${source.id}:${target.id}`;
    if (localStore.separatedPairs.includes(pairKey1) || localStore.separatedPairs.includes(pairKey2)) {
      if (decisionMetadata?.isAutomatic) {
        console.warn('Auto-merge blocked: Pair was previously marked as Not The Same Person.');
        return false;
      }
    }

    // Create deep snapshots of both profiles for reversible unmerge (Section 11)
    const sourceAppIds = (source.applications || []).map(a => a.id);
    const sourceContactIds = (source.recruiter_contacts || []).map(c => c.id);
    const sourceEmailIds = (source.emails || []).map(e => e.id);
    const sourcePhoneIds = (source.phones || []).map(p => p.id);

    const snapshot = {
      source: JSON.parse(JSON.stringify(source)),
      target: JSON.parse(JSON.stringify(target)),
      sourceApplicationIds: sourceAppIds,
      sourceRecruiterContactIds: sourceContactIds,
      sourceEmailIds: sourceEmailIds,
      sourcePhoneIds: sourcePhoneIds,
    };
    const now = new Date().toISOString();

    // 1. Combine Emails: preserve all historical emails with original sources
    if (source.emails) {
      if (!target.emails) target.emails = [];
      const existingEmailSet = new Set(target.emails.map(e => e.normalized_email));
      for (const se of source.emails) {
        if (!existingEmailSet.has(se.normalized_email)) {
          target.emails.push({ ...se, person_id: target.id, is_primary: false });
          existingEmailSet.add(se.normalized_email);
        }
      }
    }

    // 2. Combine Phones: preserve all historical phones with original sources
    if (source.phones) {
      if (!target.phones) target.phones = [];
      const existingPhoneSet = new Set(target.phones.map(p => p.phone_normalized));
      for (const sp of source.phones) {
        if (!existingPhoneSet.has(sp.phone_normalized)) {
          target.phones.push({ ...sp, person_id: target.id, is_primary: false });
          existingPhoneSet.add(sp.phone_normalized);
        }
      }
    }

    // 3. Combine Applications: preserve all historical applications and statuses without duplicates
    if (source.applications) {
      if (!target.applications) target.applications = [];
      for (const app of source.applications) {
        const normSourceRole = (app.job_title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const existing = target.applications.find(a =>
          a.company === app.company &&
          (a.job_title || '').toLowerCase().replace(/[^a-z0-9]/g, '') === normSourceRole
        );
        if (existing) {
          if (!existing.resume_link && app.resume_link) {
            existing.resume_link = app.resume_link;
          }
          if (app.current_stage && app.current_stage !== 'Applied' && existing.current_stage === 'Applied') {
            existing.current_stage = app.current_stage;
          }
        } else {
          target.applications.push({ ...app, person_id: target.id });
        }
      }
    }

    // 4. Combine Recruiter Contacts: preserve verbatim feedback without duplicate rows
    if (source.recruiter_contacts) {
      if (!target.recruiter_contacts) target.recruiter_contacts = [];
      for (const contact of source.recruiter_contacts) {
        const rawFb = contact.original_feedback || contact.raw_feedback || contact.notes || '';
        const recName = (contact.recruiter_name || '').toLowerCase();
        const isDup = target.recruiter_contacts.some(c =>
          (c.recruiter_name || '').toLowerCase() === recName &&
          (c.original_feedback === rawFb || c.raw_feedback === rawFb || c.notes === rawFb)
        );
        if (!isDup) {
          target.recruiter_contacts.push({ ...contact, person_id: target.id });
        }
      }
    }

    // Mark source as merged
    source.merged_into_id = target.id;
    source.current_status = 'Merged';
    target.last_activity_at = now;

    // Record Merge History (Section 11)
    const mergeRecord: MergeHistory = {
      id: generateUuid(),
      primary_person_id: target.id,
      merged_person_id: source.id,
      merged_by: mergedBy,
      merged_at: now,
      can_unmerge: true,
      snapshot,
      decision_rule: decisionMetadata?.rule || 'MANUAL_RECRUITER_CONFIRMATION',
      decision_reason: decisionMetadata?.reason || 'Merged via recruiter confirmation',
      is_automatic: decisionMetadata?.isAutomatic || false,
      matching_fields: decisionMetadata?.matchingFields,
    };
    localStore.mergeHistories.unshift(mergeRecord);

    // Record Audit Log (Section 11)
    localStore.auditLogs.unshift({
      id: generateUuid(),
      user_id: mergedBy,
      action: 'merge',
      entity_type: 'person',
      entity_id: target.person_id,
      details: {
        mergedPersonId: source.person_id,
        targetPersonId: target.person_id,
        isAutomatic: decisionMetadata?.isAutomatic || false,
        rule: decisionMetadata?.rule || 'MANUAL_CONFIRMATION',
        reason: decisionMetadata?.reason,
      },
      created_at: now,
    });

    // Update possible matches that referenced either candidate
    localStore.possibleMatches.forEach(pm => {
      if (
        (pm.candidate_a_id === source.id && pm.candidate_b_id === target.id) ||
        (pm.candidate_b_id === source.id && pm.candidate_a_id === target.id)
      ) {
        pm.status = 'merged';
        pm.reviewed_by = mergedBy;
        pm.reviewed_at = now;
      }
    });

    await localStore.saveToStorage();

    // Sync to Supabase if connected
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('people').update({ merged_into_id: target.id, current_status: 'Merged' }).eq('id', source.id);
        await client.from('person_emails').update({ person_id: target.id }).eq('person_id', source.id);
        await client.from('person_phones').update({ person_id: target.id }).eq('person_id', source.id);
        await client.from('applications').update({ person_id: target.id }).eq('person_id', source.id);
        await client.from('recruiter_contacts').update({ person_id: target.id }).eq('person_id', source.id);
        await client.from('merge_history').insert(mergeRecord);
      } catch (e) {
        console.warn('Supabase merge sync error:', e);
      }
    }

    return true;
  },

  /**
   * Unmerge Candidates: Restores identity, applications, verbatim feedback, and separated records.
   * Strictly adheres to Section 11 of Antigravity Master Spec.
   */
  async unmergeCandidates(mergeHistoryId: string): Promise<boolean> {
    await localStore.ensureInitialized();
    const history = localStore.mergeHistories.find(h => h.id === mergeHistoryId);
    if (!history || !history.can_unmerge) return false;

    const source = localStore.people.find(p => p.id === history.merged_person_id);
    const target = localStore.people.find(p => p.id === history.primary_person_id);

    const now = new Date().toISOString();

    // Restore source profile from snapshot
    if (history.snapshot) {
      const snapSource = history.snapshot.source || history.snapshot;
      const snapAppIds = new Set(history.snapshot.sourceApplicationIds || []);
      const snapContactIds = new Set(history.snapshot.sourceRecruiterContactIds || []);
      const snapEmailIds = new Set(history.snapshot.sourceEmailIds || []);
      const snapPhoneIds = new Set(history.snapshot.sourcePhoneIds || []);

      // If source exists in store, restore all attributes
      if (source) {
        source.merged_into_id = null;
        source.current_status = snapSource.current_status || 'Assigned';
        source.applications = snapSource.applications || [];
        source.recruiter_contacts = snapSource.recruiter_contacts || [];
        source.emails = snapSource.emails || [];
        source.phones = snapSource.phones || [];
        source.updated_at = now;
      } else {
        // Re-insert source profile if it was purged
        localStore.people.push({
          ...snapSource,
          merged_into_id: null,
          current_status: snapSource.current_status || 'Assigned',
          updated_at: now,
        });
      }

      // On target, remove records that came from source
      if (target) {
        if (target.applications && snapAppIds.size > 0) {
          target.applications = target.applications.filter(a => !snapAppIds.has(a.id));
        }
        if (target.recruiter_contacts && snapContactIds.size > 0) {
          target.recruiter_contacts = target.recruiter_contacts.filter(c => !snapContactIds.has(c.id));
        }
        if (target.emails && snapEmailIds.size > 0) {
          target.emails = target.emails.filter(e => !snapEmailIds.has(e.id));
        }
        if (target.phones && snapPhoneIds.size > 0) {
          target.phones = target.phones.filter(p => !snapPhoneIds.has(p.id));
        }
        target.updated_at = now;
      }
    } else if (source) {
      source.merged_into_id = null;
      source.current_status = 'Assigned';
    }

    // Permanently record that these profiles were unmerged and must NEVER auto-merge again (Section 7)
    const pairKey1 = `${history.primary_person_id}:${history.merged_person_id}`;
    const pairKey2 = `${history.merged_person_id}:${history.primary_person_id}`;
    if (!localStore.separatedPairs.includes(pairKey1)) localStore.separatedPairs.push(pairKey1);
    if (!localStore.separatedPairs.includes(pairKey2)) localStore.separatedPairs.push(pairKey2);

    history.can_unmerge = false;
    history.unmerged_at = now;

    // Record Audit Log (Section 11)
    localStore.auditLogs.unshift({
      id: generateUuid(),
      user_id: 'Admin',
      action: 'unmerge',
      entity_type: 'person',
      entity_id: target ? target.person_id : history.primary_person_id,
      details: {
        unmergedPersonId: source ? source.person_id : history.merged_person_id,
        mergeHistoryId,
        reason: 'Restored original profiles and associations via unmerge',
      },
      created_at: now,
    });

    await localStore.saveToStorage();

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('people').update({ merged_into_id: null, current_status: 'Assigned' }).eq('id', history.merged_person_id);
        await client.from('merge_history').update({ can_unmerge: false, unmerged_at: now }).eq('id', history.id);
      } catch (e) {
        console.warn('Supabase unmerge sync warning:', e);
      }
    }

    return true;
  },

  /**
   * Get all active possible matches enriched with Section 9 match statuses
   */
  async getPossibleMatches(): Promise<PossibleMatch[]> {
    await localStore.ensureInitialized();
    const list = localStore.possibleMatches.filter(pm => pm.status === 'pending');
    const separatedSet = new Set(localStore.separatedPairs);
    const validMatches: PossibleMatch[] = [];
    let stateChanged = false;

    for (const pm of list) {
      pm.candidate_a = localStore.people.find(p => p.id === pm.candidate_a_id);
      pm.candidate_b = localStore.people.find(p => p.id === pm.candidate_b_id);

      if (!pm.candidate_a || !pm.candidate_b || pm.candidate_a.merged_into_id || pm.candidate_b.merged_into_id) {
        pm.status = 'rejected';
        stateChanged = true;
        continue;
      }

      const evalRes = evaluateCandidatePair(pm.candidate_a, pm.candidate_b, { separatedPairs: separatedSet });

      // User Rule 1: Names matched but phone and email are different -> different profiles (NO_MATCH)
      // Automatically prune non-matches from the pending review queue
      if (evalRes.decision === 'NO_MATCH') {
        pm.status = 'rejected';
        stateChanged = true;
        continue;
      }

      pm.name_match_status = evalRes.nameMatchStatus;
      pm.email_match_status = evalRes.emailMatchStatus;
      pm.phone_match_status = evalRes.phoneMatchStatus;
      pm.decision_category = evalRes.decision === 'AUTO_MERGE' ? 'Eligible for auto-merge' : 'Manual review';
      pm.conflicts = evalRes.conflicts;
      pm.rule_triggered = evalRes.ruleTriggered;
      pm.match_reason = evalRes.reason;
      validMatches.push(pm);
    }

    if (stateChanged) {
      await localStore.saveToStorage();
    }

    return validMatches;
  },

  /**
   * Resolve a possible match (review later, reject, or merged).
   * If rejected ('Not The Same Person'), permanently registers the pair as separated (Section 7 & 8).
   */
  async resolvePossibleMatch(matchId: string, status: 'merged' | 'rejected' | 'reviewed_later', reviewer: string = 'Admin'): Promise<boolean> {
    await localStore.ensureInitialized();
    const pm = localStore.possibleMatches.find(p => p.id === matchId || p.match_code === matchId);
    if (!pm) return false;

    pm.status = status;
    pm.reviewed_by = reviewer;
    pm.reviewed_at = new Date().toISOString();

    if (status === 'rejected') {
      const pairKey1 = `${pm.candidate_a_id}:${pm.candidate_b_id}`;
      const pairKey2 = `${pm.candidate_b_id}:${pm.candidate_a_id}`;
      if (!localStore.separatedPairs.includes(pairKey1)) localStore.separatedPairs.push(pairKey1);
      if (!localStore.separatedPairs.includes(pairKey2)) localStore.separatedPairs.push(pairKey2);

      localStore.auditLogs.unshift({
        id: generateUuid(),
        user_id: reviewer,
        action: 'status_change',
        entity_type: 'person',
        entity_id: pm.match_code,
        details: {
          action: 'rejected_not_the_same_person',
          candidateA: pm.candidate_a_id,
          candidateB: pm.candidate_b_id,
          reason: 'Marked as Not The Same Person. Automatic merge permanently blocked.',
        },
        created_at: pm.reviewed_at,
      });
    }

    await localStore.saveToStorage();

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('possible_matches').update({
          status,
          reviewed_by: reviewer,
          reviewed_at: pm.reviewed_at,
        }).eq('id', pm.id);
      } catch (e) {
        console.warn('Supabase match resolve error:', e);
      }
    }
    return true;
  },

  /**
   * Checks whether automatic merging is currently enabled
   */
  isAutoMergeEnabled(): boolean {
    return localStore.autoMergeEnabled;
  },

  /**
   * Configures automatic merging toggle (Section 13)
   */
  setAutoMergeEnabled(enabled: boolean): void {
    localStore.autoMergeEnabled = enabled;
    try {
      localStorage.setItem('aat_auto_merge_enabled', String(enabled));
    } catch {}
  },

  /**
   * Evaluates all candidates within company pool for duplicates using Section 6 Decision Table.
   * Supports Dry-Run Mode and Safe Auto-Merge execution (Section 13).
   */
  async runDuplicateScan(options: {
    company?: 'AaraTech' | 'ClinisolTech';
    dryRun?: boolean;
    autoMerge?: boolean;
  } = {}): Promise<{
    totalPairsEvaluated: number;
    eligibleForAutoMergeCount: number;
    autoMergedCount: number;
    manualReviewCount: number;
    noMatchCount: number;
    details: {
      pairId: string;
      candidateA: { id: string; personId: string; name: string; email?: string; phone?: string };
      candidateB: { id: string; personId: string; name: string; email?: string; phone?: string };
      decision: DuplicateDecisionOutcome;
      reason: string;
      ruleTriggered: string;
      nameMatchStatus: string;
      emailMatchStatus: string;
      phoneMatchStatus: string;
      conflicts: string[];
    }[];
  }> {
    await localStore.ensureInitialized();
    const company = options.company || 'AaraTech';
    const dryRun = options.dryRun ?? false;
    const shouldAutoMerge = !dryRun && (options.autoMerge ?? localStore.autoMergeEnabled);

    // Filter active non-merged candidates belonging to this company pool
    const activeCandidates = localStore.people.filter(p => {
      const pComp = p.current_company || p.applications?.[0]?.company || 'AaraTech';
      return pComp === company && !p.merged_into_id;
    });

    const separatedSet = new Set(localStore.separatedPairs);
    let totalPairsEvaluated = 0;
    let eligibleForAutoMergeCount = 0;
    let autoMergedCount = 0;
    let manualReviewCount = 0;
    let noMatchCount = 0;
    const details: any[] = [];

    for (let i = 0; i < activeCandidates.length; i++) {
      for (let j = i + 1; j < activeCandidates.length; j++) {
        const candA = activeCandidates[i];
        const candB = activeCandidates[j];

        // Skip if either was already merged during this active loop
        if (candA.merged_into_id || candB.merged_into_id) continue;

        totalPairsEvaluated++;
        const res = evaluateCandidatePair(candA, candB, { separatedPairs: separatedSet });

        if (res.decision === 'AUTO_MERGE') {
          eligibleForAutoMergeCount++;
          details.push({
            pairId: `${candA.person_id}-${candB.person_id}`,
            candidateA: { id: candA.id, personId: candA.person_id, name: candA.full_name, email: candA.primary_email || undefined, phone: candA.primary_phone || undefined },
            candidateB: { id: candB.id, personId: candB.person_id, name: candB.full_name, email: candB.primary_email || undefined, phone: candB.primary_phone || undefined },
            decision: res.decision,
            reason: res.reason,
            ruleTriggered: res.ruleTriggered,
            nameMatchStatus: res.nameMatchStatus,
            emailMatchStatus: res.emailMatchStatus,
            phoneMatchStatus: res.phoneMatchStatus,
            conflicts: res.conflicts,
          });

          if (shouldAutoMerge) {
            // Select primary master profile according to existing rules:
            // Prefer profile with earlier created_at, or more applications, or candidate A
            const appsA = candA.applications?.length || 0;
            const appsB = candB.applications?.length || 0;
            const target = appsB > appsA ? candB : candA;
            const source = appsB > appsA ? candA : candB;

            const mergeSuccess = await this.mergeCandidates(target.id, source.id, 'Safe Auto-Merge Engine', {
              rule: res.ruleTriggered,
              reason: res.reason,
              isAutomatic: true,
              matchingFields: {
                name: candA.full_name,
                email: res.matchedEmail,
                phone: res.matchedPhone,
              },
            });
            if (mergeSuccess) {
              autoMergedCount++;
            }
          }
        } else if (res.decision === 'MANUAL_REVIEW') {
          manualReviewCount++;
          details.push({
            pairId: `${candA.person_id}-${candB.person_id}`,
            candidateA: { id: candA.id, personId: candA.person_id, name: candA.full_name, email: candA.primary_email || undefined, phone: candA.primary_phone || undefined },
            candidateB: { id: candB.id, personId: candB.person_id, name: candB.full_name, email: candB.primary_email || undefined, phone: candB.primary_phone || undefined },
            decision: res.decision,
            reason: res.reason,
            ruleTriggered: res.ruleTriggered,
            nameMatchStatus: res.nameMatchStatus,
            emailMatchStatus: res.emailMatchStatus,
            phoneMatchStatus: res.phoneMatchStatus,
            conflicts: res.conflicts,
          });

          if (!dryRun) {
            // Ensure a PossibleMatch record exists in queue
            const exists = localStore.possibleMatches.some(pm =>
              (pm.candidate_a_id === candA.id && pm.candidate_b_id === candB.id) ||
              (pm.candidate_a_id === candB.id && pm.candidate_b_id === candA.id)
            );
            if (!exists) {
              const pmCode = `PM-${String(Date.now()).slice(-6)}`;
              const newPm: PossibleMatch = {
                id: generateUuid(),
                match_code: pmCode,
                candidate_a_id: candA.id,
                candidate_b_id: candB.id,
                match_reason: res.reason,
                status: 'pending',
                created_at: new Date().toISOString(),
                name_match_status: res.nameMatchStatus,
                email_match_status: res.emailMatchStatus,
                phone_match_status: res.phoneMatchStatus,
                decision_category: 'Manual review',
                conflicts: res.conflicts,
                rule_triggered: res.ruleTriggered,
              };
              localStore.possibleMatches.unshift(newPm);
            }
          }
        } else {
          noMatchCount++;
        }
      }
    }

    if (!dryRun) {
      await localStore.saveToStorage();
    }

    return {
      totalPairsEvaluated,
      eligibleForAutoMergeCount,
      autoMergedCount,
      manualReviewCount,
      noMatchCount,
      details,
    };
  },

  /**
   * Get Jobs
   */
  async getJobs(): Promise<Job[]> {
    await localStore.ensureInitialized();
    return [...localStore.jobs];
  },

  /**
   * Add a new Job
   */
  async addJob(job: Omit<Job, 'id' | 'created_at' | 'updated_at'>): Promise<Job> {
    await localStore.ensureInitialized();
    const newJob: Job = {
      ...job,
      id: generateUuid(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    localStore.jobs.unshift(newJob);
    await localStore.saveToStorage();

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('jobs').insert(newJob);
      } catch (e) {
        console.warn('Supabase job insert error:', e);
      }
    }
    return newJob;
  },

  /**
   * Update Job Status
   */
  async updateJobStatus(jobId: string, status: 'Active' | 'Closed' | 'Draft'): Promise<boolean> {
    await localStore.ensureInitialized();
    const job = localStore.jobs.find(j => j.id === jobId || j.job_id === jobId);
    if (!job) return false;
    job.status = status;
    job.updated_at = new Date().toISOString();
    await localStore.saveToStorage();

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('jobs').update({ status, updated_at: job.updated_at }).eq('id', job.id);
      } catch (e) {
        console.warn('Supabase job update error:', e);
      }
    }
    return true;
  },

  /**
   * Get Imports
   */
  async getImports(): Promise<ImportRecord[]> {
    await localStore.ensureInitialized();
    return [...localStore.imports];
  },

  /**
   * Get Audit Logs
   */
  async getAuditLogs(): Promise<AuditLog[]> {
    await localStore.ensureInitialized();
    return [...localStore.auditLogs];
  },

  /**
   * Get Merge Histories
   */
  async getMergeHistories(): Promise<MergeHistory[]> {
    await localStore.ensureInitialized();
    return [...localStore.mergeHistories];
  },

  /**
   * Get live system dashboard counters
   */
  async getDashboardStats(companyFilter?: 'AaraTech' | 'ClinisolTech' | 'Both') {
    await localStore.ensureInitialized();
    let relevantPeople = localStore.people.filter(p => !p.merged_into_id);

    if (companyFilter && companyFilter !== 'Both') {
      relevantPeople = relevantPeople.filter(p =>
        (p.applications && p.applications.some(a => a.company === companyFilter)) ||
        p.current_company === companyFilter
      );
    }

    const totalPeople = relevantPeople.length;
    let totalApplications = 0;
    let recruiterContactsCount = 0;

    relevantPeople.forEach(p => {
      if (p.applications) {
        if (companyFilter && companyFilter !== 'Both') {
          totalApplications += p.applications.filter(a => a.company === companyFilter).length;
        } else {
          totalApplications += p.applications.length;
        }
      }
      if (p.recruiter_contacts) {
        recruiterContactsCount += p.recruiter_contacts.length;
      }
    });

    const pendingMatches = localStore.possibleMatches.filter(pm => pm.status === 'pending').length;
    const filesImported = localStore.imports.length;

    // Status breakdown
    const statusCounts: Record<string, number> = {};
    relevantPeople.forEach(p => {
      statusCounts[p.current_status] = (statusCounts[p.current_status] || 0) + 1;
    });

    // Company breakdown
    let aaraTechCount = 0;
    let clinisolTechCount = 0;
    localStore.people.filter(p => !p.merged_into_id).forEach(p => {
      if (p.applications) {
        if (p.applications.some(a => a.company === 'AaraTech')) aaraTechCount++;
        if (p.applications.some(a => a.company === 'ClinisolTech')) clinisolTechCount++;
      }
    });

    // Gender breakdown
    const genderCounts = { Male: 0, Female: 0, Other: 0, Unspecified: 0 };
    relevantPeople.forEach(p => {
      const g = p.gender || 'Unspecified';
      genderCounts[g] = (genderCounts[g] || 0) + 1;
    });

    return {
      totalPeople,
      totalApplications,
      recruiterContacts: recruiterContactsCount,
      possibleMatches: pendingMatches,
      filesImported,
      statusCounts,
      genderBreakdown: genderCounts,
      companyBreakdown: {
        AaraTech: aaraTechCount,
        ClinisolTech: clinisolTechCount,
      },
    };
  },

  /**
   * Access to in-memory people list for matching engine
   * Strictly filtered by company to isolate AaraTech and ClinisolTech deduplication
   */
  getAllPeopleForMatching(company?: CompanyName): Person[] {
    return localStore.people.filter(p => {
      if (p.merged_into_id) return false;
      if (!company) return true;
      const pCompany = p.current_company || (p.applications && p.applications.find(a => a.company)?.company);
      return pCompany === company;
    });
  },

  /**
   * Save a newly imported or modified batch of people
   * Persists PERMANENTLY to IndexedDB and syncs to Supabase PostgreSQL when connected
   */
  async saveImportBatch(
    newCandidates: Person[],
    updatedCandidates: Person[],
    importRecord: ImportRecord,
    newPossibleMatches: PossibleMatch[],
    newIncompleteRecords: IncompleteRecord[] = []
  ): Promise<{ success: boolean; cloudSynced: boolean; error?: string }> {
    await localStore.ensureInitialized();

    // 1. Add new candidates to memory
    for (const nc of newCandidates) {
      localStore.people.unshift(nc);
    }

    // 2. Update existing candidates in memory
    for (const uc of updatedCandidates) {
      const idx = localStore.people.findIndex(p => p.id === uc.id);
      if (idx !== -1) {
        localStore.people[idx] = uc;
      }
    }

    // 3. Add import record
    localStore.imports.unshift(importRecord);

    // 4. Add possible matches
    for (const pm of newPossibleMatches) {
      localStore.possibleMatches.unshift(pm);
    }

    // 5. Add incomplete records (Requires recruiter review before joining master database)
    if (newIncompleteRecords && newIncompleteRecords.length > 0) {
      const existingSigs = new Set(
        localStore.incompleteRecords.map(r =>
          `${r.source_file || ''}|${r.source_row || ''}|${(r.raw_name || '').toLowerCase().trim()}|${(r.raw_email || '').toLowerCase().trim()}|${(r.raw_phone || '').replace(/\D/g, '')}|${(r.recruiter_feedback || '').toLowerCase().trim().slice(0, 40)}`
        )
      );
      for (const inc of newIncompleteRecords) {
        const sig = `${inc.source_file || ''}|${inc.source_row || ''}|${(inc.raw_name || '').toLowerCase().trim()}|${(inc.raw_email || '').toLowerCase().trim()}|${(inc.raw_phone || '').replace(/\D/g, '')}|${(inc.recruiter_feedback || '').toLowerCase().trim().slice(0, 40)}`;
        if (!existingSigs.has(sig)) {
          existingSigs.add(sig);
          localStore.incompleteRecords.unshift(inc);
        }
      }
    }

    // 6. Log audit
    const auditEntry: AuditLog = {
      id: generateUuid(),
      user_id: importRecord.uploaded_by || 'Admin',
      action: 'import',
      entity_type: 'import',
      entity_id: importRecord.id,
      details: {
        fileName: importRecord.file_name,
        totalRows: importRecord.total_rows,
        newPeople: importRecord.new_people,
        matched: importRecord.matched_people,
        possibleMatches: importRecord.possible_matches,
        incomplete: newIncompleteRecords?.length || 0,
      },
      created_at: new Date().toISOString(),
    };
    localStore.auditLogs.unshift(auditEntry);

    // 7. PERMANENT BROWSER STORAGE via Native IndexedDB
    await localStore.saveToStorage();

    // 7b. Sync batch to Backend SQLite Database
    try {
      const allToSync = [...newCandidates, ...updatedCandidates];
      if (allToSync.length > 0) {
        await api.upsertMasterCandidatesBatch(allToSync, importRecord);
      }
    } catch (sqliteErr) {
      console.warn('Backend SQLite batch upsert notice:', sqliteErr);
    }

    // 8. Sync to Cloud Supabase PostgreSQL if client is active
    let cloudSynced = false;
    let syncError: string | undefined;

    const client = getSupabaseClient();
    if (client) {
      try {
        const syncResult = await this.syncBatchToSupabase(
          newCandidates,
          updatedCandidates,
          importRecord,
          newPossibleMatches,
          auditEntry,
          newIncompleteRecords
        );
        cloudSynced = syncResult.success;
        if (!syncResult.success) {
          syncError = syncResult.error;
        }
      } catch (err: any) {
        console.warn('Supabase remote sync warning (data is safely saved in local IndexedDB):', err);
        syncError = err?.message || 'Remote sync failed';
      }
    }

    return {
      success: true,
      cloudSynced,
      error: syncError,
    };
  },

  /**
   * Push a specific import batch directly to Supabase PostgreSQL in chunked transactions
   */
  async syncBatchToSupabase(
    newCandidates: Person[],
    updatedCandidates: Person[],
    importRecord: ImportRecord,
    newPossibleMatches: PossibleMatch[],
    auditEntry?: AuditLog,
    newIncompleteRecords: IncompleteRecord[] = []
  ): Promise<{ success: boolean; error?: string }> {
    const client = getSupabaseClient();
    if (!client) return { success: false, error: 'Supabase client not configured' };

    try {
      // A. Insert Import record
      const { error: impError } = await client.from('imports').upsert({
        id: importRecord.id,
        file_name: importRecord.file_name,
        file_type: importRecord.file_type,
        import_status: importRecord.import_status,
        total_rows: importRecord.total_rows,
        processed_rows: importRecord.processed_rows,
        new_people: importRecord.new_people,
        matched_people: importRecord.matched_people,
        possible_matches: importRecord.possible_matches,
        applications_created: importRecord.applications_created,
        contacts_created: importRecord.contacts_created,
        errors: importRecord.errors,
        error_details: importRecord.error_details || [],
        uploaded_by: importRecord.uploaded_by || 'Admin',
        started_at: importRecord.started_at,
        completed_at: importRecord.completed_at || new Date().toISOString(),
        created_at: importRecord.created_at,
      });

      if (impError) {
        console.warn('Supabase import record insert warning:', impError);
      }

      // B. Upsert People master records (Strip relation child arrays before inserting into people table)
      const allBatchCandidates = [...newCandidates, ...updatedCandidates];
      const peopleRows = allBatchCandidates.map(p => ({
        id: p.id,
        person_id: p.person_id,
        first_name: p.first_name || null,
        last_name: p.last_name || null,
        full_name: p.full_name,
        gender: p.gender || 'Unspecified',
        primary_email: p.primary_email || null,
        primary_phone: p.primary_phone || null,
        location: p.location || null,
        zip_code: p.zip_code || null,
        headline: p.headline || null,
        current_title: p.current_title || null,
        current_company: p.current_company || (p.applications && p.applications[0]?.company) || null,
        linkedin_url: p.linkedin_url || null,
        current_status: p.current_status || 'New',
        current_owner: p.current_owner || 'Unassigned',
        merged_into_id: p.merged_into_id || null,
        created_at: p.created_at,
        updated_at: p.updated_at,
        last_activity_at: p.last_activity_at,
      }));

      for (const chunk of chunkArray(peopleRows, 50)) {
        const { error: peopleErr } = await client.from('people').upsert(chunk, { onConflict: 'id' });
        if (peopleErr) {
          console.warn('Supabase people chunk upsert warning:', peopleErr);
        }
      }

      // C. Upsert Emails
      const allEmails: any[] = [];
      for (const p of allBatchCandidates) {
        if (p.emails && p.emails.length > 0) {
          for (const e of p.emails) {
            allEmails.push({
              id: e.id,
              person_id: p.id,
              email: e.email,
              normalized_email: e.normalized_email,
              is_primary: e.is_primary ?? false,
              source: e.source || null,
              source_file: e.source_file || null,
              source_row: e.source_row || null,
              first_seen_at: e.first_seen_at || p.created_at,
              last_seen_at: e.last_seen_at || p.created_at,
              created_at: e.created_at || p.created_at,
            });
          }
        }
      }

      if (allEmails.length > 0) {
        for (const chunk of chunkArray(allEmails, 50)) {
          const { error: emailErr } = await client.from('person_emails').upsert(chunk, { onConflict: 'id' });
          if (emailErr) console.warn('Supabase email upsert warning:', emailErr);
        }
      }

      // D. Upsert Phones
      const allPhones: any[] = [];
      for (const p of allBatchCandidates) {
        if (p.phones && p.phones.length > 0) {
          for (const ph of p.phones) {
            allPhones.push({
              id: ph.id,
              person_id: p.id,
              phone_original: ph.phone_original,
              phone_normalized: ph.phone_normalized,
              is_primary: ph.is_primary ?? false,
              source: ph.source || null,
              source_file: ph.source_file || null,
              source_row: ph.source_row || null,
              first_seen_at: ph.first_seen_at || p.created_at,
              last_seen_at: ph.last_seen_at || p.created_at,
              created_at: ph.created_at || p.created_at,
            });
          }
        }
      }

      if (allPhones.length > 0) {
        for (const chunk of chunkArray(allPhones, 50)) {
          const { error: phoneErr } = await client.from('person_phones').upsert(chunk, { onConflict: 'id' });
          if (phoneErr) console.warn('Supabase phone upsert warning:', phoneErr);
        }
      }

      // E. Upsert Applications
      const allApps: any[] = [];
      for (const p of allBatchCandidates) {
        if (p.applications && p.applications.length > 0) {
          for (const a of p.applications) {
            allApps.push({
              id: a.id,
              person_id: p.id,
              company: a.company,
              job_id: a.job_id || null,
              job_title: a.job_title,
              date_applied: a.date_applied || new Date().toISOString().split('T')[0],
              current_stage: a.current_stage || 'Applied',
              resume_link: a.resume_link || null,
              source_file: a.source_file || null,
              source_row: a.source_row || null,
              source_import_id: a.source_import_id || null,
              created_at: a.created_at || p.created_at,
              updated_at: a.updated_at || p.updated_at,
            });
          }
        }
      }

      if (allApps.length > 0) {
        for (const chunk of chunkArray(allApps, 50)) {
          const { error: appErr } = await client.from('applications').upsert(chunk, { onConflict: 'id' });
          if (appErr) console.warn('Supabase application upsert warning:', appErr);
        }
      }

      // F. Upsert Recruiter Contacts
      const allContacts: any[] = [];
      for (const p of allBatchCandidates) {
        if (p.recruiter_contacts && p.recruiter_contacts.length > 0) {
          for (const c of p.recruiter_contacts) {
            allContacts.push({
              id: c.id,
              person_id: p.id,
              application_id: c.application_id || null,
              recruiter_name: c.recruiter_name,
              contact_date: c.contact_date || new Date().toISOString().split('T')[0],
              contact_type: c.contact_type || 'Phone',
              original_feedback: c.original_feedback, // Raw verbatim
              source: c.source || null,
              source_file: c.source_file || null,
              source_row: c.source_row || null,
              created_at: c.created_at || p.created_at,
            });
          }
        }
      }

      if (allContacts.length > 0) {
        for (const chunk of chunkArray(allContacts, 50)) {
          const { error: contactErr } = await client.from('recruiter_contacts').upsert(chunk, { onConflict: 'id' });
          if (contactErr) console.warn('Supabase recruiter contacts upsert warning:', contactErr);
        }
      }

      // G. Upsert Possible Matches
      if (newPossibleMatches.length > 0) {
        const matchRows = newPossibleMatches.map(pm => ({
          id: pm.id,
          match_code: pm.match_code,
          candidate_a_id: pm.candidate_a_id,
          candidate_b_id: pm.candidate_b_id,
          match_reason: pm.match_reason,
          status: pm.status,
          created_at: pm.created_at,
        }));

        for (const chunk of chunkArray(matchRows, 50)) {
          const { error: matchErr } = await client.from('possible_matches').upsert(chunk, { onConflict: 'id' });
          if (matchErr) console.warn('Supabase possible matches upsert warning:', matchErr);
        }
      }

      // H. Upsert Incomplete Records (safe try-catch if table exists)
      if (newIncompleteRecords && newIncompleteRecords.length > 0) {
        try {
          for (const chunk of chunkArray(newIncompleteRecords, 50)) {
            await client.from('incomplete_records').upsert(chunk, { onConflict: 'id' });
          }
        } catch (incErr) {
          console.warn('Supabase incomplete_records upsert warning:', incErr);
        }
      }

      // I. Insert Audit Log
      if (auditEntry) {
        await client.from('audit_log').insert(auditEntry);
      }

      return { success: true };
    } catch (err: any) {
      console.error('Failed to sync batch to Supabase:', err);
      return { success: false, error: err?.message || 'Remote sync failed' };
    }
  },

  /**
   * Sync all existing local IndexedDB records to Supabase PostgreSQL in one operation
   */
  async syncAllLocalToSupabase(): Promise<{ success: boolean; message: string; syncedCount: number }> {
    await localStore.ensureInitialized();
    const client = getSupabaseClient();
    if (!client) {
      return { success: false, message: 'Supabase is not configured yet. Please configure credentials in Settings.', syncedCount: 0 };
    }

    try {
      const candidates = localStore.people;
      if (candidates.length === 0) {
        return { success: true, message: 'No local candidates to sync.', syncedCount: 0 };
      }

      // Sync master people table
      const peopleRows = candidates.map(p => ({
        id: p.id,
        person_id: p.person_id,
        first_name: p.first_name || null,
        last_name: p.last_name || null,
        full_name: p.full_name,
        gender: p.gender || 'Unspecified',
        primary_email: p.primary_email || null,
        primary_phone: p.primary_phone || null,
        location: p.location || null,
        zip_code: p.zip_code || null,
        headline: p.headline || null,
        current_title: p.current_title || null,
        current_company: p.current_company || (p.applications && p.applications[0]?.company) || null,
        linkedin_url: p.linkedin_url || null,
        current_status: p.current_status || 'New',
        current_owner: p.current_owner || 'Unassigned',
        merged_into_id: p.merged_into_id || null,
        created_at: p.created_at,
        updated_at: p.updated_at,
        last_activity_at: p.last_activity_at,
      }));

      for (const chunk of chunkArray(peopleRows, 50)) {
        await client.from('people').upsert(chunk, { onConflict: 'id' });
      }

      // Sync all emails
      const emails = candidates.flatMap(p => (p.emails || []).map(e => ({
        id: e.id,
        person_id: p.id,
        email: e.email,
        normalized_email: e.normalized_email,
        is_primary: e.is_primary ?? false,
        source: e.source || null,
        source_file: e.source_file || null,
        source_row: e.source_row || null,
        first_seen_at: e.first_seen_at || p.created_at,
        last_seen_at: e.last_seen_at || p.created_at,
        created_at: e.created_at || p.created_at,
      })));
      if (emails.length > 0) {
        for (const chunk of chunkArray(emails, 50)) {
          await client.from('person_emails').upsert(chunk, { onConflict: 'id' });
        }
      }

      // Sync all phones
      const phones = candidates.flatMap(p => (p.phones || []).map(ph => ({
        id: ph.id,
        person_id: p.id,
        phone_original: ph.phone_original,
        phone_normalized: ph.phone_normalized,
        is_primary: ph.is_primary ?? false,
        source: ph.source || null,
        source_file: ph.source_file || null,
        source_row: ph.source_row || null,
        first_seen_at: ph.first_seen_at || p.created_at,
        last_seen_at: ph.last_seen_at || p.created_at,
        created_at: ph.created_at || p.created_at,
      })));
      if (phones.length > 0) {
        for (const chunk of chunkArray(phones, 50)) {
          await client.from('person_phones').upsert(chunk, { onConflict: 'id' });
        }
      }

      // Sync all applications
      const applications = candidates.flatMap(p => (p.applications || []).map(a => ({
        id: a.id,
        person_id: p.id,
        company: a.company,
        job_id: a.job_id || null,
        job_title: a.job_title,
        date_applied: a.date_applied || new Date().toISOString().split('T')[0],
        current_stage: a.current_stage || 'Applied',
        resume_link: a.resume_link || null,
        source_file: a.source_file || null,
        source_row: a.source_row || null,
        source_import_id: a.source_import_id || null,
        created_at: a.created_at || p.created_at,
        updated_at: a.updated_at || p.updated_at,
      })));
      if (applications.length > 0) {
        for (const chunk of chunkArray(applications, 50)) {
          await client.from('applications').upsert(chunk, { onConflict: 'id' });
        }
      }

      // Sync all contacts
      const contacts = candidates.flatMap(p => (p.recruiter_contacts || []).map(c => ({
        id: c.id,
        person_id: p.id,
        application_id: c.application_id || null,
        recruiter_name: c.recruiter_name,
        contact_date: c.contact_date || new Date().toISOString().split('T')[0],
        contact_type: c.contact_type || 'Phone',
        original_feedback: c.original_feedback,
        source: c.source || null,
        source_file: c.source_file || null,
        source_row: c.source_row || null,
        created_at: c.created_at || p.created_at,
      })));
      if (contacts.length > 0) {
        for (const chunk of chunkArray(contacts, 50)) {
          await client.from('recruiter_contacts').upsert(chunk, { onConflict: 'id' });
        }
      }

      // Sync imports
      for (const imp of localStore.imports) {
        await client.from('imports').upsert({
          id: imp.id,
          file_name: imp.file_name,
          file_type: imp.file_type,
          import_status: imp.import_status,
          total_rows: imp.total_rows,
          processed_rows: imp.processed_rows,
          new_people: imp.new_people,
          matched_people: imp.matched_people,
          possible_matches: imp.possible_matches,
          applications_created: imp.applications_created,
          contacts_created: imp.contacts_created,
          errors: imp.errors,
          error_details: imp.error_details || [],
          uploaded_by: imp.uploaded_by || 'Admin',
          started_at: imp.started_at,
          completed_at: imp.completed_at || new Date().toISOString(),
          created_at: imp.created_at,
        });
      }

      return {
        success: true,
        message: `Successfully synchronized ${candidates.length} candidate profiles, applications, and logs to Supabase PostgreSQL!`,
        syncedCount: candidates.length,
      };
    } catch (err: any) {
      console.error('Error in syncAllLocalToSupabase:', err);
      return {
        success: false,
        message: `Sync failed: ${err?.message || 'Unknown network error'}`,
        syncedCount: 0,
      };
    }
  },

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    await localStore.ensureInitialized();
    return {
      peopleCount: localStore.people.length,
      jobsCount: localStore.jobs.length,
      importsCount: localStore.imports.length,
      matchesCount: localStore.possibleMatches.filter(p => p.status === 'pending').length,
      incompleteCount: this.getIncompleteCount(),
      auditCount: localStore.auditLogs.length,
      storageEngine: 'IndexedDB (Active - Unlimited Permanent Storage)',
    };
  },

  /**
   * Consolidate incomplete records from staging queue AND candidates in master database
   * who are missing phone numbers, missing emails, or missing names.
   */
  getAllIncompleteProfiles(company?: string): IncompleteRecord[] {
    const list: IncompleteRecord[] = [];
    const seenIds = new Set<string>();

    // 1. Unpromoted staging incomplete records
    for (const inc of localStore.incompleteRecords) {
      if (!company || company === 'Both' || company === 'All' || inc.company === company) {
        seenIds.add(inc.id);
        list.push({
          ...inc,
          raw_role: cleanJobTitle(inc.raw_role),
        });
      }
    }

    // 2. People missing phone number, email address, or valid candidate name
    for (const p of localStore.people) {
      if (p.merged_into_id) continue;
      if (seenIds.has(p.id)) continue;

      const pCompany = (p.current_company || (p.applications && p.applications[0]?.company) || 'AaraTech') as CompanyName;
      if (company && company !== 'Both' && company !== 'All' && pCompany !== company) {
        continue;
      }

      const rawPhone = p.primary_phone || (p.phones && p.phones[0]?.phone_normalized) || '';
      const rawEmail = p.primary_email || (p.emails && p.emails[0]?.email) || '';
      const rawName = p.full_name || '';

      const cleanPhoneDigits = formatPureDigitsPhone(rawPhone);
      const hasValidPhone = Boolean(cleanPhoneDigits && cleanPhoneDigits.length >= 7);
      const hasEmail = Boolean(rawEmail && rawEmail.includes('@') && !['adam', 'alex', 'unassigned'].includes(rawEmail.toLowerCase()));
      const hasName = Boolean(rawName && rawName.length >= 2 && !isPhoneNumber(rawName));

      // Strictly compulsory criteria: Name, Phone Number, and Email are ALL required!
      // If ANY of these three is missing, the candidate is flagged for manual review.
      if (hasName && hasEmail && hasValidPhone) {
        continue;
      }

      let reason: IncompleteReason = 'missing_phone';
      let description = 'Missing Phone Number (Has Email & Name)';

      if (!hasValidPhone && !hasEmail && !hasName) {
        reason = 'missing_both';
        description = 'Missing Name, Email, and Phone Number';
      } else if (!hasName && !hasValidPhone) {
        reason = 'missing_both';
        description = 'Missing Candidate Name and Phone Number';
      } else if (!hasName && !hasEmail) {
        reason = 'missing_both';
        description = 'Missing Candidate Name and Email Address';
      } else if (!hasEmail && !hasValidPhone) {
        reason = 'missing_both';
        description = 'Missing Candidate Email and Phone Number';
      } else if (!hasName) {
        reason = 'missing_name';
        description = 'Missing Candidate Name';
      } else if (!hasEmail) {
        reason = 'missing_email';
        description = 'Missing Email Address (Has Phone & Name)';
      } else if (!hasValidPhone) {
        reason = 'missing_phone';
        description = 'Missing Phone Number (Has Email & Name)';
      }

      const role = cleanJobTitle(p.current_title || p.headline || p.applications?.[0]?.job_title || 'Data Analyst');
      const feedback = p.recruiter_contacts?.[0]?.original_feedback || '';
      const dateAssigned = p.applications?.[0]?.date_applied || p.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];

      seenIds.add(p.id);
      list.push({
        id: p.id,
        raw_name: p.full_name,
        raw_email: p.primary_email || undefined,
        raw_phone: p.primary_phone || undefined,
        raw_role: role,
        company: pCompany,
        date_assigned: dateAssigned,
        owner: p.current_owner || 'Unassigned',
        recruiter_feedback: feedback || undefined,
        source_file: p.applications?.[0]?.source_file || 'Master Candidate Database',
        source_row: p.applications?.[0]?.source_row || 0,
        missing_reason: reason,
        missing_description: description,
        created_at: p.created_at || new Date().toISOString(),
        updated_at: p.updated_at || new Date().toISOString(),
      });
    }

    return list;
  },

  /**
   * Get incomplete candidates pending recruiter review/completion
   */
  async getIncompleteRecords(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    company?: string;
    reason?: string;
  } = {}): Promise<{ records: IncompleteRecord[]; totalCount: number }> {
    await localStore.ensureInitialized();
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;

    let filtered = this.getAllIncompleteProfiles(params.company);

    if (params.reason && params.reason !== 'all') {
      filtered = filtered.filter(r => r.missing_reason === params.reason);
    }

    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(r =>
        (r.raw_name && r.raw_name.toLowerCase().includes(q)) ||
        (r.raw_email && r.raw_email.toLowerCase().includes(q)) ||
        (r.raw_phone && r.raw_phone.toLowerCase().includes(q)) ||
        (r.raw_role && r.raw_role.toLowerCase().includes(q)) ||
        (r.owner && r.owner.toLowerCase().includes(q)) ||
        (r.recruiter_feedback && r.recruiter_feedback.toLowerCase().includes(q))
      );
    }

    filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const totalCount = filtered.length;
    const startIndex = (page - 1) * pageSize;
    const paginated = filtered.slice(startIndex, startIndex + pageSize);

    return { records: paginated, totalCount };
  },

  /**
   * Get total count of incomplete records (optionally by company)
   */
  getIncompleteCount(company?: string): number {
    return this.getAllIncompleteProfiles(company).length;
  },

  /**
   * Update an incomplete record during recruiter review
   */
  async updateIncompleteRecord(updated: IncompleteRecord): Promise<boolean> {
    await localStore.ensureInitialized();
    updated.updated_at = new Date().toISOString();

    // Check if it corresponds to an existing candidate in people
    const existingPerson = localStore.people.find(p => p.id === updated.id);
    if (existingPerson) {
      const emailNorm = normalizeEmail(updated.raw_email);
      const phoneNorm = normalizePhone(updated.raw_phone) || (updated.raw_phone ? (extractCleanPhone(updated.raw_phone) ? { original: updated.raw_phone, normalized: extractCleanPhone(updated.raw_phone)!, isValid: true } : null) : null);
      const cleanRole = cleanJobTitle(updated.raw_role);

      if (updated.raw_name) {
        const { fullName, firstName, lastName } = parseAndNormalizeName(updated.raw_name);
        existingPerson.full_name = fullName;
        existingPerson.first_name = firstName;
        existingPerson.last_name = lastName;
      }
      if (emailNorm) existingPerson.primary_email = emailNorm.original;
      if (phoneNorm) existingPerson.primary_phone = phoneNorm.original;
      existingPerson.current_title = cleanRole;
      existingPerson.headline = cleanRole;
      if (updated.owner) existingPerson.current_owner = updated.owner;
      existingPerson.updated_at = updated.updated_at;

      await localStore.saveToStorage();
      await indexedDBService.putBatch('people', [existingPerson]);

      const client = getSupabaseClient();
      if (client) {
        try {
          await client.from('people').update({
            full_name: existingPerson.full_name,
            first_name: existingPerson.first_name,
            last_name: existingPerson.last_name,
            primary_email: existingPerson.primary_email,
            primary_phone: existingPerson.primary_phone,
            current_title: existingPerson.current_title,
            headline: existingPerson.headline,
            current_owner: existingPerson.current_owner,
            updated_at: existingPerson.updated_at,
          }).eq('id', existingPerson.id);
        } catch {}
      }
      return true;
    }

    const idx = localStore.incompleteRecords.findIndex(r => r.id === updated.id);
    if (idx === -1) return false;

    localStore.incompleteRecords[idx] = updated;
    await localStore.saveToStorage();

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('incomplete_records').upsert(updated, { onConflict: 'id' });
      } catch {}
    }
    return true;
  },

  /**
   * Permanently delete a single incomplete record
   */
  async deleteIncompleteRecord(id: string): Promise<boolean> {
    await localStore.ensureInitialized();
    const isStaging = localStore.incompleteRecords.some(r => r.id === id);
    if (isStaging) {
      localStore.incompleteRecords = localStore.incompleteRecords.filter(r => r.id !== id);
      await localStore.saveToStorage();
      await indexedDBService.deleteItem('incompleteRecords', id);

      const client = getSupabaseClient();
      if (client) {
        try {
          await client.from('incomplete_records').delete().eq('id', id);
        } catch {}
      }
      return true;
    }

    const isPerson = localStore.people.some(p => p.id === id);
    if (isPerson) {
      localStore.people = localStore.people.filter(p => p.id !== id);
      await localStore.saveToStorage();
      await indexedDBService.deleteItem('people', id);

      const client = getSupabaseClient();
      if (client) {
        try {
          await client.from('people').delete().eq('id', id);
        } catch {}
      }
      return true;
    }
    return false;
  },

  /**
   * Permanently delete multiple incomplete records
   */
  async deleteIncompleteRecordsBatch(ids: string[]): Promise<boolean> {
    await localStore.ensureInitialized();
    const stagingIds = ids.filter(id => localStore.incompleteRecords.some(r => r.id === id));
    const personIds = ids.filter(id => localStore.people.some(p => p.id === id));

    if (stagingIds.length > 0) {
      const stagingSet = new Set(stagingIds);
      localStore.incompleteRecords = localStore.incompleteRecords.filter(r => !stagingSet.has(r.id));
      for (const id of stagingIds) {
        await indexedDBService.deleteItem('incompleteRecords', id);
      }
      const client = getSupabaseClient();
      if (client) {
        try {
          await client.from('incomplete_records').delete().in('id', stagingIds);
        } catch {}
      }
    }

    if (personIds.length > 0) {
      const pSet = new Set(personIds);
      localStore.people = localStore.people.filter(p => !pSet.has(p.id));
      for (const pId of personIds) {
        await indexedDBService.deleteItem('people', pId);
      }
      const client = getSupabaseClient();
      if (client) {
        try {
          await client.from('people').delete().in('id', personIds);
        } catch {}
      }
    }

    await localStore.saveToStorage();
    return true;
  },

  /**
   * Clear all incomplete records
   */
  async deleteAllIncompleteRecords(): Promise<boolean> {
    await localStore.ensureInitialized();
    localStore.incompleteRecords = [];
    await localStore.saveToStorage();
    await indexedDBService.clearStore('incompleteRecords');

    const client = getSupabaseClient();
    if (client) {
      try {
        await client.from('incomplete_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } catch {}
    }
    return true;
  },

  /**
   * High-Performance Batch Promotion of Incomplete Records to Master Database
   * Processes all candidates in memory, performs a single unified IndexedDB save,
   * and streams updates to Supabase Cloud in parallel chunks.
   */
  async batchPromoteIncompleteToMaster(
    items: {
      incompleteId: string;
      fullName: string;
      email?: string;
      phone?: string;
      role?: string;
      company: CompanyName;
      owner?: string;
      recruiterFeedback?: string;
      dateAssigned?: string;
      gender?: Gender;
    }[]
  ): Promise<{ success: boolean; promotedCount: number; error?: string }> {
    await localStore.ensureInitialized();
    if (!items || items.length === 0) return { success: true, promotedCount: 0 };

    const now = new Date().toISOString();
    const updatedPeople: Person[] = [];
    const newPeople: Person[] = [];
    const idsToRemoveFromIncomplete = new Set<string>();

    const existingIds = localStore.people.map(p => {
      const match = p.person_id?.match(/P-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
    let nextSeq = Math.max(0, ...existingIds);

    for (const data of items) {
      const trimmedName = (data.fullName || '').trim();
      if (!trimmedName) continue;

      const emailNorm = normalizeEmail(data.email);
      const phoneNorm = normalizePhone(data.phone) || (data.phone ? (extractCleanPhone(data.phone) ? { original: data.phone, normalized: extractCleanPhone(data.phone)!, isValid: true } : null) : null);
      if (!emailNorm && !phoneNorm) continue;

      const cleanRole = cleanJobTitle(data.role);
      const { fullName, firstName, lastName } = parseAndNormalizeName(trimmedName);

      // Check if existing in localStore.people
      const existingPerson = localStore.people.find(p => p.id === data.incompleteId);
      if (existingPerson) {
        existingPerson.full_name = fullName;
        existingPerson.first_name = firstName;
        existingPerson.last_name = lastName;
        if (data.gender && data.gender !== 'Unspecified') existingPerson.gender = data.gender;
        if (data.owner) existingPerson.current_owner = data.owner;
        existingPerson.headline = cleanRole;
        existingPerson.current_title = cleanRole;
        if (data.company) existingPerson.current_company = data.company;

        if (emailNorm) {
          existingPerson.primary_email = emailNorm.original;
          if (!existingPerson.emails) existingPerson.emails = [];
          const ex = existingPerson.emails.find(e => e.email.toLowerCase() === emailNorm.original.toLowerCase());
          if (ex) ex.is_primary = true;
          else {
            existingPerson.emails.forEach(e => { e.is_primary = false; });
            existingPerson.emails.unshift({
              id: generateUuid(),
              person_id: existingPerson.id,
              email: emailNorm.original,
              normalized_email: emailNorm.normalized,
              is_primary: true,
              source: 'recruiter_review',
              first_seen_at: now,
              last_seen_at: now,
              created_at: now,
            });
          }
        }

        if (phoneNorm) {
          existingPerson.primary_phone = phoneNorm.original;
          if (!existingPerson.phones) existingPerson.phones = [];
          const ex = existingPerson.phones.find(ph => ph.phone_normalized === phoneNorm.normalized);
          if (ex) ex.is_primary = true;
          else {
            existingPerson.phones.forEach(ph => { ph.is_primary = false; });
            existingPerson.phones.unshift({
              id: generateUuid(),
              person_id: existingPerson.id,
              phone_original: phoneNorm.original,
              phone_normalized: phoneNorm.normalized,
              is_primary: true,
              source: 'recruiter_review',
              first_seen_at: now,
              last_seen_at: now,
              created_at: now,
            });
          }
        }

        if (data.recruiterFeedback) {
          if (!existingPerson.recruiter_contacts) existingPerson.recruiter_contacts = [];
          existingPerson.recruiter_contacts.unshift({
            id: generateUuid(),
            person_id: existingPerson.id,
            recruiter_name: data.owner || existingPerson.current_owner || 'Recruiter',
            contact_date: data.dateAssigned || now.split('T')[0],
            contact_type: 'Phone',
            original_feedback: data.recruiterFeedback,
            created_at: now,
          });
        }

        existingPerson.updated_at = now;
        updatedPeople.push(existingPerson);
        idsToRemoveFromIncomplete.add(data.incompleteId);
      } else {
        // Look in staging incompleteRecords
        const inc = localStore.incompleteRecords.find(r => r.id === data.incompleteId);
        if (inc) {
          nextSeq++;
          const personIdCode = `P-${String(nextSeq).padStart(6, '0')}`;
          const personUuid = generateUuid();
          const appDate = data.dateAssigned || inc.date_assigned || now.split('T')[0];

          const newPerson: Person = {
            id: personUuid,
            person_id: personIdCode,
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            gender: data.gender || detectGender('Unspecified', firstName, fullName, data.recruiterFeedback || inc.recruiter_feedback || ''),
            primary_email: emailNorm ? emailNorm.original : null,
            primary_phone: phoneNorm ? phoneNorm.original : null,
            location: null,
            zip_code: null,
            headline: cleanRole,
            current_title: cleanRole,
            current_company: data.company || inc.company || 'AaraTech',
            linkedin_url: null,
            current_status: 'Assigned',
            current_owner: data.owner || inc.owner || 'Unassigned',
            created_at: now,
            updated_at: now,
            last_activity_at: `${appDate}T00:00:00Z`,
            emails: emailNorm ? [{
              id: generateUuid(),
              person_id: personUuid,
              email: emailNorm.original,
              normalized_email: emailNorm.normalized,
              is_primary: true,
              source: 'recruiter_review',
              first_seen_at: now,
              last_seen_at: now,
              created_at: now,
            }] : [],
            phones: phoneNorm ? [{
              id: generateUuid(),
              person_id: personUuid,
              phone_original: phoneNorm.original,
              phone_normalized: phoneNorm.normalized,
              is_primary: true,
              source: 'recruiter_review',
              first_seen_at: now,
              last_seen_at: now,
              created_at: now,
            }] : [],
            applications: [{
              id: generateUuid(),
              person_id: personUuid,
              company: data.company || inc.company || 'AaraTech',
              job_id: null,
              job_title: cleanRole,
              date_applied: appDate,
              current_stage: 'Assigned',
              resume_link: null,
              source_file: inc.source_file || 'Incomplete Review Queue',
              source_row: inc.source_row || 0,
              created_at: now,
              updated_at: now,
            }],
            recruiter_contacts: (data.recruiterFeedback || inc.recruiter_feedback) ? [{
              id: generateUuid(),
              person_id: personUuid,
              recruiter_name: data.owner || inc.owner || 'Recruiter',
              contact_date: appDate,
              contact_type: 'Phone',
              original_feedback: data.recruiterFeedback || inc.recruiter_feedback || '',
              source_file: inc.source_file || 'Incomplete Review Queue',
              source_row: inc.source_row || 0,
              created_at: now,
            }] : [],
            status_history: [{
              id: generateUuid(),
              person_id: personUuid,
              old_status: null,
              new_status: 'Assigned',
              changed_by: data.owner || 'Recruiter',
              reason: 'Promoted from Incomplete Review Queue with verified contact details',
              created_at: now,
            }],
          };

          newPeople.push(newPerson);
          localStore.people.unshift(newPerson);
          idsToRemoveFromIncomplete.add(data.incompleteId);
        }
      }
    }

    // Remove promoted IDs from staging queue
    localStore.incompleteRecords = localStore.incompleteRecords.filter(r => !idsToRemoveFromIncomplete.has(r.id));

    // ONE permanent storage save for all records
    await localStore.saveToStorage();
    if (newPeople.length > 0) {
      await indexedDBService.putBatch('people', newPeople);
    }
    if (updatedPeople.length > 0) {
      await indexedDBService.putBatch('people', updatedPeople);
    }
    for (const id of idsToRemoveFromIncomplete) {
      await indexedDBService.deleteItem('incompleteRecords', id);
    }

    // Fast parallel chunk sync to Supabase Cloud
    const client = getSupabaseClient();
    if (client) {
      try {
        const allBatch = [...newPeople, ...updatedPeople];
        const peopleRows = allBatch.map(p => ({
          id: p.id,
          person_id: p.person_id,
          first_name: p.first_name || null,
          last_name: p.last_name || null,
          full_name: p.full_name,
          gender: p.gender || 'Unspecified',
          primary_email: p.primary_email || null,
          primary_phone: p.primary_phone || null,
          headline: p.headline || null,
          current_title: p.current_title || null,
          current_company: p.current_company || null,
          current_status: p.current_status || 'Assigned',
          current_owner: p.current_owner || 'Unassigned',
          created_at: p.created_at,
          updated_at: p.updated_at,
          last_activity_at: p.last_activity_at,
        }));
        await parallelChunkUpsert(client, 'people', peopleRows, 250, 3);

        const emailRows = allBatch.flatMap(p => (p.emails || []).map(e => ({
          id: e.id,
          person_id: p.id,
          email: e.email,
          normalized_email: e.normalized_email,
          is_primary: e.is_primary ?? false,
          created_at: e.created_at,
        })));
        if (emailRows.length > 0) {
          await parallelChunkUpsert(client, 'person_emails', emailRows, 250, 3);
        }

        const phoneRows = allBatch.flatMap(p => (p.phones || []).map(ph => ({
          id: ph.id,
          person_id: p.id,
          phone_original: ph.phone_original,
          phone_normalized: ph.phone_normalized,
          is_primary: ph.is_primary ?? false,
          created_at: ph.created_at,
        })));
        if (phoneRows.length > 0) {
          await parallelChunkUpsert(client, 'person_phones', phoneRows, 250, 3);
        }
      } catch (err) {
        console.warn('Batch promote Supabase sync warning:', err);
      }
    }

    return { success: true, promotedCount: newPeople.length + updatedPeople.length };
  },

  /**
   * Review & Promote Incomplete Record to Completed Master Database
   * Validates mandatory name and at least one contact (email or phone).
   * Generates Person, PersonEmail, PersonPhone, Application, and RecruiterContact.
   * Removes from incomplete queue and saves directly into master database.
   */
  async promoteIncompleteToMaster(
    incompleteId: string,
    data: {
      fullName: string;
      email?: string;
      phone?: string;
      role?: string;
      company: CompanyName;
      owner?: string;
      recruiterFeedback?: string;
      dateAssigned?: string;
      gender?: Gender;
    }
  ): Promise<{ success: boolean; person?: Person; error?: string }> {
    await localStore.ensureInitialized();

    const trimmedName = (data.fullName || '').trim();
    if (!trimmedName) {
      return { success: false, error: 'Candidate Name is strictly mandatory.' };
    }

    const emailNorm = normalizeEmail(data.email);
    const phoneNorm = normalizePhone(data.phone) || (data.phone ? (extractCleanPhone(data.phone) ? { original: data.phone, normalized: extractCleanPhone(data.phone)!, isValid: true } : null) : null);

    if (!emailNorm && !phoneNorm) {
      return { success: false, error: 'At least one contact method (Email Address or Phone Number) is strictly mandatory.' };
    }

    const cleanRole = cleanJobTitle(data.role);

    // 1. If this record is an existing incomplete person in localStore.people
    const existingPerson = localStore.people.find(p => p.id === incompleteId);
    if (existingPerson) {
      const { fullName, firstName, lastName } = parseAndNormalizeName(trimmedName);
      existingPerson.full_name = fullName;
      existingPerson.first_name = firstName;
      existingPerson.last_name = lastName;
      if (data.gender && data.gender !== 'Unspecified') {
        existingPerson.gender = data.gender;
      }
      if (data.owner) existingPerson.current_owner = data.owner;
      existingPerson.headline = cleanRole;
      existingPerson.current_title = cleanRole;
      if (data.company) existingPerson.current_company = data.company;

      if (emailNorm) {
        existingPerson.primary_email = emailNorm.original;
        if (!existingPerson.emails) existingPerson.emails = [];
        const existingEmail = existingPerson.emails.find(e => e.email.toLowerCase() === emailNorm.original.toLowerCase());
        if (existingEmail) {
          existingEmail.is_primary = true;
        } else {
          existingPerson.emails.forEach(e => { e.is_primary = false; });
          existingPerson.emails.unshift({
            id: generateUuid(),
            person_id: existingPerson.id,
            email: emailNorm.original,
            normalized_email: emailNorm.normalized,
            is_primary: true,
            source: 'recruiter_review',
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        }
      }

      if (phoneNorm) {
        existingPerson.primary_phone = phoneNorm.original;
        if (!existingPerson.phones) existingPerson.phones = [];
        const existingPhone = existingPerson.phones.find(ph => ph.phone_normalized === phoneNorm.normalized);
        if (existingPhone) {
          existingPhone.is_primary = true;
        } else {
          existingPerson.phones.forEach(ph => { ph.is_primary = false; });
          existingPerson.phones.unshift({
            id: generateUuid(),
            person_id: existingPerson.id,
            phone_original: phoneNorm.original,
            phone_normalized: phoneNorm.normalized,
            is_primary: true,
            source: 'recruiter_review',
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        }
      }

      if (data.recruiterFeedback) {
        if (!existingPerson.recruiter_contacts) existingPerson.recruiter_contacts = [];
        existingPerson.recruiter_contacts.unshift({
          id: generateUuid(),
          person_id: existingPerson.id,
          recruiter_name: data.owner || existingPerson.current_owner || 'Recruiter',
          contact_date: data.dateAssigned || new Date().toISOString().split('T')[0],
          contact_type: 'Phone',
          original_feedback: data.recruiterFeedback,
          created_at: new Date().toISOString(),
        });
      }

      existingPerson.updated_at = new Date().toISOString();

      localStore.incompleteRecords = localStore.incompleteRecords.filter(r => r.id !== incompleteId);
      await localStore.saveToStorage();
      await indexedDBService.putBatch('people', [existingPerson]);
      await indexedDBService.deleteItem('incompleteRecords', incompleteId);

      const client = getSupabaseClient();
      if (client) {
        try {
          await client.from('people').update({
            full_name: existingPerson.full_name,
            first_name: existingPerson.first_name,
            last_name: existingPerson.last_name,
            gender: existingPerson.gender,
            primary_email: existingPerson.primary_email,
            primary_phone: existingPerson.primary_phone,
            headline: existingPerson.headline,
            current_title: existingPerson.current_title,
            current_owner: existingPerson.current_owner,
            updated_at: existingPerson.updated_at,
          }).eq('id', existingPerson.id);

          if (phoneNorm) {
            await client.from('person_phones').upsert({
              id: existingPerson.phones?.[0]?.id || generateUuid(),
              person_id: existingPerson.id,
              phone_original: phoneNorm.original,
              phone_normalized: phoneNorm.normalized,
              is_primary: true,
              created_at: new Date().toISOString(),
            }, { onConflict: 'id' });
          }

          if (emailNorm) {
            await client.from('person_emails').upsert({
              id: existingPerson.emails?.[0]?.id || generateUuid(),
              person_id: existingPerson.id,
              email: emailNorm.original,
              normalized_email: emailNorm.normalized,
              is_primary: true,
              created_at: new Date().toISOString(),
            }, { onConflict: 'id' });
          }
        } catch (e) {
          console.warn('Supabase remote sync warning on existing person update:', e);
        }
      }

      return { success: true, person: existingPerson };
    }

    // 2. Otherwise look in staging incompleteRecords
    const inc = localStore.incompleteRecords.find(r => r.id === incompleteId);
    if (!inc) {
      return { success: false, error: 'Incomplete record not found.' };
    }

    const { fullName, firstName, lastName } = parseAndNormalizeName(trimmedName);
    const now = new Date().toISOString();
    const appDate = data.dateAssigned || inc.date_assigned || now.split('T')[0];
    const company = data.company || inc.company || 'AaraTech';
    const owner = data.owner || inc.owner || 'Unassigned';
    const role = data.role || inc.raw_role || 'Data Analyst';
    const feedback = data.recruiterFeedback || inc.recruiter_feedback || '';

    // Generate readable Person ID sequence
    const existingIds = localStore.people.map(p => {
      const match = p.person_id?.match(/P-(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
    const nextSeq = (Math.max(0, ...existingIds) + 1).toString().padStart(6, '0');
    const personIdCode = `P-${nextSeq}`;
    const personUuid = generateUuid();

    // Auto-detect gender or use provided
    const detectedGender = data.gender && data.gender !== 'Unspecified'
      ? data.gender
      : detectGender('Unspecified', firstName, fullName, feedback);

    const newPerson: Person = {
      id: personUuid,
      person_id: personIdCode,
      first_name: firstName || null,
      last_name: lastName || null,
      full_name: fullName,
      gender: detectedGender,
      primary_email: emailNorm ? emailNorm.original : null,
      primary_phone: phoneNorm ? phoneNorm.original : null,
      location: null,
      zip_code: null,
      headline: role,
      current_title: role,
      current_company: company,
      linkedin_url: null,
      current_status: 'Assigned',
      current_owner: owner,
      created_at: now,
      updated_at: now,
      last_activity_at: `${appDate}T00:00:00Z`,
      emails: [],
      phones: [],
      applications: [],
      recruiter_contacts: [],
    };

    if (emailNorm) {
      newPerson.emails!.push({
        id: generateUuid(),
        person_id: personUuid,
        email: emailNorm.original,
        normalized_email: emailNorm.normalized,
        is_primary: true,
        source: 'manual_promotion',
        first_seen_at: now,
        last_seen_at: now,
        created_at: now,
      });
    }

    if (phoneNorm) {
      newPerson.phones!.push({
        id: generateUuid(),
        person_id: personUuid,
        phone_original: phoneNorm.original,
        phone_normalized: phoneNorm.normalized,
        is_primary: true,
        source: 'manual_promotion',
        first_seen_at: now,
        last_seen_at: now,
        created_at: now,
      });
    }

    const appId = generateUuid();
    newPerson.applications!.push({
      id: appId,
      person_id: personUuid,
      company,
      job_title: role,
      date_applied: appDate,
      current_stage: 'Assigned',
      source_file: inc.source_file || 'manual_review',
      source_row: inc.source_row || 0,
      created_at: now,
      updated_at: now,
    });

    if (feedback) {
      newPerson.recruiter_contacts!.push({
        id: generateUuid(),
        person_id: personUuid,
        application_id: appId,
        recruiter_name: owner,
        contact_date: appDate,
        contact_type: 'Phone',
        original_feedback: feedback,
        created_at: now,
      });
    }

    // Add to completed people
    localStore.people.unshift(newPerson);

    // Remove from incomplete
    localStore.incompleteRecords = localStore.incompleteRecords.filter(r => r.id !== incompleteId);

    // Persist to IndexedDB
    await localStore.saveToStorage();
    await indexedDBService.deleteItem('incompleteRecords', incompleteId);

    // Sync to Supabase
    const client = getSupabaseClient();
    if (client) {
      try {
        await this.syncBatchToSupabase([newPerson], [], {
          id: 'PROMOTE-' + String(Date.now()).slice(-6),
          file_name: inc.source_file || 'Manual Review Queue',
          file_type: 'csv',
          import_status: 'completed',
          total_rows: 1,
          processed_rows: 1,
          new_people: 1,
          matched_people: 0,
          possible_matches: 0,
          applications_created: 1,
          contacts_created: feedback ? 1 : 0,
          errors: 0,
          uploaded_by: owner,
          started_at: now,
          completed_at: now,
          created_at: now,
        }, []);

        // Delete from supabase incomplete_records
        await client.from('incomplete_records').delete().eq('id', incompleteId);
      } catch (e) {
        console.warn('Supabase remote sync warning on promotion:', e);
      }
    }

    return { success: true, person: newPerson };
  },

  /**
   * Preview how many incomplete records can be auto-recovered and promoted right now
   */
  /**
   * Preview how many incomplete records can be auto-recovered and promoted right now
   */
  getRecoverableIncompleteCount(): number {
    let count = 0;
    const allIncomplete = this.getAllIncompleteProfiles();
    for (const inc of allIncomplete) {
      let name = (inc.raw_name || '').trim();
      let feedback = (inc.recruiter_feedback || '').trim();
      let phone = (inc.raw_phone || '').trim();
      let email = (inc.raw_email || '').trim();

      // Clean markdown mailto links or brackets attached to name
      if (name && (name.includes('[') || name.includes('mailto:') || name.includes('@') || name.includes('<'))) {
        const mailMatch = name.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (mailMatch && !email) email = mailMatch[1];
        name = name.replace(/\[.*?\](\(.*?\))?/g, '').replace(/mailto:[^\s)]+/g, '').replace(/<.*?>/g, '').replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '').replace(/[\[\]()<>]/g, '').trim();
      }

      // If name has comma like "Devinder kumar, 5 yrs exp"
      if (name && name.includes(',')) {
        const commaPart = name.split(',')[0].trim();
        if (isValidCandidateName(commaPart)) name = commaPart;
      }

      // Clean tech, location, or headers from name
      if (name && (isRoleOrTech(name) || isLocationOrCountry(name) || isHeaderOrLabelWord(name) || !isValidCandidateName(name))) {
        name = '';
      }

      // Check feedback for missing email
      if (!email && feedback) {
        const mailMatch = feedback.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (mailMatch) email = mailMatch[1];
      }

      // Check feedback for missing phone
      if (!phone && feedback) {
        const pClean = extractCleanPhone(feedback);
        if (pClean) phone = pClean;
      }

      // Check feedback for missing name
      if (!name && feedback) {
        const extracted = extractCandidateName(feedback);
        if (extracted.name && !isLocationOrCountry(extracted.name) && !isHeaderOrLabelWord(extracted.name) && isValidCandidateName(extracted.name)) {
          name = extracted.name;
        }
      }

      // Check email for missing name
      if (!name && email) {
        const nameFromEmail = extractCandidateNameFromEmail(email);
        if (nameFromEmail && isValidCandidateName(nameFromEmail)) {
          name = nameFromEmail;
        }
      }

      if (phone && (isRoleOrTech(phone) || phone.replace(/\D/g, '').length < 7)) {
        phone = '';
      } else if (phone) {
        const cleaned = extractCleanPhone(phone);
        if (cleaned) phone = cleaned;
      }

      if (email && (!email.includes('@') || ['adam', 'alex', 'unassigned'].includes(email.toLowerCase()))) {
        email = '';
      }

      // Check cross-match in existing people
      if (name && (!email || !phone)) {
        const normN = name.toLowerCase().replace(/[^a-z]/g, '');
        const matched = localStore.people.find(p => {
          const normP = (p.full_name || '').toLowerCase().replace(/[^a-z]/g, '');
          return normP.includes(normN) || normN.includes(normP);
        });
        if (matched) {
          if (!email && matched.primary_email) email = matched.primary_email;
          if (!phone && matched.primary_phone) phone = matched.primary_phone;
        }
      }

      const hasValidName = Boolean(name && name.length > 0 && isValidCandidateName(name) && !isRoleOrTech(name) && !isLocationOrCountry(name) && !isHeaderOrLabelWord(name));
      const hasContact = Boolean(normalizeEmail(email) || normalizePhone(phone));
      if (hasValidName && hasContact) {
        count++;
      }
    }
    return count;
  },

  /**
   * Returns count of anonymous/orphan screening logs (no name AND no contact)
   */
  getAnonymousIncompleteCount(): number {
    return this.getAllIncompleteProfiles().filter(r => {
      const name = (r.raw_name || '').trim();
      const email = (r.raw_email || '').trim();
      const phone = (r.raw_phone || '').trim();
      const hasName = Boolean(name && !isLocationOrCountry(name) && !isRoleOrTech(name) && !isHeaderOrLabelWord(name) && !isScreeningNote(name) && isValidCandidateName(name));
      const hasEmail = Boolean(email && email.includes('@') && !['adam', 'alex', 'unassigned'].includes(email.toLowerCase()));
      const hasPhone = Boolean(phone && extractCleanPhone(phone));
      return !hasName && !hasEmail && !hasPhone;
    }).length;
  },

  /**
   * Scans all incomplete records in the database:
   * Phase 1: High-Speed Deterministic Parsing (markdown email uncoupling, feedback extraction, column realignment)
   * Phase 2: Automatic Gemini AI Re-Verification & Intelligent Rescue
   * Phase 3: Automatic Anonymous Screening Note Cleanup
   * Automatically promotes fully-recovered candidate profiles directly into the Master Candidate Database!
   */
  async autoRecoverIncompleteRecords(): Promise<{
    recoveredCount: number;
    promotedCount: number;
    remainingCount: number;
    promotedNames: string[];
  }> {
    await localStore.ensureInitialized();
    const records = [...localStore.incompleteRecords];
    let recoveredCount = 0;
    let promotedCount = 0;
    const promotedNames: string[] = [];

    // =========================================================================
    // PHASE 1: HIGH-SPEED DETERMINISTIC AUTO-RECOVERY
    // =========================================================================
    for (const inc of records) {
      if (!localStore.incompleteRecords.some(r => r.id === inc.id)) continue;

      let changed = false;
      let currentName = (inc.raw_name || '').trim();
      let currentRole = (inc.raw_role || '').trim();
      let currentFeedback = (inc.recruiter_feedback || '').trim();
      let currentPhone = (inc.raw_phone || '').trim();
      let currentEmail = (inc.raw_email || '').trim();
      let currentOwner = inc.owner || 'Unassigned';

      // 1. If raw_name contains markdown email or mailto links, extract email and clean name!
      if (currentName && (currentName.includes('[') || currentName.includes('mailto:') || currentName.includes('@') || currentName.includes('<'))) {
        const mailMatch = currentName.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (mailMatch && !currentEmail) {
          currentEmail = mailMatch[1];
          changed = true;
        }
        const cleaned = currentName
          .replace(/\[\s*.*?\s*\](?:\(mailto:[^\s)]+\))?/gi, '')
          .replace(/mailto:[^\s)]+/gi, '')
          .replace(/<[^\s>]+>/gi, '')
          .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '')
          .replace(/[\[\]()<>]/g, '')
          .trim();
        if (cleaned && isValidCandidateName(cleaned)) {
          currentName = cleaned;
          changed = true;
        }
      }

      // 2. If raw_name has comma like "Devinder kumar, 5 yrs exp"
      if (currentName && currentName.includes(',')) {
        const parts = currentName.split(',');
        const leadName = parts[0].trim();
        if (isValidCandidateName(leadName)) {
          currentFeedback = currentFeedback ? `${currentFeedback} | ${parts.slice(1).join(',').trim()}` : parts.slice(1).join(',').trim();
          currentName = leadName;
          changed = true;
        }
      }

      // 3. If raw_name is actually a location, header label, screening note, or invalid name, realign!
      if (currentName && (isLocationOrCountry(currentName) || isHeaderOrLabelWord(currentName) || isScreeningNote(currentName) || !isValidCandidateName(currentName))) {
        if (isScreeningNote(currentName)) {
          currentFeedback = currentFeedback ? `${currentFeedback} | ${currentName}` : currentName;
        }
        currentName = '';
        changed = true;
      }

      // 4. If raw_name is actually a tech role (DOTNET, DE, etc.), move to role!
      if (currentName && isRoleOrTech(currentName)) {
        if (!currentRole || currentRole === 'Data Analyst') currentRole = currentName.toUpperCase();
        currentName = '';
        changed = true;
      }

      // 5. If raw_email is actually a recruiter name (alex, adam) or lacks '@', move to owner!
      if (currentEmail && (!currentEmail.includes('@') || ['adam', 'alex', 'unassigned'].includes(currentEmail.toLowerCase()))) {
        currentOwner = currentEmail.charAt(0).toUpperCase() + currentEmail.slice(1).toLowerCase();
        currentEmail = '';
        changed = true;
      }

      // 6. If raw_phone is actually a tech role or lacks 7+ digits, move to role!
      if (currentPhone && (isRoleOrTech(currentPhone) || currentPhone.replace(/\D/g, '').length < 7)) {
        if (!currentRole || currentRole === 'Data Analyst') {
          currentRole = currentPhone.toUpperCase();
        }
        currentPhone = '';
        changed = true;
      } else if (currentPhone) {
        const cleanedPhone = extractCleanPhone(currentPhone);
        if (cleanedPhone && cleanedPhone !== currentPhone) {
          currentPhone = cleanedPhone;
          changed = true;
        }
      }

      // 7. If raw_role is actually screening notes, move to feedback!
      if (currentRole && (
        currentRole.length > 25 ||
        /^(no resposne|no response|\d+\/|h1b|opt|gc|citizen|masters|relocate|looking)/i.test(currentRole)
      )) {
        currentFeedback = currentFeedback ? `${currentFeedback} | ${currentRole}` : currentRole;
        currentRole = 'Data Analyst';
        changed = true;
      }

      // 8. If email is missing, check recruiter_feedback!
      if (!currentEmail && currentFeedback) {
        const mailMatch = currentFeedback.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (mailMatch) {
          currentEmail = mailMatch[1];
          changed = true;
        }
      }

      // 9. If phone is missing, check recruiter_feedback!
      if (!currentPhone && currentFeedback) {
        const extractedPhone = extractCleanPhone(currentFeedback);
        if (extractedPhone) {
          currentPhone = extractedPhone;
          changed = true;
        }
      }

      // 10. If candidate name is missing or empty, attempt extraction from recruiter_feedback
      if (!currentName && currentFeedback) {
        const extracted = extractCandidateName(currentFeedback);
        if (extracted.name && !isLocationOrCountry(extracted.name) && isValidCandidateName(extracted.name)) {
          currentName = extracted.name;
          currentFeedback = extracted.remaining;
          changed = true;
        }
      }

      // 11. If candidate name is still missing, attempt extraction from email
      if (!currentName && currentEmail) {
        const nameFromEmail = extractCandidateNameFromEmail(currentEmail);
        if (nameFromEmail && isValidCandidateName(nameFromEmail)) {
          currentName = nameFromEmail;
          changed = true;
        }
      }

      // 12. Cross-match against existing Master Database profiles
      if (currentName && (!currentEmail || !currentPhone)) {
        const normName = currentName.toLowerCase().replace(/[^a-z]/g, '');
        if (normName.length >= 4) {
          const matched = localStore.people.find(p => {
            const normP = (p.full_name || '').toLowerCase().replace(/[^a-z]/g, '');
            return normP.includes(normName) || normName.includes(normP);
          });
          if (matched) {
            if (!currentEmail && matched.primary_email) {
              currentEmail = matched.primary_email;
              changed = true;
            }
            if (!currentPhone && matched.primary_phone) {
              currentPhone = matched.primary_phone;
              changed = true;
            }
          }
        }
      }

      // Check if now complete: has valid Name AND at least one contact (email OR phone)
      const { fullName } = parseAndNormalizeName(currentName);
      const emailNorm = normalizeEmail(currentEmail);
      const phoneNorm = normalizePhone(currentPhone) || (currentPhone ? (extractCleanPhone(currentPhone) ? { original: currentPhone, normalized: extractCleanPhone(currentPhone)!, isValid: true } : null) : null);
      const hasValidName = Boolean(fullName && fullName.length > 0 && isValidCandidateName(fullName) && !isRoleOrTech(fullName) && !isLocationOrCountry(fullName));
      const hasEmail = Boolean(emailNorm);
      const hasPhone = Boolean(phoneNorm);
      const hasContact = hasEmail || hasPhone;

      if (hasValidName && hasContact) {
        // Promote directly to Master Candidate Database!
        const promoteRes = await this.promoteIncompleteToMaster(inc.id, {
          fullName: currentName,
          email: emailNorm ? emailNorm.original : undefined,
          phone: phoneNorm ? phoneNorm.normalized : undefined,
          role: currentRole || undefined,
          company: inc.company,
          owner: currentOwner,
          recruiterFeedback: currentFeedback || undefined,
          dateAssigned: inc.date_assigned,
        });
        if (promoteRes.success && promoteRes.person) {
          recoveredCount++;
          promotedCount++;
          promotedNames.push(promoteRes.person.full_name);
        }
      } else if (changed) {
        recoveredCount++;
        // Update the incomplete record with the realigned fields
        inc.raw_name = currentName || null;
        inc.raw_email = currentEmail || null;
        inc.raw_role = currentRole || null;
        inc.owner = currentOwner;
        inc.recruiter_feedback = currentFeedback || null;
        inc.raw_phone = currentPhone || null;
        if (hasValidName && !hasEmail && !hasPhone) {
          inc.missing_reason = 'missing_both';
          inc.missing_description = 'Missing Contact Information (No Email or Phone provided)';
        } else if (!hasValidName && (hasEmail || hasPhone)) {
          inc.missing_reason = 'missing_name';
          inc.missing_description = 'Missing candidate full name';
        } else {
          inc.missing_reason = 'missing_both';
          inc.missing_description = 'Anonymous Screening Note (No Candidate Name or Contact Details)';
        }
        await this.updateIncompleteRecord(inc);
      }
    }

    // =========================================================================
    // PHASE 2: AUTOMATIC GEMINI AI INTELLIGENT RESCUE PASS
    // For all remaining incomplete profiles, let Gemini AI analyze and rescue!
    // =========================================================================
    const remainingToRescue = [...localStore.incompleteRecords];
    if (remainingToRescue.length > 0 && geminiService.hasApiKey()) {
      try {
        const rescueResults = await geminiService.rescueIncompleteProfiles(remainingToRescue);
        for (const res of rescueResults) {
          const inc = localStore.incompleteRecords.find(r => r.id === res.recordId);
          if (!inc) continue;

          let targetName = res.extractedName ? res.extractedName.trim() : '';
          if (!targetName && inc.raw_name) {
            const cleanRaw = inc.raw_name
              .replace(/\[\s*.*?\s*\](?:\(mailto:[^\s)]+\))?/gi, '')
              .replace(/mailto:[^\s)]+/gi, '')
              .replace(/<[^\s>]+>/gi, '')
              .replace(/[\[\]()<>]/g, '')
              .trim();
            if (isValidCandidateName(cleanRaw)) targetName = cleanRaw;
          }

          let targetEmail = res.extractedEmail || undefined;
          if (!targetEmail && inc.raw_email && normalizeEmail(inc.raw_email) && !['adam', 'alex', 'unassigned'].includes(inc.raw_email.toLowerCase())) {
            targetEmail = normalizeEmail(inc.raw_email)!.original;
          }

          let targetPhone = res.extractedPhone || undefined;
          if (!targetPhone && inc.raw_phone && (normalizePhone(inc.raw_phone) || extractCleanPhone(inc.raw_phone))) {
            targetPhone = normalizePhone(inc.raw_phone)?.normalized || extractCleanPhone(inc.raw_phone) || undefined;
          }

          // Candidate is rescued if we have a valid Name AND at least one contact method (Email OR Phone)
          if (targetName && (targetEmail || targetPhone)) {
            const promoteRes = await this.promoteIncompleteToMaster(inc.id, {
              fullName: targetName,
              email: targetEmail,
              phone: targetPhone,
              role: cleanJobTitle(res.extractedRole || inc.raw_role),
              company: inc.company,
              owner: inc.owner || 'Unassigned',
              recruiterFeedback: inc.recruiter_feedback || undefined, // 100% VERBATIM!
              dateAssigned: inc.date_assigned,
            });

            if (promoteRes.success && promoteRes.person) {
              recoveredCount++;
              promotedCount++;
              promotedNames.push(promoteRes.person.full_name);
            }
          }
        }
      } catch (gemErr) {
        console.warn('Gemini AI incomplete rescue pass error:', gemErr);
      }
    }

    // =========================================================================
    // PHASE 3: AUTOMATIC ANONYMOUS ORPHAN CLEANUP
    // Remove screening logs that have NO candidate identity and NO contact info
    // =========================================================================
    const anonymousRecords = localStore.incompleteRecords.filter(r => {
      const name = (r.raw_name || '').trim();
      const email = (r.raw_email || '').trim();
      const phone = (r.raw_phone || '').trim();
      const hasName = Boolean(name && !isLocationOrCountry(name) && !isRoleOrTech(name) && !isHeaderOrLabelWord(name) && !isScreeningNote(name) && isValidCandidateName(name));
      const hasEmail = Boolean(email && email.includes('@') && !['adam', 'alex', 'unassigned'].includes(email.toLowerCase()));
      const hasPhone = Boolean(phone && extractCleanPhone(phone));
      return !hasName && !hasEmail && !hasPhone;
    });

    if (anonymousRecords.length > 0) {
      const anonIds = anonymousRecords.map(r => r.id);
      await this.deleteIncompleteRecordsBatch(anonIds);
    }

    await localStore.saveToStorage();
    return {
      recoveredCount,
      promotedCount,
      remainingCount: localStore.incompleteRecords.length,
      promotedNames,
    };
  },

  /**
   * Delete all anonymous screening notes (records that lack both candidate name and contact details)
   */
  async deleteAnonymousIncompleteRecords(): Promise<number> {
    await localStore.ensureInitialized();
    const toRemove = localStore.incompleteRecords.filter(r => {
      const name = (r.raw_name || '').trim();
      const email = (r.raw_email || '').trim();
      const phone = (r.raw_phone || '').trim();
      const hasName = Boolean(name && !isLocationOrCountry(name) && !isRoleOrTech(name) && !isHeaderOrLabelWord(name) && !isScreeningNote(name) && isValidCandidateName(name));
      const hasEmail = Boolean(email && email.includes('@') && !['adam', 'alex', 'unassigned'].includes(email.toLowerCase()));
      const hasPhone = Boolean(phone && extractCleanPhone(phone));
      return !hasName && !hasEmail && !hasPhone;
    });

    const removeIds = toRemove.map(r => r.id);
    if (removeIds.length > 0) {
      await this.deleteIncompleteRecordsBatch(removeIds);
    }
    return removeIds.length;
  },

  /**
   * Scans all candidate profiles and heals any records where phone numbers were misplaced as candidate names,
   * where recruiter names were assigned to roles, or where notes were shifted into owner fields.
   */
  async healCandidateRecords(): Promise<number> {
    await localStore.ensureInitialized();
    return await localStore.healAllCandidateData();
  },

  /**
   * Batch assign recruiter owner to multiple candidates or all unassigned candidates
   */
  async batchAssignOwner(personIds: string[], newOwner: string = 'Adam', changedBy: string = 'Admin Recruiter'): Promise<number> {
    await localStore.ensureInitialized();
    const now = new Date().toISOString();
    let updatedCount = 0;
    const toSave: Person[] = [];
    const client = getSupabaseClient();

    const targets = personIds.length > 0
      ? localStore.people.filter(p => personIds.includes(p.id) || personIds.includes(p.person_id))
      : localStore.people.filter(p => !p.current_owner || p.current_owner === 'Unassigned');

    for (const p of targets) {
      if (p.current_owner !== newOwner) {
        const oldOwner = p.current_owner;
        p.current_owner = newOwner;
        p.updated_at = now;
        p.last_activity_at = now;
        toSave.push(p);
        updatedCount++;

        localStore.auditLogs.unshift({
          id: generateUuid(),
          user_id: changedBy,
          action: 'owner_change',
          entity_type: 'person',
          entity_id: p.person_id,
          details: { oldOwner, newOwner, mode: 'batch_assign' },
          created_at: now,
        });
      }
    }

    if (toSave.length > 0) {
      await indexedDBService.putBatch('people', toSave);
      await localStore.saveToStorage();

      if (client) {
        try {
          const updates = toSave.map(p => ({
            id: p.id,
            current_owner: p.current_owner,
            updated_at: now,
          }));
          await client.from('people').upsert(updates, { onConflict: 'id' });
        } catch (e) {
          console.warn('Supabase batchAssignOwner error:', e);
        }
      }
    }

    window.dispatchEvent(new CustomEvent('workspace-data-updated', { detail: { entity: 'candidate', action: 'batch_owner_updated' } }));
    return updatedCount;
  },
};
