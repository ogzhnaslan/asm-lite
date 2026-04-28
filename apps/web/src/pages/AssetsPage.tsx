import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAssets, createAsset, deleteAsset, devVerify,
  requestHttpToken, verifyHttp, requestDnsToken, verifyDns,
} from '../api/api';
import type { Asset } from '../types';
import { AssetStatusBadge, TypeBadge } from '../components/Badge';
import { Spinner } from '../components/Spinner';

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
    <Modal title="Asset Ekle" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Tür</label>
          <select
            value={type}
            onChange={e => setType(e.target.value as 'DOMAIN' | 'IP')}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="DOMAIN">Domain</option>
            <option value="IP">IP</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            {type === 'DOMAIN' ? 'Domain (örn: example.com)' : 'IPv4 Adresi (örn: 192.168.1.1)'}
          </label>
          <input
            autoFocus
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={type === 'DOMAIN' ? 'example.com' : '192.168.1.1'}
          />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">İptal</button>
          <button
            onClick={() => mut.mutate()}
            disabled={!value.trim() || mut.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {mut.isPending ? 'Ekleniyor...' : 'Ekle'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Verify Modal ─────────────────────────────────────────────────────────────

type VerifyTab = 'dev' | 'http' | 'dns';

function VerifyModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const [tab, setTab] = useState<VerifyTab>('dev');
  const [httpUrl, setHttpUrl] = useState(`https://${asset.value}/.well-known/asm-verify.txt`);
  const [httpToken, setHttpToken] = useState<string | null>(null);
  const [dnsInfo, setDnsInfo] = useState<{ token: string; fqdn: string; value: string } | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const qc = useQueryClient();

  const done = () => { qc.invalidateQueries({ queryKey: ['assets'] }); onClose(); };

  const devMut = useMutation({ mutationFn: () => devVerify(asset.id), onSuccess: done,
    onError: () => setError('Dev bypass başarısız') });

  const getHttpToken = useMutation({
    mutationFn: () => requestHttpToken(asset.id),
    onSuccess: (d) => setHttpToken(d.token),
    onError: () => setError('Token alınamadı'),
  });

  const httpVerifyMut = useMutation({
    mutationFn: () => verifyHttp(asset.id, httpUrl),
    onSuccess: done,
    onError: () => setError('HTTP doğrulama başarısız. Token URL\'de bulunamadı.'),
  });

  const getDnsToken = useMutation({
    mutationFn: () => requestDnsToken(asset.id),
    onSuccess: (d) => setDnsInfo({ token: d.token, fqdn: d.dns.fqdn, value: d.dns.value }),
    onError: () => setError('DNS token alınamadı'),
  });

  const dnsVerifyMut = useMutation({
    mutationFn: () => verifyDns(asset.id),
    onSuccess: done,
    onError: () => setError('DNS TXT kaydı bulunamadı'),
  });

  const tabs: { id: VerifyTab; label: string }[] = [
    { id: 'dev', label: '🧪 Dev Bypass' },
    { id: 'http', label: 'HTTP Dosya' },
    { id: 'dns', label: 'DNS TXT' },
  ];

  return (
    <Modal title={`Doğrula — ${asset.value}`} onClose={onClose}>
      <div className="flex border-b border-slate-200 mb-4 -mx-6 px-6">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(''); setMsg(''); }}
            className={`pb-2 mr-4 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'dev' && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
            Sadece geliştirme ortamında çalışır. Sahiplik doğrulaması atlanır.
          </div>
          <button
            onClick={() => devMut.mutate()}
            disabled={devMut.isPending}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-medium py-2.5 rounded-lg text-sm"
          >
            {devMut.isPending ? 'İşleniyor...' : 'Dev Bypass ile Doğrula'}
          </button>
        </div>
      )}

      {tab === 'http' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Önce token al, sonra aşağıdaki URL'e düz metin olarak kaydet.
          </p>
          {!httpToken ? (
            <button
              onClick={() => getHttpToken.mutate()}
              disabled={getHttpToken.isPending}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white py-2 rounded-lg text-sm"
            >
              {getHttpToken.isPending ? 'Token alınıyor...' : 'Token Al'}
            </button>
          ) : (
            <>
              <div>
                <p className="text-xs text-slate-500 mb-1">Token (dosyaya bu metni yaz):</p>
                <code className="block bg-slate-100 border border-slate-200 rounded p-2 text-xs break-all">{httpToken}</code>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Dosya URL'i:</p>
                <input
                  type="text"
                  value={httpUrl}
                  onChange={e => setHttpUrl(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={() => httpVerifyMut.mutate()}
                disabled={httpVerifyMut.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm"
              >
                {httpVerifyMut.isPending ? 'Kontrol ediliyor...' : 'Doğrulamayı Kontrol Et'}
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'dns' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">DNS paneline TXT kaydı ekle, sonra doğrula.</p>
          {!dnsInfo ? (
            <button
              onClick={() => getDnsToken.mutate()}
              disabled={getDnsToken.isPending}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white py-2 rounded-lg text-sm"
            >
              {getDnsToken.isPending ? 'Token alınıyor...' : 'DNS Token Al'}
            </button>
          ) : (
            <>
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs font-mono">
                <div><span className="text-slate-500">Kayıt:</span> TXT</div>
                <div><span className="text-slate-500">Host:</span> {dnsInfo.fqdn}</div>
                <div><span className="text-slate-500">Değer:</span> {dnsInfo.value}</div>
              </div>
              <button
                onClick={() => dnsVerifyMut.mutate()}
                disabled={dnsVerifyMut.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm"
              >
                {dnsVerifyMut.isPending ? 'Kontrol ediliyor...' : 'DNS Kaydını Doğrula'}
              </button>
            </>
          )}
        </div>
      )}

      {msg && <p className="mt-3 text-sm text-emerald-600">{msg}</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AssetsPage() {
  const [showAdd, setShowAdd] = useState(false);
  const [verifyAsset, setVerifyAsset] = useState<Asset | null>(null);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['assets'],
    queryFn: () => getAssets(),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAsset(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });

  const handleDelete = (asset: Asset) => {
    if (confirm(`"${asset.value}" silinsin mi? Tüm tarama ve bulgu verileri de silinir.`)) {
      deleteMut.mutate(asset.id);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assets</h1>
          <p className="text-slate-500 text-sm mt-0.5">İzlenen domain ve IP adresleri</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <span>+</span> Asset Ekle
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600">
          Veriler yüklenemedi.
        </div>
      )}

      {data && data.items.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <p className="text-slate-500 text-sm">Henüz asset eklenmemiş.</p>
          <button onClick={() => setShowAdd(true)} className="mt-3 text-blue-600 text-sm hover:underline">
            İlk asset'i ekle →
          </button>
        </div>
      )}

      {data && data.items.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Asset</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tür</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Durum</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tarama</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Kritik</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map(asset => (
                <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/assets/${asset.id}`} className="font-medium text-slate-900 hover:text-blue-600 transition-colors">
                      {asset.value}
                    </Link>
                  </td>
                  <td className="px-4 py-3"><TypeBadge type={asset.type} /></td>
                  <td className="px-4 py-3"><AssetStatusBadge status={asset.status} /></td>
                  <td className="px-4 py-3 text-sm text-slate-500">{asset.scanInterval}</td>
                  <td className="px-4 py-3">
                    {asset.critical && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">
                        Kritik
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      {asset.status === 'PENDING' && (
                        <button
                          onClick={() => setVerifyAsset(asset)}
                          className="text-xs font-medium text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          Doğrula
                        </button>
                      )}
                      <Link
                        to={`/assets/${asset.id}`}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Detay
                      </Link>
                      <button
                        onClick={() => handleDelete(asset)}
                        disabled={deleteMut.isPending}
                        className="text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.total > data.limit && (
            <div className="px-4 py-3 border-t border-slate-200 text-sm text-slate-500">
              Toplam {data.total} asset
            </div>
          )}
        </div>
      )}

      {showAdd && <AddAssetModal onClose={() => setShowAdd(false)} />}
      {verifyAsset && <VerifyModal asset={verifyAsset} onClose={() => setVerifyAsset(null)} />}
    </div>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
