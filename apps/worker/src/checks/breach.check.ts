const TIMEOUT_MS = 10000;

type BreachProvider = 'hibp' | 'leakcheck' | 'mock';

export type BreachExposureCheckResult = {
  domain: string;
  enabled: boolean;
  skipped: boolean;
  skipReason?: string;
  provider: BreachProvider;
  status: 'ok' | 'skipped' | 'error';
  breachCount: number;
  exposedEmailsCount: number | null;
  latestBreachDate: string | null;
  sources: string[];
  sensitiveDataTypes: string[];
  checkedAt: string;
  error?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSkipped(domain: string, provider: BreachProvider, skipReason: string): BreachExposureCheckResult {
  return {
    domain, enabled: skipReason !== 'FEATURE_DISABLED', skipped: true, skipReason,
    provider, status: 'skipped',
    breachCount: 0, exposedEmailsCount: null, latestBreachDate: null,
    sources: [], sensitiveDataTypes: [],
    checkedAt: new Date().toISOString(),
  };
}

function makeError(domain: string, provider: BreachProvider, error: string): BreachExposureCheckResult {
  return {
    domain, enabled: true, skipped: false,
    provider, status: 'error', error,
    breachCount: 0, exposedEmailsCount: null, latestBreachDate: null,
    sources: [], sensitiveDataTypes: [],
    checkedAt: new Date().toISOString(),
  };
}

function makeClean(domain: string, provider: BreachProvider): BreachExposureCheckResult {
  return {
    domain, enabled: true, skipped: false,
    provider, status: 'ok',
    breachCount: 0, exposedEmailsCount: 0, latestBreachDate: null,
    sources: [], sensitiveDataTypes: [],
    checkedAt: new Date().toISOString(),
  };
}

// ─── Mock ─────────────────────────────────────────────────────────────────────

const MOCK_BREACHED = new Set(['example.com', 'test-breach.local']);

function mockProvider(domain: string): BreachExposureCheckResult {
  if (!MOCK_BREACHED.has(domain)) return makeClean(domain, 'mock');
  return {
    domain, enabled: true, skipped: false, provider: 'mock', status: 'ok',
    breachCount: 2, exposedEmailsCount: 8,
    latestBreachDate: '2025-11-01T00:00:00.000Z',
    sources: ['MockBreach2025', 'DemoLeak2024'],
    sensitiveDataTypes: ['email', 'password_hash'],
    checkedAt: new Date().toISOString(),
  };
}

// ─── HIBP ─────────────────────────────────────────────────────────────────────

// Maps HIBP DataClasses to internal normalized names
const HIBP_DATA_CLASS_MAP: Record<string, string> = {
  'Passwords': 'password',
  'Password hints': 'password_hint',
  'Email addresses': 'email',
  'Usernames': 'username',
  'Phone numbers': 'phone',
  'Physical addresses': 'address',
  'Credit cards': 'credit_card',
  'Social security numbers': 'ssn',
  'IP addresses': 'ip_address',
  'Names': 'name',
  'Dates of birth': 'date_of_birth',
  'Auth tokens': 'auth_token',
  'Government issued IDs': 'government_id',
  'Security questions and answers': 'security_qa',
};

function normalizeHibpClass(dc: string): string {
  return HIBP_DATA_CLASS_MAP[dc] ?? dc.toLowerCase().replace(/\s+/g, '_');
}

interface HibpBreach {
  Name?: string;
  BreachDate?: string;
  PwnCount?: number;
  DataClasses?: string[];
}

async function checkHibp(domain: string, apiKey: string): Promise<BreachExposureCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`https://haveibeenpwned.com/api/v3/breaches?domain=${encodeURIComponent(domain)}`, {
      signal: controller.signal,
      headers: { 'hibp-api-key': apiKey, 'User-Agent': 'ASM-Scanner/1.0' },
    });

    // 401 = bad key, 403 = forbidden, 429 = rate limited
    if (res.status === 401) return makeError(domain, 'hibp', 'HIBP_UNAUTHORIZED');
    if (res.status === 429) return makeError(domain, 'hibp', 'HIBP_RATE_LIMITED');
    if (!res.ok) return makeError(domain, 'hibp', `HIBP_HTTP_${res.status}`);

    const breaches = await res.json() as HibpBreach[];
    if (!Array.isArray(breaches) || breaches.length === 0) return makeClean(domain, 'hibp');

    const sources = breaches.map((b) => b.Name ?? 'Unknown').filter(Boolean);
    const allClasses = [...new Set(breaches.flatMap((b) => b.DataClasses ?? []))];
    const sensitiveDataTypes = allClasses.map(normalizeHibpClass);
    const totalPwned = breaches.reduce((s, b) => s + (b.PwnCount ?? 0), 0);

    const dates = breaches.map((b) => b.BreachDate).filter(Boolean) as string[];
    const latestBreachDate = dates.length > 0
      ? new Date([...dates].sort().at(-1)! + 'T00:00:00Z').toISOString()
      : null;

    return {
      domain, enabled: true, skipped: false, provider: 'hibp', status: 'ok',
      breachCount: breaches.length,
      exposedEmailsCount: totalPwned > 0 ? totalPwned : null,
      latestBreachDate,
      sources,
      sensitiveDataTypes,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    const error = (err as Error).name === 'AbortError' ? 'HIBP_TIMEOUT' : 'HIBP_REQUEST_FAILED';
    return makeError(domain, 'hibp', error);
  } finally {
    clearTimeout(timer);
  }
}

// ─── LeakCheck ────────────────────────────────────────────────────────────────

interface LeakCheckSource {
  name?: string;
  date?: string;
  passwordtype?: string;
}

interface LeakCheckEntry {
  sources?: LeakCheckSource[];
}

interface LeakCheckResponse {
  success?: boolean;
  found?: number;
  result?: LeakCheckEntry[];
}

async function checkLeakCheck(domain: string, apiKey: string): Promise<BreachExposureCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`https://leakcheck.io/api/v2/query/${encodeURIComponent(domain)}?type=domain`, {
      signal: controller.signal,
      headers: { 'X-API-Key': apiKey, 'User-Agent': 'ASM-Scanner/1.0' },
    });

    if (res.status === 401 || res.status === 403) return makeError(domain, 'leakcheck', 'LEAKCHECK_UNAUTHORIZED');
    if (res.status === 429) return makeError(domain, 'leakcheck', 'LEAKCHECK_RATE_LIMITED');
    if (!res.ok) return makeError(domain, 'leakcheck', `LEAKCHECK_HTTP_${res.status}`);

    const json = await res.json() as LeakCheckResponse;

    if (!json.success || !json.result || json.result.length === 0) {
      return makeClean(domain, 'leakcheck');
    }

    const sourceSet = new Set<string>();
    const dataTypeSet = new Set<string>(['email']); // Domain queries always include email
    const dates: string[] = [];

    for (const entry of json.result) {
      for (const src of (entry.sources ?? [])) {
        if (src.name) sourceSet.add(src.name);
        if (src.date) dates.push(src.date);
        if (src.passwordtype) {
          dataTypeSet.add(src.passwordtype === 'plaintext' ? 'password' : 'password_hash');
        }
      }
    }

    const latestRaw = dates.length > 0 ? [...dates].sort().at(-1)! : null;
    const latestBreachDate = latestRaw
      ? (latestRaw.length <= 7 ? `${latestRaw}-01T00:00:00.000Z` : new Date(latestRaw).toISOString())
      : null;

    return {
      domain, enabled: true, skipped: false, provider: 'leakcheck', status: 'ok',
      breachCount: sourceSet.size,
      exposedEmailsCount: json.found ?? json.result.length,
      latestBreachDate,
      sources: [...sourceSet],
      sensitiveDataTypes: [...dataTypeSet],
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    const error = (err as Error).name === 'AbortError' ? 'LEAKCHECK_TIMEOUT' : 'LEAKCHECK_REQUEST_FAILED';
    return makeError(domain, 'leakcheck', error);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function checkBreachExposure(domain: string): Promise<BreachExposureCheckResult> {
  const providerName = ((process.env.BREACH_PROVIDER ?? 'mock').toLowerCase()) as BreachProvider;
  const enabled = process.env.ENABLE_BREACH === 'true';

  if (!enabled) return makeSkipped(domain, providerName, 'FEATURE_DISABLED');

  if (providerName === 'mock') return mockProvider(domain);

  if (providerName === 'hibp') {
    const apiKey = process.env.HIBP_API_KEY?.trim() ?? '';
    if (!apiKey) return makeSkipped(domain, 'hibp', 'NO_CREDENTIALS');
    return checkHibp(domain, apiKey);
  }

  if (providerName === 'leakcheck') {
    const apiKey = process.env.LEAKCHECK_API_KEY?.trim() ?? '';
    if (!apiKey) return makeSkipped(domain, 'leakcheck', 'NO_CREDENTIALS');
    return checkLeakCheck(domain, apiKey);
  }

  return makeSkipped(domain, 'mock', 'UNKNOWN_PROVIDER');
}
