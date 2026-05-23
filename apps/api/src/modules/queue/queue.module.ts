import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

@Module({
    imports: [
        BullModule.forRoot({
            connection: {
                host: process.env.REDIS_HOST ?? 'localhost',
                port: Number(process.env.REDIS_PORT ?? 6380),
                ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
            },
        }),
    ],
    exports: [BullModule],
})
export class QueueModule { }