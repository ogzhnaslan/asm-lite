import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAsset, deleteAsset, runNow, getScanHistory, getFindings, ackFinding,
  setCritical, updateScanInterval,
} from '../api/api';
import { Spinner } from '../components/Spinner';
import { SeverityBadge, ScanStatusBadge } from '../components/Badge';
import type { FindingSeverity, ScanStatus } from '../types';

import { SCAN_INTERVALS } from '@asm/shared';

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'findings' | 'history'>('findings');
  const [severityFilter, setSeverityFilter] = useState('');
  const [resolvedFilter, setResolvedFilter] = useState('');
  const [isNewFilter, setIsNewFilter] = useState('');
  const [findingsPage, setFindingsPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scanQueued, setScanQueued] = useState(false);

  const assetQ = useQuery({ queryKey: ['asset', id], queryFn: () => getAsset(id!) });
  const asset = assetQ.data;

  const scansQ = useQuery({
    queryKey: ['scans', id],
    queryFn: () => getScanHistory(id!),
    enabled: tab === 'history',
    refetchInterval: (q) => {
      const runs = q.state.data;
      if (!runs) return false;
      return runs.some(r => r.status === 'RUNNING') ? 3000 : false;
    },
  });

  const findingsQ = useQuery({
    queryKey: ['findings', id, severityFilter, resolvedFilter, isNewFilter, findingsPage],
    queryFn: () => getFindings(id!, {
      severity: severityFilter || undefined,
      resolved: resolvedFilter || undefined,
      isNew: isNewFilter || undefined,
      page: findingsPage,
      limit: 20,
    }),
    enabled: tab === 'findings',
  });

  const runNowMut = useMutation({
    mutationFn: () => runNow(id!),
    onSuccess: () => {
      setScanQueued(true);
      setTab('history');
      setTimeout(() => setScanQueued(false), 4000);
      qc.invalidateQueries({ queryKey: ['scans', id] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteAsset(id!),
    onSuccess: () => navigate('/assets'),
  });

  const criticalMut = useMutation({
    mutationFn: (v: boolean) => setCritical(id!, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['asset', id] }),
  });

  const intervalMut = useMutation({
    mutationFn: (v: string) => updateScanInterval(id!, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['asset', id] }),
  });

  const ackMut = useMutation({
    mutationFn: (fid: string) => ackFinding(fid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['findings', id] }),
  });

  if (assetQ.isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="p-8 text-slate-500">Asset bulunamadı. <Link to="/assets" className="text-blue-600 hover:underline">Geri dön</Link></div>
    );
  }

  const findings = findingsQ.data;
  const scans = scansQ.data;
  const totalFindingPages = findings ? Math.ceil(findings.total / 20) : 1;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Scan queued notification */}
      {scanQueued && (
        <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-800 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
          <Spinner size="sm" />
          Tarama kuyruğa eklendi — sonuçlar geldiğinde görünecek.
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <Link to="/assets" className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-block">
          ← Assets
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{asset.value}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-semibold">{asset.type}</span>
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${asset.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {asset.status}
              </span>
              {asset.critical && (
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-semibold">CRITICAL</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => runNowMut.mutate()}
              disabled={runNowMut.isPending || asset.status !== 'VERIFIED'}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {runNowMut.isPending ? <Spinner size="sm" /> : 'Şimdi Tara'}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-sm font-medium rounded-lg border border-red-200 transition-colors"
            >
              Sil
            </button>
          </div>
        </div>
      </div>

      {/* Settings row */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 flex flex-wrap gap-6">
        <div>
          <p className="text-xs text-slate-500 mb-1 font-medium">Tarama Aralığı</p>
          <div className="flex gap-1">
            {SCAN_INTERVALS.map(iv => (
              <button
                key={iv}
                onClick={() => intervalMut.mutate(iv)}
                disabled={intervalMut.isPending}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                  asset.scanInterval === iv
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {iv}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1 font-medium">Kritik Asset</p>
          <button
            onClick={() => criticalMut.mutate(!asset.critical)}
            disabled={criticalMut.isPending}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
              asset.critical
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {asset.critical ? 'Kritik ✓' : 'Kritik Değil'}
          </button>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-slate-500">Eklenme</p>
          <p className="text-sm text-slate-700">{new Date(asset.createdAt).toLocaleDateString('tr-TR')}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-4">
        {(['findings', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'findings' ? 'Bulgular' : 'Tarama Geçmişi'}
          </button>
        ))}
      </div>

      {/* Findings tab */}
      {tab === 'findings' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={severityFilter}
              onChange={e => { setSeverityFilter(e.target.value); setFindingsPage(1); }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tüm Seviyeler</option>
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as FindingSeverity[]).map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              value={resolvedFilter}
              onChange={e => { setResolvedFilter(e.target.value); setFindingsPage(1); }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tümü</option>
              <option value="false">Aktif</option>
              <option value="true">Çözüldü</option>
            </select>
            <select
              value={isNewFilter}
              onChange={e => { setIsNewFilter(e.target.value); setFindingsPage(1); }}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tümü</option>
              <option value="true">Yeni</option>
              <option value="false">Eski</option>
            </select>
            {(severityFilter || resolvedFilter || isNewFilter) && (
              <button
                onClick={() => { setSeverityFilter(''); setResolvedFilter(''); setIsNewFilter(''); setFindingsPage(1); }}
                className="text-sm text-slate-500 hover:text-slate-700 px-2"
              >
                Temizle
              </button>
            )}
          </div>

          {findingsQ.isLoading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : !findings || findings.items.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-lg">Bulgu bulunamadı</p>
              <p className="text-sm mt-1">Filtrelerinizi değiştirmeyi deneyin veya tarama başlatın</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {findings.items.map(f => (
                  <FindingCard key={f.id} finding={f} onAck={() => ackMut.mutate(f.id)} acking={ackMut.isPending} />
                ))}
              </div>
              {totalFindingPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-slate-500">{findings.total} bulgu, sayfa {findingsPage}/{totalFindingPages}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFindingsPage(p => Math.max(1, p - 1))}
                      disabled={findingsPage === 1}
                      className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 hover:bg-slate-50"
                    >
                      Önceki
                    </button>
                    <button
                      onClick={() => setFindingsPage(p => Math.min(totalFindingPages, p + 1))}
                      disabled={findingsPage === totalFindingPages}
                      className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg disabled:opacity-50 hover:bg-slate-50"
                    >
                      Sonraki
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div>
          {scansQ.isLoading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : !scans || scans.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <p className="text-lg">Tarama geçmişi yok</p>
              <p className="text-sm mt-1">Asset doğrulandıktan sonra taramalar başlayacak</p>
            </div>
          ) : (
            <div className="space-y-2">
              {scans.map(scan => (
                <ScanRow key={scan.id} scan={scan} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Silmeyi Onayla</h3>
            <p className="text-slate-600 text-sm mb-6">
              <strong>{asset.value}</strong> ve ilgili tüm taramalar ile bulgular kalıcı olarak silinecek.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50">
                İptal
              </button>
              <button
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg disabled:opacity-60"
              >
                {deleteMut.isPending ? 'Siliniyor...' : 'Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FindingCard({ finding, onAck, acking }: {
  finding: import('../types').Finding;
  onAck: () => void;
  acking: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isResolved = finding.resolvedAt !== null;

  return (
    <div className={`bg-white border rounded-xl overflow-hidden transition-all ${isResolved ? 'border-slate-200 opacity-60' : 'border-slate-200 hover:border-slate-300'}`}>
      <div className="flex items-center gap-3 p-4">
        <SeverityBadge severity={finding.severity} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-800">{finding.type}</span>
            {finding.isNew && !isResolved && (
              <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">YENİ</span>
            )}
            {isResolved && (
              <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-medium">ÇÖZÜLDÜ</span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{finding.key}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {finding.aiScore > 0 && (
            <span className="text-xs text-slate-500">AI: {finding.aiScore}/10</span>
          )}
          <button
            onClick={() => setExpanded(v => !v)}
            className="text-slate-400 hover:text-slate-600 text-xs px-2 py-1 rounded hover:bg-slate-100"
          >
            {expanded ? '▲' : '▼'}
          </button>
          {!isResolved && (
            <button
              onClick={onAck}
              disabled={acking}
              className="text-xs px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-medium disabled:opacity-50"
            >
              Onayla
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 p-4 bg-slate-50 space-y-3">
          {finding.aiWhyJson?.summary && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">AI Özeti</p>
              <p className="text-sm text-slate-700">{finding.aiWhyJson.summary}</p>
            </div>
          )}
          {finding.aiWhyJson?.recommendations && finding.aiWhyJson.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-600 mb-1">Öneriler</p>
              <ul className="list-disc list-inside space-y-0.5">
                {finding.aiWhyJson.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-slate-700">{r}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-600 mb-1">Ham Veri</p>
            <pre className="text-xs bg-white border border-slate-200 rounded-lg p-3 overflow-auto max-h-40 text-slate-700">
              {JSON.stringify(finding.dataJson, null, 2)}
            </pre>
          </div>
          <div className="text-xs text-slate-400">
            İlk görülme: {new Date(finding.createdAt).toLocaleString('tr-TR')}
            {finding.resolvedAt && ` · Çözüldü: ${new Date(finding.resolvedAt).toLocaleString('tr-TR')}`}
          </div>
        </div>
      )}
    </div>
  );
}

function ScanRow({ scan }: { scan: import('../types').ScanRun }) {
  const statusColors: Record<ScanStatus, string> = {
    DONE: 'bg-emerald-100 text-emerald-700',
    RUNNING: 'bg-blue-100 text-blue-700',
    FAILED: 'bg-red-100 text-red-700',
  };

  const duration = scan.finishedAt
    ? Math.round((new Date(scan.finishedAt).getTime() - new Date(scan.startedAt).getTime()) / 1000)
    : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4">
      <ScanStatusBadge status={scan.status} />
      <div className="flex-1">
        <p className="text-sm text-slate-700">{new Date(scan.startedAt).toLocaleString('tr-TR')}</p>
        {duration !== null && (
          <p className="text-xs text-slate-400 mt-0.5">{duration}s sürdü</p>
        )}
      </div>
      <div className="text-right">
        <span className={`text-xs px-2 py-0.5 rounded font-semibold ${scan._count.findings > 0 ? 'bg-orange-100 text-orange-700' : 'bg-slate-100 text-slate-500'}`}>
          {scan._count.findings} bulgu
        </span>
      </div>
    </div>
  );
}
