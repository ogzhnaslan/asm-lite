import { useCallback, useEffect, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import {
  createPublicVisualAnalysis,
  getPublicVisualAnalysis,
  listPublicVisualAnalysis,
} from '../api/visualAnalysis';
import { PublicVisualAnalysisForm } from '../components/visual/PublicVisualAnalysisForm';
import { ScreenshotPreview } from '../components/visual/ScreenshotPreview';
import { AiVisualSummaryPanel } from '../components/visual/AiVisualSummaryPanel';
import { VisualAnalysisHistory } from '../components/visual/VisualAnalysisHistory';
import { translateSsrfCode, type PublicVisualAnalysisRun } from '../types/visualAnalysis';

const POLL_INTERVAL_MS = 2000;

export function VisualAnalysisPage() {
  const [history, setHistory] = useState<PublicVisualAnalysisRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [currentRun, setCurrentRun] = useState<PublicVisualAnalysisRun | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  // ─── Load history on mount ──────────────────────────────────────────────────
  const refreshHistory = useCallback(async () => {
    try {
      const list = await listPublicVisualAnalysis(20);
      setHistory(list);
    } catch {
      // Sessiz fallback — history yüklenemese de form çalışsın
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  // ─── Polling ────────────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startPolling = useCallback((runId: string) => {
    stopPolling();
    pollTimerRef.current = window.setInterval(async () => {
      try {
        const fresh = await getPublicVisualAnalysis(runId);
        setCurrentRun(fresh);
        if (fresh.status === 'DONE' || fresh.status === 'FAILED') {
          stopPolling();
          // History'i refresh et — yeni durum görünsün
          void refreshHistory();
        }
      } catch (err) {
        const status = (err as AxiosError)?.response?.status;
        if (status === 404 || status === 401) {
          stopPolling();
        }
        // Diğer hatalar: bir sonraki tick tekrar dener
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling, refreshHistory]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopPolling(); };
  }, [stopPolling]);

  // ─── Form submit ────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (url: string) => {
    setSubmitLoading(true);
    setSubmitError(null);
    try {
      const created = await createPublicVisualAnalysis(url);
      setCurrentRun(created);
      void refreshHistory();
      if (created.status === 'RUNNING') {
        startPolling(created.id);
      }
    } catch (err) {
      const ax = err as AxiosError<{ code?: string; detail?: string; message?: string }>;
      const code = ax.response?.data?.code;
      const translated = translateSsrfCode(code);
      if (translated) {
        setSubmitError(translated);
      } else if (ax.response?.status === 400) {
        setSubmitError(ax.response.data?.detail ?? ax.response.data?.message ?? 'URL geçersiz.');
      } else if (ax.response?.status === 401) {
        setSubmitError('Oturumunuz sona ermiş olabilir. Tekrar giriş yapın.');
      } else {
        setSubmitError('Analiz başlatılamadı. Lütfen tekrar deneyin.');
      }
    } finally {
      setSubmitLoading(false);
    }
  }, [refreshHistory, startPolling]);

  // ─── History click — switch current run ─────────────────────────────────────
  const handleSelectFromHistory = useCallback(async (runId: string) => {
    if (runId === currentRun?.id) return;
    stopPolling();
    setSubmitError(null);
    try {
      const fresh = await getPublicVisualAnalysis(runId);
      setCurrentRun(fresh);
      if (fresh.status === 'RUNNING') {
        startPolling(runId);
      }
    } catch {
      // Geçmiş kaydı yüklenemediyse current run'u değiştirme
    }
  }, [currentRun?.id, stopPolling, startPolling]);

  // ─── Status hint for top strip ──────────────────────────────────────────────
  const statusHint = (() => {
    if (!currentRun) return null;
    if (currentRun.status === 'FAILED') return 'Analiz başarısız oldu.';
    if (currentRun.status === 'DONE') return 'Analiz tamamlandı.';
    if (currentRun.aiVisualAnalysis) return 'AI yanıtı işleniyor…';
    if (currentRun.screenshotUrl) return 'AI analiz hazırlanıyor…';
    return 'Screenshot alınıyor…';
  })();

  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest font-semibold mb-1"
          style={{ color: 'rgba(56,189,248,0.45)' }}>
          Public Web Intelligence
        </div>
        <h1 className="text-2xl font-bold text-slate-100">AI Görsel Analiz</h1>
        <p className="text-[13px] text-slate-400 mt-1 max-w-2xl">
          Public bir web sitesinin ekran görüntüsünü alır ve AI ile sitenin ne işe yaradığını Türkçe açıklar.
          Tarama veya finding üretmez; sadece görsel açıklama.
        </p>
      </div>

      {/* Form */}
      <PublicVisualAnalysisForm
        onSubmit={handleSubmit}
        loading={submitLoading}
        errorMessage={submitError}
      />

      {/* Status strip */}
      {statusHint && (
        <div className="mt-4 px-4 py-2.5 rounded-xl flex items-center gap-2 text-[12px]"
          style={{
            background: currentRun?.status === 'FAILED'
              ? 'rgba(244,63,94,0.05)'
              : currentRun?.status === 'DONE'
                ? 'rgba(52,211,153,0.05)'
                : 'rgba(56,189,248,0.05)',
            border: currentRun?.status === 'FAILED'
              ? '1px solid rgba(244,63,94,0.15)'
              : currentRun?.status === 'DONE'
                ? '1px solid rgba(52,211,153,0.15)'
                : '1px solid rgba(56,189,248,0.15)',
            color: currentRun?.status === 'FAILED'
              ? '#fda4af'
              : currentRun?.status === 'DONE'
                ? '#6ee7b7'
                : '#67e8f9',
          }}>
          {currentRun?.status === 'RUNNING' && (
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'currentColor' }} />
          )}
          {statusHint}
        </div>
      )}

      {/* Two-column layout */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        <ScreenshotPreview run={currentRun} />
        <AiVisualSummaryPanel run={currentRun} />
      </div>

      {/* History */}
      <div className="mt-6">
        <VisualAnalysisHistory
          runs={history}
          currentRunId={currentRun?.id ?? null}
          onSelect={handleSelectFromHistory}
          loading={historyLoading}
        />
      </div>
    </div>
  );
}
