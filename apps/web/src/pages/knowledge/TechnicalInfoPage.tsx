import { KnowledgePage } from '../../components/knowledge/KnowledgePage';
import { KnowledgeCard } from '../../components/knowledge/KnowledgeCard';
import { ConceptBlock } from '../../components/knowledge/ConceptBlock';

export function TechnicalInfoPage() {
  return (
    <KnowledgePage
      badge="Teknik Bilgiler"
      badgeColor="cyan"
      title="Sistem Kavramları"
      description="ASM'nin temel veri modelini ve teknik kavramlarını anlamak, bulguları daha doğru yorumlamanıza yardımcı olur."
    >
      <KnowledgeCard
        title="Temel Veri Modeli"
        description="Sistemdeki tüm veriler bu 5 temel nesne etrafında şekillenir."
        accent="blue"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Asset (Varlık)"
            findingType="DOMAIN | IP"
            definition="İzlemek istediğiniz bir domain adı veya IP adresidir. Örnek: example.com veya 93.184.216.34. Her asset önce sahiplik doğrulamasından geçer, ardından otomatik taramalara dahil edilir."
            note="Bir asset silindiğinde tüm tarama geçmişi ve bulgular da silinir."
          />
          <ConceptBlock
            term="ScanRun (Tarama Oturumu)"
            definition="Bir varlık üzerinde gerçekleştirilen tam tarama işlemidir. Her tarama RUNNING → DONE veya FAILED durumuna geçer. Bir ScanRun içinde 11 farklı kontrol paralel çalışır."
            note="Manuel tetikleme veya zamanlı otomatik tetikleme ile başlatılabilir."
          />
          <ConceptBlock
            term="ScanCheckResult (Kontrol Snapshot'ı)"
            definition="Her tarama kontrolünün ham sonucunu JSON olarak saklar. Örneğin PORTS kontrolünün sonucu, açık port listesini içeren bir snapshot olarak kaydedilir. Bu snapshot'lar değişiklik tespiti için kullanılır."
          />
          <ConceptBlock
            term="Finding (Bulgu)"
            definition="Bir güvenlik riski veya dikkat gerektiren durumu temsil eder. Her finding (assetId, key) ikilisine göre unique'tir — aynı sorun her taramada yeni bulgu oluşturmaz, güncellenir. Sorun çözülünce resolvedAt tarihi set edilir."
          />
          <ConceptBlock
            term="Intelligence (İstihbarat)"
            definition="Son başarılı taramanın DNS kayıtları, RDAP/WHOIS, GeoIP, robots.txt, PhishTank ve OTX gibi bilgi snapshot'larıdır. Bulgulardan farklı olarak bunlar ham verilerdir — risk değil, bağlam sağlar."
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="Tarama Kontrolleri"
        description="Her ScanRun'da çalışan 11 kontrol ve ürettikleri snapshot tipleri."
        accent="cyan"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="PORTS"
            findingType="PORT_EXPOSED · PORT_CHANGE"
            definition="TCP socket bağlantısı ile açık port tespiti. 80, 443, 22, 3389, 8080, 8443, 3000, 5555 portları kontrol edilir."
          />
          <ConceptBlock
            term="TLS_INFO"
            findingType="TLS_CHECK · TLS_EXPIRING · TLS_CHANGE"
            definition="TLS sertifikasının geçerliliği, sona erme tarihi ve fingerprint bilgisi."
          />
          <ConceptBlock
            term="HTTP_HEALTH"
            findingType="HTTP_HEALTH · HTTP_CHANGE"
            definition="HTTP/HTTPS yanıt kodu ve gecikme süresi. HTTPS önce denenir, başarısız olursa HTTP'ye düşer."
          />
          <ConceptBlock
            term="SECURITY_HEADERS"
            findingType="SECURITY_HEADER_MISSING"
            definition="6 kritik HTTP güvenlik başlığının varlığı: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy."
          />
          <ConceptBlock
            term="DNS_RECORDS"
            findingType="DNS_*_CHANGE · DNS_SPF_MISSING · DNS_DMARC_MISSING · DNS_CAA_MISSING"
            definition="A, AAAA, MX, NS, TXT, CNAME, SOA, CAA kayıtları ve DMARC TXT sorgusu."
          />
          <ConceptBlock
            term="RDAP_INFO"
            findingType="WHOIS_EXPIRING · WHOIS_CHANGE"
            definition="Domain kayıt bilgileri: registrar, oluşturma/sona erme tarihleri, nameserver'lar ve status."
          />
          <ConceptBlock
            term="GEOIP_INFO"
            findingType="ASN_CHANGE · GEOIP_CHANGE"
            definition="IP adresinin coğrafi konumu, ASN, ISP ve organizasyon bilgisi."
          />
          <ConceptBlock
            term="ROBOTS_TXT"
            findingType="ROBOTS_SENSITIVE_PATH_EXPOSED · ROBOTS_CHANGE"
            definition="robots.txt dosyasının analizi: hassas path'ler ve içerik değişikliği."
          />
          <ConceptBlock
            term="PHISHTANK_REPUTATION"
            findingType="PHISHING_DETECTED"
            definition="Domain'in PhishTank phishing listesinde olup olmadığı."
          />
          <ConceptBlock
            term="MALICIOUS_REPUTATION"
            findingType="MALICIOUS_REPUTATION_DETECTED"
            definition="IP için AbuseIPDB, domain için URLhaus kontrolü."
          />
          <ConceptBlock
            term="BREACH_EXPOSURE"
            findingType="BREACH_EXPOSURE_DETECTED"
            definition="Domain'in bilinen veri sızıntısı veritabanlarında geçip geçmediği."
          />
          <ConceptBlock
            term="OTX_INTELLIGENCE"
            findingType="OTX_PULSE_DETECTED · OTX_MALWARE_ACTIVITY_DETECTED"
            definition="AlienVault OTX tehdit istihbarat veritabanı kontrolü: pulse sayısı, malware örnekleri, passive DNS."
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="aiScore Nedir?"
        description="Her bulgu için 0–100 arasında üretilen yapay zeka risk puanı."
        accent="violet"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Statik Başlangıç Skoru"
            definition="Her finding tipi için varsayılan bir statik skor tanımlanmıştır. Örneğin SECURITY_HEADER_MISSING için CSP → 75, HSTS → 75, Referrer-Policy → 25."
          />
          <ConceptBlock
            term="AI Zenginleştirmesi"
            definition="AI analizi etkinleştirildiğinde, statik skor bağlamsal olarak yeniden değerlendirilir. Asset tipi, diğer aktif bulgular ve tehdit bağlamı dikkate alınır."
          />
          <ConceptBlock
            term="Yorum Rehberi"
            definition="90–100: Acil müdahale gerektiriyor. 75–89: Yüksek öncelikli, kısa sürede çözülmeli. 50–74: Orta öncelik, planlı çözüm. 0–49: Düşük risk, izlemede tut."
          />
        </div>
      </KnowledgeCard>
    </KnowledgePage>
  );
}
