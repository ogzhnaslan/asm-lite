import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listSqliTargets,
  createSqliTarget,
  updateSqliTarget,
  deleteSqliTarget,
} from '../../api/api';
import { Spinner } from '../Spinner';
import type { SqliTarget } from '../../types';

interface Props {
  assetId: string;
  assetValue: string;
  verified: boolean;
  onRunScan?: () => void;
  runScanPending?: boolean;
  isScanRunning?: boolean;
}

// ─── Validation (mirrors backend SqliTargetsService.validateFields) ─────────

interface FormState {
  path: string;
  paramName: string;
  paramValue: string;
  enabled: boolean;
}

const initialForm: FormState = { path: '', paramName: '', paramValue: '', enabled: true };

function validate(form: FormState): string | null {
  const path = form.path.trim();
  const name = form.paramName.trim();
  const value = form.paramValue;

  if (!path) return 'Path boş olamaz.';
  if (!path.startsWith('/')) return 'Path "/" ile başlamalı.';
  if (path.length > 256) return 'Path en fazla 256 karakter olabilir.';
  if (path.includes('://') || /https?:\/\//i.test(path)) return 'Path absolute URL içeremez.';
  if (path.includes('..')) return 'Path ".." içeremez.';

  if (!name) return 'Parametre adı boş olamaz.';
  if (name.length > 64) return 'Parametre adı en fazla 64 karakter olabilir.';

  if (typeof value !== 'string') return 'Parametre değeri string olmalı.';
  if (value.length > 256) return 'Parametre değeri en fazla 256 karakter olabilir.';

  return null;
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function InputLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">{children}</p>
  );
}

function TextInput({
  value, onChange, placeholder, mono = false, disabled = false,
}: { value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; disabled?: boolean }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-3 py-2 rounded-lg text-sm text-slate-200 placeholder:text-slate-600 transition-colors ${mono ? 'font-mono' : ''} ${disabled ? 'opacity-50' : ''}`}
      style={{
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid rgba(56,189,248,0.10)',
        outline: 'none',
      }}
      onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(56,189,248,0.30)'; }}
      onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = 'rgba(56,189,248,0.10)'; }}
    />
  );
}

function TargetCard({
  target, onToggle, onDelete, pending,
}: { target: SqliTarget; onToggle: () => void; onDelete: () => void; pending: boolean }) {
  const paramsEntries = Object.entries(target.paramsJson ?? {});

  return (
    <div
      className="rounded-xl p-4 transition-all duration-200"
      style={{
        background: target.enabled
          ? 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)'
          : 'linear-gradient(145deg, #080f1e 0%, #060c18 100%)',
        border: '1px solid rgba(56,189,248,0.08)',
        opacity: target.enabled ? 1 : 0.55,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded font-mono"
              style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.30)', color: '#a5b4fc' }}
            >
              {target.method}
            </span>
            <span className="font-mono text-sm text-slate-200 truncate">{target.path}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Inject: <span className="font-mono text-amber-400 font-semibold">{target.injectParam}</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={onToggle}
            disabled={pending}
            className="text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider transition-all disabled:opacity-40"
            style={target.enabled ? {
              background: 'rgba(34,197,94,0.12)',
              border: '1px solid rgba(34,197,94,0.30)',
              color: '#4ade80',
            } : {
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.10)',
              color: '#64748b',
            }}
          >
            {target.enabled ? 'Aktif' : 'Kapalı'}
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider transition-all disabled:opacity-40"
            style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.20)',
              color: '#f87171',
            }}
          >
            Sil
          </button>
        </div>
      </div>

      {/* Params */}
      {paramsEntries.length > 0 && (
        <div className="rounded-lg px-3 py-2" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <p className="text-[9px] uppercase tracking-wider text-slate-600 mb-1.5">Query Params</p>
          <div className="flex flex-wrap gap-1.5">
            {paramsEntries.map(([k, v]) => (
              <span
                key={k}
                className="font-mono text-[11px] px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.10)', color: '#cbd5e1' }}
              >
                {k}=<span className="text-sky-300">{v}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function SqliTargetsManager({
  assetId, assetValue, verified, onRunScan, runScanPending, isScanRunning,
}: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(initialForm);
  const [error, setError] = useState<string | null>(null);

  const targetsQ = useQuery({
    queryKey: ['sqli-targets', assetId],
    queryFn: () => listSqliTargets(assetId),
    enabled: verified,
    staleTime: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['sqli-targets', assetId] });

  const createMut = useMutation({
    mutationFn: () => createSqliTarget(assetId, {
      method: 'GET',
      path: form.path.trim(),
      paramsJson: { [form.paramName.trim()]: form.paramValue },
      injectParam: form.paramName.trim(),
      enabled: form.enabled,
    }),
    onSuccess: () => {
      setForm(initialForm);
      setError(null);
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } }; message?: string }) => {
      setError(e?.response?.data?.message ?? e?.message ?? 'Hedef eklenirken hata oluştu.');
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      updateSqliTarget(assetId, id, { enabled }),
    onSuccess: invalidate,
    onError: (e: { response?: { data?: { message?: string } } }) => {
      setError(e?.response?.data?.message ?? 'Güncelleme başarısız.');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSqliTarget(assetId, id),
    onSuccess: invalidate,
    onError: (e: { response?: { data?: { message?: string } } }) => {
      setError(e?.response?.data?.message ?? 'Silme başarısız.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = validate(form);
    if (v) { setError(v); return; }
    setError(null);
    createMut.mutate();
  };

  // ─── Asset PENDING — kilit ─────────────────────────────────────────────────

  if (!verified) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{
          background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
          border: '1px solid rgba(245,158,11,0.18)',
        }}
      >
        <div className="mx-auto mb-3 w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
          style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)' }}>
          🔒
        </div>
        <p className="text-sm font-semibold text-amber-400">SQLi test hedefleri yalnızca doğrulanmış assetlerde yönetilebilir.</p>
        <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
          Bu özelliği kullanmak için önce asset sahipliğini DNS TXT veya HTTP dosyası yöntemiyle doğrulayın.
        </p>
      </div>
    );
  }

  const targets = targetsQ.data ?? [];
  const targetCount = targets.length;
  const maxReached = targetCount >= 5;

  const enabledTargetsCount = targets.filter((t) => t.enabled).length;
  const canRunScan = !!onRunScan && enabledTargetsCount > 0;
  const runScanDisabled = runScanPending || isScanRunning || !canRunScan;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-slate-200">SQL Injection Test Hedefleri</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Yalnızca doğrulanmış assetlerde, manuel olarak belirtilen path ve parametreler üzerinde kontrollü SQLi risk testi.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className="text-[10px] font-bold px-2.5 py-1 rounded uppercase tracking-wider"
              style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.18)', color: '#7dd3fc' }}
            >
              {targetCount}/5 hedef
            </span>
            {/* "SQLi Testini Çalıştır" — mevcut /scans/run-now endpoint'ini tetikler.
                Backend tarafında SQLi check zaten full scan içinde çalışır; bu buton
                kullanıcıya SQLi-odaklı bir tetikleme deneyimi sağlar ve panel/finding
                güncellemesini canlı izlemenin kestirme yoludur. */}
            <button
              type="button"
              onClick={() => onRunScan?.()}
              disabled={runScanDisabled}
              title={
                !verified ? 'Asset doğrulanmamış'
                : enabledTargetsCount === 0 ? 'Önce en az 1 aktif hedef ekleyin'
                : isScanRunning ? 'Tarama şu an çalışıyor'
                : 'SQLi testini şimdi çalıştır'
              }
              className="text-xs font-bold px-3.5 py-2 rounded-lg uppercase tracking-wider transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              style={{
                background: runScanDisabled
                  ? 'rgba(34,197,94,0.06)'
                  : 'linear-gradient(135deg, #10b981, #22c55e)',
                color: runScanDisabled ? '#64748b' : '#052e16',
                border: '1px solid ' + (runScanDisabled ? 'rgba(34,197,94,0.18)' : 'rgba(34,197,94,0.40)'),
              }}
            >
              {isScanRunning || runScanPending ? (
                <>
                  <Spinner size="sm" />
                  Test çalışıyor...
                </>
              ) : (
                <>
                  <span>🚀</span>
                  SQLi Testini Çalıştır
                </>
              )}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed mt-2">
          ⚖️ Veri dump, tablo enumeration, login bypass veya destructive payload bu modülde <span className="text-slate-400">yoktur</span>. Sadece "SQL Injection şüphesi" sinyali tespit eder.
        </p>
        {isScanRunning && (
          <div
            className="mt-3 rounded-lg px-3 py-2 text-xs flex items-center gap-2"
            style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.18)', color: '#7dd3fc' }}
          >
            <Spinner size="sm" />
            <span>Tarama çalışıyor — sağdaki canlı panel 3 saniyede bir yenilenir.</span>
          </div>
        )}
      </div>

      {/* Add form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl p-5"
        style={{
          background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
          border: '1px solid rgba(56,189,248,0.10)',
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(56,189,248,0.5)' }}>
          Yeni Hedef Ekle
        </p>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6">
            <InputLabel>Path</InputLabel>
            <TextInput
              value={form.path}
              onChange={(v) => setForm({ ...form, path: v })}
              placeholder="/sqli-lab/product.php"
              mono
              disabled={maxReached}
            />
            <p className="text-[10px] text-slate-600 mt-1.5 font-mono">https://{assetValue}<span className="text-slate-500">{form.path || '/...'}</span></p>
          </div>
          <div className="md:col-span-3">
            <InputLabel>Param Adı</InputLabel>
            <TextInput
              value={form.paramName}
              onChange={(v) => setForm({ ...form, paramName: v })}
              placeholder="id"
              mono
              disabled={maxReached}
            />
          </div>
          <div className="md:col-span-3">
            <InputLabel>Param Değeri</InputLabel>
            <TextInput
              value={form.paramValue}
              onChange={(v) => setForm({ ...form, paramValue: v })}
              placeholder="1"
              mono
              disabled={maxReached}
            />
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              disabled={maxReached}
              className="rounded accent-sky-400"
            />
            Eklendikten sonra aktif olarak başlasın
          </label>

          <button
            type="submit"
            disabled={createMut.isPending || maxReached}
            className="text-xs font-bold px-4 py-2 rounded-lg uppercase tracking-wider transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #7c3aed)',
              color: 'white',
              border: '1px solid rgba(56,189,248,0.40)',
            }}
          >
            {createMut.isPending ? 'Ekleniyor...' : maxReached ? 'Maks 5 hedef' : '+ Hedef Ekle'}
          </button>
        </div>

        {error && (
          <div
            className="mt-3 rounded-lg px-3 py-2 text-xs flex items-center gap-2"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.20)', color: '#f87171' }}
          >
            <span>⚠️</span> {error}
            <button type="button" onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">✕</button>
          </div>
        )}
      </form>

      {/* List */}
      {targetsQ.isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="md" /></div>
      ) : targetsQ.isError ? (
        <div
          className="rounded-2xl p-6 text-center text-sm"
          style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', color: '#f87171' }}
        >
          Hedefler yüklenirken hata oluştu.
        </div>
      ) : targets.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: 'rgba(56,189,248,0.04)', border: '1px dashed rgba(56,189,248,0.18)' }}
        >
          <div className="text-3xl mb-2">🎯</div>
          <p className="text-sm font-semibold text-slate-400">Henüz SQLi hedefi eklenmedi.</p>
          <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
            Test etmek istediğiniz path ve parametreyi ekleyin. Tarama sırasında bu hedeflere kontrollü probe gönderilir.
          </p>
          <p className="text-[11px] text-slate-600 mt-3 font-mono">
            örn. path=<span className="text-slate-400">/sqli-lab/product.php</span>, param=<span className="text-slate-400">id</span>, value=<span className="text-slate-400">1</span>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {targets.map((t) => (
            <TargetCard
              key={t.id}
              target={t}
              onToggle={() => toggleMut.mutate({ id: t.id, enabled: !t.enabled })}
              onDelete={() => {
                if (confirm(`"${t.path}" hedefini silmek istediğinize emin misiniz?`)) {
                  deleteMut.mutate(t.id);
                }
              }}
              pending={toggleMut.isPending || deleteMut.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
