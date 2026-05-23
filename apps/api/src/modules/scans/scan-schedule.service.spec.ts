import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ScanScheduleService } from './scan-schedule.service';
import { QUEUE_SCAN } from '../queue/queue.constants';

describe('ScanScheduleService', () => {
  let service: ScanScheduleService;
  let queueAdd: jest.Mock;
  let queueGetRepeatableJobs: jest.Mock;
  let queueRemoveRepeatableByKey: jest.Mock;

  beforeEach(async () => {
    queueAdd = jest.fn().mockResolvedValue({ id: 'job-1' });
    queueGetRepeatableJobs = jest.fn().mockResolvedValue([]);
    queueRemoveRepeatableByKey = jest.fn().mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScanScheduleService,
        {
          provide: getQueueToken(QUEUE_SCAN),
          useValue: {
            add: queueAdd,
            getRepeatableJobs: queueGetRepeatableJobs,
            removeRepeatableByKey: queueRemoveRepeatableByKey,
          },
        },
      ],
    }).compile();

    service = module.get<ScanScheduleService>(ScanScheduleService);
  });

  describe('schedule', () => {
    it('tekrar eden job oluşturulur', async () => {
      await service.schedule('asset-1', '24h');

      expect(queueAdd).toHaveBeenCalledWith(
        'scan.run',
        { assetId: 'asset-1' },
        expect.objectContaining({
          repeat: { every: 24 * 60 * 60 * 1000 },
          jobId: 'scan:schedule:asset-1',
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        }),
      );
    });

    it('mevcut job varsa önce kaldırılır', async () => {
      queueGetRepeatableJobs.mockResolvedValue([{ id: 'scan:schedule:asset-1', key: 'old-key' }]);

      await service.schedule('asset-1', '1h');

      expect(queueRemoveRepeatableByKey).toHaveBeenCalledWith('old-key');
      expect(queueAdd).toHaveBeenCalled();
    });

    it('interval ms doğru hesaplanır', async () => {
      await service.schedule('asset-2', '6h');

      expect(queueAdd).toHaveBeenCalledWith(
        'scan.run',
        { assetId: 'asset-2' },
        expect.objectContaining({ repeat: { every: 6 * 60 * 60 * 1000 } }),
      );
    });

    it('bilinmeyen interval 24h olarak varsayılan alınır', async () => {
      await service.schedule('asset-3', 'invalid');

      expect(queueAdd).toHaveBeenCalledWith(
        'scan.run',
        { assetId: 'asset-3' },
        expect.objectContaining({ repeat: { every: 24 * 60 * 60 * 1000 } }),
      );
    });
  });

  describe('unschedule', () => {
    it('job yoksa hiçbir şey yapmaz', async () => {
      queueGetRepeatableJobs.mockResolvedValue([]);

      await service.unschedule('asset-1');

      expect(queueRemoveRepeatableByKey).not.toHaveBeenCalled();
    });

    it('job varsa kaldırılır', async () => {
      queueGetRepeatableJobs.mockResolvedValue([{ id: 'scan:schedule:asset-1', key: 'key-123' }]);

      await service.unschedule('asset-1');

      expect(queueRemoveRepeatableByKey).toHaveBeenCalledWith('key-123');
    });

    it('aynı asset için duplicate job varsa hepsi kaldırılır', async () => {
      queueGetRepeatableJobs.mockResolvedValue([
        { id: 'scan:schedule:asset-1', key: 'key-a' },
        { id: 'scan:schedule:asset-1', key: 'key-b' },
      ]);

      await service.unschedule('asset-1');

      expect(queueRemoveRepeatableByKey).toHaveBeenCalledTimes(2);
      expect(queueRemoveRepeatableByKey).toHaveBeenCalledWith('key-a');
      expect(queueRemoveRepeatableByKey).toHaveBeenCalledWith('key-b');
    });

    it('başka asset jobları etkilenmez', async () => {
      queueGetRepeatableJobs.mockResolvedValue([
        { id: 'scan:schedule:asset-1', key: 'key-1' },
        { id: 'scan:schedule:asset-2', key: 'key-2' },
      ]);

      await service.unschedule('asset-1');

      expect(queueRemoveRepeatableByKey).toHaveBeenCalledTimes(1);
      expect(queueRemoveRepeatableByKey).toHaveBeenCalledWith('key-1');
    });
  });

  describe('scheduledJobId', () => {
    it('doğru format döner', () => {
      expect(service.scheduledJobId('asset-abc')).toBe('scan:schedule:asset-abc');
    });
  });
});
