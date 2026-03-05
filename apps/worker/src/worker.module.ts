import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma.module';
import { SchedulerService } from './scheduler/scheduler.service';
import { CrawlProcessor } from './queues/crawl.processor';
import { EmbedProcessor } from './queues/embed.processor';
import { DedupeProcessor } from './queues/dedupe.processor';
import { NicGepConnector } from './connectors/nicgep.connector';
import { CpppConnector } from './connectors/cppp.connector';
import { NprocureConnector } from './connectors/nprocure.connector';
import { IrepsConnector } from './connectors/ireps.connector';
import { EtendersConnector } from './connectors/etenders.connector';
import { ConnectorRegistry } from './connectors/connector.registry';

@Module({
  imports: [
    PrismaModule,
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    BullModule.registerQueue(
      { name: 'crawl' },
      { name: 'embed' },
      { name: 'dedupe' },
    ),
  ],
  providers: [
    SchedulerService,
    CrawlProcessor,
    EmbedProcessor,
    DedupeProcessor,
    NicGepConnector,
    CpppConnector,
    NprocureConnector,
    IrepsConnector,
    EtendersConnector,
    ConnectorRegistry,
  ],
})
export class WorkerModule {}