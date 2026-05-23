import { KnowledgePage } from '../../components/knowledge/KnowledgePage';
import { KnowledgeCard } from '../../components/knowledge/KnowledgeCard';
import { ConceptBlock } from '../../components/knowledge/ConceptBlock';

function ShieldIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function DatabaseIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
    </svg>
  );
}

function BotIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

export function AboutPage() {
  return (
    <KnowledgePage
      badge="Hakkımızda"
      badgeColor="blue"
      title="Attack Surface Monitor"
      description="ASM, şirketlerin ve geliştiricilerin dış saldırı yüzeyini sürekli izlemek için tasarlanmış savunma odaklı bir güvenlik platformudur."
    >
      <KnowledgeCard
        title="ASM Nedir?"
        description="Attack Surface Monitor (ASM), internet üzerinden erişilebilen varlıklarınızı (domain, IP adresi) otomatik olarak tarayarak güvenlik risklerini tespit eden bir platformdur. Güvenlik ekipleri veya tek başına çalışan geliştiriciler için tasarlanmıştır."
        icon={<ShieldIcon />}
        accent="blue"
      />

      <KnowledgeCard
        title="Savunma Odaklı Yaklaşım"
        icon={<EyeIcon />}
        accent="green"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Sürekli İzleme"
            definition="Varlıklarınız düzenli aralıklarla otomatik taranır. Yeni bir güvenlik açığı ortaya çıktığında veya mevcut bir durum değiştiğinde anında bilgilendirilirsiniz."
          />
          <ConceptBlock
            term="Değişiklik Tespiti"
            definition="Her tarama önceki taramayla karşılaştırılır. TLS sertifikanız değişti mi? Bir DNS kaydı güncellendi mi? Port durumu farklılaştı mı? Bu değişiklikler otomatik bulgu olarak raporlanır."
          />
          <ConceptBlock
            term="Risk Önceliklendirme"
            definition="Her bulgu önem derecesine (CRITICAL, HIGH, MEDIUM, LOW) ve AI risk skoruna göre sıralanır. Böylece en kritik sorunlara önce odaklanabilirsiniz."
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="Ownership Verification Neden Var?"
        description="ASM yalnızca size ait varlıkları tarayabilir. Bu doğrulama, sistemin başkalarına ait domain veya IP adreslerini taramak için kötüye kullanılmasını önler."
        icon={<LockIcon />}
        accent="violet"
      >
        <div className="mt-3 space-y-0">
          <ConceptBlock
            term="DNS TXT Doğrulaması"
            definition="Domain'inizin DNS kayıtlarına özel bir TXT kaydı eklemeniz istenir. DNS erişiminizin olması, domain sahibi olduğunuzu kanıtlar."
          />
          <ConceptBlock
            term="HTTP Dosya Doğrulaması"
            definition="Web sunucunuzun belirli bir URL'sine erişilebilir bir token dosyası koymanız istenir. Sunucu erişiminizin olması, sahipliğinizi kanıtlar."
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="Sistem Hangi Verileri Toplar?"
        icon={<DatabaseIcon />}
        accent="cyan"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Port Durumu"
            definition="Açık TCP portları tespit edilir. Riskli portlar (SSH, RDP, veritabanı portları) için uyarı üretilir."
          />
          <ConceptBlock
            term="TLS / SSL Sertifikası"
            definition="Sertifika geçerlilik süresi, issuer bilgisi, fingerprint ve serial numarası kaydedilir. Yaklaşan süre sonu veya sertifika değişikliği raporlanır."
          />
          <ConceptBlock
            term="HTTP Sağlık Durumu"
            definition="HTTP/HTTPS yanıt kodu, gecikme süresi ve erişilebilirlik durumu ölçülür."
          />
          <ConceptBlock
            term="Güvenlik Başlıkları"
            definition="HSTS, CSP, X-Frame-Options gibi kritik HTTP güvenlik başlıklarının varlığı kontrol edilir."
          />
          <ConceptBlock
            term="DNS Kayıtları"
            definition="A, AAAA, MX, NS, TXT, CNAME, SOA ve CAA kayıtları izlenir. SPF, DMARC ve CAA yapılandırması kontrol edilir."
          />
          <ConceptBlock
            term="Threat Intelligence"
            definition="AlienVault OTX, PhishTank, AbuseIPDB, URLhaus ve breach veritabanları gibi harici tehdit istihbarat kaynaklarıyla karşılaştırma yapılır."
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="AI Assistant Ne Yapar?"
        description="Dahili AI Asistan, tarama bulgularını bağlamsal olarak yorumlar ve somut güvenlik önerileri sunar."
        icon={<BotIcon />}
        accent="violet"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Bulgu Analizi"
            definition="Her aktif bulgu için 0–100 arası bir AI risk skoru üretilir. Bu skor, statik önem derecesinin ötesinde bağlamsal risk değerlendirmesi yapar."
          />
          <ConceptBlock
            term="Doğal Dil Sorgulama"
            definition="'Bu asset ne kadar güvenli?' veya 'DNS yapılandırmamda ne değişti?' gibi sorular sorabilirsiniz. AI, varlığınızın gerçek tarama verilerine dayanarak yanıt verir."
          />
          <ConceptBlock
            term="Öneriler"
            definition="AI her bulgu için neden önemli olduğunu, olası etkisini ve düzeltme adımlarını açıklar."
          />
        </div>
      </KnowledgeCard>
    </KnowledgePage>
  );
}
