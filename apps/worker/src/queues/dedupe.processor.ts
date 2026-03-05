import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma.service';
import { normalizeTitle } from '@tenderwatch/shared';

@Processor('dedupe', { concurrency: 1 })
export class DedupeProcessor extends WorkerHost {
  private readonly logger = new Logger(DedupeProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<{ sourceSiteId?: string }>): Promise<void> {
    this.logger.log('Running dedupe batch...');

    try {
      // Get recent tenders (last 14 days)
      const since = new Date();
      since.setDate(since.getDate() - 14);

      const recentTenders = await this.prisma.tender.findMany({
        where: { createdAt: { gte: since } },
        include: { sourceSite: true },
        orderBy: { createdAt: 'asc' },
      });

      if (recentTenders.length < 2) return;

      let dupesFound = 0;

      for (let i = 0; i < recentTenders.length; i++) {
        for (let j = i + 1; j < recentTenders.length; j++) {
          const a = recentTenders[i];
          const b = recentTenders[j];

          // Skip if same source site
          if (a.sourceSiteId === b.sourceSiteId) continue;

          // Skip if already linked
          const existingLink = await this.prisma.tenderDuplicate.findFirst({
            where: {
              OR: [
                { canonicalTenderId: a.id, duplicateTenderId: b.id },
                { canonicalTenderId: b.id, duplicateTenderId: a.id },
              ],
            },
          });
          if (existingLink) continue;

          let isDuplicate = false;
          let reason = '';

          // Rule 1: Same sourceTenderId across sites
          if (a.sourceTenderId && b.sourceTenderId && a.sourceTenderId === b.sourceTenderId) {
            isDuplicate = true;
            reason = 'Same tender ID';
          }

          // Rule 2: Very similar title + same deadline (±1 day)
          if (!isDuplicate && a.deadlineAt && b.deadlineAt) {
            const titleA = normalizeTitle(a.title);
            const titleB = normalizeTitle(b.title);
            const titleSimilar = titleA === titleB ||
              (titleA.length > 20 && titleB.length > 20 && this.jaccardSimilarity(titleA, titleB) > 0.8);

            const deadlineDiff = Math.abs(a.deadlineAt.getTime() - b.deadlineAt.getTime());
            const oneDayMs = 24 * 60 * 60 * 1000;

            if (titleSimilar && deadlineDiff <= oneDayMs) {
              isDuplicate = true;
              reason = 'Similar title + same deadline';
            }
          }

          // Rule 3: Same title + same org + same published date
          if (!isDuplicate && a.organization && b.organization && a.publishedAt && b.publishedAt) {
            const titleA = normalizeTitle(a.title);
            const titleB = normalizeTitle(b.title);
            const orgA = a.organization.toLowerCase().trim();
            const orgB = b.organization.toLowerCase().trim();
            const sameDay = a.publishedAt.toDateString() === b.publishedAt.toDateString();

            if (titleA === titleB && orgA === orgB && sameDay) {
              isDuplicate = true;
              reason = 'Same title + org + publish date';
            }
          }

          if (isDuplicate) {
            // Canonical = earlier createdAt
            const [canonical, duplicate] = a.createdAt <= b.createdAt ? [a, b] : [b, a];

            try {
              await this.prisma.tenderDuplicate.create({
                data: {
                  canonicalTenderId: canonical.id,
                  duplicateTenderId: duplicate.id,
                  reason,
                },
              });
              dupesFound++;
            } catch (err: any) {
              // Ignore unique constraint violations
              if (!err.message?.includes('Unique constraint')) {
                this.logger.error(`Dedupe insert error: ${err.message}`);
              }
            }
          }
        }
      }

      this.logger.log(`Dedupe complete: found ${dupesFound} duplicate pairs`);
    } catch (err: any) {
      this.logger.error(`Dedupe failed: ${err.message}`);
    }
  }

  private jaccardSimilarity(a: string, b: string): number {
    const setA = new Set(a.split(' '));
    const setB = new Set(b.split(' '));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  }
}
