import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JOB_SCAN_RUN, JOB_ID_SCHEDULED_PREFIX, QUEUE_SCAN } from '../queue/queue.constants';

const INTERVAL_MS: Record<string, number> = {
  '1h':  1 * 60 * 60 * 1000,
  '6h':  6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7 * 24 * 60 * 60 * 1000,
};

const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
  removeOnFail: { age: 60 * 60 * 24 * 7, count: 1000 },
};

@Injectable()
export class ScanScheduleService {
  private readonly logger = new Logger(ScanScheduleService.name);

  constructor(@InjectQueue(QUEUE_SCAN) private readonly queue: Queue) {}

  scheduledJobId(assetId: string): string {
    return `${JOB_ID_SCHEDULED_PREFIX}:${assetId}`;
  }

  // BullMQ v5 Job Scheduler API — upsertJobScheduler stable id ile IDEMPOTENT'tir:
  // aynı asset için tekrar çağrılınca yeni repeatable EKLEMEZ, mevcut olanı günceller.
  // (Eski `queue.add({ repeat, jobId })` + getRepeatableJobs().id === jobId yaklaşımı
  // bozuktu: getRepeatableJobs() entry'lerinin .id'si undefined geliyordu → unschedule
  // hiç eşleşmiyor → her verify/interval değişiminde duplicate repeatable birikiyordu
  // → tek tick'te aynı asset için birden çok tarama. Bkz. reconcile().)
  async schedule(assetId: string, interval: string): Promise<void> {
    const ms = INTERVAL_MS[interval] ?? INTERVAL_MS['24h'];
    await this.queue.upsertJobScheduler(
      this.scheduledJobId(assetId),
      { every: ms },
      { name: JOB_SCAN_RUN, data: { assetId }, opts: JOB_OPTIONS },
    );
  }

  async unschedule(assetId: string): Promise<void> {
    await this.queue.removeJobScheduler(this.scheduledJobId(assetId));
  }

  // Self-heal / temizlik: tüm scheduler'ları ve legacy repeatable'ları kaldırıp
  // yalnızca VERIFIED asset'ler için birer scheduler kurar. API boot'unda çağrılır
  // (ScanScheduleBootstrap) → birikmiş duplicate ve silinmiş-asset orphan'ları temizler.
  // NOT: her boot'ta zamanlayıcı sıfırlanır (next run = now + interval); dev/seyrek
  // prod restart için kabul edilebilir.
  async reconcile(
    verified: Array<{ id: string; scanInterval: string }>,
  ): Promise<{ removedSchedulers: number; purgedLegacy: number; scheduled: number }> {
    // 1. Tüm job scheduler'ları kaldır (temiz sayfa).
    const schedulers = await this.queue.getJobSchedulers();
    await Promise.all(
      schedulers
        .map((s) => String((s as { id?: string }).id ?? ''))
        .filter((id) => id.length > 0)
        .map((id) => this.queue.removeJobScheduler(id).catch(() => false)),
    );

    // 2. Kalan legacy repeatable'ları (eski repeat API, id=undefined) kaldır.
    const legacy = await this.queue.getRepeatableJobs();
    await Promise.all(legacy.map((j) => this.queue.removeRepeatableByKey(j.key).catch(() => undefined)));

    // 3. Her verified asset için tek scheduler (idempotent upsert).
    for (const a of verified) {
      await this.schedule(a.id, a.scanInterval);
    }

    const result = { removedSchedulers: schedulers.length, purgedLegacy: legacy.length, scheduled: verified.length };
    this.logger.log(`scan schedule reconcile: ${JSON.stringify(result)}`);
    return result;
  }
}
