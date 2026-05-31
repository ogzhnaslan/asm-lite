// Visual Website Analyzer — tüm modüller arası paylaşılan tipler.
// Playwright/runtime bağımlılığı yoktur; saf type tanımları.

export type VisualSkipReason =
  | 'NOT_DOMAIN'
  | 'NOT_VERIFIED'
  | 'INVALID_URL'
  | 'PAGE_LOAD_FAILED'
  | 'DISABLED';   // env gate (runScan tarafından set edilir, motor doğrudan üretmez)

export type VisualSignal =
  | 'LOGIN_PANEL_VISIBLE'
  | 'ADMIN_PANEL_VISIBLE'
  | 'DEFAULT_SERVER_PAGE_VISIBLE'
  | 'ERROR_PAGE_VISIBLE'
  | 'EMPTY_PAGE_DETECTED';

export type VisualRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type VisualSiteCategory =
  | 'e-commerce'
  | 'blog-news'
  | 'corporate'
  | 'portfolio-personal'
  | 'login-admin'
  | 'default-server-page'
  | 'error-page'
  | 'empty-page'
  | 'unknown';

// ─── Module boundary types ────────────────────────────────────────────────────

export interface ScreenshotResult {
  path: string | null;
  hash: string | null;
  width: number | null;
  height: number | null;
  error: string | null;
}

export interface DomExtractionResult {
  title: string | null;
  metaDescription: string | null;
  h1Texts: string[];
  visibleText: string | null;          // Truncated to ~5000-8000 chars
  visibleTextHash: string | null;       // SHA-256 of full visibleText
  linkCount: number;
  formCount: number;
  inputCount: number;
  buttonCount: number;
  hasPasswordInput: boolean;
  hasLoginTextInForm: boolean;         // form içinde login/sign in/giriş/admin
  error: string | null;
}

export interface RuleAnalyzerInput {
  title: string | null;
  metaDescription: string | null;
  h1Texts: string[];
  visibleText: string | null;
  linkCount: number;
  formCount: number;
  inputCount: number;
  buttonCount: number;
  hasPasswordInput: boolean;
  hasLoginTextInForm: boolean;
}

export interface RuleAnalyzerResult {
  signals: VisualSignal[];
  riskLevel: VisualRiskLevel | null;
  siteCategory: VisualSiteCategory | null;
  purposeSummary: string | null;
  language: 'tr' | 'en' | null;
  analysis: {
    hasLoginForm: boolean;
    hasPasswordInput: boolean;
    hasAdminHints: boolean;
    hasDefaultServerPage: boolean;
    hasErrorPage: boolean;
    isEmptyPage: boolean;
    linkCount: number;
    formCount: number;
    inputCount: number;
    buttonCount: number;
    detectedKeywords: string[];
  };
}

// ─── Public API types ─────────────────────────────────────────────────────────

// ─── AI Visual Analysis types ────────────────────────────────────────────────

// AI vision sağlayıcısı — şu an yalnızca Ollama. OpenAI-compatible adapter
// ileride aynı union'a eklenecek.
export type AiVisualProvider = 'ollama';

// AI sonucundaki siteCategory rule-based VisualSiteCategory'den ayrıdır:
// underscore-cased ve farklı bir set (login_admin, default_server_page vb.).
// Public visual analysis için web_app + landing_page + admin_panel etiketleri
// eklendi (Public Web Intelligence prompt iterasyonu).
export type AiVisualSiteCategory =
  | 'corporate'
  | 'portfolio'
  | 'ecommerce'
  | 'blog_news'
  | 'web_app'
  | 'landing_page'
  | 'admin_panel'
  | 'login_admin'
  | 'default_server_page'
  | 'error_page'
  | 'empty_page'
  | 'unknown';

export interface AiVisualSecuritySignal {
  type: string; // 'LOGIN_PANEL_VISIBLE' | 'ADMIN_PANEL_VISIBLE' | ... | 'NONE'
  confidence: number; // 0..1
  reason: string;
}

// Rule analyzer çıktısından AI'a aktarılan sayfa bağlamı.
export interface AiVisualPageContext {
  url: string | null;
  finalUrl: string | null;
  title: string | null;
  metaDescription: string | null;
  h1Texts: string[];
  visibleTextSample: string | null;
  ruleBasedCategory: string | null;
  ruleBasedSignals: string[];
  ruleBasedRiskLevel: VisualRiskLevel | null;
}

export interface AiVisualAnalysisResult {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  sitePurpose: string | null;
  siteCategory: AiVisualSiteCategory | null;
  visualSummary: string | null;
  visibleElements: string[];

  // Public Web Intelligence için eklenen alanlar — opsiyonel kalır,
  // mevcut callerlar (worker visual.check) bu alanları kullanmıyor.
  userFacingDescription?: string | null;
  pageTone?: string | null;
  targetAudience?: string | null;
  confidence?: number | null;

  securitySignals: AiVisualSecuritySignal[];
  riskLevel: VisualRiskLevel | null;
  securityCommentary: string | null;
  recommendations: string[];
  manualVerificationNeeded: boolean;
  rawText?: string;
  error?: string;
  checkedAt: string;
}

export interface VisualAnalysisAssetInput {
  id: string;
  value: string;
  type: string;
  status: string;
}

export interface VisualAnalysisInput {
  asset: VisualAnalysisAssetInput;
  url?: string;
  screenshotDir?: string;
}

export interface VisualAnalysisResult {
  // Eskiden literal `true` idi; runScan tarafında ENABLE_VISUAL_ANALYSIS=false
  // branch'i `enabled: false` üretir → union'a uyması için boolean'a genişletildi.
  enabled: boolean;
  skipped: boolean;
  skipReason?: VisualSkipReason;

  assetValue: string;
  url: string | null;
  finalUrl: string | null;
  statusCode: number | null;

  screenshotPath: string | null;
  screenshotHash: string | null;
  screenshotWidth: number | null;
  screenshotHeight: number | null;

  title: string | null;
  metaDescription: string | null;
  h1Texts: string[];
  visibleText: string | null;
  visibleTextHash: string | null;

  siteCategory: VisualSiteCategory | null;
  purposeSummary: string | null;
  language: 'tr' | 'en' | null;

  signals: VisualSignal[];
  riskLevel: VisualRiskLevel | null;

  analysis: RuleAnalyzerResult['analysis'];

  // AI vision sonucu — devre dışıysa null. Hata yine de result.error'a değil
  // aiVisualAnalysis.error'a yazılır → check sonucu skipped olmadan AI'da
  // yumuşak başarısızlık raporlanabilir.
  aiVisualAnalysis: AiVisualAnalysisResult | null;

  checkedAt: string;
  error?: string;
}
