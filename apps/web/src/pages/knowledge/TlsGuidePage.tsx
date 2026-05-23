import { KnowledgePage } from '../../components/knowledge/KnowledgePage';
import { KnowledgeCard } from '../../components/knowledge/KnowledgeCard';
import { ConceptBlock } from '../../components/knowledge/ConceptBlock';
import { InfoTable } from '../../components/knowledge/InfoTable';

function Sev({ level }: { level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const styles = {
    CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/20',
    HIGH: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    MEDIUM: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    LOW: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${styles[level]}`}>
      {level}
    </span>
  );
}

export function TlsGuidePage() {
  const expiryRows = [
    ['≤ 7 gün', <Sev level="CRITICAL" />, 'Acil yenileme gerekiyor — sertifika neredeyse geçersiz'],
    ['≤ 15 gün', <Sev level="HIGH" />, 'Yenileme planı hemen oluşturulmalı'],
    ['≤ 30 gün', <Sev level="MEDIUM" />, 'Yaklaşan süre sonu — planlı yenileme önerilir'],
    ['> 30 gün', '—', 'Normal durum — izlemede'],
  ];

  const certFieldRows = [
    ['Subject', 'Sertifikanın kime ait olduğu (CN, O, C)', 'Domain adınız ve organizasyon bilginiz burada görünür'],
    ['Issuer', 'Sertifikayı imzalayan CA', "Let's Encrypt, DigiCert, Sectigo vb. Güvenilir CA'lardan alınmış olmalı"],
    ['Fingerprint', 'Sertifikanın SHA-256 hash değeri', 'Değişiklik tespiti için kullanılır — her yeni sertifikada farklılaşır'],
    ['Serial', 'CA\'nın atadığı sertifika seri numarası', 'Yenileme veya revocation takibinde kullanılır'],
    ['Valid From / To', 'Sertifikanın geçerlilik aralığı', 'ASM bu aralıktan kalan günü hesaplar'],
  ];

  return (
    <KnowledgePage
      badge="TLS / SSL"
      badgeColor="green"
      title="TLS Sertifikaları ve HTTPS Güvenliği"
      description="TLS (Transport Layer Security), internet üzerindeki veri iletişimini şifreleyerek saldırganların trafiği dinlemesini veya değiştirmesini engeller. SSL, TLS'nin eski adıdır."
    >
      <KnowledgeCard
        title="TLS Nasıl Çalışır?"
        description="Tarayıcı ile sunucu arasındaki bağlantı kurulurken bir 'handshake' (el sıkışma) gerçekleşir."
        accent="blue"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="1. Handshake"
            definition="Tarayıcı, sunucuya bağlanmak istediğini bildirir. Sunucu, sertifikasını gönderir."
          />
          <ConceptBlock
            term="2. Sertifika Doğrulama"
            definition="Tarayıcı, sertifikanın güvenilir bir CA tarafından imzalandığını, domain ile eşleştiğini ve süresinin dolmadığını kontrol eder."
          />
          <ConceptBlock
            term="3. Şifreli Kanal"
            definition="Doğrulama başarılıysa şifreli bir kanal kurulur. Tüm veri alışverişi bu kanal üzerinden yapılır — kimse dinleyemez veya değiştiremez."
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="Sertifika Alanları"
        description="ASM'nin her taramada kaydettiği sertifika bilgileri."
        accent="cyan"
      >
        <div className="mt-3">
          <InfoTable
            headers={['Alan', 'Ne Anlama Gelir?', 'Güvenlik Önemi']}
            rows={certFieldRows}
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="Süre Sonu Eşikleri"
        description="ASM, sertifika geçerlilik süresine kalan güne göre farklı önem derecelerinde uyarı üretir."
        accent="amber"
      >
        <div className="mt-3">
          <InfoTable
            headers={['Kalan Süre', 'Severity', 'Açıklama']}
            rows={expiryRows}
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="Finding Tipleri"
        description="TLS taramasından üretilebilecek bulgular."
        accent="red"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="TLS_EXPIRING"
            findingType="TLS_EXPIRING"
            severity="CRITICAL"
            definition="Sertifikanın sona erme tarihine göre CRITICAL, HIGH veya MEDIUM severity ile oluşur. Sertifika süresi dolduğunda tarayıcılar bağlantıyı reddeder — kullanıcılar sitenize erişemez."
          />
          <ConceptBlock
            term="TLS_CHANGE"
            findingType="TLS_CHANGE"
            severity="MEDIUM"
            definition="Sertifika fingerprint veya serial numarası değişti. Planlı yenilemede beklenen bir durum. Ancak plansız bir değişiklik; MITM saldırısı, sertifika hırsızlığı veya yapılandırma hatası işareti olabilir."
          />
          <ConceptBlock
            term="TLS_CHECK"
            findingType="TLS_CHECK"
            severity="HIGH"
            definition="TLS bağlantısı kurulamadı. Sunucu HTTPS desteklemiyor olabilir veya sertifika tamamen geçersiz/expired durumda."
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="TLS_CHANGE Neden Risk Olabilir?"
        description="Sertifika değişikliği her zaman sorun değil — ama dikkat gerektiriyor."
        accent="violet"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Normal Senaryo"
            definition="Let's Encrypt sertifikaları 90 günde bir yenilenir. Her yenilemede fingerprint değişir. Bu beklenen bir durumdur."
          />
          <ConceptBlock
            term="Riskli Senaryo: Plansız Değişiklik"
            definition="Sertifikanın erken değişmesi; bir saldırganın başka bir CA'dan sahte sertifika edinmesini, BGP hijacking sonrası farklı sunucuya yönlendirmeyi veya yanlış yapılandırmayı işaret edebilir."
          />
          <ConceptBlock
            term="CAA Kaydının Rolü"
            definition="DNS CAA kaydı, yalnızca belirtilen CA'ların bu domain için sertifika üretebileceğini tanımlar. CAA + DMARC birlikte güçlü bir identity pinning sağlar."
          />
        </div>
      </KnowledgeCard>
    </KnowledgePage>
  );
}
