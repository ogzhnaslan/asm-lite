import type { Finding } from '../../types';

// ─── Defansif dataJson tipleri ───────────────────────────────────────────────
// Backend snapshot/finding shape'i geriye uyumlu — opsiyonel alanlar eski
// kayıtlarda yok olabilir. Her şey defansif okunur.

interface TlsCipherJson {
  name?: string;
  standardName?: string;
  version?: string;
  bits?: number;
}

interface TlsCommonJson {
  host?: string;
  port?: number;
  validTo?: string | null;
  daysLeft?: number | null;
  issuer?: Record<string, string> | null;
  subject?: Record<string, string> | null;
  serialNumber?: string | null;
  fingerprint256?: string | null;
  // Sprint 1B opsiyonel
  protocol?: string | null;
  cipher?: TlsCipherJson | null;
  authorized?: boolean;
  authorizationError?: string | null;
}

interface TlsCheckDataJson extends TlsCommonJson {
  ok?: boolean;
  error?: string;
}

interface TlsChangeDataJson {
  previous?: { fingerprint256?: string | null; serialNumber?: string | null; issuer?: Record<string, string> | null; subject?: Record<string, string> | null };
  current?:  { fingerprint256?: string | null; serialNumber?: string | null; issuer?: Record<string, string> | null; subject?: Record<string, string> | null };
  fingerprintChanged?: boolean;
  serialChanged?: boolean;
  issuerChanged?: boolean;
  subjectChanged?: boolean;
}

// ─── UI atoms ────────────────────────────────────────────────────────────────

function SectionCard({
  title, accent, icon, children, subtitle,
}: {
  title: string;
  accent: 'red' | 'orange' | 'green' | 'blue' | 'gray' | 'indigo' | 'emerald';
  icon: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const palette: Record<string, { bg: string; border: string; label: string }> = {
    red:     { bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.18)',  label: '#f87171' },
    orange:  { bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.18)', label: '#fb923c' },
    green:   { bg: 'rgba(34,197,94,0.06)',  border: 'rgba(34,197,94,0.18)',  label: '#4ade80' },
    blue:    { bg: 'rgba(56,189,248,0.06)', border: 'rgba(56,189,248,0.18)', label: '#7dd3fc' },
    gray:    { bg: 'rgba(255,255,255,0.03)',border: 'rgba(255,255,255,0.08)',label: '#94a3b8' },
    indigo:  { bg: 'rgba(99,102,241,0.06)', border: 'rgba(99,102,241,0.18)', label: '#a5b4fc' },
    emerald: { bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.18)', label: '#6ee7b7' },
  };
  const p = palette[accent];
  return (
    <div className="rounded-xl p-4" style={{ background: p.bg, border: `1px solid ${p.border}` }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{icon}</span>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: p.label }}>{title}</p>
        {subtitle && <span className="text-xs text-slate-500 ml-auto">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <span className="text-[11px] text-slate-500 min-w-[110px] flex-shrink-0 uppercase tracking-wider mt-0.5">{label}</span>
      <span className={`text-sm text-slate-300 break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function truncateFingerprint(fp: string | null | undefined): string {
  if (!fp) return '—';
  return fp.length > 24 ? `${fp.slice(0, 16)}…${fp.slice(-8)}` : fp;
}

function formatDn(dn: Record<string, string> | null | undefined): string {
  if (!dn) return '—';
  const cn = dn.CN ?? dn.commonName;
  const o  = dn.O ?? dn.organizationName;
  if (cn && o) return `${cn} (${o})`;
  if (cn) return cn;
  if (o)  return o;
  return JSON.stringify(dn);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR');
  } catch {
    return iso;
  }
}

// ─── Protocol / Cipher / Chain panel — TLS_CHECK & TLS_EXPIRING ortak ────────

function ProtocolCipherCard({ data }: { data: TlsCommonJson }) {
  const hasProtocol = typeof data.protocol === 'string' && data.protocol.length > 0;
  const hasCipher   = !!data.cipher?.name;
  if (!hasProtocol && !hasCipher) return null;

  const isModern = data.protocol === 'TLSv1.3' || data.protocol === 'TLSv1.2';

  return (
    <SectionCard
      title="Protokol ve Cipher"
      accent={isModern ? 'emerald' : 'orange'}
      icon="🔐"
    >
      {hasProtocol && (
        <Row
          label="Protokol"
          value={
            <span className="inline-flex items-center gap-2">
              <span className="font-mono">{data.protocol}</span>
              {!isModern && (
                <span className="text-[10px] font-bold text-orange-400 bg-orange-500/15 border border-orange-500/30 px-1.5 py-0.5 rounded">
                  ESKİ
                </span>
              )}
            </span>
          }
        />
      )}
      {hasCipher && data.cipher && (
        <>
          <Row label="Cipher" value={data.cipher.name} mono />
          {data.cipher.bits !== undefined && (
            <Row label="Bit Uzunluğu" value={`${data.cipher.bits}-bit`} />
          )}
          {data.cipher.version && data.cipher.version !== data.protocol && (
            <Row label="Cipher Sürümü" value={data.cipher.version} mono />
          )}
        </>
      )}
      <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
        TLSv1.3 ve TLSv1.2 güncel kabul edilir; TLSv1.0/1.1 modern tarayıcılarca desteklenmez ve uyumluluk/güvenlik riski taşır.
      </p>
    </SectionCard>
  );
}

function ChainValidationCard({ data }: { data: TlsCommonJson }) {
  if (data.authorized === undefined && !data.authorizationError) return null;

  const authorized = data.authorized === true;
  const hasError = !!data.authorizationError;

  return (
    <SectionCard
      title="Sertifika Zinciri Doğrulaması"
      accent={authorized && !hasError ? 'emerald' : 'red'}
      icon={authorized && !hasError ? '✅' : '⚠️'}
    >
      <Row
        label="Durum"
        value={
          authorized && !hasError
            ? <span className="text-emerald-400 font-semibold">Geçerli zincir (authorized)</span>
            : <span className="text-red-400 font-semibold">Zincir doğrulanamadı</span>
        }
      />
      {hasError && (
        <>
          <Row label="Hata Kodu" value={<span className="font-mono text-red-300">{data.authorizationError}</span>} />
          <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
            Yaygın anlamlar: <span className="text-slate-400 font-mono">SELF_SIGNED_CERT_IN_CHAIN</span> kendi imzalı sertifika,{' '}
            <span className="text-slate-400 font-mono">UNABLE_TO_VERIFY_LEAF_SIGNATURE</span> eksik intermediate CA,{' '}
            <span className="text-slate-400 font-mono">CERT_HAS_EXPIRED</span> süresi geçmiş sertifika.
          </p>
        </>
      )}
      <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
        Tarama, sertifika zinciri doğrulanmasa bile bağlantıyı kurar (raporlanabilirlik için). Bu hata tarayıcı seviyesinde "Bağlantı güvenli değil" uyarısı olarak görünür.
      </p>
    </SectionCard>
  );
}

function CertificateCard({ data }: { data: TlsCommonJson }) {
  return (
    <SectionCard title="Sertifika Bilgisi" accent="gray" icon="📜">
      <Row label="Subject"    value={formatDn(data.subject)} />
      <Row label="Issuer"     value={formatDn(data.issuer)} />
      <Row label="Geçerlilik" value={formatDate(data.validTo)} />
      {typeof data.daysLeft === 'number' && (
        <Row
          label="Kalan Gün"
          value={
            <span className={
              data.daysLeft <= 7 ? 'text-red-400 font-bold' :
              data.daysLeft <= 15 ? 'text-orange-400 font-bold' :
              data.daysLeft <= 30 ? 'text-yellow-400 font-semibold' :
              'text-emerald-400 font-semibold'
            }>
              {data.daysLeft} gün
            </span>
          }
        />
      )}
      {data.serialNumber && <Row label="Serial" value={data.serialNumber} mono />}
      {data.fingerprint256 && (
        <Row label="Fingerprint" value={truncateFingerprint(data.fingerprint256)} mono />
      )}
    </SectionCard>
  );
}

// ─── TLS_CHECK (bağlantı/handshake hatası) ───────────────────────────────────

function TlsCheckDetails({ data }: { data: TlsCheckDataJson }) {
  const error = data.error ?? 'UNKNOWN';
  return (
    <div className="space-y-3">
      <SectionCard title="TLS Bağlantı Hatası" accent="red" icon="🔴">
        <Row label="Hedef" value={`${data.host ?? '—'}:${data.port ?? 443}`} mono />
        <Row label="Hata Kodu" value={<span className="font-mono text-red-300">{error}</span>} />
        <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
          TLS handshake tamamlanamadı. Sunucu HTTPS desteklemiyor olabilir, port kapalı olabilir veya zincir okunamayacak kadar bozuk olabilir.
        </p>
      </SectionCard>

      {/* error olsa da bazı durumlarda host/port dışında veri yoktur; varsa göster */}
      {(data.protocol || data.cipher) && <ProtocolCipherCard data={data} />}
      {(data.authorized !== undefined || data.authorizationError) && <ChainValidationCard data={data} />}
    </div>
  );
}

// ─── TLS_EXPIRING (geçerlilik yaklaşıyor) ────────────────────────────────────

function TlsExpiringDetails({ data }: { data: TlsCommonJson }) {
  return (
    <div className="space-y-3">
      <CertificateCard data={data} />
      <ProtocolCipherCard data={data} />
      <ChainValidationCard data={data} />
    </div>
  );
}

// ─── TLS_CHANGE (sertifika değişti) ──────────────────────────────────────────

function ChangedField({ label, prev, curr, changed }: {
  label: string;
  prev: React.ReactNode;
  curr: React.ReactNode;
  changed?: boolean;
}) {
  return (
    <div className="rounded-lg p-3" style={{
      background: changed ? 'rgba(249,115,22,0.06)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${changed ? 'rgba(249,115,22,0.20)' : 'rgba(255,255,255,0.05)'}`,
    }}>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        {changed && (
          <span className="text-[10px] font-bold text-orange-400 bg-orange-500/15 border border-orange-500/30 px-1.5 py-0.5 rounded">
            DEĞİŞTİ
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-[10px] text-slate-600 uppercase mb-0.5">Önceki</p>
          <p className="text-slate-300 break-all font-mono">{prev}</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-600 uppercase mb-0.5">Mevcut</p>
          <p className="text-slate-300 break-all font-mono">{curr}</p>
        </div>
      </div>
    </div>
  );
}

function TlsChangeDetails({ data }: { data: TlsChangeDataJson }) {
  const prev = data.previous ?? {};
  const curr = data.current ?? {};
  return (
    <div className="space-y-3">
      <SectionCard title="Sertifika Değişikliği" accent="orange" icon="🔀">
        <div className="space-y-2">
          <ChangedField
            label="Fingerprint (SHA-256)"
            prev={truncateFingerprint(prev.fingerprint256)}
            curr={truncateFingerprint(curr.fingerprint256)}
            changed={data.fingerprintChanged}
          />
          <ChangedField
            label="Serial Number"
            prev={prev.serialNumber ?? '—'}
            curr={curr.serialNumber ?? '—'}
            changed={data.serialChanged}
          />
          <ChangedField
            label="Issuer"
            prev={formatDn(prev.issuer)}
            curr={formatDn(curr.issuer)}
            changed={data.issuerChanged}
          />
          <ChangedField
            label="Subject"
            prev={formatDn(prev.subject)}
            curr={formatDn(curr.subject)}
            changed={data.subjectChanged}
          />
        </div>
      </SectionCard>

      <SectionCard title="Bu Değişikliğin Anlamı" accent="blue" icon="💬">
        <ul className="text-xs text-slate-400 leading-relaxed space-y-1.5 list-disc list-inside">
          <li>Sertifika yenileme veya CA değişimi sırasında bu alanlar doğal olarak değişir.</li>
          <li><span className="text-slate-300 font-medium">Beklenmeyen</span> fingerprint/issuer değişikliği yetkisiz müdahale veya MITM girişimi sinyali olabilir.</li>
          <li>Subject CN değiştiyse domain ya da SAN listesi değişmiş olabilir — yeni sertifikanın doğru domain'i kapsadığını doğrulayın.</li>
        </ul>
      </SectionCard>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function TlsFindingDetails({ finding }: { finding: Finding }) {
  const data = (finding.dataJson ?? {}) as Record<string, unknown>;

  if (finding.type === 'TLS_CHECK') {
    return <TlsCheckDetails data={data as TlsCheckDataJson} />;
  }
  if (finding.type === 'TLS_EXPIRING') {
    return <TlsExpiringDetails data={data as TlsCommonJson} />;
  }
  if (finding.type === 'TLS_CHANGE') {
    return <TlsChangeDetails data={data as TlsChangeDataJson} />;
  }
  return null;
}

export function isTlsFinding(type: string): boolean {
  return type === 'TLS_CHECK' || type === 'TLS_EXPIRING' || type === 'TLS_CHANGE';
}

// ─── Kısa özet (FindingCard kapalı görünüm) ──────────────────────────────────

export function getTlsFindingSummary(finding: Finding): string | null {
  const data = (finding.dataJson ?? {}) as Record<string, unknown>;

  if (finding.type === 'TLS_CHECK') {
    const err = (data.error as string | undefined) ?? 'UNKNOWN';
    return `Hata: ${err}`;
  }

  if (finding.type === 'TLS_EXPIRING') {
    const dl = data.daysLeft as number | undefined;
    const parts: string[] = [];
    if (typeof dl === 'number') parts.push(`${dl} gün kaldı`);
    const protocol = data.protocol as string | undefined;
    if (protocol) parts.push(protocol);
    const issuer = data.issuer as Record<string, string> | undefined;
    const issuerCn = issuer?.CN ?? issuer?.commonName;
    if (issuerCn) parts.push(issuerCn);
    return parts.length > 0 ? parts.join(' · ') : null;
  }

  if (finding.type === 'TLS_CHANGE') {
    const flags: string[] = [];
    if (data.fingerprintChanged) flags.push('fingerprint');
    if (data.serialChanged) flags.push('serial');
    if (data.issuerChanged) flags.push('issuer');
    if (data.subjectChanged) flags.push('subject');
    return flags.length > 0 ? `Değişen: ${flags.join(', ')}` : null;
  }

  return null;
}
