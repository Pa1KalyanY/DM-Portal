import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Retrieve credentials from environment or runtime localStorage
export function getSupabaseCredentials(): { url: string; anonKey: string; isConfigured: boolean } {
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';

  const storedUrl = localStorage.getItem('aat_supabase_url') || '';
  const storedKey = localStorage.getItem('aat_supabase_key') || '';

  const url = (storedUrl || envUrl).trim();
  const anonKey = (storedKey || envKey).trim();

  const isConfigured = Boolean(
    url &&
    anonKey &&
    url.startsWith('http') &&
    anonKey.length > 20 &&
    !url.includes('your-project-id')
  );

  return { url, anonKey, isConfigured };
}

export function saveSupabaseCredentials(url: string, anonKey: string): void {
  if (url) localStorage.setItem('aat_supabase_url', url.trim());
  if (anonKey) localStorage.setItem('aat_supabase_key', anonKey.trim());
}

export function clearSupabaseCredentials(): void {
  localStorage.removeItem('aat_supabase_url');
  localStorage.removeItem('aat_supabase_key');
}

let cachedClient: SupabaseClient | null = null;
let lastKnownUrl = '';
let lastKnownKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey, isConfigured } = getSupabaseCredentials();

  if (!isConfigured) {
    return null;
  }

  if (cachedClient && lastKnownUrl === url && lastKnownKey === anonKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    lastKnownUrl = url;
    lastKnownKey = anonKey;
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export interface HealthCheckResult {
  connected: boolean;
  status: 'connected' | 'unconfigured' | 'error';
  message: string;
  timestamp: string;
  latencyMs?: number;
}

export async function checkSupabaseHealth(): Promise<HealthCheckResult> {
  const { url, isConfigured } = getSupabaseCredentials();

  if (!isConfigured) {
    return {
      connected: false,
      status: 'unconfigured',
      message: 'Supabase URL and Anon Key are not configured yet in .env or Settings.',
      timestamp: new Date().toLocaleTimeString(),
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    return {
      connected: false,
      status: 'error',
      message: 'Failed to create Supabase client instance.',
      timestamp: new Date().toLocaleTimeString(),
    };
  }

  const start = performance.now();
  try {
    // Test query on people table
    const { error, count } = await client
      .from('people')
      .select('id', { count: 'exact', head: true });

    const latencyMs = Math.round(performance.now() - start);

    if (error) {
      return {
        connected: false,
        status: 'error',
        message: `Database query error: ${error.message} (Make sure migration SQL was run)`,
        timestamp: new Date().toLocaleTimeString(),
        latencyMs,
      };
    }

    return {
      connected: true,
      status: 'connected',
      message: `Successfully connected to PostgreSQL (${count ?? 0} candidate profiles)`,
      timestamp: new Date().toLocaleTimeString(),
      latencyMs,
    };
  } catch (err: any) {
    return {
      connected: false,
      status: 'error',
      message: err?.message || 'Network error reaching Supabase endpoint',
      timestamp: new Date().toLocaleTimeString(),
    };
  }
}
