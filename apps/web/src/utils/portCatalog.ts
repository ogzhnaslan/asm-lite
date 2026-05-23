// Frontend-only port catalog — sadece bulgu detaylarını kullanıcıya anlaşılır
// göstermek için kullanılır. Worker tarafındaki risk mantığı buradan etkilenmez;
// CRITICAL/RISKY sınıflandırması apps/worker/src/config/constants.ts'tedir.
// İleride ortak ihtiyaç doğarsa packages/shared'a taşınabilir.

export type PortCategory =
  | 'web'
  | 'remote-mgmt'
  | 'mail'
  | 'dns'
  | 'file-share'
  | 'database'
  | 'cache'
  | 'search'
  | 'dev-admin'
  | 'unknown';

export type PortRisk = 'critical' | 'risky' | 'normal';

export interface PortInfo {
  port: number;
  service: string;
  category: PortCategory;
  risk: PortRisk;
  note: string;
}

// Backend constants.ts ile uyumlu — drift olmaması için bu tablo değişirse
// constants.ts'teki RISKY_PORTS / CRITICAL_PORTS listeleriyle karşılaştırın.
const CATALOG: Record<number, PortInfo> = {
  21:    { port: 21,    service: 'FTP',                category: 'file-share',  risk: 'risky',    note: 'Plaintext dosya transferi; kimlik bilgileri açık geçer.' },
  22:    { port: 22,    service: 'SSH',                category: 'remote-mgmt', risk: 'critical', note: 'Uzaktan shell erişimi; brute-force ve credential stuffing hedefi.' },
  23:    { port: 23,    service: 'Telnet',             category: 'remote-mgmt', risk: 'critical', note: 'Plaintext uzak shell; modern güvenlik için kullanılmamalı.' },
  25:    { port: 25,    service: 'SMTP',               category: 'mail',        risk: 'risky',    note: 'Mail relay; open relay kontrolü gerekir.' },
  53:    { port: 53,    service: 'DNS',                category: 'dns',         risk: 'normal',   note: 'Domain çözümleme; yetkili DNS servisleri için meşrudur.' },
  80:    { port: 80,    service: 'HTTP',               category: 'web',         risk: 'normal',   note: 'Standart web; HTTPS yönlendirmesi varsa beklenen durumdur.' },
  110:   { port: 110,   service: 'POP3',               category: 'mail',        risk: 'risky',    note: 'Plaintext mail okuma protokolü.' },
  143:   { port: 143,   service: 'IMAP',               category: 'mail',        risk: 'risky',    note: 'Plaintext mail erişimi; STARTTLS olmadan tehlikeli.' },
  443:   { port: 443,   service: 'HTTPS',              category: 'web',         risk: 'normal',   note: 'Standart şifreli web; meşru servisler için beklenir.' },
  445:   { port: 445,   service: 'SMB',                category: 'file-share',  risk: 'critical', note: 'SMB internete açıksa EternalBlue ailesi gibi açıklara karşı yüksek risk.' },
  465:   { port: 465,   service: 'SMTPS',              category: 'mail',        risk: 'normal',   note: 'Şifreli mail submission; mail sunucuları için meşrudur.' },
  587:   { port: 587,   service: 'SMTP Submission',    category: 'mail',        risk: 'risky',    note: 'Mail submission; STARTTLS zorunlu olmalı, brute-force hedefi olabilir.' },
  993:   { port: 993,   service: 'IMAPS',              category: 'mail',        risk: 'normal',   note: 'Şifreli IMAP; meşru mail erişimi için beklenir.' },
  995:   { port: 995,   service: 'POP3S',              category: 'mail',        risk: 'normal',   note: 'Şifreli POP3; meşru mail erişimi için beklenir.' },
  1433:  { port: 1433,  service: 'MSSQL',              category: 'database',    risk: 'risky',    note: 'Microsoft SQL veritabanı; internete açık olmamalı.' },
  3000:  { port: 3000,  service: 'Dev Server',         category: 'dev-admin',   risk: 'risky',    note: 'Node/Vite/Rails gibi geliştirme sunucusu; production için hardenlanmamış.' },
  3306:  { port: 3306,  service: 'MySQL',              category: 'database',    risk: 'risky',    note: 'MySQL veritabanı; internete açık olmamalı.' },
  3389:  { port: 3389,  service: 'RDP',                category: 'remote-mgmt', risk: 'critical', note: 'Uzak Masaüstü; ransomware ve lateral movement için birincil hedef.' },
  5432:  { port: 5432,  service: 'PostgreSQL',         category: 'database',    risk: 'risky',    note: 'PostgreSQL veritabanı; internete açık olmamalı.' },
  5555:  { port: 5555,  service: 'Dev/Debug',          category: 'dev-admin',   risk: 'risky',    note: 'ADB veya geliştirme debug arayüzü.' },
  5900:  { port: 5900,  service: 'VNC',                category: 'remote-mgmt', risk: 'risky',    note: 'Uzak masaüstü; zayıf veya şifresiz yapılandırma yaygın.' },
  6379:  { port: 6379,  service: 'Redis',              category: 'cache',       risk: 'risky',    note: 'Redis cache; varsayılan olarak auth\'suz, RCE riski mevcut.' },
  8000:  { port: 8000,  service: 'HTTP-ALT',           category: 'dev-admin',   risk: 'risky',    note: 'Alternatif HTTP portu; admin paneli veya iç servis olabilir.' },
  8080:  { port: 8080,  service: 'HTTP-ALT',           category: 'dev-admin',   risk: 'risky',    note: 'Alternatif HTTP; proxy, admin paneli veya staging için kullanılır.' },
  8443:  { port: 8443,  service: 'HTTPS-ALT',          category: 'dev-admin',   risk: 'risky',    note: 'Alternatif HTTPS; yönetim arayüzü için yaygın.' },
  8888:  { port: 8888,  service: 'HTTP-ALT',           category: 'dev-admin',   risk: 'risky',    note: 'Jupyter, dev proxy veya admin arayüzü için yaygın.' },
  9000:  { port: 9000,  service: 'HTTP-ALT',           category: 'dev-admin',   risk: 'risky',    note: 'Portainer, SonarQube veya iç servisler için kullanılır.' },
  9200:  { port: 9200,  service: 'Elasticsearch',      category: 'search',      risk: 'risky',    note: 'Elasticsearch; auth\'suz internete açıksa veri sızıntısı riski yüksek.' },
  11211: { port: 11211, service: 'Memcached',          category: 'cache',       risk: 'risky',    note: 'Memcached; auth desteklemez, amplification saldırılarında kullanılır.' },
  27017: { port: 27017, service: 'MongoDB',            category: 'database',    risk: 'risky',    note: 'MongoDB; varsayılan auth\'suz yapılandırma yaygın, fidye saldırı hedefi.' },
};

export function getPortInfo(port: number): PortInfo {
  return CATALOG[port] ?? {
    port,
    service: `Port ${port}`,
    category: 'unknown',
    risk: 'normal',
    note: 'Bu port için ayrıntılı sınıflandırma yok; servis tanımı manuel doğrulanmalı.',
  };
}

export function isCriticalPort(port: number): boolean {
  return getPortInfo(port).risk === 'critical';
}

export function isRiskyPort(port: number): boolean {
  const r = getPortInfo(port).risk;
  return r === 'critical' || r === 'risky';
}

export const CATEGORY_LABEL: Record<PortCategory, string> = {
  'web':          'Web',
  'remote-mgmt':  'Uzaktan Yönetim',
  'mail':         'E-posta',
  'dns':          'DNS',
  'file-share':   'Dosya Paylaşımı',
  'database':     'Veritabanı',
  'cache':        'Cache',
  'search':       'Arama / İndeks',
  'dev-admin':    'Geliştirme / Admin',
  'unknown':      'Bilinmeyen',
};

// ─── Short summary for FindingCard collapsed view ────────────────────────────

interface PortExposedDataJson {
  openPorts?: number[];
  riskyPorts?: number[];
}

interface PortChangeDataJson {
  newlyOpened?: number[];
  newlyClosed?: number[];
}

export function getPortExposedSummary(dataJson: unknown): string {
  const data = (dataJson ?? {}) as PortExposedDataJson;
  const risky = Array.isArray(data.riskyPorts) ? data.riskyPorts : [];
  if (risky.length === 0) return 'Açık riskli port yok';
  const critical = risky.filter(isCriticalPort);
  return critical.length > 0
    ? `${risky.length} açık riskli port (${critical.length} kritik)`
    : `${risky.length} açık riskli port`;
}

export function getPortChangeSummary(dataJson: unknown): string {
  const data = (dataJson ?? {}) as PortChangeDataJson;
  const opened = Array.isArray(data.newlyOpened) ? data.newlyOpened : [];
  const closed = Array.isArray(data.newlyClosed) ? data.newlyClosed : [];
  const parts: string[] = [];
  if (opened.length > 0) parts.push(`Yeni açılan: ${opened.join(', ')}`);
  if (closed.length > 0) parts.push(`Kapanan: ${closed.join(', ')}`);
  return parts.length > 0 ? parts.join(' · ') : 'Port değişikliği yok';
}
