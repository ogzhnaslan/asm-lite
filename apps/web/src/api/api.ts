import { apiClient } from './client';
import type {
  Asset, AssistantChatResponse, CreateSqliTargetPayload, Finding, IntelligenceReport,
  Paginated, PassiveLookupAskResponse, PassiveLookupHistoryResponse, PassiveLookupResponse,
  PassiveLookupRun, ScanRun, SqliTarget, UpdateSqliTargetPayload,
} from '../types';

// ─── Auth ────────────────────────────────────────────────────────────────────

export const register = (email: string, password: string) =>
  apiClient.post<{ user: { id: string; email: string }; token: string }>('/auth/register', { email, password }).then(r => r.data);

export const login = (email: string, password: string) =>
  apiClient.post<{ token: string }>('/auth/login', { email, password }).then(r => r.data);

// ─── Assets ──────────────────────────────────────────────────────────────────

export const getAssets = (page = 1, limit = 50) =>
  apiClient.get<Paginated<Asset>>('/assets', { params: { page, limit } }).then(r => r.data);

export const createAsset = (data: { type: 'DOMAIN' | 'IP'; value: string }) =>
  apiClient.post<Asset>('/assets', data).then(r => r.data);

export const getAsset = (id: string) =>
  apiClient.get<Asset>(`/assets/${id}`).then(r => r.data);

export const deleteAsset = (id: string) =>
  apiClient.delete<{ ok: boolean; assetId: string }>(`/assets/${id}`).then(r => r.data);

export const devVerify = (id: string) =>
  apiClient.post<{ ok: boolean; assetId: string; status: string }>(`/assets/${id}/verify/dev`).then(r => r.data);

export const requestHttpToken = (id: string) =>
  apiClient.post<{ assetId: string; token: string; instruction: string }>(`/assets/${id}/verify/request-token`).then(r => r.data);

export const verifyHttp = (id: string, url: string) =>
  apiClient.post<{ ok: boolean; assetId: string; status: string }>(`/assets/${id}/verify/http`, { url }).then(r => r.data);

export const requestDnsToken = (id: string) =>
  apiClient.post<{ assetId: string; token: string; instruction: string; dns: { type: string; host: string; fqdn: string; value: string } }>(`/assets/${id}/verify/request-dns-token`).then(r => r.data);

export const verifyDns = (id: string) =>
  apiClient.post<{ ok: boolean; assetId: string; status: string }>(`/assets/${id}/verify/dns`).then(r => r.data);

export const setCritical = (id: string, critical: boolean) =>
  apiClient.patch<{ ok: boolean; assetId: string; critical: boolean }>(`/assets/${id}/critical`, { critical }).then(r => r.data);

export const updateScanInterval = (id: string, interval: string) =>
  apiClient.patch<{ ok: boolean; assetId: string; scanInterval: string }>(`/assets/${id}/scan-interval`, { interval }).then(r => r.data);

export const getAssetIntelligence = (id: string) =>
  apiClient.get<IntelligenceReport>(`/assets/${id}/intelligence`).then(r => r.data);

// ─── Scans ───────────────────────────────────────────────────────────────────

export const runNow = (assetId: string) =>
  apiClient.post<{ ok: boolean; scanRunId: string; status: string }>('/scans/run-now', null, { params: { assetId } }).then(r => r.data);

// Backend may return ScanRun[] (old) or { items, total, page, limit } (new).
// We always normalise to ScanRun[] so callers don't need to change.
export const getScanHistory = (assetId: string): Promise<ScanRun[]> =>
  apiClient
    .get<ScanRun[] | Paginated<ScanRun>>('/scans/history', { params: { assetId } })
    .then(r => (Array.isArray(r.data) ? r.data : r.data.items));

// ─── Findings ────────────────────────────────────────────────────────────────

export const getFindings = (
  assetId: string,
  filters?: { severity?: string; resolved?: string; isNew?: string; page?: number; limit?: number },
) =>
  apiClient.get<Paginated<Finding>>('/findings', { params: { assetId, ...filters } }).then(r => r.data);

export const ackFinding = (id: string) =>
  apiClient.patch<Finding>(`/findings/${id}/ack`).then(r => r.data);

// Manuel resolve — bulguyu elle kapat. Sorun bir sonraki taramada hâlâ varsa
// worker bulguyu yeniden açar.
export const resolveFinding = (id: string) =>
  apiClient.patch<Finding>(`/findings/${id}/resolve`).then(r => r.data);

// Manuel olarak kapatılmış bir bulguyu yeniden aç.
export const reopenFinding = (id: string) =>
  apiClient.patch<Finding>(`/findings/${id}/reopen`).then(r => r.data);

// ─── Passive Intelligence Lookup ─────────────────────────────────────────────

export const lookupPassiveIntelligence = (target: string) =>
  apiClient
    .get<PassiveLookupResponse>('/intelligence/lookup', { params: { target } })
    .then(r => r.data);

export const getPassiveLookupHistory = (page = 1, limit = 50) =>
  apiClient
    .get<PassiveLookupHistoryResponse>('/intelligence/history', { params: { page, limit } })
    .then(r => r.data);

export const getPassiveLookupHistoryDetail = (id: string) =>
  apiClient
    .get<PassiveLookupRun>(`/intelligence/history/${id}`)
    .then(r => r.data);

export const askPassiveLookupHistory = (id: string, question: string) =>
  apiClient
    .post<PassiveLookupAskResponse>(`/intelligence/history/${id}/ask`, { question })
    .then(r => r.data);

// ─── Assistant ────────────────────────────────────────────────────────────────

export const askAssistant = (assetId: string, message: string) =>
  apiClient.post<AssistantChatResponse>(`/assets/${assetId}/assistant/chat`, { message }).then(r => r.data);

// ─── SQLi Targets ────────────────────────────────────────────────────────────

export const listSqliTargets = (assetId: string) =>
  apiClient.get<SqliTarget[]>(`/assets/${assetId}/sqli-targets`).then(r => r.data);

export const createSqliTarget = (assetId: string, payload: CreateSqliTargetPayload) =>
  apiClient.post<SqliTarget>(`/assets/${assetId}/sqli-targets`, payload).then(r => r.data);

export const updateSqliTarget = (assetId: string, targetId: string, payload: UpdateSqliTargetPayload) =>
  apiClient.patch<SqliTarget>(`/assets/${assetId}/sqli-targets/${targetId}`, payload).then(r => r.data);

export const deleteSqliTarget = (assetId: string, targetId: string) =>
  apiClient.delete<{ ok: true; id: string }>(`/assets/${assetId}/sqli-targets/${targetId}`).then(r => r.data);
