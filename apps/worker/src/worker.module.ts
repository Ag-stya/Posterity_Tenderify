import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma.module';

// Existing
import { SchedulerService } from './scheduler/scheduler.service';
import { CrawlProcessor } from './queues/crawl.processor';
import { EmbedProcessor } from './queues/embed.processor';
import { DedupeProcessor } from './queues/dedupe.processor';
import { NicGepConnector } from './connectors/nicgep.connector';
import { CpppConnector } from './connectors/cppp.connector';
import { NprocureConnector } from './connectors/nprocure.connector';
import { IrepsConnector } from './connectors/ireps.connector';
import { EtendersConnector } from './connectors/etenders.connector';
import { GemConnector } from './connectors/gem.connector';
import { ConnectorRegistry } from './connectors/connector.registry';

// New ERP queues
import { WorkflowStatsProcessor } from './queues/workflow-stats.processor';
import { ReportingProcessor } from './queues/reporting.processor';
import { ReportSchedulerService } from './scheduler/report-scheduler.service';

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
      // Existing queues — preserved
      { name: 'crawl' },
      { name: 'embed' },
      { name: 'dedupe' },
      // New ERP queues
      { name: 'workflow-stats' },
      { name: 'reporting' },
    ),
  ],
  providers: [
    // Existing — preserved
    SchedulerService,
    CrawlProcessor,
    EmbedProcessor,
    DedupeProcessor,
    NicGepConnector,
    CpppConnector,
    NprocureConnector,
    IrepsConnector,
    EtendersConnector,
    GemConnector,
    ConnectorRegistry,

    // New ERP processors
    WorkflowStatsProcessor,
    ReportingProcessor,
    ReportSchedulerService,
  ],
})
export class WorkerModule {}
