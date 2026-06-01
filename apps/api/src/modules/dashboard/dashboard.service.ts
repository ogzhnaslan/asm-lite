import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Global güvenlik trendi — kullanıcının TÜM asset'lerindeki bulguların zaman
// içindeki dağılımı. "Son 1 hafta / 1 ay çıkan veriler + örüntü" hedefine
// karşılık gelir: günlük yeni-bulgu sayıları (severity'ye göre) + önceki
// döneme kıyasla trend + insan-okur bir örüntü cümlesi.

export type DashboardWindow = '7d' | '30d';

export interface DashboardSeverityTotals {
  all: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface DashboardDailyBucket {
  date: string; // YYYY-MM-DD (UTC)
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export interface DashboardInsight {
  trend: 'up' | 'down' | 'flat';
  changePct: number;          // önceki eşit uzunluktaki döneme göre % değişim
  previousTotal: number;
  dominantSeverity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | null;
  busiestDate: string | null; // en çok yeni bulgu çıkan gün
  busiestCount: number;
  activeCritical: number;     // şu an açık (resolvedAt=null) CRITICAL bulgu sayısı
  activeHigh: number;
  text: string;               // Türkçe örüntü özeti
}

export interface DashboardTrends {
  window: DashboardWindow;
  from: string; // ISO
  to: string;   // ISO
  totals: DashboardSeverityTotals;
  daily: DashboardDailyBucket[];
  insight: DashboardInsight;
}

const DAY_MS = 86_400_000;

type SeverityKey = 'critical' | 'high' | 'medium' | 'low';

function severityKey(severity: string): SeverityKey | null {
  switch (severity) {
    case 'CRITICAL': return 'critical';
    case 'HIGH': return 'high';
    case 'MEDIUM': return 'medium';
    case 'LOW': return 'low';
    default: return null;
  }
}

function dayKeyOf(ms: number): string {
  return new Date(Math.floor(ms / DAY_MS) * DAY_MS).toISOString().slice(0, 10);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async trends(userId: string, windowParam?: string): Promise<DashboardTrends> {
    const window: DashboardWindow = windowParam === '7d' ? '7d' : '30d';
    const windowDays = window === '7d' ? 7 : 30;

    // UTC gün sınırları — deterministik bucket'lar (test edilebilirlik).
    const todayMidnightMs = Math.floor(Date.now() / DAY_MS) * DAY_MS;
    const startMs = todayMidnightMs - (windowDays - 1) * DAY_MS;
    const prevStartMs = startMs - windowDays * DAY_MS;

    // Bir önceki eşit dönem + mevcut dönem tek sorguda çekilir (trend için).
    const findings = await this.prisma.finding.findMany({
      where: {
        asset: { userId },
        createdAt: { gte: new Date(prevStartMs) },
      },
      select: { severity: true, createdAt: true },
    });

    // Günlük bucket iskeleti (mevcut pencere).
    const buckets = new Map<string, DashboardDailyBucket>();
    for (let i = 0; i < windowDays; i++) {
      const key = dayKeyOf(startMs + i * DAY_MS);
      buckets.set(key, { date: key, critical: 0, high: 0, medium: 0, low: 0, total: 0 });
    }

    const totals: DashboardSeverityTotals = { all: 0, critical: 0, high: 0, medium: 0, low: 0 };
    let previousTotal = 0;

    for (const f of findings) {
      const ms = f.createdAt.getTime();
      const sk = severityKey(f.severity);
      if (!sk) continue;

      if (ms < startMs) {
        // önceki dönem [prevStart, start)
        previousTotal++;
        continue;
      }

      const bucket = buckets.get(dayKeyOf(ms));
      if (!bucket) continue; // güvenlik: pencere dışı (gelecekteki tarih vb.)
      bucket[sk]++;
      bucket.total++;
      totals[sk]++;
      totals.all++;
    }

    const daily = Array.from(buckets.values());

    // Açık (resolvedAt=null) CRITICAL/HIGH — anlık risk göstergesi.
    const [activeCritical, activeHigh] = await Promise.all([
      this.prisma.finding.count({ where: { asset: { userId }, resolvedAt: null, severity: 'CRITICAL' } }),
      this.prisma.finding.count({ where: { asset: { userId }, resolvedAt: null, severity: 'HIGH' } }),
    ]);

    const insight = this.buildInsight(window, totals, daily, previousTotal, activeCritical, activeHigh);

    return {
      window,
      from: new Date(startMs).toISOString(),
      to: new Date(todayMidnightMs + DAY_MS - 1).toISOString(),
      totals,
      daily,
      insight,
    };
  }

  private buildInsight(
    window: DashboardWindow,
    totals: DashboardSeverityTotals,
    daily: DashboardDailyBucket[],
    previousTotal: number,
    activeCritical: number,
    activeHigh: number,
  ): DashboardInsight {
    // Trend: mevcut toplam vs önceki eşit dönem. ±%5 altı gürültü = flat.
    const changePct =
      previousTotal === 0
        ? totals.all > 0 ? 100 : 0
        : Math.round(((totals.all - previousTotal) / previousTotal) * 100);
    const trend: DashboardInsight['trend'] = changePct > 5 ? 'up' : changePct < -5 ? 'down' : 'flat';

    // Baskın severity (en çok yeni bulgu).
    const sevPairs: Array<[DashboardInsight['dominantSeverity'], number]> = [
      ['CRITICAL', totals.critical],
      ['HIGH', totals.high],
      ['MEDIUM', totals.medium],
      ['LOW', totals.low],
    ];
    let dominantSeverity: DashboardInsight['dominantSeverity'] = null;
    let dominantCount = 0;
    for (const [sev, count] of sevPairs) {
      if (count > dominantCount) { dominantCount = count; dominantSeverity = sev; }
    }

    // En yoğun gün.
    let busiestDate: string | null = null;
    let busiestCount = 0;
    for (const b of daily) {
      if (b.total > busiestCount) { busiestCount = b.total; busiestDate = b.date; }
    }

    const windowLabel = window === '7d' ? 'son 7 günde' : 'son 30 günde';
    const trendLabel = trend === 'up' ? 'artış' : trend === 'down' ? 'azalış' : 'sabit seyir';

    let text: string;
    if (totals.all === 0) {
      text = `${windowLabel} yeni bulgu üretilmedi. ${
        activeCritical + activeHigh > 0
          ? `Açık ${activeCritical} kritik ve ${activeHigh} yüksek bulgu mevcut — bunlar bu pencereden önce ortaya çıkmış.`
          : 'Açık kritik/yüksek bulgu da yok.'
      }`;
    } else {
      const trendSentence =
        trend === 'flat'
          ? `önceki döneme göre ${trendLabel} gösteriyor`
          : `önceki döneme göre %${Math.abs(changePct)} ${trendLabel} var`;
      const dominantSentence =
        dominantSeverity
          ? ` Bulguların çoğunluğu ${dominantSeverity} seviyesinde.`
          : '';
      const busiestSentence =
        busiestDate
          ? ` En yoğun gün ${busiestDate} (${busiestCount} bulgu).`
          : '';
      const activeSentence =
        activeCritical + activeHigh > 0
          ? ` Şu an açık ${activeCritical} kritik ve ${activeHigh} yüksek bulgu önceliklendirilmeli.`
          : '';
      text = `${windowLabel} toplam ${totals.all} yeni bulgu üretildi; ${trendSentence}.${dominantSentence}${busiestSentence}${activeSentence}`;
    }

    return {
      trend,
      changePct,
      previousTotal,
      dominantSeverity,
      busiestDate,
      busiestCount,
      activeCritical,
      activeHigh,
      text,
    };
  }
}
