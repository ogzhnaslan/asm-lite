import { KnowledgePage } from '../../components/knowledge/KnowledgePage';
import { KnowledgeCard } from '../../components/knowledge/KnowledgeCard';
import { ConceptBlock } from '../../components/knowledge/ConceptBlock';
import { InfoTable } from '../../components/knowledge/InfoTable';

function Sev({ level }: { level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const styles = {
    CRITICAL: { bg: 'rgba(248,113,113,0.08)', color: '#f87171', border: 'rgba(248,113,113,0.2)' },
    HIGH:     { bg: 'rgba(249,115,22,0.08)',  color: '#fb923c', border: 'rgba(249,115,22,0.2)' },
    MEDIUM:   { bg: 'rgba(251,191,36,0.08)',  color: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
    LOW:      { bg: 'rgba(56,189,248,0.08)',  color: '#38bdf8', border: 'rgba(56,189,248,0.2)' },
  };
  const s = styles[level];
  return (
    <span
      className="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-semibold"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {level}
    </span>
  );
}

export function ReputationCenterPage() {
  const scoreRows = [
    ['≥ 90', <Sev level="CRITICAL" />, '95', 'Yüksek güvenilirlikte kötü amaçlı aktivite'],
    ['70 – 89', <Sev level="HIGH" />, '85', 'Güçlü kötü niyetli aktivite işareti'],
    ['40 – 69', <Sev level="MEDIUM" />, '65', 'Şüpheli aktivite — doğrulama önerilir'],
    ['1 – 39', <Sev level="LOW" />, '35', 'Düşük düzey şüphe — izlemede tut'],
    ['0', '—', '—', 'Temiz — finding üretilmez'],
  ];

  return (
    <KnowledgePage
      badge="Intelligence"
      badgeColor="amber"
      title="Reputation Center"
      description="IP ve domain reputation veritabanları, varlıklarınızın geçmişte kötü amaçlı aktivitelerle ilişkilendirilip ilişkilendirilmediğini gösterir."
    >
      <KnowledgeCard
        title="AbuseIPDB"
        description="AbuseIPDB, ağ kötüye kullanımı (spam, brute force, DDoS, port tarama) bildiren bir IP reputation veritabanıdır. IP asset'ler için kullanılır."
        accent="red"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Abuse Confidence Score"
            definition="0–100 arasında bir güvenilirlik skoru. Ne kadar çok güvenilir kaynak bu IP'yi bildirdiyse skor o kadar yüksek olur."
          />
          <ConceptBlock
            term="Kategoriler"
            definition="AbuseIPDB raporları kategori kodlar içerir: port tarama, brute force, web saldırısı, spam, DDoS vb. Bu kategoriler bulgu dataJson'una kaydedilir."
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="URLhaus"
        description="URLhaus, kötü amaçlı URL'leri ve domain'leri takip eden ücretsiz bir tehdit istihbarat servisidir. Domain asset'ler için kullanılır — API key gerekmez."
        accent="amber"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Malware Dağıtım Noktası"
            definition="Domain'in malware dağıtmak için kullanılıp kullanılmadığını kontrol eder. Aktif URL'ler daha yüksek skor alır."
          />
          <ConceptBlock
            term="Skor Hesabı"
            definition="Aktif kötü amaçlı URL → score 85, offline kötü amaçlı URL → 55, sadece blacklist kaydı → 60."
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="Reputation Score Eşikleri"
        description="MALICIOUS_REPUTATION_DETECTED finding'inin severity ve aiScore değerleri."
        accent="amber"
      >
        <div className="mt-3">
          <InfoTable
            headers={['Score Aralığı', 'Severity', 'aiScore', 'Yorum']}
            rows={scoreRows}
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="Yanlış Pozitifler"
        description="Reputation bulgularını değerlendirirken dikkat edilmesi gerekenler."
        accent="cyan"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Paylaşımlı Hosting"
            definition="Büyük CDN veya hosting sağlayıcılarının IP'leri bazen reputation listelerinde görünebilir. Tek bir IP'de binlerce site barındırılıyor olabilir."
          />
          <ConceptBlock
            term="Geçmişe Dayalı Veriler"
            definition="Reputation veritabanları, geçmişte kötü amaçlı kullanılan ama artık temizlenmiş IP/domain'leri içerebilir. İlk bulgu görüldüğünde mevcut durumu doğrulayın."
          />
          <ConceptBlock
            term="Tüm Providerlarda Başarısızlık"
            definition="Tüm reputation servisleri erişilemez olursa ALL_PROVIDERS_FAILED hatası oluşur — finding üretilmez ve eski finding resolve edilmez. Servis geçici olarak kullanılamıyor demektir."
          />
        </div>
      </KnowledgeCard>
    </KnowledgePage>
  );
}
