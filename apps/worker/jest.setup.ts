// Jest setupFiles — Jest framework yüklenmeden önce process başında bir kez çalışır.
//
// Amaç: Worker test suite'i, geliştirme makinesindeki apps/worker/.env içindeki
// dış servis anahtarları ve feature flag'lerinden bağımsız, deterministic davransın.
// Spec dosyaları kendi beforeEach içinde ihtiyaç duydukları env'i set/delete edebilir;
// bu setup yalnızca "test başlamadan önceki başlangıç durumu"nu garantiler.
//
// Bu dosya yalnızca Jest tarafından yüklenir. Worker runtime (`tsx src/worker.ts`
// veya `node dist/worker.js`) bunu hiçbir zaman görmez; dotenv.config çağrısı
// runtime'da değişmez.

// ─── 1. Dış servis env'lerini sıfırla ────────────────────────────────────────
// Bu env'ler test sürecinde tanımsız olmalı — spec dosyaları ihtiyaç duyduğunda
// kendi beforeEach içinde set ediyor.
const ENV_TO_CLEAR = [
  'ENABLE_PHISHTANK',
  'PHISHTANK_FEED_URL',
  'PHISHTANK_API_KEY',
  'ENABLE_REPUTATION',
  'ABUSEIPDB_API_KEY',
  'URLHAUS_API_KEY',
  'OTX_API_KEY',
  'ENABLE_BREACH',
  'HIBP_API_KEY',
  'LEAKCHECK_API_KEY',
  'BREACH_PROVIDER',
  'ENABLE_PWNED_PASSWORD_CHECK',
  // Visual AI vision katmanı — tests her zaman kapalı başlatır, spec'ler kendi
  // beforeEach'inde ihtiyacı durumunda ENABLE_VISUAL_AI='true' set eder.
  'ENABLE_VISUAL_AI',
  'VISUAL_AI_PROVIDER',
  'VISUAL_AI_BASE_URL',
  'VISUAL_AI_MODEL',
  'VISUAL_AI_TIMEOUT_MS',
] as const;

for (const key of ENV_TO_CLEAR) {
  delete process.env[key];
}

// ─── 2. Deterministic test default'ları ───────────────────────────────────────
// run-scan.spec.ts default senaryosu 12 check'in hepsinin (OTX dahil) çağrıldığını
// doğruluyor. Runtime'da OTX verified scan içinde varsayılan olarak kapalı; test
// ortamında ise default davranışı doğrulayabilmek için açık.
// Spec içinde `process.env.ENABLE_OTX_IN_VERIFIED_SCANS = 'false'` set edilirse
// bu override edilir; setup yalnızca başlangıç durumunu belirler.
process.env.ENABLE_OTX_IN_VERIFIED_SCANS = 'true';
