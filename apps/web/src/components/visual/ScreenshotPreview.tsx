import { useEffect, useRef, useState } from 'react';
import { getPublicVisualScreenshotBlob } from '../../api/visualAnalysis';
import type { PublicVisualAnalysisRun } from '../../types/visualAnalysis';

interface Props {
  run: PublicVisualAnalysisRun | null;
  // Screenshot bir kez geldikten sonra run güncellense bile aynı blob URL
  // gösterilir; URL alanı değişirse re-fetch yapılır.
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function ScreenshotPreview({ run }: Props) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const lastFetchedRef = useRef<{ runId: string; screenshotUrl: string | null } | null>(null);

  useEffect(() => {
    if (!run) {
      setObjectUrl(null);
      setError(null);
      return;
    }
    // Aynı run + aynı screenshotUrl ise tekrar fetch etme
    const lf = lastFetchedRef.current;
    if (lf && lf.runId === run.id && lf.screenshotUrl === (run.screenshotUrl ?? null)) {
      return;
    }
    if (!run.screenshotUrl) {
      // Screenshot henüz yazılmamış — boş kal
      return;
    }
    lastFetchedRef.current = { runId: run.id, screenshotUrl: run.screenshotUrl };

    let cancelled = false;
    let createdUrl: string | null = null;

    setLoading(true);
    setError(null);
    getPublicVisualScreenshotBlob(run.id)
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return createdUrl;
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.response?.status === 404 ? 'Screenshot henüz hazır değil.' : 'Screenshot yüklenemedi.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
    };
  }, [run?.id, run?.screenshotUrl]);

  // Component unmount → object URL revoke
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  // ESC → fullscreen kapat
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  // ─── State render ───────────────────────────────────────────────────────────

  if (!run) {
    return (
      <Panel>
        <EmptyMessage
          title="Henüz screenshot yok"
          subtitle="Bir URL girip “Analiz Et” butonuna basın."
        />
      </Panel>
    );
  }

  if (run.status === 'FAILED' && !objectUrl) {
    return (
      <Panel>
        <ErrorCard
          title="Analiz başarısız oldu"
          detail={run.error ?? 'Bilinmeyen hata'}
        />
      </Panel>
    );
  }

  if (!run.screenshotUrl && !objectUrl) {
    return (
      <Panel>
        <LoadingState message={run.status === 'FAILED' ? 'Analiz başarısız' : 'Screenshot alınıyor…'} />
      </Panel>
    );
  }

  return (
    <Panel>
      {/* Header meta strip */}
      <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 border-b" style={{ borderColor: 'rgba(56,189,248,0.07)' }}>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest font-semibold mb-1" style={{ color: 'rgba(56,189,248,0.45)' }}>
            Screenshot
          </div>
          <div className="text-sm font-medium text-slate-100 truncate" title={run.url}>{run.url}</div>
          {run.finalUrl && run.finalUrl !== run.url && (
            <div className="text-[11px] text-slate-500 truncate mt-0.5" title={run.finalUrl}>→ {run.finalUrl}</div>
          )}
          <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
            {run.statusCode != null && (
              <span className="px-2 py-0.5 rounded-md" style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)', color: '#67e8f9' }}>
                HTTP {run.statusCode}
              </span>
            )}
            <span>{fmtDateTime(run.finishedAt ?? run.updatedAt ?? run.createdAt)}</span>
          </div>
        </div>
        {objectUrl && (
          <button
            onClick={() => setFullscreen(true)}
            className="text-[11px] px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
            style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: '#67e8f9' }}
          >
            Tam ekran
          </button>
        )}
      </div>

      {/* Image area */}
      <div className="p-4">
        {loading && !objectUrl && <LoadingState message="Screenshot yükleniyor…" />}
        {error && !objectUrl && <ErrorCard title={error} />}
        {objectUrl && (
          <button
            onClick={() => setFullscreen(true)}
            className="block w-full rounded-xl overflow-hidden transition-opacity hover:opacity-95"
            style={{ background: '#000', border: '1px solid rgba(56,189,248,0.12)' }}
            title="Tam ekran aç"
          >
            <img
              src={objectUrl}
              alt={`Screenshot of ${run.url}`}
              className="w-full h-auto block"
            />
          </button>
        )}
      </div>

      {fullscreen && objectUrl && (
        <FullscreenModal url={objectUrl} alt={`Screenshot of ${run.url}`} onClose={() => setFullscreen(false)} />
      )}
    </Panel>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

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

function EmptyMessage({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="p-12 flex flex-col items-center justify-center text-center">
      <div className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center"
        style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.1)' }}>
        <svg className="w-7 h-7" style={{ color: 'rgba(56,189,248,0.5)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <div className="text-sm font-medium text-slate-300">{title}</div>
      {subtitle && <div className="text-[12px] text-slate-500 mt-1">{subtitle}</div>}
    </div>
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <div className="p-10 flex flex-col items-center justify-center text-center">
      <div className="w-10 h-10 rounded-full border-2 animate-spin mb-4"
        style={{ borderColor: 'rgba(56,189,248,0.15)', borderTopColor: '#38bdf8' }} />
      <div className="text-sm text-slate-300">{message}</div>
    </div>
  );
}

function ErrorCard({ title, detail }: { title: string; detail?: string }) {
  // Backend bazen devasa Playwright stack (4000+ char CLI args dahil) gönderir.
  // Kullanıcıya yalnızca ilk anlamlı satırı göster + collapsible detay.
  const friendlyDetail = friendlyErrorMessage(detail);
  const showFullDetail = detail && detail.length > friendlyDetail.length;

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
          {friendlyDetail && (
            <div className="text-[12px] text-slate-400 mt-1 break-words">{friendlyDetail}</div>
          )}
          {showFullDetail && (
            <details className="mt-2">
              <summary className="text-[11px] text-slate-500 cursor-pointer hover:text-slate-300">Teknik detay</summary>
              <pre className="text-[11px] text-slate-400 whitespace-pre-wrap break-words mt-2 p-2 rounded"
                style={{ background: 'rgba(2,6,23,0.6)', maxHeight: '200px', overflow: 'auto' }}>
                {detail!.slice(0, 4000)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

// Backend error string'inden kullanıcıya gösterilecek sade ilk satırı çıkar.
// Playwright "browserType.launch: Target page, context or browser has been closed"
// gibi tek satırlık mesajları kabul ediyor; sonrasındaki "Browser logs:..." kuyruğu
// kullanıcı için gürültü.
function friendlyErrorMessage(detail?: string): string {
  if (!detail) return '';
  // Bilinen kategoriler için Türkçe sade mesaj
  if (detail.includes('CHROMIUM_LAUNCH_FAILED')) {
    return 'Browser process başlatılamadı. Lütfen birkaç saniye sonra tekrar deneyin.';
  }
  if (detail.includes('PAGE_LOAD_FAILED')) {
    return 'Hedef sayfa yüklenemedi. Site geçici olarak erişilemez olabilir.';
  }
  // Aksi takdirde ilk satırı + ilk 200 karakter
  const firstLine = detail.split('\n')[0];
  const trimmed = firstLine.length > 220 ? firstLine.slice(0, 220) + '…' : firstLine;
  // "UNEXPECTED: " prefix'ini kullanıcıya gösterme — uzun stack başlatıcısı
  return trimmed.replace(/^UNEXPECTED:\s*/, '');
}

function FullscreenModal({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(2,6,23,0.92)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <button
        className="absolute top-5 right-5 px-3 py-1.5 rounded-lg text-[12px]"
        style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', color: '#67e8f9' }}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        Kapat (Esc)
      </button>
      <img
        src={url}
        alt={alt}
        className="max-w-full max-h-full rounded-xl"
        style={{ boxShadow: '0 0 40px rgba(56,189,248,0.2)' }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
