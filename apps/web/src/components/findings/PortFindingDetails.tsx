import type { Finding } from '../../types';
import {
  getPortInfo,
  isCriticalPort,
  isRiskyPort,
  CATEGORY_LABEL,
  type PortInfo,
} from '../../utils/portCatalog';

// ─── Types — defansif: backend shape değişirse crash etmesin ─────────────────

interface PortResultJson {
  port: number;
  open: boolean;
  latencyMs: number | null;
  error: string | null;
}

interface PortsExposedDataJson {
  openPorts?: number[];
  riskyPorts?: number[];
  results?: PortResultJson[];
}

interface PortsChangeDataJson {
  prevOpenPorts?: number[];
  currOpenPorts?: number[];
  newlyOpened?: number[];
  newlyClosed?: number[];
}

// ─── Shared UI atoms ─────────────────────────────────────────────────────────

function PortBadge({ port, variant }: { port: number; variant: 'critical' | 'risky' | 'normal' | 'neutral' | 'opened' | 'closed' }) {
  const info = getPortInfo(port);
  const styles: Record<string, { bg: string; border: string; text: string }> = {
    critical: { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)',  text: '#f87171' },
    risky:    { bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.30)', text: '#fb923c' },
    normal:   { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  text: '#4ade80' },
    neutral:  { bg: 'rgba(255,255,255,0.04)',border: 'rgba(255,255,255,0.10)',text: '#94a3b8' },
    opened:   { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.28)',  text: '#fca5a5' },
    closed:   { bg: 'rgba(56,189,248,0.10)', border: 'rgba(56,189,248,0.25)', text: '#7dd3fc' },
  };
  const s = styles[variant];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md font-mono"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
      title={info.note}
    >
      <span className="tabular-nums">{port}</span>
      <span className="text-[10px] opacity-80 font-sans">{info.service}</span>
    </span>
  );
}

function SectionCard({
  title, accent, icon, children, subtitle,
}: {
  title: string;
  accent: 'red' | 'orange' | 'green' | 'blue' | 'gray' | 'indigo';
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

function PortDetailRow({ result }: { result: PortResultJson }) {
  const info = getPortInfo(result.port);
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="pt-0.5">
        <PortBadge port={result.port} variant={
          info.risk === 'critical' ? 'critical' :
          info.risk === 'risky' ? 'risky' : 'normal'
        } />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-400">
          <span className="text-slate-500">{CATEGORY_LABEL[info.category]}</span>
          {result.latencyMs !== null && (
            <>
              <span className="text-slate-700 mx-1.5">·</span>
              <span className="text-slate-500">latency: <span className="tabular-nums text-slate-400">{result.latencyMs}ms</span></span>
            </>
          )}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{info.note}</p>
      </div>
    </div>
  );
}

// ─── PORT_EXPOSED block ──────────────────────────────────────────────────────

function PortExposedDetails({ data }: { data: PortsExposedDataJson }) {
  const results: PortResultJson[] = Array.isArray(data.results) ? data.results : [];
  const openPorts: number[] = Array.isArray(data.openPorts) ? data.openPorts : [];
  const openResults = results.filter((r) => r && r.open === true);

  const criticalOpen = openResults.filter((r) => isCriticalPort(r.port));
  const riskyOpen    = openResults.filter((r) => !isCriticalPort(r.port) && isRiskyPort(r.port));
  const normalOpen   = openResults.filter((r) => !isRiskyPort(r.port));

  // Tarama özeti istatistikleri
  const timeoutPorts   = results.filter((r) => r.error === 'TIMEOUT').map((r) => r.port);
  const refusedPorts   = results.filter((r) => !r.open && (r.error === 'ECONNREFUSED' || r.error === null));
  const otherErrors    = results.filter((r) => !r.open && r.error !== null && r.error !== 'TIMEOUT' && r.error !== 'ECONNREFUSED');
  const totalChecked   = results.length;

  // Fallback: dataJson eski formattaysa (results yok), openPorts'tan üret
  const hasResults = results.length > 0;

  return (
    <div className="space-y-3">
      {/* Kritik açık portlar */}
      {criticalOpen.length > 0 && (
        <SectionCard
          title="Kritik Açık Portlar"
          accent="red"
          icon="🔴"
          subtitle={`${criticalOpen.length} adet`}
        >
          <div className="space-y-1">
            {criticalOpen.map((r) => <PortDetailRow key={r.port} result={r} />)}
          </div>
        </SectionCard>
      )}

      {/* Riskli açık portlar (kritik olmayan) */}
      {riskyOpen.length > 0 && (
        <SectionCard
          title="Riskli Açık Portlar"
          accent="orange"
          icon="🟠"
          subtitle={`${riskyOpen.length} adet`}
        >
          <div className="space-y-1">
            {riskyOpen.map((r) => <PortDetailRow key={r.port} result={r} />)}
          </div>
        </SectionCard>
      )}

      {/* Normal açık portlar (80/443 vb. — finding üretmez) */}
      {normalOpen.length > 0 && (
        <SectionCard
          title="Normal Açık Portlar"
          accent="green"
          icon="🟢"
          subtitle={`${normalOpen.length} adet — finding üretmez`}
        >
          <p className="text-xs text-slate-500 mb-2 leading-relaxed">
            Bu portlar standart web/DNS/mail servisleri içindir. Açık olmaları tek başına bir bulgu olarak işaretlenmez.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {normalOpen.map((r) => <PortBadge key={r.port} port={r.port} variant="normal" />)}
          </div>
        </SectionCard>
      )}

      {/* Eski format fallback — results yok ama openPorts var */}
      {!hasResults && openPorts.length > 0 && (
        <SectionCard title="Açık Portlar" accent="orange" icon="🔓">
          <p className="text-xs text-slate-500 mb-2 leading-relaxed">
            Bu eski bir tarama kaydı — port-bazlı detay (latency, hata) mevcut değil.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {openPorts.map((p) => <PortBadge key={p} port={p} variant={isCriticalPort(p) ? 'critical' : isRiskyPort(p) ? 'risky' : 'normal'} />)}
          </div>
        </SectionCard>
      )}

      {/* Tarama özeti */}
      {hasResults && (
        <SectionCard title="Tarama Özeti" accent="indigo" icon="📊">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <Stat label="Taranan" value={totalChecked} color="text-slate-300" />
            <Stat label="Açık" value={openResults.length} color="text-red-400" />
            <Stat label="Kapalı" value={refusedPorts.length} color="text-slate-400" />
            <Stat label="Zaman aşımı" value={timeoutPorts.length} color="text-amber-400" />
          </div>
          {timeoutPorts.length > 0 && (
            <p className="text-xs text-amber-500/80 mt-3 leading-relaxed">
              ⚠️ <span className="font-semibold">{timeoutPorts.length} port</span> için kontrol tamamlanamadı ({timeoutPorts.join(', ')}). Zaman aşımına uğrayan portlar açık veya kapalı olarak işaretlenmez — sonraki taramada tekrar denenir.
            </p>
          )}
          {otherErrors.length > 0 && (
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              {otherErrors.length} portta diğer hata: {otherErrors.slice(0, 5).map((r) => `${r.port}(${r.error})`).join(', ')}
              {otherErrors.length > 5 ? ` +${otherErrors.length - 5}` : ''}
            </p>
          )}
        </SectionCard>
      )}

      {/* Risk yorumu */}
      <SectionCard title="Risk Yorumu" accent="blue" icon="💬">
        <ul className="text-xs text-slate-400 leading-relaxed space-y-1.5 list-disc list-inside">
          <li>Bir portun açık olması <span className="text-slate-300 font-medium">tek başına kesin bir zafiyet değildir</span>.</li>
          <li>Ancak açık portlar, internetten erişilebilir <span className="text-slate-300 font-medium">servis yüzeyini genişletir</span>.</li>
          <li>Veritabanı, cache, uzaktan yönetim portları internete açıksa <span className="text-amber-400 font-medium">öncelikli incelenmelidir</span>.</li>
          <li>80/443 gibi standart web portları normal kabul edilir ve finding üretmez.</li>
        </ul>
      </SectionCard>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <p className="text-[10px] text-slate-600 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

// ─── PORT_CHANGE block ───────────────────────────────────────────────────────

function PortChangeDetails({ data }: { data: PortsChangeDataJson }) {
  const newlyOpened: number[] = Array.isArray(data.newlyOpened) ? data.newlyOpened : [];
  const newlyClosed: number[] = Array.isArray(data.newlyClosed) ? data.newlyClosed : [];
  const prevOpenPorts: number[] = Array.isArray(data.prevOpenPorts) ? data.prevOpenPorts : [];
  const currOpenPorts: number[] = Array.isArray(data.currOpenPorts) ? data.currOpenPorts : [];

  const portInfoNote = (p: number): string => {
    const info: PortInfo = getPortInfo(p);
    const riskLabel = info.risk === 'critical' ? 'kritik' : info.risk === 'risky' ? 'riskli' : 'normal';
    return `${info.service} · ${riskLabel}`;
  };

  return (
    <div className="space-y-3">
      {/* Yeni açılan portlar */}
      {newlyOpened.length > 0 && (
        <SectionCard title="Yeni Açılan Portlar" accent="red" icon="🆕" subtitle={`${newlyOpened.length} adet`}>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {newlyOpened.map((p) => <PortBadge key={p} port={p} variant="opened" />)}
          </div>
          <div className="space-y-1 mt-2">
            {newlyOpened.map((p) => (
              <p key={p} className="text-xs text-slate-500">
                <span className="font-mono text-slate-400">{p}</span>
                <span className="text-slate-600 mx-1.5">·</span>
                {portInfoNote(p)}
              </p>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Kapanan portlar */}
      {newlyClosed.length > 0 && (
        <SectionCard title="Kapanan Portlar" accent="blue" icon="🔒" subtitle={`${newlyClosed.length} adet`}>
          <div className="flex flex-wrap gap-1.5">
            {newlyClosed.map((p) => <PortBadge key={p} port={p} variant="closed" />)}
          </div>
        </SectionCard>
      )}

      {/* Karşılaştırma */}
      <SectionCard title="Açık Port Listeleri" accent="gray" icon="📋">
        <div className="space-y-3">
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5">Önceki tarama</p>
            {prevOpenPorts.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {prevOpenPorts.map((p) => <PortBadge key={p} port={p} variant="neutral" />)}
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic">(boş — açık port yoktu)</p>
            )}
          </div>
          <div>
            <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5">Mevcut tarama</p>
            {currOpenPorts.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {currOpenPorts.map((p) => (
                  <PortBadge
                    key={p}
                    port={p}
                    variant={isCriticalPort(p) ? 'critical' : isRiskyPort(p) ? 'risky' : 'normal'}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600 italic">(boş — açık port yok)</p>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Neden finding üretildi? */}
      <SectionCard title="Bu Değişikliğin Anlamı" accent="blue" icon="💬">
        <ul className="text-xs text-slate-400 leading-relaxed space-y-1.5 list-disc list-inside">
          <li>Port durumu değişikliği <span className="text-slate-300 font-medium">tek başına kötücül bir olay değildir</span>.</li>
          <li>Yapılandırma değişikliği, planlı bir servis açma/kapatma veya yeni bir deploy sonucu olabilir.</li>
          <li>Ancak değişikliğin <span className="text-slate-300 font-medium">yetkili ve planlı</span> olduğu doğrulanmalıdır.</li>
          <li>Yeni açılan riskli/kritik portlar (örn. veritabanı, uzaktan yönetim) <span className="text-amber-400 font-medium">öncelikli incelenmelidir</span>.</li>
        </ul>
      </SectionCard>
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function PortFindingDetails({ finding }: { finding: Finding }) {
  if (finding.type === 'PORT_EXPOSED') {
    return <PortExposedDetails data={(finding.dataJson ?? {}) as PortsExposedDataJson} />;
  }
  if (finding.type === 'PORT_CHANGE') {
    return <PortChangeDetails data={(finding.dataJson ?? {}) as PortsChangeDataJson} />;
  }
  return null;
}

export function isPortFinding(type: string): boolean {
  return type === 'PORT_EXPOSED' || type === 'PORT_CHANGE';
}
