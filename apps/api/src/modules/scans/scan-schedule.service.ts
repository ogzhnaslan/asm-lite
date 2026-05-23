import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
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
  constructor(@InjectQueue(QUEUE_SCAN) private readonly queue: Queue) {}

  scheduledJobId(assetId: string): string {
    return `${JOB_ID_SCHEDULED_PREFIX}:${assetId}`;
  }

  async schedule(assetId: string, interval: string): Promise<void> {
    const ms = INTERVAL_MS[interval] ?? INTERVAL_MS['24h'];
    const jobId = this.scheduledJobId(assetId);

    await this.unschedule(assetId);

    await this.queue.add(
      JOB_SCAN_RUN,
      { assetId },
      {
        repeat: { every: ms },
        jobId,
        ...JOB_OPTIONS,
      },
    );
  }

  async unschedule(assetId: string): Promise<void> {
    const jobId = this.scheduledJobId(assetId);
    const repeatableJobs = await this.queue.getRepeatableJobs();
    const matches = repeatableJobs.filter((j) => j.id === jobId);
    await Promise.all(matches.map((j) => this.queue.removeRepeatableByKey(j.key)));
  }
}
