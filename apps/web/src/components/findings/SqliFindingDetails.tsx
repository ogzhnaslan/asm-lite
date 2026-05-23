import type { Finding, SqliFindingDataJson } from '../../types';

// ─── Defansif data okuma ────────────────────────────────────────────────────
// dataJson worker tarafından yazılır (apps/worker/src/findings/sqli.findings.ts).
// Eski snapshot'larda alanlar eksik olabilir — her şey null-safe okunur.

function readData(finding: Finding): Partial<SqliFindingDataJson> {
  return (finding.dataJson ?? {}) as Partial<SqliFindingDataJson>;
}

// ─── UI atoms ────────────────────────────────────────────────────────────────

function SectionCard({
  title, accent, icon, children, subtitle,
}: {
  title: string;
  accent: 'red' | 'orange' | 'green' | 'blue' | 'gray' | 'indigo' | 'amber';
  icon: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const palette: Record<string, { bg: string; border: string; label: string }> = {
    red:    { bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.18)',  label: '#f87171' },
    orange: { bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.18)', label: '#fb923c' },
    green:  { bg: 'rgba(34,197,94,0.06)',  border: 'rgba(34,197,94,0.18)',  label: '#4ade80' },
    blue:   { bg: 'rgba(56,189,248,0.06)', border: 'rgba(56,189,248,0.18)', label: '#7dd3fc' },
    gray:   { bg: 'rgba(255,255,255,0.03)',border: 'rgba(255,255,255,0.08)',label: '#94a3b8' },
    indigo: { bg: 'rgba(99,102,241,0.06)', border: 'rgba(99,102,241,0.18)', label: '#a5b4fc' },
    amber:  { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.18)', label: '#fbbf24' },
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
      <span className="text-[11px] text-slate-500 min-w-[120px] flex-shrink-0 uppercase tracking-wider mt-0.5">{label}</span>
      <span className={`text-sm text-slate-300 break-all ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

// ─── Signal meta ────────────────────────────────────────────────────────────

const SIGNAL_META: Record<string, { label: string; description: string; accent: 'red' | 'orange' | 'amber' }> = {
  SQL_ERROR_PATTERN:        { label: 'SQL Hata Paterni',      description: 'Yanıt body\'sinde DB engine signature\'ı yakalandı', accent: 'red' },
  STATUS_CODE_5XX:          { label: 'HTTP 5xx',              description: 'Payload sonrası sunucu 5xx hata döndürdü',           accent: 'red' },
  STATUS_CODE_CHANGED:      { label: 'Status Değişti',        description: 'Baseline ve payload HTTP status kodları farklı',     accent: 'orange' },
  BODY_LENGTH_DELTA:        { label: 'Yanıt Boyutu Değişti',  description: 'Baseline ve payload yanıt boyutları anlamlı farklı', accent: 'orange' },
  BOOLEAN_TRUE_FALSE_DELTA: { label: 'Boolean TRUE/FALSE Δ',  description: 'TRUE ve FALSE payloadları farklı yanıt üretti',      accent: 'amber' },
};

function SignalBadge({ signal }: { signal: string }) {
  const meta = SIGNAL_META[signal] ?? { label: signal, description: 'Tanımlanmamış sinyal', accent: 'amber' as const };
  const palette: Record<string, { bg: string; border: string; text: string }> = {
    red:    { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.30)',  text: '#fca5a5' },
    orange: { bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.28)', text: '#fdba74' },
    amber:  { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', text: '#fbbf24' },
  };
  const s = palette[meta.accent];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
      title={meta.description}
    >
      <span className="font-mono text-[10px] opacity-80">{signal}</span>
    </span>
  );
}

// ─── Risk strip ─────────────────────────────────────────────────────────────

function RiskStrip({ risk, confirmed }: { risk: string | null | undefined; confirmed: boolean | undefined }) {
  if (!risk) return null;

  const palette: Record<string, { bg: string; border: string; text: string; label: string }> = {
    CRITICAL: { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)',  text: '#f87171', label: 'KRİTİK RİSK' },
    HIGH:     { bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.28)', text: '#fb923c', label: 'YÜKSEK RİSK'  },
    MEDIUM:   { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', text: '#fbbf24', label: 'ORTA RİSK'    },
    LOW:      { bg: 'rgba(56,189,248,0.10)', border: 'rgba(56,189,248,0.25)', text: '#7dd3fc', label: 'DÜŞÜK RİSK'   },
  };
  const p = palette[risk] ?? palette.LOW!;

  return (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-3"
      style={{ background: p.bg, border: `1px solid ${p.border}` }}
    >
      <span className="text-2xl">🚨</span>
      <div className="flex-1">
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: p.text }}>
          SQL Injection Şüphesi · {p.label}
        </p>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Bu bulgu otomatik test sonucudur; manuel doğrulama önerilir.
        </p>
      </div>
      {confirmed ? (
        <span
          className="text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider"
          style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.30)', color: '#4ade80' }}
        >
          ✓ Confirmed
        </span>
      ) : (
        <span
          className="text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: '#94a3b8' }}
        >
          Unconfirmed
        </span>
      )}
    </div>
  );
}

// ─── Main export ────────────────────────────────────────────────────────────

export function SqliFindingDetails({ finding }: { finding: Finding }) {
  const data = readData(finding);
  const evidence = data.evidence;

  return (
    <div className="space-y-3">
      {/* Risk + confirmed strip */}
      <RiskStrip risk={data.risk ?? null} confirmed={data.confirmed} />

      {/* Hedef Bilgisi */}
      <SectionCard title="Hedef Bilgisi" accent="indigo" icon="📍">
        {data.url && (
          <Row
            label="URL"
            value={
              <a
                href={data.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:text-sky-300 underline decoration-dotted underline-offset-2"
              >
                {data.url}
              </a>
            }
            mono
          />
        )}
        {data.method && <Row label="Method" value={<span className="font-mono">{data.method}</span>} />}
        {data.path && <Row label="Path" value={data.path} mono />}
        {data.param && (
          <Row
            label="Inject Param"
            value={<span className="font-mono text-amber-400 font-semibold">{data.param}</span>}
          />
        )}
        {(data.payloadId || data.payloadCategory) && (
          <Row
            label="Tetikleyen Payload"
            value={
              <span>
                <span className="font-mono text-slate-300">{data.payloadId ?? '—'}</span>
                {data.payloadCategory && (
                  <span className="ml-2 text-[10px] text-slate-500 font-mono uppercase">{data.payloadCategory}</span>
                )}
              </span>
            }
          />
        )}
      </SectionCard>

      {/* Sinyaller */}
      {data.signals && data.signals.length > 0 && (
        <SectionCard title="Tespit Sinyalleri" accent="red" icon="🔎" subtitle={`${data.signals.length} sinyal`}>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {data.signals.map((s) => <SignalBadge key={s} signal={s} />)}
          </div>
          <div className="space-y-1 text-[11px] text-slate-500 mt-3">
            {data.signals.map((s) => {
              const meta = SIGNAL_META[s];
              if (!meta) return null;
              return (
                <p key={s}>
                  <span className="font-mono text-slate-400">{s}</span>
                  <span className="text-slate-600 mx-1.5">·</span>
                  {meta.description}
                </p>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Evidence */}
      {evidence && (
        <SectionCard title="Kanıt (Evidence)" accent="gray" icon="📊">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3 text-xs">
            <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <p className="text-[10px] text-slate-600 uppercase tracking-wider">Baseline</p>
              <p className="text-sm text-slate-300 tabular-nums">
                Status: <span className="text-slate-200 font-bold">{evidence.baselineStatus ?? '—'}</span>
              </p>
              <p className="text-sm text-slate-300 tabular-nums">
                Length: <span className="text-slate-200 font-bold">{evidence.baselineLength ?? '—'}</span> byte
              </p>
            </div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <p className="text-[10px] text-red-400/80 uppercase tracking-wider">Payload İle</p>
              <p className="text-sm text-slate-300 tabular-nums">
                Status: <span className="text-red-300 font-bold">{evidence.payloadStatus ?? '—'}</span>
              </p>
              <p className="text-sm text-slate-300 tabular-nums">
                Length: <span className="text-red-300 font-bold">{evidence.payloadLength ?? '—'}</span> byte
              </p>
            </div>
          </div>

          {evidence.matchedErrorPattern && (
            <Row
              label="Engine Sinyali"
              value={
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold"
                  style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.30)', color: '#fca5a5' }}
                >
                  {evidence.matchedErrorPattern.toUpperCase()}
                </span>
              }
            />
          )}

          {evidence.matchedErrorSnippet && (
            <div className="mt-2">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Eşleşen Yanıt Parçası</p>
              <pre
                className="text-[11px] text-red-200 font-mono leading-relaxed px-3 py-2 rounded overflow-auto max-h-32"
                style={{ background: '#1a0707', border: '1px solid rgba(239,68,68,0.18)' }}
              >
                {evidence.matchedErrorSnippet}
              </pre>
            </div>
          )}

          {evidence.networkError && (
            <Row
              label="Network Error"
              value={<span className="font-mono text-amber-300">{evidence.networkError}</span>}
            />
          )}
        </SectionCard>
      )}

      {/* Risk yorumu */}
      <SectionCard title="Risk Yorumu" accent="blue" icon="💬">
        <ul className="text-xs text-slate-400 leading-relaxed space-y-1.5 list-disc list-inside">
          <li>Bu bulgu otomatik test sonucudur ve <span className="text-slate-300 font-medium">manuel doğrulama gerektirir</span>.</li>
          <li>Sonuç, parametrenin SQL sorgusuna <span className="text-slate-300 font-medium">güvenli bağlanmıyor olabileceğini</span> gösterir.</li>
          <li>Doğrulanırsa veri sızıntısı, yetkisiz erişim veya veritabanı hatalarının dışarı sızması riski oluşturabilir.</li>
          <li>"SQL Injection şüphesi gözlendi" şeklinde değerlendirilmeli — kesin saldırı kanıtı değildir.</li>
        </ul>
      </SectionCard>

      {/* Çözüm önerileri */}
      <SectionCard title="Çözüm Önerileri" accent="green" icon="✅">
        <ul className="text-xs text-slate-300 leading-relaxed space-y-2 list-decimal list-inside">
          <li>Prepared statement / parameterized query kullanın.</li>
          <li>Kullanıcı girdisini SQL string içine doğrudan eklemeyin.</li>
          <li>ORM kullanıyorsanız raw query yerine parametre binding kullanın.</li>
          <li>Üretim ortamında detaylı SQL hata mesajlarını göstermeyin.</li>
          <li>Bu endpoint'i manuel güvenlik testiyle doğrulayın.</li>
        </ul>
      </SectionCard>
    </div>
  );
}

export function isSqliFinding(type: string): boolean {
  return type === 'SQL_INJECTION_SUSPECTED';
}

// ─── Short summary (FindingCard kapalı görünümü) ────────────────────────────

export function getSqliFindingSummary(finding: Finding): string | null {
  const data = readData(finding);
  const parts: string[] = [];
  if (data.param) parts.push(`${data.param} parametresi`);
  if (data.risk) parts.push(data.risk);
  if (data.evidence?.matchedErrorPattern) parts.push(`${data.evidence.matchedErrorPattern} sinyali`);
  if (data.confirmed) parts.push('✓ confirmed');
  return parts.length > 0 ? parts.join(' · ') : null;
}
