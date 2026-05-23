import { KnowledgePage } from '../../components/knowledge/KnowledgePage';
import { KnowledgeCard } from '../../components/knowledge/KnowledgeCard';
import { InfoTable } from '../../components/knowledge/InfoTable';
import { ConceptBlock } from '../../components/knowledge/ConceptBlock';

function Code({ children }: { children: string }) {
  return (
    <code className="px-1.5 py-0.5 rounded text-[10px] font-mono"
      style={{ background: 'rgba(56,189,248,0.06)', color: 'rgba(56,189,248,0.7)', border: '1px solid rgba(56,189,248,0.12)' }}>
      {children}
    </code>
  );
}

function Sev({ level }: { level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' }) {
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

export function DnsSecurityPage() {
  const recordRows = [
    [
      <span className="font-mono font-bold text-blue-400">A</span>,
      'IPv4 Adresi',
      'Domain\'i bir IPv4 adresine çevirir',
      <>Değişiklik = sunucu değişimi veya hijack riski. <Code>DNS_RECORD_CHANGE</Code></>,
    ],
    [
      <span className="font-mono font-bold text-blue-400">AAAA</span>,
      'IPv6 Adresi',
      'Domain\'i bir IPv6 adresine çevirir',
      <>A kaydıyla aynı mantık geçerli. <Code>DNS_RECORD_CHANGE</Code></>,
    ],
    [
      <span className="font-mono font-bold text-orange-400">MX</span>,
      'Mail Exchange',
      'E-posta sunucusunu tanımlar',
      <>Değişiklik = e-posta yönlendirme saldırısı riski. <Code>DNS_MX_CHANGE</Code> HIGH</>,
    ],
    [
      <span className="font-mono font-bold text-red-400">NS</span>,
      'Nameserver',
      'Domain\'in yetkili DNS sunucuları',
      <>Değişiklik = domain hijacking işareti. <Code>DNS_NS_CHANGE</Code> CRITICAL</>,
    ],
    [
      <span className="font-mono font-bold text-cyan-400">TXT</span>,
      'Metin Kaydı',
      'SPF, DMARC, doğrulama tokenları',
      <>SPF ve DMARC buraya yazılır. <Code>DNS_TXT_CHANGE</Code></>,
    ],
    [
      <span className="font-mono font-bold text-yellow-400">CAA</span>,
      'CA Authorization',
      'Hangi CA\'nın sertifika üretebileceğini sınırlar',
      <>Yoksa herhangi bir CA sertifika üretebilir. <Code>DNS_CAA_MISSING</Code> LOW</>,
    ],
  ];

  const emailSecRows = [
    [
      'SPF',
      <Code>TXT</Code>,
      'Hangi sunucuların bu domain adına e-posta gönderebileceğini belirtir',
      <><Sev level="MEDIUM" /> &nbsp;<Code>DNS_SPF_MISSING</Code></>,
    ],
    [
      'DMARC',
      <Code>TXT (_dmarc)</Code>,
      'SPF/DKIM başarısız olan e-postaların ne yapılacağını belirtir (none/quarantine/reject)',
      <><Sev level="HIGH" /> &nbsp;<Code>DNS_DMARC_MISSING</Code></>,
    ],
    [
      'DMARC p=none',
      <Code>TXT (_dmarc)</Code>,
      'DMARC var ama politika none — raporlama var, koruma yok',
      <><Sev level="MEDIUM" /> &nbsp;<Code>DNS_DMARC_WEAK_POLICY</Code></>,
    ],
  ];

  return (
    <KnowledgePage
      badge="DNS Güvenliği"
      badgeColor="cyan"
      title="DNS Kayıtları ve Güvenlik"
      description="DNS (Domain Name System), alan adlarını IP adreslerine çeviren internet altyapısıdır. Yanlış yapılandırılmış DNS kayıtları; domain hijacking, e-posta sahteciliği ve sertifika kötüye kullanımına yol açabilir."
    >
      <KnowledgeCard
        title="DNS Kayıt Tipleri"
        description="ASM'nin izlediği DNS kayıt tipleri ve güvenlik anlamları."
        accent="blue"
      >
        <div className="mt-3">
          <InfoTable
            headers={['Kayıt', 'İsim', 'Ne Yapar?', 'Güvenlik Bağlantısı']}
            rows={recordRows}
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="E-posta Güvenliği: SPF, DMARC"
        description="E-posta sahteciliğine (spoofing) karşı üç katmanlı koruma mekanizması."
        accent="amber"
      >
        <div className="mt-3">
          <InfoTable
            headers={['Mekanizma', 'Kayıt Tipi', 'Ne Yapar?', 'ASM Finding']}
            rows={emailSecRows}
          />
        </div>
        <div className="mt-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
          <p className="text-xs text-amber-300/80 leading-relaxed">
            <strong className="text-amber-300">Neden önemli?</strong> SPF ve DMARC olmadan, saldırganlar sizin domain adınızı kullanarak
            phishing e-postaları gönderebilir. Alıcılar e-postanın gerçekten sizden geldiğini düşünür.
          </p>
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="Kritik Finding Tipleri"
        description="DNS taramasından üretilebilecek tüm bulgu tipleri."
        accent="red"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="DNS_NS_CHANGE"
            findingType="DNS_NS_CHANGE"
            severity="CRITICAL"
            definition="Nameserver kayıtları değişti. Bu, domain'in kontrolünün el değiştirdiğinin en güçlü işaretidir. Yetkisiz NS değişikliği domain hijacking saldırısı anlamına gelebilir."
          />
          <ConceptBlock
            term="DNS_MX_CHANGE"
            findingType="DNS_MX_CHANGE"
            severity="HIGH"
            definition="Mail exchange sunucusu değişti. Saldırganlar MX kaydını değiştirerek tüm gelen e-postaları kendi sunucularına yönlendirebilir."
          />
          <ConceptBlock
            term="DNS_DMARC_MISSING"
            findingType="DNS_DMARC_MISSING"
            severity="HIGH"
            definition="DMARC kaydı yok. E-posta kimlik doğrulaması eksik, spoofing saldırılarına açık kapı bırakılıyor."
          />
          <ConceptBlock
            term="DNS_SPF_MISSING"
            findingType="DNS_SPF_MISSING"
            severity="MEDIUM"
            definition="SPF kaydı yok. Herhangi bir sunucu sizin domain adınıza e-posta gönderebilir. DMARC olmadan bu daha kritiktir."
          />
          <ConceptBlock
            term="DNS_DMARC_WEAK_POLICY"
            findingType="DNS_DMARC_WEAK_POLICY"
            severity="MEDIUM"
            definition="DMARC kaydı var ama politika p=none. Sadece raporlama aktif, koruma sağlanmıyor. p=quarantine veya p=reject olarak güçlendirilmeli."
          />
          <ConceptBlock
            term="DNS_CAA_MISSING"
            findingType="DNS_CAA_MISSING"
            severity="LOW"
            definition="CAA kaydı yok. Herhangi bir Certificate Authority, domain adınız için SSL sertifikası üretebilir. CAA kaydı bunu yalnızca güvendiğiniz CA'larla sınırlar."
          />
          <ConceptBlock
            term="DNS_RECORD_CHANGE"
            findingType="DNS_RECORD_CHANGE"
            severity="MEDIUM"
            definition="A, AAAA, CNAME, CAA veya SOA kayıtlarında değişiklik. CDN geçişi veya sunucu değişimi normal olabilir, ancak yetkisiz değişiklikler güvenlik olayı işaretidir."
          />
          <ConceptBlock
            term="DNS_TXT_CHANGE"
            findingType="DNS_TXT_CHANGE"
            severity="MEDIUM"
            definition="TXT kayıtları değişti. SPF veya DMARC politikası güncellenmiş olabilir — plansız bir değişiklik e-posta güvenliğini bozabilir."
          />
        </div>
      </KnowledgeCard>
    </KnowledgePage>
  );
}
