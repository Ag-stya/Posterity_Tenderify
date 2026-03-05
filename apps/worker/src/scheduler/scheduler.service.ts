import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('crawl') private readonly crawlQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('Scheduler initialized, starting crawl scheduling loop...');
    // Initial check after 10 seconds (let worker stabilize)
    setTimeout(() => this.checkAndEnqueue(), 3000);
    // Then check every 60 seconds
    this.intervalHandle = setInterval(() => this.checkAndEnqueue(), 15000);
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
  }

  private async checkAndEnqueue() {
    try {
      const enabledSites = await this.prisma.sourceSite.findMany({
        where: { enabled: true },
      });

      for (const site of enabledSites) {
        const shouldCrawl = await this.shouldCrawlSite(site.id, site.crawlIntervalMinutes);
        if (shouldCrawl) {
          // Check if job already queued/running
          const existingJobs = await this.crawlQueue.getJobs(['active', 'waiting', 'delayed']);
          const alreadyQueued = existingJobs.some(
            (j) => j.data?.sourceSiteId === site.id
          );

          if (!alreadyQueued) {
            await this.crawlQueue.add(
              `crawl:${site.key}`,
              { sourceSiteId: site.id },
              {
                removeOnComplete: 100,
                removeOnFail: 50,
                attempts: 2,
                backoff: { type: 'exponential', delay: 30000 },
              }
            );
            this.logger.log(`Enqueued crawl job for ${site.name}`);
          }
        }
      }
    } catch (err: any) {
      this.logger.error(`Scheduler error: ${err.message}`);
    }
  }

  private async shouldCrawlSite(siteId: string, intervalMinutes: number): Promise<boolean> {
    const lastSuccess = await this.prisma.crawlRun.findFirst({
      where: {
        sourceSiteId: siteId,
        status: { in: ['SUCCESS', 'RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastSuccess) return true; // Never crawled before
    if (lastSuccess.status === 'RUNNING') return false; // Already running

    const elapsed = Date.now() - (lastSuccess.endedAt || lastSuccess.startedAt || lastSuccess.createdAt).getTime();
    const intervalMs = intervalMinutes * 60 * 1000;

    return elapsed >= intervalMs;
  }
}
