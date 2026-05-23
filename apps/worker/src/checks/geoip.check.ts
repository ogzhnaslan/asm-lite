import * as dns from 'node:dns/promises';

const TIMEOUT_MS = 6000;
const PROVIDER = 'ip-api';
const FIELDS = 'status,message,country,countryCode,regionName,city,lat,lon,as,isp,org,query';

export interface GeoIpCheckResult {
  assetValue: string;
  assetType: 'DOMAIN' | 'IP';
  resolvedIp: string | null;
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  asn: string | null;
  isp: string | null;
  organization: string | null;
  provider: string;
  checkedAt: string;
  error?: string;
}

interface IpApiResponse {
  status: 'success' | 'fail';
  message?: string;
  country?: string;
  countryCode?: string;
  regionName?: string;
  city?: string;
  lat?: number;
  lon?: number;
  as?: string;
  isp?: string;
  org?: string;
  query?: string;
}

function extractAsn(as: string | undefined): string | null {
  if (!as) return null;
  const m = /^(AS\d+)/.exec(as);
  return m ? m[1] : null;
}

async function resolveIp(domain: string): Promise<string | null> {
  // Use a dedicated resolver with public DNS servers so the system resolver
  // (which may be 127.0.0.1 / unavailable) is bypassed.
  const resolver = new dns.Resolver();
  resolver.setServers(['1.1.1.1', '8.8.8.8']);

  // Try IPv4 first
  try {
    const addrs = await resolver.resolve4(domain);
    if (addrs[0]) return addrs[0];
  } catch {
    // fall through to IPv6 fallback
  }

  // IPv6 fallback — resolved address is still passed to ip-api
  try {
    const addrs = await resolver.resolve6(domain);
    if (addrs[0]) return addrs[0];
  } catch {
    return null;
  }

  return null;
}

function empty(assetValue: string, assetType: 'DOMAIN' | 'IP', error: string): GeoIpCheckResult {
  return {
    assetValue, assetType, resolvedIp: null,
    country: null, countryCode: null, region: null, city: null,
    latitude: null, longitude: null, asn: null, isp: null, organization: null,
    provider: PROVIDER, checkedAt: new Date().toISOString(), error,
  };
}

export async function checkGeoIp(assetValue: string, assetType: 'DOMAIN' | 'IP'): Promise<GeoIpCheckResult> {
  const resolvedIp = assetType === 'DOMAIN' ? await resolveIp(assetValue) : assetValue;

  if (!resolvedIp) {
    return empty(assetValue, assetType, 'IP_RESOLUTION_FAILED');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(resolvedIp)}?fields=${FIELDS}`, {
      signal: controller.signal,
    });

    if (!res.ok) {
      return empty(assetValue, assetType, `HTTP_${res.status}`);
    }

    const data = (await res.json()) as IpApiResponse;

    if (data.status !== 'success') {
      return { ...empty(assetValue, assetType, data.message ?? 'LOOKUP_FAILED'), resolvedIp };
    }

    return {
      assetValue,
      assetType,
      resolvedIp,
      country: data.country ?? null,
      countryCode: data.countryCode ?? null,
      region: data.regionName ?? null,
      city: data.city ?? null,
      latitude: data.lat ?? null,
      longitude: data.lon ?? null,
      asn: extractAsn(data.as),
      isp: data.isp ?? null,
      organization: data.org ?? null,
      provider: PROVIDER,
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    const msg = (err as Error).name === 'AbortError' ? 'GEOIP_TIMEOUT' : 'GEOIP_REQUEST_FAILED';
    return { ...empty(assetValue, assetType, msg), resolvedIp };
  } finally {
    clearTimeout(timer);
  }
}
