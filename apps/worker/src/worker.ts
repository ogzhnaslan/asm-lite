import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({
  path: path.resolve(__dirname, '../.env'),
});

import * as dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { Worker, Queue } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { log } from './utils/logger';
import { runScan } from './run-scan';
import type { ScanJobPayload } from '@asm/shared';

// --------------------
// Bootstrap
// --------------------
const redisOpts = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6380),
  maxRetriesPerRequest: null,
  ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
};

const dlqQueue = new Queue('scan-dlq', { connection: redisOpts });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

prisma.$queryRaw`SELECT 1`
  .then(() => log('db ok'))
  .catch((e: unknown) => log('db error', (e as Error).message ?? e));

log('listening queue: scan');

log('env check', {
  cwd: process.cwd(),
  enablePhishTank: process.env.ENABLE_PHISHTANK,
  phishTankFeedUrl: process.env.PHISHTANK_FEED_URL,
  enableReputation: process.env.ENABLE_REPUTATION,
  databaseUrlExists: !!process.env.DATABASE_URL,
  redisHost: process.env.REDIS_HOST,
  redisPort: process.env.REDIS_PORT,
});

// --------------------
// Worker
// --------------------
interface BullJob {
  id?: string;
  name: string;
  data: ScanJobPayload;
  attemptsMade: number;
  opts: { attempts?: number };
}

const worker = new Worker('scan', async (job: BullJob) => {
  if (job.name !== 'scan.run') {
    log('unknown job name, skipping', { name: job.name, jobId: job.id });
    return { ok: false, reason: 'UNKNOWN_JOB_NAME' };
  }

  const { scanRunId } = job.data;

  try {
    return await runScan(prisma, job);
  } catch (err) {
    if (scanRunId) {
      try {
        await prisma.scanRun.update({
          where: { id: scanRunId },
          data: { status: 'FAILED', finishedAt: new Date() },
        });
      } catch (updateErr) {
        log('scanRun status update failed', {
          scanRunId,
          error: (updateErr as Error).message,
        });
      }
    }

    log('scanRun FAILED', {
      scanRunId: scanRunId ?? '(scheduled)',
      error: (err as Error).message,
    });

    throw err;
  }
}, { connection: redisOpts });

worker.on('completed', (job: BullJob) => log('completed', { jobId: job.id }));

worker.on('failed', async (job: BullJob | undefined, err: Error) => {
  log('failed', {
    jobId: job?.id,
    attempts: job?.attemptsMade,
    error: err.message,
  });

  if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    try {
      await dlqQueue.add('dlq.scan', {
        originalJobId: job.id,
        originalData: job.data,
        failedAt: new Date().toISOString(),
        error: err.message,
      }, {
        removeOnComplete: false,
        removeOnFail: false,
      });

      log('job moved to DLQ', {
        jobId: job.id,
        assetId: job.data.assetId,
      });
    } catch (dlqErr) {
      log('DLQ enqueue failed', {
        error: (dlqErr as Error).message,
      });
    }
  }
});

async function gracefulShutdown(signal: string): Promise<void> {
  log(`${signal} received, shutting down...`);

  try {
    await worker.close();
  } catch {
    // ignore
  }

  try {
    await dlqQueue.close();
  } catch {
    // ignore
  }

  try {
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', () => { void gracefulShutdown('SIGINT'); });
process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });