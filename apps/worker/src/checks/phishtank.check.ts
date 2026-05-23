const TIMEOUT_MS = 15000;
const FEED_CACHE_TTL_MS = 60 * 60 * 1000; // 1 saat
const DEFAULT_PHISHTANK_FEED_URL = 'https://data.phishtank.com/data/online-valid.json';

interface PhishTankEntry {
  phish_id?: string | number;
  url?: string;
  phish_detail_url?: string;
  submission_time?: string | null;
  verified?: string;
  verification_time?: string | null;
  online?: string;
  target?: string;
}

// Module-level feed cache
let cachedFeed: PhishTankEntry[] | null = null;
let cachedAt = 0;

// Test helper — sadece spec dosyasında kullanılır
export function _resetFeedCache(): void {
  cachedFeed = null;
  cachedAt = 0;
}

export type PhishTankMatchedUrl = {
  url: string;
  phishId?: string | number;
  detailUrl?: string;
  verified?: boolean;
  online?: boolean;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  target?: string;
};

export type PhishTankCheckResult = {
  domain: string;
  provider: string;
  enabled: boolean;
  skipped: boolean;
  skipReason?: string;
  isListed: boolean;
  verifiedMatches: number;
  onlineMatches: number;
  matchedUrls: PhishTankMatchedUrl[];
  checkedAt: string;
  error?: string;
};

function isSameOrSubdomain(hostname: string, domain: string): boolean {
  const h = hostname.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

function makeSkipped(domain: string, skipReason: string): PhishTankCheckResult {
  return {
    domain,
    provider: 'phishtank-feed',
    enabled: false,
    skipped: true,
    skipReason,
    isListed: false,
    verifiedMatches: 0,
    onlineMatches: 0,
    matchedUrls: [],
    checkedAt: new Date().toISOString(),
  };
}

function makeErrored(domain: string, error: string): PhishTankCheckResult {
  return {
    domain,
    provider: 'phishtank-feed',
    enabled: true,
    skipped: false,
    isListed: false,
    verifiedMatches: 0,
    onlineMatches: 0,
    matchedUrls: [],
    checkedAt: new Date().toISOString(),
    error,
  };
}

async function loadFeed(feedUrl: string): Promise<PhishTankEntry[]> {
  const now = Date.now();

  if (cachedFeed && now - cachedAt < FEED_CACHE_TTL_MS) {
    return cachedFeed;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ASM-Platform/1.0 passive-phishing-feed',
      },
    });

    if (res.status === 429) {
      const e = new Error('rate-limited') as Error & { code: string };
      e.code = 'PHISHTANK_RATE_LIMITED';
      throw e;
    }

    if (!res.ok) {
      const e = new Error(`http-${res.status}`) as Error & { code: string };
      e.code = `PHISHTANK_HTTP_${res.status}`;
      throw e;
    }

    const text = await res.text();

    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch {
      const e = new Error('parse-error') as Error & { code: string };
      e.code = 'PHISHTANK_PARSE_ERROR';
      throw e;
    }

    if (!Array.isArray(parsed)) {
      const e = new Error('unsupported-format') as Error & { code: string };
      e.code = 'PHISHTANK_UNSUPPORTED_FEED_FORMAT';
      throw e;
    }

    cachedFeed = parsed as PhishTankEntry[];
    cachedAt = now;

    return cachedFeed;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkPhishTank(domain: string): Promise<PhishTankCheckResult> {
  const envFeedUrl = process.env.PHISHTANK_FEED_URL?.trim() ?? '';
  const apiKey = process.env.PHISHTANK_API_KEY?.trim() ?? '';
  const enabledRaw = process.env.ENABLE_PHISHTANK?.trim().toLowerCase();

  /*
    Fix:
    - ENABLE_PHISHTANK=false / 0 / no yazılırsa kapalı kalır.
    - Bunun dışındaki durumda public PhishTank feed otomatik kullanılır.
    - Böylece worker .env'i okuyamazsa bile "DISABLED / Entegrasyon kapalı" dönmez.
    - Mevcut dönüş tipi, cache, hata kodları ve matchedUrls yapısı bozulmadı.
  */
  const explicitlyDisabled =
    enabledRaw === 'false' ||
    enabledRaw === '0' ||
    enabledRaw === 'no';

  if (explicitlyDisabled) {
    return makeSkipped(domain, 'DISABLED');
  }

  let resolvedFeedUrl: string;

  if (envFeedUrl) {
    resolvedFeedUrl = envFeedUrl;
  } else if (apiKey) {
    resolvedFeedUrl = `https://data.phishtank.com/data/${apiKey}/online-valid.json`;
  } else {
    resolvedFeedUrl = DEFAULT_PHISHTANK_FEED_URL;
  }

  let entries: PhishTankEntry[];

  try {
    entries = await loadFeed(resolvedFeedUrl);
  } catch (err) {
    const e = err as Error & { code?: string };

    let code: string;

    if (e.name === 'AbortError') {
      code = 'PHISHTANK_TIMEOUT';
    } else if (e.code) {
      code = e.code;
    } else {
      code = 'PHISHTANK_FEED_FAILED';
    }

    return makeErrored(domain, code);
  }

  const matched = entries.filter((entry) => {
    if (!entry.url) return false;

    try {
      const { hostname } = new URL(entry.url);
      return isSameOrSubdomain(hostname, domain);
    } catch {
      return false;
    }
  });

  const verifiedMatches = matched.filter((e) => e.verified === 'yes').length;
  const onlineMatches = matched.filter((e) => e.online === 'yes').length;

  const matchedUrls: PhishTankMatchedUrl[] = matched.slice(0, 20).map((entry) => ({
    url: entry.url!,
    phishId: entry.phish_id,
    detailUrl: entry.phish_detail_url,
    verified: entry.verified === 'yes',
    online: entry.online === 'yes',
    submittedAt: entry.submission_time ?? null,
    verifiedAt: entry.verification_time ?? null,
    target: entry.target,
  }));

  return {
    domain,
    provider: 'phishtank-feed',
    enabled: true,
    skipped: false,
    isListed: matched.length > 0,
    verifiedMatches,
    onlineMatches,
    matchedUrls,
    checkedAt: new Date().toISOString(),
  };
}