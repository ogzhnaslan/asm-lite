import type { OtxIntelligence, OtxPulse } from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return '—';
  }
}

// ─── State config ─────────────────────────────────────────────────────────────

type OtxState = 'ok' | 'warning' | 'skipped' | 'error' | 'empty';

const BORDER: Record<OtxState, string> = {
  ok:      'rgba(52,211,153,0.25)',
  warning: 'rgba(251,191,36,0.3)',
  skipped: 'rgba(251,191,36,0.15)',
  error:   'rgba(248,113,113,0.25)',
  empty:   'rgba(56,189,248,0.08)',
};

const STATUS_DOT: Record<OtxState, string> = {
  ok:      '#34d399',
  warning: '#fbbf24',
  skipped: 'rgba(251,191,36,0.6)',
  error:   '#ef4444',
  empty:   'rgba(56,189,248,0.25)',
};

const STATUS_LABEL: Record<OtxState, string> = {
  ok:      'No OTX Association',
  warning: 'OTX Association',
  skipped: 'Skipped',
  error:   'Error',
  empty:   'No Data',
};

const STATUS_LABEL_COLOR: Record<OtxState, string> = {
  ok:      '#34d399',
  warning: '#fbbf24',
  skipped: 'rgba(251,191,36,0.7)',
  error:   '#f87171',
  empty:   'rgba(56,189,248,0.4)',
};

// ─── Hata açıklamaları ────────────────────────────────────────────────────────

const SKIP_REASON_TEXT: Record<string, string> = {
  DISABLED:              'ENABLE_OTX=false olduğu için kontrol kapalı.',
  NO_CREDENTIALS:        'OTX_API_KEY tanımlı değil.',
  IPV6_NOT_SUPPORTED:    'IPv6 asset için OTX kontrolü şu an desteklenmiyor.',
};

const ERROR_TEXT: Record<string, string> = {
  INVALID_API_KEY:    'API key geçersiz veya hatalı.',
  RATE_LIMITED:       'OTX API limitine takıldınız.',
  OTX_TIMEOUT:        'OTX isteği zaman aşımına uğradı.',
  OTX_REQUEST_FAILED: 'OTX isteği başarısız oldu.',
  CHECK_CRASHED:      'Kontrol beklenmedik şekilde çöktü.',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function OtxShieldIcon({ state }: { state: OtxState }) {
  const color =
    state === 'ok'      ? '#34d399' :
    state === 'warning' ? '#fbbf24' :
    state === 'error'   ? '#f87171' :
                          'rgba(56,189,248,0.5)';

  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      {state === 'ok' && <path d="M9 12l2 2 4-4" />}
      {state === 'warning' && (
        <>
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </>
      )}
    </svg>
  );
}

interface MetricBoxProps {
  label: string;
  value: number;
  description: string;
  highlight?: 'warning' | 'neutral';
}

function MetricBox({ label, value, description, highlight = 'neutral' }: MetricBoxProps) {
  const valueColor = highlight === 'warning' && value > 0 ? '#fbbf24' : '#e2e8f0';
  return (
    <div
      className="flex flex-col gap-1 rounded-xl px-3 py-2.5"
      style={{
        background: 'rgba(2,6,23,0.5)',
        border: '1px solid rgba(56,189,248,0.08)',
      }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(56,189,248,0.5)' }}>{label}</span>
      <span className="text-xl font-bold tabular-nums" style={{ color: valueColor }}>{value}</span>
      <span className="text-[10px] leading-tight" style={{ color: 'rgba(148,163,184,0.45)' }}>{description}</span>
    </div>
  );
}

interface PulseItemProps {
  pulse: OtxPulse;
  index: number;
}

function PulseItem({ pulse, index }: PulseItemProps) {
  const tag = pulse.tags?.[0];
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg px-3 py-2"
      style={{ background: 'rgba(251,191,36,0.04)', border: '1px solid rgba(251,191,36,0.1)' }}
    >
      <span
        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
        style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.25)', color: '#fbbf24' }}
      >
        {index + 1}
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-medium truncate" title={pulse.name} style={{ color: '#e2e8f0' }}>
          {pulse.name || '(isimsiz pulse)'}
        </span>
        {tag && (
          <span className="text-[10px]" style={{ color: 'rgba(251,191,36,0.6)' }}>{tag}</span>
        )}
      </div>
    </div>
  );
}

// ─── Ana bileşen ──────────────────────────────────────────────────────────────

export function OtxIntelligenceCard({ otx }: { otx: OtxIntelligence | null }) {
  if (!otx) {
    return (
      <OtxCardShell state="empty">
        <div className="flex flex-col gap-2">
          <StatusHeading state="empty" title="Henüz OTX verisi yok" />
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.6)' }}>
            Bu asset için henüz OTX taraması yapılmadı. İlk tarama tamamlandığında tehdit istihbaratı burada görüntülenecek.
          </p>
        </div>
        <InterpretationBlock state="empty" />
      </OtxCardShell>
    );
  }

  if (otx.skipped) {
    const reason = otx.skipReason ?? '';
    const reasonText = SKIP_REASON_TEXT[reason] ?? `Kontrol atlandı: ${reason}`;
    return (
      <OtxCardShell state="skipped">
        <div className="flex flex-col gap-2">
          <StatusHeading state="skipped" title="OTX kontrolü çalıştırılmadı" />
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(251,191,36,0.7)' }}>{reasonText}</p>
        </div>
        <InterpretationBlock state="skipped" />
      </OtxCardShell>
    );
  }

  if (otx.error) {
    const errText = ERROR_TEXT[otx.error] ?? `Hata: ${otx.error}`;
    return (
      <OtxCardShell state="error">
        <div className="flex flex-col gap-2">
          <StatusHeading state="error" title="OTX sorgusu tamamlanamadı" />
          <p className="text-xs leading-relaxed" style={{ color: 'rgba(248,113,113,0.8)' }}>{errText}</p>
        </div>
        <InterpretationBlock state="error" />
      </OtxCardShell>
    );
  }

  const tags = otx.tags ?? [];
  const pulses = otx.pulses ?? [];
  const hasAssociation = otx.pulseCount > 0 || otx.malwareCount > 0;
  const state: OtxState = hasAssociation ? 'warning' : 'ok';

  return (
    <OtxCardShell state={state}>
      {/* Durum özeti */}
      <div className="flex flex-col gap-2">
        <StatusHeading
          state={state}
          title={hasAssociation ? 'OTX ilişki sinyali bulundu' : 'OTX verisine göre bilinen ilişki yok'}
        />
        <p className="text-xs leading-relaxed" style={{ color: 'rgba(148,163,184,0.65)' }}>
          {hasAssociation
            ? 'Bu asset OTX verilerinde bazı tehdit pulse\'ları veya malware analizleriyle ilişkilendirilmiş görünüyor. Bu, domainin kesin olarak zararlı olduğu anlamına gelmez; DNS, web içerikleri, yönlendirme kayıtları ve son değişiklikler gözden geçirilmelidir.'
            : 'Bu asset için OTX üzerinde bilinen pulse veya malware ilişkisi bulunmadı. Bu, OTX verisine göre olumlu bir sinyaldir; tüm güvenlik risklerinin ortadan kalktığı anlamına gelmez.'}
        </p>
      </div>

      {/* Metric kutuları */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <MetricBox label="Pulses" value={otx.pulseCount} description="OTX topluluğunda paylaşılan tehdit paketi sayısı." highlight="warning" />
        <MetricBox label="Malware Refs." value={otx.malwareCount} description="Bu asset ile OTX'te ilişkilendirilen malware gözlemi." highlight="warning" />
        <MetricBox label="Related URLs" value={otx.urlListCount} description="OTX üzerinde asset ile ilişkili URL kayıtları." />
        <MetricBox label="Passive DNS" value={otx.passiveDnsCount} description="Geçmişte bu domain/IP ile ilişkilendirilmiş DNS gözlemleri." />
      </div>

      {/* Passive DNS açıklama notu */}
      {otx.passiveDnsCount > 0 && (
        <div
          className="rounded-xl px-3.5 py-3 flex flex-col gap-1"
          style={{ background: 'rgba(56,189,248,0.03)', border: '1px solid rgba(56,189,248,0.07)' }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(56,189,248,0.45)' }}>
            Passive DNS hakkında
          </span>
          <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.55)' }}>
            Passive DNS, geçmişte bu domain/IP ile ilişkilendirilmiş DNS gözlemlerini ifade eder. Bu sonuç tek başına zararlılık kanıtı değildir.
            Şu an yalnızca kayıt sayısı gösteriliyor; detaylı IP/ASN kayıtları sonraki sürümde harita üzerinde görüntülenecek.
          </p>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(56,189,248,0.45)' }}>Etiketler</span>
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 5).map((tag, i) => (
              <span
                key={i}
                className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: 'rgba(251,191,36,0.75)' }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Pulses */}
      {pulses.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(56,189,248,0.45)' }}>
            Son pulse'lar ({Math.min(pulses.length, 3)} / {otx.pulseCount})
          </span>
          <div className="flex flex-col gap-1.5">
            {pulses.slice(0, 3).map((pulse, i) => (
              <PulseItem key={i} pulse={pulse} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Yorum bloğu */}
      <InterpretationBlock state={state} />

      {/* Footer */}
      <div className="flex items-center justify-between pt-1" style={{ borderTop: '1px solid rgba(56,189,248,0.06)' }}>
        <span className="text-[10px]" style={{ color: 'rgba(56,189,248,0.3)' }}>AlienVault OTX · alienvault.com</span>
        <span className="text-[10px]" style={{ color: 'rgba(56,189,248,0.3)' }}>{fmtDate(otx.checkedAt)}</span>
      </div>
    </OtxCardShell>
  );
}

// ─── Kart iskeleti ────────────────────────────────────────────────────────────

function OtxCardShell({ state, children }: { state: OtxState; children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl flex flex-col gap-4 p-5"
      style={{
        background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
        border: `1px solid ${BORDER[state]}`,
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}
    >
      {/* Kart başlığı */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.12)' }}
            >
              <OtxShieldIcon state={state} />
            </div>
            <span className="text-sm font-bold" style={{ color: '#e2e8f0' }}>AlienVault OTX</span>
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
              style={{ color: 'rgba(56,189,248,0.6)', background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.12)' }}
            >
              Threat Intelligence
            </span>
          </div>
          <p className="text-[10px] leading-relaxed pl-[42px]" style={{ color: 'rgba(148,163,184,0.5)' }}>
            OTX, bu asset'in güvenlik topluluğu tarafından bilinen tehdit kampanyaları veya malware analizleriyle ilişkilendirilip ilişkilendirilmediğini kontrol eder. Sonuç bir ilişki sinyalidir; kesin hüküm değildir.
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: STATUS_DOT[state] }} />
          <span className="text-[11px] font-semibold" style={{ color: STATUS_LABEL_COLOR[state] }}>
            {STATUS_LABEL[state]}
          </span>
        </div>
      </div>

      {children}
    </div>
  );
}

// ─── Durum başlığı ────────────────────────────────────────────────────────────

function StatusHeading({ state, title }: { state: OtxState; title: string }) {
  const boxStyle =
    state === 'ok'
      ? { background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }
      : state === 'warning'
      ? { background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24' }
      : state === 'error'
      ? { background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }
      : state === 'skipped'
      ? { background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', color: 'rgba(251,191,36,0.75)' }
      : { background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.1)', color: 'rgba(56,189,248,0.5)' };

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl w-fit" style={boxStyle}>
      <StatusIcon state={state} />
      <span className="text-xs font-semibold">{title}</span>
    </div>
  );
}

function StatusIcon({ state }: { state: OtxState }) {
  if (state === 'ok') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (state === 'warning') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    );
  }
  if (state === 'error') {
    return (
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 8v4M12 16h.01" />
    </svg>
  );
}

// ─── Yorum bloğu ──────────────────────────────────────────────────────────────

function InterpretationBlock({ state }: { state: OtxState }) {
  const text =
    state === 'ok'
      ? "OTX'te ilişki bulunmaması olumlu bir sinyaldir. Ancak DNS, TLS, security headers ve diğer bulgular ayrıca değerlendirilmelidir."
      : state === 'warning'
      ? "OTX sonucu bir kesin hüküm değil, dış tehdit istihbaratı sinyalidir. Pulse veya malware ilişkisi bulunması domainin ele geçirildiğini ya da doğrudan zararlı olduğunu tek başına kanıtlamaz. Büyük/popüler domainlerde marka taklidi, analiz içi referans veya kampanya bağlamı nedeniyle ilişki görülebilir; DNS, web içerikleri ve hosting kayıtları ayrıca incelenmelidir."
      : state === 'skipped'
      ? "Bu kart gerçek OTX verisi göstermiyor; kontrol çalıştırılmadığı için sadece durum bilgisi gösteriliyor."
      : state === 'error'
      ? "Bu kart şu anda OTX verisini okuyamadı. API key, rate limit veya bağlantı durumu kontrol edilmelidir."
      : "OTX taraması henüz yapılmadı. İlk taramadan sonra burada tehdit istihbaratı görüntülenecek.";

  return (
    <div
      className="rounded-xl px-3.5 py-3 flex flex-col gap-1"
      style={{ background: 'rgba(56,189,248,0.03)', border: '1px solid rgba(56,189,248,0.07)' }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgba(56,189,248,0.45)' }}>
        Bu sonuç nasıl yorumlanmalı?
      </span>
      <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.55)' }}>{text}</p>
    </div>
  );
}
