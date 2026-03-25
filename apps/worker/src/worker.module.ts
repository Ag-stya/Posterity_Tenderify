import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma.module';
// Crawl-side
import { SchedulerService } from './scheduler/scheduler.service';
import { CrawlProcessor } from './queues/crawl.processor';
import { DedupeProcessor } from './queues/dedupe.processor';
import { WorkflowStatsProcessor } from './queues/workflow-stats.processor';
import { NicGepConnector } from './connectors/nicgep.connector';
import { CpppConnector } from './connectors/cppp.connector';
import { NprocureConnector } from './connectors/nprocure.connector';
import { IrepsConnector } from './connectors/ireps.connector';
import { EtendersConnector } from './connectors/etenders.connector';
import { GemConnector } from './connectors/gem.connector';
import { TendersOnTimeConnector } from './connectors/tendersontime.connector';
import { ConnectorRegistry } from './connectors/connector.registry';
// Embed-side
import { EmbedProcessor } from './queues/embed.processor';
import { TenderLifecycleService } from './scheduler/tender-lifecycle.service';

const workerRole = process.env.WORKER_ROLE || 'crawl';

const crawlProviders = [
  SchedulerService,
  TenderLifecycleService,
  CrawlProcessor,
  DedupeProcessor,
  WorkflowStatsProcessor,
  NicGepConnector,
  CpppConnector,
  NprocureConnector,
  IrepsConnector,
  EtendersConnector,
  GemConnector,
  TendersOnTimeConnector,
  ConnectorRegistry,
];

const embedProviders = [EmbedProcessor];

const crawlQueues = [
  { name: 'crawl' },
  { name: 'dedupe' },
  { name: 'embed' },
  { name: 'workflow-stats' },
];

const embedQueues = [{ name: 'embed' }];

@Module({
  imports: [
    PrismaModule,
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    BullModule.registerQueue(...(workerRole === 'embed' ? embedQueues : crawlQueues)),
  ],
  providers: [...(workerRole === 'embed' ? embedProviders : crawlProviders)],
})
export class WorkerModule {}