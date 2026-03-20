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
    setTimeout(() => this.checkAndEnqueue(), 10000);
    this.intervalHandle = setInterval(() => this.checkAndEnqueue(), 60000);
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
  }

  private async checkAndEnqueue() {
    try {
      this.logger.log('Scheduler tick: checking crawl eligibility...');

      const enabledSites = await this.prisma.sourceSite.findMany({
        where: { enabled: true },
      });

      this.logger.log(`Scheduler tick: enabledSites=${enabledSites.length}`);

      const existingJobs = await this.crawlQueue.getJobs(['active', 'waiting', 'delayed']);
      this.logger.log(`Scheduler tick: existing crawl jobs in queue=${existingJobs.length}`);

      for (const site of enabledSites) {
        const shouldCrawl = await this.shouldCrawlSite(site.id, site.crawlIntervalMinutes);

        this.logger.log(
          `Scheduler decision for ${site.name}: shouldCrawl=${shouldCrawl}, intervalMinutes=${site.crawlIntervalMinutes}`,
        );

        if (!shouldCrawl) continue;

        const alreadyQueued = existingJobs.some((j) => j.data?.sourceSiteId === site.id);

        this.logger.log(`Scheduler queue check for ${site.name}: alreadyQueued=${alreadyQueued}`);

        if (!alreadyQueued) {
          await this.crawlQueue.add(
            `crawl:${site.key}`,
            { sourceSiteId: site.id },
            {
              jobId: `crawl-${site.id}`,
              removeOnComplete: 100,
              removeOnFail: 50,
              attempts: 2,
              backoff: { type: 'exponential', delay: 30000 },
            },
          );
          this.logger.log(`Enqueued crawl job for ${site.name}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Scheduler error: ${err.message}`, err.stack);
    }
  }

  private async shouldCrawlSite(siteId: string, intervalMinutes: number): Promise<boolean> {
    const lastRun = await this.prisma.crawlRun.findFirst({
      where: {
        sourceSiteId: siteId,
        status: { in: ['SUCCESS', 'RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastRun) {
      this.logger.log(`shouldCrawlSite(${siteId}): no previous run found -> true`);
      return true;
    }

    if (lastRun.status === 'RUNNING') {
      this.logger.warn(
        `shouldCrawlSite(${siteId}): blocked by RUNNING row id=${lastRun.id}, startedAt=${lastRun.startedAt?.toISOString?.() ?? lastRun.startedAt}`,
      );
      return false;
    }

    const referenceTime = lastRun.endedAt || lastRun.startedAt || lastRun.createdAt;
    const elapsed = Date.now() - referenceTime.getTime();
    const intervalMs = intervalMinutes * 60 * 1000;
    const shouldRun = elapsed >= intervalMs;

    this.logger.log(
      `shouldCrawlSite(${siteId}): lastStatus=${lastRun.status}, referenceTime=${referenceTime.toISOString()}, elapsedMs=${elapsed}, intervalMs=${intervalMs}, shouldRun=${shouldRun}`,
    );

    return shouldRun;
  }
}