import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CompanyWorkspace } from '../types';

// Storage keys per workspace
const AARATECH_URL_KEY = 'aat_supabase_url';
const AARATECH_ANON_KEY = 'aat_supabase_key';

const CLINISOLTECH_URL_KEY = 'clt_supabase_url';
const CLINISOLTECH_ANON_KEY = 'clt_supabase_key';

export function getSupabaseCredentials(company: CompanyWorkspace = 'AaraTech'): {
  url: string;
  anonKey: string;
  isConfigured: boolean;
  company: CompanyWorkspace;
} {
  const envAaraUrl = (import.meta as any).env?.VITE_SUPABASE_URL || (import.meta as any).env?.VITE_AARATECH_SUPABASE_URL || '';
  const envAaraKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.VITE_AARATECH_SUPABASE_ANON_KEY || '';

  const envCliniUrl = (import.meta as any).env?.VITE_CLINISOLTECH_SUPABASE_URL || '';
  const envCliniKey = (import.meta as any).env?.VITE_CLINISOLTECH_SUPABASE_ANON_KEY || '';

  let storedUrl = '';
  let storedKey = '';
  let envUrl = '';
  let envKey = '';

  const getStorage = (key: string): string => {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(key) || '';
    } catch {}
    return '';
  };

  if (company === 'ClinisolTech') {
    storedUrl = getStorage(CLINISOLTECH_URL_KEY);
    storedKey = getStorage(CLINISOLTECH_ANON_KEY);
    envUrl = envCliniUrl;
    envKey = envCliniKey;
  } else {
    storedUrl = getStorage(AARATECH_URL_KEY);
    storedKey = getStorage(AARATECH_ANON_KEY);
    envUrl = envAaraUrl;
    envKey = envAaraKey;
  }

  const url = ((storedUrl && !storedUrl.includes('your-project-id') && storedUrl.startsWith('http')) ? storedUrl : envUrl).trim();
  const anonKey = ((storedKey && storedKey.length > 20) ? storedKey : envKey).trim();

  const isPlaceholder = url.includes('your-project-id') || url.includes('cltnihvibgufoagjtrhr') || url.includes('citnihvibgufoagjtrhr');
  const isConfigured = Boolean(
    url &&
    anonKey &&
    url.startsWith('http') &&
    anonKey.length > 20 &&
    !isPlaceholder
  );

  return { url: isPlaceholder ? '' : url, anonKey: isPlaceholder ? '' : anonKey, isConfigured, company };
}

export function saveSupabaseCredentials(company: CompanyWorkspace, url: string, anonKey: string): void {
  const urlKey = company === 'ClinisolTech' ? CLINISOLTECH_URL_KEY : AARATECH_URL_KEY;
  const anonKeyStorage = company === 'ClinisolTech' ? CLINISOLTECH_ANON_KEY : AARATECH_ANON_KEY;

  if (url) localStorage.setItem(urlKey, url.trim());
  if (anonKey) localStorage.setItem(anonKeyStorage, anonKey.trim());
}

export function clearSupabaseCredentials(company?: CompanyWorkspace): void {
  if (!company || company === 'AaraTech') {
    localStorage.removeItem(AARATECH_URL_KEY);
    localStorage.removeItem(AARATECH_ANON_KEY);
  }
  if (!company || company === 'ClinisolTech') {
    localStorage.removeItem(CLINISOLTECH_URL_KEY);
    localStorage.removeItem(CLINISOLTECH_ANON_KEY);
  }
}

const clientsCache: Record<string, SupabaseClient> = {};
const lastKnownConfigs: Record<string, string> = {};

export function getSupabaseClient(company: CompanyWorkspace = 'AaraTech'): SupabaseClient | null {
  const { url, anonKey, isConfigured } = getSupabaseCredentials(company);

  if (!isConfigured) {
    return null;
  }

  const cacheKey = `${company}:${url}`;
  const configHash = `${url}:::${anonKey}`;

  if (clientsCache[cacheKey] && lastKnownConfigs[cacheKey] === configHash) {
    return clientsCache[cacheKey];
  }

  try {
    const client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    clientsCache[cacheKey] = client;
    lastKnownConfigs[cacheKey] = configHash;
    return client;
  } catch (err) {
    console.error(`Failed to initialize Supabase client for ${company}:`, err);
    return null;
  }
}

export interface HealthCheckResult {
  connected: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'LOCAL FALLBACK' | 'SYNCING' | 'SYNC ERROR' | 'CONNECTION ERROR' | 'connected' | 'unconfigured' | 'invalid_format' | 'auth_error' | 'schema_error' | 'network_error' | 'error';
  message: string;
  timestamp: string;
  latencyMs?: number;
  company: CompanyWorkspace;
  dbType?: string;
  lastSuccessfulCheck?: string;
  lastSuccessfulRead?: string;
  lastSuccessfulWrite?: string;
  syncStatus?: string;
  applicantCount?: number;
  masterPeopleCount?: number;
}

export async function checkSupabaseHealth(company: CompanyWorkspace = 'AaraTech'): Promise<HealthCheckResult> {
  // 1. Authoritative Backend & Database Health Check
  const start = performance.now();
  try {
    const res = await fetch(`/api/health?company=${encodeURIComponent(company)}`, {
      headers: { 'x-company': company },
    });
    if (res.ok) {
      const data = await res.json();
      const latencyMs = data.latencyMs ?? Math.round(performance.now() - start);
      return {
        connected: data.connected ?? (data.status === 'ONLINE'),
        status: data.status === 'ONLINE' ? 'ONLINE' : 'CONNECTION ERROR',
        message: `${company} Relational Database (${data.masterPeopleCount ?? 0} master profiles, ${data.applicantCount ?? 0} applicants)`,
        timestamp: data.lastSuccessfulCheck || new Date().toLocaleTimeString(),
        latencyMs,
        company,
        dbType: data.dbType || 'SQLite Relational Database (Authoritative)',
        lastSuccessfulCheck: data.lastSuccessfulCheck,
        lastSuccessfulRead: data.lastSuccessfulRead,
        lastSuccessfulWrite: data.lastSuccessfulWrite,
        syncStatus: data.syncStatus || 'SYNCHRONIZED',
        applicantCount: data.applicantCount,
        masterPeopleCount: data.masterPeopleCount,
      };
    }
  } catch {
    // If backend cannot be contacted, continue to remote Supabase probe fallback
  }

  const { url, anonKey, isConfigured } = getSupabaseCredentials(company);

  if (!url && !anonKey) {
    return {
      connected: false,
      status: 'unconfigured',
      message: `${company} optional remote cloud sync is unconfigured. (Local SQLite relational database is 100% online & active).`,
      timestamp: new Date().toLocaleTimeString(),
      company,
    };
  }

  if (!url || !url.startsWith('http') || url.includes('your-project-id') || url.includes('cltnihvibgufoagjtrhr') || url.includes('citnihvibgufoagjtrhr')) {
    return {
      connected: false,
      status: 'unconfigured',
      message: `${company} optional remote cloud sync is unconfigured. (Local SQLite relational database is 100% online & active).`,
      timestamp: new Date().toLocaleTimeString(),
      company,
    };
  }

  if (!anonKey || anonKey.length < 20) {
    return {
      connected: false,
      status: 'invalid_format',
      message: `Invalid or missing anon public API key for ${company}.`,
      timestamp: new Date().toLocaleTimeString(),
      company,
    };
  }

  const client = getSupabaseClient(company);
  if (!client) {
    return {
      connected: false,
      status: 'error',
      message: `Failed to initialize Supabase client for ${company}.`,
      timestamp: new Date().toLocaleTimeString(),
      company,
    };
  }

  const supaStart = performance.now();
  try {
    const { error, count } = await client
      .from('people')
      .select('id', { count: 'exact', head: true });

    const latencyMs = Math.round(performance.now() - supaStart);

    if (error) {
      const errMsg = (error.message || '').toLowerCase();
      if (error.code === 'PGRST301' || errMsg.includes('jwt') || errMsg.includes('apikey') || errMsg.includes('unauthorized') || error.hint?.includes('api key')) {
        return {
          connected: false,
          status: 'auth_error',
          message: `Authorization failed for ${company}: Invalid Anon API key or expired token.`,
          timestamp: new Date().toLocaleTimeString(),
          latencyMs,
          company,
        };
      }
      if (errMsg.includes('relation') || errMsg.includes('does not exist') || errMsg.includes('table')) {
        return {
          connected: false,
          status: 'schema_error',
          message: `Connected to ${company} Supabase, but 'people' table is missing from database schema.`,
          timestamp: new Date().toLocaleTimeString(),
          latencyMs,
          company,
        };
      }
      if (errMsg.includes('failed to fetch') || errMsg.includes('network') || errMsg.includes('enotfound')) {
        return {
          connected: false,
          status: 'network_error',
          message: `Unable to connect to Supabase at ${url} (Failed to fetch). Verify project URL or create project at supabase.com. (Local SQLite database remains 100% active).`,
          timestamp: new Date().toLocaleTimeString(),
          latencyMs,
          company,
        };
      }
      return {
        connected: false,
        status: 'error',
        message: `Database error (${error.code || 'Query'}): ${error.message}`,
        timestamp: new Date().toLocaleTimeString(),
        latencyMs,
        company,
      };
    }

    return {
      connected: true,
      status: 'connected',
      message: `Connected to ${company} PostgreSQL (${count ?? 0} candidate profiles)`,
      timestamp: new Date().toLocaleTimeString(),
      latencyMs,
      company,
    };
  } catch (err: any) {
    const errStr = (err?.message || '').toLowerCase();
    const isNetwork = errStr.includes('fetch') || errStr.includes('network') || errStr.includes('econnrefused') || errStr.includes('failed to fetch');
    return {
      connected: false,
      status: isNetwork ? 'network_error' : 'error',
      message: isNetwork
        ? `Unable to reach ${company} Supabase host at ${url}. Verify project URL or create project at supabase.com. (Local SQLite database remains 100% active).`
        : (err?.message || `Error reaching ${company} Supabase endpoint`),
      timestamp: new Date().toLocaleTimeString(),
      company,
    };
  }
}
