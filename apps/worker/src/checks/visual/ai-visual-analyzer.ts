// Visual Website Analyzer — AI vision katmanı.
//
// Screenshot dosyasını okur, base64'e çevirir ve seçilen AI vision sağlayıcısına
// (şu an yalnızca Ollama) gönderir. Sağlayıcının döndürdüğü JSON'u parse edip
// güvenli, defensive `AiVisualAnalysisResult` üretir.
//
// Garanti: Bu fonksiyon hiçbir koşulda throw etmez. Hata durumunda
// `aiVisualAnalysis.error` doldurularak güvenli null-benzeri sonuç döner.
// `checkVisualAnalysis` orchestrator'ı patlatmamak için ana sözleşme budur.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

import type {
  AiVisualAnalysisResult,
  AiVisualProvider,
  AiVisualSecuritySignal,
  AiVisualSiteCategory,
  AiVisualPageContext,
  VisualRiskLevel,
} from './visual-types';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000;
const RAW_TEXT_MAX = 4_000;

const VALID_SITE_CATEGORIES: AiVisualSiteCategory[] = [
  'corporate',
  'portfolio',
  'ecommerce',
  'blog_news',
  'web_app',
  'landing_page',
  'admin_panel',
  'login_admin',
  'default_server_page',
  'error_page',
  'empty_page',
  'unknown',
];

const VALID_SIGNAL_TYPES = new Set([
  'LOGIN_PANEL_VISIBLE',
  'ADMIN_PANEL_VISIBLE',
  'DEFAULT_SERVER_PAGE_VISIBLE',
  'ERROR_PAGE_VISIBLE',
  'EMPTY_PAGE_DETECTED',
  'NONE',
]);

const VALID_RISK_LEVELS: VisualRiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AnalyzeScreenshotInput {
  screenshotPath: string | null;
  pageContext: AiVisualPageContext;
  provider: AiVisualProvider | string | null;
  baseUrl: string | null;
  model: string | null;
  timeoutMs?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function emptyResult(): AiVisualAnalysisResult {
  return {
    enabled: false,
    provider: null,
    model: null,
    sitePurpose: null,
    siteCategory: null,
    visualSummary: null,
    visibleElements: [],
    userFacingDescription: null,
    pageTone: null,
    targetAudience: null,
    confidence: null,
    securitySignals: [],
    riskLevel: null,
    securityCommentary: null,
    recommendations: [],
    manualVerificationNeeded: false,
    checkedAt: now(),
  };
}

function errorResult(
  provider: string | null,
  model: string | null,
  error: string,
  rawText?: string,
): AiVisualAnalysisResult {
  return {
    enabled: true,
    provider,
    model,
    sitePurpose: null,
    siteCategory: null,
    visualSummary: null,
    visibleElements: [],
    userFacingDescription: null,
    pageTone: null,
    targetAudience: null,
    confidence: null,
    securitySignals: [],
    riskLevel: null,
    securityCommentary: null,
    recommendations: [],
    manualVerificationNeeded: true,
    ...(rawText ? { rawText: truncateRawText(rawText) } : {}),
    error,
    checkedAt: now(),
  };
}

function truncateRawText(text: string): string {
  if (text.length <= RAW_TEXT_MAX) return text;
  return text.slice(0, RAW_TEXT_MAX);
}

// Markdown code fence (```json ... ``` veya ``` ... ```) içindeki JSON'u söker.
// Birden fazla bloğa karşı sadece ilk JSON bloğunu döner.
export function stripJsonCodeFence(text: string): string {
  if (!text) return text;
  const trimmed = text.trim();
  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/i;
  const match = trimmed.match(fenceRegex);
  if (match && match[1]) {
    return match[1].trim();
  }
  return trimmed;
}

// JSON parse — başarısız olursa null döner, throw etmez.
export function safeJsonParse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ─── Defensive normalizers ────────────────────────────────────────────────────

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function normalizeSiteCategory(v: unknown): AiVisualSiteCategory | null {
  if (typeof v !== 'string') return null;
  const lower = v.trim().toLowerCase();
  return (VALID_SITE_CATEGORIES as string[]).includes(lower) ? (lower as AiVisualSiteCategory) : 'unknown';
}

function normalizeRiskLevel(v: unknown): VisualRiskLevel | null {
  if (typeof v !== 'string') return null;
  const upper = v.trim().toUpperCase();
  return (VALID_RISK_LEVELS as string[]).includes(upper) ? (upper as VisualRiskLevel) : null;
}

function normalizeSecuritySignals(v: unknown): AiVisualSecuritySignal[] {
  if (!Array.isArray(v)) return [];
  const out: AiVisualSecuritySignal[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const type = typeof obj.type === 'string' && VALID_SIGNAL_TYPES.has(obj.type) ? obj.type : null;
    if (!type) continue;
    const confidenceRaw = typeof obj.confidence === 'number' ? obj.confidence : Number(obj.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.max(0, Math.min(1, confidenceRaw))
      : 0;
    const reason = typeof obj.reason === 'string' ? obj.reason : '';
    out.push({ type, confidence, reason });
  }
  return out;
}

function normalizeManualVerificationNeeded(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.trim().toLowerCase() === 'true';
  return false;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildPrompt(pageContext: AiVisualPageContext): string {
  const sample = pageContext.visibleTextSample
    ? pageContext.visibleTextSample.slice(0, 1500)
    : '(metin örneği yok)';
  const h1 = pageContext.h1Texts.length > 0 ? pageContext.h1Texts.slice(0, 5).join(' | ') : '(yok)';
  const ruleSignals = pageContext.ruleBasedSignals.length > 0
    ? pageContext.ruleBasedSignals.join(', ')
    : '(yok)';

  // Prompt prensibi: Birincil görev "bu site ne işe yarıyor" cevabını üretmek.
  // Güvenlik yorumu yan veri; ön planda değil. Promptu schema-as-value bug'ından
  // kurtarmak için enum değerleri ayrı bir alt satırda kısa-kısa listelendi
  // ve "tek bir değer seç" talimatı eklendi. Smoke testte llava prompt'taki
  // "a | b | c" satırını değer olarak geri vermişti — şimdi her enum tek satır.
  return [
    'Sen bir web sayfası analiz asistanısın.',
    'Sana bir web sayfasının ekran görüntüsü ve sayfa metadatası verilecek.',
    '',
    'BİRİNCİL GÖREV: Bu site ne işe yarıyor? Kullanıcıya gösterilebilecek, sade ve akıcı bir Türkçe açıklama üret.',
    'İKİNCİL GÖREV: Görselde dikkat çeken güvenlik sinyalleri varsa kısa not düş — bu yan veri, ana odak değil.',
    '',
    'DİL: Türkçe, akıcı, kullanıcıya gösterilebilir kalite. Tutarsız ifadeler veya bozuk dilbilgisi kullanma.',
    'TON: Açıklayıcı, tarafsız, "görsel olarak ... gibi görünüyor" tonunda.',
    'YASAK: "hacklendi", "açık var", "exploit edilebilir" gibi kesin yargılar. Saldırı/exploit/form-deneme önerisi.',
    'ZORUNLU: Cevabı SADECE geçerli JSON olarak ver. Açıklama, kod bloğu, markdown, yorum ekleme.',
    '',
    'Sayfa bağlamı:',
    `- URL: ${pageContext.url ?? '(bilinmiyor)'}`,
    `- Nihai URL: ${pageContext.finalUrl ?? '(bilinmiyor)'}`,
    `- Title: ${pageContext.title ?? '(yok)'}`,
    `- Meta description: ${pageContext.metaDescription ?? '(yok)'}`,
    `- H1: ${h1}`,
    `- Kural-tabanlı kategori: ${pageContext.ruleBasedCategory ?? '(yok)'}`,
    `- Kural-tabanlı sinyaller: ${ruleSignals}`,
    `- Kural-tabanlı risk: ${pageContext.ruleBasedRiskLevel ?? '(yok)'}`,
    '',
    'Görünür metin örneği:',
    sample,
    '',
    'JSON şeması — her alandan TEK BİR DEĞER üret, enum seçeneklerini olduğu gibi geri verme:',
    '{',
    '  "sitePurpose": "Bu site ne için kullanılıyor? 1-2 cümle Türkçe.",',
    '  "siteCategory": "Aşağıdaki listeden tam olarak BİR tane seç: corporate, portfolio, ecommerce, blog_news, web_app, landing_page, admin_panel, login_admin, default_server_page, error_page, empty_page, unknown",',
    '  "visualSummary": "Ekrandaki arayüzün ne gösterdiğine dair 2-3 cümle Türkçe görsel özet.",',
    '  "visibleElements": ["en az 5 öğe listele: navbar, başlık, logo, buton, form, kart, footer, vb."],',
    '  "userFacingDescription": "Sıradan bir kullanıcıya bu sitenin ne yaptığını anlatan 1 cümle, sade Türkçe.",',
    '  "pageTone": "Şunlardan BİR tane seç: profesyonel, teknik, kişisel, ticari, sade, modern, bilinmiyor",',
    '  "targetAudience": "Bu site kime hitap ediyor? Kısa Türkçe ifade.",',
    '  "confidence": 0.0,',
    '  "securitySignals": [',
    '    { "type": "Şunlardan biri: LOGIN_PANEL_VISIBLE, ADMIN_PANEL_VISIBLE, DEFAULT_SERVER_PAGE_VISIBLE, ERROR_PAGE_VISIBLE, EMPTY_PAGE_DETECTED, NONE", "confidence": 0.0, "reason": "Türkçe gerekçe." }',
    '  ],',
    '  "riskLevel": "LOW veya MEDIUM veya HIGH veya CRITICAL — bir tane seç",',
    '  "securityCommentary": "Görsel güvenlik gözlemleri (varsa) Türkçe, manuel doğrulama önerisi tonunda.",',
    '  "recommendations": ["Türkçe öneri 1", "Türkçe öneri 2"],',
    '  "manualVerificationNeeded": true',
    '}',
    '',
    'confidence değeri 0.0 ile 1.0 arasında bir ondalık olmalı (örn 0.7).',
    'Yalnızca JSON, başka hiçbir şey yok.',
  ].join('\n');
}

// ─── Image reader ─────────────────────────────────────────────────────────────

async function readImageAsBase64(screenshotPath: string): Promise<string> {
  const buf = await fs.readFile(path.resolve(screenshotPath));
  return buf.toString('base64');
}

// ─── Ollama adapter ───────────────────────────────────────────────────────────

interface OllamaCallInput {
  baseUrl: string;
  model: string;
  prompt: string;
  imageBase64: string;
  timeoutMs: number;
}

async function callOllama(input: OllamaCallInput): Promise<string> {
  const url = input.baseUrl.replace(/\/+$/, '') + '/api/generate';
  const body = {
    model: input.model,
    prompt: input.prompt,
    images: [input.imageBase64],
    stream: false,
    format: 'json',
  };

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`OLLAMA_HTTP_${res.status}`);
    }
    const payload = (await res.json()) as { response?: unknown };
    if (typeof payload.response !== 'string') {
      throw new Error('OLLAMA_INVALID_RESPONSE');
    }
    return payload.response;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function analyzeScreenshotWithAi(
  input: AnalyzeScreenshotInput,
): Promise<AiVisualAnalysisResult> {
  const provider = (input.provider ?? '').toString().trim().toLowerCase();
  const model = input.model ?? null;
  const timeoutMs = input.timeoutMs && input.timeoutMs > 0 ? input.timeoutMs : DEFAULT_TIMEOUT_MS;

  if (!input.screenshotPath) {
    return errorResult(provider || null, model, 'NO_SCREENSHOT');
  }
  if (!provider) {
    return errorResult(null, model, 'NO_PROVIDER');
  }
  if (!input.baseUrl) {
    return errorResult(provider, model, 'NO_BASE_URL');
  }
  if (!model) {
    return errorResult(provider, null, 'NO_MODEL');
  }

  // 1. Image read
  let imageBase64: string;
  try {
    imageBase64 = await readImageAsBase64(input.screenshotPath);
  } catch (err) {
    return errorResult(provider, model, `IMAGE_READ_FAILED: ${(err as Error).message ?? 'unknown'}`);
  }

  // 2. Prompt build
  const prompt = buildPrompt(input.pageContext);

  // 3. Provider call
  let rawResponse: string;
  try {
    if (provider === 'ollama') {
      rawResponse = await callOllama({
        baseUrl: input.baseUrl,
        model,
        prompt,
        imageBase64,
        timeoutMs,
      });
    } else {
      return errorResult(provider, model, `UNSUPPORTED_PROVIDER: ${provider}`);
    }
  } catch (err) {
    const e = err as Error;
    const isAbort = e.name === 'AbortError' || /abort/i.test(e.message ?? '');
    return errorResult(provider, model, isAbort ? 'AI_TIMEOUT' : `AI_REQUEST_FAILED: ${e.message ?? 'unknown'}`);
  }

  // 4. Parse JSON (with code fence stripping)
  const cleaned = stripJsonCodeFence(rawResponse);
  const parsed = safeJsonParse(cleaned);
  if (!parsed || typeof parsed !== 'object') {
    return errorResult(provider, model, 'AI_JSON_PARSE_FAILED', rawResponse);
  }

  // 5. Defensive normalization
  const obj = parsed as Record<string, unknown>;
  const result: AiVisualAnalysisResult = {
    enabled: true,
    provider,
    model,
    sitePurpose: asString(obj.sitePurpose),
    siteCategory: normalizeSiteCategory(obj.siteCategory),
    visualSummary: asString(obj.visualSummary),
    visibleElements: asStringArray(obj.visibleElements),
    userFacingDescription: asString(obj.userFacingDescription),
    pageTone: asString(obj.pageTone),
    targetAudience: asString(obj.targetAudience),
    confidence: normalizeConfidence(obj.confidence),
    securitySignals: normalizeSecuritySignals(obj.securitySignals),
    riskLevel: normalizeRiskLevel(obj.riskLevel),
    securityCommentary: asString(obj.securityCommentary),
    recommendations: asStringArray(obj.recommendations),
    manualVerificationNeeded: normalizeManualVerificationNeeded(obj.manualVerificationNeeded),
    rawText: truncateRawText(rawResponse),
    checkedAt: now(),
  };

  return result;
}

function normalizeConfidence(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

// ─── Disabled-state helper ────────────────────────────────────────────────────

export function buildDisabledAiResult(): AiVisualAnalysisResult {
  return emptyResult();
}

// Test exports
export const __testables = {
  emptyResult,
  errorResult,
  truncateRawText,
  normalizeSecuritySignals,
  normalizeRiskLevel,
  normalizeSiteCategory,
  asStringArray,
  RAW_TEXT_MAX,
};
