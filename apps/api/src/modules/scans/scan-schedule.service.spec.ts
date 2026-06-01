import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ScanScheduleService } from './scan-schedule.service';
import { QUEUE_SCAN } from '../queue/queue.constants';

describe('ScanScheduleService', () => {
  let service: ScanScheduleService;
  let upsertJobScheduler: jest.Mock;
  let removeJobScheduler: jest.Mock;
  let getJobSchedulers: jest.Mock;
  let getRepeatableJobs: jest.Mock;
  let removeRepeatableByKey: jest.Mock;

  beforeEach(async () => {
    upsertJobScheduler = jest.fn().mockResolvedValue({ id: 'job-1' });
    removeJobScheduler = jest.fn().mockResolvedValue(true);
    getJobSchedulers = jest.fn().mockResolvedValue([]);
    getRepeatableJobs = jest.fn().mockResolvedValue([]);
    removeRepeatableByKey = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScanScheduleService,
        {
          provide: getQueueToken(QUEUE_SCAN),
          useValue: { upsertJobScheduler, removeJobScheduler, getJobSchedulers, getRepeatableJobs, removeRepeatableByKey },
        },
      ],
    }).compile();

    service = module.get<ScanScheduleService>(ScanScheduleService);
  });

  describe('schedule', () => {
    it('idempotent scheduler upsert edilir (stable id ile)', async () => {
      await service.schedule('asset-1', '24h');

      expect(upsertJobScheduler).toHaveBeenCalledWith(
        'scan:schedule:asset-1',
        { every: 24 * 60 * 60 * 1000 },
        expect.objectContaining({
          name: 'scan.run',
          data: { assetId: 'asset-1' },
          opts: expect.objectContaining({ attempts: 3, backoff: { type: 'exponential', delay: 2000 } }),
        }),
      );
    });

    it('interval ms doğru hesaplanır', async () => {
      await service.schedule('asset-2', '6h');
      expect(upsertJobScheduler).toHaveBeenCalledWith(
        'scan:schedule:asset-2',
        { every: 6 * 60 * 60 * 1000 },
        expect.anything(),
      );
    });

    it('bilinmeyen interval 24h olarak varsayılan alınır', async () => {
      await service.schedule('asset-3', 'invalid');
      expect(upsertJobScheduler).toHaveBeenCalledWith(
        'scan:schedule:asset-3',
        { every: 24 * 60 * 60 * 1000 },
        expect.anything(),
      );
    });

    it('aynı asset için tekrar çağrı yeni repeatable EKLEMEZ (idempotent)', async () => {
      await service.schedule('asset-1', '24h');
      await service.schedule('asset-1', '24h');
      // İki upsert çağrısı da AYNI stable id ile → BullMQ tek scheduler tutar.
      expect(upsertJobScheduler).toHaveBeenCalledTimes(2);
      expect(upsertJobScheduler.mock.calls[0][0]).toBe('scan:schedule:asset-1');
      expect(upsertJobScheduler.mock.calls[1][0]).toBe('scan:schedule:asset-1');
    });
  });

  describe('unschedule', () => {
    it('stable id ile removeJobScheduler çağrılır', async () => {
      await service.unschedule('asset-1');
      expect(removeJobScheduler).toHaveBeenCalledWith('scan:schedule:asset-1');
    });
  });

  describe('reconcile', () => {
    it('tüm scheduler + legacy repeatable temizlenir, verified asset\'ler için scheduler kurulur', async () => {
      getJobSchedulers.mockResolvedValue([
        { id: 'scan:schedule:old-1' },
        { id: 'scan:schedule:deleted-2' },
      ]);
      getRepeatableJobs.mockResolvedValue([
        { id: undefined, key: 'legacy-key-a' },
        { id: undefined, key: 'legacy-key-b' },
      ]);

      const result = await service.reconcile([
        { id: 'asset-1', scanInterval: '24h' },
        { id: 'asset-2', scanInterval: '1h' },
      ]);

      // tüm eski scheduler'lar kaldırıldı
      expect(removeJobScheduler).toHaveBeenCalledWith('scan:schedule:old-1');
      expect(removeJobScheduler).toHaveBeenCalledWith('scan:schedule:deleted-2');
      // legacy repeatable'lar key ile temizlendi
      expect(removeRepeatableByKey).toHaveBeenCalledWith('legacy-key-a');
      expect(removeRepeatableByKey).toHaveBeenCalledWith('legacy-key-b');
      // verified asset'ler için scheduler kuruldu
      expect(upsertJobScheduler).toHaveBeenCalledWith('scan:schedule:asset-1', expect.anything(), expect.anything());
      expect(upsertJobScheduler).toHaveBeenCalledWith('scan:schedule:asset-2', expect.anything(), expect.anything());

      expect(result).toEqual({ removedSchedulers: 2, purgedLegacy: 2, scheduled: 2 });
    });

    it('boş veritabanı → sadece temizlik, scheduler kurulmaz', async () => {
      const result = await service.reconcile([]);
      expect(upsertJobScheduler).not.toHaveBeenCalled();
      expect(result.scheduled).toBe(0);
    });
  });

  describe('scheduledJobId', () => {
    it('doğru format döner', () => {
      expect(service.scheduledJobId('asset-abc')).toBe('scan:schedule:asset-abc');
    });
  });
});
