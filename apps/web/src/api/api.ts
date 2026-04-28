import { apiClient } from './client';
import type { Asset, Finding, Paginated, ScanRun } from '../types';

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

// ─── Scans ───────────────────────────────────────────────────────────────────

export const runNow = (assetId: string) =>
  apiClient.post<{ ok: boolean; scanRunId: string; status: string }>('/scans/run-now', null, { params: { assetId } }).then(r => r.data);

export const getScanHistory = (assetId: string) =>
  apiClient.get<ScanRun[]>('/scans/history', { params: { assetId } }).then(r => r.data);

// ─── Findings ────────────────────────────────────────────────────────────────

export const getFindings = (
  assetId: string,
  filters?: { severity?: string; resolved?: string; isNew?: string; page?: number; limit?: number },
) =>
  apiClient.get<Paginated<Finding>>('/findings', { params: { assetId, ...filters } }).then(r => r.data);

export const ackFinding = (id: string) =>
  apiClient.patch<Finding>(`/findings/${id}/ack`).then(r => r.data);
