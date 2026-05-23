import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssistantLlmService } from '../assistant/assistant-llm.service';
import { OtxLookupService, OtxLookupResult } from './otx-lookup.service';

// ─── Template-based Türkçe AI özeti (lookup anında) ──────────────────────────

function buildAiSummary(otx: OtxLookupResult): string {
  if (otx.skipped) {
    const reasons: Record<string, string> = {
      DISABLED: 'OTX kontrolü devre dışı (ENABLE_OTX=false).',
      NO_CREDENTIALS: 'OTX API anahtarı tanımlı olmadığı için sorgu yapılamadı.',
      IPV6_NOT_SUPPORTED: 'IPv6 adresleri için OTX sorgusu henüz desteklenmiyor.',
    };
    return reasons[otx.skipReason ?? ''] ?? `OTX sorgusu atlandı: ${otx.skipReason ?? 'bilinmeyen neden'}.`;
  }

  if (otx.error) {
    const errors: Record<string, string> = {
      INVALID_API_KEY: 'OTX API anahtarı geçersiz; sonuç alınamadı.',
      RATE_LIMITED: 'OTX API istek limiti aşıldı; sorgu tamamlanamadı.',
      OTX_TIMEOUT: 'OTX isteği zaman aşımına uğradı.',
      OTX_REQUEST_FAILED: 'OTX isteği başarısız oldu.',
    };
    return errors[otx.error] ?? `OTX sorgusu başarısız: ${otx.error}.`;
  }

  const { assetValue, pulseCount, malwareCount, urlListCount, passiveDnsCount } = otx;

  if (pulseCount === 0 && malwareCount === 0) {
    return `${assetValue} için AlienVault OTX'te bilinen bir tehdit ilişkisi bulunamadı. Bu olumlu bir sinyaldir, ancak diğer güvenlik kontrollerinin sonuçları da değerlendirilmelidir.`;
  }

  const parts: string[] = [];
  if (pulseCount > 0) parts.push(`${pulseCount} tehdit pulse'ı`);
  if (malwareCount > 0) parts.push(`${malwareCount} malware referansı`);
  if (urlListCount > 0) parts.push(`${urlListCount} ilişkili URL`);
  if (passiveDnsCount > 0) parts.push(`${passiveDnsCount} passive DNS gözlemi`);

  return `${assetValue} için AlienVault OTX'te ${parts.join(', ')} tespit edildi. Bu bir tehdit ilişki sinyalidir; kesin zararlılık kanıtı değildir. DNS kayıtları, hosting bilgileri ve son değişiklikler ayrıca incelenmelidir.`;
}

function buildAiRecommendations(otx: OtxLookupResult): string[] {
  if (otx.skipped || otx.error) return [];

  const recs: string[] = [];

  if (otx.pulseCount > 0 || otx.malwareCount > 0) {
    recs.push('OTX pulse detaylarını inceleyin: hangi tehdit kampanyalarıyla ilişki kurulmuş olduğuna bakın.');
    recs.push('Domain/IP\'nin DNS kayıtlarını, hosting altyapısını ve son değişikliklerini doğrulayın.');
    recs.push('Bu varlık size aitse Verified Assets bölümüne ekleyerek aktif tarama ve sürekli izleme başlatın.');
  }

  if (otx.malwareCount > 0) {
    recs.push('Malware ilişkisi varsa web içeriklerini, indirilebilir dosyaları ve script kaynaklarını gözden geçirin.');
  }

  if (otx.passiveDnsCount > 0) {
    recs.push('Passive DNS geçmişinde alışılmadık IP veya ASN değişimleri olup olmadığını kontrol edin.');
  }

  if (recs.length === 0) {
    recs.push('Mevcut OTX verilerine göre akut bir risk sinyali yok. Düzenli aralıklarla tekrar sorgu yapmanız önerilir.');
    recs.push('Daha kapsamlı güvenlik analizi için varlığı Verified Assets\'e ekleyip aktif tarama başlatabilirsiniz.');
  }

  return recs;
}

function deriveStatus(otx: OtxLookupResult): string {
  if (otx.error) return 'ERROR';
  if (otx.skipped) return 'SKIPPED';
  return 'DONE';
}

// ─── OTX Chat prompt ──────────────────────────────────────────────────────────

const OTX_CHAT_SYSTEM = `Sen bir siber güvenlik asistanısın.
Kullanıcıya AlienVault OTX pasif tehdit istihbaratı sorgusunu Türkçe, açıklayıcı ve teknik olarak doğru biçimde anlat.

Temel kurallar:
- Cevapların daima Türkçe olmalıdır.
- Her cevap en az 4-5 cümle uzunluğunda, açıklayıcı ve bağlamsal olmalıdır. Tek cümlelik veya çok kısa cevaplar verme.
- OTX sonuçlarının pasif threat intelligence verisi olduğunu belirt; aktif tarama sonucu değildir.
- Kesin zararlılık iddiasında bulunma. "Bu kesinlikle zararlıdır" gibi ifadeler kullanma.
- Pulse/malware ilişkisi olmak zararlı olduğu anlamına gelmez; bu bir sinyal, hüküm değildir.
- Büyük ve popüler domainlerde marka taklidi, analiz referansı veya kampanya bağlamı nedeniyle OTX ilişkisi görülebileceğini belirt.
- Eğer veri yoksa "bu bilgi mevcut OTX verisinde bulunmuyor" de; uydurma.
- Exploit, saldırı adımı veya zararlı komut verme.
- Sayısal verileri (pulse sayısı, malware referansı, passive DNS sayısı) yorumlarken bağlam ver: bu sayı yüksek mi, düşük mü, ne anlama gelir?
- Cevaplarda hedefe özgü verileri kullan; genel bilgi vermekten kaçın.
- Risk varsa öneri sun; risk yoksa mevcut temiz durumu doğrulayıp yine de yapılabilecek kontrolleri belirt.
- Raporda veya akademik sunumda kullanılabilecek cümle formatıyla yaz.`;

function buildOtxChatPrompt(
  target: string,
  targetType: string,
  checkedAt: Date,
  otx: OtxLookupResult | null,
  aiSummary: string | null,
  aiRecommendations: string[] | null,
  question: string,
): string {
  const lines: string[] = [
    `## Passive Lookup Bağlamı`,
    `- Hedef: ${target} (${targetType})`,
    `- Sorgu Tarihi: ${checkedAt.toISOString()}`,
    `- Kaynak: AlienVault OTX`,
  ];

  if (!otx) {
    lines.push(`- OTX Verisi: Mevcut değil`);
  } else if (otx.skipped) {
    lines.push(`- OTX Durumu: Atlandı (${otx.skipReason ?? 'bilinmiyor'})`);
  } else if (otx.error) {
    lines.push(`- OTX Durumu: Hata (${otx.error})`);
  } else {
    lines.push(`- Pulse Sayısı: ${otx.pulseCount}`);
    lines.push(`- Malware Referansı: ${otx.malwareCount}`);
    lines.push(`- İlişkili URL: ${otx.urlListCount}`);
    lines.push(`- Passive DNS Gözlemi: ${otx.passiveDnsCount}`);
    if (otx.tags.length > 0) {
      lines.push(`- Etiketler: ${otx.tags.slice(0, 10).join(', ')}`);
    }
    if (otx.pulses.length > 0) {
      lines.push(`- Son Pulse'lar:`);
      otx.pulses.slice(0, 5).forEach(p => {
        lines.push(`  • ${p.name}${p.tags.length > 0 ? ` [${p.tags.slice(0, 3).join(', ')}]` : ''}`);
      });
    }
  }

  if (aiSummary) {
    lines.push(`\n## Otomatik Özet`);
    lines.push(aiSummary);
  }

  if (aiRecommendations && aiRecommendations.length > 0) {
    lines.push(`\n## Otomatik Öneriler`);
    aiRecommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  }

  lines.push(`\n## Kullanıcı Sorusu`);
  lines.push(question);

  return lines.join('\n');
}

function buildFallbackAnswer(
  target: string,
  otx: OtxLookupResult | null,
  question: string,
): string {
  const q = question.toLowerCase();

  if (!otx || otx.skipped || otx.error) {
    return `Bu kayıt için OTX verisi mevcut değil ya da sorgu tamamlanamadı. Sonuç elde etmek için OTX API anahtarının tanımlı ve aktif olduğundan emin olun, ardından ${target} için yeniden sorgu başlatın.`;
  }

  const hasRisk = otx.pulseCount > 0 || otx.malwareCount > 0;

  if (q.includes('zararlı') || q.includes('tehlikeli') || q.includes('güvenli') || q.includes('risk')) {
    if (hasRisk) {
      return `${target} için OTX'te ${otx.pulseCount} pulse ve ${otx.malwareCount} malware referansı tespit edildi. Bu bir tehdit ilişki sinyalidir; ancak OTX verisi kesin zararlılık kanıtı değildir. Büyük/popüler domainlerde marka taklidi veya analiz referansı nedeniyle ilişki görülebilir. Kapsamlı bir değerlendirme için DNS, hosting altyapısı ve son değişiklikler ayrıca incelenmelidir.`;
    }
    return `${target} için OTX'te bilinen bir tehdit pulse'ı veya malware referansı bulunamadı. Bu olumlu bir sinyaldir. Ancak OTX yalnızca pasif intelligence kaynağıdır; aktif tarama ve diğer güvenlik kontrolleri de gereklidir.`;
  }

  if (q.includes('passive dns') || q.includes('pasif dns')) {
    return `Passive DNS, geçmişte bu domain veya IP ile ilişkilendirilen DNS gözlemlerini ifade eder. Hangi IP adreslerinin bu domaine işaret ettiği veya bu IP ile hangi domainlerin ilişkilendirildiği gibi geçmişe dönük veriler içerir. Tek başına zararlılık kanıtı değildir; ancak altyapı değişikliklerini ve şüpheli yönlendirmeleri tespit etmek için yararlı bir sinyal olabilir.`;
  }

  if (q.includes('pulse')) {
    return `OTX pulse'ları, güvenlik araştırmacıları tarafından paylaşılan tehdit istihbaratı paketleridir. Bir pulse; IOC (göstergeler), etkilenen domainler/IP'ler, tehdit kampanyası açıklaması ve etiketler içerir. ${target} için ${otx.pulseCount} pulse bulunuyor. Bu sayı yüksekse dikkatle incelenmeli; düşükse ya da sıfırsa bu olumlu bir sinyal sayılır.`;
  }

  if (q.includes('özet') || q.includes('anlat') || q.includes('açıkla') || q.includes('ne anlama')) {
    return buildAiSummary(otx);
  }

  if (q.includes('rapor') || q.includes('hoca') || q.includes('sunum')) {
    const status = hasRisk ? `${otx.pulseCount} tehdit pulse’ı ve ${otx.malwareCount} malware referansı tespit edildi` : `tehdit pulse’ı veya malware referansı tespit edilmedi`;
    return `Raporlama için öneri: "${target} için AlienVault OTX pasif tehdit istihbaratı sorgusu yapıldı. Sorgu sonucunda ${status}. OTX verisi, güvenlik topluluğunun paylaştığı tehdit istihbaratı ilişkilerini gösterir; aktif tarama sonucu değildir ve tek başına kesin zararlılık kanıtı sunmaz."`;
  }

  // Genel fallback
  return `Bu sorgu AlienVault OTX üzerinden alınan pasif tehdit istihbaratı verisidir. ${target} için ${otx.pulseCount} pulse, ${otx.malwareCount} malware referansı, ${otx.urlListCount} ilişkili URL ve ${otx.passiveDnsCount} passive DNS gözlemi bulunuyor. OTX sonuçları ilişki sinyali niteliğindedir; kesin zararlılık hükmü için aktif tarama ve diğer kaynakların birlikte değerlendirilmesi gerekir.`;
}

// ─── Return types ─────────────────────────────────────────────────────────────

export interface PassiveLookupRunRecord {
  id: string;
  userId: string;
  target: string;
  targetType: string;
  source: string;
  status: string;
  otxJson: unknown;
  aiSummary: string | null;
  aiRecommendations: unknown;
  error: string | null;
  checkedAt: Date;
  createdAt: Date;
}

export interface PassiveLookupHistoryResult {
  items: PassiveLookupRunRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface PassiveLookupAskResult {
  answer: string;
  usedContext: {
    target: string;
    source: string;
    checkedAt: string;
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class IntelligenceService {
  constructor(
    private readonly otxLookup: OtxLookupService,
    private readonly prisma: PrismaService,
    private readonly llmService: AssistantLlmService,
  ) {}

  async passiveLookup(rawTarget: string, userId: string) {
    if (!rawTarget || typeof rawTarget !== 'string' || !rawTarget.trim()) {
      throw new BadRequestException('target is required');
    }

    const { target, targetType } = this.normalizeTarget(rawTarget.trim());
    const checkedAt = new Date().toISOString();
    const otx = await this.otxLookup.lookup(target, targetType);

    // DB'ye kaydet — fire-and-forget, ana response'u bloklamaz
    this.savePassiveLookupRun(userId, target, targetType, otx).catch(() => {
      // Kayıt hatası ana sorguyu etkilemez
    });

    return {
      target,
      targetType,
      mode: 'PASSIVE_LOOKUP' as const,
      sources: { otx },
      checkedAt,
    };
  }

  private async savePassiveLookupRun(
    userId: string,
    target: string,
    targetType: 'DOMAIN' | 'IP',
    otx: OtxLookupResult,
  ): Promise<void> {
    await this.prisma.passiveLookupRun.create({
      data: {
        userId,
        target,
        targetType,
        source: 'OTX',
        status: deriveStatus(otx),
        otxJson: otx as object,
        aiSummary: buildAiSummary(otx),
        aiRecommendations: buildAiRecommendations(otx),
        error: otx.error ?? null,
        checkedAt: new Date(),
      },
    });
  }

  async getHistory(userId: string, page = 1, limit = 50): Promise<PassiveLookupHistoryResult> {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.passiveLookupRun.findMany({
        where: { userId },
        orderBy: { checkedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          userId: true,
          target: true,
          targetType: true,
          source: true,
          status: true,
          otxJson: true,
          aiSummary: true,
          aiRecommendations: true,
          error: true,
          checkedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.passiveLookupRun.count({ where: { userId } }),
    ]);
    return { items, total, page, limit };
  }

  async getHistoryDetail(id: string, userId: string): Promise<PassiveLookupRunRecord | null> {
    const run = await this.prisma.passiveLookupRun.findUnique({ where: { id } });
    if (!run || run.userId !== userId) return null;
    return run;
  }

  async askPassiveLookup(
    id: string,
    userId: string,
    question: string,
  ): Promise<PassiveLookupAskResult> {
    const run = await this.prisma.passiveLookupRun.findUnique({ where: { id } });
    if (!run || run.userId !== userId) throw new NotFoundException('Passive lookup record not found');

    const otx = run.otxJson as OtxLookupResult | null;
    const aiRecs = Array.isArray(run.aiRecommendations) ? run.aiRecommendations as string[] : null;

    const contextPrompt = buildOtxChatPrompt(
      run.target,
      run.targetType,
      run.checkedAt,
      otx,
      run.aiSummary,
      aiRecs,
      question,
    );

    let answer: string;
    try {
      const llmResult = await this.llmService.chatWithSystem(OTX_CHAT_SYSTEM, contextPrompt);
      answer = llmResult.answer;
    } catch {
      answer = buildFallbackAnswer(run.target, otx, question);
    }

    return {
      answer,
      usedContext: {
        target: run.target,
        source: run.source,
        checkedAt: run.checkedAt.toISOString(),
      },
    };
  }

  normalizeTarget(raw: string): { target: string; targetType: 'DOMAIN' | 'IP' } {
    if (!raw) throw new BadRequestException('target is required');

    let target = raw;

    if (/^https?:\/\//i.test(target)) {
      try {
        const url = new URL(target);
        target = url.hostname;
      } catch {
        throw new BadRequestException('Invalid URL format');
      }
    }

    target = target.split('/')[0].split('?')[0].split('#')[0];

    const portMatch = target.match(/^(.+?):\d+$/);
    if (portMatch) target = portMatch[1];

    target = target.trim().toLowerCase();

    if (!target) throw new BadRequestException('target is required');
    if (target.length > 253) throw new BadRequestException('target is too long');
    if (/\s/.test(target)) throw new BadRequestException('target must not contain whitespace');

    const isIPv4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(target);
    const targetType: 'DOMAIN' | 'IP' = isIPv4 ? 'IP' : 'DOMAIN';

    if (targetType === 'IP') {
      const octets = target.split('.');
      const valid =
        octets.length === 4 &&
        octets.every((o) => {
          const n = parseInt(o, 10);
          return /^\d+$/.test(o) && n >= 0 && n <= 255;
        });
      if (!valid) throw new BadRequestException('Invalid IPv4 address');
    }

    if (targetType === 'DOMAIN') {
      const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
      if (!domainRegex.test(target)) {
        throw new BadRequestException('Invalid domain or IP format. Example: example.com or 1.2.3.4');
      }
    }

    return { target, targetType };
  }
}
