import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_SCAN } from './queue.constants';

@Module({
    imports: [
        BullModule.registerQueue({
            name: QUEUE_SCAN,
        }),
    ],
    exports: [BullModule],
})
export class ScanQueueModule { }