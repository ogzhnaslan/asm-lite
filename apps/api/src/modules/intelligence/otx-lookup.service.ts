import { Injectable } from '@nestjs/common';

const TIMEOUT_MS = 10_000;
const OTX_BASE = 'https://otx.alienvault.com/api/v1/indicators';

export interface OtxPulse {
  name: string;
  created: string;
  tags: string[];
}

export interface OtxLookupResult {
  provider: 'alienvault-otx';
  enabled: boolean;
  skipped: boolean;
  skipReason?: string;
  assetValue: string;
  assetType: 'DOMAIN' | 'IP';
  pulseCount: number;
  pulses: OtxPulse[];
  tags: string[];
  malwareCount: number;
  urlListCount: number;
  passiveDnsCount: number;
  checkedAt: string;
  error?: string;
}

@Injectable()
export class OtxLookupService {
  async lookup(target: string, targetType: 'DOMAIN' | 'IP'): Promise<OtxLookupResult> {
    const enabled = process.env.ENABLE_OTX === 'true';
    if (!enabled) return this.makeSkipped(target, targetType, 'DISABLED');

    const apiKey = (process.env.OTX_API_KEY ?? '').trim();
    if (!apiKey) return this.makeSkipped(target, targetType, 'NO_CREDENTIALS');

    if (targetType === 'IP' && target.includes(':')) {
      return this.makeSkipped(target, targetType, 'IPV6_NOT_SUPPORTED');
    }

    const indicator = targetType === 'DOMAIN' ? `domain/${target}` : `IPv4/${target}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const [generalData, malwareData, urlListData, passiveDnsData] = await Promise.allSettled([
        this.fetchOtx(`${OTX_BASE}/${indicator}/general`, apiKey, controller.signal),
        targetType === 'DOMAIN'
          ? this.fetchOtx(`${OTX_BASE}/${indicator}/malware`, apiKey, controller.signal)
          : Promise.resolve(null),
        targetType === 'DOMAIN'
          ? this.fetchOtx(`${OTX_BASE}/${indicator}/url_list`, apiKey, controller.signal)
          : Promise.resolve(null),
        targetType === 'DOMAIN'
          ? this.fetchOtx(`${OTX_BASE}/${indicator}/passive_dns`, apiKey, controller.signal)
          : Promise.resolve(null),
      ]);

      if (generalData.status === 'rejected') {
        const err = generalData.reason as Error & { code?: string };
        if (err.name === 'AbortError') return this.makeError(target, targetType, 'OTX_TIMEOUT');
        return this.makeError(target, targetType, err.code ?? 'OTX_REQUEST_FAILED');
      }

      const general = generalData.value as Record<string, unknown>;

      const rawPulses =
        (general.pulse_info as { pulses?: unknown[] } | undefined)?.pulses ?? [];
      const pulses: OtxPulse[] = (rawPulses as Array<Record<string, unknown>>)
        .slice(0, 20)
        .map((p) => ({
          name: String(p.name ?? ''),
          created: String(p.created ?? ''),
          tags: Array.isArray(p.tags) ? (p.tags as unknown[]).map(String).slice(0, 10) : [],
        }));

      const allTags = Array.from(new Set(pulses.flatMap((p) => p.tags))).slice(0, 20);

      const malwareCount =
        malwareData.status === 'fulfilled' && malwareData.value !== null
          ? ((malwareData.value as Record<string, unknown>).count as number | undefined) ?? 0
          : 0;

      const urlListCount =
        urlListData.status === 'fulfilled' && urlListData.value !== null
          ? ((urlListData.value as Record<string, unknown>).count as number | undefined) ?? 0
          : 0;

      const passiveDnsCount =
        passiveDnsData.status === 'fulfilled' && passiveDnsData.value !== null
          ? (
              ((passiveDnsData.value as Record<string, unknown>).passive_dns as unknown[] | undefined) ?? []
            ).length
          : 0;

      return {
        provider: 'alienvault-otx',
        enabled: true,
        skipped: false,
        assetValue: target,
        assetType: targetType,
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
      if (e.name === 'AbortError') return this.makeError(target, targetType, 'OTX_TIMEOUT');
      return this.makeError(target, targetType, e.code ?? 'OTX_REQUEST_FAILED');
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchOtx(url: string, apiKey: string, signal: AbortSignal): Promise<unknown> {
    const res = await fetch(url, {
      signal,
      headers: { 'X-OTX-API-KEY': apiKey },
    });

    if (res.status === 401)
      throw Object.assign(new Error('INVALID_API_KEY'), { code: 'INVALID_API_KEY' });
    if (res.status === 429)
      throw Object.assign(new Error('RATE_LIMITED'), { code: 'RATE_LIMITED' });
    if (!res.ok)
      throw Object.assign(new Error('OTX_REQUEST_FAILED'), { code: 'OTX_REQUEST_FAILED' });

    return res.json();
  }

  private makeSkipped(
    target: string,
    targetType: 'DOMAIN' | 'IP',
    skipReason: string,
  ): OtxLookupResult {
    return {
      provider: 'alienvault-otx',
      enabled: skipReason !== 'DISABLED',
      skipped: true,
      skipReason,
      assetValue: target,
      assetType: targetType,
      pulseCount: 0,
      pulses: [],
      tags: [],
      malwareCount: 0,
      urlListCount: 0,
      passiveDnsCount: 0,
      checkedAt: new Date().toISOString(),
    };
  }

  private makeError(
    target: string,
    targetType: 'DOMAIN' | 'IP',
    error: string,
  ): OtxLookupResult {
    return {
      provider: 'alienvault-otx',
      enabled: true,
      skipped: false,
      assetValue: target,
      assetType: targetType,
      pulseCount: 0,
      pulses: [],
      tags: [],
      malwareCount: 0,
      urlListCount: 0,
      passiveDnsCount: 0,
      checkedAt: new Date().toISOString(),
      error,
    };
  }
}
