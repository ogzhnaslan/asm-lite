import type { Finding } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TurkishAiReport {
  summary: string | null;
  impact: string | null;
  reasons: string[];
  recommendations: string[];
  context?: string | null;
  source: 'ai' | 'fallback';
}

interface FallbackReport {
  summary: string;
  impact: string;
  context?: string;
  reasons?: string[];
  recommendations: string[];
}

// ─── OTX helpers ─────────────────────────────────────────────────────────────

export function isOtxFinding(finding: Finding): boolean {
  return finding.type === 'OTX_PULSE_DETECTED' ||
         finding.type === 'OTX_MALWARE_ACTIVITY_DETECTED';
}

export function getDisplayAiScore(finding: Finding): number {
  if (!isOtxFinding(finding)) return finding.aiScore;

  const data = (finding.dataJson ?? {}) as Record<string, unknown>;
  const malwareCount = Number(data.malwareCount ?? 0);
  const pulseCount   = Number(data.pulseCount ?? 0);

  if (finding.type === 'OTX_MALWARE_ACTIVITY_DETECTED') {
    if (malwareCount >= 50) return 80;
    if (malwareCount >= 1)  return 65;
  }

  if (finding.type === 'OTX_PULSE_DETECTED') {
    if (pulseCount >= 10) return 60;
    if (pulseCount >= 1)  return 45;
  }

  return 45;
}

export function getOtxRiskLabel(finding: Finding): string | null {
  if (!isOtxFinding(finding)) return null;
  const score = getDisplayAiScore(finding);
  if (score >= 70) return 'Güçlü İlişki Sinyali';
  if (score >= 50) return 'Orta İlişki Sinyali';
  return 'Düşük İlişki Sinyali';
}

// ─── English detection ────────────────────────────────────────────────────────

const ENGLISH_MARKERS = [
  'changed', 'change', 'domain', 'attacker', 'immediately', 'confirm',
  'records', 'control', 'unauthorized', 'detected', 'missing', 'recommend',
  'enable', 'nameserver', 'hijacking', 'indicator', 'transfer', 'traffic',
  'certificate', 'configuration', 'exposure', 'indicates', 'potential',
  'verify', 'check', 'ensure', 'update', 'review', 'investigate', 'monitor',
  'implement', 'configure', 'deploy', 'register', 'recovery', 'initiate',
  'hosting', 'provider', 'server', 'network', 'protocol', 'policy',
  'activity', 'malware', 'threat', 'intelligence', 'association', 'reference',
  'presence', 'known', 'because', 'found', 'indicates', 'suggests',
];

function isLikelyEnglish(text: string): boolean {
  if (!text || text.trim().length === 0) return false;

  if (/[çğıöşüÇĞİÖŞÜ]/.test(text)) return false;

  const turkishWords = ['için', 'olan', 'veya', 'ile', 'bir', 'bu', 'değil', 'ise', 'olarak', 'edildi', 'bulundu'];
  const lowerText = text.toLowerCase();
  if (turkishWords.some(w => lowerText.includes(w))) return false;

  const words = lowerText.split(/\W+/);
  const englishCount = words.filter(w => ENGLISH_MARKERS.includes(w)).length;
  const ratio = englishCount / Math.max(words.length, 1);
  return ratio > 0.04 || englishCount >= 3;
}

function isAiWhyEnglish(aiWhy: Finding['aiWhyJson']): boolean {
  if (!aiWhy) return false;
  const allText = [
    aiWhy.summary ?? '',
    aiWhy.impact ?? '',
    ...(aiWhy.reasons ?? []),
    ...(aiWhy.recommendations ?? []),
    aiWhy.context ?? '',
  ].join(' ');
  return isLikelyEnglish(allText);
}

// ─── Türkçe fallback raporlar ─────────────────────────────────────────────────

const SECURITY_HEADER_FALLBACKS: Record<string, FallbackReport> = {
  HSTS: {
    summary: 'HTTP Strict Transport Security (HSTS) başlığı eksik.',
    impact: 'HSTS olmadan tarayıcı HTTP\'ye düşebilir; kullanıcı şifreli kanalın dışına çıkabilir ve ortadaki adam (MITM) saldırısına maruz kalabilir.',
    recommendations: [
      'Strict-Transport-Security başlığını ekle (örn: max-age=31536000; includeSubDomains).',
      'HTTPS yönlendirmesinin tüm HTTP istekleri için etkin olduğundan emin ol.',
      'HSTS preload listesine katılmayı değerlendir.',
    ],
  },
  CSP: {
    summary: 'Content-Security-Policy (CSP) başlığı eksik.',
    impact: 'CSP olmadan XSS (Cross-Site Scripting) saldırıları çok daha kolaydır. Kötü niyetli script içerikleri sayfada çalıştırılabilir.',
    recommendations: [
      'Content-Security-Policy başlığını ekle ve izin verilen kaynakları kısıtla.',
      'Başlangıçta Content-Security-Policy-Report-Only modu ile test et.',
      'Inline script ve eval kullanımını kısıtla.',
    ],
  },
  XFO: {
    summary: 'X-Frame-Options başlığı eksik.',
    impact: 'X-Frame-Options olmadan site bir iframe içine alınabilir; bu clickjacking saldırısına zemin hazırlar ve kullanıcılar yanıltılabilir.',
    recommendations: [
      'X-Frame-Options: DENY veya SAMEORIGIN başlığını ekle.',
      'CSP frame-ancestors direktifini de değerlendir (daha modern yaklaşım).',
    ],
  },
  XCTO: {
    summary: 'X-Content-Type-Options başlığı eksik.',
    impact: 'X-Content-Type-Options: nosniff olmadan tarayıcı dosya tipini tahmin edebilir (MIME sniffing); zararlı içerikler farklı tipte yorumlanabilir.',
    recommendations: [
      'X-Content-Type-Options: nosniff başlığını ekle.',
      'Tüm içerik yanıtlarının doğru Content-Type değeri döndürdüğünü doğrula.',
    ],
  },
  RP: {
    summary: 'Referrer-Policy başlığı eksik.',
    impact: 'Referrer-Policy olmadan URL path bilgisi dış sitelere sızabilir; kullanıcı gizliliği ve uygulama güvenliği olumsuz etkilenebilir.',
    recommendations: [
      'Referrer-Policy: strict-origin-when-cross-origin başlığını ekle.',
      'Hassas path içerikleri için no-referrer politikasını değerlendir.',
    ],
  },
  PP: {
    summary: 'Permissions-Policy başlığı eksik.',
    impact: 'Permissions-Policy olmadan üçüncü taraf scriptler kamera, mikrofon veya konum gibi hassas tarayıcı API\'lerine erişebilir.',
    recommendations: [
      'Permissions-Policy başlığını ekle ve kullanılmayan özellikleri kısıtla.',
      'Örn: Permissions-Policy: camera=(), microphone=(), geolocation=()',
    ],
  },
};

const FINDING_FALLBACKS: Record<string, FallbackReport> = {
  // ── OTX — her zaman statik override (aiWhyJson hiç kullanılmaz) ──────────────
  OTX_MALWARE_ACTIVITY_DETECTED: {
    summary: 'OTX üzerinde malware referansı bulundu.',
    context: 'Bu bulgu, asset\'in AlienVault OTX verilerinde malware analizleri veya tehdit raporlarıyla ilişkilendirildiğini gösterir.',
    impact: 'Bu sonuç domainin kesin olarak zararlı veya ele geçirilmiş olduğunu kanıtlamaz. Büyük/popüler domainlerde marka taklidi, analiz içi referans, kampanya bağlamı veya zararlı dosya içindeki string referansı nedeniyle OTX ilişkisi görülebilir. Bu nedenle sonuç, kesin hüküm değil dış tehdit istihbaratı ilişki sinyali olarak değerlendirilmelidir.',
    reasons: [
      'OTX verilerinde bu asset ile ilişkili malware referansları bulunmuş.',
      'Bu referanslar doğrudan domainin zararlı olduğu anlamına gelmeyebilir.',
      'Sonuç diğer kaynaklarla çapraz doğrulanmalıdır.',
    ],
    recommendations: [
      'OTX sonucunu tek başına kesin risk olarak yorumlama.',
      'PhishTank, VirusTotal veya diğer reputation kaynaklarıyla çapraz doğrula.',
      'Domain sana aitse DNS kayıtlarını, yönlendirmeleri, web içeriklerini ve hosting değişikliklerini kontrol et.',
      'Sunucu loglarını ve son deploy geçmişini incele.',
      'Şüpheli içerik veya izinsiz yönlendirme yoksa bu sonucu ilişki sinyali olarak takip et.',
    ],
  },
  OTX_PULSE_DETECTED: {
    summary: 'OTX pulse ilişkisi bulundu.',
    context: 'Bu bulgu, asset\'in OTX üzerinde paylaşılan bazı tehdit pulse\'larında geçtiğini gösterir.',
    impact: 'Pulse ilişkisi, asset\'in tehdit istihbaratı raporlarında geçtiğini gösterir; ancak tek başına kesin zararlılık kanıtı değildir.',
    reasons: [
      'OTX üzerinde asset ile ilişkili pulse kaydı bulunmuş.',
      'Pulse kayıtları bazen marka taklidi, analiz referansı veya kampanya bağlamı içerebilir.',
    ],
    recommendations: [
      'Pulse başlıklarını ve etiketlerini incele.',
      'İlişkinin gerçek risk mi yoksa marka/analiz referansı mı olduğunu değerlendir.',
      'Diğer reputation kaynaklarıyla karşılaştır.',
      'Kendi domaininse DNS, içerik ve yönlendirme değişikliklerini kontrol et.',
    ],
  },

  // ── DNS ──────────────────────────────────────────────────────────────────────
  DNS_NS_CHANGE: {
    summary: 'Nameserver değişikliği tespit edildi.',
    impact: 'Nameserver değişikliği, DNS yönlendirme otoritesinin değişmesi demektir. Planlı bir registrar veya hosting geçişi ise normaldir. Yetkisiz yapılmışsa ciddi risk oluşturabilir. Önce değişikliğin planlı olup olmadığı doğrulanmalıdır.',
    reasons: [
      'Önceki ve mevcut NS kayıtları arasında fark tespit edildi.',
      'NS kayıtları domainin DNS yönlendirme otoritesini belirler.',
    ],
    recommendations: [
      'Registrar panelinden bu NS değişikliğinin yetkili olup olmadığını doğrula.',
      'Yetkisizse domain recovery sürecini başlat ve domaini registrar seviyesinde kilitle.',
      'Registrar lock (transfer lock) özelliğini aktif et.',
      'DNS ve registrar değişiklikleri için uyarı mekanizması kur.',
    ],
  },
  DNS_DMARC_MISSING: {
    summary: 'DMARC kaydı eksik.',
    impact: 'DMARC eksikliği, domain adına sahte e-posta gönderilmesini kolaylaştırabilir. Phishing kampanyaları ve iş e-postası sahtekarlığı (BEC) için zemin oluşturur.',
    reasons: [
      '_dmarc DNS TXT kaydı bulunamadı.',
      'DMARC olmadan doğrulama başarısız e-postalar için politika tanımlı değil.',
    ],
    recommendations: [
      '_dmarc DNS TXT kaydı oluştur.',
      'Başlangıçta p=none ile izleme yap, sonra quarantine/reject politikasına geç.',
      'SPF ve DKIM kayıtlarının doğru çalıştığını doğrula.',
    ],
  },
  DNS_SPF_MISSING: {
    summary: 'SPF kaydı eksik.',
    impact: 'SPF eksikliği, domain adına yetkisiz e-posta gönderimlerinin ayırt edilmesini zorlaştırır. Spam ve phishing saldırıları için risk oluşturur.',
    reasons: [
      'TXT kaydında SPF politikası (v=spf1) bulunamadı.',
      'SPF olmadan hangi sunucuların bu domain adına e-posta gönderebileceği tanımlı değil.',
    ],
    recommendations: [
      'TXT kaydı olarak SPF politikası ekle (örn: v=spf1 include:... ~all).',
      'Yetkili mail sunucularını SPF kaydına dahil et.',
      'Gereksiz include/ip mekanizmalarını temizle.',
    ],
  },
  DNS_CAA_MISSING: {
    summary: 'CAA (Certification Authority Authorization) kaydı eksik.',
    impact: 'CAA kaydı olmaması, hangi sertifika otoritelerinin bu domain için sertifika üretebileceğini sınırlamaz. Yetkisiz CA\'lar tarafından sertifika üretilebilir.',
    reasons: [
      'CAA DNS kaydı bulunamadı.',
      'CAA kaydı olmadan tüm CA\'lar domain adına sertifika üretebilir.',
    ],
    recommendations: [
      'Kullandığın sertifika otoritesine uygun CAA kaydı ekle.',
      'Beklenmeyen CA kullanımını azaltmak için DNS yapılandırmanı gözden geçir.',
    ],
  },
  DNS_DMARC_WEAK_POLICY: {
    summary: 'DMARC politikası zayıf (p=none — yalnızca izleme modu).',
    impact: 'p=none politikası DMARC\'ı pasif izleme moduna alır. Doğrulama başarısız olan e-postalar engellenmez; sadece raporlanır.',
    recommendations: [
      'Raporları inceleyerek meşru e-posta akışlarını doğrula.',
      'p=quarantine politikasına geç; şüpheli e-postalar karantinaya alınsın.',
      'Sonraki adımda p=reject ile tam korumaya geç.',
    ],
  },
  DNS_RECORD_CHANGE: {
    summary: 'DNS kayıtları değişti.',
    impact: 'DNS kaydı değişikliği; sunucu değişimi, CDN geçişi veya yetkisiz zone erişimi işareti olabilir. A kaydı değişikliği sitenin farklı bir IP\'ye yönlendirilmesi demektir.',
    recommendations: [
      'Değişikliğin yetkili bir kişi veya süreç tarafından yapıldığını doğrula.',
      'DNS değişikliğini hosting, CDN ve deploy kayıtlarıyla karşılaştır.',
      'Beklenmedik değişiklik varsa DNS sağlayıcı erişim loglarını incele.',
    ],
  },
  DNS_MX_CHANGE: {
    summary: 'MX (Mail Exchange) kaydı değişti.',
    impact: 'Yetkisiz MX değişikliği, gelen e-postaların saldırgan kontrolündeki bir sunucuya yönlendirilmesi anlamına gelebilir. İş e-postası sahtekarlığı (BEC) ve kimlik bilgisi hırsızlığı riski oluşturur.',
    recommendations: [
      'Değişikliğin mail sağlayıcısı değişiminden kaynaklandığını doğrula.',
      'Mail akışlarını ve SPF/DMARC kayıtlarını kontrol et.',
      'Beklenmedik değişiklik varsa mail sunucu loglarını incele.',
    ],
  },
  DNS_TXT_CHANGE: {
    summary: 'TXT kayıtları değişti.',
    impact: 'SPF veya DMARC kaydındaki bir değişiklik e-posta güvenliğini bozabilir. Yetkisiz değişiklik DNS zone erişim ihlalini gösterebilir.',
    recommendations: [
      'SPF ve DMARC kayıtlarının doğru yapılandırıldığını doğrula.',
      'Değişikliğin yetkili bir kişi tarafından yapıldığını onayla.',
      'DNS zone erişim loglarını incele.',
    ],
  },

  // ── TLS ──────────────────────────────────────────────────────────────────────
  TLS_CHANGE: {
    summary: 'TLS sertifikası değişti.',
    impact: 'Sertifika değişikliği normal yenileme sürecinden kaynaklanabilir; ancak beklenmeyen değişiklikler yanlış yapılandırma veya yetkisiz müdahale işareti olabilir.',
    recommendations: [
      'Sertifika değişikliğinin planlı yenileme olup olmadığını doğrula.',
      'Issuer, fingerprint ve geçerlilik tarihlerini kontrol et.',
      'Beklenmeyen değişiklik varsa hosting/CDN ve sertifika kayıtlarını incele.',
    ],
  },
  TLS_CHECK: {
    summary: 'TLS/SSL bağlantı sorunu tespit edildi.',
    impact: 'TLS bağlantı hatası; sertifika geçersizliği, yapılandırma hatası veya şifreli kanalın çalışmaması anlamına gelebilir. Kullanıcılar güvensiz bağlantı uyarısı alabilir.',
    recommendations: [
      'Sertifikanın geçerli ve yetkili bir CA tarafından imzalandığını doğrula.',
      'TLS protokol sürümünü ve cipher suite yapılandırmasını kontrol et.',
      'Sertifika zincirinin tam olduğundan emin ol.',
    ],
  },
  TLS_EXPIRING: {
    summary: 'SSL/TLS sertifikası yakında sona eriyor.',
    impact: 'Sertifika süresi dolduğunda tüm modern tarayıcılar kullanıcılara büyük "Bağlantı güvenli değil" uyarısı gösterir ve ziyaretçiler siteyi terk eder.',
    recommendations: [
      'Sertifikayı en kısa sürede yenile.',
      'Otomatik yenileme (Let\'s Encrypt + certbot veya hosting paneli) kur.',
      'DNS yayılım süresi için yenilemeyi son dakikaya bırakma.',
    ],
  },

  // ── HTTP ─────────────────────────────────────────────────────────────────────
  HTTP_CHANGE: {
    summary: 'HTTP yanıt durumu değişti.',
    impact: 'HTTP yanıtındaki değişiklik; servis kesintisi, yönlendirme değişikliği veya uygulama davranışı değişikliği anlamına gelebilir.',
    recommendations: [
      'Son deploy veya hosting değişikliklerini kontrol et.',
      'Beklenmeyen 4xx/5xx durumlarını incele.',
      'Yönlendirme (redirect) zincirini doğrula.',
    ],
  },
  HTTP_HEALTH: {
    summary: 'Web sitesi erişim sorunu tespit edildi.',
    impact: 'Siteye erişim sorunu kullanıcı erişimini, uptime durumunu ve servis sürekliliğini etkileyebilir.',
    recommendations: [
      'Web sunucusu, DNS ve hosting durumunu kontrol et.',
      'Uygulama loglarında hata kaydı olup olmadığını incele.',
      'CDN veya load balancer konfigürasyonunu doğrula.',
    ],
  },

  // ── Portlar ──────────────────────────────────────────────────────────────────
  PORT_EXPOSED: {
    summary: 'Riskli port internetten erişilebilir durumda.',
    impact: 'Bir portun açık olması tek başına kesin bir zafiyet değildir. Ancak açık portlar internetten erişilebilir servis yüzeyini genişletir. 80/443 gibi standart web portları normal kabul edilirken; veritabanı, cache veya uzaktan yönetim portları internete açıksa öncelikli incelenmelidir.',
    reasons: [
      'Açık riskli portlar, dış dünyaya doğrudan TCP bağlantısı kabul ediyor.',
      'Açık servisin arkasındaki yazılımın versiyonu ve yamalı olup olmadığı bu kontrolde doğrulanmaz; saldırı yüzeyini büyüten bir sinyal olarak değerlendirilir.',
    ],
    recommendations: [
      'Hangi servisin bu portu dinlediğini ve gerçekten internetten erişilebilir olması gerekip gerekmediğini doğrula.',
      'Yönetim portları (SSH, RDP, VNC, RDP-alt) için VPN veya IP whitelist kullan.',
      'Veritabanı, cache ve arama motoru portlarını (3306, 5432, 6379, 27017, 9200, 11211) iç ağ ile sınırla; doğrudan internete açma.',
      'Açık portun arkasındaki servis versiyonunun güncel ve yamalı olduğunu doğrula.',
    ],
  },
  PORT_CHANGE: {
    summary: 'Açık port listesi son taramaya göre değişti.',
    impact: 'Port durumu değişikliği tek başına kötücül bir olay değildir. Yapılandırma değişikliği, planlı bir servis açma/kapatma veya yeni bir deploy sonucu olabilir. Ancak değişikliğin yetkili ve planlı olduğu doğrulanmalıdır; özellikle yeni açılan riskli/kritik portlar öncelikli incelenmelidir.',
    reasons: [
      'Önceki tarama ile mevcut tarama arasında açık port listesi farklılık gösterdi.',
      'Yeni port açılışı yeni bir servisin başlatıldığını, port kapanışı bir servisin durdurulduğunu işaret eder.',
    ],
    recommendations: [
      'Değişikliğin yetkili bir konfigürasyon değişikliği, deploy veya hosting işleminden kaynaklandığını doğrula.',
      'Yeni açılan portlar için sunucudaki servis ve konfigürasyon loglarını incele.',
      'Yeni açılan riskli/kritik portlar (veritabanı, uzaktan yönetim) için güvenlik duvarı kuralını gözden geçir.',
      'Değişiklik beklenmedik ise sistem üzerinde yetkisiz erişim veya yanlış yapılandırma olasılığını araştır.',
    ],
  },

  // ── Robots ───────────────────────────────────────────────────────────────────
  ROBOTS_SENSITIVE_PATH_EXPOSED: {
    summary: 'robots.txt içinde hassas path sinyali bulundu.',
    impact: 'robots.txt bazı hassas dizinlerin varlığına dair ipucu verebilir. Bu dosya erişim kontrolü sağlamaz; saldırganlara hedef listesi işlevi görür.',
    reasons: [
      'Disallow kuralları admin, backup, config gibi hassas path\'ler içeriyor.',
      'robots.txt güvenlik mekanizması değil, bot yönlendirme dosyasıdır.',
    ],
    recommendations: [
      'Hassas dizinleri robots.txt ile gizlemeye çalışma.',
      'Gerçek erişim kontrolü ve kimlik doğrulama (authentication) uygula.',
      'Yedek, config, admin gibi path\'leri authentication arkasında tut.',
    ],
  },
  ROBOTS_CHANGE: {
    summary: 'robots.txt içeriği değişti.',
    impact: 'Planlanmamış robots.txt değişikliği; deploy hatası, yetkisiz içerik değişikliği veya SEO sabotajı işareti olabilir.',
    recommendations: [
      'Değişikliğin yetkili deployment\'tan kaynaklandığını doğrula.',
      'Yeni Disallow kurallarının uygun olup olmadığını kontrol et.',
    ],
  },

  // ── Tehdit istihbaratı ────────────────────────────────────────────────────────
  BREACH_EXPOSURE_DETECTED: {
    summary: 'Veri sızıntısı sinyali bulundu.',
    impact: 'Bu domainle ilişkili e-posta veya veri sızıntısı kaydı bulunması, hesap güvenliği açısından risk oluşturabilir. Credential stuffing saldırıları için zemin hazırlanmış olabilir.',
    reasons: [
      'Bilinen veri sızıntısı veritabanlarında bu domainle ilişkili kayıt tespit edildi.',
    ],
    recommendations: [
      'Etkilenen hesaplarda parola sıfırlama yap.',
      'Çok faktörlü kimlik doğrulama (MFA) kullanımını zorunlu hale getir.',
      'Sızıntı kaynağını ve hangi veri türlerinin etkilendiğini incele.',
    ],
  },
  MALICIOUS_REPUTATION_DETECTED: {
    summary: 'Kötücül itibar sinyali bulundu.',
    impact: 'Dış reputation kaynakları bu asset ile ilişkili şüpheli veya zararlı sinyal bildirmiş olabilir. Paylaşımlı hosting IP\'lerinde yanlış pozitif olasılığı da mevcuttur.',
    recommendations: [
      'Reputation sağlayıcı detaylarını incele.',
      'Son DNS, hosting ve içerik değişikliklerini kontrol et.',
      'Farklı reputation kaynaklarıyla çapraz doğrula.',
    ],
  },
  PHISHING_DETECTED: {
    summary: 'Phishing listesinde eşleşme bulundu.',
    impact: 'Domain veya subdomain, phishing veritabanında eşleşme içermesi; aktif phishing kampanyasında kullanıldığını, domain\'in ele geçirildiğini veya bir subdomain\'in phishing sayfasına yönlendirildiğini gösterebilir.',
    recommendations: [
      'İçerikleri, yönlendirmeleri ve sunucu loglarını incele.',
      'Etkilenen subdomain veya sayfayı tespit et ve temizle.',
      'Phishing kaydının false positive olup olmadığını doğrula.',
    ],
  },

  // ── WHOIS / Altyapı ──────────────────────────────────────────────────────────
  WHOIS_EXPIRING: {
    summary: 'Domain kaydı sona erme tarihine yaklaşıyor.',
    impact: 'Süresi dolan domain DNS hizmetinin durması ve sitenin erişilemez hale gelmesi anlamına gelir. Ödeme yapılmazsa domain üçüncü şahıslar tarafından satın alınabilir.',
    recommendations: [
      'Domain kaydını hemen yenile.',
      'Otomatik yenilemeyi etkinleştir.',
      'Registrar bildirim e-postalarının spam filtrelerine takılmadığını doğrula.',
    ],
  },
  WHOIS_CHANGE: {
    summary: 'WHOIS / domain kayıt bilgileri değişti.',
    impact: 'Yetkisiz registrar değişikliği domain transferi işaretini; nameserver değişikliği ise domain hijacking riskini gösterebilir.',
    recommendations: [
      'Değişikliğin yetkili bir kişi veya registrar tarafından yapıldığını doğrula.',
      'Registrar lock özelliğini aktif et.',
      'Domain güvenlik ayarlarını ve transfer kilitlerini kontrol et.',
    ],
  },
  GEOIP_CHANGE: {
    summary: 'IP coğrafi konum veya hosting bilgisi değişti.',
    impact: 'Ülke ve organizasyon değişimi birlikte gerçekleştiğinde yetkisiz altyapı değişimi veya BGP anomalisi riski yüksektir.',
    recommendations: [
      'Hosting veya CDN değişikliğinin yetkili olduğunu doğrula.',
      'Ülke değişikliği varsa GDPR ve veri yeri gerekliliklerini kontrol et.',
    ],
  },
  ASN_CHANGE: {
    summary: 'ASN (Autonomous System Number) değişti.',
    impact: 'Planlanmamış ASN değişikliği BGP hijacking (ağ trafiğinin ele geçirilmesi) veya yetkisiz hosting geçişini işaret edebilir.',
    recommendations: [
      'CDN veya hosting değişimi planlandıysa beklenen değişim olduğunu doğrula.',
      'BGP route announcement değişikliklerini incele.',
      'Planlanmamış değişiklik varsa hosting sağlayıcıyla iletişime geç.',
    ],
  },

  // ── SQL Injection ────────────────────────────────────────────────────────────
  SQL_INJECTION_SUSPECTED: {
    summary: 'SQL Injection şüphesi gözlendi.',
    impact:
      'Bu bulgu kesin saldırı kanıtı değildir; otomatik test sonucu olarak SQL Injection sinyali tespit edilmiştir. ' +
      'Doğrulanırsa veri sızıntısı, yetkisiz erişim veya veritabanı hatalarının dışarı sızması riskini gösterebilir. ' +
      'Bu nedenle sonuç manuel doğrulama gerektirir.',
    reasons: [
      'Hedef parametreye gönderilen kontrollü probe payload\'larına sunucunun verdiği yanıt SQL Injection belirtisi olarak yorumlandı.',
      'Parametre SQL sorgusuna güvenli (parametre binding ile) bağlanmıyor olabilir.',
    ],
    recommendations: [
      'Prepared statement / parameterized query kullanın.',
      'Kullanıcı girdisini SQL string içine doğrudan eklemeyin.',
      'ORM kullanıyorsanız raw query yerine parametre binding kullanın.',
      'Üretim ortamında detaylı SQL hata mesajlarını göstermeyin.',
      'Bu endpoint\'i manuel güvenlik testiyle doğrulayın.',
    ],
  },
};

// ─── Security header fallback helper ─────────────────────────────────────────

function getSecurityHeaderFallback(finding: Finding): FallbackReport | null {
  const parts = finding.key.split(':');
  const headerKey = parts[parts.length - 1];
  return SECURITY_HEADER_FALLBACKS[headerKey] ?? null;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function getTurkishAiReport(finding: Finding): TurkishAiReport {
  // OTX → her zaman statik Türkçe içerik; aiWhyJson hiç kullanılmaz
  if (isOtxFinding(finding)) {
    const otxFallback = FINDING_FALLBACKS[finding.type]!;
    return {
      summary: otxFallback.summary,
      impact: otxFallback.impact,
      context: otxFallback.context ?? null,
      reasons: otxFallback.reasons ?? [],
      recommendations: otxFallback.recommendations,
      source: 'fallback',
    };
  }

  const aiWhy = finding.aiWhyJson;
  const hasAiContent = !!(
    aiWhy?.summary || aiWhy?.impact ||
    (aiWhy?.reasons?.length ?? 0) > 0 ||
    (aiWhy?.recommendations?.length ?? 0) > 0
  );

  let fallback: FallbackReport | null = null;
  if (finding.type === 'SECURITY_HEADER_MISSING') {
    fallback = getSecurityHeaderFallback(finding);
  } else {
    fallback = FINDING_FALLBACKS[finding.type] ?? null;
  }

  // AI içeriği yoksa → fallback
  if (!hasAiContent) {
    if (fallback) {
      return {
        summary: fallback.summary,
        impact: fallback.impact,
        context: fallback.context ?? null,
        reasons: fallback.reasons ?? [],
        recommendations: fallback.recommendations,
        source: 'fallback',
      };
    }
    return { summary: null, impact: null, reasons: [], recommendations: [], context: null, source: 'fallback' };
  }

  // AI içeriği İngilizce ve fallback varsa → fallback kullan
  if (isAiWhyEnglish(aiWhy) && fallback) {
    return {
      summary: fallback.summary,
      impact: fallback.impact,
      context: fallback.context ?? null,
      reasons: fallback.reasons ?? [],
      recommendations: fallback.recommendations,
      source: 'fallback',
    };
  }

  // AI içeriği Türkçe (veya fallback yok) → mevcut içeriği kullan
  return {
    summary: aiWhy?.summary ?? null,
    impact: aiWhy?.impact ?? null,
    reasons: aiWhy?.reasons ?? [],
    recommendations: aiWhy?.recommendations ?? [],
    context: aiWhy?.context ?? null,
    source: 'ai',
  };
}
