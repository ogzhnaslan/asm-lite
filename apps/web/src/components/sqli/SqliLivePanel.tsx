import { useQuery } from '@tanstack/react-query';
import { listSqliTargets, getFindings } from '../../api/api';
import { Spinner } from '../Spinner';
import type { SqliFindingDataJson } from '../../types';

// Canlı SQLi Test Paneli — sticky right column.
// Veri kaynağı: mevcut API'ler (listSqliTargets + getFindings). Backend dedicated
// SQLI_PROBE snapshot endpoint'i yok; "canlı panel" görseli, hedef listesi ve
// SQL_INJECTION_SUSPECTED finding'lerinden derlenir. İleride real-time WebSocket
// veya snapshot endpoint eklenirse veri katmanı kolayca değiştirilebilir.

interface Props {
  assetId: string;
  assetType: string;
  assetStatus: string;
  isScanRunning?: boolean;
}

type Status = 'NOT_DOMAIN' | 'NOT_VERIFIED' | 'NO_TARGETS' | 'CLEAN' | 'SUSPECTED';

const STATUS_META: Record<Status, { label: string; description: string; tone: 'gray' | 'amber' | 'red' | 'green' | 'blue' }> = {
  NOT_DOMAIN:    { label: 'NOT_DOMAIN',    description: 'SQLi testi yalnızca domain assetlerinde çalışır.',                tone: 'gray' },
  NOT_VERIFIED:  { label: 'NOT_VERIFIED',  description: 'Asset doğrulanmamış. SQLi testi yalnızca verified assetlerde.', tone: 'amber' },
  NO_TARGETS:    { label: 'NO_TARGETS',    description: 'Bu asset için aktif SQLi hedefi yok. Soldan ekleyin.',          tone: 'gray' },
  CLEAN:         { label: 'CLEAN',         description: 'Aktif SQLi şüphesi gözlenmedi. Son taramada sinyal yok.',      tone: 'green' },
  SUSPECTED:     { label: 'SUSPECTED',     description: 'Şüpheli sinyaller var. Aşağıdaki sonuçları inceleyin.',        tone: 'red' },
};

const TONE_STYLES = {
  gray:  { bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.20)', text: '#94a3b8' },
  amber: { bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  text: '#fbbf24' },
  red:   { bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',   text: '#f87171' },
  green: { bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)',   text: '#4ade80' },
  blue:  { bg: 'rgba(56,189,248,0.06)',  border: 'rgba(56,189,248,0.20)',  text: '#7dd3fc' },
} as const;

const RISK_PALETTE: Record<string, { bg: string; border: string; text: string }> = {
  CRITICAL: { bg: 'rgba(239,68,68,0.15)',  border: 'rgba(239,68,68,0.35)',  text: '#f87171' },
  HIGH:     { bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.32)', text: '#fb923c' },
  MEDIUM:   { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.25)', text: '#fbbf24' },
  LOW:      { bg: 'rgba(56,189,248,0.10)', border: 'rgba(56,189,248,0.25)', text: '#7dd3fc' },
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusBanner({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  const s = TONE_STYLES[meta.tone];
  const icon = status === 'CLEAN' ? '✅' : status === 'SUSPECTED' ? '🚨' : '⚪';
  return (
    <div className="rounded-xl px-3 py-3 flex items-start gap-2.5" style={{ background: s.bg, border: `1px solid ${s.border}` }}>
      <span className="text-base flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: s.text }}>{meta.label}</p>
        <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">{meta.description}</p>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number | string; accent?: 'red' | 'amber' | 'normal' }) {
  const color = accent === 'red' ? '#f87171' : accent === 'amber' ? '#fbbf24' : '#cbd5e1';
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <p className="text-[9px] uppercase tracking-wider text-slate-600">{label}</p>
      <p className="text-base font-bold tabular-nums" style={{ color }}>{value}</p>
    </div>
  );
}

function TimelineRow({ icon, label, tone = 'gray' }: { icon: string; label: string; tone?: 'gray' | 'red' | 'amber' | 'green' | 'blue' }) {
  const s = TONE_STYLES[tone];
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-[11px]" style={{ background: s.bg, color: s.text }}>{icon}</span>
      <span className="text-slate-400 leading-tight">{label}</span>
    </div>
  );
}

function ResultRow({ data }: { data: Partial<SqliFindingDataJson> }) {
  const risk = data.risk;
  const palette = (risk && RISK_PALETTE[risk]) ? RISK_PALETTE[risk] : RISK_PALETTE.LOW!;
  const ev = data.evidence;

  return (
    <div className="rounded-lg p-2.5 space-y-1.5" style={{ background: 'rgba(0,0,0,0.20)', border: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-slate-300 truncate flex-1">{data.path ?? '—'}</span>
        {risk && (
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0"
            style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.text }}
          >
            {risk}
          </span>
        )}
        {data.confirmed && (
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0"
            style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#4ade80' }}
          >
            ✓
          </span>
        )}
      </div>
      <p className="text-[10px] text-slate-500">
        param: <span className="font-mono text-amber-400">{data.param ?? '—'}</span>
      </p>
      {data.signals && data.signals.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {data.signals.map((s) => (
            <span
              key={s}
              className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#fca5a5' }}
            >
              {s}
            </span>
          ))}
        </div>
      )}
      {ev && (ev.baselineStatus !== null || ev.payloadStatus !== null) && (
        <div className="text-[10px] text-slate-500 font-mono mt-1 leading-tight">
          <div>
            <span className="text-slate-600">status:</span> {ev.baselineStatus ?? '—'} → <span className="text-red-300">{ev.payloadStatus ?? '—'}</span>
          </div>
          <div>
            <span className="text-slate-600">length:</span> {ev.baselineLength ?? '—'} → <span className="text-red-300">{ev.payloadLength ?? '—'}</span>
          </div>
          {ev.matchedErrorPattern && (
            <div className="mt-0.5">
              <span className="text-slate-600">engine:</span> <span className="text-red-300 font-bold uppercase">{ev.matchedErrorPattern}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function SqliLivePanel({ assetId, assetType, assetStatus, isScanRunning = false }: Props) {
  const isDomain = assetType === 'DOMAIN';
  const isVerified = assetStatus === 'VERIFIED';
  const canFetch = isDomain && isVerified;

  // Scan aktifken 3 saniyede bir, normalde 30 saniyede bir yenile.
  // Bu, "SQLi Testini Çalıştır" butonuna basıldıktan sonra sonucu canlı izlemeyi
  // sağlar — finding upsert edilir edilmez panel kendini günceller.
  const refetchMs = isScanRunning ? 3_000 : 30_000;

  const targetsQ = useQuery({
    queryKey: ['sqli-targets', assetId],
    queryFn: () => listSqliTargets(assetId),
    enabled: canFetch,
    staleTime: isScanRunning ? 0 : 30_000,
    refetchInterval: isScanRunning ? refetchMs : false,
  });

  // Bu asset için SQL_INJECTION_SUSPECTED tipindeki aktif finding'leri çek.
  // Backend findings endpoint type-filter kabul etmiyor; tüm finding'leri çekip
  // frontend'de filtreleriz. (İleride backend type filter eklenirse migrasyon kolay.)
  const findingsQ = useQuery({
    queryKey: ['findings-sqli', assetId],
    queryFn: () => getFindings(assetId, { resolved: 'false', limit: 100 }),
    enabled: canFetch,
    staleTime: isScanRunning ? 0 : 15_000,
    refetchInterval: refetchMs,
  });

  const targets = targetsQ.data ?? [];
  const enabledTargets = targets.filter((t) => t.enabled);
  const sqliFindings = (findingsQ.data?.items ?? []).filter((f) => f.type === 'SQL_INJECTION_SUSPECTED');
  const results = sqliFindings.map((f) => (f.dataJson ?? {}) as Partial<SqliFindingDataJson>);

  // Status compute
  let status: Status;
  if (!isDomain) status = 'NOT_DOMAIN';
  else if (!isVerified) status = 'NOT_VERIFIED';
  else if (enabledTargets.length === 0) status = 'NO_TARGETS';
  else if (sqliFindings.length > 0) status = 'SUSPECTED';
  else status = 'CLEAN';

  // Last scan time — en güncel SQLi finding'in lastSeenAt'ı (veya target updatedAt fallback)
  const lastSeenAt = sqliFindings
    .map((f) => f.lastSeenAt)
    .filter(Boolean)
    .sort()
    .pop();

  // Aggregated signals across all suspected results
  const allSignals = new Set<string>();
  results.forEach((r) => (r.signals ?? []).forEach((s) => allSignals.add(s)));
  const hasCritical = results.some((r) => r.risk === 'CRITICAL');

  const isLoading = canFetch && (targetsQ.isLoading || findingsQ.isLoading);

  return (
    <div className="lg:sticky lg:top-4 space-y-4">
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{
          background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
          border: '1px solid rgba(56,189,248,0.10)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #7c3aed)' }}
            >
              <span className="text-sm">📡</span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(56,189,248,0.6)' }}>
                Canlı SQLi Test Paneli
              </p>
              <p className="text-[10px] text-slate-600">
                {isScanRunning ? 'Tarama çalışıyor · 3 saniye refresh' : 'Son SQLI_PROBE snapshot özeti'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {isScanRunning && (
              <span
                className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider"
                style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.30)', color: '#f87171' }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                CANLI
              </span>
            )}
            {(targetsQ.isFetching || findingsQ.isFetching) && <Spinner size="sm" />}
          </div>
        </div>

        {/* Status banner */}
        <StatusBanner status={status} />

        {/* Counts grid */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Hedef" value={enabledTargets.length} />
          <Stat label="Test" value={enabledTargets.length} />
          <Stat
            label="Şüphe"
            value={sqliFindings.length}
            accent={hasCritical ? 'red' : sqliFindings.length > 0 ? 'amber' : 'normal'}
          />
        </div>

        {lastSeenAt && (
          <p className="text-[10px] text-slate-600 font-mono">
            <span className="text-slate-500">Son sinyal:</span>{' '}
            {new Date(lastSeenAt).toLocaleString('tr-TR')}
          </p>
        )}

        {/* Timeline */}
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-slate-500">Akış</p>
          <div className="space-y-1.5">
            {!canFetch ? (
              <TimelineRow icon="⏸" label="SQLi testi şu durumda çalışmaz." tone="gray" />
            ) : isLoading ? (
              <TimelineRow icon="⏳" label="Veriler yükleniyor..." tone="blue" />
            ) : (
              <>
                <TimelineRow
                  icon={enabledTargets.length > 0 ? '✓' : '○'}
                  label={`Aktif hedef: ${enabledTargets.length} adet`}
                  tone={enabledTargets.length > 0 ? 'green' : 'gray'}
                />
                {enabledTargets.length > 0 && (
                  <TimelineRow icon="✓" label="Son tarama tamamlandı" tone="green" />
                )}
                {allSignals.has('SQL_ERROR_PATTERN') && (
                  <TimelineRow icon="⚠" label="SQL hata paterni gözlendi" tone="red" />
                )}
                {allSignals.has('BODY_LENGTH_DELTA') && (
                  <TimelineRow icon="⚠" label="Yanıt boyutu anlamlı değişti" tone="amber" />
                )}
                {allSignals.has('STATUS_CODE_5XX') && (
                  <TimelineRow icon="⚠" label="Sunucu 5xx hata döndürdü" tone="red" />
                )}
                {allSignals.has('BOOLEAN_TRUE_FALSE_DELTA') && (
                  <TimelineRow icon="⚠" label="Boolean TRUE/FALSE farkı" tone="amber" />
                )}
                {hasCritical && (
                  <TimelineRow icon="🔥" label="CRITICAL bulgu üretildi" tone="red" />
                )}
                {status === 'CLEAN' && (
                  <TimelineRow icon="✓" label="SQLi sinyali görülmedi" tone="green" />
                )}
              </>
            )}
          </div>
        </div>

        {/* Per-result satırlar */}
        {results.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2 text-slate-500">
              Sonuçlar ({results.length})
            </p>
            <div className="space-y-2 max-h-96 overflow-auto pr-1">
              {results.map((r, i) => <ResultRow key={i} data={r} />)}
            </div>
          </div>
        )}
      </div>

      {/* Info note */}
      <div
        className="rounded-xl p-3 text-[10px] text-slate-500 leading-relaxed"
        style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.12)' }}
      >
        Bu panel mevcut snapshot ve finding verilerinden derlenir.
        {isScanRunning
          ? ' Tarama aktif olduğu için 3 saniyede bir otomatik yenilenir.'
          : ' Tarama yokken 30 saniyede bir otomatik yenilenir. "SQLi Testini Çalıştır" butonuna bastıktan sonra canlı moda geçer.'}
      </div>
    </div>
  );
}
