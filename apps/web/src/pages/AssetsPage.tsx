import { useState, lazy, Suspense } from 'react';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAssets, createAsset, deleteAsset, devVerify,
  requestHttpToken, verifyHttp, requestDnsToken, verifyDns,
  getAssetIntelligence,
} from '../api/api';
import type { Asset } from '../types';
import type { GlobePoint } from '../components/ui/SatelliteGlobe';
import { AssetCard } from '../components/assets/AssetCard';
import { AssetOverviewStats } from '../components/assets/AssetOverviewStats';

// Three.js is heavy — split into its own chunk
const SatelliteGlobe = lazy(() =>
  import('../components/ui/SatelliteGlobe').then(m => ({ default: m.SatelliteGlobe }))
);

// ─── Shared input ─────────────────────────────────────────────────────────────

function DarkInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl px-4 py-2.5 text-sm text-slate-100
        placeholder-slate-600 focus:outline-none transition-all ${props.className ?? ''}`}
      style={{
        background: 'rgba(56,189,248,0.04)',
        border: '1px solid rgba(56,189,248,0.12)',
        ...(props.style ?? {}),
      }}
    />
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 flex items-center justify-center z-50 p-4"
      style={{ background: 'rgba(2,6,23,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.96, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.96, y: 8, opacity: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="w-full max-w-md rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, #0d1b2e 0%, #0a1628 100%)',
          border: '1px solid rgba(56,189,248,0.14)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
        }}
      >
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid rgba(56,189,248,0.08)' }}>
          <h2 className="font-semibold text-slate-100 text-sm">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500
              hover:text-slate-200 hover:bg-white/[0.06] transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
      </motion.div>
    </motion.div>
  );
}

// ─── Add Asset Modal ──────────────────────────────────────────────────────────

function AddAssetModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<'DOMAIN' | 'IP'>('DOMAIN');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: () => createAsset({ type, value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); onClose(); },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Oluşturma başarısız');
    },
  });

  return (
    <Modal title="Yeni Asset Ekle" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2.5 uppercase tracking-wider">Asset Tipi</label>
          <div className="grid grid-cols-2 gap-2">
            {(['DOMAIN', 'IP'] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl text-sm font-semibold transition-all ${
                  type === t
                    ? t === 'DOMAIN'
                      ? 'text-sky-300'
                      : 'text-violet-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
                style={type === t ? {
                  background: t === 'DOMAIN' ? 'rgba(56,189,248,0.08)' : 'rgba(167,139,250,0.08)',
                  border: `2px solid ${t === 'DOMAIN' ? 'rgba(56,189,248,0.3)' : 'rgba(167,139,250,0.3)'}`,
                } : {
                  background: 'transparent',
                  border: '2px solid rgba(255,255,255,0.07)',
                }}
              >
                <span className="text-xl">{t === 'DOMAIN' ? '🌐' : '🖥'}</span>
                {t === 'DOMAIN' ? 'Domain' : 'IP Address'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
            {type === 'DOMAIN' ? 'Domain Adı' : 'IPv4 Adresi'}
          </label>
          <DarkInput
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && value.trim() && mut.mutate()}
            placeholder={type === 'DOMAIN' ? 'example.com' : '192.168.1.1'}
          />
          <p className="text-xs text-slate-700 mt-1.5">
            {type === 'DOMAIN' ? 'Protocol prefix olmadan — örnek: example.com' : 'Geçerli bir IPv4 adresi girin'}
          </p>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-center gap-2 text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-3"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] transition-all">
            İptal
          </button>
          <button
            type="button"
            disabled={!value.trim() || mut.isPending}
            onClick={() => mut.mutate()}
            className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-900 bg-emerald-400
              hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed
              shadow-lg shadow-emerald-500/20 transition-all"
          >
            {mut.isPending ? 'Ekleniyor...' : 'Asset Ekle'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Verify Modal ─────────────────────────────────────────────────────────────

type VerifyTab = 'dev' | 'http' | 'dns';

function VerifyModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const [tab, setTab]             = useState<VerifyTab>('dev');
  const [httpUrl, setHttpUrl]     = useState(`https://${asset.value}/.well-known/asm-verify.txt`);
  const [httpToken, setHttpToken] = useState<string | null>(null);
  const [dnsInfo, setDnsInfo]     = useState<{ token: string; fqdn: string; value: string } | null>(null);
  const [error, setError]         = useState('');
  const qc = useQueryClient();

  const done = () => { qc.invalidateQueries({ queryKey: ['assets'] }); onClose(); };

  const devMut        = useMutation({ mutationFn: () => devVerify(asset.id),           onSuccess: done, onError: () => setError('Dev bypass başarısız') });
  const getHttpToken  = useMutation({ mutationFn: () => requestHttpToken(asset.id),    onSuccess: d => setHttpToken(d.token), onError: () => setError('Token alınamadı') });
  const httpVerifyMut = useMutation({ mutationFn: () => verifyHttp(asset.id, httpUrl), onSuccess: done, onError: () => setError('HTTP doğrulama başarısız') });
  const getDnsToken   = useMutation({ mutationFn: () => requestDnsToken(asset.id),     onSuccess: d => setDnsInfo({ token: d.token, fqdn: d.dns.fqdn, value: d.dns.value }), onError: () => setError('DNS token alınamadı') });
  const dnsVerifyMut  = useMutation({ mutationFn: () => verifyDns(asset.id),           onSuccess: done, onError: () => setError('DNS TXT kaydı bulunamadı') });

  const tabs: { id: VerifyTab; label: string }[] = [
    { id: 'dev',  label: 'Dev' },
    { id: 'http', label: 'HTTP Dosya' },
    { id: 'dns',  label: 'DNS TXT' },
  ];

  return (
    <Modal title={`Sahiplik Doğrulama — ${asset.value}`} onClose={onClose}>
      <div className="flex gap-1 p-1 rounded-xl mb-5"
        style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.08)' }}>
        {tabs.map(t => (
          <button key={t.id} type="button" onClick={() => { setTab(t.id); setError(''); }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              tab === t.id ? 'text-slate-100' : 'text-slate-500 hover:text-slate-300'
            }`}
            style={tab === t.id ? {
              background: 'rgba(56,189,248,0.1)',
              border: '1px solid rgba(56,189,248,0.15)',
            } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dev' && (
        <div className="space-y-4">
          <div className="bg-amber-950/40 border border-amber-900/50 rounded-xl p-4 text-sm text-amber-400 flex items-start gap-2.5">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
            </svg>
            Yalnızca development ortamında — sahiplik doğrulaması atlanır.
          </div>
          <button
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-amber-400 border border-amber-800/50 bg-amber-950/40 hover:bg-amber-900/40 transition-all"
            onClick={() => devMut.mutate()} disabled={devMut.isPending}>
            {devMut.isPending ? 'İşleniyor...' : 'Bypass & Doğrula'}
          </button>
        </div>
      )}

      {tab === 'http' && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 text-sm text-sky-400"
            style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.15)' }}>
            <p className="font-semibold mb-1">HTTP Dosya Doğrulama</p>
            <p className="text-slate-500 text-xs">Token al → URL'e yükle → doğrula.</p>
          </div>
          {!httpToken ? (
            <button className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-200
              hover:text-white transition-all"
              style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.14)' }}
              onClick={() => getHttpToken.mutate()} disabled={getHttpToken.isPending}>
              {getHttpToken.isPending ? 'Token alınıyor...' : 'Token Al'}
            </button>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Token</p>
                <code className="block rounded-xl p-3 text-xs font-mono break-all text-emerald-400"
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(56,189,248,0.08)' }}>
                  {httpToken}
                </code>
              </div>
              <DarkInput value={httpUrl} onChange={e => setHttpUrl(e.target.value)} />
              <button className="w-full py-2.5 rounded-xl text-sm font-bold text-slate-900 bg-emerald-400 hover:bg-emerald-300 transition-all"
                onClick={() => httpVerifyMut.mutate()} disabled={httpVerifyMut.isPending}>
                {httpVerifyMut.isPending ? 'Doğrulanıyor...' : 'Doğrulamayı Kontrol Et'}
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'dns' && (
        <div className="space-y-4">
          <div className="rounded-xl p-4 text-sm text-violet-400"
            style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}>
            <p className="font-semibold mb-1">DNS TXT Kaydı Doğrulama</p>
            <p className="text-slate-500 text-xs">DNS panel'ine TXT kaydı ekle ve doğrula.</p>
          </div>
          {!dnsInfo ? (
            <button className="w-full py-2.5 rounded-xl text-sm font-semibold text-slate-200
              hover:text-white transition-all"
              style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.14)' }}
              onClick={() => getDnsToken.mutate()} disabled={getDnsToken.isPending}>
              {getDnsToken.isPending ? 'Token alınıyor...' : 'DNS Token Al'}
            </button>
          ) : (
            <>
              <div className="rounded-xl overflow-hidden"
                style={{ border: '1px solid rgba(56,189,248,0.1)' }}>
                {([['Type', 'TXT'], ['Host', dnsInfo.fqdn], ['Value', dnsInfo.value]] as [string, string][]).map(([k, v]) => (
                  <div key={k} className="flex gap-3 px-4 py-2.5 last:border-0"
                    style={{ borderBottom: '1px solid rgba(56,189,248,0.06)', background: 'rgba(0,0,0,0.15)' }}>
                    <span className="text-slate-600 text-xs font-mono w-12 flex-shrink-0 pt-0.5">{k}</span>
                    <span className="text-xs font-mono text-emerald-400 break-all">{v}</span>
                  </div>
                ))}
              </div>
              <button className="w-full py-2.5 rounded-xl text-sm font-bold text-slate-900 bg-emerald-400 hover:bg-emerald-300 transition-all"
                onClick={() => dnsVerifyMut.mutate()} disabled={dnsVerifyMut.isPending}>
                {dnsVerifyMut.isPending ? 'Doğrulanıyor...' : 'DNS Kaydını Doğrula'}
              </button>
            </>
          )}
        </div>
      )}

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-3"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-5 animate-pulse"
      style={{
        background: 'linear-gradient(145deg, #0e1d35 0%, #0b1628 100%)',
        border: '1px solid rgba(56,189,248,0.07)',
      }}>
      <div className="flex gap-2 mb-4">
        <div className="h-6 w-20 rounded-lg" style={{ background: 'rgba(56,189,248,0.05)' }} />
        <div className="h-6 w-16 rounded-lg" style={{ background: 'rgba(56,189,248,0.04)' }} />
      </div>
      <div className="h-5 w-44 rounded-lg mb-4" style={{ background: 'rgba(56,189,248,0.05)' }} />
      <div className="h-4 w-32 rounded-lg" style={{ background: 'rgba(56,189,248,0.03)' }} />
    </div>
  );
}

// ─── Globe Surface Card ───────────────────────────────────────────────────────

function GlobeSurfaceCard({ points, loading }: { points: GlobePoint[]; loading: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.25 }}
      className="rounded-2xl flex flex-col"
      style={{
        background: 'linear-gradient(135deg, #060f1e 0%, #040c1a 100%)',
        border: '1px solid rgba(56,189,248,0.14)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(56,189,248,0.08)' }}>
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
              d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[13px] font-semibold text-slate-200">Global Attack Surface</span>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <span className="text-[10px] text-slate-600 font-mono">locating...</span>
          )}
          <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-md"
            style={{
              background: 'rgba(52,211,153,0.08)',
              color: '#34d399',
              border: '1px solid rgba(52,211,153,0.2)',
            }}>
            <span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />
            LIVE
          </span>
        </div>
      </div>

      {/* Globe — overflow crop for edge-bleed effect */}
      <div className="flex items-center justify-center"
        style={{ height: 300, overflow: 'hidden', background: 'radial-gradient(ellipse 70% 70% at 50% 55%, rgba(56,189,248,0.04) 0%, transparent 70%)' }}>
        <Suspense fallback={
          <div className="flex items-center justify-center w-full h-full">
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: '2px solid rgba(56,189,248,0.15)',
              borderTopColor: '#38bdf8',
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        }>
          <SatelliteGlobe
            points={points}
            width={520}
            height={380}
            autoRotate={true}
            initialLat={points[0]?.lat ?? 20}
            initialLng={points[0]?.lng ?? 10}
          />
        </Suspense>
      </div>

      {/* Footer */}
      <div className="px-5 py-3 flex items-center justify-between flex-shrink-0"
        style={{ borderTop: '1px solid rgba(56,189,248,0.07)' }}>
        <span className="text-[11px] text-slate-600">
          {points.length > 0
            ? `${points.length} sunucu konumu izleniyor · GeoIP`
            : 'Doğrulanmış asset taraması tamamlandığında konumlar görünür'}
        </span>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="flex items-center gap-1" style={{ color: '#38bdf8' }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#38bdf8' }} />
            Domain
          </span>
          <span className="flex items-center gap-1" style={{ color: '#a78bfa' }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#a78bfa' }} />
            IP
          </span>
          <span className="flex items-center gap-1" style={{ color: '#f87171' }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#f87171' }} />
            Critical
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Monitoring Mode Info ─────────────────────────────────────────────────────

function MonitoringModeInfo() {
  const rows = [
    { label: 'Verified Monitoring', desc: 'Aktif tarama açık', color: '#34d399' },
    { label: 'Active Scan', desc: 'Verified asset\'larda çalışır', color: '#38bdf8' },
    { label: 'Passive Lookup', desc: 'Aktif scan olmadan sorgu', color: '#a78bfa', link: '/intelligence/lookup' },
    { label: 'OTX Intelligence', desc: 'AlienVault tehdit istihbaratı', color: '#fbbf24' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.25 }}
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: 'linear-gradient(135deg, #0d1b2e 0%, #0a1628 100%)',
        border: '1px solid rgba(56,189,248,0.1)',
      }}
    >
      <div className="px-5 py-3.5" style={{ borderBottom: '1px solid rgba(56,189,248,0.08)' }}>
        <span className="text-[13px] font-semibold text-slate-200">Monitoring Modes</span>
      </div>
      <div className="flex-1 px-5 py-4 space-y-3">
        {rows.map(row => (
          <div key={row.label} className="flex items-start gap-3">
            <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
              style={{ background: row.color, boxShadow: `0 0 5px ${row.color}80` }} />
            <div className="min-w-0">
              {row.link ? (
                <a href={row.link}
                  className="text-[12px] font-semibold text-slate-300 hover:text-slate-100 transition-colors underline underline-offset-2 decoration-slate-700">
                  {row.label}
                </a>
              ) : (
                <p className="text-[12px] font-semibold text-slate-300">{row.label}</p>
              )}
              <p className="text-[10px] text-slate-600 mt-0.5">{row.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const gridVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.06 } },
};

export function AssetsPage() {
  const [showAdd, setShowAdd]         = useState(false);
  const [verifyAsset, setVerifyAsset] = useState<Asset | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['assets'],
    queryFn: () => getAssets(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAsset(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });

  const handleDelete = (asset: Asset) => {
    if (confirm(`"${asset.value}" silinsin mi? Bu işlem geri alınamaz.`)) {
      deleteMut.mutate(asset.id);
    }
  };

  const stats = data ? {
    total:    data.total,
    verified: data.items.filter(a => a.status === 'VERIFIED').length,
    pending:  data.items.filter(a => a.status === 'PENDING').length,
    critical: data.items.filter(a => a.critical).length,
    domains:  data.items.filter(a => a.type === 'DOMAIN').length,
    ips:      data.items.filter(a => a.type === 'IP').length,
  } : null;

  // GeoIP for globe — only verified assets have scan data
  const verifiedAssets = data?.items.filter(a => a.status === 'VERIFIED') ?? [];
  const intelligenceQueries = useQueries({
    queries: verifiedAssets.map(asset => ({
      queryKey: ['intelligence', asset.id],
      queryFn: () => getAssetIntelligence(asset.id),
      staleTime: 5 * 60 * 1000,
      enabled: !!data && verifiedAssets.length > 0,
    })),
  });

  const globeLoading = intelligenceQueries.some(q => q.isLoading);
  const globePoints: GlobePoint[] = intelligenceQueries.flatMap((q, i) => {
    const geoip = q.data?.geoip;
    const asset = verifiedAssets[i];
    if (!geoip?.latitude || !geoip?.longitude || !asset) return [];
    return [{
      lat: geoip.latitude,
      lng: geoip.longitude,
      name: asset.value,
      location: [geoip.city, geoip.country].filter(Boolean).join(', '),
      label: `<b>${asset.value}</b><br/>${[geoip.city, geoip.country].filter(Boolean).join(', ')}<br/>${geoip.isp ?? ''}`,
      color: asset.type === 'DOMAIN' ? '#38bdf8' : '#a78bfa',
      critical: asset.critical,
    }];
  });

  return (
    <div className="relative min-h-full">
      <div className="relative p-8 max-w-7xl mx-auto space-y-6">

        {/* ── Hero Panel ── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className="rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #0d1b2e 0%, #0a1628 60%, #0d1525 100%)',
            border: '1px solid rgba(56,189,248,0.12)',
            boxShadow: '0 0 0 1px rgba(56,189,248,0.04), 0 24px 48px rgba(0,0,0,0.4)',
          }}
        >
          {/* Top accent line */}
          <div className="h-px w-full" style={{
            background: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.5), rgba(52,211,153,0.3), transparent)',
          }} />

          <div className="p-6 flex flex-col lg:flex-row gap-6">
            {/* Left: info */}
            <div className="flex-1 min-w-0">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"
                  style={{ boxShadow: '0 0 6px rgba(52,211,153,0.8)' }} />
                <span className="text-[10px] font-semibold text-emerald-600 tracking-widest uppercase">
                  Monitoring
                </span>
                <span className="text-slate-700 text-xs">/</span>
                <span className="text-[10px] text-slate-600 font-mono">verified_assets</span>
              </div>

              <h1 className="text-[26px] font-black tracking-tight leading-tight mb-2"
                style={{ color: '#f1f5f9' }}>
                Verified Asset Monitoring
              </h1>
              <p className="text-sm text-slate-500 leading-relaxed max-w-lg mb-4">
                Sahip olduğunuz domain ve IP varlıklarını doğrulayarak aktif güvenlik
                kontrolleriyle sürekli izleyin.
              </p>

              {/* Mode badges */}
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(52,211,153,0.08)', color: '#34d399', border: '1px solid rgba(52,211,153,0.18)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Verified Monitoring
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                  style={{ background: 'rgba(56,189,248,0.06)', color: '#38bdf8', border: '1px solid rgba(56,189,248,0.15)' }}>
                  Active Scan: Enabled
                </span>
                <a href="/intelligence/lookup"
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-all"
                  style={{ background: 'rgba(167,139,250,0.06)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.14)' }}>
                  Passive Lookup →
                </a>
              </div>

              {/* CTA */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold
                  text-slate-900 bg-emerald-400 hover:bg-emerald-300
                  shadow-lg shadow-emerald-500/20 transition-colors duration-150"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Asset Ekle
              </motion.button>
            </div>

            {/* Right: Operations Summary Panel */}
            <div className="lg:w-56 flex-shrink-0 rounded-xl p-4 flex flex-col gap-0"
              style={{
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(56,189,248,0.1)',
              }}>
              {/* System status */}
              <div className="flex items-center justify-between pb-3"
                style={{ borderBottom: '1px solid rgba(56,189,248,0.07)' }}>
                <span className="text-[10px] text-slate-600 uppercase tracking-widest font-mono">
                  System
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
                    style={{ boxShadow: '0 0 5px rgba(52,211,153,0.8)' }} />
                  ONLINE
                </span>
              </div>

              {/* Stats rows */}
              {[
                { label: 'Monitored Assets', value: stats?.total ?? '—', color: '#e2e8f0' },
                { label: 'Verified', value: stats?.verified ?? '—', color: '#34d399' },
                { label: 'Pending', value: stats?.pending ?? '—', color: '#fbbf24' },
                { label: 'Critical Flags', value: stats?.critical ?? '—', color: stats?.critical ? '#f87171' : undefined },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-2.5"
                  style={{ borderBottom: '1px solid rgba(56,189,248,0.05)' }}>
                  <span className="text-[11px] text-slate-500">{row.label}</span>
                  <span className="text-[14px] font-black tabular-nums"
                    style={{ color: row.color ?? '#64748b' }}>
                    {row.value}
                  </span>
                </div>
              ))}

              <div className="flex items-center justify-between py-2.5"
                style={{ borderBottom: '1px solid rgba(56,189,248,0.05)' }}>
                <span className="text-[11px] text-slate-500">Passive Intel</span>
                <span className="text-[11px] font-mono" style={{ color: '#38bdf8' }}>Available</span>
              </div>

              <div className="flex items-center justify-between pt-2.5">
                <span className="text-[11px] text-slate-500">Surface Map</span>
                <span className="text-[11px] font-black tabular-nums" style={{ color: '#34d399' }}>
                  {globePoints.length > 0 ? `${globePoints.length} pin` : 'LIVE'}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Stats ── */}
        {stats && <AssetOverviewStats {...stats} />}

        {/* ── Globe + Monitoring Modes ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3">
            <GlobeSurfaceCard points={globePoints} loading={globeLoading} />
          </div>
          <div className="lg:col-span-2">
            <MonitoringModeInfo />
          </div>
        </div>

        {/* ── Section divider ── */}
        <div className="flex items-center gap-3 pt-1">
          <span className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: 'rgba(56,189,248,0.4)' }}>
            Asset Envanteri
          </span>
          {data && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-mono"
              style={{
                background: 'rgba(56,189,248,0.05)',
                color: 'rgba(56,189,248,0.4)',
                border: '1px solid rgba(56,189,248,0.1)',
              }}>
              {data.total}
            </span>
          )}
          <div className="flex-1 h-px" style={{ background: 'rgba(56,189,248,0.07)' }} />
          {data && data.items.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] text-slate-700 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-700" />
                {data.items.filter(a => a.status === 'VERIFIED').length} verified
              </span>
              <span className="text-slate-800 text-xs">·</span>
              <span className="flex items-center gap-1 text-[11px] text-slate-700 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-800" />
                {data.items.filter(a => a.status === 'PENDING').length} pending
              </span>
            </div>
          )}
        </div>

        {/* ── Loading ── */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* ── Error ── */}
        {error && (() => {
          const axiosErr = error as { response?: { status?: number; data?: { message?: string } }; code?: string; message?: string };
          const isNetwork = !axiosErr.response;
          return (
            <div className="flex items-start gap-3 px-5 py-4 rounded-2xl"
              style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-red-400 mb-1">Asset'ler yüklenemedi</p>
                <p className="text-xs text-slate-600">
                  {isNetwork
                    ? `API'ye ulaşılamıyor — localhost:3000 çalışıyor mu? (${axiosErr.code ?? axiosErr.message})`
                    : (axiosErr.response?.data?.message ?? 'Bilinmeyen hata')}
                </p>
                <button onClick={() => void refetch()}
                  className="mt-2 text-xs text-red-400 hover:text-red-300 underline underline-offset-2 transition-colors">
                  Tekrar dene
                </button>
              </div>
            </div>
          );
        })()}

        {/* ── Empty state ── */}
        {!isLoading && !error && data?.items.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 rounded-2xl text-center"
            style={{ border: '1px dashed rgba(56,189,248,0.1)' }}
          >
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.14)' }}>
              <svg className="w-8 h-8 text-emerald-500/50" fill="none" viewBox="0 0 24 24"
                stroke="currentColor" strokeWidth={1.25}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-slate-200 font-semibold mb-1.5">Henüz asset yok</p>
            <p className="text-sm text-slate-600 mb-7 max-w-xs leading-relaxed">
              İlk domain veya IP'yi ekleyerek saldırı yüzeyi izlemeye başlayın.
            </p>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold
                text-slate-900 bg-emerald-400 hover:bg-emerald-300
                shadow-lg shadow-emerald-500/20 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              İlk Asset'i Ekle
            </button>
          </motion.div>
        )}

        {/* ── Asset grid ── */}
        {data && data.items.length > 0 && (
          <>
            <motion.div
              variants={gridVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
            >
              {data.items.map(asset => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  onVerify={setVerifyAsset}
                  onDelete={handleDelete}
                  isDeleting={deleteMut.isPending && deleteMut.variables === asset.id}
                />
              ))}
            </motion.div>

            {data.total > data.limit && (
              <p className="text-center text-xs text-slate-700 pt-2 font-mono">
                İlk {data.limit} / {data.total} kayıt gösteriliyor
              </p>
            )}
          </>
        )}

        {/* ── Modals ── */}
        <AnimatePresence>
          {showAdd     && <AddAssetModal onClose={() => setShowAdd(false)} />}
          {verifyAsset && <VerifyModal asset={verifyAsset} onClose={() => setVerifyAsset(null)} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
