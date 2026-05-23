const TIMEOUT_MS = 8000;

export interface ProviderResult {
  name: string;
  status: 'ok' | 'skipped' | 'error';
  error?: string;
  isMalicious: boolean;
  score: number | null;
  categories: string[];
  reportCount: number | null;
  lastReportedAt: string | null;
  matchedIndicators: string[];
}

export type ReputationCheckResult = {
  assetValue: string;
  assetType: 'DOMAIN' | 'IP';
  enabled: boolean;
  skipped: boolean;
  skipReason?: string;
  providers: ProviderResult[];
  isMalicious: boolean;
  maxScore: number | null;
  categories: string[];
  checkedAt: string;
  error?: string;
};

function makeSkipped(assetValue: string, assetType: 'DOMAIN' | 'IP', skipReason: string): ReputationCheckResult {
  return {
    assetValue,
    assetType,
    enabled: false,
    skipped: true,
    skipReason,
    providers: [],
    isMalicious: false,
    maxScore: null,
    categories: [],
    checkedAt: new Date().toISOString(),
  };
}

function erroredProvider(name: string, error: string): ProviderResult {
  return {
    name,
    status: 'error',
    error,
    isMalicious: false,
    score: null,
    categories: [],
    reportCount: null,
    lastReportedAt: null,
    matchedIndicators: [],
  };
}

// ─── URLhaus ──────────────────────────────────────────────────────────────────

interface URLhausEntry {
  url?: string;
  url_status?: string;
  threat?: string;
  tags?: string[] | null;
  date_added?: string;
}

interface URLhausResponse {
  query_status?: string;
  urls?: URLhausEntry[];
  blacklists?: {
    spamhaus_dbl?: string;
    surbl?: string;
  };
}

async function checkURLhaus(domain: string): Promise<ProviderResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const urlhausBody = `host=${encodeURIComponent(domain)}`;
  const urlhausUrl = 'https://urlhaus-api.abuse.ch/v1/host/';

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'ASM-Scanner/1.0',
  };

  const urlhausApiKey = process.env.URLHAUS_API_KEY?.trim();

  if (urlhausApiKey) {
    headers['Auth-Key'] = urlhausApiKey;
  }

  try {
    const res = await fetch(urlhausUrl, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: urlhausBody,
    });

    if (!res.ok) {
      return erroredProvider('urlhaus', `HTTP_${res.status}`);
    }

    const json = await res.json() as URLhausResponse;

    if (json.query_status === 'no_results') {
      return {
        name: 'urlhaus',
        status: 'ok',
        isMalicious: false,
        score: null,
        categories: [],
        reportCount: 0,
        lastReportedAt: null,
        matchedIndicators: [],
      };
    }

    const urls = json.urls ?? [];
    const activeUrls = urls.filter((u) => u.url_status === 'online');

    const spamhausListed =
      json.blacklists?.spamhaus_dbl !== 'not listed' &&
      !!json.blacklists?.spamhaus_dbl;

    const surblListed =
      json.blacklists?.surbl !== 'not listed' &&
      !!json.blacklists?.surbl;

    let score: number;
    if (activeUrls.length > 0) score = 85;
    else if (urls.length > 0) score = 55;
    else if (spamhausListed || surblListed) score = 60;
    else score = 50;

    const catSet = new Set<string>();

    for (const u of urls) {
      if (u.threat) catSet.add(u.threat);
      for (const tag of (u.tags ?? [])) catSet.add(tag);
    }

    if (spamhausListed) catSet.add('spamhaus_dbl');
    if (surblListed) catSet.add('surbl');

    const matchedIndicators = urls
      .slice(0, 10)
      .map((u) => u.url ?? '')
      .filter(Boolean);

    return {
      name: 'urlhaus',
      status: 'ok',
      isMalicious: true,
      score,
      categories: [...catSet],
      reportCount: urls.length,
      lastReportedAt: urls[0]?.date_added ?? null,
      matchedIndicators,
    };
  } catch (err) {
    const error = (err as Error).name === 'AbortError' ? 'TIMEOUT' : 'REQUEST_FAILED';
    return erroredProvider('urlhaus', error);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function checkReputation(
  assetValue: string,
  assetType: 'DOMAIN' | 'IP',
): Promise<ReputationCheckResult> {
  const enabled = process.env.ENABLE_REPUTATION === 'true';

  if (!enabled) {
    return makeSkipped(assetValue, assetType, 'FEATURE_DISABLED');
  }

  const providers: ProviderResult[] = [];

  /*
    AbuseIPDB tamamen kaldırıldı.
    Bu check artık sadece URLhaus ile çalışır.

    Not:
    - URLhaus host endpoint'i domain/host odaklıdır.
    - IP asset gelirse reputation check'i patlatmak yerine skipped döndürürüz.
    - Böylece diğer scan yapısı, snapshot mantığı ve finding processor bozulmaz.
  */
  if (assetType === 'IP') {
    return makeSkipped(assetValue, assetType, 'IP_NOT_SUPPORTED_BY_URLHAUS_ONLY_MODE');
  }

  providers.push(await checkURLhaus(assetValue));

  const okProviders = providers.filter((p) => p.status === 'ok');
  const allFailed = providers.length > 0 && providers.every((p) => p.status === 'error');

  const isMalicious = okProviders.some((p) => p.isMalicious);

  const scores = okProviders
    .map((p) => p.score)
    .filter((s): s is number => s !== null);

  const maxScore = scores.length > 0 ? Math.max(...scores) : null;

  const categories = [...new Set(okProviders.flatMap((p) => p.categories))];

  return {
    assetValue,
    assetType,
    enabled: true,
    skipped: false,
    providers,
    isMalicious,
    maxScore,
    categories,
    checkedAt: new Date().toISOString(),
    ...(allFailed ? { error: providers[0]?.error ?? 'ALL_PROVIDERS_FAILED' } : {}),
  };
}