// Public Web Intelligence API client.
//
// Backend endpoint'leri:
//   POST   /visual-analysis/public
//   GET    /visual-analysis/public?limit=
//   GET    /visual-analysis/public/:runId
//   GET    /visual-analysis/public/:runId/screenshot  (PNG stream, JWT zorunlu)

import { apiClient } from './client';
import type { PublicVisualAnalysisRun } from '../types/visualAnalysis';

export function createPublicVisualAnalysis(url: string): Promise<PublicVisualAnalysisRun> {
  return apiClient
    .post<PublicVisualAnalysisRun>('/visual-analysis/public', { url })
    .then((r) => r.data);
}

export function getPublicVisualAnalysis(runId: string): Promise<PublicVisualAnalysisRun> {
  return apiClient
    .get<PublicVisualAnalysisRun>(`/visual-analysis/public/${runId}`)
    .then((r) => r.data);
}

export function listPublicVisualAnalysis(limit = 20): Promise<PublicVisualAnalysisRun[]> {
  return apiClient
    .get<PublicVisualAnalysisRun[]>('/visual-analysis/public', { params: { limit } })
    .then((r) => r.data);
}

// Screenshot endpoint Authorization header gerektirir → düz <img src> çalışmaz.
// axios responseType='blob' ile fetch ediyoruz; çağıran taraf
// URL.createObjectURL(blob) ile <img>'e atar ve unmount'ta revoke eder.
export function getPublicVisualScreenshotBlob(runId: string): Promise<Blob> {
  return apiClient
    .get<Blob>(`/visual-analysis/public/${runId}/screenshot`, { responseType: 'blob' })
    .then((r) => r.data);
}
