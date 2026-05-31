import { useState } from 'react';
import type { PublicVisualAnalysisRun } from '../../types/visualAnalysis';

interface Props {
  run: PublicVisualAnalysisRun | null;
}

export function AiVisualSummaryPanel({ run }: Props) {
  const ai = run?.aiVisualAnalysis ?? null;

  return (
    <Panel>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: 'rgba(56,189,248,0.07)' }}>
        <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'rgba(56,189,248,0.45)' }}>
          AI Görsel Analiz
        </div>
        <h2 className="text-lg font-semibold text-slate-100">Bu site ne işe yarıyor?</h2>
      </div>

      {/* Body */}
      <div className="p-5 space-y-5">
        {renderBody(run, ai)}
      </div>
    </Panel>
  );
}

function renderBody(run: PublicVisualAnalysisRun | null, ai: PublicVisualAnalysisRun['aiVisualAnalysis']) {
  // 1. Hiç run yok
  if (!run) {
    return (
      <EmptyMessage
        title="Bir URL analiz edin"
        subtitle="Public bir web sitesinin amacını AI ile özetletmek için yukarıdaki formu kullanın."
      />
    );
  }

  // 2. RUNNING — AI henüz yok
  if (run.status === 'RUNNING' && !ai) {
    return <RunningState screenshotReady={!!run.screenshotUrl} />;
  }

  // 3. FAILED — analiz tamamen başarısız
  if (run.status === 'FAILED') {
    return (
      <ErrorBox
        title="Analiz başarısız oldu"
        detail={run.error ?? 'Bilinmeyen hata'}
      />
    );
  }

  // 4. DONE + AI yok (env kapalı veya AI hatası, başka alan da gelmemiş)
  if (run.status === 'DONE' && !ai) {
    return (
      <NeutralBox
        title="AI açıklaması alınamadı"
        subtitle="Backend AI vision çıktısı üretmedi. Rule-based özet aşağıdaki teknik gözlemlerde görülebilir."
      />
    );
  }

  // 5. AI error
  if (ai?.error) {
    return (
      <ErrorBox
        title="AI açıklaması alınırken hata oluştu"
        detail={ai.error}
        devDetail={ai.rawText}
      />
    );
  }

  // 6. Happy path — AI dolu
  return <AiContent ai={ai!} run={run} />;
}

// ─── Happy path content ──────────────────────────────────────────────────────

function AiContent({ ai, run }: { ai: NonNullable<PublicVisualAnalysisRun['aiVisualAnalysis']>; run: PublicVisualAnalysisRun }) {
  const confidencePct = typeof ai.confidence === 'number' ? Math.round(ai.confidence * 100) : null;

  return (
    <>
      {/* Big user-facing description */}
      {ai.userFacingDescription && (
        <div className="p-4 rounded-xl"
          style={{
            background: 'linear-gradient(145deg, rgba(56,189,248,0.07), rgba(52,211,153,0.04))',
            border: '1px solid rgba(56,189,248,0.18)',
          }}>
          <p className="text-[15px] leading-relaxed text-slate-100">
            {ai.userFacingDescription}
          </p>
        </div>
      )}

      {/* Site purpose */}
      {ai.sitePurpose && (
        <Field label="Site amacı" value={ai.sitePurpose} />
      )}

      {/* Visual summary */}
      {ai.visualSummary && (
        <Field label="Görsel özet" value={ai.visualSummary} />
      )}

      {/* Badges row */}
      <div className="flex flex-wrap gap-2">
        {ai.siteCategory && (
          <Badge label="Kategori" value={prettyCategory(ai.siteCategory)} accent="cyan" />
        )}
        {ai.pageTone && (
          <Badge label="Sayfa tonu" value={ai.pageTone} accent="violet" />
        )}
        {confidencePct !== null && (
          <Badge label="Güven" value={`%${confidencePct}`} accent="emerald" />
        )}
      </div>

      {/* Visible elements */}
      {ai.visibleElements && ai.visibleElements.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-widest font-semibold mb-2"
            style={{ color: 'rgba(56,189,248,0.45)' }}>
            Görünen öğeler
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ai.visibleElements.map((el, i) => (
              <span
                key={i}
                className="text-[12px] px-2.5 py-1 rounded-md"
                style={{
                  background: 'rgba(56,189,248,0.05)',
                  border: '1px solid rgba(56,189,248,0.13)',
                  color: '#cbd5e1',
                }}
              >
                {el}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Target audience */}
      {ai.targetAudience && (
        <Field label="Hedef kitle" value={ai.targetAudience} />
      )}

      {/* Ek teknik gözlemler — collapsible */}
      {hasTechnicalObservations(ai) && (
        <CollapsibleSection title="Ek teknik gözlemler" defaultOpen={false}>
          <div className="space-y-3">
            {ai.riskLevel && (
              <Field label="Risk seviyesi" value={ai.riskLevel} />
            )}
            {ai.securityCommentary && (
              <Field label="Güvenlik notu" value={ai.securityCommentary} />
            )}
            {ai.securitySignals && ai.securitySignals.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest font-semibold mb-2 text-slate-500">
                  Güvenlik sinyalleri
                </div>
                <ul className="space-y-1.5">
                  {ai.securitySignals.map((s, i) => (
                    <li key={i} className="text-[12px] text-slate-400">
                      <span className="text-amber-300 font-medium">{s.type}</span>
                      {typeof s.confidence === 'number' && <span className="ml-2 text-slate-500">{Math.round(s.confidence * 100)}%</span>}
                      {s.reason && <div className="text-slate-500 mt-0.5">{s.reason}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ai.recommendations && ai.recommendations.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest font-semibold mb-2 text-slate-500">
                  Öneriler
                </div>
                <ul className="space-y-1 list-disc list-inside text-[12px] text-slate-400">
                  {ai.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            {ai.manualVerificationNeeded && (
              <div className="text-[11px] text-amber-300 italic">
                Manuel doğrulama önerilir.
              </div>
            )}
          </div>
        </CollapsibleSection>
      )}

      {/* Developer details — rule-based + rawText */}
      <CollapsibleSection title="Geliştirici detayları" defaultOpen={false}>
        <div className="space-y-3 text-[12px]">
          <DevRow label="Provider" value={ai.provider ?? '—'} />
          <DevRow label="Model" value={ai.model ?? '—'} />
          <DevRow label="checkedAt" value={ai.checkedAt ?? '—'} />
          <DevRow label="Rule kategori" value={run.ruleSiteCategory ?? '—'} />
          <DevRow label="Rule risk" value={run.ruleRiskLevel ?? '—'} />
          <DevRow
            label="Rule sinyaller"
            value={run.ruleSignals && run.ruleSignals.length > 0 ? run.ruleSignals.join(', ') : '—'}
          />
          {ai.rawText && (
            <div>
              <div className="text-[10px] uppercase tracking-widest font-semibold mb-2 text-slate-500">
                AI raw output
              </div>
              <pre className="text-[11px] text-slate-400 whitespace-pre-wrap break-words p-3 rounded-lg overflow-x-auto"
                style={{ background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(56,189,248,0.08)', maxHeight: '300px' }}>
                {ai.rawText}
              </pre>
            </div>
          )}
        </div>
      </CollapsibleSection>
    </>
  );
}

function hasTechnicalObservations(ai: NonNullable<PublicVisualAnalysisRun['aiVisualAnalysis']>): boolean {
  return Boolean(
    ai.riskLevel ||
    ai.securityCommentary ||
    (ai.securitySignals && ai.securitySignals.length > 0) ||
    (ai.recommendations && ai.recommendations.length > 0) ||
    ai.manualVerificationNeeded
  );
}

function prettyCategory(c: string): string {
  return c.replace(/_/g, ' ');
}

// ─── Generic UI ──────────────────────────────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden h-full flex flex-col"
      style={{
        background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
        border: '1px solid rgba(56,189,248,0.1)',
      }}>
      <div className="h-px w-full" style={{
        background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.4), rgba(52,211,153,0.2), transparent)',
      }} />
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5"
        style={{ color: 'rgba(56,189,248,0.45)' }}>
        {label}
      </div>
      <p className="text-[13px] leading-relaxed text-slate-200">{value}</p>
    </div>
  );
}

function Badge({ label, value, accent }: { label: string; value: string; accent: 'cyan' | 'violet' | 'emerald' }) {
  const colors = {
    cyan: { bg: 'rgba(56,189,248,0.07)', border: 'rgba(56,189,248,0.2)', text: '#67e8f9' },
    violet: { bg: 'rgba(139,92,246,0.07)', border: 'rgba(139,92,246,0.22)', text: '#c4b5fd' },
    emerald: { bg: 'rgba(52,211,153,0.07)', border: 'rgba(52,211,153,0.22)', text: '#6ee7b7' },
  }[accent];
  return (
    <div className="px-3 py-1.5 rounded-lg"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
      <div className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: 'rgba(148,163,184,0.7)' }}>
        {label}
      </div>
      <div className="text-[12px] font-medium mt-0.5" style={{ color: colors.text }}>
        {value}
      </div>
    </div>
  );
}

function DevRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-slate-600 min-w-[110px]">{label}</span>
      <span className="text-slate-300 font-mono break-all">{value}</span>
    </div>
  );
}

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl overflow-hidden"
      style={{ background: 'rgba(2,6,23,0.4)', border: '1px solid rgba(56,189,248,0.07)' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
      >
        <span className="text-[11px] uppercase tracking-widest font-semibold text-slate-400">{title}</span>
        <svg className={`w-3.5 h-3.5 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 pt-2">{children}</div>}
    </div>
  );
}

function RunningState({ screenshotReady }: { screenshotReady: boolean }) {
  return (
    <div className="p-8 flex flex-col items-center justify-center text-center">
      <div className="w-10 h-10 rounded-full border-2 animate-spin mb-4"
        style={{ borderColor: 'rgba(56,189,248,0.15)', borderTopColor: '#38bdf8' }} />
      <div className="text-sm text-slate-200 font-medium">AI analiz hazırlanıyor…</div>
      <div className="text-[12px] text-slate-500 mt-1">
        {screenshotReady
          ? 'Screenshot hazır, AI vision modeli görseli inceliyor.'
          : 'Önce screenshot alınıyor, ardından AI analizi başlayacak.'}
      </div>
    </div>
  );
}

function EmptyMessage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="p-10 flex flex-col items-center justify-center text-center">
      <div className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center"
        style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.1)' }}>
        <svg className="w-7 h-7" style={{ color: 'rgba(56,189,248,0.5)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      </div>
      <div className="text-sm font-medium text-slate-300">{title}</div>
      <div className="text-[12px] text-slate-500 mt-1 max-w-xs">{subtitle}</div>
    </div>
  );
}

function NeutralBox({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="p-5 rounded-xl"
      style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.1)' }}>
      <div className="text-sm font-medium text-slate-200">{title}</div>
      <div className="text-[12px] text-slate-500 mt-1">{subtitle}</div>
    </div>
  );
}

function ErrorBox({ title, detail, devDetail }: { title: string; detail?: string; devDetail?: string }) {
  // Devasa Playwright stack'lerini ekrana yığma — sade ilk satır + collapsible.
  const friendly = friendlyErrorMessage(detail);
  const showFullDetail = detail && detail.length > friendly.length;

  return (
    <div className="p-5 rounded-xl"
      style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.2)' }}>
      <div className="flex items-start gap-3">
        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#fb7185' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-rose-300">{title}</div>
          {friendly && <div className="text-[12px] text-slate-400 mt-1 break-words">{friendly}</div>}
          {showFullDetail && (
            <details className="mt-2">
              <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-300">Teknik detay</summary>
              <pre className="text-[11px] text-slate-400 whitespace-pre-wrap break-words mt-2 p-2 rounded"
                style={{ background: 'rgba(2,6,23,0.6)', maxHeight: '200px', overflow: 'auto' }}>
                {detail!.slice(0, 4000)}
              </pre>
            </details>
          )}
          {devDetail && (
            <details className="mt-2">
              <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-300">Geliştirici detayı</summary>
              <pre className="text-[11px] text-slate-400 whitespace-pre-wrap break-words mt-2 p-2 rounded"
                style={{ background: 'rgba(2,6,23,0.6)', maxHeight: '200px', overflow: 'auto' }}>
                {devDetail.slice(0, 4000)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

function friendlyErrorMessage(detail?: string): string {
  if (!detail) return '';
  if (detail.includes('CHROMIUM_LAUNCH_FAILED')) {
    return 'Browser process başlatılamadı. Lütfen birkaç saniye sonra tekrar deneyin.';
  }
  if (detail.includes('PAGE_LOAD_FAILED')) {
    return 'Hedef sayfa yüklenemedi. Site geçici olarak erişilemez olabilir.';
  }
  const firstLine = detail.split('\n')[0];
  const trimmed = firstLine.length > 220 ? firstLine.slice(0, 220) + '…' : firstLine;
  return trimmed.replace(/^UNEXPECTED:\s*/, '');
}
