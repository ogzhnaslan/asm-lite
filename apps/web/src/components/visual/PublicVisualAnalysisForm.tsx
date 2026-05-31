import { useState } from 'react';

interface Props {
  onSubmit: (url: string) => Promise<void> | void;
  loading?: boolean;
  errorMessage?: string | null;
  // Form submit denemesi sonrası inline hata gösterilebilir.
}

const EXAMPLE_URLS = [
  'https://oguzhanaslan.cloud',
  'https://alprnkml.com.tr',
  'https://www.fenerbahce.org',
];

export function PublicVisualAnalysisForm({ onSubmit, loading, errorMessage }: Props) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || !url.trim()) return;
    void onSubmit(url.trim());
  };

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
        border: '1px solid rgba(56,189,248,0.1)',
      }}>
      <div className="h-px w-full" style={{
        background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.4), rgba(52,211,153,0.2), transparent)',
      }} />

      <div className="p-5">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={loading}
              className="w-full px-4 py-3 rounded-xl text-sm font-mono outline-none transition-all"
              style={{
                background: 'rgba(2,6,23,0.5)',
                border: '1px solid rgba(56,189,248,0.18)',
                color: '#e2e8f0',
              }}
              onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(56,189,248,0.4)'; }}
              onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(56,189,248,0.18)'; }}
            />
          </div>
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="px-5 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: loading
                ? 'rgba(56,189,248,0.1)'
                : 'linear-gradient(135deg, #38bdf8 0%, #34d399 100%)',
              color: loading ? '#94a3b8' : '#0a1628',
              boxShadow: loading ? undefined : '0 0 18px rgba(56,189,248,0.25)',
            }}
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 rounded-full border-2 animate-spin"
                  style={{ borderColor: 'rgba(148,163,184,0.3)', borderTopColor: '#94a3b8' }} />
                Analiz başlatılıyor…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Analiz Et
              </>
            )}
          </button>
        </form>

        {errorMessage && (
          <div className="mt-3 p-3 rounded-lg text-[12px]"
            style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.2)', color: '#fda4af' }}>
            {errorMessage}
          </div>
        )}

        {/* Example chips */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest font-semibold mr-1"
            style={{ color: 'rgba(56,189,248,0.4)' }}>
            Örnek
          </span>
          {EXAMPLE_URLS.map((u) => (
            <button
              key={u}
              type="button"
              disabled={loading}
              onClick={() => setUrl(u)}
              className="text-[11px] px-2.5 py-1 rounded-md font-mono transition-colors hover:bg-white/[0.04] disabled:opacity-50"
              style={{
                background: 'rgba(56,189,248,0.04)',
                border: '1px solid rgba(56,189,248,0.12)',
                color: '#94a3b8',
              }}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
