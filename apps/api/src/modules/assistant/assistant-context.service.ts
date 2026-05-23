import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Intelligence Summary Types ───────────────────────────────────────────────

export interface DnsSummary {
  totalRecords: number;
  a: number;
  mx: number;
  ns: number;
  txt: number;
  caa: number;
  hasDmarc: boolean;
  errorCount: number;
}

export interface RdapSummary {
  registrar: string | null;
  expiresDate: string | null;
  nameServerCount: number;
  statusCount: number;
  hasError: boolean;
}

export interface GeoIpSummary {
  resolvedIp: string | null;
  country: string | null;
  countryCode: string | null;
  city: string | null;
  asn: string | null;
  isp: string | null;
  organization: string | null;
  hasError: boolean;
}

export interface RobotsSummary {
  exists: boolean;
  disallowCount: number;
  sitemapCount: number;
  sensitivePathCount: number;
  highSeverityPathCount: number;
  hasError: boolean;
}

export interface PhishTankSummary {
  skipped: boolean;
  isListed: boolean;
  verifiedMatches: number;
  onlineMatches: number;
  matchedUrlCount: number;
  hasError: boolean;
}

export interface ReputationSummary {
  skipped: boolean;
  isMalicious: boolean;
  maxScore: number | null;
  providerCount: number;
  categories: string[];
  hasError: boolean;
}

export interface BreachSummary {
  skipped: boolean;
  status: string;
  provider: string;
  breachCount: number;
  exposedEmailsCount: number | null;
  sensitiveDataTypes: string[];
  latestBreachDate: string | null;
  hasError: boolean;
}

export interface OtxSummary {
  skipped: boolean;
  pulseCount: number;
  malwareCount: number;
  urlListCount: number;
  passiveDnsCount: number;
  tags: string[];
  hasError: boolean;
}

export interface IntelligenceSummary {
  dns: DnsSummary | null;
  rdap: RdapSummary | null;
  geoip: GeoIpSummary | null;
  robots: RobotsSummary | null;
  phishtank: PhishTankSummary | null;
  reputation: ReputationSummary | null;
  breach: BreachSummary | null;
  otx: OtxSummary | null;
}

// ─── Main Context ─────────────────────────────────────────────────────────────

export interface AssistantContext {
  asset: {
    value: string;
    type: string;
    status: string;
    critical: boolean;
    scanInterval: string;
  };
  scanRuns: Array<{
    status: string;
    startedAt: string;
    finishedAt: string | null;
    findingCount: number;
  }>;
  findings: {
    activeCount: number;
    resolvedCount: number;
    bySeverity: { CRITICAL: number; HIGH: number; MEDIUM: number; LOW: number };
    top: Array<{
      type: string;
      severity: string;
      key: string;
      aiScore: number | null;
      summary: string | null;
      recommendations: string[] | null;
    }>;
  };
  intelligence: IntelligenceSummary;
  hasIntelligence: boolean;
}

// ─── Parse Helpers ────────────────────────────────────────────────────────────

function parseDnsSummary(data: Record<string, unknown>): DnsSummary {
  const records = (data.records as Array<{ type?: string }> | undefined) ?? [];
  const errors = (data.errors as Record<string, string> | undefined) ?? {};
  const counts: Record<string, number> = {};
  for (const rec of records) {
    if (rec.type) counts[rec.type] = (counts[rec.type] ?? 0) + 1;
  }
  return {
    totalRecords: records.length,
    a: counts['A'] ?? 0,
    mx: counts['MX'] ?? 0,
    ns: counts['NS'] ?? 0,
    txt: counts['TXT'] ?? 0,
    caa: counts['CAA'] ?? 0,
    hasDmarc: !!(data.dmarcRecord),
    errorCount: Object.keys(errors).length,
  };
}

function parseRdapSummary(data: Record<string, unknown>): RdapSummary {
  return {
    registrar: (data.registrar as string | null) ?? null,
    expiresDate: (data.expiresDate as string | null) ?? null,
    nameServerCount: ((data.nameServers as unknown[] | undefined) ?? []).length,
    statusCount: ((data.status as unknown[] | undefined) ?? []).length,
    hasError: !!(data.error),
  };
}

function parseGeoIpSummary(data: Record<string, unknown>): GeoIpSummary {
  return {
    resolvedIp: (data.resolvedIp as string | null) ?? null,
    country: (data.country as string | null) ?? null,
    countryCode: (data.countryCode as string | null) ?? null,
    city: (data.city as string | null) ?? null,
    asn: (data.asn as string | null) ?? null,
    isp: (data.isp as string | null) ?? null,
    organization: (data.organization as string | null) ?? null,
    hasError: !!(data.error),
  };
}

function parseRobotsSummary(data: Record<string, unknown>): RobotsSummary {
  return {
    exists: !!(data.exists),
    disallowCount: ((data.disallowRules as unknown[] | undefined) ?? []).length,
    sitemapCount: ((data.sitemapUrls as unknown[] | undefined) ?? []).length,
    sensitivePathCount: ((data.sensitivePaths as unknown[] | undefined) ?? []).length,
    highSeverityPathCount: ((data.highSeverityPaths as unknown[] | undefined) ?? []).length,
    hasError: !!(data.error),
  };
}

function parsePhishTankSummary(data: Record<string, unknown>): PhishTankSummary {
  return {
    skipped: !!(data.skipped),
    isListed: !!(data.isListed),
    verifiedMatches: (data.verifiedMatches as number | undefined) ?? 0,
    onlineMatches: (data.onlineMatches as number | undefined) ?? 0,
    matchedUrlCount: ((data.matchedUrls as unknown[] | undefined) ?? []).length,
    hasError: !!(data.error),
  };
}

function parseReputationSummary(data: Record<string, unknown>): ReputationSummary {
  return {
    skipped: !!(data.skipped),
    isMalicious: !!(data.isMalicious),
    maxScore: (data.maxScore as number | null) ?? null,
    providerCount: ((data.providers as unknown[] | undefined) ?? []).length,
    categories: ((data.categories as string[] | undefined) ?? []).slice(0, 5),
    hasError: !!(data.error),
  };
}

function parseBreachSummary(data: Record<string, unknown>): BreachSummary {
  return {
    skipped: !!(data.skipped),
    status: (data.status as string | undefined) ?? 'unknown',
    provider: (data.provider as string | undefined) ?? 'unknown',
    breachCount: (data.breachCount as number | undefined) ?? 0,
    exposedEmailsCount: (data.exposedEmailsCount as number | null | undefined) ?? null,
    sensitiveDataTypes: ((data.sensitiveDataTypes as string[] | undefined) ?? []).slice(0, 5),
    latestBreachDate: (data.latestBreachDate as string | null | undefined) ?? null,
    hasError: !!(data.error),
  };
}

function parseOtxSummary(data: Record<string, unknown>): OtxSummary {
  return {
    skipped: !!(data.skipped),
    pulseCount: (data.pulseCount as number | undefined) ?? 0,
    malwareCount: (data.malwareCount as number | undefined) ?? 0,
    urlListCount: (data.urlListCount as number | undefined) ?? 0,
    passiveDnsCount: (data.passiveDnsCount as number | undefined) ?? 0,
    tags: ((data.tags as string[] | undefined) ?? []).slice(0, 5),
    hasError: !!(data.error),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

const INTELLIGENCE_TYPES = [
  'DNS_RECORDS', 'RDAP_INFO', 'GEOIP_INFO', 'ROBOTS_TXT',
  'PHISHTANK_REPUTATION', 'MALICIOUS_REPUTATION', 'BREACH_EXPOSURE', 'OTX_INTELLIGENCE',
] as const;

@Injectable()
export class AssistantContextService {
  constructor(private readonly prisma: PrismaService) {}

  async build(assetId: string, asset: { value: string; type: string; status: string; critical: boolean; scanInterval: string }): Promise<AssistantContext> {
    const [scanRuns, activeFindings, resolvedCount, latestDoneRun] = await Promise.all([
      this.prisma.scanRun.findMany({
        where: { assetId },
        orderBy: { startedAt: 'desc' },
        take: 3,
        select: {
          status: true,
          startedAt: true,
          finishedAt: true,
          _count: { select: { findings: true } },
        },
      }),
      this.prisma.finding.findMany({
        where: { assetId, resolvedAt: null },
        orderBy: [{ aiScore: 'desc' }, { lastSeenAt: 'desc' }],
        take: 10,
        select: {
          type: true,
          severity: true,
          key: true,
          aiScore: true,
          aiWhyJson: true,
        },
      }),
      this.prisma.finding.count({ where: { assetId, resolvedAt: { not: null } } }),
      this.prisma.scanRun.findFirst({
        where: { assetId, status: 'DONE' },
        orderBy: { finishedAt: 'desc' },
        select: { id: true },
      }),
    ]);

    const bySeverity = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const f of activeFindings) {
      const sev = f.severity as keyof typeof bySeverity;
      if (sev in bySeverity) bySeverity[sev]++;
    }

    const top = activeFindings.map((f) => {
      const why = f.aiWhyJson as { summary?: string; recommendations?: string[] } | null;
      return {
        type: f.type,
        severity: f.severity,
        key: f.key,
        aiScore: f.aiScore,
        summary: why?.summary ?? null,
        recommendations: why?.recommendations?.slice(0, 2) ?? null,
      };
    });

    const intelligence: IntelligenceSummary = {
      dns: null, rdap: null, geoip: null, robots: null,
      phishtank: null, reputation: null, breach: null, otx: null,
    };

    if (latestDoneRun) {
      const snapshots = await this.prisma.scanCheckResult.findMany({
        where: {
          scanRunId: latestDoneRun.id,
          type: { in: [...INTELLIGENCE_TYPES] },
        },
        select: { type: true, dataJson: true },
      });

      for (const snap of snapshots) {
        const d = snap.dataJson as Record<string, unknown>;
        switch (snap.type) {
          case 'DNS_RECORDS': intelligence.dns = parseDnsSummary(d); break;
          case 'RDAP_INFO': intelligence.rdap = parseRdapSummary(d); break;
          case 'GEOIP_INFO': intelligence.geoip = parseGeoIpSummary(d); break;
          case 'ROBOTS_TXT': intelligence.robots = parseRobotsSummary(d); break;
          case 'PHISHTANK_REPUTATION': intelligence.phishtank = parsePhishTankSummary(d); break;
          case 'MALICIOUS_REPUTATION': intelligence.reputation = parseReputationSummary(d); break;
          case 'BREACH_EXPOSURE': intelligence.breach = parseBreachSummary(d); break;
          case 'OTX_INTELLIGENCE': intelligence.otx = parseOtxSummary(d); break;
        }
      }
    }

    const hasIntelligence = Object.values(intelligence).some((v) => v !== null);

    return {
      asset,
      scanRuns: scanRuns.map((r) => ({
        status: r.status,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        findingCount: r._count.findings,
      })),
      findings: {
        activeCount: activeFindings.length,
        resolvedCount,
        bySeverity,
        top,
      },
      intelligence,
      hasIntelligence,
    };
  }

  formatForPrompt(ctx: AssistantContext, userMessage: string): string {
    const criticalLabel = ctx.asset.critical ? 'Evet' : 'Hayır';

    const scanRunsText = ctx.scanRuns.length === 0
      ? 'Henüz tarama yapılmamış.'
      : ctx.scanRuns.map((r, i) => {
          const date = new Date(r.startedAt).toLocaleDateString('tr-TR');
          return `${i + 1}. ${date} - ${r.status} - ${r.findingCount} bulgu`;
        }).join('\n');

    const { bySeverity, activeCount, resolvedCount, top } = ctx.findings;
    const sevText = `CRITICAL: ${bySeverity.CRITICAL}, HIGH: ${bySeverity.HIGH}, MEDIUM: ${bySeverity.MEDIUM}, LOW: ${bySeverity.LOW}`;

    const topText = top.length === 0
      ? 'Aktif bulgu yok.'
      : top.map((f, i) => {
          const score = f.aiScore != null ? ` (Risk: ${f.aiScore}/100)` : '';
          const summary = f.summary ? `\n   Özet: ${f.summary}` : '';
          const recs = f.recommendations?.length
            ? `\n   Öneri: ${f.recommendations[0]}`
            : '';
          return `${i + 1}. [${f.severity}] ${f.type}${score}${summary}${recs}`;
        }).join('\n\n');

    const intelligenceText = this.formatIntelligence(ctx.intelligence);

    return `=== ASSET BİLGİLERİ ===
Değer: ${ctx.asset.value}
Tür: ${ctx.asset.type}
Durum: ${ctx.asset.status}
Kritik: ${criticalLabel}
Tarama aralığı: ${ctx.asset.scanInterval}

=== SON TARAMALAR ===
${scanRunsText}

=== AKTİF BULGULAR ===
Toplam aktif: ${activeCount} bulgu
Çözülen: ${resolvedCount} bulgu
Severity dağılımı: ${sevText}

Önemli bulgular:
${topText}
${intelligenceText}
=== KULLANICININ SORUSU ===
${userMessage}`;
  }

  private formatIntelligence(intel: IntelligenceSummary): string {
    const sections: string[] = [];

    if (intel.dns) {
      const d = intel.dns;
      sections.push(`=== DNS KAYITLARI ===
Toplam kayıt: ${d.totalRecords}
A: ${d.a} | MX: ${d.mx} | NS: ${d.ns} | TXT: ${d.txt} | CAA: ${d.caa}
DMARC: ${d.hasDmarc ? 'Mevcut' : 'Yok'}
Hata sayısı: ${d.errorCount}`);
    }

    if (intel.rdap) {
      const r = intel.rdap;
      const expires = r.expiresDate
        ? new Date(r.expiresDate).toLocaleDateString('tr-TR')
        : 'Bilinmiyor';
      sections.push(`=== ALAN ADI KAYIT BİLGİSİ ===
Kayıt şirketi: ${r.registrar ?? 'Bilinmiyor'}
Son kullanma tarihi: ${expires}
Nameserver sayısı: ${r.nameServerCount}
Durum sayısı: ${r.statusCount}${r.hasError ? '\nUyarı: Veri alınırken hata oluştu' : ''}`);
    }

    if (intel.geoip) {
      const g = intel.geoip;
      const location = [g.city, g.country].filter(Boolean).join(', ') || 'Bilinmiyor';
      sections.push(`=== COĞRAFYA / IP BİLGİSİ ===
Çözümlenen IP: ${g.resolvedIp ?? 'Bilinmiyor'}
Konum: ${location}${g.countryCode ? ` (${g.countryCode})` : ''}
ASN: ${g.asn ?? 'Bilinmiyor'}
ISP: ${g.isp ?? 'Bilinmiyor'}
Organizasyon: ${g.organization ?? 'Bilinmiyor'}${g.hasError ? '\nUyarı: Veri alınırken hata oluştu' : ''}`);
    }

    if (intel.robots) {
      const rb = intel.robots;
      sections.push(`=== ROBOTS.TXT ANALİZİ ===
Dosya: ${rb.exists ? 'Mevcut' : 'Bulunamadı'}
Disallow kuralı sayısı: ${rb.disallowCount}
Sitemap sayısı: ${rb.sitemapCount}
Hassas path sayısı: ${rb.sensitivePathCount}
Yüksek riskli path sayısı: ${rb.highSeverityPathCount}${rb.hasError ? '\nUyarı: Dosya alınırken hata oluştu' : ''}`);
    }

    if (intel.phishtank) {
      const pt = intel.phishtank;
      if (pt.skipped) {
        sections.push(`=== PHİSHTANK İTİBAR KONTROLÜ ===
Durum: Atlandı (özellik etkin değil)`);
      } else {
        sections.push(`=== PHİSHTANK İTİBAR KONTROLÜ ===
Listede: ${pt.isListed ? 'EVET — Phishing listesinde!' : 'Hayır'}
Doğrulanmış eşleşme: ${pt.verifiedMatches}
Çevrimiçi eşleşme: ${pt.onlineMatches}
Eşleşen URL sayısı: ${pt.matchedUrlCount}${pt.hasError ? '\nUyarı: Sorgu sırasında hata oluştu' : ''}`);
      }
    }

    if (intel.reputation) {
      const rep = intel.reputation;
      if (rep.skipped) {
        sections.push(`=== İTİBAR ANALİZİ ===
Durum: Atlandı (özellik etkin değil)`);
      } else {
        const cats = rep.categories.length > 0 ? rep.categories.join(', ') : '-';
        sections.push(`=== İTİBAR ANALİZİ ===
Kötücül: ${rep.isMalicious ? 'EVET' : 'Hayır'}
Maksimum skor: ${rep.maxScore ?? '-'}
Provider sayısı: ${rep.providerCount}
Kategoriler: ${cats}${rep.hasError ? '\nUyarı: Sorgu sırasında hata oluştu' : ''}`);
      }
    }

    if (intel.breach) {
      const br = intel.breach;
      if (br.skipped) {
        sections.push(`=== VERİ SIZMASI KONTROLÜ ===
Durum: Atlandı (özellik etkin değil)`);
      } else if (br.status === 'error') {
        sections.push(`=== VERİ SIZMASI KONTROLÜ ===
Durum: Hata — veri alınamadı`);
      } else {
        const types = br.sensitiveDataTypes.length > 0 ? br.sensitiveDataTypes.join(', ') : '-';
        const date = br.latestBreachDate
          ? new Date(br.latestBreachDate).toLocaleDateString('tr-TR')
          : '-';
        sections.push(`=== VERİ SIZMASI KONTROLÜ ===
Provider: ${br.provider}
Sızıntı sayısı: ${br.breachCount}
Açığa çıkan e-posta sayısı: ${br.exposedEmailsCount ?? '-'}
Hassas veri türleri: ${types}
Son sızıntı tarihi: ${date}`);
      }
    }

    if (intel.otx) {
      const otx = intel.otx;
      if (otx.skipped) {
        sections.push(`=== ALIENVAULT OTX TEHDİT İSTİHBARATI ===
Durum: Atlandı (özellik etkin değil)`);
      } else if (otx.hasError) {
        sections.push(`=== ALIENVAULT OTX TEHDİT İSTİHBARATI ===
Durum: Hata — veri alınamadı`);
      } else {
        const tags = otx.tags.length > 0 ? otx.tags.join(', ') : '-';
        const hasAssociation = otx.pulseCount > 0 || otx.malwareCount > 0;
        sections.push(`=== ALIENVAULT OTX TEHDİT İSTİHBARATI ===
Not: OTX üzerinde pulse veya malware gözlemi bulunması, asset'in kesin olarak zararlı olduğu anlamına gelmez. Bu veri tehdit istihbaratı ilişki sinyali olarak değerlendirilmelidir; büyük/popüler domainlerde marka taklidi veya analiz referansı nedeniyle ilişki görülebilir.
Pulse sayısı: ${otx.pulseCount}
Malware referansı: ${otx.malwareCount}
İlişkili URL sayısı: ${otx.urlListCount}
Passive DNS sayısı: ${otx.passiveDnsCount}
Etiketler: ${tags}
OTX ilişki durumu: ${hasAssociation ? 'İlişki sinyali mevcut — bağlam değerlendirmesi gerekiyor' : 'İlişki yok — OTX verisi temiz'}`);
      }
    }

    if (sections.length === 0) {
      return '\n=== INTELLIGENCE SNAPSHOT ===\nHenüz yok — önce tarama başlatın\n';
    }

    return '\n' + sections.join('\n\n') + '\n';
  }
}
