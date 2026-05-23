import { KnowledgePage } from '../../components/knowledge/KnowledgePage';
import { KnowledgeCard } from '../../components/knowledge/KnowledgeCard';
import { ConceptBlock } from '../../components/knowledge/ConceptBlock';

export function ThreatIntelligencePage() {
  return (
    <KnowledgePage
      badge="Intelligence"
      badgeColor="red"
      title="Threat Intelligence"
      description="Harici tehdit istihbarat kaynaklarından toplanan veriler ve bunların varlıklarınızla ilişkisi. Bu sayfa varlık bazlı tehdit analizini özetler."
    >
      <KnowledgeCard
        title="AlienVault OTX"
        description="AlienVault Open Threat Exchange (OTX), küresel güvenlik topluluğunun paylaştığı tehdit istihbaratıdır. Domain veya IP adresiniz OTX pulse'larında geçiyorsa, tehdit aktörleri tarafından hedef veya araç olarak kullanılmış olabilir."
        accent="red"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Pulse Sayısı"
            findingType="OTX_PULSE_DETECTED"
            severity="HIGH"
            definition="Varlığınızla ilişkilendirilen OTX pulse (tehdit raporu) sayısı. 5 veya daha fazla → HIGH, 1 veya daha fazla → MEDIUM severity ile bulgu üretilir."
          />
          <ConceptBlock
            term="Malware Aktivitesi"
            findingType="OTX_MALWARE_ACTIVITY_DETECTED"
            severity="CRITICAL"
            definition="Varlıkla ilişkili malware örnekleri. 3 veya daha fazla örnek → CRITICAL, 1 veya daha fazla → HIGH severity ile bulgu üretilir."
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="PhishTank"
        description="PhishTank, aktif phishing URL'lerinin topluluk tabanlı doğrulama veritabanıdır. Domain veya subdomain'iniz burada yer alıyorsa aktif bir phishing kampanyasında kullanılıyor demektir."
        accent="amber"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Phishing Tespiti"
            findingType="PHISHING_DETECTED"
            severity="CRITICAL"
            definition="Doğrulanmış ve aktif phishing → CRITICAL. Sadece doğrulanmış → HIGH. Eşleşme var → MEDIUM."
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="Breach Exposure"
        description="Veri sızıntısı veritabanları, domain'inizle ilişkili e-posta adreslerinin geçmiş ihlallerde yer alıp almadığını gösterir."
        accent="violet"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Sızıntı Tespiti"
            findingType="BREACH_EXPOSURE_DETECTED"
            severity="CRITICAL"
            definition="Düz metin şifre içeren sızıntı → CRITICAL. Şifre hash veya 5+ sızıntı → HIGH. Diğer hassas veri → MEDIUM."
          />
        </div>
      </KnowledgeCard>

      <div
        className="rounded-2xl p-5"
        style={{
          background: 'linear-gradient(145deg, #0e1d35 0%, #0a1628 100%)',
          border: '1px solid rgba(56,189,248,0.08)',
        }}
      >
        <p className="text-xs text-center" style={{ color: 'rgba(148,163,184,0.5)' }}>
          Varlık bazlı tehdit istihbarat detayları için ilgili Asset sayfasına gidin ve Intelligence sekmesini inceleyin.
        </p>
      </div>
    </KnowledgePage>
  );
}
