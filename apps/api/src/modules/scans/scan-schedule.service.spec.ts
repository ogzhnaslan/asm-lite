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
          jobId: 'schedule:asset-1',
        }),
      );
    });

    it('mevcut job varsa önce kaldırılır', async () => {
      queueGetRepeatableJobs.mockResolvedValue([{ id: 'schedule:asset-1', key: 'old-key' }]);

      await service.schedule('asset-1', '1h');

      expect(queueRemoveRepeatableByKey).toHaveBeenCalledWith('old-key');
      expect(queueAdd).toHaveBeenCalled();
    });
  });

  describe('unschedule', () => {
    it('job yoksa hiçbir şey yapmaz', async () => {
      queueGetRepeatableJobs.mockResolvedValue([]);

      await service.unschedule('asset-1');

      expect(queueRemoveRepeatableByKey).not.toHaveBeenCalled();
    });

    it('job varsa kaldırılır', async () => {
      queueGetRepeatableJobs.mockResolvedValue([{ id: 'schedule:asset-1', key: 'key-123' }]);

      await service.unschedule('asset-1');

      expect(queueRemoveRepeatableByKey).toHaveBeenCalledWith('key-123');
    });
  });
});
