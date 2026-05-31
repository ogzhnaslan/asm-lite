// Visual analysis — saf kural tabanlı analiz. Playwright bağımsız; sadece DOM
// extraction sonucundan sinyaller/kategori/risk seviyesi/Türkçe özet türetir.
// Tüm fonksiyonlar saf — testlerde mock'lanmadan synthetic input ile çağrılır.

import type {
  RuleAnalyzerInput,
  RuleAnalyzerResult,
  VisualSignal,
  VisualSiteCategory,
  VisualRiskLevel,
} from './visual-types';

// ─── Keyword dictionaries ─────────────────────────────────────────────────────

const ADMIN_PATTERNS = [
  /\badmin\b/i, /\badministrator\b/i, /\bdashboard\b/i, /control panel/i,
  /\bcpanel\b/i, /\bphpmyadmin\b/i, /\bwp-admin\b/i, /\byönetim\b/i,
];

const LOGIN_PATTERNS = [
  /\blog\s*in\b/i, /\bsign\s*in\b/i, /\bsign\s*up\b/i,
  /\bgiri[şs]\b/i, /\boturum aç\b/i, /\bkullan[ıi]c[ıi] ad[ıi]\b/i,
  /\bpassword\b/i, /\bparola\b/i, /\b[şs]ifre\b/i,
];

const DEFAULT_SERVER_PATTERNS = [
  /apache2? (ubuntu )?default page/i,
  /welcome to nginx/i,
  /\bit works!?\b/i,
  /iis (windows server|7|8|10)/i,
  /\bcpanel(?!\.com)\b/i,
  /\bplesk\b/i,
  /default web site page/i,
  /test page for the/i,
];

const ERROR_PAGE_PATTERNS = [
  /\b403 forbidden\b/i,
  /\b404 not found\b/i,
  /\b500 internal server error\b/i,
  /\b502 bad gateway\b/i,
  /\b503 service unavailable\b/i,
  /database (connection )?(error|failed)/i,
  /something went wrong/i,
  /access denied/i,
];

const CATEGORY_KEYWORDS: Record<Exclude<VisualSiteCategory, 'unknown' | 'login-admin' | 'default-server-page' | 'error-page' | 'empty-page'>, RegExp[]> = {
  'e-commerce': [
    /\bsepet\b/i, /\bcart\b/i, /\b[üu]r[üu]n(ler)?\b/i, /\bproduct(s)?\b/i,
    /\bfiyat\b/i, /\bprice\b/i, /\bcheckout\b/i, /\bsipari[şs]\b/i,
    /\badd to cart\b/i, /\bsat[ıi]n al\b/i,
  ],
  'blog-news': [
    /\bblog\b/i, /\bhaber(ler)?\b/i, /\barticle(s)?\b/i, /\bnews\b/i,
    /\bkategori(ler)?\b/i, /\bcategor(y|ies)\b/i, /\byazar\b/i, /\bauthor\b/i,
  ],
  'corporate': [
    /\bhizmet(ler|imiz)?\b/i, /\bservice(s)?\b/i, /\bcontact\b/i,
    /\bileti[şs]im\b/i, /\babout( us)?\b/i, /\bhakk[ıi]m[ıi]zda\b/i,
    /\bcompany\b/i, /\b[şs]irket\b/i, /\bkurumsal\b/i,
  ],
  'portfolio-personal': [
    /\bportfolio\b/i, /\bportf[öo]y\b/i, /\bhakk[ıi]mda\b/i, /\babout me\b/i,
    /\bcv\b/i, /\bresume\b/i, /\bprojeler(im)?\b/i, /\bprojects\b/i,
    /\bki[şs]isel\b/i, /\bpersonal\b/i,
  ],
};

const TR_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const TR_WORDS = [/\bve\b/i, /\bi[çc]in\b/i, /\bile\b/i, /\bolan\b/i, /\bbu\b/i, /\bbir\b/i, /\bda\b/i, /\bde\b/i];
const EN_WORDS = [/\bthe\b/i, /\band\b/i, /\bwith\b/i, /\bour\b/i, /\bfor\b/i, /\byou\b/i, /\bare\b/i];

const EMPTY_PAGE_TEXT_THRESHOLD = 50;
const EMPTY_PAGE_LINK_THRESHOLD = 3;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function combineText(input: RuleAnalyzerInput): string {
  return [
    input.title ?? '',
    input.metaDescription ?? '',
    ...(input.h1Texts ?? []),
    input.visibleText ?? '',
  ].join(' ').toLowerCase();
}

function patternsMatch(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function matchKeywordCount(text: string, patterns: readonly RegExp[]): number {
  return patterns.reduce((sum, p) => sum + (p.test(text) ? 1 : 0), 0);
}

function detectLanguage(text: string): 'tr' | 'en' | null {
  if (!text || text.trim().length < 20) return null;
  if (TR_CHARS.test(text)) return 'tr';
  const trHits = TR_WORDS.filter((w) => w.test(text)).length;
  const enHits = EN_WORDS.filter((w) => w.test(text)).length;
  if (trHits >= 2 && trHits > enHits) return 'tr';
  if (enHits >= 2 && enHits > trHits) return 'en';
  return null;
}

function inferCategory(args: {
  text: string;
  hasErrorPage: boolean;
  hasDefaultServerPage: boolean;
  isEmptyPage: boolean;
  hasLoginForm: boolean;
  hasAdminHints: boolean;
}): VisualSiteCategory {
  // Spesifik kategoriler genel kategorileri ezer
  if (args.hasErrorPage)         return 'error-page';
  if (args.hasDefaultServerPage) return 'default-server-page';
  if (args.isEmptyPage)          return 'empty-page';
  if (args.hasAdminHints || (args.hasLoginForm && args.text.length < 1000)) {
    return 'login-admin';
  }

  // Anahtar kelime tabanlı kategori — en yüksek skoru kazanır
  let best: { category: VisualSiteCategory; score: number } = { category: 'unknown', score: 0 };
  for (const [category, patterns] of Object.entries(CATEGORY_KEYWORDS)) {
    const score = matchKeywordCount(args.text, patterns);
    if (score > best.score) best = { category: category as VisualSiteCategory, score };
  }
  return best.score >= 2 ? best.category : 'unknown';
}

function buildSummary(args: {
  category: VisualSiteCategory;
  hasLoginForm: boolean;
  hasAdminHints: boolean;
}): string {
  switch (args.category) {
    case 'e-commerce':
      return 'Bu site e-ticaret / ürün satışı amacıyla hazırlanmış görünüyor.';
    case 'blog-news':
      return 'Bu site blog veya haber yayını amacıyla hazırlanmış görünüyor.';
    case 'corporate':
      return 'Bu site kurumsal tanıtım veya hizmet sunumu amacıyla hazırlanmış görünüyor.';
    case 'portfolio-personal':
      return 'Bu site kişisel portföy veya tanıtım amacıyla hazırlanmış görünüyor.';
    case 'login-admin':
      return args.hasAdminHints
        ? 'Bu sayfa yönetim / admin paneli ağırlıklı bir arayüz gibi görünüyor.'
        : 'Bu sayfa giriş / oturum açma ağırlıklı bir arayüz gibi görünüyor.';
    case 'default-server-page':
      return 'Bu sayfa varsayılan sunucu / hosting ekranı gibi görünüyor; servisin kurulu olduğu ama site içeriği yayınlanmadığı izlenimi veriyor.';
    case 'error-page':
      return 'Bu sayfa bir hata sayfası (403/404/500 vb.) gibi görünüyor; içerik düzgün yüklenmemiş olabilir.';
    case 'empty-page':
      return 'Sayfa içeriği çok az olduğu için site amacı net belirlenemedi.';
    case 'unknown':
    default:
      return 'Sayfa içeriği analiz edildi ancak net bir kategori belirlenemedi.';
  }
}

function computeRisk(signals: readonly VisualSignal[]): VisualRiskLevel | null {
  if (signals.length === 0) return 'LOW';

  const has = (s: VisualSignal) => signals.includes(s);

  // Admin paneli + login + error birlikte: ciddi maruziyet sinyali
  if (has('ADMIN_PANEL_VISIBLE') && has('LOGIN_PANEL_VISIBLE') && has('ERROR_PAGE_VISIBLE')) {
    return 'HIGH';
  }
  // Admin paneli açıkça görünüyor
  if (has('ADMIN_PANEL_VISIBLE')) return 'MEDIUM';
  // Hata sayfası veya default server page — sunucu tarafı yapılandırma sızıntısı
  if (has('ERROR_PAGE_VISIBLE') || has('DEFAULT_SERVER_PAGE_VISIBLE')) return 'MEDIUM';
  // Sadece login paneli — meşru olabilir ama bilgi
  if (has('LOGIN_PANEL_VISIBLE')) return 'LOW';
  // Empty page — düşük öncelik
  if (has('EMPTY_PAGE_DETECTED')) return 'LOW';

  return 'LOW';
}

function collectDetectedKeywords(text: string): string[] {
  const found = new Set<string>();
  // Toplam keyword'lerden hangileri tetiklendiyse insan-okur listesi.
  const dict: Record<string, RegExp[]> = {
    admin: ADMIN_PATTERNS,
    login: LOGIN_PATTERNS,
    'default-server': DEFAULT_SERVER_PATTERNS,
    error: ERROR_PAGE_PATTERNS,
    ...Object.fromEntries(Object.entries(CATEGORY_KEYWORDS)) as Record<string, RegExp[]>,
  };
  for (const [label, patterns] of Object.entries(dict)) {
    if (patternsMatch(text, patterns)) found.add(label);
  }
  return [...found];
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function analyzeVisual(input: RuleAnalyzerInput): RuleAnalyzerResult {
  const text = combineText(input);

  const hasPasswordInput = input.hasPasswordInput;
  const hasLoginText = input.hasLoginTextInForm || patternsMatch(text, LOGIN_PATTERNS);
  const hasLoginForm = hasPasswordInput || (input.formCount > 0 && hasLoginText);
  const hasAdminHints = patternsMatch(text, ADMIN_PATTERNS);
  const hasDefaultServerPage = patternsMatch(text, DEFAULT_SERVER_PATTERNS);
  const hasErrorPage = patternsMatch(text, ERROR_PAGE_PATTERNS);
  const isEmptyPage =
    (input.visibleText?.length ?? 0) < EMPTY_PAGE_TEXT_THRESHOLD &&
    input.linkCount < EMPTY_PAGE_LINK_THRESHOLD &&
    input.inputCount === 0;

  const signals: VisualSignal[] = [];
  if (hasLoginForm)          signals.push('LOGIN_PANEL_VISIBLE');
  if (hasAdminHints)         signals.push('ADMIN_PANEL_VISIBLE');
  if (hasDefaultServerPage)  signals.push('DEFAULT_SERVER_PAGE_VISIBLE');
  if (hasErrorPage)          signals.push('ERROR_PAGE_VISIBLE');
  if (isEmptyPage)           signals.push('EMPTY_PAGE_DETECTED');

  const siteCategory = inferCategory({
    text, hasErrorPage, hasDefaultServerPage, isEmptyPage, hasLoginForm, hasAdminHints,
  });
  const purposeSummary = buildSummary({ category: siteCategory, hasLoginForm, hasAdminHints });
  const riskLevel = computeRisk(signals);
  const language = detectLanguage(text);
  const detectedKeywords = collectDetectedKeywords(text);

  return {
    signals,
    riskLevel,
    siteCategory,
    purposeSummary,
    language,
    analysis: {
      hasLoginForm,
      hasPasswordInput,
      hasAdminHints,
      hasDefaultServerPage,
      hasErrorPage,
      isEmptyPage,
      linkCount: input.linkCount,
      formCount: input.formCount,
      inputCount: input.inputCount,
      buttonCount: input.buttonCount,
      detectedKeywords,
    },
  };
}
