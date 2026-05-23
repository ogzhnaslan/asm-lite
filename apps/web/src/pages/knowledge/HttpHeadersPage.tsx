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
    <span className="inline-flex px-2 py-0.5 rounded-lg text-[10px] font-semibold"
      style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {level}
    </span>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code className="px-1.5 py-0.5 rounded text-[10px] font-mono whitespace-nowrap"
      style={{ background: 'rgba(56,189,248,0.06)', color: 'rgba(56,189,248,0.7)', border: '1px solid rgba(56,189,248,0.12)' }}>
      {children}
    </code>
  );
}

export function HttpHeadersPage() {
  const headerRows = [
    [
      <Code>Strict-Transport-Security</Code>,
      <Sev level="HIGH" />,
      '75',
      'HTTPS zorunlu kılar — tarayıcı HTTP\'e geri düşmez',
      <Code>max-age=31536000; includeSubDomains</Code>,
    ],
    [
      <Code>Content-Security-Policy</Code>,
      <Sev level="HIGH" />,
      '75',
      'Hangi kaynaklardan içerik yüklenebileceğini tanımlar — XSS engeller',
      <Code>default-src \'self\'</Code>,
    ],
    [
      <Code>X-Frame-Options</Code>,
      <Sev level="MEDIUM" />,
      '50',
      'Sayfanın iframe içine alınmasını engeller — clickjacking önler',
      <Code>DENY</Code>,
    ],
    [
      <Code>X-Content-Type-Options</Code>,
      <Sev level="MEDIUM" />,
      '50',
      'Tarayıcının dosya tipini tahmin etmesini engeller — MIME sniffing önler',
      <Code>nosniff</Code>,
    ],
    [
      <Code>Referrer-Policy</Code>,
      <Sev level="LOW" />,
      '25',
      'Referrer bilgisinin ne kadar paylaşılacağını kontrol eder',
      <Code>strict-origin-when-cross-origin</Code>,
    ],
    [
      <Code>Permissions-Policy</Code>,
      <Sev level="LOW" />,
      '25',
      'Tarayıcı API\'lerini (kamera, mikrofon, konum) kısıtlar',
      <Code>geolocation=(), microphone=()</Code>,
    ],
  ];

  return (
    <KnowledgePage
      badge="HTTP Security Headers"
      badgeColor="violet"
      title="HTTP Güvenlik Başlıkları"
      description="HTTP güvenlik başlıkları, web sunucusunun tarayıcıya gönderdiği yönergelerdir. Doğru yapılandırılmış başlıklar; XSS, clickjacking, MITM ve veri sızıntısı gibi saldırıları önler."
    >
      <KnowledgeCard
        title="Güvenlik Başlıkları Tablosu"
        description="ASM'nin kontrol ettiği 6 başlık, önem dereceleri ve önerilen değerler."
        accent="violet"
      >
        <div className="mt-3">
          <InfoTable
            headers={['Başlık', 'Severity', 'aiScore', 'Koruma', 'Önerilen Değer']}
            rows={headerRows}
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="Başlık Detayları"
        description="Her başlığın ne yaptığı ve neden önemli olduğu."
        accent="blue"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Strict-Transport-Security (HSTS)"
            severity="HIGH"
            definition="Tarayıcıya bu siteye yalnızca HTTPS üzerinden bağlanmasını söyler. Bir kez alındıktan sonra tarayıcı, HTTP bağlantılarını otomatik olarak HTTPS'e yönlendirir. MITM saldırılarını ve SSL stripping'i önler."
            note="max-age değeri saniye cinsindendir. 31536000 = 1 yıl."
          />
          <ConceptBlock
            term="Content-Security-Policy (CSP)"
            severity="HIGH"
            definition="Sayfanın yalnızca izin verilen kaynaklardan script, style, resim ve diğer kaynakları yüklemesine izin verir. XSS (Cross-Site Scripting) saldırılarının etkisini büyük ölçüde azaltır."
            note="CSP yapılandırması karmaşık olabilir — yanlış yapılandırma siteyi bozabilir. report-only mod ile test edilebilir."
          />
          <ConceptBlock
            term="X-Frame-Options"
            severity="MEDIUM"
            definition="Sayfanın iframe, frame veya object içinde gösterilmesini engeller. Clickjacking saldırılarını önler — saldırganlar sayfanızı görünmez frame içine alarak kullanıcıları kandıramaz."
            note="Modern tarayıcılarda CSP'nin frame-ancestors direktifi daha güçlü bir alternatiftir."
          />
          <ConceptBlock
            term="X-Content-Type-Options"
            severity="MEDIUM"
            definition="nosniff değeriyle tarayıcının Content-Type başlığını yok sayıp dosya içeriğinden tip tahmin etmesini engeller. Bu 'MIME sniffing' saldırılarını önler — zararlı içerik yanlış tipte gösterilebilirdi."
          />
          <ConceptBlock
            term="Referrer-Policy"
            severity="LOW"
            definition="Kullanıcı başka bir siteye geçtiğinde hangi referrer bilgisinin gönderileceğini kontrol eder. strict-origin-when-cross-origin, URL path'ini dış sitelere göndermeden sadece origin'i paylaşır."
          />
          <ConceptBlock
            term="Permissions-Policy"
            severity="LOW"
            definition="Sayfanın ve gömülü içeriklerin tarayıcı API'lerine (kamera, mikrofon, konum, bildirim vb.) erişimini kısıtlar. Kötü amaçlı üçüncü taraf scriptlerin bu API'leri kötüye kullanmasını engeller."
          />
        </div>
      </KnowledgeCard>

      <KnowledgeCard
        title="SECURITY_HEADER_MISSING Finding"
        description="Bu finding, her eksik başlık için ayrı ayrı üretilir."
        accent="red"
      >
        <div className="space-y-0">
          <ConceptBlock
            term="Finding Nasıl Çalışır?"
            definition="ASM, HEAD isteğiyle sunucudan başlıkları alır. 6 başlıktan herhangi biri yoksa, o başlık için ayrı bir SECURITY_HEADER_MISSING bulgusu oluşturulur. Her bulgu (assetId, header_name) ikilisine göre unique'tir."
          />
          <ConceptBlock
            term="Statik AI Skoru"
            definition="SECURITY_HEADER_MISSING bulgularına AI analizi uygulanmaz — statik skorlar tanımlanmıştır. CSP ve HSTS için 75, X-Frame ve X-Content-Type için 50, Referrer ve Permissions için 25."
            note="Bu bulgular genellikle kolay düzeltilebilir olduğu için AI analizi yerine statik skor tercih edilir."
          />
          <ConceptBlock
            term="Çözüm"
            definition="Web sunucunuza veya CDN yapılandırmanıza ilgili başlığı ekleyin. Nginx, Apache veya Cloudflare üzerinde birkaç satır yapılandırma yeterlidir."
          />
        </div>
      </KnowledgeCard>
    </KnowledgePage>
  );
}
