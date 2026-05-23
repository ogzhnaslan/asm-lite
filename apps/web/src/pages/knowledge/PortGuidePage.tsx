import { KnowledgePage } from '../../components/knowledge/KnowledgePage';
import { KnowledgeCard } from '../../components/knowledge/KnowledgeCard';
import { InfoTable } from '../../components/knowledge/InfoTable';
import { ConceptBlock } from '../../components/knowledge/ConceptBlock';

function Sev({ level }: { level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'OK' }) {
  const styles = {
    CRITICAL: { bg: 'rgba(248,113,113,0.08)', color: '#f87171', border: 'rgba(248,113,113,0.2)' },
    HIGH:     { bg: 'rgba(249,115,22,0.08)',  color: '#fb923c', border: 'rgba(249,115,22,0.2)' },
    MEDIUM:   { bg: 'rgba(251,191,36,0.08)',  color: '#fbbf24', border: 'rgba(251,191,36,0.2)' },
    LOW:      { bg: 'rgba(56,189,248,0.08)',  color: '#38bdf8', border: 'rgba(56,189,248,0.2)' },
    OK:       { bg: 'rgba(52,211,153,0.08)',  color: '#34d399', border: 'rgba(52,211,153,0.2)' },
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

export function PortGuidePage() {
  const portRows = [
    [
      <span className="font-mono font-bold text-slate-200">80</span>,
      'HTTP',
      'Şifresiz web trafiği',
      <Sev level="OK" />,
      'Normal — ama HTTPS yönlendirmesi olmalı',
    ],
    [
      <span className="font-mono font-bold text-slate-200">443</span>,
      'HTTPS',
      'Şifreli web trafiği',
      <Sev level="OK" />,
      'Normal — açık olması beklenir',
    ],
    [
      <span className="font-mono font-bold text-red-400">22</span>,
      'SSH',
      'Uzaktan terminal erişimi',
      <Sev level="CRITICAL" />,
      <>Brute force ve credential stuffing hedefi. <Code>PORT_EXPOSED</Code></>,
    ],
    [
      <span className="font-mono font-bold text-red-400">3389</span>,
      'RDP',
      'Windows uzak masaüstü',
      <Sev level="CRITICAL" />,
      <>Ransomware saldırılarının birincil giriş noktası. <Code>PORT_EXPOSED</Code></>,
    ],
    [
      <span className="font-mono font-bold text-orange-400">3306</span>,
      'MySQL',
      'MySQL veritabanı',
      <Sev level="HIGH" />,
      <>Veri sızıntısı riski, SQL injection amplifikasyonu. <Code>PORT_EXPOSED</Code></>,
    ],
    [
      <span className="font-mono font-bold text-orange-400">5432</span>,
      'PostgreSQL',
      'PostgreSQL veritabanı',
      <Sev level="HIGH" />,
      <>Yetkisiz veri erişimi riski. <Code>PORT_EXPOSED</Code></>,
    ],
    [
      <span className="font-mono font-bold text-orange-400">6379</span>,
      'Redis',
      'Cache / queue sistemi',
      <Sev level="HIGH" />,
      <>Varsayılan yapılandırmada auth yok — veri okuma/yazma açığı. <Code>PORT_EXPOSED</Code></>,
    ],
    [
      <span className="font-mono font-bold text-orange-400">27017</span>,
      'MongoDB',
      'MongoDB veritabanı',
      <Sev level="HIGH" />,
      <>Eski kurulumlar auth gerektirmez — büyük veri ihlallerine yol açmış. <Code>PORT_EXPOSED</Code></>,
    ],
    [
      <span className="font-mono font-bold text-yellow-400">8080</span>,
      'HTTP Alt.',
      'Alternatif HTTP portu',
      <Sev level="MEDIUM" />,
      <>Test/dev sunucuları burada açık kalabilir. <Code>PORT_EXPOSED</Code></>,
    ],
    [
      <span className="font-mono font-bold text-yellow-400">8443</span>,
      'HTTPS Alt.',
      'Alternatif HTTPS portu',
      <Sev level="MEDIUM" />,
      <>Yönetim panelleri sıkça bu portu kullanır. <Code>PORT_EXPOSED</Code></>,
    ],
  ];

  return (
    <KnowledgePage
      badge="Port Rehberi"
      badgeColor="amber"
      title="Port Güvenliği"
      description="TCP portları, bir sunucunun internete açık kapılarıdır. Her açık port potansiyel bir saldırı yüzeyidir. Bu rehber, ASM'nin izlediği portların güvenlik anlamını açıklar."
    >
      <KnowledgeCard
        title="Port Nedir?"
        description="Port, bir sunucuda çalışan belirli bir uygulamaya ya da servise ulaşmak için kullanılan numaralı bir iletişim kanalıdır. 0–65535 arasında numaralandırılır. İnternete açık her port, doğru yapılandırılmazsa saldırı vektörü olabilir."
        accent="blue"
      />

      <KnowledgeCard
        title="Port Tehdit Tablosu"
        description="ASM'nin izlediği portlar, riskleri ve projedeki karşılığı."
        accent="amber"
      >
        <div className="mt-3">
          <InfoTable
            headers={['Port', 'Servis', 'Ne İşe Yarar?', 'Risk Seviyesi', 'Projede Karşılığı']}
            rows={portRows}
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="ASM'deki Finding Tipleri"
        description="Port kontrolü iki tür bulgu üretir."
        accent="cyan"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="PORT_EXPOSED"
            findingType="PORT_EXPOSED"
            severity="CRITICAL"
            definition="Riskli bir port ilk kez açık tespit edildiğinde oluşur. Kritik portlar (SSH, RDP) CRITICAL, diğer riskli portlar HIGH severity ile raporlanır."
          />
          <ConceptBlock
            term="PORT_CHANGE"
            findingType="PORT_CHANGE"
            severity="MEDIUM"
            definition="Daha önce açık olan bir port kapandığında ya da kapalı olan bir port açıldığında oluşur. Beklenmedik değişiklikler güvenlik olaylarının habercisi olabilir."
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="Önerilen Uygulamalar"
        accent="green"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Firewall ile Kısıtlama"
            definition="Veritabanı portları (3306, 5432, 6379, 27017) asla doğrudan internete açık olmamalı. Yalnızca uygulama sunucusunun IP adresine izin verin."
          />
          <ConceptBlock
            term="SSH Erişim Kısıtlaması"
            definition="SSH (22) yalnızca belirli IP adreslerinden erişilebilir olmalı. Mümkünse SSH key auth kullanın, parola ile giriş devre dışı bırakın."
          />
          <ConceptBlock
            term="RDP Güvenliği"
            definition="RDP (3389) doğrudan internete açık olmamalı. VPN veya RD Gateway arkasında çalıştırın. Network Level Authentication (NLA) etkinleştirin."
          />
          <ConceptBlock
            term="Port Değişikliği Takibi"
            definition="Beklenmedik port değişiklikleri (örn. ani kapanma veya açılma), servis çökmesini, saldırıyı veya yanlış yapılandırmayı işaret edebilir."
          />
        </div>
      </KnowledgeCard>
    </KnowledgePage>
  );
}
