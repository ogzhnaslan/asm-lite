import { KnowledgePage } from '../../components/knowledge/KnowledgePage';
import { KnowledgeCard } from '../../components/knowledge/KnowledgeCard';
import { ConceptBlock } from '../../components/knowledge/ConceptBlock';
import { InfoTable } from '../../components/knowledge/InfoTable';

function SevBadge({ level }: { level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const styles = {
    CRITICAL: { bg: 'rgba(248,113,113,0.08)', color: '#f87171', border: 'rgba(248,113,113,0.2)' },
    HIGH:     { bg: 'rgba(249,115,22,0.08)',  color: '#fb923c', border: 'rgba(249,115,22,0.2)' },
    MEDIUM:   { bg: 'rgba(251,191,36,0.08)',  color: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
    LOW:      { bg: 'rgba(56,189,248,0.08)',  color: '#38bdf8', border: 'rgba(56,189,248,0.2)' },
  };
  const s = styles[level];
  return (
    <span className="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-semibold"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {level}
    </span>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code className="px-1.5 py-0.5 rounded text-[10px] font-mono"
      style={{ background: 'rgba(56,189,248,0.06)', color: 'rgba(56,189,248,0.7)', border: '1px solid rgba(56,189,248,0.12)' }}>
      {children}
    </code>
  );
}

export function RiskScoringPage() {
  const severityRows = [
    [
      <SevBadge level="CRITICAL" />,
      '90–100',
      'Acil müdahale',
      'SSH/RDP açık port, phishing tespiti, domain hijacking işareti, sertifika süresi ≤7 gün, OTX malware',
    ],
    [
      <SevBadge level="HIGH" />,
      '75–89',
      'Kısa sürede çözülmeli',
      'HSTS/CSP eksik, DMARC yok, MX değişikliği, ASN değişimi, sertifika ≤15 gün, reputation score ≥70',
    ],
    [
      <SevBadge level="MEDIUM" />,
      '40–74',
      'Planlı çözüm',
      'SPF eksik, DMARC p=none, X-Frame-Options eksik, HTTP durum değişimi, OTX pulse tespiti',
    ],
    [
      <SevBadge level="LOW" />,
      '0–39',
      'İzlemede tut',
      'CAA eksik, Referrer-Policy eksik, Permissions-Policy eksik, robots.txt değişimi',
    ],
  ];

  const intelligenceRows = [
    [
      'AlienVault OTX',
      <Code>OTX_PULSE_DETECTED</Code>,
      '≥5 pulse → HIGH, ≥1 → MEDIUM',
      'Global tehdit aktörleri bu varlığı raporlamış',
    ],
    [
      'AlienVault OTX',
      <Code>OTX_MALWARE_ACTIVITY_DETECTED</Code>,
      '≥3 sample → CRITICAL, ≥1 → HIGH',
      'Malware örnekleri bu varlıkla ilişkilendirilmiş',
    ],
    [
      'PhishTank',
      <Code>PHISHING_DETECTED</Code>,
      'verified+online → CRITICAL, verified → HIGH',
      'Domain aktif phishing kampanyasında kullanılıyor',
    ],
    [
      'AbuseIPDB / URLhaus',
      <Code>MALICIOUS_REPUTATION_DETECTED</Code>,
      'score ≥90 → CRITICAL, ≥70 → HIGH',
      'IP/domain kötü amaçlı aktivite nedeniyle listelendi',
    ],
    [
      'Breach DB',
      <Code>BREACH_EXPOSURE_DETECTED</Code>,
      'plaintext password → CRITICAL',
      'Domain e-postaları veri sızıntısında yer alıyor',
    ],
  ];

  return (
    <KnowledgePage
      badge="Risk Skoru"
      badgeColor="red"
      title="Risk Değerlendirmesi"
      description="ASM, her bulguyu iki boyutta değerlendirir: Severity (önem derecesi) ve aiScore (AI risk puanı). Bu iki metrik birlikte neye önce odaklanmanız gerektiğini gösterir."
    >
      <KnowledgeCard
        title="Severity (Önem Derecesi)"
        description="Her finding tipi için sisteme kodlanmış statik önem derecesi. Bulgunun doğasına göre belirlenir."
        accent="red"
      >
        <div className="mt-3">
          <InfoTable
            headers={['Seviye', 'aiScore Aralığı', 'Eylem', 'Örnek Finding\'ler']}
            rows={severityRows}
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="aiScore Nedir?"
        description="0–100 arasında bir sayısal risk puanı. Severity'den bağımsız, bağlamsal bir değerlendirmedir."
        accent="violet"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Statik Başlangıç Değeri"
            definition="Her finding tipi için varsayılan bir statik skor tanımlıdır. Örneğin PORT_EXPOSED (SSH) → 95, SECURITY_HEADER_MISSING (CSP) → 75, DNS_CAA_MISSING → 35."
          />
          <ConceptBlock
            term="AI Zenginleştirmesi"
            definition="Claude veya Ollama modeli, aktif bulgular bütününü değerlendirerek her bulgunun skorunu bağlamsal olarak revize edebilir. Birden fazla HIGH bulgusu olan bir asset, tek başına aynı bulguya sahip bir assetten daha yüksek skor alabilir."
          />
          <ConceptBlock
            term="aiWhyJson"
            definition="Her AI analizi sonucunda bulgu için özet, nedenler, öneriler, bağlam ve etki alanları üretilir. Asset detail sayfasında bu açıklama görüntülenebilir."
          />
          <ConceptBlock
            term="Fallback"
            definition="AI analizi başarısız olursa statik skorlar korunur. Sistem asla scoring olmadan çalışmaz."
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="Dış İstihbarat Sinyalleri ve Risk"
        description="Harici tehdit istihbarat kaynakları, severity'yi nasıl etkiler?"
        accent="amber"
      >
        <div className="mt-3">
          <InfoTable
            headers={['Kaynak', 'Finding Tipi', 'Severity Mantığı', 'Ne Anlama Gelir?']}
            rows={intelligenceRows}
          />
        </div>
        <div className="mt-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
          <p className="text-xs text-amber-300/80 leading-relaxed">
            <strong className="text-amber-300">Önemli not:</strong> Dış istihbarat sinyalleri yanlış pozitif içerebilir. Büyük hosting
            sağlayıcıları veya CDN IP'leri bazen listelerde görünebilir. Bulguyu doğrularken varlığın gerçek kullanım amacını da göz önüne alın.
          </p>
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="Risk Önceliği Nasıl Yorumlanır?"
        description="Bulgu sayısı her şey değil — doğru önceliklendirme önemli."
        accent="cyan"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="CRITICAL önce"
            definition="Kaç tane LOW bulgunuz olursa olsun, tek bir CRITICAL bulgu anında müdahale gerektirir. Önce CRITICAL, sonra HIGH'ları çözün."
          />
          <ConceptBlock
            term="Değişiklik bulgularını ciddiye alın"
            definition="DNS_NS_CHANGE, TLS_CHANGE veya ASN_CHANGE gibi değişiklik bulguları, plansız gerçekleştiyse aktif bir saldırıyı işaret edebilir. Bunları değişiklik günlüğünüzle karşılaştırın."
          />
          <ConceptBlock
            term="Yapılandırma bulgularını birlikte çözün"
            definition="SPF_MISSING + DMARC_MISSING gibi birbirini tamamlayan bulgular birlikte ele alınmalı. Bir email güvenlik gözden geçirmesi bu tür bulguları toplu kapatır."
          />
          <ConceptBlock
            term="resolvedAt = sorun geçti"
            definition="Bir finding'in resolvedAt alanı doluysa, sistem bir sonraki taramada bu sorunu tespit etmedi demektir. Bu otomatik gerçekleşir — manuel kapatma gerekmez."
          />
        </div>
      </KnowledgeCard>
    </KnowledgePage>
  );
}
