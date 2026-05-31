// Public Web Intelligence — frontend tipleri.
// Backend response'una göre esnek; eksik/null alanlara karşı defansif.

export type PublicVisualStatus = 'RUNNING' | 'DONE' | 'FAILED';

export interface AiVisualSecuritySignal {
  type: string;
  confidence?: number;
  reason?: string;
}

export interface AiVisualAnalysis {
  enabled?: boolean;
  provider?: string | null;
  model?: string | null;
  sitePurpose?: string | null;
  siteCategory?: string | null;
  visualSummary?: string | null;
  visibleElements?: string[];
  userFacingDescription?: string | null;
  pageTone?: string | null;
  targetAudience?: string | null;
  confidence?: number | null;
  securitySignals?: AiVisualSecuritySignal[];
  riskLevel?: string | null;
  securityCommentary?: string | null;
  recommendations?: string[];
  manualVerificationNeeded?: boolean;
  rawText?: string;
  error?: string | null;
  checkedAt?: string;
}

export interface PublicVisualAnalysisRun {
  id: string;
  userId?: string;
  url: string;
  finalUrl?: string | null;
  status: PublicVisualStatus | string;
  statusCode?: number | null;
  screenshotUrl?: string | null;
  title?: string | null;
  metaDescription?: string | null;
  h1Texts?: string[];
  visibleText?: string | null;
  ruleSiteCategory?: string | null;
  rulePurposeSummary?: string | null;
  ruleLanguage?: string | null;
  ruleSignals?: string[];
  ruleRiskLevel?: string | null;
  hasAi?: boolean;
  aiVisualAnalysis?: AiVisualAnalysis | null;
  error?: string | null;
  createdAt?: string;
  updatedAt?: string;
  finishedAt?: string | null;
}

// Backend SSRF reject codes — Türkçe çeviriler için.
export type SsrfErrorCode =
  | 'URL_REQUIRED'
  | 'URL_INVALID'
  | 'PROTOCOL_NOT_ALLOWED'
  | 'HOSTNAME_BLOCKED'
  | 'PRIVATE_IP_BLOCKED'
  | 'DNS_RESOLUTION_FAILED'
  | 'NO_PUBLIC_ADDRESS';

export const SSRF_ERROR_TR: Record<SsrfErrorCode, string> = {
  URL_REQUIRED: 'URL boş olamaz.',
  URL_INVALID: 'Geçerli bir URL girin.',
  PROTOCOL_NOT_ALLOWED: 'Sadece http ve https adresleri analiz edilebilir.',
  HOSTNAME_BLOCKED: 'Bu hedef güvenlik nedeniyle analiz edilemez.',
  PRIVATE_IP_BLOCKED: 'Private/local IP adresleri güvenlik nedeniyle analiz edilemez.',
  DNS_RESOLUTION_FAILED: 'Domain çözümlenemedi.',
  NO_PUBLIC_ADDRESS: 'Public IP adresi bulunamadı.',
};

export function translateSsrfCode(code: string | undefined): string | null {
  if (!code) return null;
  return (SSRF_ERROR_TR as Record<string, string>)[code] ?? null;
}
