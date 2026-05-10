# ASM — Attack Surface Monitoring

> **Bu dosya projeyi anlamak için birincil kaynak.** Her değişiklik sonrası güncel tutulmalı.
> Son güncelleme: 2026-05-09 — Backend Intelligence Endpoint (Adım 12)

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
│   └── worker/         # BullMQ job worker (tarama motoru)
├── packages/
│   └── shared/         # Ortak TypeScript tipleri ve sabitler
├── pnpm-workspace.yaml # Workspace tanımı
├── package.json        # Root scripts
├── docker-compose.yml  # PostgreSQL + Redis dev servisleri
├── start.bat           # Windows hızlı başlatma scripti
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

# AI provider: 'anthropic' veya 'ollama'
AI_PROVIDER=ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2

# Anthropic (AI_PROVIDER=anthropic ise zorunlu)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# Opsiyonel: n8n webhook bildirimleri
N8N_WEBHOOK_URL=
```

**apps/web/.env**
```
VITE_API_URL=http://localhost:3000
```

### Prisma Komutları

```bash
# Yeni migration oluştur
cd apps/api && pnpm prisma migrate dev --name <migration-adi>

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
| `finding-types.ts` | `FindingTypes` (8 tip) |
| `job-types.ts` | `ScanJobPayload`, `ScanJobResult` |
| `scan-check-types.ts` | `SCAN_CHECK_TYPES` (`PORTS`, `TLS_INFO`, `HTTP_HEALTH`, `SECURITY_HEADERS`, `DNS_RECORDS`, `RDAP_INFO`, `GEOIP_INFO`, `ROBOTS_TXT`, `PHISHTANK_REPUTATION`, `MALICIOUS_REPUTATION`, `BREACH_EXPOSURE`), `SCAN_STATUS` |
| `finding-types.ts` | `FindingTypes` (25 tip — port×2, tls×3, http×2, security_header×1, dns×8, whois×2, geoip×2, robots×2, phishing×1, reputation×1, breach×1) |
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
  ├─ 11 check paralel çalıştır (safeCheck wrapper ile) ─────┐
  │   checkPorts / checkTls / checkHttp                     │
  │   checkSecurityHeaders / checkDnsRecords / checkRdap    │
  │   checkGeoIp / checkRobotsTxt / checkPhishTank          │
  │   checkReputation / checkBreachExposure                 │
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
- Varsayılan portlar: `80, 443, 22, 3389, 8080, 8443, 3000, 5555`
- Paralel TCP socket bağlantısı, 1.5s timeout
- Riskli portlar: `22, 3389, 8080, 8443, 3000, 5555`
- Kritik portlar: `22 (SSH), 3389 (RDP)`

**checkTls** (`checks/tls.check.ts`)
- Host:443'e TLS handshake, `rejectUnauthorized: false`
- Sertifika zinciri, issuer, subject, fingerprint, serial çıkarma
- Gün hesabı: son kullanma tarihine kalan gün
- Eşikler: 7 gün → CRITICAL, 15 gün → HIGH, 30 gün → MEDIUM

**checkHttp** (`checks/http.check.ts`)
- Önce HTTPS dener, başarısız olursa HTTP'ye döner
- 5s timeout, latency ölçümü
- Dönüş: `{statusCode, latencyMs, error, finalUrl}`
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
- `PHISHTANK_FEED_URL` varsa direkt kullanılır; yoksa `PHISHTANK_API_KEY` ile feed URL otomatik oluşturulur (`https://data.phishtank.com/data/<key>/online-valid.json`)
- İkisi de yoksa → `skipped: true, skipReason: 'NO_CREDENTIALS'`
- 15s timeout; erişilemezse `error` alanıyla dolu, `isListed: false` döner — scan patlamamaz
- Domain eşleştirme: URL parse → hostname → `isSameOrSubdomain` (subdomain dahil, `fake-example.com` hariç)
- `verifiedMatches` / `onlineMatches` sayılır; eşleşen URL'ler max 50 ile kırpılır
- Dönüş: `PhishTankCheckResult { domain, provider, enabled, skipped, skipReason?, isListed, verifiedMatches, onlineMatches, matchedUrls[], checkedAt, error? }`

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
- `https://rdap.org/domain/<domain>` endpoint'ini kullanır (çoğu TLD için otomatik yönlendirme)
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
│   ├── LoginPage.tsx        # Login/Register tabları
│   ├── AssetsPage.tsx       # Asset listesi + ekleme/doğrulama modalleri
│   └── AssetDetailPage.tsx  # Bulgu detayları + tarama geçmişi
├── components/
│   ├── Layout.tsx           # Sidebar navigasyonu
│   ├── ProtectedRoute.tsx   # JWT yoksa /login'e yönlendir
│   ├── Badge.tsx            # Severity/status renk rozetleri
│   └── Spinner.tsx          # Yükleme göstergesi
├── api/
│   ├── client.ts            # Axios instance + interceptor (401 → logout)
│   └── api.ts               # Tüm API fonksiyonları
├── context/
│   └── AuthContext.tsx      # Token localStorage yönetimi
└── types.ts                 # Frontend tipleri
```

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
  aiScore     Int?      -- 0-100 AI risk puanı
  aiWhyJson   Json?     -- {summary, reasons, recommendations, context, impact}
  isNew       Boolean   @default(true)
  createdAt   DateTime  @default(now())
  lastSeenAt  DateTime  @default(now())
  resolvedAt  DateTime?
  @@unique([assetId, key])
```

### Migration Geçmişi

| Tarih | Migration | İçerik |
|-------|-----------|--------|
| 2026-02-24 | `init` | Temel schema (User, Asset, ScanRun, Finding) |
| 2026-02-25 | `add_finding_key_severity_lastseen` | key, severity, lastSeenAt, aiScore index |
| 2026-03-01 | `add_scan_check_result` | ScanCheckResult tablosu |
| 2026-03-01 | `add_finding_resolved_at` | Finding.resolvedAt |
| 2026-04-28 | `add_asset_scan_interval` | Asset.scanInterval |

> `DNS_RECORDS` check tipi yalnızca uygulama katmanında tanımlanmıştır. `ScanCheckResult.type` sütunu `String` tipinde olduğundan migration gerekmez.

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
| GET | `/scans/history?assetId=X` | ✓ | Tarama geçmişi |

### Bulgular (`/findings`)

| Method | Endpoint | Auth | Açıklama |
|--------|----------|------|----------|
| GET | `/findings?assetId=X&severity=&resolved=&isNew=&page=&limit=` | ✓ | Filtreli bulgu listesi |
| PATCH | `/findings/:id/ack` | ✓ | Bulguyu onayla (isNew=false) |

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

- Strict mode aktif tüm paketlerde
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
- [x] **Backend Intelligence Endpoint** _(2026-05-09)_: `GET /assets/:id/intelligence` eklendi; 7 check tipi için son DONE scan snapshot'ları paralel sorgulanır; `lastUpdatedAt` en son snapshot tarihidir; ownership kontrolü; 6 service testi + 1 controller testi (toplam 40 test)
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

5. **Finding resolution**: Bir finding resolve edilebilmesi için bir sonraki taramada sorunun ortadan kalkmış olması gerekir (worker `resolveFinding` çağırır). Manuel resolve endpoint'i henüz yok.

6. **DNS verification DNS sunucusu**: Cloudflare IP'leri hardcoded varsayılan. `DNS_SERVERS` env ile değiştirilebilir.

7. **Monorepo build sırası**: `packages/shared` önce build edilmeli, sonra `apps/*`. `pnpm install` bunu otomatik halleder ama `pnpm build` için dikkat.
