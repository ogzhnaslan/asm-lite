import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAsset, deleteAsset, runNow, getScanHistory, getScanChecks, getFindings, ackFinding,
  resolveFinding, reopenFinding, setCritical, updateScanInterval,
} from '../api/api';
import { summarizeCheck, CHECK_ORDER, type CheckStatus } from '../utils/scanCheckSummary';
import { Spinner } from '../components/Spinner';
import { SeverityBadge, ScanStatusBadge, getSeverityConfig } from '../components/Badge';
import type { FindingSeverity } from '../types';
import type { Finding } from '../types';
import { SCAN_INTERVALS } from '@asm/shared';
import { AssetHero } from '../components/assets/AssetHero';
import { SkeletonCard } from '../components/ui';
import { IntelligenceOverview } from '../components/intelligence';
import { AssistantChat } from '../components/assistant/AssistantChat';
import { getTurkishAiReport, getDisplayAiScore, getOtxRiskLabel } from '../utils/findingDisplay';
import { PortFindingDetails, isPortFinding } from '../components/findings/PortFindingDetails';
import { getPortExposedSummary, getPortChangeSummary } from '../utils/portCatalog';
import { TlsFindingDetails, isTlsFinding, getTlsFindingSummary } from '../components/findings/TlsFindingDetails';
import { SqliFindingDetails, isSqliFinding, getSqliFindingSummary } from '../components/findings/SqliFindingDetails';
import { SqliTargetsManager } from '../components/sqli/SqliTargetsManager';
import { SqliLivePanel } from '../components/sqli/SqliLivePanel';

// ─── Finding type metadata (Türkçe açıklamalar) ───────────────────────────────

const FINDING_META: Record<string, {
  label: string;
  category: string;
  icon: string;
  nedir: string;
  neden: string;
}> = {
  PORT_EXPOSED: {
    label: 'Açık Port Tespit Edildi',
    category: 'Ağ Güvenliği',
    icon: '🔓',
    nedir: 'Sisteminizde bir port internetten doğrudan erişilebilir durumda. Portlar, ağ üzerinden çalışan yazılımlara bağlanmak için kullanılan sanal kapılardır. Her açık port, sisteminize dışarıdan bağlantı kurulabilecek bir noktayı temsil eder.',
    neden: 'Gereksiz açık portlar saldırı yüzeyini ciddi ölçüde genişletir. Özellikle SSH (22) ve RDP (3389) gibi yönetim portları; brute-force saldırıları, kimlik bilgisi doldurma ve bilinen yazılım açıklarından yararlanma saldırılarının birincil hedefleridir. Bir saldırgan açık portu keşfederse sisteme yetkisiz erişim sağlayabilir veya kötü amaçlı yazılım yerleştirebilir.',
  },
  PORT_CHANGE: {
    label: 'Port Değişikliği Tespit Edildi',
    category: 'Ağ Güvenliği',
    icon: '🔄',
    nedir: 'Sisteminizde daha önce kapalı olan bir port açıldı veya açık olan bir port kapandı. Bu değişiklik son taramadan bu yana gerçekleşti ve otomatik olarak tespit edildi.',
    neden: 'Planlanmayan port değişiklikleri; yetkisiz yazılım kurulumu, sistem ihlali veya yanlış yapılandırmanın işareti olabilir. Yeni açılan her port, güvenlik ekibinin haberi olmadan ortaya çıkmış potansiyel bir risk noktasıdır. Değişikliğin yetkili kişilerce yapılıp yapılmadığını doğrulayın.',
  },
  TLS_CHECK: {
    label: 'TLS/SSL Sertifika Durumu',
    category: 'Şifreleme Güvenliği',
    icon: '🔐',
    nedir: 'Sitenizin HTTPS bağlantısını sağlayan TLS/SSL sertifikasına ait bilgiler. Bu sertifika, kullanıcı tarayıcısı ile sunucunuz arasındaki iletişimin şifreli ve güvenli kalmasını garanti eder.',
    neden: 'Sertifika yapılandırması kritik önem taşır. Zayıf şifreleme algoritmaları, eski TLS protokol sürümleri (TLS 1.0 veya 1.1) veya hatalı konfigürasyonlar şifreli kanalı tehlikeye atarak ortadaki adam (MITM) saldırılarına zemin hazırlar. Kullanıcı verileri ifşa olabilir.',
  },
  TLS_EXPIRING: {
    label: 'SSL Sertifikası Yakında Sona Eriyor',
    category: 'Şifreleme Güvenliği',
    icon: '⏰',
    nedir: 'Web sitenizin güvenli bağlantısını sağlayan SSL/TLS sertifikasının geçerlilik süresi dolmak üzere. Sertifikalar belirli bir süre için (genellikle 90 gün veya 1 yıl) geçerlidir ve düzenli olarak yenilenmesi gerekir.',
    neden: 'Sertifika süresi dolduğunda Chrome, Firefox ve tüm modern tarayıcılar kullanıcılara büyük kırmızı "Bağlantı güvenli değil" uyarısı gösterir. Ziyaretçilerin büyük çoğunluğu bu noktada siteyi terk eder. Yenileme işlemi genellikle 24-48 saatlik DNS yayılım süresi gerektirdiğinden son dakikaya bırakılmamalıdır.',
  },
  TLS_CHANGE: {
    label: 'TLS Sertifikası Değişti',
    category: 'Şifreleme Güvenliği',
    icon: '🔀',
    nedir: 'Sitenizin TLS/SSL sertifikası son taramadan bu yana değişti. Sertifika değişiklikleri; meşru yenileme, sertifika sağlayıcısı değişikliği, acil revokasyon veya bir güvenlik müdahalesi sonucu gerçekleşebilir.',
    neden: 'Yetkisiz veya beklenmedik sertifika değişiklikleri, sertifika hırsızlığı ya da ortadaki adam saldırısı girişiminin ciddi bir işareti olabilir. Değişikliğin planlı olup olmadığını ve yetkili kişilerce yapılıp yapılmadığını doğrulamanız kritiktir.',
  },
  HTTP_HEALTH: {
    label: 'HTTP Yanıt Performansı',
    category: 'Performans & Erişilebilirlik',
    icon: '⏱️',
    nedir: 'Sunucunuzun HTTP isteklerine yanıt verme süresi ve genel erişilebilirlik durumu. Latency (gecikme süresi), bir HTTP isteğinin sunucuya ulaşıp yanıt alınana kadar geçen süreyi milisaniye (ms) cinsinden ifade eder.',
    neden: 'Yüksek yanıt gecikmeleri; aktif bir DDoS saldırısı, yetersiz sunucu kapasitesi veya ağ altyapısı sorunlarının göstergesi olabilir. 300ms üzerindeki gecikme değerleri kullanıcı deneyimini olumsuz etkilerken Google gibi arama motorları yavaş siteleri sıralamada geri düşürür.',
  },
  HTTP_CHANGE: {
    label: 'HTTP Yanıt İçeriği Değişti',
    category: 'İzleme & Değişiklik Tespiti',
    icon: '📡',
    nedir: 'Sitenizin HTTP yanıt kodu, başlıkları veya içerik parmak izi son taramadan bu yana değişti. Örneğin siteniz artık farklı bir HTTP durum kodu döndürüyor ya da sayfa içeriği beklenmedik şekilde değişmiş olabilir.',
    neden: 'Beklenmedik HTTP yanıt değişiklikleri; web sitesi ele geçirilmesi (defacement), sunucu arızası, yanlış yapılandırma veya içerik yerleştirme saldırısının (injection) işareti olabilir. Hassas sayfalardaki beklenmedik değişiklikler derhal incelenmelidir.',
  },
  SECURITY_HEADER_MISSING: {
    label: 'Güvenlik HTTP Başlığı Eksik',
    category: 'Web Uygulama Güvenliği',
    icon: '🛡️',
    nedir: 'HTTP güvenlik başlıkları, web sunucusunun her yanıtta tarayıcıya gönderdiği ve sitenin nasıl davranması gerektiğini belirleyen özel direktiflerdir. Bu başlıklar tarayıcı tarafında uygulanan ilk savunma katmanını oluşturur.',
    neden: 'Her eksik başlık spesifik bir saldırı kapısı açar: Content-Security-Policy eksikse XSS saldırıları çok daha kolaydır; X-Frame-Options olmadan clickjacking riski artar; Strict-Transport-Security yoksa kullanıcılar HTTP\'ye yönlendirilebilir; X-Content-Type-Options olmadan MIME sniffing saldırısı mümkün olur.',
  },
  DNS_DMARC_MISSING: {
    label: 'DMARC Kaydı Eksik',
    category: 'E-posta Güvenliği',
    icon: '✉️',
    nedir: 'DMARC (Domain-based Message Authentication, Reporting & Conformance), SPF ve DKIM ile doğrulama başarısız olan e-postaların ne yapılacağını belirleyen bir DNS kaydıdır.',
    neden: 'DMARC yoksa, saldırganlar domain adınızı kullanarak phishing e-postaları gönderebilir. Alıcılar bu e-postaların gerçekten sizden geldiğini düşünür. p=reject veya p=quarantine politikasıyla e-posta sahteciliği büyük ölçüde engellenir.',
  },
  DNS_SPF_MISSING: {
    label: 'SPF Kaydı Eksik',
    category: 'E-posta Güvenliği',
    icon: '✉️',
    nedir: 'SPF (Sender Policy Framework), hangi mail sunucularının bu domain adına e-posta gönderebileceğini tanımlayan bir DNS TXT kaydıdır.',
    neden: 'SPF kaydı olmadan herhangi bir sunucu domain adınızı kullanarak e-posta gönderebilir. Bu, spam ve phishing saldırılarını kolaylaştırır. DMARC ile birlikte e-posta sahteciliğine karşı güçlü bir savunma oluşturur.',
  },
  DNS_CAA_MISSING: {
    label: 'CAA Kaydı Eksik',
    category: 'Sertifika Güvenliği',
    icon: '🔏',
    nedir: 'CAA (Certification Authority Authorization), hangi sertifika otoritelerinin bu domain için SSL/TLS sertifikası üretebileceğini kısıtlayan bir DNS kaydıdır.',
    neden: 'CAA kaydı olmadan herhangi bir CA, domain adınız için geçerli bir sertifika üretebilir. Bir CA\'nın tehlikeye girmesi durumunda, yetkisiz sertifikalar oluşturulabilir ve MITM saldırıları gerçekleştirilebilir.',
  },
  DNS_DMARC_WEAK_POLICY: {
    label: 'DMARC Politikası Zayıf',
    category: 'E-posta Güvenliği',
    icon: '✉️',
    nedir: 'DMARC kaydı mevcut ama politika p=none — bu yalnızca raporlama modu demektir. Doğrulama başarısız olan e-postalar hâlâ teslim edilmektedir.',
    neden: 'p=none, DMARC\'ı pasif izleme moduna alır. Spoofed e-postalar engellenmez, yalnızca raporlanır. p=quarantine veya p=reject\'e yükseltilmeli; bu, domain adınız üzerinden phishing kampanyalarını önler.',
  },
  DNS_RECORD_CHANGE: {
    label: 'DNS Kayıtları Değişti',
    category: 'DNS İzleme',
    icon: '🌐',
    nedir: 'A, AAAA, CNAME, CAA veya SOA gibi DNS kayıtlarından en az biri son taramadan bu yana değişti.',
    neden: 'Planlanmamış DNS değişiklikleri; sunucu değişimi, CDN geçişi ya da yetkisiz zone erişimi işareti olabilir. Özellikle A kaydı değişikliği sitenin farklı bir IP\'ye yönlendirileceği anlamına gelir — bu CDN geçişi veya saldırı olabilir.',
  },
  DNS_NS_CHANGE: {
    label: 'Nameserver Değişikliği',
    category: 'DNS İzleme',
    icon: '🌐',
    nedir: 'Domainin yetkili DNS sunucularında (NS kayıtları) değişiklik tespit edildi. Bu değişiklik planlı bir registrar veya hosting geçişinden kaynaklanıyor olabilir; ancak yetkisiz yapılmışsa DNS yönlendirme kontrolünü etkileyebilir.',
    neden: 'NS değişikliği, web ve e-posta trafiğinin hangi DNS otoritesi üzerinden çözüleceğini etkiler. Önce registrar panelinden değişikliğin yetkili olup olmadığı doğrulanmalıdır. Planlı bir geçiş ise normaldir; değilse acil inceleme gerekir.',
  },
  DNS_MX_CHANGE: {
    label: 'MX Kaydı Değişikliği',
    category: 'E-posta Güvenliği',
    icon: '📬',
    nedir: 'Mail exchange (MX) kaydı değişti — gelen e-postalar artık farklı bir mail sunucusuna yönlendiriliyor.',
    neden: 'Yetkisiz MX değişikliği, gelen e-postaların saldırgan kontrolündeki bir sunucuya yönlendirilmesi demektir. Bu, kimlik bilgisi hırsızlığı ve iş e-postası sahtekarlığının (BEC) birincil vektörüdür.',
  },
  DNS_TXT_CHANGE: {
    label: 'TXT Kaydı Değişikliği',
    category: 'DNS İzleme',
    icon: '📝',
    nedir: 'TXT kayıtları değişti. TXT kayıtları SPF, DMARC, domain doğrulama tokenları gibi kritik yapılandırma bilgilerini içerir.',
    neden: 'SPF veya DMARC kaydındaki bir değişiklik e-posta güvenliğini bozabilir; yetkisiz bir değişiklik ise zone erişim ihlalini gösterebilir. Değişikliğin yetkili bir kişi tarafından yapılıp yapılmadığı doğrulanmalıdır.',
  },
  WHOIS_EXPIRING: {
    label: 'Domain Süresi Yaklaşıyor',
    category: 'Domain Yönetimi',
    icon: '⏳',
    nedir: 'Domain kaydının sona erme tarihine yaklaşılıyor. Domain\'lerin belirli aralıklarla yenilenmesi gerekir; aksi hâlde registrar tarafından askıya alınır.',
    neden: 'Süresi dolan domain, DNS hizmetinin durması ve sitenin erişilemez hâle gelmesi anlamına gelir. Ödeme yapılmazsa domain 3. şahıslar tarafından satın alınabilir — bu da ciddi marka ve güvenlik riski yaratır.',
  },
  WHOIS_CHANGE: {
    label: 'WHOIS / RDAP Bilgisi Değişti',
    category: 'Domain Yönetimi',
    icon: '📋',
    nedir: 'Domain kayıt bilgileri (registrar, nameserver, status veya sona erme tarihi) son taramadan bu yana değişti.',
    neden: 'Yetkisiz registrar değişikliği domain transferi işaretini; nameserver değişikliği ise domain hijacking riskini gösterebilir. Tüm domain kayıt değişikliklerinin izinli olup olmadığı doğrulanmalıdır.',
  },
  GEOIP_CHANGE: {
    label: 'GeoIP Bilgisi Değişti',
    category: 'Altyapı İzleme',
    icon: '🗺️',
    nedir: 'IP adresinin coğrafi konumu, ISP veya organizasyon bilgisi değişti. Bu, sunucunun farklı bir veri merkezine veya sağlayıcıya taşındığını gösterebilir.',
    neden: 'Ülke ve organizasyon değişimi birlikte gerçekleştiğinde yetkisiz altyapı değişimi veya BGP anomalisi riski yüksektir. Yasal gereklilikler (veri yeri, GDPR) açısından da coğrafi değişiklikler izlenmelidir.',
  },
  ASN_CHANGE: {
    label: 'ASN Değişikliği',
    category: 'Altyapı İzleme',
    icon: '🔌',
    nedir: 'Autonomous System Number (ASN) değişti — IP adresi farklı bir ağ operatörü veya hosting sağlayıcısı altında görünüyor.',
    neden: 'Planlanmamış ASN değişikliği, BGP hijacking (ağ trafiğinin ele geçirilmesi) veya yetkisiz hosting geçişini işaret edebilir. CDN veya hosting geçişi planlıysa beklenen bir değişiklik; değilse acil inceleme gerekir.',
  },
  ROBOTS_SENSITIVE_PATH_EXPOSED: {
    label: 'robots.txt Hassas Path İçeriyor',
    category: 'Web Keşif Güvenliği',
    icon: '🤖',
    nedir: 'robots.txt dosyasındaki Disallow kuralları, admin panelleri, yedek dosyaları veya yapılandırma dosyaları gibi hassas yolları açığa çıkarıyor.',
    neden: 'robots.txt güvenlik mekanizması değildir — iyi niyetli botlara yönlendirme yapan bir dosyadır. Hassas path\'leri listeleyen Disallow kuralları saldırganlara hedef listesi sağlar. İçeriğin gerçek erişim kontrolü (auth/authz) ile korunması gerekir.',
  },
  ROBOTS_CHANGE: {
    label: 'robots.txt Değişti',
    category: 'Web İzleme',
    icon: '🤖',
    nedir: 'robots.txt dosyasının içeriği son taramadan bu yana değişti. Yeni Disallow kuralları eklendi veya mevcutlar kaldırıldı.',
    neden: 'Planlanmamış robots.txt değişikliği, deploy hatası, yetkisiz içerik değişikliği veya SEO sabotajı gibi durumları işaret edebilir. Değişikliğin yetkili deployment\'tan kaynaklanıp kaynaklanmadığı doğrulanmalıdır.',
  },
  PHISHING_DETECTED: {
    label: 'Phishing Listesinde Eşleşme',
    category: 'Tehdit İstihbaratı',
    icon: '🎣',
    nedir: 'Domain veya subdomain, PhishTank aktif phishing veritabanında eşleşme bulundu.',
    neden: 'Domain ya da subdomain\'in phishing listesinde görünmesi; aktif bir phishing kampanyasında kullanılıyor olabileceğini, domain\'in ele geçirildiğini veya bir subdomain\'in phishing sayfasına yönlendirildiğini gösterebilir. Acil inceleme ve muhtemelen içerik temizleme gerekebilir.',
  },
  MALICIOUS_REPUTATION_DETECTED: {
    label: 'Kötücül İtibar Sinyali',
    category: 'Tehdit İstihbaratı',
    icon: '⛔',
    nedir: 'IP veya domain, AbuseIPDB veya URLhaus gibi tehdit istihbarat veritabanlarında kötü amaçlı aktiviteyle ilişkilendirilmiş olarak işaretlenmiş.',
    neden: 'Reputation listelerinde görünmek; hosting\'in kötüye kullanıldığını, botnet aktivitesi olduğunu veya malware dağıtıldığını gösterebilir. Yanlış pozitif olasılığı da vardır — özellikle paylaşımlı hosting IP\'lerde. Sunucu logları ve içerik incelenmelidir.',
  },
  BREACH_EXPOSURE_DETECTED: {
    label: 'Veri Sızıntısı Tespiti',
    category: 'Veri Güvenliği',
    icon: '💾',
    nedir: 'Bu domain ile ilişkili e-posta adresleri, bilinen veri sızıntısı veritabanlarında (HIBP, LeakCheck vb.) tespit edildi.',
    neden: 'Düz metin şifre içeren sızıntılar, credential stuffing saldırıları için hazır silah demektir. Etkilenen hesaplarda şifre sıfırlama, oturum iptali ve MFA etkinleştirmesi acilen yapılmalıdır. GDPR ve benzeri düzenlemeler kapsamında ihlal bildirimi gerekebilir.',
  },
  OTX_PULSE_DETECTED: {
    label: 'OTX Pulse İlişkisi',
    category: 'Tehdit İstihbaratı',
    icon: '📡',
    nedir: 'Bu asset, AlienVault OTX güvenlik topluluğu tarafından paylaşılan tehdit raporlarında (pulse) geçiyor. Pulse\'lar güvenlik araştırmacılarının tehdit kampanyaları hakkında paylaştığı kolektif istihbarat paketidir.',
    neden: 'OTX pulse ilişkisi, kesin zararlılık kanıtı değil dış tehdit istihbaratı sinyalidir. Büyük ve popüler domainler marka taklidi, analiz referansı veya tehdit raporları içinde geçebilir. DNS, içerik ve hosting kayıtları ayrıca incelenmelidir.',
  },
  OTX_MALWARE_ACTIVITY_DETECTED: {
    label: 'OTX Malware Referansı',
    category: 'Tehdit İstihbaratı',
    icon: '🔬',
    nedir: 'Bu asset, AlienVault OTX\'te malware örnekleriyle ilişkilendirilmiş. Malware analizleri, saldırı zinciri raporları veya C2 altyapısı belgeleri bu ilişkiyi oluşturabilir.',
    neden: 'OTX malware referansı, kesin zararlılık kanıtı değildir. Marka taklidi, analiz içi referans veya saldırı kampanyası bağlamı nedeniyle ilişki oluşabilir. Yine de web içeriği, yönlendirmeler ve hosting değişiklikleri incelenmelidir.',
  },
  SQL_INJECTION_SUSPECTED: {
    label: 'SQL Injection Şüphesi',
    category: 'Application Security',
    icon: '💉',
    nedir: 'Bu bulgu, bir URL parametresine gönderilen kontrollü test payload\'larına sunucunun verdiği yanıt analizine dayanır. SQL hata paterni, response status veya body uzunluğundaki anlamlı farklılıklar SQL Injection sinyali olarak yorumlanmıştır.',
    neden: 'SQL Injection açığı doğrulanırsa veri sızıntısı, yetkisiz erişim ve veritabanı hatalarının dışarı sızması riskini gösterebilir. Bu sonuç otomatik test bulgusudur ve manuel doğrulama önerilir. Parametre SQL sorgusuna parametrize binding ile güvenli bağlanmıyor olabilir.',
  },
};

const DEFAULT_META = {
  label: 'Güvenlik Bulgusu',
  category: 'Güvenlik',
  icon: '🔍',
  nedir: 'Bu bulgu, sisteminizde otomatik güvenlik taraması sırasında tespit edilen bir durumu temsil etmektedir. Ayrıntılar için teknik verileri inceleyebilirsiniz.',
  neden: 'Tüm güvenlik bulgularının değerlendirilmesi ve risk durumuna göre önceliklendirilmesi önerilir.',
};

const SECURITY_HEADER_LABELS: Record<string, string> = {
  HSTS:  'HSTS Başlığı Eksik',
  CSP:   'Content-Security-Policy Eksik',
  XFO:   'X-Frame-Options Eksik',
  XCTO:  'X-Content-Type-Options Eksik',
  RP:    'Referrer-Policy Eksik',
  PP:    'Permissions-Policy Eksik',
};

const SECURITY_HEADER_NEDEN: Record<string, string> = {
  HSTS: 'HSTS olmadan tarayıcı HTTP\'ye düşebilir; kullanıcı şifreli kanalın dışına çıkabilir. Strict-Transport-Security başlığı, tarayıcıya bu siteye yalnızca HTTPS üzerinden bağlanmasını emreder.',
  CSP:  'CSP olmadan XSS (Cross-Site Scripting) saldırıları çok daha kolaydır. Bu başlık, hangi kaynaklardan script/stil/içerik yüklenebileceğini tanımlar.',
  XFO:  'X-Frame-Options olmadan site bir iframe içine alınabilir, bu clickjacking saldırısına zemin hazırlar.',
  XCTO: 'X-Content-Type-Options: nosniff olmadan tarayıcı dosya tipini tahmin edebilir (MIME sniffing), bu zararlı içeriklerin farklı tipte yorumlanmasına yol açabilir.',
  RP:   'Referrer-Policy olmadan URL path bilgisi dış sitelere sızabilir. Kullanıcı gizliliği ve uygulama güvenliği açısından önemlidir.',
  PP:   'Permissions-Policy olmadan üçüncü taraf scriptler kamera, mikrofon veya konum gibi hassas API\'lere erişebilir.',
};

function getFindingMeta(finding: Finding): typeof DEFAULT_META {
  if (finding.type === 'SECURITY_HEADER_MISSING') {
    const parts = finding.key.split(':');
    const headerKey = parts[parts.length - 1];
    const baseMeta = FINDING_META['SECURITY_HEADER_MISSING'] ?? DEFAULT_META;
    return {
      ...baseMeta,
      label: SECURITY_HEADER_LABELS[headerKey] ?? baseMeta.label,
      neden: SECURITY_HEADER_NEDEN[headerKey] ?? baseMeta.neden,
    };
  }
  return FINDING_META[finding.type] ?? DEFAULT_META;
}

// ─── Circular Gauge ───────────────────────────────────────────────────────────

function CircularGauge({ score, size = 130, labelOverride }: { score: number; size?: number; labelOverride?: string }) {
  const r = 45;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;

  const col =
    score >= 90 ? { stroke: '#ef4444', glow: 'rgba(239,68,68,0.6)', text: '#f87171', label: 'KRİTİK RİSK' } :
    score >= 70 ? { stroke: '#f97316', glow: 'rgba(249,115,22,0.5)', text: '#fb923c', label: 'YÜKSEK RİSK' } :
    score >= 40 ? { stroke: '#f59e0b', glow: 'rgba(245,158,11,0.5)', text: '#fbbf24', label: 'ORTA RİSK'   } :
                  { stroke: '#22c55e', glow: 'rgba(34,197,94,0.4)',  text: '#4ade80', label: 'DÜŞÜK RİSK'  };

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 120 120">
        {/* Outer glow ring */}
        <circle cx="60" cy="60" r="52" fill="none"
          stroke={col.stroke} strokeWidth="1"
          strokeOpacity="0.15"
        />
        {/* Track */}
        <circle cx="60" cy="60" r={r} fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="10"
        />
        {/* Progress arc */}
        <circle cx="60" cy="60" r={r} fill="none"
          stroke={col.stroke} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform="rotate(-90 60 60)"
          className="gauge-arc"
          style={{ filter: `drop-shadow(0 0 10px ${col.glow})` }}
        />
        {/* Score number */}
        <text x="60" y="55" textAnchor="middle" dominantBaseline="middle"
          fill={col.text} fontSize="28" fontWeight="800" fontFamily="'SF Mono', 'Fira Code', monospace">
          {score}
        </text>
        <text x="60" y="74" textAnchor="middle" dominantBaseline="middle"
          fill="rgba(255,255,255,0.25)" fontSize="10" fontWeight="600">
          / 100
        </text>
      </svg>
      <span className="text-xs font-black tracking-widest" style={{ color: col.text }}>
        {labelOverride ?? col.label}
      </span>
    </div>
  );
}

// ─── AI Report Panel ──────────────────────────────────────────────────────────

const IS_OTX_TYPE = new Set(['OTX_PULSE_DETECTED', 'OTX_MALWARE_ACTIVITY_DETECTED']);

function AiReportPanel({ finding }: { finding: Finding }) {
  const [showRaw, setShowRaw] = useState(false);
  const meta = getFindingMeta(finding);
  const report = getTurkishAiReport(finding);
  const displayScore = getDisplayAiScore(finding);
  const otxLabel = getOtxRiskLabel(finding);

  const hasAiContent = !!(
    report.summary ||
    report.impact ||
    report.recommendations.length > 0 ||
    report.context
  );

  return (
    <div className="border-t border-white/[0.06] animate-fade-in">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">

        {/* ── Left column: descriptions + technical ── */}
        <div className="lg:col-span-7 p-5 space-y-4 border-b lg:border-b-0 lg:border-r border-white/[0.06]">

          {/* Bu Nedir? */}
          <div className="rounded-xl p-4" style={{
            background: 'rgba(99,102,241,0.07)',
            border: '1px solid rgba(99,102,241,0.18)',
          }}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="text-2xl flex-shrink-0">{meta.icon}</span>
              <div>
                <span className="inline-flex items-center text-[10px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {meta.category}
                </span>
                <p className="text-sm font-bold text-slate-200 mt-1">Bu Nedir?</p>
              </div>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">{meta.nedir}</p>
          </div>

          {/* Neden Önemli? */}
          <div className="rounded-xl p-4" style={{
            background: 'rgba(245,158,11,0.06)',
            border: '1px solid rgba(245,158,11,0.18)',
          }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(245,158,11,0.15)' }}>
                <svg className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Neden Önemli?</p>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed">{meta.neden}</p>
          </div>

          {/* Port-specific structured details */}
          {isPortFinding(finding.type) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(56,189,248,0.15)' }}>
                  <svg className="w-3 h-3 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-sky-400 uppercase tracking-wider">Port Tarama Detayları</p>
              </div>
              <PortFindingDetails finding={finding} />
            </div>
          )}

          {/* TLS-specific structured details */}
          {isTlsFinding(finding.type) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(16,185,129,0.15)' }}>
                  <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">TLS Tarama Detayları</p>
              </div>
              <TlsFindingDetails finding={finding} />
            </div>
          )}

          {/* SQLi-specific structured details */}
          {isSqliFinding(finding.type) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.15)' }}>
                  <span className="text-xs">💉</span>
                </div>
                <p className="text-xs font-bold text-red-400 uppercase tracking-wider">SQL Injection Test Detayları</p>
              </div>
              <SqliFindingDetails finding={finding} />
            </div>
          )}

          {/* Teknik Detaylar */}
          <div>
            <button
              type="button"
              onClick={() => setShowRaw(v => !v)}
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors py-1 w-full text-left"
            >
              <svg className={`w-3 h-3 transition-transform duration-200 ${showRaw ? 'rotate-90' : ''}`}
                fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              <span className="font-semibold text-slate-400">Teknik Detaylar</span>
              <span className="text-slate-600">— Ham tarama verisi</span>
            </button>
            {showRaw && (
              <div className="mt-2 animate-fade-in">
                <div className="flex items-center justify-between px-4 py-2 rounded-t-xl"
                  style={{ background: '#060a14', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="text-xs font-mono text-slate-600">dataJson</span>
                  <span className="text-xs text-slate-700">JSON</span>
                </div>
                <pre className="text-xs text-green-400 font-mono leading-relaxed px-4 py-3 overflow-auto max-h-48 rounded-b-xl"
                  style={{ background: '#060a14', border: '1px solid rgba(255,255,255,0.04)', borderTop: 'none' }}>
                  {JSON.stringify(finding.dataJson, null, 2)}
                </pre>
              </div>
            )}
          </div>

          {/* Timestamps */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600 pt-1 border-t border-white/[0.05]">
            <span>
              İlk tespit:{' '}
              <span className="text-slate-500 font-medium">{new Date(finding.createdAt).toLocaleString('tr-TR')}</span>
            </span>
            <span>
              Son görülme:{' '}
              <span className="text-slate-500 font-medium">{new Date(finding.lastSeenAt).toLocaleString('tr-TR')}</span>
            </span>
            {finding.resolvedAt && (
              <span className="text-emerald-500 font-medium">
                Çözüldü: {new Date(finding.resolvedAt).toLocaleString('tr-TR')}
              </span>
            )}
          </div>
        </div>

        {/* ── Right column: AI gauge + analysis ── */}
        <div className="lg:col-span-5 p-5 space-y-4">

          {/* AI Score Gauge */}
          {displayScore > 0 ? (
            <div className="flex flex-col items-center py-5 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-5 h-5 rounded-md flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Yapay Zeka Risk Skoru</p>
              </div>
              <CircularGauge score={displayScore} size={140} labelOverride={otxLabel ?? undefined} />
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 rounded-xl text-center"
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.08)' }}>
              <div className="text-3xl mb-2">🤖</div>
              <p className="text-sm font-semibold text-slate-500">AI Analizi Henüz Mevcut Değil</p>
              <p className="text-xs text-slate-600 mt-1">Bir sonraki taramada otomatik oluşturulacak.</p>
            </div>
          )}

          {/* OTX yorum notu */}
          {IS_OTX_TYPE.has(finding.type) && (
            <div className="rounded-xl p-3.5"
              style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.18)' }}>
              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                OTX Yorum Notu
              </p>
              <p className="text-xs text-amber-400/70 leading-relaxed">
                OTX sonucu kesin zararlılık kanıtı değil, dış tehdit istihbaratı ilişki sinyalidir. Büyük/popüler domainlerde marka taklidi, analiz içi referans veya kampanya bağlamı nedeniyle ilişki görülebilir; DNS, web içerikleri ve hosting kayıtları ayrıca incelenmelidir.
              </p>
            </div>
          )}

          {/* AI Analysis content */}
          {hasAiContent && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-1">
                <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,#3b82f6,#7c3aed)' }}>
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Yapay Zeka Analiz Raporu</p>
              </div>

              {/* Fallback notu */}
              {report.source === 'fallback' && (
                <div className="rounded-lg px-3 py-2"
                  style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
                  <p className="text-[10px] text-indigo-400/70 leading-relaxed">
                    Bu açıklama, bulgu türüne göre Türkçe güvenlik açıklaması olarak gösterilmektedir.
                  </p>
                </div>
              )}

              {report.summary && (
                <div className="rounded-xl p-3.5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span>📋</span> Özet
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed">{report.summary}</p>
                </div>
              )}

              {report.impact && (
                <div className="rounded-xl p-3.5"
                  style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <p className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span>⚡</span> Etki Analizi
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed">{report.impact}</p>
                </div>
              )}

              {report.context && (
                <div className="rounded-xl p-3.5"
                  style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span>💬</span> Bağlam
                  </p>
                  <p className="text-sm text-slate-300 leading-relaxed">{report.context}</p>
                </div>
              )}

              {report.reasons.length > 0 && (
                <div className="rounded-xl p-3.5"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <span>🔎</span> Tespit Nedenleri
                  </p>
                  <ul className="space-y-1.5">
                    {report.reasons.map((reason, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-400 leading-relaxed">
                        <span className="text-slate-600 mt-1 flex-shrink-0">•</span>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.recommendations.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <span>💡</span> Önerilen Aksiyonlar
                  </p>
                  <div className="space-y-2">
                    {report.recommendations.map((rec, i) => (
                      <div key={i} className="flex items-start gap-3 rounded-xl p-3"
                        style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                        <span className="flex-shrink-0 w-5 h-5 rounded-full text-white text-xs font-bold flex items-center justify-center mt-0.5"
                          style={{ background: 'rgba(34,197,94,0.3)', color: '#4ade80' }}>
                          {i + 1}
                        </span>
                        <p className="text-sm text-slate-300 leading-relaxed">{rec}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Finding card ─────────────────────────────────────────────────────────────

function FindingCard({ finding, onAck, acking, onResolve, onReopen, resolving }: {
  finding: Finding;
  onAck: () => void;
  acking: boolean;
  onResolve: () => void;
  onReopen: () => void;
  resolving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isResolved = finding.resolvedAt !== null;
  const meta = getFindingMeta(finding);
  const sevCfg = getSeverityConfig(finding.severity);
  const displayScore = getDisplayAiScore(finding);

  return (
    <div className={`rounded-2xl overflow-hidden transition-all duration-200 ${isResolved ? 'opacity-40' : ''}`}
      style={{
        background: isResolved
          ? 'linear-gradient(145deg, #080f1e 0%, #060c18 100%)'
          : 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
        border: expanded
          ? `1px solid ${sevCfg.ring}35`
          : isResolved
          ? '1px solid rgba(56,189,248,0.05)'
          : '1px solid rgba(56,189,248,0.08)',
        boxShadow: expanded && !isResolved ? `0 0 24px ${sevCfg.glow}` : 'none',
      }}>

      {/* Severity left border strip */}
      <div style={{ borderLeft: `3px solid ${sevCfg.ring}` }}>

        {/* Card header — clickable */}
        <div
          className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none hover:bg-white/[0.02] transition-colors"
          onClick={() => setExpanded(v => !v)}
        >
          <SeverityBadge severity={finding.severity} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-200">{meta.label}</span>
              {finding.isNew && !isResolved && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  YENİ
                </span>
              )}
              {isResolved && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', color: '#475569' }}>
                  ÇÖZÜLDÜ
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-0.5 font-mono truncate">{finding.key}</p>
            {finding.type === 'PORT_EXPOSED' && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">{getPortExposedSummary(finding.dataJson)}</p>
            )}
            {finding.type === 'PORT_CHANGE' && (
              <p className="text-xs text-slate-500 mt-0.5 truncate">{getPortChangeSummary(finding.dataJson)}</p>
            )}
            {isTlsFinding(finding.type) && (() => {
              const tlsSummary = getTlsFindingSummary(finding);
              return tlsSummary ? (
                <p className="text-xs text-slate-500 mt-0.5 truncate">{tlsSummary}</p>
              ) : null;
            })()}
            {isSqliFinding(finding.type) && (() => {
              const sqliSummary = getSqliFindingSummary(finding);
              return sqliSummary ? (
                <p className="text-xs text-slate-500 mt-0.5 truncate">{sqliSummary}</p>
              ) : null;
            })()}
          </div>

          <div className="flex items-center gap-2.5 flex-shrink-0">
            {displayScore > 0 && (
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  {[1,2,3,4,5,6,7,8,9,10].map(n => {
                    const filled = n <= Math.round(displayScore / 10);
                    const barColor = displayScore >= 90 ? '#ef4444' : displayScore >= 70 ? '#f97316' : displayScore >= 40 ? '#f59e0b' : '#22c55e';
                    return (
                      <span key={n}
                        className="w-1.5 h-4 rounded-sm transition-all"
                        style={{
                          background: filled ? barColor : 'rgba(255,255,255,0.08)',
                          opacity: filled ? 1 : 0.5,
                        }}
                      />
                    );
                  })}
                </div>
                <span className="text-xs font-bold tabular-nums" style={{
                  color: displayScore >= 90 ? '#f87171' : displayScore >= 70 ? '#fb923c' : displayScore >= 40 ? '#fbbf24' : '#4ade80',
                }}>
                  {displayScore}/100
                </span>
              </div>
            )}

            <svg className={`w-4 h-4 text-slate-600 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>

            {!isResolved && (
              <>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onAck(); }}
                  disabled={acking}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    color: '#94a3b8',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
                >
                  {acking ? '...' : 'Onayla'}
                </button>
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); onResolve(); }}
                  disabled={resolving}
                  title="Bulguyu elle çöz (sorun sürerse sonraki taramada yeniden açılır)"
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 transition-all"
                  style={{
                    background: 'rgba(16,185,129,0.12)',
                    color: '#34d399',
                    border: '1px solid rgba(16,185,129,0.25)',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.12)'; }}
                >
                  {resolving ? '...' : 'Çöz'}
                </button>
              </>
            )}
            {isResolved && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onReopen(); }}
                disabled={resolving}
                title="Çözülmüş bulguyu yeniden aç"
                className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-50 transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: '#94a3b8',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
              >
                {resolving ? '...' : 'Yeniden Aç'}
              </button>
            )}
          </div>
        </div>

        {/* Expanded AI Report */}
        {expanded && <AiReportPanel finding={finding} />}
      </div>
    </div>
  );
}

// ─── Scan row ─────────────────────────────────────────────────────────────────

const CHECK_STATUS_CFG: Record<CheckStatus, { c: string; glow: string; label: string }> = {
  ok:    { c: '#34d399', glow: 'rgba(16,185,129,0.5)',  label: 'Temiz' },
  warn:  { c: '#fb923c', glow: 'rgba(249,115,22,0.5)',  label: 'Dikkat' },
  error: { c: '#f87171', glow: 'rgba(239,68,68,0.5)',   label: 'Hata' },
  skip:  { c: '#64748b', glow: 'rgba(100,116,139,0.35)', label: 'Atlandı' },
};

function CheckLine({ type, dataJson }: { type: string; dataJson: unknown }) {
  const s = summarizeCheck(type, dataJson);
  const cfg = CHECK_STATUS_CFG[s.status];
  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
        style={{ background: cfg.c, boxShadow: `0 0 6px ${cfg.glow}` }} />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-slate-300">{s.label}</p>
        <p className="text-xs text-slate-500 mt-0.5 break-words">{s.summary}</p>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wide flex-shrink-0 mt-0.5" style={{ color: cfg.c }}>
        {cfg.label}
      </span>
    </div>
  );
}

function ScanRow({ scan }: { scan: import('../types').ScanRun }) {
  const [expanded, setExpanded] = useState(false);
  const expandable = scan.status !== 'RUNNING';
  const duration = scan.finishedAt
    ? Math.round((new Date(scan.finishedAt).getTime() - new Date(scan.startedAt).getTime()) / 1000)
    : null;

  const checksQ = useQuery({
    queryKey: ['scan-checks', scan.id],
    queryFn: () => getScanChecks(scan.id),
    enabled: expanded && expandable,
    staleTime: 5 * 60_000,
  });

  // CHECK_ORDER'a göre sıralı, bilinmeyen tipler sona.
  const orderedItems = checksQ.data
    ? [...checksQ.data.items].sort((a, b) => {
        const ia = CHECK_ORDER.indexOf(a.type); const ib = CHECK_ORDER.indexOf(b.type);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      })
    : [];

  return (
    <div className="rounded-2xl overflow-hidden transition-all duration-200"
      style={{
        background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
        border: '1px solid rgba(56,189,248,0.08)',
      }}>
      <div
        className={`px-5 py-4 flex items-center gap-4 ${expandable ? 'cursor-pointer hover:bg-white/[0.02] transition-colors' : ''}`}
        onClick={() => expandable && setExpanded(v => !v)}
      >
        <ScanStatusBadge status={scan.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-300">
            {new Date(scan.startedAt).toLocaleString('tr-TR')}
          </p>
          <p className="text-xs text-slate-600 mt-0.5">
            {scan.status === 'RUNNING'
              ? 'Tarama devam ediyor...'
              : duration !== null
                ? `${duration < 60 ? `${duration} saniyede` : `${Math.round(duration / 60)} dakikada`} tamamlandı · tüm kontroller için tıkla`
                : 'tüm kontroller için tıkla'
            }
          </p>
        </div>
        {scan.status === 'RUNNING' ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(59,130,246,0.1)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.2)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            Taranıyor
          </span>
        ) : scan.status === 'FAILED' ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
            Sonuç yok
          </span>
        ) : scan.findingsCount > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(249,115,22,0.1)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.2)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            {scan.findingsCount} bulgu
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Temiz
          </span>
        )}
        {expandable && (
          <svg className={`w-4 h-4 text-slate-600 transition-transform duration-200 flex-shrink-0 ${expanded ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>

      {expanded && expandable && (
        <div className="px-5 pb-4 pt-1 border-t border-white/[0.05]">
          {checksQ.isLoading ? (
            <p className="text-sm text-slate-600 py-3">Kontroller yükleniyor…</p>
          ) : checksQ.isError ? (
            <p className="text-sm text-red-400/80 py-3">Tarama sonuçları alınamadı.</p>
          ) : orderedItems.length === 0 ? (
            <p className="text-sm text-slate-600 py-3">Bu tarama için kayıtlı kontrol sonucu yok.</p>
          ) : (
            <div className="space-y-1.5 mt-3">
              <p className="text-[11px] uppercase tracking-widest text-slate-600 font-semibold mb-2 px-1">
                Bu taramada çalışan tüm kontroller ({orderedItems.length})
              </p>
              {orderedItems.map(c => (
                <CheckLine key={c.id} type={c.type} dataJson={c.dataJson} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dark select ──────────────────────────────────────────────────────────────

function DarkSelect({ value, onChange, children }: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="rounded-xl px-3 py-2 text-sm text-slate-300 cursor-pointer focus:outline-none transition-colors"
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#cbd5e1',
      }}
    >
      {children}
    </select>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'findings' | 'intelligence' | 'history' | 'assistant' | 'sqli'>('findings');
  const [severityFilter, setSeverityFilter] = useState('');
  const [resolvedFilter, setResolvedFilter] = useState('false');
  const [isNewFilter, setIsNewFilter] = useState('');
  const [findingsPage, setFindingsPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scanQueued, setScanQueued] = useState(false);
  const [runNowError, setRunNowError] = useState<string | null>(null);

  const assetQ = useQuery({ queryKey: ['asset', id], queryFn: () => getAsset(id!) });
  const asset = assetQ.data;

  // SQLi tab da scan akışını canlı izlemek için scan history'e ihtiyaç duyar
  // (RUNNING scan algılayıp 3s polling'e geçmek için). History tab ile aynı query.
  const scansQ = useQuery({
    queryKey: ['scans', id],
    queryFn: () => getScanHistory(id!),
    enabled: tab === 'history' || tab === 'sqli',
    // Aktif RUNNING scan varsa 3 saniyede bir yenile (mevcut history tab davranışı).
    // SQLi tab da bu polling'den yararlanır → buton tıklandıktan sonra scan
    // RUNNING olur, history burada 3s ile poll'lanır, isScanRunning flag güncel kalır.
    refetchInterval: (q) => {
      const runs = q.state.data;
      if (!runs) return false;
      return runs.some(r => r.status === 'RUNNING') ? 3000 : false;
    },
  });

  const findingsQ = useQuery({
    queryKey: ['findings', id, severityFilter, resolvedFilter, isNewFilter, findingsPage],
    queryFn: () => getFindings(id!, {
      severity: severityFilter || undefined,
      resolved: resolvedFilter || undefined,
      isNew: isNewFilter || undefined,
      page: findingsPage,
      limit: 20,
    }),
    enabled: tab === 'findings',
  });

  const runNowMut = useMutation({
    mutationFn: () => runNow(id!),
    onSuccess: () => {
      setRunNowError(null);
      setScanQueued(true);
      setTab('history');
      setTimeout(() => setScanQueued(false), 5000);
      qc.invalidateQueries({ queryKey: ['scans', id] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } }; code?: string; message?: string };
      const msg = axiosErr.response?.data?.message
        ?? (axiosErr.code === 'ERR_NETWORK' ? 'API\'ye bağlanılamadı — servis çalışıyor mu?' : null)
        ?? axiosErr.message
        ?? 'Tarama başlatılamadı';
      setRunNowError(msg);
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteAsset(id!),
    onSuccess: () => navigate('/assets'),
  });

  const criticalMut = useMutation({
    mutationFn: (v: boolean) => setCritical(id!, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['asset', id] }),
  });

  const intervalMut = useMutation({
    mutationFn: (v: string) => updateScanInterval(id!, v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['asset', id] }),
  });

  const ackMut = useMutation({
    mutationFn: (fid: string) => ackFinding(fid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['findings', id] }),
  });

  const resolveMut = useMutation({
    mutationFn: (fid: string) => resolveFinding(fid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['findings', id] }),
  });

  const reopenMut = useMutation({
    mutationFn: (fid: string) => reopenFinding(fid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['findings', id] }),
  });

  if (assetQ.isLoading) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500 mb-2">Asset bulunamadı.</p>
        <Link to="/assets" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">← Geri dön</Link>
      </div>
    );
  }

  const findings = findingsQ.data;
  const scans = scansQ.data;
  const totalFindingPages = findings ? Math.ceil(findings.total / 20) : 1;
  // resolvedFilter='false' is the default (active-only view) — not counted as an active filter
  const hasActiveFilters = !!(severityFilter || resolvedFilter !== 'false' || isNewFilter);
  const isDefaultActiveView = resolvedFilter === 'false' && !severityFilter && !isNewFilter;

  return (
    <div className="p-6 max-w-6xl mx-auto">

      {/* Run now error */}
      {runNowError && (
        <div className="mb-5 text-sm rounded-xl px-4 py-3 flex items-center justify-between gap-3"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171' }}>
          <span>{runNowError}</span>
          <button type="button" onClick={() => setRunNowError(null)} className="text-red-400 hover:text-red-300 flex-shrink-0 transition-colors">✕</button>
        </div>
      )}

      {/* Scan queued notification */}
      {scanQueued && (
        <div className="mb-5 text-sm rounded-xl px-4 py-3 flex items-center gap-2.5"
          style={{ background: 'rgba(56,189,248,0.06)', border: '1px solid rgba(56,189,248,0.18)', color: '#38bdf8' }}>
          <Spinner size="sm" />
          <span>Tarama kuyruğa eklendi — Scan History sekmesinden takip edebilirsiniz.</span>
        </div>
      )}

      {/* ── Hero ── */}
      <div className="mb-4">
        <AssetHero
          asset={asset}
          onRunScan={() => runNowMut.mutate()}
          isRunScanLoading={runNowMut.isPending}
          onDeleteClick={() => setConfirmDelete(true)}
        />
      </div>

      {/* ── Settings card ── */}
      <div className="rounded-2xl p-5 mb-4"
        style={{
          background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
          border: '1px solid rgba(56,189,248,0.08)',
        }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-4"
          style={{ color: 'rgba(56,189,248,0.4)' }}>Tarama Ayarları</p>
        <div className="flex flex-wrap gap-8 items-start">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2.5">Tarama Aralığı</p>
            <div className="flex gap-1.5">
              {SCAN_INTERVALS.map(iv => (
                <button
                  key={iv}
                  type="button"
                  onClick={() => intervalMut.mutate(iv)}
                  disabled={intervalMut.isPending}
                  className="px-3 py-1.5 text-xs rounded-lg font-semibold transition-all duration-200"
                  style={asset.scanInterval === iv ? {
                    background: 'rgba(56,189,248,0.12)',
                    color: '#38bdf8',
                    border: '1px solid rgba(56,189,248,0.3)',
                  } : {
                    background: 'rgba(56,189,248,0.04)',
                    color: '#64748b',
                    border: '1px solid rgba(56,189,248,0.08)',
                  }}
                >
                  {iv}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-2.5">Öncelik Seviyesi</p>
            <button
              type="button"
              onClick={() => criticalMut.mutate(!asset.critical)}
              disabled={criticalMut.isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg font-semibold transition-all duration-200"
              style={asset.critical ? {
                background: 'rgba(239,68,68,0.12)',
                color: '#f87171',
                border: '1px solid rgba(239,68,68,0.25)',
              } : {
                background: 'rgba(56,189,248,0.04)',
                color: '#64748b',
                border: '1px solid rgba(56,189,248,0.08)',
              }}
            >
              {asset.critical ? (
                <>
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Kritik Olarak İşaretlendi
                </>
              ) : 'Kritik Olarak İşaretle'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-0.5 p-1 rounded-xl mb-4 w-fit"
        style={{ background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.1)' }}>
        {([
          { key: 'findings', label: 'Findings' },
          { key: 'intelligence', label: 'Intelligence' },
          { key: 'history', label: 'Scan History' },
          { key: 'assistant', label: 'AI Assistant' },
          { key: 'sqli', label: 'SQLi Testleri' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className="px-4 py-2 text-[13px] font-semibold rounded-lg transition-all duration-150"
            style={tab === key ? {
              background: 'rgba(56,189,248,0.1)',
              color: '#e2e8f0',
              border: '1px solid rgba(56,189,248,0.18)',
            } : {
              color: '#475569',
              border: '1px solid transparent',
            }}
          >
            {label}
            {key === 'findings' && findings && findings.total > 0 && (
              <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c' }}>
                {findings.total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Findings Tab ── */}
      {tab === 'findings' && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4 items-center">
            <DarkSelect value={severityFilter} onChange={v => { setSeverityFilter(v); setFindingsPage(1); }}>
              <option value="">Tüm Seviyeler</option>
              {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as FindingSeverity[]).map(s => (
                <option key={s} value={s}>
                  {s === 'CRITICAL' ? 'Kritik' : s === 'HIGH' ? 'Yüksek' : s === 'MEDIUM' ? 'Orta' : 'Düşük'}
                </option>
              ))}
            </DarkSelect>
            <DarkSelect value={resolvedFilter} onChange={v => { setResolvedFilter(v); setFindingsPage(1); }}>
              <option value="false">Aktif Bulgular</option>
              <option value="">Tüm Bulgular</option>
              <option value="true">Çözülenler</option>
            </DarkSelect>
            <DarkSelect value={isNewFilter} onChange={v => { setIsNewFilter(v); setFindingsPage(1); }}>
              <option value="">Tüm Bulgular</option>
              <option value="true">Yeni</option>
              <option value="false">Onaylanmış</option>
            </DarkSelect>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => { setSeverityFilter(''); setResolvedFilter('false'); setIsNewFilter(''); setFindingsPage(1); }}
                className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-400 px-2.5 py-1.5 rounded-lg transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Temizle
              </button>
            )}
          </div>

          {findingsQ.isLoading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : !findings || findings.items.length === 0 ? (
            isDefaultActiveView ? (
              <div className="text-center py-20 rounded-2xl"
                style={{ background: 'rgba(16,42,26,0.5)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <div className="mx-auto mb-4 w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                  <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-emerald-400">Şu anda aktif güvenlik bulgusu yok.</p>
                <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto leading-relaxed">
                  Son tarama sonucunda aktif risk veya açık bulgu bulunmadı. Geçmiş tarama kayıtlarını{' '}
                  <button type="button" onClick={() => setTab('history')}
                    className="text-slate-400 underline underline-offset-2 hover:text-slate-300 transition-colors">
                    Scan History
                  </button>{' '}
                  sekmesinden inceleyebilirsiniz.
                </p>
              </div>
            ) : (
              <div className="text-center py-20 rounded-2xl"
                style={{ background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)', border: '1px dashed rgba(56,189,248,0.1)' }}>
                <div className="text-5xl mb-4">🔍</div>
                <p className="text-base font-semibold text-slate-400">
                  {(severityFilter || isNewFilter) ? 'Filtreyle eşleşen bulgu bulunamadı' : 'Henüz bulgu yok'}
                </p>
                <p className="text-sm text-slate-600 mt-1.5">
                  {(severityFilter || isNewFilter) ? 'Farklı filtreler deneyin.' : '"Şimdi Tara" butonuna tıklayarak ilk taramanızı başlatın.'}
                </p>
              </div>
            )
          ) : (
            <>
              <div className="space-y-2.5">
                {findings.items.map(f => (
                  <FindingCard
                    key={f.id}
                    finding={f}
                    onAck={() => ackMut.mutate(f.id)}
                    acking={ackMut.isPending && ackMut.variables === f.id}
                    onResolve={() => resolveMut.mutate(f.id)}
                    onReopen={() => reopenMut.mutate(f.id)}
                    resolving={
                      (resolveMut.isPending && resolveMut.variables === f.id) ||
                      (reopenMut.isPending && reopenMut.variables === f.id)
                    }
                  />
                ))}
              </div>
              {totalFindingPages > 1 && (
                <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/[0.05]">
                  <p className="text-sm text-slate-600">
                    <strong className="text-slate-400">{findings.total}</strong> bulgu · Sayfa {findingsPage}/{totalFindingPages}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFindingsPage(p => Math.max(1, p - 1))}
                      disabled={findingsPage === 1}
                      className="px-3 py-1.5 text-sm rounded-xl font-semibold disabled:opacity-30 transition-all"
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      ← Önceki
                    </button>
                    <button
                      type="button"
                      onClick={() => setFindingsPage(p => Math.min(totalFindingPages, p + 1))}
                      disabled={findingsPage === totalFindingPages}
                      className="px-3 py-1.5 text-sm rounded-xl font-semibold disabled:opacity-30 transition-all"
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      Sonraki →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Intelligence Tab ── */}
      {tab === 'intelligence' && (
        <IntelligenceOverview assetId={id!} />
      )}

      {/* ── AI Assistant Tab ── */}
      {tab === 'assistant' && (
        id ? <AssistantChat assetId={id} /> : null
      )}

      {/* ── SQLi Tab ── */}
      {tab === 'sqli' && (() => {
        // Aktif RUNNING scan algıla — buton state'i + live panel polling hızlandırma için.
        // ScanRun.status === 'RUNNING' kuyruğa eklendiğinde veya worker'da işlenirken set edilir.
        const isScanRunning = (scans ?? []).some((s) => s.status === 'RUNNING');
        return (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <SqliTargetsManager
                assetId={asset.id}
                assetValue={asset.value}
                verified={asset.status === 'VERIFIED'}
                onRunScan={() => runNowMut.mutate()}
                runScanPending={runNowMut.isPending}
                isScanRunning={isScanRunning}
              />
            </div>
            <div className="lg:col-span-4">
              <SqliLivePanel
                assetId={asset.id}
                assetType={asset.type}
                assetStatus={asset.status}
                isScanRunning={isScanRunning}
              />
            </div>
          </div>
        );
      })()}

      {/* ── History Tab ── */}
      {tab === 'history' && (
        <div>
          {scansQ.isLoading ? (
            <div className="flex justify-center py-20"><Spinner size="lg" /></div>
          ) : !scans || scans.length === 0 ? (
            <div className="text-center py-20 rounded-2xl"
              style={{ background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)', border: '1px dashed rgba(56,189,248,0.1)' }}>
              <div className="text-5xl mb-4">📡</div>
              <p className="text-base font-semibold text-slate-400">Tarama geçmişi boş</p>
              <p className="text-sm text-slate-600 mt-1.5">Asset doğrulandıktan sonra ilk tarama otomatik başlar.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {scans.map(scan => (
                <ScanRow key={scan.id} scan={scan} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Delete confirmation modal ── */}
      {confirmDelete && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: 'linear-gradient(135deg, #0d1b2e 0%, #0a1628 100%)',
              border: '1px solid rgba(239,68,68,0.18)',
              boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
            }}>
            <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-100 mb-2 text-center">Asset Silinsin mi?</h3>
            <p className="text-slate-500 text-sm mb-6 text-center leading-relaxed">
              <strong className="text-slate-300">{asset.value}</strong> ve bu assete ait tüm taramalar ile bulgular kalıcı olarak silinecek.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                İptal
              </button>
              <button
                type="button"
                onClick={() => deleteMut.mutate()}
                disabled={deleteMut.isPending}
                className="flex-1 px-4 py-2.5 text-sm font-bold text-white rounded-xl disabled:opacity-60 transition-all"
                style={{ background: 'rgba(239,68,68,0.8)', boxShadow: '0 0 16px rgba(239,68,68,0.3)' }}
              >
                {deleteMut.isPending ? 'Siliniyor...' : 'Evet, Sil'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
