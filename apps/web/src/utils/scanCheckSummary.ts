// Scan check snapshot → kullanıcıya gösterilecek durum + kısa Türkçe özet.
// "Akış" görünümünde her taramanın TÜM check'lerini (temiz + sorunlu) göstermek
// için kullanılır. dataJson, worker'ın ürettiği ilgili check sonucudur (ham snapshot).
import { isRiskyPort } from './portCatalog';

export type CheckStatus = 'ok' | 'warn' | 'error' | 'skip';

export interface CheckSummary {
  type: string;
  label: string;
  status: CheckStatus;
  summary: string;
}

const LABELS: Record<string, string> = {
  PORTS: 'Açık Portlar',
  TLS_INFO: 'TLS Sertifikası',
  HTTP_HEALTH: 'HTTP Sağlığı',
  SECURITY_HEADERS: 'Güvenlik Başlıkları',
  DNS_RECORDS: 'DNS Kayıtları',
  RDAP_INFO: 'WHOIS / RDAP',
  GEOIP_INFO: 'GeoIP / ASN',
  ROBOTS_TXT: 'robots.txt',
  PHISHTANK_REPUTATION: 'PhishTank İtibarı',
  MALICIOUS_REPUTATION: 'Zararlı İtibar',
  BREACH_EXPOSURE: 'Veri Sızıntısı',
  OTX_INTELLIGENCE: 'AlienVault OTX',
  SQLI_PROBE: 'SQL Injection Probe',
  VISUAL_ANALYSIS: 'Görsel Analiz',
};

// Sıralama — akışta mantıklı bir okuma düzeni.
export const CHECK_ORDER = [
  'PORTS', 'TLS_INFO', 'HTTP_HEALTH', 'SECURITY_HEADERS', 'DNS_RECORDS',
  'RDAP_INFO', 'GEOIP_INFO', 'ROBOTS_TXT', 'PHISHTANK_REPUTATION',
  'MALICIOUS_REPUTATION', 'BREACH_EXPOSURE', 'OTX_INTELLIGENCE',
  'SQLI_PROBE', 'VISUAL_ANALYSIS',
];

type D = Record<string, unknown>;

function asRecord(v: unknown): D {
  return v && typeof v === 'object' ? (v as D) : {};
}
function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function summarizeCheck(type: string, dataJson: unknown): CheckSummary {
  const label = LABELS[type] ?? type;
  const d = asRecord(dataJson);
  const error = str(d.error);

  // Ortak: check tamamen çöktüyse.
  if (error === 'CHECK_CRASHED') {
    return { type, label, status: 'error', summary: 'Kontrol çalışırken hata oluştu (crash).' };
  }

  const make = (status: CheckStatus, summary: string): CheckSummary => ({ type, label, status, summary });

  switch (type) {
    case 'PORTS': {
      if (error) return make('error', `Hata: ${error}`);
      const open = arr(d.openPorts).filter((p): p is number => typeof p === 'number');
      const checked = arr(d.checkedPorts).length;
      if (open.length === 0) return make('ok', `${checked} port tarandı · açık port yok`);
      const risky = open.filter(isRiskyPort);
      const list = open.join(', ');
      return risky.length > 0
        ? make('warn', `${open.length} açık port (${list}) · ${risky.length} riskli`)
        : make('ok', `${open.length} açık port (${list}) · riskli yok`);
    }

    case 'TLS_INFO': {
      if (error) return make('error', `Bağlantı/hata: ${error}`);
      if (d.ok !== true) return make('warn', 'TLS bağlantısı kurulamadı.');
      const days = num(d.daysLeft);
      if (days === null) return make('ok', 'TLS bağlantısı kuruldu.');
      if (days < 0) return make('error', 'Sertifika süresi DOLMUŞ.');
      if (days < 30) return make('warn', `Sertifika ${days} gün içinde sona eriyor.`);
      return make('ok', `Sertifika geçerli · ${days} gün kaldı.`);
    }

    case 'HTTP_HEALTH': {
      if (error) return make('error', `Erişilemiyor: ${error}`);
      const code = num(d.statusCode);
      const latency = num(d.latencyMs);
      if (code === null) return make('error', 'Yanıt alınamadı.');
      const latTxt = latency !== null ? ` · ${latency}ms` : '';
      if (code >= 500) return make('error', `Sunucu hatası ${code}${latTxt}`);
      if (code >= 400) return make('warn', `İstemci hatası ${code}${latTxt}`);
      return make('ok', `${code} OK${latTxt}`);
    }

    case 'SECURITY_HEADERS': {
      const reason = str(d.reason);
      if (reason === 'IP_ASSET') return make('skip', 'IP asset — başlık kontrolü yapılmaz.');
      if (error) return make('error', `Hata: ${error}`);
      const missing = arr(d.missing);
      if (missing.length === 0) return make('ok', 'Tüm zorunlu güvenlik başlıkları mevcut.');
      return make('warn', `${missing.length} eksik başlık: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''}`);
    }

    case 'DNS_RECORDS': {
      if (error) return make('error', `Hata: ${error}`);
      const records = arr(d.records);
      const dmarc = str(d.dmarcRecord);
      return make('ok', `${records.length} kayıt çözümlendi${dmarc ? ' · DMARC var' : ' · DMARC yok'}`);
    }

    case 'RDAP_INFO': {
      if (error) return make('warn', `RDAP alınamadı: ${error}`);
      const registrar = str(d.registrar);
      const expires = str(d.expiresDate);
      const exp = expires ? ` · bitiş ${expires.slice(0, 10)}` : '';
      return make('ok', `${registrar ?? 'registrar bilinmiyor'}${exp}`);
    }

    case 'GEOIP_INFO': {
      if (error) return make('warn', `GeoIP alınamadı: ${error}`);
      const cc = str(d.countryCode);
      const asn = str(d.asn);
      const isp = str(d.isp) ?? str(d.organization);
      const parts = [cc, asn, isp].filter(Boolean);
      return make('ok', parts.length ? parts.join(' · ') : 'Konum bilgisi alındı.');
    }

    case 'ROBOTS_TXT': {
      if (error) return make('warn', `robots.txt alınamadı: ${error}`);
      if (d.exists !== true) return make('ok', 'robots.txt yok.');
      const sensitive = arr(d.sensitivePaths);
      if (sensitive.length > 0) return make('warn', `${sensitive.length} hassas path ifşa ediliyor.`);
      const disallow = arr(d.disallowRules);
      return make('ok', `robots.txt var · ${disallow.length} kural · hassas path yok`);
    }

    case 'PHISHTANK_REPUTATION': {
      if (d.skipped === true) return make('skip', `Atlandı (${str(d.skipReason) ?? 'devre dışı'}).`);
      if (error) return make('warn', `Sorgulanamadı: ${error}`);
      if (d.isListed === true) return make('warn', `Phishing listesinde · ${num(d.verifiedMatches) ?? 0} doğrulanmış eşleşme.`);
      return make('ok', 'Phishing listesinde değil.');
    }

    case 'MALICIOUS_REPUTATION': {
      if (d.skipped === true) return make('skip', `Atlandı (${str(d.skipReason) ?? 'devre dışı'}).`);
      if (error) return make('warn', `Sorgulanamadı: ${error}`);
      if (d.isMalicious === true) return make('warn', `Zararlı itibar · skor ${num(d.maxScore) ?? '?'}.`);
      return make('ok', 'Zararlı itibar tespit edilmedi.');
    }

    case 'BREACH_EXPOSURE': {
      if (d.skipped === true) return make('skip', `Atlandı (${str(d.skipReason) ?? 'devre dışı'}).`);
      if (str(d.status) === 'error') return make('warn', `Sorgulanamadı: ${error ?? 'sağlayıcı hatası'}`);
      const count = num(d.breachCount) ?? 0;
      if (count > 0) return make('warn', `${count} bilinen veri sızıntısı.`);
      return make('ok', 'Bilinen veri sızıntısı yok.');
    }

    case 'OTX_INTELLIGENCE': {
      if (d.skipped === true) return make('skip', `Atlandı (${str(d.skipReason) ?? 'devre dışı'}).`);
      if (error) return make('warn', `Sorgulanamadı: ${error}`);
      const pulses = num(d.pulseCount) ?? 0;
      const malware = num(d.malwareCount) ?? 0;
      if (pulses > 0 || malware > 0) return make('warn', `${pulses} pulse · ${malware} malware referansı.`);
      return make('ok', 'OTX tehdit ilişkisi bulunamadı.');
    }

    case 'SQLI_PROBE': {
      if (d.skipped === true) return make('skip', `Atlandı (${str(d.skipReason) ?? 'devre dışı'}).`);
      if (error) return make('error', `Hata: ${error}`);
      const suspected = num(d.suspectedCount) ?? 0;
      const targets = num(d.targetCount) ?? 0;
      if (suspected > 0) return make('warn', `${targets} hedef test edildi · ${suspected} şüpheli.`);
      return make('ok', `${targets} hedef test edildi · şüpheli yok.`);
    }

    case 'VISUAL_ANALYSIS': {
      if (d.skipped === true) return make('skip', `Atlandı (${str(d.skipReason) ?? 'devre dışı'}).`);
      if (error) return make('error', `Hata: ${error}`);
      const signals = arr(d.signals).filter((s): s is string => typeof s === 'string');
      if (signals.length > 0) return make('warn', `Sinyaller: ${signals.join(', ')}`);
      const cat = str(d.siteCategory);
      return make('ok', cat ? `Sayfa kategorisi: ${cat} · sinyal yok` : 'Görsel sinyal yok.');
    }

    default:
      return make('ok', 'Tamamlandı.');
  }
}
