import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma.service';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private crawlIntervalHandle: NodeJS.Timeout | null = null;
  private cleanupIntervalHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('crawl') private readonly crawlQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('Scheduler initialized, starting crawl scheduling loop...');
    setTimeout(() => void this.checkAndEnqueue(), 10000);
    this.crawlIntervalHandle = setInterval(() => void this.checkAndEnqueue(), 60000);

    // Run expired tender cleanup every 6 hours
    setTimeout(() => void this.cleanupExpiredTenders(), 60000); // First run after 1 min
    this.cleanupIntervalHandle = setInterval(
      () => void this.cleanupExpiredTenders(),
      6 * 60 * 60 * 1000, // Every 6 hours
    );
  }

  onModuleDestroy() {
    if (this.crawlIntervalHandle) clearInterval(this.crawlIntervalHandle);
    if (this.cleanupIntervalHandle) clearInterval(this.cleanupIntervalHandle);
  }

  /**
   * Delete expired tenders (30+ days past deadline) ONLY if not in workflow.
   * Tenders that someone is working on are preserved.
   */
  private async cleanupExpiredTenders() {
    try {
      const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Find expired tenders NOT in workflow
      const expiredTenders = await this.prisma.tender.findMany({
        where: {
          deadlineAt: { lt: cutoffDate },
          workflow: null, // Not in any workflow
        },
        select: { id: true },
        take: 500, // Process in batches
      });

      if (expiredTenders.length === 0) {
        this.logger.debug('Cleanup: no expired tenders to delete');
        return;
      }

      const ids = expiredTenders.map((t) => t.id);

      // Delete related records first (duplicates, etc.)
      await this.prisma.tenderDuplicate.deleteMany({
        where: {
          OR: [
            { canonicalTenderId: { in: ids } },
            { duplicateTenderId: { in: ids } },
          ],
        },
      });

      // Delete the tenders
      const result = await this.prisma.tender.deleteMany({
        where: { id: { in: ids } },
      });

      this.logger.log(
        `Cleanup: deleted ${result.count} expired tenders (30+ days past deadline, not in workflow)`,
      );
    } catch (err: any) {
      this.logger.error(`Cleanup error: ${err.message}`, err.stack);
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
              jobId: `crawl-${site.id}-${Date.now()}`,
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
      where: { sourceSiteId: siteId },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastRun) {
      this.logger.log(`shouldCrawlSite(${siteId}): no previous run found -> true`);
      return true;
    }

    const now = Date.now();
    const intervalMs = intervalMinutes * 60 * 1000;
    const staleRunningMs = 2 * 60 * 60 * 1000;
    const failedCooldownMs = 15 * 60 * 1000;

    if (lastRun.status === 'RUNNING') {
      const started = (lastRun.startedAt || lastRun.createdAt).getTime();
      const age = now - started;

      if (age < staleRunningMs) {
        this.logger.warn(
          `shouldCrawlSite(${siteId}): blocked by active RUNNING row id=${lastRun.id}, ageMs=${age}`,
        );
        return false;
      }

      this.logger.warn(
        `shouldCrawlSite(${siteId}): stale RUNNING row id=${lastRun.id}, marking FAILED and allowing retry`,
      );

      await this.prisma.crawlRun.update({
        where: { id: lastRun.id },
        data: {
          status: 'FAILED',
          endedAt: new Date(),
          errorSample: 'Marked stale by scheduler after timeout',
        },
      });

      return true;
    }

    const referenceTime = lastRun.endedAt || lastRun.startedAt || lastRun.createdAt;
    const elapsed = now - referenceTime.getTime();

    if (lastRun.status === 'FAILED') {
      const cooldownMs = Math.min(intervalMs, failedCooldownMs);
      const shouldRun = elapsed >= cooldownMs;

      this.logger.log(
        `shouldCrawlSite(${siteId}): lastStatus=FAILED, referenceTime=${referenceTime.toISOString()}, elapsedMs=${elapsed}, cooldownMs=${cooldownMs}, shouldRun=${shouldRun}`,
      );

      return shouldRun;
    }

    const shouldRun = elapsed >= intervalMs;

    this.logger.log(
      `shouldCrawlSite(${siteId}): lastStatus=${lastRun.status}, referenceTime=${referenceTime.toISOString()}, elapsedMs=${elapsed}, intervalMs=${intervalMs}, shouldRun=${shouldRun}`,
    );

    return shouldRun;
  }
}