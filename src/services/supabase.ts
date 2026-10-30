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

  const envCliniUrl = (import.meta as any).env?.VITE_CLINISOLTECH_SUPABASE_URL || 'https://cltnihvibgufoagjtrhr.supabase.co';
  const envCliniKey = (import.meta as any).env?.VITE_CLINISOLTECH_SUPABASE_ANON_KEY || 'sb_publishable_kFQbJObVaGb5czW2oiDDYA_Cyn84ltK';

  let storedUrl = '';
  let storedKey = '';
  let envUrl = '';
  let envKey = '';

  if (company === 'ClinisolTech') {
    storedUrl = localStorage.getItem(CLINISOLTECH_URL_KEY) || '';
    storedKey = localStorage.getItem(CLINISOLTECH_ANON_KEY) || '';
    envUrl = envCliniUrl;
    envKey = envCliniKey;
  } else {
    storedUrl = localStorage.getItem(AARATECH_URL_KEY) || '';
    storedKey = localStorage.getItem(AARATECH_ANON_KEY) || '';
    envUrl = envAaraUrl;
    envKey = envAaraKey;
  }

  const url = ((storedUrl && !storedUrl.includes('your-project-id') && storedUrl.startsWith('http')) ? storedUrl : envUrl).trim();
  const anonKey = ((storedKey && storedKey.length > 20) ? storedKey : envKey).trim();

  const isConfigured = Boolean(
    url &&
    anonKey &&
    url.startsWith('http') &&
    anonKey.length > 20 &&
    !url.includes('your-project-id')
  );

  return { url, anonKey, isConfigured, company };
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
  status: 'connected' | 'unconfigured' | 'invalid_format' | 'auth_error' | 'schema_error' | 'network_error' | 'error';
  message: string;
  timestamp: string;
  latencyMs?: number;
  company: CompanyWorkspace;
}

export async function checkSupabaseHealth(company: CompanyWorkspace = 'AaraTech'): Promise<HealthCheckResult> {
  const { url, anonKey, isConfigured } = getSupabaseCredentials(company);

  if (!url && !anonKey) {
    return {
      connected: false,
      status: 'unconfigured',
      message: `${company} Supabase credentials are not configured yet.`,
      timestamp: new Date().toLocaleTimeString(),
      company,
    };
  }

  if (!url || !url.startsWith('http') || url.includes('your-project-id')) {
    return {
      connected: false,
      status: 'invalid_format',
      message: `Invalid or placeholder Supabase project URL for ${company}.`,
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

  const start = performance.now();
  try {
    const { error, count } = await client
      .from('people')
      .select('id', { count: 'exact', head: true });

    const latencyMs = Math.round(performance.now() - start);

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
        ? `Network unreachable: Unable to connect to ${company} Supabase host.`
        : (err?.message || `Error reaching ${company} Supabase endpoint`),
      timestamp: new Date().toLocaleTimeString(),
      company,
    };
  }
}
