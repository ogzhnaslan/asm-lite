import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JOB_SCAN_RUN, QUEUE_SCAN } from '../queue/queue.constants';
import { SCAN_INTERVALS } from '@asm/shared';

const INTERVAL_MS: Record<string, number> = {
  '1h':  1 * 60 * 60 * 1000,
  '6h':  6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7 * 24 * 60 * 60 * 1000,
};

/** @deprecated import SCAN_INTERVALS from '@asm/shared' */
export const VALID_INTERVALS: string[] = [...SCAN_INTERVALS];

@Injectable()
export class ScanScheduleService {
  constructor(@InjectQueue(QUEUE_SCAN) private readonly queue: Queue) {}

  async schedule(assetId: string, interval: string): Promise<void> {
    const ms = INTERVAL_MS[interval] ?? INTERVAL_MS['24h'];
    const jobId = `schedule:${assetId}`;

    await this.unschedule(assetId);

    await this.queue.add(
      JOB_SCAN_RUN,
      { assetId },
      {
        repeat: { every: ms },
        jobId,
      },
    );
  }

  async unschedule(assetId: string): Promise<void> {
    const jobId = `schedule:${assetId}`;
    const repeatableJobs = await this.queue.getRepeatableJobs();
    const existing = repeatableJobs.find((j) => j.id === jobId);
    if (existing) {
      await this.queue.removeRepeatableByKey(existing.key);
    }
  }
}
