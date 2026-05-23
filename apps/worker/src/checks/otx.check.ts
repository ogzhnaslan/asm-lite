const TIMEOUT_MS = 10000;
const OTX_BASE = 'https://otx.alienvault.com/api/v1/indicators';

export type OtxPulse = {
  name: string;
  created: string;
  tags: string[];
};

export type OtxCheckResult = {
  assetValue: string;
  assetType: 'DOMAIN' | 'IP';
  provider: 'alienvault-otx';
  enabled: boolean;
  skipped: boolean;
  skipReason?: string;
  pulseCount: number;
  pulses: OtxPulse[];
  tags: string[];
  malwareCount: number;
  urlListCount: number;
  passiveDnsCount: number;
  checkedAt: string;
  error?: string;
};

function makeSkipped(assetValue: string, assetType: 'DOMAIN' | 'IP', skipReason: string): OtxCheckResult {
  return {
    assetValue, assetType, provider: 'alienvault-otx',
    enabled: skipReason !== 'DISABLED', skipped: true, skipReason,
    pulseCount: 0, pulses: [], tags: [],
    malwareCount: 0, urlListCount: 0, passiveDnsCount: 0,
    checkedAt: new Date().toISOString(),
  };
}

function makeError(assetValue: string, assetType: 'DOMAIN' | 'IP', error: string): OtxCheckResult {
  return {
    assetValue, assetType, provider: 'alienvault-otx',
    enabled: true, skipped: false,
    pulseCount: 0, pulses: [], tags: [],
    malwareCount: 0, urlListCount: 0, passiveDnsCount: 0,
    checkedAt: new Date().toISOString(), error,
  };
}

async function fetchOtx(url: string, apiKey: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    signal,
    headers: { 'X-OTX-API-KEY': apiKey },
  });

  if (res.status === 401) throw Object.assign(new Error('INVALID_API_KEY'), { code: 'INVALID_API_KEY' });
  if (res.status === 429) throw Object.assign(new Error('RATE_LIMITED'), { code: 'RATE_LIMITED' });
  if (!res.ok) throw Object.assign(new Error('OTX_REQUEST_FAILED'), { code: 'OTX_REQUEST_FAILED' });

  return res.json();
}

export async function checkOtx(assetValue: string, assetType: 'DOMAIN' | 'IP'): Promise<OtxCheckResult> {
  const enabled = process.env.ENABLE_OTX === 'true';
  if (!enabled) return makeSkipped(assetValue, assetType, 'DISABLED');

  const apiKey = (process.env.OTX_API_KEY ?? '').trim();
  if (!apiKey) return makeSkipped(assetValue, assetType, 'NO_CREDENTIALS');

  // MVP: IPv6 not supported
  if (assetType === 'IP') {
    const isIPv6 = assetValue.includes(':');
    if (isIPv6) return makeSkipped(assetValue, assetType, 'IPV6_NOT_SUPPORTED');
  }

  const indicator = assetType === 'DOMAIN' ? `domain/${assetValue}` : `IPv4/${assetValue}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const [generalData, malwareData, urlListData, passiveDnsData] = await Promise.allSettled([
      fetchOtx(`${OTX_BASE}/${indicator}/general`, apiKey, controller.signal),
      assetType === 'DOMAIN'
        ? fetchOtx(`${OTX_BASE}/${indicator}/malware`, apiKey, controller.signal)
        : Promise.resolve(null),
      assetType === 'DOMAIN'
        ? fetchOtx(`${OTX_BASE}/${indicator}/url_list`, apiKey, controller.signal)
        : Promise.resolve(null),
      assetType === 'DOMAIN'
        ? fetchOtx(`${OTX_BASE}/${indicator}/passive_dns`, apiKey, controller.signal)
        : Promise.resolve(null),
    ]);

    if (generalData.status === 'rejected') {
      const err = generalData.reason as Error & { code?: string };
      if (err.name === 'AbortError') return makeError(assetValue, assetType, 'OTX_TIMEOUT');
      return makeError(assetValue, assetType, err.code ?? 'OTX_REQUEST_FAILED');
    }

    const general = generalData.value as Record<string, unknown>;

    const rawPulses = (general.pulse_info as { pulses?: unknown[] } | undefined)?.pulses ?? [];
    const pulses: OtxPulse[] = (rawPulses as Array<Record<string, unknown>>).slice(0, 20).map((p) => ({
      name: String(p.name ?? ''),
      created: String(p.created ?? ''),
      tags: Array.isArray(p.tags) ? (p.tags as unknown[]).map(String).slice(0, 10) : [],
    }));

    const allTags = Array.from(
      new Set(pulses.flatMap((p) => p.tags))
    ).slice(0, 20);

    const malwareCount = malwareData.status === 'fulfilled' && malwareData.value !== null
      ? ((malwareData.value as Record<string, unknown>).count as number | undefined) ?? 0
      : 0;

    const urlListCount = urlListData.status === 'fulfilled' && urlListData.value !== null
      ? ((urlListData.value as Record<string, unknown>).count as number | undefined) ?? 0
      : 0;

    const passiveDnsCount = passiveDnsData.status === 'fulfilled' && passiveDnsData.value !== null
      ? (((passiveDnsData.value as Record<string, unknown>).passive_dns as unknown[] | undefined) ?? []).length
      : 0;

    return {
      assetValue, assetType, provider: 'alienvault-otx',
      enabled: true, skipped: false,
      pulseCount: pulses.length,
      pulses,
      tags: allTags,
      malwareCount,
      urlListCount,
      passiveDnsCount,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.name === 'AbortError') return makeError(assetValue, assetType, 'OTX_TIMEOUT');
    return makeError(assetValue, assetType, e.code ?? 'OTX_REQUEST_FAILED');
  } finally {
    clearTimeout(timer);
  }
}
