const RDAP_BASE = 'https://rdap.org/domain';
const TR_RDAP_BASE = 'https://rdap.com.tr/wp-json/rdap/v1/query';
const TIMEOUT_MS = 8000;

// IANA RDAP bootstrap — TLD → yetkili RDAP sunucusu eşlemesi. rdap.org sadece
// bir "convenience redirect" servisidir ve bazı ağlarda engellenebilir/erişilemez
// (RDAP_REQUEST_FAILED). Doğru yöntem: IANA bootstrap'tan TLD'nin gerçek RDAP
// sunucusunu bulup DOĞRUDAN sorgulamak. rdap.org yalnızca son-çare fallback.
const IANA_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat

// Module-level cache (phishtank feed cache pattern'i ile aynı).
let cachedBootstrap: Map<string, string> | null = null;
let cachedBootstrapAt = 0;

// Test izolasyonu için cache sıfırlama.
export function __resetRdapBootstrapCache(): void {
  cachedBootstrap = null;
  cachedBootstrapAt = 0;
}

interface IanaBootstrap {
  services?: Array<[string[], string[]]>;
}

export interface RdapCheckResult {
  domain: string;
  registrar: string | null;
  createdDate: string | null;
  updatedDate: string | null;
  expiresDate: string | null;
  nameServers: string[];
  status: string[];
  rawSource: 'RDAP';
  checkedAt: string;
  error?: string;
}

type VcardEntry = [string, Record<string, unknown>, string, unknown];

interface RdapEntity {
  roles?: string[];
  vcardArray?: ['vcard', VcardEntry[]];
  entities?: RdapEntity[];
}

interface RdapNameserver {
  ldhName?: string;
}

interface RdapEvent {
  eventAction: string;
  eventDate: string;
}

interface RdapResponse {
  nameservers?: RdapNameserver[];
  entities?: RdapEntity[];
  events?: RdapEvent[];
  status?: string[];
}

interface TrRdapResponse {
  type?: string;
  name?: string;
  source?: string;
  server?: string;
  raw_text?: string;
  parsed?: {
    nameservers?: string[];
    status?: string | string[];
  };
}

function eventDate(events: RdapEvent[], ...actions: string[]): string | null {
  for (const action of actions) {
    const ev = events.find((e) => e.eventAction.toLowerCase() === action);
    if (ev?.eventDate) return ev.eventDate;
  }
  return null;
}

function extractFn(entity: RdapEntity): string | null {
  if (!entity.vcardArray) return null;
  const [, cards] = entity.vcardArray;
  const fn = cards.find((c) => c[0] === 'fn');
  return typeof fn?.[3] === 'string' ? fn[3] : null;
}

function findRegistrar(entities: RdapEntity[]): string | null {
  for (const entity of entities) {
    if (entity.roles?.includes('registrar')) {
      const name = extractFn(entity);
      if (name) return name;
    }

    // Some RDAP responses nest the registrar inside another entity
    if (entity.entities) {
      const nested = findRegistrar(entity.entities);
      if (nested) return nested;
    }
  }

  return null;
}

function normalizeNs(nameservers: RdapNameserver[]): string[] {
  return [...new Set(
    nameservers
      .map((ns) => ns.ldhName?.toLowerCase().replace(/\.$/, ''))
      .filter((v): v is string => !!v),
  )].sort();
}

function normalizeStringNs(nameservers: string[] | undefined): string[] {
  if (!Array.isArray(nameservers)) return [];

  return [...new Set(
    nameservers
      .map((ns) => ns.toLowerCase().replace(/\.$/, '').trim())
      .filter(Boolean),
  )].sort();
}

function normalizeStatus(status: string[]): string[] {
  return [...new Set(status.map((s) => s.toLowerCase()))].sort();
}

function isTrDomain(domain: string): boolean {
  return domain.toLowerCase().replace(/\.$/, '').endsWith('.tr');
}

function parseTrDateToIso(value: string | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim().replace(/\.$/, '');

  const isoDate = new Date(trimmed);
  if (!Number.isNaN(isoDate.getTime())) {
    return isoDate.toISOString();
  }

  // Örnek: 15.01.2027 00:00
  const dotMatch = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (dotMatch) {
    const [, dd, mm, yyyy, hh = '00', min = '00'] = dotMatch;
    const date = new Date(Date.UTC(
      Number(yyyy),
      Number(mm) - 1,
      Number(dd),
      Number(hh),
      Number(min),
      0,
    ));

    return Number.isNaN(date.getTime()) ? trimmed : date.toISOString();
  }

  return trimmed;
}

function parseTrWhoisDate(value: string): string | null {
  const trimmed = value.trim().replace(/\.$/, '');

  // Örnek: 2024-Apr-12
  const match = trimmed.match(/^(\d{4})-([A-Za-z]{3})-(\d{2})$/);
  if (!match) return parseTrDateToIso(trimmed);

  const [, yyyy, mon, dd] = match;

  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  const monthIndex = months[mon.toLowerCase()];
  if (monthIndex === undefined) return trimmed;

  const date = new Date(Date.UTC(Number(yyyy), monthIndex, Number(dd), 0, 0, 0));
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString();
}

function extractRawSection(rawText: string, title: string): string {
  const start = rawText.indexOf(`** ${title}:`);
  if (start === -1) return '';

  const rest = rawText.slice(start);
  const nextSection = rest.slice(1).search(/\n\*\* /);

  return nextSection === -1 ? rest : rest.slice(0, nextSection + 1);
}

function extractRegistrarFromRaw(rawText: string): string | null {
  const registrarSection = extractRawSection(rawText, 'Registrar');
  if (!registrarSection) return null;

  const match = registrarSection.match(/Organization Name\s*:\s*(.+)/i);
  return match?.[1]?.trim() || null;
}

function extractNameserversFromRaw(rawText: string): string[] {
  const nsSection = extractRawSection(rawText, 'Domain Servers');
  if (!nsSection) return [];

  return [...new Set(
    nsSection
      .split('\n')
      .map((line) => line.trim().toLowerCase().replace(/\.$/, ''))
      .filter((line) => line.length > 0)
      .filter((line) => !line.startsWith('**'))
      .filter((line) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(line)),
  )].sort();
}

function extractCreatedFromRaw(rawText: string): string | null {
  const match = rawText.match(/Created on\.*:\s*([0-9]{4}-[A-Za-z]{3}-[0-9]{2})/i);
  return match?.[1] ? parseTrWhoisDate(match[1]) : null;
}

function extractExpiresFromRaw(rawText: string): string | null {
  const match = rawText.match(/Expires on\.*:\s*([0-9]{4}-[A-Za-z]{3}-[0-9]{2})/i);
  return match?.[1] ? parseTrWhoisDate(match[1]) : null;
}

function extractUpdatedFromRaw(rawText: string): string | null {
  const match = rawText.match(/Last Update Time:\s*([^\n]+)/i);
  return match?.[1] ? parseTrDateToIso(match[1].trim()) : null;
}

function extractStatusFromTr(data: TrRdapResponse): string[] {
  const parsedStatus = data.parsed?.status;

  if (Array.isArray(parsedStatus)) {
    return normalizeStatus(parsedStatus);
  }

  if (typeof parsedStatus === 'string' && parsedStatus.trim()) {
    return normalizeStatus([parsedStatus]);
  }

  const rawText = data.raw_text ?? '';
  const match = rawText.match(/Domain Status:\s*(.+)/i);

  return match?.[1] ? normalizeStatus([match[1].trim()]) : [];
}

function fromStandardRdap(domain: string, data: RdapResponse): RdapCheckResult {
  const events: RdapEvent[] = Array.isArray(data.events) ? data.events : [];

  return {
    domain,
    registrar: findRegistrar(Array.isArray(data.entities) ? data.entities : []),
    createdDate: eventDate(events, 'registration'),
    updatedDate: eventDate(events, 'last changed', 'last update of rdap database'),
    expiresDate: eventDate(events, 'expiration'),
    nameServers: normalizeNs(Array.isArray(data.nameservers) ? data.nameservers : []),
    status: normalizeStatus(Array.isArray(data.status) ? data.status : []),
    rawSource: 'RDAP',
    checkedAt: new Date().toISOString(),
  };
}

function fromTrRdap(domain: string, data: TrRdapResponse): RdapCheckResult {
  const rawText = data.raw_text ?? '';

  const parsedNameservers = normalizeStringNs(data.parsed?.nameservers);
  const rawNameservers = extractNameserversFromRaw(rawText);

  return {
    domain,
    registrar: extractRegistrarFromRaw(rawText),
    createdDate: extractCreatedFromRaw(rawText),
    updatedDate: extractUpdatedFromRaw(rawText),
    expiresDate: extractExpiresFromRaw(rawText),
    nameServers: parsedNameservers.length > 0 ? parsedNameservers : rawNameservers,
    status: extractStatusFromTr(data),
    rawSource: 'RDAP',
    checkedAt: new Date().toISOString(),
  };
}

async function fetchJson(url: string): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rdap+json, application/json',
        'User-Agent': 'ASM-Scanner/1.0',
      },
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP_${res.status}` };
    }

    return { ok: true, data: await res.json() };
  } catch (err) {
    const msg = (err as Error).name === 'AbortError' ? 'RDAP_TIMEOUT' : 'RDAP_REQUEST_FAILED';
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

// IANA bootstrap'ı indirip TLD → RDAP base URL haritasını döndürür (cache'li).
// Erişilemezse mevcut (stale) cache döner, o da yoksa null. Hata fırlatmaz.
async function loadBootstrap(): Promise<Map<string, string> | null> {
  if (cachedBootstrap && Date.now() - cachedBootstrapAt < BOOTSTRAP_TTL_MS) {
    return cachedBootstrap;
  }

  const res = await fetchJson(IANA_BOOTSTRAP_URL);
  if (!res.ok) {
    return cachedBootstrap; // stale cache veya null — rdap.org fallback devreye girer
  }

  const data = res.data as IanaBootstrap;
  const map = new Map<string, string>();
  for (const svc of data.services ?? []) {
    const tlds = Array.isArray(svc?.[0]) ? svc[0] : [];
    const urls = Array.isArray(svc?.[1]) ? svc[1] : [];
    const httpsUrl = urls.find((u) => typeof u === 'string' && u.startsWith('https://')) ?? urls[0];
    if (typeof httpsUrl !== 'string' || !httpsUrl) continue;
    const base = httpsUrl.endsWith('/') ? httpsUrl : `${httpsUrl}/`;
    for (const tld of tlds) {
      if (typeof tld === 'string' && tld) map.set(tld.toLowerCase(), base);
    }
  }

  if (map.size > 0) {
    cachedBootstrap = map;
    cachedBootstrapAt = Date.now();
  }
  return cachedBootstrap;
}

// Domain'in TLD'sine karşılık gelen yetkili RDAP base URL'ini bulur (yoksa null).
async function resolveRdapBase(domain: string): Promise<string | null> {
  const tld = domain.split('.').pop()?.toLowerCase();
  if (!tld) return null;
  const bootstrap = await loadBootstrap();
  return bootstrap?.get(tld) ?? null;
}

export async function checkRdap(domain: string): Promise<RdapCheckResult> {
  const normalizedDomain = domain.trim().toLowerCase().replace(/\.$/, '');

  // .tr ccTLD → doğrudan TR RDAP sunucusu (IANA bootstrap'te ccTLD genelde yok,
  // rdap.org da .tr'yi yönlendirmez/erişilemez olabilir). TR başarısızsa rdap.org dene.
  if (isTrDomain(normalizedDomain)) {
    const tr = await fetchJson(`${TR_RDAP_BASE}?q=${encodeURIComponent(normalizedDomain)}`);
    if (tr.ok) {
      return fromTrRdap(normalizedDomain, tr.data as TrRdapResponse);
    }
    const agg = await fetchJson(`${RDAP_BASE}/${encodeURIComponent(normalizedDomain)}`);
    return agg.ok ? fromStandardRdap(normalizedDomain, agg.data as RdapResponse) : empty(normalizedDomain, tr.error);
  }

  // 1. IANA bootstrap ile TLD'nin yetkili RDAP sunucusunu bul, DOĞRUDAN sorgula.
  const base = await resolveRdapBase(normalizedDomain);
  if (base) {
    const direct = await fetchJson(`${base}domain/${encodeURIComponent(normalizedDomain)}`);
    if (direct.ok) {
      return fromStandardRdap(normalizedDomain, direct.data as RdapResponse);
    }
    // Bu sunucu başarısız olursa rdap.org fallback'ine düş.
  }

  // 2. Fallback: rdap.org aggregator (bazı ağlarda engelli olabilir).
  const aggregator = await fetchJson(`${RDAP_BASE}/${encodeURIComponent(normalizedDomain)}`);
  if (aggregator.ok) {
    return fromStandardRdap(normalizedDomain, aggregator.data as RdapResponse);
  }

  return empty(normalizedDomain, aggregator.error);
}

function empty(domain: string, error: string): RdapCheckResult {
  return {
    domain,
    registrar: null,
    createdDate: null,
    updatedDate: null,
    expiresDate: null,
    nameServers: [],
    status: [],
    rawSource: 'RDAP',
    checkedAt: new Date().toISOString(),
    error,
  };
}