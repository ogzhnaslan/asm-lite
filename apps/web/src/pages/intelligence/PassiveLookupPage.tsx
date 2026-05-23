import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { askPassiveLookupHistory, getPassiveLookupHistory, getPassiveLookupHistoryDetail, lookupPassiveIntelligence } from '../../api/api';
import { OtxIntelligenceCard } from '../../components/intelligence/OtxIntelligenceCard';
import type { OtxIntelligence, PassiveLookupRun } from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const BACKEND_ERROR_TR: Record<string, string> = {
  'target is required': 'Hedef alan boş bırakılamaz.',
  'target is too long': 'Girilen değer çok uzun.',
  'Invalid domain or IP format': 'Geçerli bir domain veya IPv4 adresi girin. Örnek: example.com veya 1.2.3.4',
  'Invalid IPv4 address': 'Geçersiz IPv4 adresi. Örnek: 1.2.3.4',
  'Invalid URL format': 'URL formatı tanınamadı. Sadece domain veya IP girin.',
  'target must not contain whitespace': 'Boşluk karakteri içeren değer geçersiz.',
};

function translateBackendError(msg: string): string {
  for (const [en, tr] of Object.entries(BACKEND_ERROR_TR)) {
    if (msg.toLowerCase().includes(en.toLowerCase())) return tr;
  }
  return msg;
}

// ─── Section divider ──────────────────────────────────────────────────────────

function SectionDivider({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
        style={{ color: 'rgba(56,189,248,0.4)' }}>
        {label}
      </span>
      <div className="flex-1 h-px" style={{ background: 'rgba(56,189,248,0.07)' }} />
      {right}
    </div>
  );
}

// ─── Passive scope card ───────────────────────────────────────────────────────

function PassiveScopeCard() {
  const notItems = [
    { label: 'Port taraması yapılmaz', detail: 'TCP/UDP bağlantı kurulmaz' },
    { label: 'HTTP/TLS bağlantısı kurulmaz', detail: 'Hedef sunucuya istek atılmaz' },
    { label: 'Asset oluşturulmaz', detail: 'Varlık listene eklenmez' },
    { label: 'Finding üretilmez', detail: 'Scan history yazılmaz' },
  ];

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
        border: '1px solid rgba(56,189,248,0.1)',
      }}>
      {/* Top accent */}
      <div className="h-px w-full" style={{
        background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.4), rgba(52,211,153,0.2), transparent)',
      }} />
      <div className="p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.18)' }}>
            <svg className="w-4 h-4" style={{ color: '#38bdf8' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div>
            <span className="text-sm font-bold text-slate-200">Passive Intelligence Mode</span>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Bu sayfa aktif tarama yapmaz. Girilen domain veya IP için yalnızca pasif tehdit
              istihbaratı kaynaklarından veri alır. Herhangi bir hedefte, sahiplik doğrulaması
              olmadan sorgu başlatılabilir.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {notItems.map(item => (
            <div key={item.label} className="rounded-xl px-3 py-2.5 flex flex-col gap-1"
              style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
              <div className="flex items-center gap-1.5">
                <svg className="w-3 h-3 text-red-500/60 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="text-[11px] font-semibold text-slate-300 leading-tight">{item.label}</span>
              </div>
              <span className="text-[10px] text-slate-600 leading-tight">{item.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Mode comparison cards ────────────────────────────────────────────────────

function ModeComparisonCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-2xl p-5 flex flex-col gap-3"
        style={{
          background: 'linear-gradient(145deg, rgba(52,211,153,0.06) 0%, rgba(52,211,153,0.02) 100%)',
          border: '1px solid rgba(52,211,153,0.15)',
        }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
            <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-emerald-300">Verified Monitoring</span>
            <Link to="/assets"
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md transition-colors"
              style={{ color: 'rgba(52,211,153,0.6)', background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.15)' }}>
              Assets →
            </Link>
          </div>
        </div>
        <ul className="space-y-1.5">
          {[
            'Sahiplik doğrulaması zorunlu',
            'Port, HTTP, TLS, DNS aktif tarama',
            'Security headers & robots.txt',
            'Scan history ve findings üretir',
            'Sürekli izleme (scheduler)',
            'AI risk analizi',
          ].map(label => (
            <li key={label} className="flex items-center gap-2 text-xs text-slate-400">
              <svg className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              {label}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl p-5 flex flex-col gap-3"
        style={{
          background: 'linear-gradient(145deg, rgba(56,189,248,0.06) 0%, rgba(56,189,248,0.02) 100%)',
          border: '1px solid rgba(56,189,248,0.15)',
        }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)' }}>
            <svg className="w-4 h-4" style={{ color: '#38bdf8' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold" style={{ color: '#38bdf8' }}>Passive Lookup</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
              style={{ color: 'rgba(56,189,248,0.6)', background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.15)' }}>
              Bu sayfa
            </span>
          </div>
        </div>
        <ul className="space-y-1.5">
          {[
            'Sahiplik doğrulaması gerekmez',
            'Aktif port/HTTP/TLS taraması yapılmaz',
            'Sadece pasif intelligence kaynakları',
            'AlienVault OTX sorgusu',
            'Finding veya scan history üretmez',
            'Asset olarak kayıt yapılmaz',
          ].map(item => (
            <li key={item} className="flex items-center gap-2 text-xs text-slate-400">
              <svg className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#38bdf8' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ─── Lookup form ──────────────────────────────────────────────────────────────

interface LookupFormProps {
  onLookup: (target: string) => void;
  isLoading: boolean;
}

function LookupForm({ onLookup, isLoading }: LookupFormProps) {
  const [value, setValue] = useState('');

  const looksLikeUrl = value.includes('://') || (value.includes('/') && !value.startsWith('/'));
  const trimmed = value.trim();

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0d1b2e 0%, #0a1628 100%)',
        border: '1px solid rgba(56,189,248,0.12)',
        boxShadow: '0 0 0 1px rgba(56,189,248,0.04)',
      }}>
      <div className="h-px w-full" style={{
        background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.45), transparent)',
      }} />
      <div className="p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-bold text-slate-200">Domain veya IP Sorgula</span>
          <span className="text-xs text-slate-500">
            Aktif tarama yapılmaz. Sadece AlienVault OTX pasif intelligence kaynağı sorgulanır.
          </span>
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
              </svg>
            </div>
            <input
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && trimmed && !isLoading && onLookup(trimmed)}
              placeholder="example.com veya 1.2.3.4"
              disabled={isLoading}
              className="w-full rounded-xl pl-10 pr-4 py-3 text-sm text-slate-100 placeholder-slate-600 font-mono focus:outline-none disabled:opacity-50 transition-all"
              style={{
                background: 'rgba(56,189,248,0.04)',
                border: '1px solid rgba(56,189,248,0.12)',
              }}
              onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(56,189,248,0.35)'; }}
              onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(56,189,248,0.12)'; }}
            />
          </div>
          <button
            onClick={() => trimmed && onLookup(trimmed)}
            disabled={!trimmed || isLoading}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold
              text-slate-900 bg-emerald-400 hover:bg-emerald-300
              disabled:opacity-40 disabled:cursor-not-allowed
              shadow-lg shadow-emerald-500/20 transition-all flex-shrink-0"
          >
            {isLoading ? (
              <>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: '2px solid rgba(0,0,0,0.2)',
                  borderTopColor: '#000',
                  animation: 'spin 0.7s linear infinite',
                }} />
                Sorgulanıyor…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Analyze
              </>
            )}
          </button>
        </div>

        {looksLikeUrl && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <svg className="w-3 h-3 flex-shrink-0" style={{ color: '#38bdf8' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            URL girildi — protokol ve path otomatik soyulacak, sadece hostname sorgulanacak.
          </div>
        )}

        <div className="flex items-center gap-2 text-[11px] text-slate-700">
          <svg className="w-3.5 h-3.5 flex-shrink-0 text-emerald-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Aktif tarama yapılmıyor · Port/HTTP/TLS bağlantısı kurulmaz · Asset oluşturulmaz
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyLookupState() {
  return (
    <div className="rounded-2xl px-6 py-14 flex flex-col items-center gap-4 text-center"
      style={{
        background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
        border: '1px dashed rgba(56,189,248,0.1)',
      }}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.14)' }}>
        <svg className="w-7 h-7" style={{ color: 'rgba(56,189,248,0.4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-slate-400">Henüz pasif lookup yapılmadı</span>
        <p className="text-xs text-slate-600 leading-relaxed max-w-sm">
          Bir domain veya IP girerek AlienVault OTX üzerinde pasif tehdit istihbaratı
          sorgusu başlatabilirsiniz. Sonuçlar yalnızca gösterim amaçlıdır.
        </p>
      </div>
    </div>
  );
}

// ─── Loading state ────────────────────────────────────────────────────────────

function LoadingState({ target }: { target: string }) {
  return (
    <div className="rounded-2xl px-6 py-12 flex flex-col items-center gap-4"
      style={{
        background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
        border: '1px solid rgba(56,189,248,0.1)',
      }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '2px solid rgba(56,189,248,0.15)',
        borderTopColor: '#38bdf8',
        animation: 'spin 0.8s linear infinite',
      }} />
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-semibold text-slate-300">OTX pasif intelligence sorgulanıyor…</span>
        <span className="text-xs text-slate-600 font-mono">{target}</span>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-slate-700">
        <svg className="w-3 h-3 text-emerald-800 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Aktif tarama yapılmıyor — yalnızca OTX sorgulanıyor
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Error card ───────────────────────────────────────────────────────────────

function ErrorCard({ message, isValidation }: { message: string; isValidation: boolean }) {
  const text = isValidation
    ? translateBackendError(message)
    : message.toLowerCase().includes('reach api') || message.toLowerCase().includes('localhost')
      ? 'API sunucusuna ulaşılamıyor. Backend çalışıyor mu? (localhost:3000)'
      : translateBackendError(message);

  return (
    <div className="rounded-2xl px-5 py-4 flex items-start gap-3"
      style={isValidation ? {
        background: 'rgba(251,191,36,0.05)',
        border: '1px solid rgba(251,191,36,0.18)',
      } : {
        background: 'rgba(239,68,68,0.05)',
        border: '1px solid rgba(239,68,68,0.18)',
      }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
        style={isValidation ? {
          background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.2)',
        } : {
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
        }}>
        <svg className={`w-4 h-4 ${isValidation ? 'text-amber-400' : 'text-red-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isValidation ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M6 18L18 6M6 6l12 12" />
          )}
        </svg>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className={`text-xs font-semibold ${isValidation ? 'text-amber-300' : 'text-red-300'}`}>
          {isValidation ? 'Geçersiz Giriş' : 'Sorgu Başarısız'}
        </span>
        <p className="text-xs text-slate-500 leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

// ─── Result header ────────────────────────────────────────────────────────────

interface ResultHeaderProps {
  rawTarget: string;
  normalizedTarget: string;
  targetType: 'DOMAIN' | 'IP';
  checkedAt: string;
}

function ResultHeader({ rawTarget, normalizedTarget, targetType, checkedAt }: ResultHeaderProps) {
  const wasNormalized = rawTarget.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split('?')[0].split('#')[0] !== normalizedTarget;
  const accentColor = targetType === 'DOMAIN' ? '#38bdf8' : '#a78bfa';

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
        border: `1px solid ${accentColor}20`,
      }}>
      <div className="h-px w-full" style={{
        background: `linear-gradient(90deg, transparent, ${accentColor}50, transparent)`,
      }} />
      <div className="px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-lg font-black text-slate-100 font-mono tracking-tight">{normalizedTarget}</span>

          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md"
            style={{ background: `${accentColor}12`, color: accentColor, border: `1px solid ${accentColor}25` }}>
            {targetType === 'DOMAIN' ? (
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
              </svg>
            ) : (
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
              </svg>
            )}
            {targetType === 'DOMAIN' ? 'Domain' : 'IP Address'}
          </span>

          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md"
            style={{ background: 'rgba(56,189,248,0.07)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.18)' }}>
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            PASSIVE_LOOKUP
          </span>
        </div>

        {wasNormalized && (
          <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
            <svg className="w-3 h-3 flex-shrink-0" style={{ color: 'rgba(56,189,248,0.4)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Girdi normalize edildi:</span>
            <span className="font-mono text-slate-700">{rawTarget}</span>
            <svg className="w-3 h-3 text-slate-700 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-mono" style={{ color: 'rgba(56,189,248,0.6)' }}>{normalizedTarget}</span>
          </div>
        )}

        <div className="flex items-center gap-4 text-[11px] text-slate-600 pt-1"
          style={{ borderTop: '1px solid rgba(56,189,248,0.06)' }}>
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {fmtDateTime(checkedAt)}
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Aktif tarama yapılmadı
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Finding üretilmedi
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── OTX context banner ───────────────────────────────────────────────────────

function OtxContextBanner({ hasAssociation }: { hasAssociation: boolean }) {
  if (!hasAssociation) return null;
  return (
    <div className="rounded-xl px-4 py-3 flex items-start gap-2.5"
      style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)' }}>
      <svg className="w-3.5 h-3.5 text-amber-500/70 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="flex flex-col gap-0.5">
        <span className="text-[10px] font-semibold text-amber-500/70 uppercase tracking-wider">Sonuç Yorumlama Notu</span>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          OTX ilişki sinyali, bu hedefin <span className="text-slate-400">kesin olarak zararlı olduğunu kanıtlamaz.</span>{' '}
          Popüler domainlerde marka taklidi, analiz raporu referansı veya tehdit kampanyası bağlamı
          nedeniyle OTX'te ilişki görülebilir. Sonuçlar aktif tarama sonucu değil, dış tehdit
          istihbaratı ilişki sinyalidir.
        </p>
      </div>
    </div>
  );
}

// ─── Passive result notice ────────────────────────────────────────────────────

function PassiveResultNotice({ target }: { target: string }) {
  return (
    <div className="rounded-xl px-4 py-3 flex items-start gap-2.5"
      style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.1)' }}>
      <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'rgba(56,189,248,0.5)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-[11px] text-slate-600 leading-relaxed">
        <span className="text-slate-500 font-medium font-mono">{target}</span> için pasif intelligence sonucu.
        AlienVault OTX üzerinde bu değerle ilişkili pulse, malware referansı, URL ilişkisi veya
        passive DNS gözlemi bulunup bulunmadığını gösterir. Findings listesine yazılmaz, asset olarak kaydedilmez.
      </p>
    </div>
  );
}

// ─── Add to monitoring banner ────────────────────────────────────────────────

function AddToMonitoringBanner({ target }: { target: string }) {
  return (
    <div className="rounded-2xl px-5 py-4 flex items-start gap-3"
      style={{
        background: 'linear-gradient(145deg, rgba(52,211,153,0.05) 0%, rgba(52,211,153,0.02) 100%)',
        border: '1px solid rgba(52,211,153,0.14)',
      }}>
      <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.18)' }}>
        <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-slate-300">Bu domain size ait mi?</span>
        <p className="text-xs text-slate-500 leading-relaxed">
          <span className="font-mono text-slate-400">{target}</span> üzerinde sürekli izleme, aktif tarama ve
          otomatik finding üretimi istiyorsanız{' '}
          <Link to="/assets" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors">
            Verified Assets
          </Link>{' '}
          bölümüne ekleyip sahipliğinizi doğrulayın.
        </p>
      </div>
    </div>
  );
}

// ─── Future sources ───────────────────────────────────────────────────────────

function FutureSources() {
  const sources = [
    {
      name: 'VirusTotal',
      desc: 'Dosya/URL/domain/IP için 70+ antivirüs motoruyla tehdit analizi.',
      color: '#38bdf8',
    },
    {
      name: 'PhishTank / URLhaus',
      desc: 'Aktif phishing URL veritabanı ve malware dağıtım kaynağı kontrolü.',
      color: '#a78bfa',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {sources.map(src => (
        <div key={src.name} className="rounded-2xl p-5 flex flex-col gap-3 opacity-50"
          style={{
            background: `linear-gradient(145deg, ${src.color}07 0%, ${src.color}02 100%)`,
            border: `1px solid ${src.color}18`,
          }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: `${src.color}10`, border: `1px solid ${src.color}20` }}>
                <svg className="w-3.5 h-3.5" style={{ color: src.color }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-sm font-bold text-slate-300">{src.name}</span>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
              style={{ color: 'rgba(56,189,248,0.4)', background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.1)' }}>
              Yakında
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">{src.desc}</p>
        </div>
      ))}
    </div>
  );
}

// ─── History helpers ──────────────────────────────────────────────────────────

function statusBadge(status: PassiveLookupRun['status']) {
  if (status === 'ERROR') return { label: 'Hata', color: '#f87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' };
  if (status === 'SKIPPED') return { label: 'Atlandı', color: 'rgba(251,191,36,0.8)', bg: 'rgba(251,191,36,0.06)', border: 'rgba(251,191,36,0.2)' };
  return { label: 'Tamam', color: '#34d399', bg: 'rgba(52,211,153,0.07)', border: 'rgba(52,211,153,0.2)' };
}

function OtxCountPill({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  const color = warn && value > 0 ? '#fbbf24' : 'rgba(148,163,184,0.5)';
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md"
      style={{ background: 'rgba(2,6,23,0.5)', border: '1px solid rgba(56,189,248,0.08)', color }}>
      {value} {label}
    </span>
  );
}

// ─── AI Report ────────────────────────────────────────────────────────────────

interface ReportSection {
  key: string;
  label: string;
  content: string;
  isList?: boolean;
  isQuote?: boolean;
}

function buildReportSections(run: PassiveLookupRun): ReportSection[] {
  const otx = run.otxJson;
  const target = run.target;
  const typeLabel = run.targetType === 'DOMAIN' ? 'alan adı' : 'IP adresi';
  const sections: ReportSection[] = [];

  // A) Genel Değerlendirme
  sections.push({
    key: 'a',
    label: 'Genel Değerlendirme',
    content: `Bu sorgu, ${target} ${typeLabel}ının AlienVault OTX üzerinde bilinen tehdit kampanyaları, malware referansları, ilişkili URL kayıtları ve passive DNS gözlemleriyle ilişkilendirilip ilişkilendirilmediğini kontrol eder. OTX, güvenlik araştırmacılarının topluluk temelli tehdit istihbaratını paylaştığı açık kaynaklı bir platformdur. Bu sorgu aktif tarama yapmaz; yalnızca dış tehdit istihbaratı kayıtlarını inceler.`,
  });

  if (!otx || otx.skipped || otx.error) {
    if (run.aiSummary) {
      sections.push({ key: 'b', label: 'OTX Durumu', content: run.aiSummary });
    } else {
      sections.push({ key: 'b', label: 'OTX Durumu', content: 'OTX verisi mevcut değil ya da sorgu tamamlanamadı. API anahtarının tanımlı ve aktif olduğundan emin olun.' });
    }
    return sections;
  }

  const hasRisk = otx.pulseCount > 0 || otx.malwareCount > 0;

  // B) OTX Sonuç Özeti
  let summaryContent: string;
  if (!hasRisk) {
    summaryContent = `${target} için OTX üzerinde ${otx.pulseCount} pulse ve ${otx.malwareCount} malware referansı görülmektedir${otx.urlListCount > 0 ? `; ek olarak ${otx.urlListCount} ilişkili URL ve ${otx.passiveDnsCount} passive DNS gözlemi bulunmaktadır` : ''}. Pulse ve malware sayılarının sıfır olması, OTX verisine göre bilinen aktif bir tehdit ilişkisi bulunmadığını gösterir. Bu değerlendirme açısından olumlu bir sinyaldir.`;
  } else {
    const parts: string[] = [];
    if (otx.pulseCount > 0) parts.push(`${otx.pulseCount} tehdit pulse'ı`);
    if (otx.malwareCount > 0) parts.push(`${otx.malwareCount} malware referansı`);
    if (otx.urlListCount > 0) parts.push(`${otx.urlListCount} ilişkili URL`);
    if (otx.passiveDnsCount > 0) parts.push(`${otx.passiveDnsCount} passive DNS gözlemi`);
    summaryContent = `${target} için OTX üzerinde ${parts.join(', ')} tespit edildi. Bu sonuç, ${target} adresinin güvenlik araştırmacıları tarafından paylaşılan tehdit istihbaratıyla ilişkilendirildiğini gösterir. Ancak bu bulgu tek başına kesin zararlılık kanıtı değildir; büyük ve popüler domainlerde marka taklidi, analiz referansı veya tehdit kampanyası bağlamı nedeniyle OTX'te ilişki görülebilir.`;
  }
  sections.push({ key: 'b', label: 'OTX Sonuç Özeti', content: summaryContent });

  // C) Passive DNS Yorumu
  if (otx.passiveDnsCount > 0) {
    sections.push({
      key: 'c',
      label: 'Passive DNS Yorumu',
      content: `Passive DNS sayısının ${otx.passiveDnsCount} olması, bu ${typeLabel}ının geçmişte farklı DNS gözlemlerine sahip olduğunu gösterir. Passive DNS verileri; geçmişte hangi IP adreslerinin bu domaine işaret ettiğini veya hangi domainlerin bu IP ile ilişkilendirildiğini ortaya koyar. Bu durum büyük veya popüler domainlerde normaldir ve tek başına zararlılık göstergesi değildir. Ancak beklenmedik ASN veya altyapı değişimleri şüpheli hareketlere işaret edebilir.`,
    });
  } else {
    sections.push({
      key: 'c',
      label: 'Passive DNS Yorumu',
      content: `Bu sorgu için OTX'te kayıtlı passive DNS gözlemi bulunmamaktadır. Bu, söz konusu ${typeLabel}ının OTX veritabanında geçmiş DNS ilişkilerinin henüz topluluk tarafından raporlanmadığı anlamına gelir.`,
    });
  }

  // D) Risk Yorumu
  sections.push({
    key: 'd',
    label: 'Risk Yorumu',
    content: hasRisk
      ? `OTX'te tespit edilen pulse ve malware ilişkileri, ${target} için dikkat gerektiren bir sinyal oluşturmaktadır. Kesin bir zararlılık hükmü vermeden önce bu verilerin bağlamı incelenmelidir: ilgili pulse hangi tehdit kampanyasıyla ilişkili, malware referansı aktif mi yoksa arşiv kaydı mı? Büyük ve tanınmış domainlerde güvenlik araştırması veya marka taklidi nedeniyle OTX'te ilişki görülebilir. Bu nedenle sonuç, DNS kayıt analizi, TLS sertifika durumu ve aktif tarama sonuçlarıyla birlikte değerlendirilmelidir.`
      : `OTX üzerinde bilinen zararlı ilişki bulunmaması olumlu bir sinyaldir. Ancak bu sonuç, ${target} ${typeLabel}ının tamamen güvenli olduğu anlamına gelmez. OTX, pasif tehdit istihbaratı kaynağıdır ve yalnızca topluluk tarafından raporlanmış tehdit ilişkilerini gösterir. Aktif tarama, DNS kayıt analizi, TLS sertifika kontrolü, HTTP başlık güvenliği ve reputation kontrolleriyle birlikte değerlendirilmelidir.`,
  });

  // E) Önerilen Aksiyonlar
  const defaultRecs = [
    `OTX sonucu temiz olsa bile düzenli aralıklarla tekrar sorgulayın.`,
    `Passive DNS değişiklikleri ASN ve altyapı analizi ile ayrıca izlenebilir.`,
    `${target} size aitse Verified Assets bölümüne ekleyerek aktif tarama başlatın.`,
    `Büyük domainlerde marka taklidi ve sahte subdomain riskleri ayrıca değerlendirilmelidir.`,
  ];
  const recs = run.aiRecommendations && run.aiRecommendations.length > 0
    ? run.aiRecommendations
    : defaultRecs;
  sections.push({ key: 'e', label: 'Önerilen Aksiyonlar', content: recs.join('\n'), isList: true });

  // F) Rapor Cümlesi
  const pulseStr = otx.pulseCount > 0 ? `${otx.pulseCount} tehdit pulse'ı tespit edilmiş` : `tehdit pulse'ı tespit edilmemiş`;
  const malwareStr = otx.malwareCount > 0 ? `${otx.malwareCount} malware referansı bulunmuş` : `malware referansı bulunmamış`;
  sections.push({
    key: 'f',
    label: 'Rapor Cümlesi',
    content: `Bu modülde, ${target} hedefi için AlienVault OTX üzerinden pasif tehdit istihbaratı sorgusu gerçekleştirilmiş; ${pulseStr}, ${malwareStr}, ${otx.urlListCount} ilişkili URL ve ${otx.passiveDnsCount} passive DNS gözlemi analiz edilmiştir. Elde edilen sonuçlar aktif tarama üretmeden, yalnızca dış tehdit istihbaratı sinyali olarak değerlendirilmiştir.`,
    isQuote: true,
  });

  return sections;
}

function AiReportCard({ run }: { run: PassiveLookupRun }) {
  const sections = buildReportSections(run);

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: 'linear-gradient(145deg, #0e1a2e 0%, #091425 100%)',
        border: '1px solid rgba(139,92,246,0.2)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
      }}>
      <div className="h-px w-full" style={{
        background: 'linear-gradient(90deg, transparent, rgba(139,92,246,0.5), rgba(56,189,248,0.25), transparent)',
      }} />

      <div className="px-5 pt-5 pb-4 flex items-start gap-3"
        style={{ borderBottom: '1px solid rgba(139,92,246,0.1)' }}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
          <svg className="w-4 h-4" style={{ color: '#a78bfa' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <span className="text-sm font-bold text-slate-100">AI Raporu</span>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
            OTX verilerinden otomatik üretilen Türkçe tehdit değerlendirmesi. Pasif istihbarat sinyali; kesin zararlılık hükmü değildir.
          </p>
        </div>
      </div>

      <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto" style={{ maxHeight: '480px' }}>
        {sections.map((sec, idx) => (
          <div key={sec.key} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa' }}>
                {sec.key.toUpperCase()}
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'rgba(139,92,246,0.7)' }}>
                {sec.label}
              </span>
            </div>

            {sec.isList ? (
              <ul className="flex flex-col gap-1.5 pl-1">
                {sec.content.split('\n').filter(Boolean).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-400 leading-relaxed">
                    <svg className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#a78bfa' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                    {item}
                  </li>
                ))}
              </ul>
            ) : sec.isQuote ? (
              <div className="rounded-xl px-4 py-3"
                style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.12)' }}>
                <p className="text-xs text-slate-400 leading-relaxed italic">{sec.content}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 leading-relaxed">{sec.content}</p>
            )}

            {idx < sections.length - 1 && (
              <div className="h-px w-full mt-1" style={{ background: 'rgba(139,92,246,0.07)' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AI Threat Chat ───────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

const QUICK_QUESTIONS = [
  'Bu sonucu özetle',
  'Bu domain zararlı mı?',
  'Passive DNS ne anlama geliyor?',
  'Risk var mı?',
  'Bu sonucu raporda nasıl açıklarım?',
  'Ne yapmalıyım?',
];

function AiThreatChat({ runId }: { runId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [asking, setAsking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sendQuestion = async (question: string) => {
    if (!question.trim() || asking) return;
    const q = question.trim();
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setInput('');
    setAsking(true);
    try {
      const res = await askPassiveLookupHistory(runId, q);
      setMessages(prev => [...prev, { role: 'ai', text: res.answer }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Cevap alınamadı. Lütfen tekrar deneyin.' }]);
    } finally {
      setAsking(false);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, asking]);

  return (
    <div className="flex flex-col gap-0">

      {/* Mesaj listesi */}
      <div className="flex flex-col gap-2 px-5 py-4 min-h-[80px] max-h-72 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-[11px] text-slate-700 text-center py-3">
            Soru sormak için aşağıdaki butonları ya da kendi sorunuzu kullanın.
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className="max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed"
              style={msg.role === 'user' ? {
                background: 'rgba(56,189,248,0.12)',
                border: '1px solid rgba(56,189,248,0.2)',
                color: '#e2e8f0',
              } : {
                background: 'rgba(2,6,23,0.6)',
                border: '1px solid rgba(56,189,248,0.07)',
                color: '#94a3b8',
                whiteSpace: 'pre-wrap',
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {asking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl"
              style={{ background: 'rgba(2,6,23,0.6)', border: '1px solid rgba(56,189,248,0.07)' }}>
              {[0, 1, 2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: '#38bdf8',
                    opacity: 0.6,
                    animation: `bounce 1.2s ${i * 0.2}s infinite`,
                  }} />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Hazır soru butonları */}
      <div className="flex flex-wrap gap-1.5 px-5 py-3"
        style={{ borderTop: '1px solid rgba(56,189,248,0.06)' }}>
        {QUICK_QUESTIONS.map(q => (
          <button key={q} onClick={() => sendQuestion(q)} disabled={asking}
            className="text-[10px] font-medium px-2.5 py-1 rounded-lg transition-all disabled:opacity-40"
            style={{ background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.12)', color: 'rgba(56,189,248,0.7)' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,0.3)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,0.12)'; }}>
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2 px-5 pb-5"
        style={{ borderTop: '1px solid rgba(56,189,248,0.05)' }}>
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendQuestion(input)}
          placeholder="Sorunuzu yazın… (Enter veya Sor butonu)"
          disabled={asking}
          maxLength={1000}
          className="flex-1 rounded-xl px-3 py-2.5 text-xs text-slate-200 placeholder-slate-700 focus:outline-none disabled:opacity-50 mt-3"
          style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.1)' }}
          onFocus={e => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(56,189,248,0.3)'; }}
          onBlur={e => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(56,189,248,0.1)'; }}
        />
        <button
          onClick={() => sendQuestion(input)}
          disabled={!input.trim() || asking}
          className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-900 bg-emerald-400 hover:bg-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex-shrink-0 mt-3">
          Sor
        </button>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}

// ─── History Detail Modal ─────────────────────────────────────────────────────

function HistoryDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [run, setRun] = useState<PassiveLookupRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getPassiveLookupHistoryDetail(id)
      .then(setRun)
      .catch(() => setError('Kayıt yüklenemedi.'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(5px)' }}
    >
      <div
        className="flex min-h-full items-start justify-center p-4 py-8"
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="w-full max-w-4xl rounded-2xl flex flex-col"
          style={{ background: '#080d1a', border: '1px solid rgba(56,189,248,0.14)' }}>

          {/* ── Sticky header ── */}
          <div className="flex items-center justify-between px-6 py-4 sticky top-0 z-10 rounded-t-2xl"
            style={{ background: '#080d1a', borderBottom: '1px solid rgba(56,189,248,0.08)' }}>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: '#a78bfa', boxShadow: '0 0 6px rgba(167,139,250,0.7)' }} />
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#a78bfa' }}>
                  Intelligence
                </span>
              </div>
              <span className="text-base font-black text-slate-100 leading-tight">
                AI Tehdit İstihbaratı Raporu
              </span>
              {run && (
                <span className="text-[11px] text-slate-500 font-mono">{run.target}</span>
              )}
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
              style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.1)' }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-6 flex flex-col gap-5">
            {loading && (
              <div className="flex justify-center py-14">
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: '2px solid rgba(56,189,248,0.15)',
                  borderTopColor: '#38bdf8',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {error && <p className="text-xs text-red-400 text-center py-8">{error}</p>}

            {run && !loading && (
              <>
                {/* ── Disclaimer banner ── */}
                <div className="rounded-xl px-4 py-3 flex items-start gap-2.5"
                  style={{ background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.12)' }}>
                  <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'rgba(139,92,246,0.6)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Bu rapor, seçili Passive Lookup kaydındaki AlienVault OTX verilerine göre Türkçe olarak oluşturulmuştur.
                    Aktif tarama sonucu değildir; pasif tehdit istihbaratı değerlendirmesidir.
                  </p>
                </div>

                {/* ── Meta badges ── */}
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-lg font-mono"
                    style={{ background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.15)', color: '#38bdf8' }}>
                    {run.target}
                  </span>
                  <span className="inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded-lg"
                    style={{ color: run.targetType === 'DOMAIN' ? '#38bdf8' : '#a78bfa', background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.1)' }}>
                    {run.targetType}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg"
                    style={{ background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.15)', color: '#34d399' }}>
                    AlienVault OTX
                  </span>
                  {(() => { const b = statusBadge(run.status); return (
                    <span className="inline-flex items-center text-[10px] font-semibold px-2.5 py-1 rounded-lg"
                      style={{ color: b.color, background: b.bg, border: `1px solid ${b.border}` }}>
                      {b.label}
                    </span>
                  ); })()}
                  <span className="inline-flex items-center gap-1.5 text-[10px] text-slate-600 px-2.5 py-1 rounded-lg"
                    style={{ background: 'rgba(2,6,23,0.5)', border: '1px solid rgba(56,189,248,0.06)' }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {fmtDateTime(run.checkedAt)}
                  </span>
                </div>

                {/* ── OTX card (left) + AI Report card (right) ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                  <OtxIntelligenceCard otx={run.otxJson} />
                  <AiReportCard run={run} />
                </div>

                {/* ── AI Chat (full width) ── */}
                <div className="rounded-2xl overflow-hidden"
                  style={{ border: '1px solid rgba(56,189,248,0.1)', background: 'rgba(6,12,28,0.7)' }}>
                  {/* Chat header */}
                  <div className="flex items-center gap-2.5 px-5 py-3.5"
                    style={{ borderBottom: '1px solid rgba(56,189,248,0.07)' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.15)' }}>
                      <svg className="w-3.5 h-3.5" style={{ color: '#38bdf8' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-slate-200">AI Chat</span>
                      <p className="text-[11px] text-slate-600 leading-tight">
                        Bu sohbet yalnızca seçili OTX geçmiş kaydındaki verilere göre cevap üretir. Chat kaydedilmez.
                      </p>
                    </div>
                  </div>
                  <AiThreatChat runId={run.id} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── History Card ─────────────────────────────────────────────────────────────

function HistoryCard({ run, onClick }: { run: PassiveLookupRun; onClick: () => void }) {
  const otx = run.otxJson;
  const badge = statusBadge(run.status);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl px-4 py-3.5 flex flex-col gap-2.5 transition-all group"
      style={{
        background: 'rgba(14,29,53,0.6)',
        border: '1px solid rgba(56,189,248,0.08)',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,0.2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(56,189,248,0.08)'; }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold font-mono text-slate-200 truncate">{run.target}</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ color: run.targetType === 'DOMAIN' ? '#38bdf8' : '#a78bfa', background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.1)' }}>
            {run.targetType}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
            style={{ color: badge.color, background: badge.bg, border: `1px solid ${badge.border}` }}>
            {badge.label}
          </span>
          <svg className="w-3.5 h-3.5 text-slate-700 group-hover:text-slate-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>

      {/* OTX sayaçları */}
      {otx && !otx.skipped && !otx.error && (
        <div className="flex flex-wrap gap-1.5">
          <OtxCountPill label="pulse" value={otx.pulseCount} warn />
          <OtxCountPill label="malware" value={otx.malwareCount} warn />
          <OtxCountPill label="URL" value={otx.urlListCount} />
          <OtxCountPill label="passive DNS" value={otx.passiveDnsCount} />
        </div>
      )}

      {/* AI özeti */}
      {run.aiSummary && (
        <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-2">{run.aiSummary}</p>
      )}

      <span className="text-[10px] text-slate-700">{fmtDateTime(run.checkedAt)}</span>
    </button>
  );
}

// ─── History Section ──────────────────────────────────────────────────────────

function HistorySection({ refreshKey }: { refreshKey: number }) {
  const [history, setHistory] = useState<PassiveLookupRun[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getPassiveLookupHistory(1, 50)
      .then(res => { setHistory(res.items); setTotal(res.total); })
      .catch(() => {/* sessiz hata — geçmiş yoksa da sayfa çalışmaya devam eder */})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div className="space-y-3">
      <SectionDivider
        label="Pasif Sorgu Geçmişi"
        right={total > 0 ? (
          <span className="text-[10px] text-slate-700">{total} sorgu</span>
        ) : undefined}
      />

      {loading && (
        <div className="flex justify-center py-8">
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            border: '2px solid rgba(56,189,248,0.12)',
            borderTopColor: '#38bdf8',
            animation: 'spin 0.8s linear infinite',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {!loading && history.length === 0 && (
        <div className="rounded-xl px-5 py-8 flex flex-col items-center gap-2 text-center"
          style={{ background: 'rgba(14,29,53,0.4)', border: '1px dashed rgba(56,189,248,0.07)' }}>
          <svg className="w-6 h-6" style={{ color: 'rgba(56,189,248,0.2)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-xs text-slate-600">Henüz kayıtlı sorgu yok. İlk sorguyu yaptıktan sonra burada görünecek.</p>
        </div>
      )}

      {!loading && history.length > 0 && (
        <div className="flex flex-col gap-2">
          {history.map(run => (
            <HistoryCard key={run.id} run={run} onClick={() => setDetailId(run.id)} />
          ))}
        </div>
      )}

      {detailId && (
        <HistoryDetailModal id={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type LookupState =
  | { status: 'idle' }
  | { status: 'loading'; rawTarget: string }
  | { status: 'success'; rawTarget: string; normalizedTarget: string; targetType: 'DOMAIN' | 'IP'; otx: OtxIntelligence; checkedAt: string }
  | { status: 'error'; rawTarget: string; message: string; isValidation: boolean };

export function PassiveLookupPage() {
  const [state, setState] = useState<LookupState>({ status: 'idle' });
  const [historyKey, setHistoryKey] = useState(0);

  const handleLookup = async (rawTarget: string) => {
    setState({ status: 'loading', rawTarget });
    try {
      const response = await lookupPassiveIntelligence(rawTarget);
      setState({
        status: 'success',
        rawTarget,
        normalizedTarget: response.target,
        targetType: response.targetType,
        otx: response.sources.otx,
        checkedAt: response.checkedAt,
      });
      // Sorgu tamamlandı → history listesini yenile
      setHistoryKey(k => k + 1);
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: { status?: number; data?: { message?: string } };
        code?: string;
        message?: string;
      };
      const status = axiosErr.response?.status;
      const isValidation = status === 400;
      const isNetwork = !axiosErr.response;
      const msg = isNetwork
        ? `Cannot reach API at localhost:3000 (${axiosErr.code ?? axiosErr.message})`
        : (axiosErr.response?.data?.message ?? 'Sorgu başarısız');
      setState({ status: 'error', rawTarget, message: msg, isValidation });
    }
  };

  const isLoading = state.status === 'loading';

  const hasOtxAssociation =
    state.status === 'success' &&
    !state.otx.skipped &&
    !state.otx.error &&
    (state.otx.pulseCount > 0 || state.otx.malwareCount > 0);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-7">

      {/* ── Page header ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#38bdf8', boxShadow: '0 0 6px rgba(56,189,248,0.8)' }} />
          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#38bdf8' }}>
            Intelligence
          </span>
        </div>
        <h1 className="text-[24px] font-black text-slate-100 tracking-tight leading-tight">
          Passive Threat Intelligence Lookup
        </h1>
        <p className="text-slate-500 text-sm mt-1.5 max-w-xl leading-relaxed">
          Herhangi bir domain veya IP için aktif tarama yapmadan pasif tehdit istihbaratı
          sinyallerini görüntüleyin. Sahiplik doğrulaması gerekmez.
        </p>
      </div>

      {/* ── Passive scope card ── */}
      <PassiveScopeCard />

      {/* ── Mode comparison ── */}
      <div className="space-y-3">
        <SectionDivider label="Monitoring vs Passive Lookup" />
        <ModeComparisonCards />
      </div>

      {/* ── Lookup form ── */}
      <div className="space-y-3">
        <SectionDivider label="Sorgu" />
        <LookupForm onLookup={handleLookup} isLoading={isLoading} />
      </div>

      {/* ── Results area ── */}
      <div className="space-y-4">
        <SectionDivider
          label="Intelligence Sonuçları"
          right={state.status !== 'idle' ? (
            <span className="text-[10px] text-slate-700 font-mono">
              {state.status === 'success' ? state.normalizedTarget : state.rawTarget}
            </span>
          ) : undefined}
        />

        {state.status === 'idle'    && <EmptyLookupState />}
        {state.status === 'loading' && <LoadingState target={state.rawTarget} />}
        {state.status === 'error'   && <ErrorCard message={state.message} isValidation={state.isValidation} />}

        {state.status === 'success' && (
          <div className="space-y-4">
            <ResultHeader
              rawTarget={state.rawTarget}
              normalizedTarget={state.normalizedTarget}
              targetType={state.targetType}
              checkedAt={state.checkedAt}
            />
            <OtxContextBanner hasAssociation={hasOtxAssociation} />
            <OtxIntelligenceCard otx={state.otx} />
            <PassiveResultNotice target={state.normalizedTarget} />
            <AddToMonitoringBanner target={state.normalizedTarget} />

            <div className="space-y-3 pt-2">
              <SectionDivider label="Yakında — Ek Kaynaklar" />
              <FutureSources />
            </div>
          </div>
        )}
      </div>

      {/* ── History ── */}
      <HistorySection refreshKey={historyKey} />

    </div>
  );
}
