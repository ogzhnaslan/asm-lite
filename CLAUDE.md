# ASM — Attack Surface Monitoring

> **Bu dosya projeyi anlamak için birincil kaynak.** Her değişiklik sonrası güncel tutulmalı.
> Son güncelleme: 2026-06-01 — **RDAP/WHOIS `RDAP_REQUEST_FAILED` düzeltildi.** Sorun: `checkRdap` tek dayanak olarak `https://rdap.org/domain/<d>` aggregator'ını kullanıyordu; bu host bazı ağlarda engelli/erişilemez (ağ matrisi: rdap.org HTTP 000, ama data.iana.org / rdap.verisign.com / rdap.publicinterestregistry.org HTTP 200) → her taramada `RDAP_REQUEST_FAILED`. Çözüm: **IANA RDAP bootstrap** (`data.iana.org/rdap/dns.json`, 24s module cache) ile TLD'nin yetkili RDAP sunucusu bulunup **doğrudan** sorgulanıyor; `rdap.org` son-çare fallback'e indirildi. Ayrıca `.tr` artık doğrudan TR RDAP'a gidiyor (eski kod .tr fallback'i rdap.org'un 404'üne bağlıydı, rdap.org engelliyken hiç tetiklenmiyordu). Gerçek ağda doğrulandı: rdap.org engelliyken example.com/fenerbahce.org/web.dev hepsi registrar+expires ile çözüldü. Yeni `rdap.check.spec.ts` (+6 test, fetch mock); worker 578 PASS. Sonuç shape'i (`RdapCheckResult`) değişmedi. _Not: Bu, kod hatası değil dış-bağımlılık dayanıklılığı iyileştirmesidir; sistem önceden de gracefully fallback yapıyordu._
> Son güncelleme: 2026-06-01 — **Duplicate scheduled scan bug'ı düzeltildi (kritik).** Belirti: bir tarama başlatınca aynı asset için "bir anda 2 eski tarama daha" çalışıyordu. Kök sebep (Redis'te doğrulandı: 20 repeatable, hepsinin `.id`'si `undefined`): eski kod `queue.add({ repeat, jobId })` + `unschedule` içinde `getRepeatableJobs().filter(j => j.id === jobId)` kullanıyordu; ama BullMQ v5'te repeatable entry'lerinin `.id`'si `undefined` → filtre **asla eşleşmiyor** → her verify/interval değişiminde `unschedule` no-op kalıp üstüne yeni repeatable ekliyor → **duplicate zamanlamalar birikiyor** (silinmiş asset'lerin orphan'ları da). Çözüm: **BullMQ v5 Job Scheduler API'sine geçiş** — `schedule()` artık `upsertJobScheduler(stableId, {every}, {name,data,opts})` (IDEMPOTENT: aynı id'yle tekrar çağrı duplicate eklemez), `unschedule()` → `removeJobScheduler(stableId)`. Yeni `reconcile(verifiedAssets)` tüm scheduler+legacy repeatable'ları temizleyip her VERIFIED asset için tek scheduler kurar; yeni `ScanScheduleBootstrap` (OnApplicationBootstrap) API açılışında bunu çağırır → birikmiş duplicate ve orphan'lar otomatik temizlenir (boot'ta zamanlayıcı sıfırlanır — kabul edilebilir). Gerçek Redis'te doğrulandı: 20 → 12 (= verified asset sayısı), re-upsert duplicate eklemedi. Testler: scan-schedule.service.spec yeni API'ye göre yeniden yazıldı (idempotency + reconcile), API 286 PASS.
> Son güncelleme: 2026-06-01 — **Scan History "tüm kontroller" akışı eklendi.** İstek: taramaların yalnızca sorunlu (finding üreten) kısmını değil, **çalışan tüm check'leri** (temiz dahil) göster. Veri zaten `ScanCheckResult` snapshot'larında. Yeni endpoint **`GET /scans/:scanRunId/checks`** (ownership scanRun→asset→userId) bir taramanın tüm ham check sonuçlarını döndürür. Frontend: `ScanRow` artık **genişletilebilir** — tıklayınca o taramanın 14 check'i durum (ok/warn/error/skip) + Türkçe özetle listelenir. Yeni `apps/web/src/utils/scanCheckSummary.ts` her tip için snapshot'tan durum+özet türetir (`summarizeCheck`, `CHECK_ORDER`); PORTS için `portCatalog.isRiskyPort` kullanılır. Backend: `scans.service.checks()` + controller `@Get(':scanRunId/checks')` (explicit return type — Prisma TS2742 portability). Testler: API +3 (toplam 287 PASS), web typecheck ✓. RUNNING taramalar genişlemez (henüz sonuç yok).
> Son güncelleme: 2026-06-01 — **Scan History bulgu rozeti düzeltildi (çeki düzen).** Sorun: tarama geçmişi satırları `_count.findings` (o `scanRunId`'ye bağlı bulgu sayısı) gösteriyordu; ama `upsertFinding` her taramada bulgunun `scanRunId`'sini en güncel run'a taşıdığı için eski taramaların sayısı düşüp **"Temiz"e dönüyordu** ("önce bulgu var, sonra temiz"). Ayrıca **RUNNING** taramalar 0 bulguyla yanıltıcı şekilde "Temiz" gösteriyordu. Çözüm: **yeni `ScanRun.findingsCount Int @default(0)` kolonu** (migration `add_scanrun_findings_count`) — worker `runScan` bitişinde aktif bulgu sayısını (`scanRunId==runId AND resolvedAt=null`) sayıp bu skalara **donduruyor** (taşınmaz; count hatası scan'i patlatmaz). API `/scans/history` artık `_count` yerine `findingsCount` döndürüyor; frontend `ScanRow` rozeti durum-duyarlı: **RUNNING → "Taranıyor"** (mavi pulse), **FAILED → "Sonuç yok"**, DONE → `findingsCount>0 ? "N bulgu" : "Temiz"`. Testler: worker +2, API/worker spec'leri güncellendi (worker 572, API 284 PASS). Not: eski (migration öncesi) tarama satırları `findingsCount=0` ile gelir — tarihsel olarak yeniden hesaplanamaz, bundan sonraki taramalar doğru.
> Son güncelleme: 2026-06-01 — **Dashboard (veri madenciliği) eklendi.** Yeni `DashboardModule` (`apps/api/src/modules/dashboard/`) + `GET /dashboard/trends?window=7d|30d`: kullanıcının **tüm** asset'lerindeki bulguların global severity trendi. Servis günlük UTC bucket'lar (severity'ye göre) + `totals` + **örüntü çıkarımı** (`insight`) üretir: önceki eşit döneme göre trend (up/down/flat, ±%5 eşik, `changePct`), `dominantSeverity`, en yoğun gün, açık CRITICAL/HIGH sayısı ve Türkçe özet cümle. Veri kaynağı `Finding.createdAt` (yeni bulgu = pencerede ilk görülen). DB/migration yok — sadece okuma/agregasyon. Frontend: yeni `DashboardPage.tsx` (sidebar'da ayrı **"Overview"** grubu, `/dashboard` route), pencere toggle (7g/30g), insight kutusu + TrendBadge, 6 özet kart, **bağımlılıksız CSS stacked bar chart** (severity renkleriyle, FindingCard ile tutarlı). Testler: API dashboard.service +10, hepsi PASS; web typecheck ✓. Sidebar artık 4 grup (Overview/Monitoring/Intelligence/Knowledge).
> Son güncelleme: 2026-06-01 — **İki özellik tamamlandı.** **(1) VISUAL_CHANGE_DETECTED artık işleniyor:** `run-scan.ts` önceki DONE taramanın `VISUAL_ANALYSIS` snapshot'ını (`prevVisualSnap`) yükleyip `processVisualFindings`'e `previous` ile geçiyor; `visual.findings.ts`'teki yeni `processChangeDetection`, current vs previous `screenshotHash`/`visibleTextHash` karşılaştırıyor — ikisi de değiştiyse MEDIUM (50), biri değiştiyse LOW (30); baseline yok/değişiklik yok/önceki skipped-error ise resolve. Key `VISUAL_CHANGE:<asset>`. Yeni `forVisualChange` recommendation. **(2) Manuel finding resolve/reopen:** `PATCH /findings/:id/resolve` (resolvedAt set, isNew=false) ve `PATCH /findings/:id/reopen` (resolvedAt=null); ownership doğrulamalı; frontend AssetDetailPage FindingCard'a "Çöz"/"Yeniden Aç" butonları. Manuel resolve kalıcı değil — sorun sürerse worker upsert ile yeniden açar. Testler: worker visual.findings +5, API findings +6; tümü PASS. **Sıradaki:** Dashboard veri madenciliği (son 1 hafta/1 ay bulgu trendleri + örüntü).
> Son güncelleme: 2026-05-31 — **Dokümantasyon senkronizasyonu (audit).** 2026-05-22 → 2026-05-31 arasında eklenen ve belgelenmemiş 3 büyük özellik + altyapı CLAUDE.md'ye işlendi: **(1) SQL Injection Probe** (`SQLI_PROBE` check + `SQL_INJECTION_SUSPECTED` finding + `/assets/:id/sqli-targets` CRUD API + frontend SqliTargetsManager/SqliLivePanel) — env-gated (`ENABLE_SQLI_CHECK`), sadece VERIFIED+DOMAIN, kullanıcının açıkça eklediği `SqliTarget` kayıtları üzerinden, max 5 hedef, rate-limit, destructive-olmayan payload. **(2) Visual Website Analyzer** (`VISUAL_ANALYSIS` check + 6 finding: `VISUAL_CHANGE_DETECTED`, `LOGIN_PANEL_VISIBLE`, `ADMIN_PANEL_VISIBLE`, `DEFAULT_SERVER_PAGE_VISIBLE`, `ERROR_PAGE_VISIBLE`, `EMPTY_PAGE_DETECTED`) — Playwright screenshot + DOM çıkarımı + rule-based sinyal + opsiyonel Ollama vision (llava) AI yorum; `/assets/:id/visual-analysis` list/detail/screenshot API. **(3) Public Web Intelligence** (`/visual-analysis/public`) — verified asset gerektirmeyen, SSRF-guard'lı kullanıcı URL'i screenshot+AI analizi (`PublicVisualAnalysisRun`, worker `visual.public.analyze` job'u). Ayrıca: **Electron desktop app** (`apps/desktop`), yeni Prisma modelleri (`SqliTarget`, `VisualAnalysisRun`, `PublicVisualAnalysisRun`), 4 yeni migration, finding tipi sayısı **27→35**, scan check tipi **12→14**. Bu girişle birlikte aşağıdaki bölümler de düzeltildi: shared tablosu, Tarama Motoru check listesi (11→14), finding tablosu, Veritabanı Şeması (Finding.aiScore/aiWhyJson **zorunlu**, nullable değil), Migration tablosu, API Referansı, Kod Stili (API tsconfig tam strict **değil**).
> Son güncelleme: 2026-05-22 — Sprint 1B: TLS protokol/cipher ve chain validation raporlanabilirliği. **`TlsCheckResult` interface'ine 4 opsiyonel alan eklendi** (`protocol`, `cipher: { name, standardName?, version?, bits? }`, `authorized`, `authorizationError`); `secureConnect` event'i içinde `socket.getProtocol()`, `socket.getCipher()`, `socket.authorized`, `socket.authorizationError` okunup string/code'a çevriliyor. `rejectUnauthorized: false` aynı kaldı — chain validation hatası varsa bağlantı yine kurulur, hata `authorizationError` alanında raporlanır, scan **patlamaz**. `TLS_INFO` snapshot otomatik genişledi; `_processExpiry` `TLS_EXPIRING` finding dataJson'una bu 4 alanı **opsiyonel** olarak ekledi (eski snapshot'larda yoksa alanlar dataJson'a hiç yazılmaz — geriye uyumlu). Frontend: **yeni `TlsFindingDetails.tsx`** component'i (PortFindingDetails pattern'i) — TLS_CHECK için hata kartı, TLS_EXPIRING için sertifika+protokol/cipher+chain validation panelleri, TLS_CHANGE için önceki vs mevcut karşılaştırma. AssetDetailPage'e koşullu render + FindingCard kapalı görünüm için kısa özet satırı eklendi. **Severity, aiScore, finding üretme mantığı, recommendations.ts, findingDisplay.ts, FINDING_META, shared package, Prisma schema, API dokunulmadı.** Yeni finding tipi (TLS_WEAK_PROTOCOL / TLS_CHAIN_INVALID) **eklenmedi** — Sprint 1C'ye bırakıldı. **Worker testleri: 403/403 PASS (önceki 400, +3 yeni TLS test). Sprint 1A regresyon: 48/48 PASS. Web build: ✓.**
> Son güncelleme: 2026-05-22 — Stale Test Update: PhishTank ve Reputation spec dosyaları mevcut business logic'e uyumlu hale getirildi. Worker runtime/business logic değişmedi. **Full worker suite: 400/400 PASS (önceki 390/411, 21 fail). Sprint 1A regresyon: 48/48 PASS.** Değişiklikler: (1) `phishtank.check.spec.ts` — "DISABLED only on env=false/0/no" + "undefined/credentials yok → default public feed kullanılır" senaryolarına güncellendi; eski "undefined → DISABLED" ve "credentials yok → NO_CREDENTIALS" stale beklentileri kaldırıldı; result shape testi explicit `ENABLE_PHISHTANK=false` ile yeniden yazıldı. (2) `reputation.check.spec.ts` — `IP asset — AbuseIPDB` describe (11 test) ve `AbuseIPDB category normalization` describe (6 test) tamamen kaldırıldı (AbuseIPDB kod tarafında zaten silinmiş); yerine 4 testlik `IP asset — URLhaus-only mode` describe eklendi (skipped=`IP_NOT_SUPPORTED_BY_URLHAUS_ONLY_MODE`, fetch çağrılmaz, providers=[], assetType/Value korunur); URLhaus `Auth-Key` header testleri tek "Auth-Key gönderilmez + Content-Type/User-Agent doğrula" testine konsolide edildi (kod URLHAUS_API_KEY okumuyor); URLhaus HTTP 401 testi `URLHAUS_KEY_REQUIRED` → `HTTP_401` olarak güncellendi; anlamsız ABUSEIPDB_API_KEY result-shape testi ve kullanılmayan `ABUSE_KEY`/`abuseIPDBResponse` helper'ları temizlendi. Net: -11 fail, +0 fail, toplam test 411 → 400 (stale silinen 14 test 6 yeni meaningful testle dengelenmedi — kullanıcı onayıyla FAIL=0 öncelikli, test sayısı değil).
> Son güncelleme: 2026-05-22 — Worker test izolasyonu: **`apps/worker/jest.setup.ts`** eklendi (Jest `setupFiles` ile bağlandı). Geliştirme makinesindeki `apps/worker/.env`'de set olan dış servis env'leri (ENABLE_PHISHTANK, PHISHTANK_FEED_URL/API_KEY, ENABLE_REPUTATION, ABUSEIPDB_API_KEY, URLHAUS_API_KEY, OTX_API_KEY, ENABLE_BREACH, HIBP_API_KEY, LEAKCHECK_API_KEY, BREACH_PROVIDER, ENABLE_PWNED_PASSWORD_CHECK) test sürecinde sıfırlanır; run-scan default 12-check senaryosu için `ENABLE_OTX_IN_VERIFIED_SCANS='true'` set edilir. Production/dev runtime davranışı değişmedi — `dotenv.config` worker.ts boot anında çalışmaya devam ediyor, jest setup yalnızca `pnpm test` sırasında etkin. Spec dosyalarına ve runtime'a dokunulmadı. Full suite 411 testten **390 PASS, 21 FAIL** (önceki 388/23). Kalan 21 fail business logic ile uyumsuz stale testler: `phishtank.check.spec.ts` 3 (kod public-feed-by-default davranışına geçti, test DISABLED bekliyor), `reputation.check.spec.ts` 18 (kod AbuseIPDB'yi tamamen kaldırıp URLhaus-only moda geçti, test hâlâ AbuseIPDB yolunu test ediyor). Bu testler env pollution değil — ayrı bir "stale test update" sprintinde ele alınmalı.
> Son güncelleme: 2026-05-22 — Sprint 1A+ port bulgu render iyileştirmesi: PORT_EXPOSED ve PORT_CHANGE bulguları için frontend'de **yapısal render** eklendi. Yeni dosyalar: `apps/web/src/utils/portCatalog.ts` (30 port servis/kategori/risk mapping, frontend-only) ve `apps/web/src/components/findings/PortFindingDetails.tsx` (Kritik/Riskli/Normal açık port kartları, tarama özeti [taranan/açık/kapalı/timeout], önceki vs mevcut karşılaştırma, Türkçe risk yorumu). FindingCard kapalı görünümünde `finding.key` altına kısa özet eklendi (örn. "3 açık riskli port, 1 kritik" / "Yeni açılan: 3000, Kapanan: 8080"). `findingDisplay.ts` PORT_EXPOSED ve PORT_CHANGE fallback metinleri "tek başına kesin zafiyet değildir" tonuyla genişletildi. **Backend dokunulmadı** — PORTS snapshot, PORT_EXPOSED/PORT_CHANGE dataJson shape'leri ve worker constants.ts aynı. Web build başarılı.
> Son güncelleme: 2026-05-22 — Sprint 1A tarama doğruluğu iyileştirmeleri: **DEFAULT_PORTS 8→30 porta genişletildi** (FTP/Telnet/SMTP/POP3/IMAP/SMB/DB/cache/search/dev portları eklendi); `CRITICAL_PORTS` [22, 23, 445, 3389] olarak güncellendi (Telnet + SMB CRITICAL); `RISKY_PORTS` DB/cache/search/dev portlarını kapsayacak şekilde genişletildi; **`PORT_SCAN_TIMEOUT_MS` env desteği eklendi** (default 3000, boş/NaN/≤0 → 3000 fallback); **checkHttp `User-Agent: ASM-Scanner/1.0` header'ı ekledi** (diğer check'lerle tutarlı). PortsCheckResult/HttpCheckResult shape'leri, run-scan akışı, snapshot tipleri, finding processor'lar, Prisma schema, frontend **dokunulmadı**. Etkilenen testler 48/48 geçti (port.findings 12, http.findings 5, run-scan 31).
> Son güncelleme: 2026-05-19 — PhishTank feed entegrasyonu: gerçek feed URL desteği, 1 saatlik memory cache, hata kodları güncellendi (PHISHTANK_RATE_LIMITED/FEED_FAILED/PARSE_ERROR/UNSUPPORTED_FEED_FORMAT), matchedUrls max 20, provider='phishtank-feed', User-Agent güncellendi, PhishTankMatchedUrl tipine detailUrl/verifiedAt/target eklendi, frontend kartına provider/no-match mesajı/URL detayları eklendi — DB/migration/API shape/scan orchestration dokunulmadı, 49 test geçti
> — Passive Lookup AI Raporu + Chat Yeniden Tasarım: HistoryDetailModal max-w-4xl, "AI Tehdit İstihbaratı Raporu" başlığı, meta badge strip, OTX kartı (sol) + AiReportCard (sağ) side-by-side layout, 6-bölümlü Türkçe rapor (A-F: Genel Değerlendirme, OTX Özeti, Passive DNS, Risk, Aksiyonlar, Rapor Cümlesi), yeniden tasarlanan AI Chat kartı + 6 hazır soru, OTX_CHAT_SYSTEM genişletildi (4-5 cümle min) — worker/Scan/Asset/Finding dokunulmadı, build PASS (api + web)

---

## İçindekiler

1. [Proje Özeti](#proje-özeti)
2. [Mimari](#mimari)
3. [Monorepo Yapısı](#monorepo-yapısı)
4. [Geliştirme Ortamı](#geliştirme-ortamı)
5. [Paket Detayları](#paket-detayları)
   - [packages/shared](#packagess-shared)
   - [apps/api](#appsapi--nestjs-backend)
   - [apps/worker](#appsworker--scan-engine)
   - [apps/web](#appsweb--react-frontend)
6. [Veritabanı Şeması](#veritabanı-şeması)
7. [API Referansı](#api-referansı)
8. [Tarama Motoru](#tarama-motoru)
9. [AI Analiz Sistemi](#ai-analiz-sistemi)
10. [Kimlik Doğrulama ve Güvenlik](#kimlik-doğrulama-ve-güvenlik)
11. [Kod Stili ve Kurallar](#kod-stili-ve-kurallar)
12. [Test Stratejisi](#test-stratejisi)
13. [Gelecek Planlar (Roadmap)](#gelecek-planlar-roadmap)

---

## Proje Özeti

ASM, şirketlerin dış saldırı yüzeyini (domain'ler, IP adresleri) sürekli izleyen bir güvenlik platformudur. Kullanıcılar varlıklarını (assets) ekler, sahipliklerini doğrular ve sistem otomatik olarak tarayıp risk bulgularını (findings) AI analiziyle zenginleştirir.

**Temel İşlevler:**
- Domain/IP varlık yönetimi + sahiplik doğrulama (DNS TXT veya HTTP dosyası)
- Paralel güvenlik taramaları: açık portlar, TLS sertifikası, HTTP sağlığı, güvenlik başlıkları
- Değişiklik tespiti (önceki taramayla karşılaştırma)
- AI ile bulgu puanlama ve öneri üretme (Claude veya Ollama)
- Webhook bildirimleri (n8n entegrasyonu)
- Modern web arayüzü ile bulgu yönetimi

---

## Mimari

```
┌─────────────────────────────────────────────────────────────────┐
│                          KULLANICI                              │
│                    apps/web (React + Vite)                      │
│                      Port: 5173 (dev)                           │
└──────────────────────────────┬──────────────────────────────────┘
                               │ REST API (JWT Bearer)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     apps/api (NestJS)                           │
│                        Port: 3000                               │
│  Auth │ Assets │ Scans │ Findings │ Queue                       │
└──────┬──────────────────────────────────────┬───────────────────┘
       │ PostgreSQL (Prisma)                  │ BullMQ Jobs (Redis)
       ▼                                      ▼
┌─────────────────┐              ┌────────────────────────────────┐
│   PostgreSQL 16 │              │    apps/worker (Node.js)       │
│   Port: 5433    │◄─────────────│  checkPorts │ checkTls         │
│   DB: asmdb     │              │  checkHttp  │ checkHeaders      │
└─────────────────┘              │  AI analyze │ Webhook notify   │
                                 └─────────────┬──────────────────┘
                   ┌─────────────┐             │
                   │  Redis 7    │◄────────────┘
                   │  Port: 6380 │  Job Queue
                   └─────────────┘
                                      │
                               ┌──────▼──────────┐
                               │  Anthropic API   │
                               │      veya        │
                               │  Ollama (local)  │
                               └─────────────────┘
```

---

## Monorepo Yapısı

```
e:/Projects/asm/
├── apps/
│   ├── api/            # NestJS REST API + Prisma ORM
│   ├── web/            # React 18 + Vite + Tailwind UI
│   ├── worker/         # BullMQ job worker (tarama motoru + Playwright görsel analiz)
│   └── desktop/        # Electron masaüstü shell (web UI'yi sarar; backend ayrı çalışır)
├── packages/
│   └── shared/         # Ortak TypeScript tipleri ve sabitler
├── pnpm-workspace.yaml # Workspace tanımı
├── package.json        # Root scripts (dev:api/worker/web + desktop:dev/build/dist)
├── docker-compose.yml  # PostgreSQL + Redis dev servisleri
├── start.bat           # Windows hızlı başlatma scripti
├── start-desktop.bat   # Electron desktop başlatma scripti
└── CLAUDE.md           # Bu dosya
```

### pnpm Scripts (root)

```bash
pnpm dev:api     # NestJS API'yi başlat (port 3000)
pnpm dev:worker  # Worker'ı başlat
pnpm dev:web     # Vite dev server'ı başlat (port 5173)
```

---

## Geliştirme Ortamı

### Ön Gereksinimler

- Node.js 18+
- pnpm 9+
- Docker Desktop (PostgreSQL + Redis için)

### İlk Kurulum

```bash
# 1. Bağımlılıkları yükle
pnpm install

# 2. .env dosyalarını oluştur
cp apps/api/.env.example apps/api/.env
cp apps/worker/.env.example apps/worker/.env
# apps/web için: VITE_API_URL=http://localhost:3000 içeren .env oluştur

# 3. Servisleri başlat
docker-compose up -d

# 4. Veritabanı migration'larını uygula
cd apps/api && pnpm prisma migrate dev

# 5. Uygulamaları başlat (3 ayrı terminal)
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

### Ortam Değişkenleri

**apps/api/.env**
```
DATABASE_URL=postgresql://<db_user>:<db_password>@localhost:5433/asmdb?schema=public
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=
JWT_SECRET=<your-strong-random-secret>
JWT_EXPIRES_IN=7d
PORT=3000
CORS_ORIGIN=http://localhost:5173
DNS_SERVERS=162.159.24.201,162.159.25.42
```

**apps/worker/.env**
```
DATABASE_URL=postgresql://<db_user>:<db_password>@localhost:5433/asmdb?schema=public
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=

# Port scan TCP connect timeout per port (ms); boş/NaN/≤0 → 3000 fallback
PORT_SCAN_TIMEOUT_MS=3000

# AI provider: 'anthropic' veya 'ollama'
AI_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Anthropic (AI_PROVIDER=anthropic ise zorunlu)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# Opsiyonel: n8n webhook bildirimleri
N8N_WEBHOOK_URL=

# SQLi probe (kontrollü, manuel hedef tabanlı)
ENABLE_SQLI_CHECK=false
SQLI_REQUEST_DELAY_MS=200

# Görsel analiz (Playwright + opsiyonel Ollama vision)
ENABLE_VISUAL_ANALYSIS=false
VISUAL_SCREENSHOT_DIR=./visual-smoke
ENABLE_VISUAL_AI=false
VISUAL_AI_PROVIDER=ollama
VISUAL_AI_BASE_URL=http://localhost:11434
VISUAL_AI_MODEL=llava:latest
VISUAL_AI_TIMEOUT_MS=30000

# OTX'in verified scan içinde de çalışması (default false → sadece passive lookup)
ENABLE_OTX_IN_VERIFIED_SCANS=false
```
> **Tam ve güncel env listesi için `apps/worker/.env.example` birincil kaynaktır** (PhishTank, Reputation, Breach, OTX, GeoIP dahil tüm açıklamalı değişkenler orada).

**apps/web/.env**
```
VITE_API_URL=http://localhost:3000
```

### Prisma Komutları

```bash
# Yeni migration oluştur (veya schema sync için db push)
cd apps/api && pnpm prisma migrate dev --name <migration-adi>
# NOT: pnpm + Prisma tip sync — generate sonrası pnpm store'daki .prisma/client'ı da güncelle:
# cp apps/api/node_modules/.prisma/client/index.d.ts node_modules/.pnpm/@prisma+client@7.4.1_.../node_modules/.prisma/client/index.d.ts
# (build hataları için gerekli — tek seferlik işlem, pnpm install sonrası otomatik)
# CI'da otomatik: .github/workflows/ci.yml "Generate Prisma client" adımı generate sonrası
# bu store senkronizasyonunu kendisi yapar (temiz install'da @prisma/client stub kalmasın diye).
# Yeni migration oluştur

# Production migration uygula
cd apps/api && pnpm prisma migrate deploy

# Prisma Studio (DB GUI)
cd apps/api && pnpm prisma studio

# Tip üretimi (schema değişikliğinden sonra)
cd apps/api && pnpm prisma generate
```

---

## Paket Detayları

### packages/shared

Tüm app'ler arası paylaşılan TypeScript tipleri ve sabitler. **Değişiklik yaptığında `pnpm build` çalıştır.**

| Dosya | İçerik |
|-------|--------|
| `asset-types.ts` | `ASSET_TYPES`, `AssetStatus` |
| `job-types.ts` | `ScanJobPayload`, `ScanJobResult` |
| `scan-check-types.ts` | `SCAN_CHECK_TYPES` (14: `PORTS`, `TLS_INFO`, `HTTP_HEALTH`, `SECURITY_HEADERS`, `DNS_RECORDS`, `RDAP_INFO`, `GEOIP_INFO`, `ROBOTS_TXT`, `PHISHTANK_REPUTATION`, `MALICIOUS_REPUTATION`, `BREACH_EXPOSURE`, `OTX_INTELLIGENCE`, `SQLI_PROBE`, `VISUAL_ANALYSIS`), `SCAN_STATUS` |
| `finding-types.ts` | `FindingTypes` (35 tip — port×2, tls×3, http×2, security_header×1, dns×8, whois×2, geoip×2, robots×2, phishing×1, reputation×1, breach×1, otx×2, sqli×1, visual×6) |
| `scan-intervals.ts` | `SCAN_INTERVALS` (`1h`, `6h`, `24h`, `7d`) |
| `severities.ts` | `SEVERITIES` (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) |

---

### apps/api — NestJS Backend

**Port:** 3000 | **Framework:** NestJS 11 | **ORM:** Prisma 7

#### Modül Yapısı

```
src/
├── auth/                    # JWT kimlik doğrulama
│   ├── auth.module.ts
│   ├── auth.service.ts      # register, login, sign
│   ├── auth.controller.ts   # /auth/register, /auth/login, /auth/me
│   ├── jwt.strategy.ts      # Passport JWT stratejisi
│   └── jwt-auth.guard.ts    # Route guard
├── assets/                  # Varlık yönetimi
│   ├── assets.service.ts    # CRUD + doğrulama mantığı
│   └── assets.controller.ts
├── modules/
│   ├── scans/               # Tarama tetikleme ve geçmiş
│   │   ├── scans.service.ts
│   │   └── scan-schedule.service.ts  # BullMQ tekrarlayan job'lar
│   ├── findings/            # Bulgu sorgulama ve onaylama
│   └── queue/               # BullMQ modülü ve kuyruk sabitleri
├── prisma/                  # PrismaService singleton
└── common/                  # Decorator'lar ve global filtreler
```

#### Global Middleware'ler

- `ThrottlerGuard`: 60 istek / 60 saniye (global)
- `ValidationPipe`: class-validator + class-transformer (global)
- `HttpExceptionFilter`: Tutarlı hata formatı `{statusCode, message, path, timestamp}`
- `helmet()`: HTTP güvenlik başlıkları
- `cors()`: `CORS_ORIGIN` env'den whitelist

---

### apps/worker — Scan Engine

**Teknoloji:** Node.js + TypeScript + BullMQ | **Queue:** `scan` | **DLQ:** `scan-dlq`

#### Tarama Akışı

```
Job alındı (ScanJobPayload: assetId, scanRunId?)
  │
  ├─ Asset ve status doğrula
  ├─ ScanRun kaydı oluştur / RUNNING'e güncelle
  │
  ├─ 14 check paralel çalıştır (safeCheck wrapper ile) ─────┐
  │   checkPorts / checkTls / checkHttp                     │
  │   checkSecurityHeaders / checkDnsRecords / checkRdap    │
  │   checkGeoIp / checkRobotsTxt / checkPhishTank          │
  │   checkReputation / checkBreachExposure / checkOtx      │
  │   checkSqli / checkVisualAnalysis                       │
  │   → Crash durumunda fallback result döner, scan devam   │
  │                                                         │
  ├─ Snapshot'ları kaydet (Promise.allSettled)  ◄───────────┘
  │   → Tek snapshot hatası diğerlerini engellemez
  │
  ├─ Önceki snapshot'ları yükle (değişiklik tespiti için)
  │
  ├─ Finding'leri işle (her processor try/catch ile izole)
  │   processPortFindings → error varsa skip (resolve yok)
  │   processTlsFindings / processHttpFindings
  │   processSecurityHeaderFindings / processDnsFindings
  │   processWhoisFindings / processGeoIpFindings
  │   processRobotsFindings / processPhishTankFindings
  │   processReputationFindings / processBreachFindings
  │   processOtxFindings / processSqliFindings / processVisualFindings
  │   (visual: önce persistVisualAnalysisRun ile DB kaydı, sonra finding)
  │
  ├─ AI analizi (SECURITY_HEADER_MISSING hariç aktif finding'ler)
  │   analyzeFindings → aiScore + aiWhyJson
  │
  ├─ Webhook bildirimleri (yeni HIGH/CRITICAL finding'ler)
  │
  └─ ScanRun'u DONE'a güncelle (sadece kritik hatada FAILED)
```

#### Worker Stability Kuralları (Adım 10)

- `safeCheck<T>(label, fn, fallback)`: Her check Promise.all içinde bu wrapper'la çalışır. Throw → log + fallback result döner, scan devam eder.
- Fallback result'lar `error: 'CHECK_CRASHED'` alanı taşır; snapshot olarak kaydedilir.
- `PortsCheckResult` ve `DnsRecordsCheckResult`'a `error?: string` alanı eklendi.
- Finding processor'lar `error` / `skipped` durumlarında eski finding'leri resolve etmez:
  - `processPortFindings`: `portsResult.error` → early return
  - `processDnsFindings`: `dnsResult.error` → early return
  - `processRobotsFindings._processSensitivePaths`: `current.error` → early return (resolve yok)
  - `processRobotsFindings._processChange`: `current.error` → early return (resolve yok)
  - GeoIP, Whois, PhishTank, Reputation, Breach: zaten error check vardı
- Snapshot kayıt: `Promise.allSettled` — bir hata diğerleri engellemez, failures loglanır.
- Finding processor'lar: her biri ayrı `try/catch` içinde çalışır, hata loglanır scan devam eder.
- `ScanRun = FAILED` sadece: asset not found, asset not verified, DB bağlantı hatası.

#### Check'ler

**checkPorts** (`checks/ports.check.ts`)
- Varsayılan portlar (30 — web/remote/mail/DNS/DB/cache/search/dev):
  `21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 465, 587, 993, 995, 1433, 3000, 3306, 3389, 5432, 5555, 5900, 6379, 8000, 8080, 8443, 8888, 9000, 9200, 11211, 27017`
- Paralel TCP socket bağlantısı; timeout `PORT_SCAN_TIMEOUT_MS` env'den okunur (default 3000ms; boş/NaN/≤0 → fallback 3000)
- Kritik portlar (`CRITICAL_PORTS`): `22 (SSH), 23 (Telnet), 445 (SMB), 3389 (RDP)` — plaintext shell / remote desktop / SMB
- Riskli portlar (`RISKY_PORTS`, finding üretir): kritik portlar + `21 (FTP), 25 (SMTP), 110 (POP3), 143 (IMAP), 587 (SMTP submission), 1433 (MSSQL), 3000, 3306 (MySQL), 5432 (PostgreSQL), 5555, 5900 (VNC), 6379 (Redis), 8000, 8080, 8443, 8888, 9000, 9200 (Elasticsearch), 11211 (Memcached), 27017 (MongoDB)`
- Risksiz (finding üretmez): `80, 443, 53, 465, 993, 995` — meşru genel servisler
- Result shape değişmedi: `{ checkedPorts, results, openPorts, error? }`

**checkTls** (`checks/tls.check.ts`)
- Host:443'e TLS handshake, `rejectUnauthorized: false`
- Sertifika zinciri, issuer, subject, fingerprint, serial çıkarma
- Gün hesabı: son kullanma tarihine kalan gün
- Eşikler: 7 gün → CRITICAL, 15 gün → HIGH, 30 gün → MEDIUM

**checkHttp** (`checks/http.check.ts`)
- Önce HTTPS dener, başarısız olursa HTTP'ye döner
- 5s timeout, latency ölçümü
- `User-Agent: ASM-Scanner/1.0` header'ı gönderir (Cloudflare/WAF arkasındaki Node default UA bloklarını engellemek için, diğer check'lerle tutarlı)
- Dönüş: `{url, statusCode, latencyMs, error?, attempts?}`
- Latency spike eşiği: +300ms artış

**checkRobotsTxt** (`checks/robots.check.ts`)
- Sadece DOMAIN tipli asset'lerde çalışır
- Önce `https://` dener, başarısız olursa `http://` fallback
- 404 → `exists: false`, hata yok; network/TLS hatası → `error` alanı dolu
- Parse: `Disallow:`, `Allow:`, `Sitemap:` satırları (comment sonu `#` kırpılır)
- Hassas path tespiti: 18 keyword listesiyle Disallow path eşleşmesi
- HIGH-risk path'ler (`/.env`, `/backup`, `/db`, `/database`, `/config`) ayrıca `highSeverityPaths` alanında
- `contentHash`: SHA-256 (değişiklik tespiti için)
- Dönüş: `{ domain, url, exists, statusCode, contentLength, contentHash, disallowRules, allowRules, sitemapUrls, sensitivePaths, highSeverityPaths, checkedAt, error? }`

**checkPhishTank** (`checks/phishtank.check.ts`)
- Sadece DOMAIN tipli asset'lerde çalışır
- `ENABLE_PHISHTANK=true` olmadan → `skipped: true` döner, scan patlamamaz
- `PHISHTANK_FEED_URL` varsa direkt kullanılır (API key gerekmez); yoksa `PHISHTANK_API_KEY` ile feed URL otomatik oluşturulur (`https://data.phishtank.com/data/<key>/online-valid.json`)
- İkisi de yoksa → `skipped: true, skipReason: 'NO_CREDENTIALS'`
- **Feed cache:** 1 saat TTL, module-level (`cachedFeed`, `cachedAt`); aynı işlemde tekrar tekrar indirmez
- **User-Agent:** `ASM-Platform/1.0 passive-phishing-feed`
- 15s timeout; erişilemezse `error` alanıyla dolu, `isListed: false` döner — scan patlamamaz
- Hata kodları: `PHISHTANK_RATE_LIMITED` (429), `PHISHTANK_TIMEOUT` (timeout), `PHISHTANK_PARSE_ERROR` (JSON parse hatası), `PHISHTANK_UNSUPPORTED_FEED_FORMAT` (array değil), `PHISHTANK_FEED_FAILED` (ağ hatası), `PHISHTANK_HTTP_XXX` (diğer HTTP hataları)
- Domain eşleştirme: URL parse → hostname → `isSameOrSubdomain` (subdomain dahil, `fake-example.com` hariç)
- `verifiedMatches` / `onlineMatches` sayılır; eşleşen URL'ler max 20 ile kırpılır
- `provider: 'phishtank-feed'` (feed veya API key ile kurulan URL için)
- Dönüş: `PhishTankCheckResult { domain, provider, enabled, skipped, skipReason?, isListed, verifiedMatches, onlineMatches, matchedUrls[{url,phishId,detailUrl,verified,online,submittedAt,verifiedAt,target}], checkedAt, error? }`

**checkReputation** (`checks/reputation.check.ts`)
- DOMAIN **ve** IP asset'lerde çalışır
- `ENABLE_REPUTATION=true` olmadan → `skipped: true` döner
- IP asset → AbuseIPDB (`ABUSEIPDB_API_KEY` zorunlu; yoksa `skipReason: 'NO_CREDENTIALS'`)
- DOMAIN asset → URLhaus (ücretsiz, API key gerekmez; her zaman çalışır)
- 8s timeout per provider; hata durumunda `error` alanıyla dolu, scan patlamaz
- AbuseIPDB: `abuseConfidenceScore > 0` → malicious; verbose modda kategori kodları çözümlenir
- URLhaus: `query_status === 'is_host'` → malicious; aktif URL varsa score=85, offline=55, sadece blacklist=60
- Tüm provider'lar başarısız → `error: 'ALL_PROVIDERS_FAILED'` (finding üretilmez, eski resolve edilmez)
- Dönüş: `ReputationCheckResult { assetValue, assetType, enabled, skipped, skipReason?, providers[], isMalicious, maxScore, categories[], checkedAt, error? }`

**checkBreachExposure** (`checks/breach.check.ts`)
- Sadece DOMAIN tipli asset'lerde çalışır
- `ENABLE_BREACH=true` olmadan → `skipped: true` döner
- `BREACH_PROVIDER`: `mock` | `hibp` | `leakcheck` (varsayılan: `mock`)
- `mock`: `example.com` ve `test-breach.local` → demo breach verisi; diğerleri → temiz
- `hibp`: `HIBP_API_KEY` zorunlu; `GET /api/v3/breaches?domain=<domain>` — breached site olarak listelenmiş mi?; 401/429/hata durumunda `status: 'error'`
- `leakcheck`: `LEAKCHECK_API_KEY` zorunlu; `GET /api/v2/query/<domain>?type=domain` — domain emaillerinden sızıntı var mı?
- 10s timeout; hata durumunda `status: 'error'` → scan patlamaz, eski finding resolve edilmez
- HIBP DataClasses normalize edilir (`Passwords`→`password`, `Password hints`→`password_hint`, vb.)
- LeakCheck `passwordtype: 'plaintext'` → `password`; hash türleri → `password_hash`
- Dönüş: `BreachExposureCheckResult { domain, enabled, skipped, skipReason?, provider, status, breachCount, exposedEmailsCount, latestBreachDate, sources[], sensitiveDataTypes[], checkedAt, error? }`

**checkGeoIp** (`checks/geoip.check.ts`)
- DOMAIN **ve** IP asset'lerde çalışır (tüm asset tipleri)
- DOMAIN için `dns.resolve4()` ile A kaydı çözümlenir → ilk IP kullanılır
- IP asset için `asset.value` doğrudan kullanılır
- `http://ip-api.com/json/{IP}?fields=...` endpoint'i (6s timeout, API key gerekmez)
- Normalize edilen alanlar: `country`, `countryCode`, `region`, `city`, `latitude`, `longitude`, `asn` (`AS12345` prefix), `isp`, `organization`
- Hata durumunda `error` alanıyla dolu, diğer alanlar null obje döner — scan patlamamaz
- Dönüş: `GeoIpCheckResult { assetValue, assetType, resolvedIp, country, countryCode, region, city, lat, lon, asn, isp, organization, provider, checkedAt, error? }`

**checkRdap** (`checks/rdap.check.ts`)
- Sadece DOMAIN tipli asset'lerde çalışır
- **IANA RDAP bootstrap** (`https://data.iana.org/rdap/dns.json`, 24s cache) ile TLD'nin **yetkili RDAP sunucusunu** bulup `<base>domain/<domain>` ile **DOĞRUDAN** sorgular (örn. .com→Verisign, .org→PIR). `rdap.org` artık yalnızca **son-çare fallback'tir** (aggregator bazı ağlarda engelli/erişilemez olabilir → `RDAP_REQUEST_FAILED`; bootstrap yaklaşımı bunu by-pass eder)
- `.tr` ccTLD → doğrudan TR RDAP (`rdap.com.tr`), o başarısızsa rdap.org; bootstrap'a gidilmez (ccTLD bootstrap'te yok). _Eski kod .tr fallback'i rdap.org'un HTTP_404'üne bağlıydı; rdap.org engelliyken (HTTP 000) tetiklenmiyordu — düzeltildi._
- 8s timeout, hata durumunda sistemi patlatmaz — `error` alanıyla `RdapCheckResult` döner
- Normalize edilen alanlar: `registrar`, `createdDate`, `updatedDate`, `expiresDate`, `nameServers` (lowercase, sorted), `status` (lowercase, sorted)
- Tarihler `events[]` dizisinden çıkarılır: `registration` → createdDate, `expiration` → expiresDate, `last changed` → updatedDate
- Registrar: `entities[]` içinde `roles: ['registrar']` olan entity'nin `vcardArray.fn` değeri (nested entity desteği dahil)
- Dönüş: `{ domain, registrar, createdDate, updatedDate, expiresDate, nameServers, status, rawSource: 'RDAP', checkedAt, error? }`

**checkDnsRecords** (`checks/dns-records.check.ts`)
- Sadece DOMAIN tipli asset'lerde çalışır (IP'lerde atlanır)
- Paralel olarak 8 kayıt tipi sorgulanır: `A`, `AAAA`, `MX`, `NS`, `TXT`, `CNAME`, `SOA`, `CAA`
- Ayrıca `_dmarc.<domain>` için TXT sorgusu yapılır → `dmarcRecord: string | null` alanına yazılır
- Node.js `dns/promises` modülü kullanır
- `ENODATA` / `ENOTFOUND` hataları sessizce yutulur (kayıt yoksa boş döner)
- Dönüş: `{ domain, records: [{type, value}], dmarcRecord, checkedAt, errors: {TIP: mesaj} }`
- Finding üretmez — sadece `DNS_RECORDS` tipinde snapshot yazar

**checkOtx** (`checks/otx.check.ts`)
- DOMAIN ve IPv4 asset'lerde çalışır (IPv6 → `skipped: IPV6_NOT_SUPPORTED`)
- `ENABLE_OTX=false` → `skipped: DISABLED`; `OTX_API_KEY` yoksa → `skipped: NO_CREDENTIALS`
- Domain için 4 endpoint paralel sorgulanır: `general`, `malware`, `url_list`, `passive_dns`; IPv4 için sadece `general`
- `general` başarısızsa → `error` ile dönülür; diğer endpoint hataları sessizce 0 sayılır (allSettled)
- Hata kodları: `INVALID_API_KEY` (401), `RATE_LIMITED` (429), `OTX_TIMEOUT`, `OTX_REQUEST_FAILED`
- API key asla loglanmaz, response'a veya DB'ye yazılmaz
- Dönüş: `{ assetValue, assetType, provider, enabled, skipped, pulseCount, pulses[], tags[], malwareCount, urlListCount, passiveDnsCount, checkedAt, error? }`

**checkSecurityHeaders** (`checks/security-headers.check.ts`)
- Sadece DOMAIN tipli asset'lerde çalışır (IP'lerde atlanır)
- HEAD request ile başlık kontrolü
- Zorunlu başlıklar ve severities:

| Başlık | Severity | Varsayılan aiScore |
|--------|----------|-------------------|
| Content-Security-Policy | HIGH | 75 |
| Strict-Transport-Security | HIGH | 75 |
| X-Frame-Options | MEDIUM | 50 |
| X-Content-Type-Options | MEDIUM | 50 |
| Referrer-Policy | LOW | 25 |
| Permissions-Policy | LOW | 25 |

**checkSqli** (`checks/sqli.check.ts` + `checks/sqli/{payloads,detectors,sqli-fetch}.ts`)
- **Manuel hedef tabanlı, kontrollü SQL injection probe** — otomatik keşif yok; yalnızca kullanıcının açıkça eklediği `SqliTarget` kayıtlarını test eder
- Guard zinciri: `ENABLE_SQLI_CHECK=true` (env) **ve** asset `DOMAIN` **ve** asset `VERIFIED` — biri eksikse `skipped` (`DISABLED` / `NOT_DOMAIN` / `NOT_VERIFIED` / `NO_TARGETS`)
- `MAX_TARGETS_DEFENSIVE = 5` hedef sınırı; istek arası `SQLI_REQUEST_DELAY_MS` (default 200ms) rate-limit
- Sadece `GET` method; payload kategorileri: error-based, boolean_true/boolean_false, 5xx tetikleyici — **veri dump / login bypass / destructive payload yok**
- Sinyaller: `SQL_ERROR_PATTERN`, `STATUS_CODE_CHANGED`, `STATUS_CODE_5XX`, `BODY_LENGTH_DELTA`, `BOOLEAN_TRUE_FALSE_DELTA`
- `SQL_ERROR_PATTERN` bulunursa payload bir kez daha denenir (`confirmed`); body/status dalgalanması tek başına confirm saymaz
- Risk: `computeRisk()` sinyal+confirmed kombinasyonundan LOW/MEDIUM/HIGH/CRITICAL üretir
- Dönüş: `SqliCheckResult { enabled, skipped, skipReason?, targetCount, testedParams, suspectedCount, results[], checkedAt, error? }`

**checkVisualAnalysis** (`checks/visual.check.ts` + `checks/visual/{screenshot,dom-extract,rule-analyzer,ai-visual-analyzer,visual-persistence}.ts`)
- **Playwright (chromium) ile screenshot + DOM çıkarımı + rule-based sinyal + opsiyonel AI vision**
- Guard: `ENABLE_VISUAL_ANALYSIS=true`; sadece VERIFIED+DOMAIN; `NOT_DOMAIN` / `NOT_VERIFIED` / `INVALID_URL` / `PAGE_LOAD_FAILED` skip/error nedenleri
- Çalıştırmadan önce: `pnpm --filter worker exec playwright install chromium`
- Screenshot diske yazılır (`VISUAL_SCREENSHOT_DIR`, default `os.tmpdir()/asm-visual-screenshots`); path traversal koruması bu root ile sınırlı
- DOM özet: title, metaDescription, h1, visibleText (8000 char ile kırpılır), formCount/inputCount/linkCount, detectedKeywords
- Rule-based sinyaller (finding üretir): `LOGIN_PANEL_VISIBLE`, `ADMIN_PANEL_VISIBLE`, `DEFAULT_SERVER_PAGE_VISIBLE`, `ERROR_PAGE_VISIBLE`, `EMPTY_PAGE_DETECTED`
- AI vision (opsiyonel, `ENABLE_VISUAL_AI=true`): Ollama `llava` modeline screenshot gönderilir → sitePurpose/visualSummary/securitySignals/riskLevel; AI hatası check'i/scan'i **patlatmaz** (`aiVisualAnalysis.error` alanına yazılır)
- Visual check gerçekten çalıştıysa (`!skipped && !error`) `persistVisualAnalysisRun` ile `VisualAnalysisRun` tablosuna kayıt; `visualRunId` finding dataJson'ına `screenshotUrlHint` üretmek için geçer
- Dönüş: `VisualAnalysisResult { enabled, skipped, skipReason?, url, finalUrl, statusCode, screenshotPath/Hash/Width/Height, title, visibleText, siteCategory, signals[], riskLevel, analysis{...}, aiVisualAnalysis, checkedAt, error? }`

#### Finding Tipleri

| Tip | Kaynak | Açıklama |
|-----|--------|----------|
| `PORT_EXPOSED` | ports | Riskli/kritik port açık |
| `PORT_CHANGE` | ports | Port durumu değişti |
| `TLS_CHECK` | tls | TLS bağlantısı başarısız |
| `TLS_EXPIRING` | tls | Sertifika yakında sona eriyor |
| `TLS_CHANGE` | tls | Sertifika fingerprint/serial değişti |
| `HTTP_HEALTH` | http | HTTP hata veya erişilemiyor |
| `HTTP_CHANGE` | http | HTTP status/latency değişti |
| `SECURITY_HEADER_MISSING` | headers | Zorunlu güvenlik başlığı eksik |
| `DNS_RECORD_CHANGE` | dns | A/AAAA/CNAME/CAA/SOA kayıtları değişti |
| `DNS_NS_CHANGE` | dns | Nameserver değişti — olası domain hijacking (CRITICAL) |
| `DNS_MX_CHANGE` | dns | Mail exchange değişti — olası email yönlendirme (HIGH) |
| `DNS_TXT_CHANGE` | dns | TXT kayıtları değişti — SPF/DMARC etkisi (MEDIUM) |
| `DNS_SPF_MISSING` | dns | SPF kaydı yok — domain spoofing riski (MEDIUM, aiScore 60) |
| `DNS_DMARC_MISSING` | dns | DMARC kaydı yok — email authentication eksik (HIGH, aiScore 75) |
| `DNS_DMARC_WEAK_POLICY` | dns | DMARC `p=none` — izleme var ama koruma yok (MEDIUM, aiScore 65) |
| `DNS_CAA_MISSING` | dns | CAA kaydı yok — herhangi bir CA sertifika üretebilir (LOW, aiScore 35) |
| `WHOIS_EXPIRING` | rdap | Domain kaydı 30 gün içinde sona eriyor — ≤7g CRITICAL, ≤15g HIGH, ≤30g MEDIUM |
| `WHOIS_CHANGE` | rdap | Registrar/nameServers/status/expiresDate değişti — en yüksek alan seviyesi |
| `ASN_CHANGE` | geoip | ASN değişti — hosting/CDN değişimi veya BGP anomalisi (HIGH, aiScore 80) |
| `GEOIP_CHANGE` | geoip | Ülke/şehir/ISP/org değişti — ülke+org birlikte → HIGH, aksi MEDIUM/LOW |
| `ROBOTS_SENSITIVE_PATH_EXPOSED` | robots | Hassas Disallow path'i var — HIGH-risk path varsa HIGH (75), aksi MEDIUM (55) |
| `ROBOTS_CHANGE` | robots | robots.txt içeriği değişti (contentHash) — LOW, aiScore 30 |
| `PHISHING_DETECTED` | phishtank | Domain/subdomain phishing listesinde — verified+online→CRITICAL (95), verified only→HIGH (85), sadece eşleşme→MEDIUM (65) |
| `MALICIOUS_REPUTATION_DETECTED` | reputation | Tehdit istihbaratı/abuse listesinde — score≥90→CRITICAL (95), ≥70→HIGH (85), ≥40→MEDIUM (65), >0→LOW (35), score yok→HIGH (85) |
| `BREACH_EXPOSURE_DETECTED` | breach | Bilinen veri sızıntısında — password/plaintext_password→CRITICAL (95), password_hash veya ≥5 breach→HIGH (85), diğer→MEDIUM (65) |
| `OTX_MALWARE_ACTIVITY_DETECTED` | otx | AlienVault OTX malware kaydı var — ≥3 sample→CRITICAL (95), ≥1→HIGH (85) |
| `OTX_PULSE_DETECTED` | otx | AlienVault OTX tehdit pulse'ı var — ≥5 pulse→HIGH (80), ≥1→MEDIUM (60) |
| `SQL_INJECTION_SUSPECTED` | sqli | SQLi sinyali tespit edildi — severity `computeRisk()` ile (LOW 35 / MEDIUM 65 / HIGH 85 / CRITICAL 95); key `SQLI:<asset>:<path>:<param>`; sinyal yoksa resolve |
| `LOGIN_PANEL_VISIBLE` | visual | Login formu görünür — LOW (35); key `VISUAL:<signal>:<asset>` |
| `ADMIN_PANEL_VISIBLE` | visual | Admin panel ipucu — tek başına MEDIUM (65), LOGIN/ERROR ile birlikte HIGH (85) |
| `DEFAULT_SERVER_PAGE_VISIBLE` | visual | Varsayılan sunucu sayfası (nginx/apache default) — MEDIUM (65) |
| `ERROR_PAGE_VISIBLE` | visual | Hata sayfası görünür — MEDIUM (65) |
| `EMPTY_PAGE_DETECTED` | visual | Boş/içeriksiz sayfa — LOW (35) |
| `VISUAL_CHANGE_DETECTED` | visual | Önceki taramaya göre screenshot ve/veya visibleText hash'i değişti — hem screenshot hem metin → MEDIUM (50), biri → LOW (30); key `VISUAL_CHANGE:<asset>`; baseline yoksa/değişiklik yoksa resolve |

> Sinyal kaybolduğunda visual finding'ler otomatik resolve edilir (her scan'de 5 sinyalin tamamı + VISUAL_CHANGE için upsert/resolve kontrolü). VISUAL_CHANGE_DETECTED, önceki DONE taramanın `VISUAL_ANALYSIS` snapshot'ındaki `screenshotHash`/`visibleTextHash` ile karşılaştırılır (`run-scan.ts`'te `prevVisualSnap` olarak yüklenip `processVisualFindings`'e `previous` ile geçer); önceki snapshot skipped/error ise baseline sayılmaz. SQLi finding'leri sadece `skipped`/`error` değilken resolve edilebilir.

#### Finding Upsert Mantığı (`utils/finding.ts`)

Finding'ler `(assetId, key)` çiftine göre unique'tir. `upsertFinding`:
- Varsa `lastSeenAt` ve `scanRunId` günceller, `resolvedAt`'ı temizler
- Yoksa yeni kayıt oluşturur, `isNew: true` ile

`resolveFinding`: `resolvedAt = now()` set eder (sorun geçti)

---

### apps/web — React Frontend

**Port:** 5173 | **Framework:** React 18 + Vite 5 | **Style:** Tailwind CSS 3

#### Sayfa ve Bileşenler

```
src/
├── pages/
│   ├── LoginPage.tsx              # Login/Register tabları
│   ├── AssetsPage.tsx             # Asset listesi + ekleme/doğrulama modalleri
│   ├── AssetDetailPage.tsx        # Bulgu detayları + tarama geçmişi
│   ├── intelligence/
│   │   ├── ThreatIntelligencePage.tsx   # Threat intel özet sayfası (statik)
│   │   └── ReputationCenterPage.tsx     # Reputation açıklama sayfası (statik)
│   └── knowledge/
│       ├── AboutPage.tsx          # ASM hakkında, mimari, ownership verification
│       ├── TechnicalInfoPage.tsx  # Veri modeli, check tipleri, aiScore açıklaması
│       ├── PortGuidePage.tsx      # Port güvenliği rehberi + PORT_EXPOSED/PORT_CHANGE
│       ├── DnsSecurityPage.tsx    # DNS kayıt tipleri + SPF/DMARC/CAA finding'leri
│       ├── TlsGuidePage.tsx       # TLS sertifika alanları + expiry thresholds
│       ├── HttpHeadersPage.tsx    # 6 güvenlik başlığı + SECURITY_HEADER_MISSING
│       └── RiskScoringPage.tsx    # Severity/aiScore yorumlama + intelligence skorları
├── components/
│   ├── Layout.tsx                 # Sidebar navigasyonu (3 grup: Monitör/Intelligence/Bilgi Merkezi)
│   ├── ProtectedRoute.tsx         # JWT yoksa /login'e yönlendir
│   ├── Badge.tsx                  # Severity/status renk rozetleri
│   ├── Spinner.tsx                # Yükleme göstergesi
│   └── knowledge/
│       ├── KnowledgePage.tsx      # Sayfa wrapper (başlık, açıklama, badge)
│       ├── KnowledgeCard.tsx      # Bilgi kartı (accent border, icon, badge)
│       ├── ConceptBlock.tsx       # Kavram tanımı (term + definition + finding badge)
│       └── InfoTable.tsx          # Tablo bileşeni (bordered, dark theme)
├── api/
│   ├── client.ts                  # Axios instance + interceptor (401 → logout)
│   └── api.ts                     # Tüm API fonksiyonları
├── context/
│   └── AuthContext.tsx            # Token localStorage yönetimi
├── utils/
│   └── findingDisplay.ts          # getTurkishAiReport() — dil tespiti + type-based Türkçe fallback
└── types.ts                       # Frontend tipleri
```

#### Route Yapısı (App.tsx)

| Path | Sayfa | Açıklama |
|------|-------|----------|
| `/dashboard` | DashboardPage | Global bulgu trendi (7g/30g) + örüntü analizi; sidebar "Overview" grubu |
| `/assets` | AssetsPage | Asset listesi |
| `/assets/:id` | AssetDetailPage | Asset detayı |
| `/intelligence/lookup` | PassiveLookupPage | Passive tehdit istihbaratı sorgusu (OTX, aktif tarama yok) |
| `/intelligence/threat` | ThreatIntelligencePage | Threat intel özeti |
| `/intelligence/reputation` | ReputationCenterPage | Reputation açıklaması |
| `/about` | AboutPage | ASM hakkında |
| `/knowledge/technical` | TechnicalInfoPage | Teknik kavramlar |
| `/knowledge/ports` | PortGuidePage | Port güvenliği |
| `/knowledge/dns` | DnsSecurityPage | DNS güvenliği |
| `/knowledge/tls` | TlsGuidePage | TLS/SSL rehberi |
| `/knowledge/http-headers` | HttpHeadersPage | HTTP başlık güvenliği |
| `/knowledge/risk-scoring` | RiskScoringPage | Risk değerlendirmesi |

#### State Yönetimi

TanStack React Query kullanılır. Cache stratejisi:
- Assets: `staleTime: 30s`, manuel invalidate (mutasyon sonrası)
- Findings: `staleTime: 60s`, filtre değişince refetch
- Scan history: aktif tarama varsa 5s polling

#### Renk Şeması (Tailwind dark theme)

- Arkaplan: `#0c0e14`, `#0a0f1c`, `#080c18`
- Vurgu: `blue-500` → `violet-600` gradient
- Severity renkleri: `red` (CRITICAL), `orange` (HIGH), `yellow` (MEDIUM), `blue` (LOW)

---

## Veritabanı Şeması

### Modeller

```
User
  id          String    @id @default(cuid())
  email       String    @unique
  password    String
  createdAt   DateTime  @default(now())
  assets      Asset[]
  passiveLookupRuns  PassiveLookupRun[]

Asset
  id            String      @id @default(cuid())
  userId        String
  type          AssetType   (DOMAIN | IP)
  value         String
  status        AssetStatus (PENDING | VERIFIED)
  critical      Boolean     @default(false)
  scanInterval  String      @default("24h")
  createdAt     DateTime    @default(now())
  @@unique([type, value, userId])

AssetVerification
  id          String    @id @default(cuid())
  assetId     String
  method      String    (DNS_TXT | HTTP_FILE)
  token       String
  createdAt   DateTime  @default(now())
  verifiedAt  DateTime?

ScanRun
  id          String        @id @default(cuid())
  assetId     String
  startedAt   DateTime      @default(now())
  finishedAt  DateTime?
  status      ScanRunStatus (RUNNING | DONE | FAILED)
  findingsCount Int @default(0)  -- tarama bitişinde dondurulan aktif bulgu sayısı (kalıcı; scanRunId taşınmasından etkilenmez)

ScanCheckResult
  id          String    @id @default(cuid())
  scanRunId   String
  type        String    (PORTS | TLS_INFO | HTTP_HEALTH | SECURITY_HEADERS)
  dataJson    Json      -- check sonucunun tam snapshot'ı
  createdAt   DateTime  @default(now())

Finding
  id          String    @id @default(cuid())
  assetId     String
  scanRunId   String
  type        String    -- FindingType sabiti
  key         String    -- asset başına unique identifier
  severity    Severity  (LOW | MEDIUM | HIGH | CRITICAL)
  dataJson    Json      -- teknik detaylar
  aiScore     Int       -- 0-100 risk puanı (ZORUNLU — processor static skorla doldurur, AI sonradan zenginleştirir)
  aiWhyJson   Json      -- ZORUNLU; {summary, reasons, recommendations, context, impact}
  isNew       Boolean   @default(true)
  createdAt   DateTime  @default(now())
  lastSeenAt  DateTime  @default(now())
  resolvedAt  DateTime?
  @@unique([assetId, key])

PassiveLookupRun
  id             String    @id @default(cuid())
  userId         String
  target         String                    -- normalize edilmiş domain veya IPv4
  targetType     String                    -- "DOMAIN" | "IP"
  source         String    @default("OTX")
  status         String    @default("DONE") -- "DONE" | "ERROR" | "SKIPPED"
  otxJson        Json?                     -- OtxLookupResult snapshot (API key içermez)
  aiSummary      String?                   -- Türkçe template-based özet
  aiRecommendations Json?                  -- String[] Türkçe öneriler
  error          String?
  checkedAt      DateTime  @default(now())
  createdAt      DateTime  @default(now())
  @@index([userId])
  @@index([userId, checkedAt])
  @@index([target])

SqliTarget                              -- kullanıcının eklediği SQLi probe hedefleri
  id          String    @id @default(cuid())
  assetId     String                    -- onDelete: Cascade
  method      String                    -- MVP: sadece "GET"
  path        String                    -- örn "/product" veya "/search"
  paramsJson  Json                      -- örn { "id": "1" }
  injectParam String                    -- paramsJson içindeki enjekte edilecek key
  enabled     Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  @@index([assetId])
  @@index([assetId, enabled])

VisualAnalysisRun                       -- verified asset görsel analiz çalışması
  id          String    @id @default(cuid())
  assetId     String                    -- onDelete: Cascade
  url / finalUrl / statusCode
  screenshotPath/Hash/Width/Height
  title / metaDescription / h1TextsJson / visibleText (@db.Text) / visibleTextHash
  siteCategory / purposeSummary / language / signalsJson / analysisJson / riskLevel
  error       String?
  createdAt / updatedAt
  @@index([assetId, createdAt])
  @@index([url])

PublicVisualAnalysisRun                 -- verified asset gerektirmeyen public URL analizi
  id          String    @id @default(cuid())
  userId      String                    -- onDelete: Cascade
  url / finalUrl / statusCode
  status      String    @default("RUNNING")  -- RUNNING | DONE | FAILED (frontend polling)
  screenshotPath/Hash/Width/Height
  title / metaDescription / h1TextsJson / visibleText (@db.Text) / visibleTextHash
  ruleSiteCategory / rulePurposeSummary / ruleLanguage / ruleSignalsJson / ruleRiskLevel
  aiVisualAnalysisJson Json?            -- tam AiVisualAnalysisResult JSON
  error       String?
  createdAt / updatedAt / finishedAt
  @@index([userId, createdAt])
  @@index([status])
```

### Migration Geçmişi

| Tarih | Migration | İçerik |
|-------|-----------|--------|
| 2026-02-24 | `init` | Temel schema (User, Asset, ScanRun, Finding) |
| 2026-02-25 | `add_finding_key_severity_lastseen` | key, severity, lastSeenAt, aiScore index |
| 2026-03-01 | `add_scan_check_result` | ScanCheckResult tablosu |
| 2026-03-01 | `add_finding_resolved_at` | Finding.resolvedAt |
| 2026-04-28 | `add_asset_scan_interval` | Asset.scanInterval |
| 2026-05-22 | `baseline_passive_lookup_run` | PassiveLookupRun tablosu (passive OTX lookup geçmişi) |
| 2026-05-22 | `add_sqli_target` | SqliTarget tablosu |
| 2026-05-25 | `add_visual_analysis` | VisualAnalysisRun tablosu |
| 2026-05-29 | `add_public_visual_analysis_run` | PublicVisualAnalysisRun tablosu |
| 2026-06-01 | `add_scanrun_findings_count` | ScanRun.findingsCount (tarama bitişinde dondurulan kalıcı bulgu sayısı) |

> `DNS_RECORDS` (ve `SQLI_PROBE` / `VISUAL_ANALYSIS`) check tipleri yalnızca uygulama katmanında tanımlanmıştır. `ScanCheckResult.type` sütunu `String` tipinde olduğundan yeni check tipi için migration gerekmez.

---

## API Referansı

### Kimlik Doğrulama (`/auth`)

| Method | Endpoint | Auth | Açıklama |
|--------|----------|------|----------|
| POST | `/auth/register` | ✗ | Yeni kullanıcı kaydı |
| POST | `/auth/login` | ✗ | Giriş, JWT döner |
| GET | `/auth/me` | ✓ | Mevcut kullanıcı bilgisi |

### Varlıklar (`/assets`)

| Method | Endpoint | Auth | Açıklama |
|--------|----------|------|----------|
| GET | `/assets` | ✓ | Sayfalı liste (`page`, `limit`) |
| POST | `/assets` | ✓ | Yeni asset oluştur |
| GET | `/assets/:id` | ✓ | Asset detayı |
| GET | `/assets/:id/intelligence` | ✓ | Son intelligence snapshot'ları (DNS, RDAP, GeoIP, Robots, PhishTank, Reputation, Breach) |
| DELETE | `/assets/:id` | ✓ | Asset ve ilişkili verileri sil |
| PATCH | `/assets/:id/critical` | ✓ | Kritik flag güncelle |
| PATCH | `/assets/:id/scan-interval` | ✓ | Tarama sıklığı güncelle |
| POST | `/assets/:id/verify/dev` | ✓ | Dev: anında doğrula (prod'da kapalı) |
| POST | `/assets/:id/verify/request-token` | ✓ | HTTP dosya token'ı iste |
| POST | `/assets/:id/verify/http` | ✓ | HTTP doğrulamasını tamamla |
| POST | `/assets/:id/verify/request-dns-token` | ✓ | DNS TXT token'ı iste |
| POST | `/assets/:id/verify/dns` | ✓ | DNS doğrulamasını tamamla |

### Taramalar (`/scans`)

| Method | Endpoint | Auth | Açıklama |
|--------|----------|------|----------|
| POST | `/scans/run-now?assetId=X` | ✓ | Anında tarama kuyruğa ekle |
| GET | `/scans/history?assetId=X` | ✓ | Tarama geçmişi (her satır `findingsCount` taşır) |
| GET | `/scans/:scanRunId/checks` | ✓ | Bir taramanın **tüm** check snapshot'ları (temiz + sorunlu) — "akış" görünümü; ownership scanRun→asset→userId; `{ scanRunId, status, items: [{ id, type, dataJson, createdAt }] }` |

### Pasif Intelligence (`/intelligence`)

| Method | Endpoint | Auth | Açıklama |
|--------|----------|------|----------|
| GET | `/intelligence/lookup?target=X` | ✓ | Passive OTX sorgusu; sonuç DB'ye kaydedilir, asset/finding oluşturmaz |
| GET | `/intelligence/history` | ✓ | Kullanıcının passive lookup geçmişi (`page`, `limit` opsiyonel) |
| GET | `/intelligence/history/:id` | ✓ | Tek kayıt detayı (otxJson + aiSummary + aiRecommendations); başkasının kaydı 404 döner |
| POST | `/intelligence/history/:id/ask` | ✓ | OTX verisi bağlamında AI'ya soru sor; `{question}` body, `{answer, usedContext}` yanıt; chat DB'ye kaydedilmez |

### Bulgular (`/findings`)

| Method | Endpoint | Auth | Açıklama |
|--------|----------|------|----------|
| GET | `/findings?assetId=X&severity=&resolved=&isNew=&page=&limit=` | ✓ | Filtreli bulgu listesi |
| PATCH | `/findings/:id/ack` | ✓ | Bulguyu onayla (isNew=false) |
| PATCH | `/findings/:id/resolve` | ✓ | Bulguyu manuel çöz (resolvedAt set, isNew=false); sorun bir sonraki taramada hâlâ varsa worker upsert ile yeniden açar |
| PATCH | `/findings/:id/reopen` | ✓ | Manuel çözülmüş bulguyu yeniden aç (resolvedAt=null) |

### SQLi Hedefleri (`/assets/:assetId/sqli-targets`)

| Method | Endpoint | Auth | Açıklama |
|--------|----------|------|----------|
| GET | `/assets/:assetId/sqli-targets` | ✓ | Asset'in SQLi probe hedeflerini listele |
| POST | `/assets/:assetId/sqli-targets` | ✓ | Yeni hedef ekle (asset başına max 5) |
| PATCH | `/assets/:assetId/sqli-targets/:id` | ✓ | Hedef güncelle (path, params, injectParam, enabled) |
| DELETE | `/assets/:assetId/sqli-targets/:id` | ✓ | Hedef sil |

### Görsel Analiz (`/assets/:assetId/visual-analysis`)

| Method | Endpoint | Auth | Açıklama |
|--------|----------|------|----------|
| GET | `/assets/:assetId/visual-analysis` | ✓ | Son görsel analiz çalışmaları (`limit` opsiyonel) |
| GET | `/assets/:assetId/visual-analysis/:runId` | ✓ | Çalışma detayı (visibleText + raw analysis) |
| GET | `/assets/:assetId/visual-analysis/:runId/screenshot` | ✓ | Screenshot PNG stream (image/png) |

### Public Görsel Analiz (`/visual-analysis/public`)

| Method | Endpoint | Auth | Açıklama |
|--------|----------|------|----------|
| POST | `/visual-analysis/public` | ✓ | Public URL görsel analizi başlat (SSRF-guard'lı, asset gerekmez); `{url}` body |
| GET | `/visual-analysis/public` | ✓ | Kullanıcının son public analizleri (`limit` opsiyonel) |
| GET | `/visual-analysis/public/:runId` | ✓ | Çalışma detayı (frontend polling — status RUNNING→DONE/FAILED) |
| GET | `/visual-analysis/public/:runId/screenshot` | ✓ | Screenshot PNG stream |

### AI Asistan (`/assets/:id/assistant`)

| Method | Endpoint | Auth | Açıklama |
|--------|----------|------|----------|
| POST | `/assets/:id/assistant/chat` | ✓ | Asset bağlamında AI ile sohbet (Türkçe); `{message}` body; **rate-limit 10 istek/60s** |

### Dashboard (`/dashboard`)

| Method | Endpoint | Auth | Açıklama |
|--------|----------|------|----------|
| GET | `/dashboard/trends?window=7d\|30d` | ✓ | Kullanıcının **tüm** asset'lerindeki bulguların global severity trendi (default 30d). Günlük yeni-bulgu bucket'ları (UTC, severity'ye göre), `totals`, ve **örüntü çıkarımı** (`insight`): önceki eşit döneme göre trend (up/down/flat ±%5 eşik), `dominantSeverity`, en yoğun gün, açık CRITICAL/HIGH sayısı, Türkçe özet cümle |

### Swagger Dökümantasyonu

`http://localhost:3000/docs` adresinde erişilebilir (development).

---

## Tarama Motoru

### Job Kuyruğu

- **Queue name:** `scan`
- **Job name:** `scan.run`
- **DLQ:** `scan-dlq` (3 deneme başarısız olursa)
- **Retry:** 3 deneme, exponential backoff (2s, 4s, 8s)
- **Payload:** `{ assetId: string, scanRunId?: string }`

### Job ID Stratejisi

| Tür | JobId Format | Payload |
|-----|-------------|---------|
| Scheduled (otomatik) | `scan:schedule:<assetId>` | `{ assetId }` |
| Manual (run-now) | `scan:manual:<scanRunId>` | `{ scanRunId, assetId }` |

Worker'da ayrım: `job.data.scanRunId ? 'manual' : 'scheduled'`

### Zamanlama

`ScanScheduleService` BullMQ'nun `repeat` özelliğini kullanır:
- Sadece **VERIFIED** asset'ler için scheduled job oluşturulur (verify sonrası: devVerify, verifyHttp, verifyDns)
- Her asset için jobId `scan:schedule:<assetId>` — unique, duplicate oluşmaz
- Interval değişince: tüm mevcut matching job'lar silinir (duplicate temizleme), yeni oluşturulur
- Asset silinince: `unschedule()` ile ilgili tüm repeat job'lar kaldırılır
- PENDING asset için scheduled scan oluşmaz

### Job Options (Scheduled & Manual)

```
attempts: 3
backoff: { type: 'exponential', delay: 2000 }
removeOnComplete: { age: 86400, count: 1000 }
removeOnFail: { age: 604800, count: 1000 }
```

### Değişiklik Tespiti

Her taramada önceki `DONE` status'lu ScanRun'un snapshot'ı yüklenir. Karşılaştırılan değerler:
- **Portlar:** Açık port listesi farklıysa `PORT_CHANGE` finding'i
- **TLS:** Fingerprint veya serial farklıysa `TLS_CHANGE` finding'i
- **HTTP:** Status kodu veya latency eşiği aşıldıysa `HTTP_CHANGE` finding'i

---

## AI Analiz Sistemi

### Providers

**Anthropic Claude** (önerilen production):
- `ANTHROPIC_API_KEY` gerekli
- Varsayılan model: `claude-haiku-4-5-20251001`
- `ANTHROPIC_MODEL` env ile değiştirilebilir

**Ollama** (varsayılan, ücretsiz local):
- `OLLAMA_HOST=http://localhost:11434`
- `OLLAMA_MODEL=llama3.2`

`AI_PROVIDER` env değişkeniyle seçilir.

### Analiz Kapsamı

- `SECURITY_HEADER_MISSING` tipleri **dahil edilmez** (statik skor zaten var)
- Sadece `resolvedAt: null` olan aktif finding'ler analiz edilir
- Analiz sonucu `Finding.aiScore` ve `Finding.aiWhyJson`'a yazılır

### Prompt Yapısı

```
System: Cybersecurity analyst, JSON-only yanıt ver

User:  Asset: <value> (type: <type>)
       Findings: [{key, type, severity, data}]
       
       Return JSON array: [{key, aiScore(0-100), aiWhyJson{summary,reasons,recommendations,context}}]
```

### Fallback

AI başarısız olursa (API hatası, parse hatası) mevcut statik skorlar korunur. Log kaydı tutulur.

---

## Kimlik Doğrulama ve Güvenlik

### JWT Akışı

1. `POST /auth/register` → email + password → bcrypt (10 round) → User kaydı
2. `POST /auth/login` → email + password → JWT imzala (`JWT_SECRET`)
3. Frontend: token `localStorage`'a yaz, her istekte `Authorization: Bearer <token>` header'ı
4. Backend: `JwtAuthGuard` → `JwtStrategy` → token doğrula → `request.user` set et
5. `@CurrentUser()` decorator ile controller'larda `user.id` ve `user.email` erişimi

### Rate Limiting

- Global ThrottlerGuard: 60 req/60s per IP
- Endpoint bazlı özelleştirme: `@Throttle()` decorator kullanılabilir

### Asset Doğrulama Güvenliği

- Token: `crypto.randomBytes(16).toString('hex')` (128-bit entropy)
- DNS doğrulaması için güvenilir DNS sunucuları: Cloudflare (`162.159.24.201`, `162.159.25.42`)
- `devVerify` endpoint'i yalnızca `NODE_ENV !== 'production'` ortamında aktif

### Pwned Passwords Kontrolü (Register)

`POST /auth/register` sırasında HIBP Pwned Passwords API'siyle K-Anonymity kontrolü yapılır:
- Şifrenin SHA-1 hash'inin sadece ilk 5 karakteri API'ye gönderilir — plaintext veya tam hash gönderilmez
- `ENABLE_PWNED_PASSWORD_CHECK=false` ile devre dışı bırakılabilir (varsayılan: `true`)
- Şifre pwned ise → `400 Bad Request` ile kayıt reddedilir
- API erişilemezse: `PWNED_PASSWORD_FAILURE_MODE=soft` (varsayılan) → kontrol atlanır, kayıt devam eder; `strict` → kayıt engellenir
- Login veya şifre değiştirme akışında çalışmaz

### CORS Konfigürasyonu

`CORS_ORIGIN` env'den okunur. Birden fazla origin için virgülle ayrılmış liste kullanılabilir.

---

## Kod Stili ve Kurallar

### TypeScript

- **Strictness paketlere göre değişir:** `apps/worker` ve `apps/web` tam `strict: true`. **`apps/api` tam strict DEĞİL** — yalnızca `strictNullChecks: true` açık; `noImplicitAny: false` ve `strictBindCallApply: false` ([apps/api/tsconfig.json](apps/api/tsconfig.json)). API'de tip güvenliği yeni kodda elle korunmalı.
- `any` kullanımından kaçın, `unknown` tercih et
- Interface isimleri `I` prefix'i olmadan (`Asset` değil `IAsset`)
- Enum yerine `as const` object literal tercih edilir (shared'da görüldüğü gibi)

### NestJS Kuralları

- Her modül kendi klasöründe: `*.module.ts`, `*.service.ts`, `*.controller.ts`
- DTO'lar `dto/` klasöründe, class-validator decorator'larıyla
- Business logic servis katmanında, controller'lar sadece HTTP bağlama
- Prisma işlemleri doğrudan servislerde (repository pattern yok)

### Worker Kuralları

- Her check tipi ayrı dosyada (`checks/*.check.ts`)
- Her finding tipi işleme ayrı dosyada (`findings/*.findings.ts`)
- `log()` utility'si tüm log çıktıları için (tag: `[worker]`)
- `upsertFinding` / `resolveFinding` utils kullanılır, doğrudan Prisma çağrısı yapılmaz

### Frontend Kuralları

- Page bileşenleri `pages/` altında, reusable UI `components/` altında
- API fonksiyonları `api/api.ts`'te merkezi olarak
- React Query mutations için `onSuccess`'te cache invalidation
- Tailwind class sırası: layout → spacing → typography → color

---

## Test Stratejisi

### Mevcut Durum

- Unit test altyapısı kurulu (Jest + ts-jest)
- E2E test dosyası mevcut (`apps/api/test/app.e2e-spec.ts`)
- **Test coverage düşük** — kritik servisler için yazılması gerekiyor

### Test Komutları

```bash
# API unit testler
cd apps/api && pnpm test

# API e2e testler
cd apps/api && pnpm test:e2e

# Watch mode
cd apps/api && pnpm test:watch
```

### Test Edilmesi Gereken Kritik Noktalar

1. `AssetsService.verifyDns` — DNS mock ile doğrulama akışı
2. `AssetsService.verifyHttp` — HTTP fetch mock ile
3. `processPortFindings` — Finding upsert/resolve mantığı
4. `analyzeFindings` — AI response parse etme ve fallback
5. API auth guard'ları — 401/403 senaryoları

---

## Gelecek Planlar (Roadmap)

> Bu bölüm proje yönünü ve öncelikli geliştirmeleri gösterir.
> Her sprint/geliştirmeden sonra güncellenmeli.

### Kısa Vadeli (Yakın Öncelik)

- [x] **DNS Record Monitoring** _(2026-05-09)_: A, AAAA, MX, NS, TXT, CNAME, SOA, CAA kayıtları toplanıp `DNS_RECORDS` snapshot olarak kaydediliyor
- [x] **DNS Change Finding sistemi** _(2026-05-09)_: `DNS_RECORD_CHANGE` (A/AAAA/CNAME/CAA/SOA), `DNS_NS_CHANGE` (CRITICAL), `DNS_MX_CHANGE` (HIGH), `DNS_TXT_CHANGE` (MEDIUM) finding'leri üretiliyor
- [x] **DNS Security Config finding sistemi** _(2026-05-09)_: `DNS_SPF_MISSING`, `DNS_DMARC_MISSING`, `DNS_DMARC_WEAK_POLICY` (`p=none`), `DNS_CAA_MISSING` — ilk taramadan itibaren çalışır, önceki snapshot gerekmez
- [x] **WHOIS/RDAP Intelligence** _(2026-05-09)_: `RDAP_INFO` snapshot, `WHOIS_EXPIRING` (≤30g), `WHOIS_CHANGE` (registrar/NS/status/expiresDate); RDAP hatasında finding üretilmez, snapshot `error` alanıyla kaydedilir
- [x] **GeoIP/ASN/ISP Intelligence** _(2026-05-09)_: `GEOIP_INFO` snapshot (DOMAIN+IP), `ASN_CHANGE` (HIGH), `GEOIP_CHANGE` (country+org→HIGH, diğer→MEDIUM/LOW); ip-api.com ücretsiz, API key gerekmez
- [x] **robots.txt Analysis** _(2026-05-09)_: `ROBOTS_TXT` snapshot, `ROBOTS_SENSITIVE_PATH_EXPOSED` (HIGH-risk path →HIGH, diğer→MEDIUM), `ROBOTS_CHANGE` (contentHash); HTTPS→HTTP fallback, hata scan'i patlatmaz
- [x] **PhishTank Reputation** _(2026-05-09)_: `PHISHTANK_REPUTATION` snapshot (sadece DOMAIN), `PHISHING_DETECTED` finding (verified+online→CRITICAL, verified→HIGH, eşleşme→MEDIUM); `ENABLE_PHISHTANK=false` ise skipped, hata durumunda scan patlamaz, skipped/error ise eski finding resolve edilmez
- [x] **Malicious Reputation** _(2026-05-09)_: `MALICIOUS_REPUTATION` snapshot (DOMAIN+IP), `MALICIOUS_REPUTATION_DETECTED` finding; IP→AbuseIPDB (key zorunlu), DOMAIN→URLhaus (ücretsiz); score≥90→CRITICAL, ≥70→HIGH, ≥40→MEDIUM, >0→LOW; ALL_PROVIDERS_FAILED durumunda scan patlamaz ve eski finding resolve edilmez
- [x] **Breach Exposure** _(2026-05-09)_: `BREACH_EXPOSURE` snapshot (sadece DOMAIN), `BREACH_EXPOSURE_DETECTED` finding; provider=mock|hibp|leakcheck; password→CRITICAL, password_hash/≥5 breach→HIGH, diğer→MEDIUM; skipped/error ise eski finding resolve edilmez; credential içeriği saklanmaz
- [x] **Pwned Passwords Auth Security** _(2026-05-09)_: Register sırasında HIBP K-Anonymity kontrolü; SHA-1 prefix (5 karakter) gönderilir, plaintext/tam hash gönderilmez; pwned şifre 400 ile reddedilir; soft/strict failure mode; `ENABLE_PWNED_PASSWORD_CHECK=false` ile devre dışı
- [x] **Worker Stability / Scan Reliability** _(2026-05-09)_: `safeCheck` wrapper ile 11 check izole edildi; crash → typed fallback, scan devam eder; snapshot kayıt `Promise.allSettled`; her finding processor try/catch ile izole; port/DNS/robots finding processor'larındaki yanlış resolve bug'ları düzeltildi; `FAILED` sadece kritik hatada
- [x] **Scan Scheduling / Queue Reliability** _(2026-05-09)_: JobId stratejisi netleştirildi (`scan:schedule:<id>` / `scan:manual:<id>`); scheduled job'lara retry/backoff/removeOn eklendi; `unschedule` tüm duplicate'leri kaldırıyor; PENDING asset'e schedule kurulmuyor; worker'da scheduled/manual log ayrımı; 9 test
- [x] **Backend Intelligence Endpoint** _(2026-05-09)_: `GET /assets/:id/intelligence` eklendi; 8 check tipi için son DONE scan snapshot'ları paralel sorgulanır; `lastUpdatedAt` en son snapshot tarihidir; ownership kontrolü
- [x] **AlienVault OTX Intelligence Integration** _(2026-05-11)_: `OTX_INTELLIGENCE` snapshot, `OTX_PULSE_DETECTED` (≥10→MEDIUM/60, ≥1→LOW/45) ve `OTX_MALWARE_ACTIVITY_DETECTED` (≥50→HIGH/80, ≥1→MEDIUM/65) finding'leri; ENABLE_OTX=false ise skipped; safeCheck ile scan asla FAILED olmaz; API key loglanmaz/response'a yazılmaz; domain+IPv4 desteği, IPv6 skipped; intelligence endpoint, assistant context ve frontend kartı güncellendi. **OTX yorumlama notu:** OTX sonuçları kesin zararlılık kanıtı olarak değil, threat intelligence association sinyali olarak yorumlanır; büyük/popüler domainlerde marka taklidi veya analiz referansı nedeniyle ilişki görülebilir.
- [ ] **Test coverage artırma**: Kritik servisler için unit testler yazılacak
- [ ] **Subdomain keşfi**: Bir domain'e bağlı subdomain'leri otomatik keşfedip asset olarak ekleme
- [ ] **CVE/NVD entegrasyonu**: Açık portlardaki servis versiyonlarını NVD ile eşleştirip CVE bulgu üretme
- [ ] **Scan check genişletme**: WHOIS bilgisi, DNS kayıt değişikliği takibi
- [ ] **Kullanıcı profil ayarları**: E-posta bildirimleri, tercih yönetimi

### Orta Vadeli

- [ ] **Multi-tenant / Takım desteği**: Organizasyon bazlı varlık gruplama, rol sistemi (Admin, Analyst, Viewer)
- [ ] **Dashboard**: Genel güvenlik skoru, trend grafikler, en riskli asset'ler listesi
- [ ] **Toplu import**: CSV/CIDR ile toplu domain/IP ekleme
- [ ] **Notification center**: In-app bildirimler, email/Slack entegrasyonu
- [ ] **API key yönetimi**: Programatik erişim için API anahtarı oluşturma

### Uzun Vadeli / Büyük Özellikler

- [ ] **Aktif tarama derinleştirme**: Banner grabbing (servis versiyonu), SSL/TLS grade hesaplama
- [ ] **Exposure yönetimi**: Bulguları ticket sistemine bağlama (Jira, Linear)
- [ ] **SLA takibi**: Finding çözüm süreleri ve SLA ihlali uyarıları
- [ ] **Custom scan politikaları**: Hangi check'lerin çalışacağı, özel port listeleri
- [ ] **Public API**: REST API üzerinden üçüncü taraf entegrasyonları için webhook + API key

### Teknik Borç

- [x] Worker'da `Promise.all` hata yayılımını daha granüler yönet _(safeCheck + allSettled + per-processor try/catch — Adım 10)_
- [ ] ScanCheckResult için partitioning (büyük veri hacimlerinde performans)
- [ ] Redis connection pooling konfigürasyonu
- [ ] Frontend'de token refresh mekanizması (şu an 7 günde bir logout)
- [ ] AI analiz için retry + rate limit yönetimi

---

## Önemli Notlar ve Dikkat Edilmesi Gerekenler

1. **Port 5433 / 6380**: Docker dev ortamında host portlar standart dışı (5433 ve 6380). Production'da standard portlar kullanılabilir, `.env` güncellenmeli.

2. **`devVerify` endpoint**: Sadece development'ta kullanılabilir. `NODE_ENV=production` ortamında otomatik olarak devre dışı kalır.

3. **AI skip**: `AI_PROVIDER=anthropic` seçilip `ANTHROPIC_API_KEY` set edilmezse AI analiz sessizce atlanır, static skorlar korunur.

4. **IP asset'lerde header check yok**: `checkSecurityHeaders` yalnızca DOMAIN tipindeki asset'lerde çalışır, IP adreslerinde atlanır.

5. **Finding resolution**: Bir finding otomatik resolve olmak için bir sonraki taramada sorunun ortadan kalkmış olması gerekir (worker `resolveFinding` çağırır). Ek olarak **manuel resolve/reopen** vardır (`PATCH /findings/:id/resolve` ve `/reopen`): kullanıcı bulguyu elle kapatabilir; ancak sorun sürerse worker bir sonraki taramada `upsertFinding` ile bulguyu yeniden açar — yani manuel resolve kalıcı "yok say" değil, mevcut durumun kabulüdür.

6. **DNS verification DNS sunucusu**: Cloudflare IP'leri hardcoded varsayılan. `DNS_SERVERS` env ile değiştirilebilir.

7. **Monorepo build sırası**: `packages/shared` önce build edilmeli, sonra `apps/*`. `pnpm install` bunu otomatik halleder ama `pnpm build` için dikkat.
