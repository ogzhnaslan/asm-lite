import type { PublicVisualAnalysisRun } from '../../types/visualAnalysis';

interface Props {
  runs: PublicVisualAnalysisRun[];
  currentRunId: string | null;
  onSelect: (runId: string) => void;
  loading?: boolean;
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; border: string; color: string; dot: string; label: string }> = {
    RUNNING: { bg: 'rgba(56,189,248,0.08)', border: 'rgba(56,189,248,0.22)', color: '#67e8f9', dot: '#38bdf8', label: 'Çalışıyor' },
    DONE:    { bg: 'rgba(52,211,153,0.08)', border: 'rgba(52,211,153,0.22)', color: '#6ee7b7', dot: '#34d399', label: 'Tamamlandı' },
    FAILED:  { bg: 'rgba(244,63,94,0.08)',  border: 'rgba(244,63,94,0.22)',  color: '#fda4af', dot: '#fb7185', label: 'Başarısız' },
  };
  const m = map[status] ?? map.RUNNING;
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: m.bg, border: `1px solid ${m.border}`, color: m.color }}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'RUNNING' ? 'animate-pulse' : ''}`}
        style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

export function VisualAnalysisHistory({ runs, currentRunId, onSelect, loading }: Props) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
        border: '1px solid rgba(56,189,248,0.1)',
      }}>
      <div className="h-px w-full" style={{
        background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.4), rgba(52,211,153,0.2), transparent)',
      }} />

      <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: 'rgba(56,189,248,0.07)' }}>
        <div className="text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: 'rgba(56,189,248,0.45)' }}>
          Geçmiş
        </div>
        <h3 className="text-sm font-semibold text-slate-100">Son analizler</h3>
      </div>

      {loading && runs.length === 0 && (
        <div className="p-6 text-center text-[12px] text-slate-500">Geçmiş yükleniyor…</div>
      )}

      {!loading && runs.length === 0 && (
        <div className="p-8 text-center">
          <div className="text-[13px] text-slate-300 font-medium">Henüz analiz geçmişi yok</div>
          <div className="text-[11px] text-slate-500 mt-1">İlk public URL analizinizi başlatın.</div>
        </div>
      )}

      {runs.length > 0 && (
        <ul className="divide-y" style={{ borderColor: 'rgba(56,189,248,0.05)' }}>
          {runs.map((r) => {
            const active = r.id === currentRunId;
            const categoryHint =
              r.aiVisualAnalysis?.siteCategory ??
              r.ruleSiteCategory ??
              null;
            return (
              <li key={r.id}>
                <button
                  onClick={() => onSelect(r.id)}
                  className="w-full text-left px-5 py-3 transition-colors hover:bg-white/[0.02] focus:outline-none focus:bg-white/[0.03]"
                  style={active ? {
                    background: 'rgba(56,189,248,0.06)',
                    borderLeft: '2px solid rgba(52,211,153,0.6)',
                  } : { borderLeft: '2px solid transparent' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <StatusBadge status={r.status} />
                        {categoryHint && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(56,189,248,0.05)', color: 'rgba(148,163,184,0.85)' }}>
                            {categoryHint.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                      <div className="text-[12px] font-medium text-slate-200 truncate" title={r.title ?? r.url}>
                        {r.title ?? r.url}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate mt-0.5" title={r.url}>
                        {r.url}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 flex-shrink-0">
                      {fmtDateTime(r.createdAt)}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
