import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma.service';
import { ConnectorRegistry } from '../connectors/connector.registry';
import { buildSearchText, computeContentHash } from '@tenderwatch/shared';

@Processor('crawl', { concurrency: 2 })
export class CrawlProcessor extends WorkerHost {
  private readonly logger = new Logger(CrawlProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ConnectorRegistry,
    @InjectQueue('embed') private readonly embedQueue: Queue,
    @InjectQueue('dedupe') private readonly dedupeQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<{ sourceSiteId: string }>): Promise<void> {
    const { sourceSiteId } = job.data;

    const site = await this.prisma.sourceSite.findUnique({ where: { id: sourceSiteId } });
    if (!site || !site.enabled) {
      this.logger.warn(`Site ${sourceSiteId} not found or disabled, skipping`);
      return;
    }

    const crawlRun = await this.prisma.crawlRun.create({
      data: {
        sourceSiteId: site.id,
        status: 'RUNNING',
        startedAt: new Date(),
      },
    });

    let itemsFound = 0;
    let itemsNew = 0;
    let itemsUpdated = 0;
    let errorCount = 0;
    let errorSample = '';

    try {
      const connector = this.registry.get(site.type);
      if (!connector) throw new Error(`No connector available for site type: ${site.type}`);

      this.logger.log(`Starting crawl for ${site.name} (${site.type})`);

      const siteConfig = {
        id: site.id,
        key: site.key,
        name: site.name,
        baseUrl: site.baseUrl,
        type: site.type,
        rateLimitPerMinute: site.rateLimitPerMinute,
      };

      const detailUrls = await connector.fetchListing(siteConfig);

      itemsFound = detailUrls.length;
      this.logger.log(`Found ${itemsFound} tender URLs for ${site.name}`);

      const rpm = Math.max(1, site.rateLimitPerMinute ?? 1);
      const delayMs = Math.ceil(60000 / rpm);

      for (const url of detailUrls) {
        try {
          await new Promise((resolve) => setTimeout(resolve, delayMs));

          const canonicalDetailUrl = url.startsWith('http') ? url : new URL(url, site.baseUrl).toString();

          const raw =
            typeof (connector as any).fetchDetailWithSite === 'function'
              ? await (connector as any).fetchDetailWithSite(canonicalDetailUrl, siteConfig)
              : await connector.fetchDetail(canonicalDetailUrl);

          if (!raw) {
            errorCount++;
            if (!errorSample) errorSample = `${canonicalDetailUrl}: empty detail response`;
            this.logger.warn(`Empty detail HTML for ${canonicalDetailUrl}`);
            continue;
          }

          const normalized = connector.parseDetail(raw, canonicalDetailUrl, siteConfig);

          // If parse fails, skip insert. Do not create garbage rows.
          if (!normalized) continue;

          normalized.sourceUrl = normalized.sourceUrl?.startsWith('http')
            ? normalized.sourceUrl
            : new URL(normalized.sourceUrl || canonicalDetailUrl, site.baseUrl).toString();

          const searchText = buildSearchText(normalized, site.name);
          const contentHash = computeContentHash(normalized);

          /**
           * IMPORTANT:
           * Lookup must happen AFTER parseDetail(), because some connectors
           * (especially GeM) decide canonical sourceUrl only after parsing.
           *
           * We first try exact sourceUrl.
           * Then, only if sourceTenderId exists, we try same-source-site + same-sourceTenderId.
           */
          const existing = await this.prisma.tender.findFirst({
            where: {
              sourceSiteId: site.id,
              OR: [
                { sourceUrl: normalized.sourceUrl },
                ...(normalized.sourceTenderId ? [{ sourceTenderId: normalized.sourceTenderId }] : []),
              ],
            },
          });

          if (existing) {
            if (existing.contentHash !== contentHash) {
              await this.prisma.tender.update({
                where: { id: existing.id },
                data: {
                  sourceUrl: normalized.sourceUrl,
                  sourceTenderId: normalized.sourceTenderId,
                  title: normalized.title,
                  organization: normalized.organization,
                  summary: normalized.summary,
                  location: normalized.location,
                  estimatedValue: normalized.estimatedValue,
                  publishedAt: normalized.publishedAt,
                  deadlineAt: normalized.deadlineAt,
                  status: normalized.status,
                  searchText,
                  contentHash,
                  fetchedAt: new Date(),
                },
              });

              itemsUpdated++;
              await this.embedQueue.add('embed:tender', { tenderId: existing.id });
            } else {
              // Even if unchanged, mark it seen again.
              await this.prisma.tender.update({
                where: { id: existing.id },
                data: {
                  fetchedAt: new Date(),
                  status: normalized.status,
                  deadlineAt: normalized.deadlineAt,
                },
              });
            }
          } else {
            const tender = await this.prisma.tender.create({
              data: {
                sourceSiteId: site.id,
                sourceUrl: normalized.sourceUrl,
                sourceTenderId: normalized.sourceTenderId,
                title: normalized.title,
                organization: normalized.organization,
                summary: normalized.summary,
                location: normalized.location,
                estimatedValue: normalized.estimatedValue,
                publishedAt: normalized.publishedAt,
                deadlineAt: normalized.deadlineAt,
                status: normalized.status,
                searchText,
                contentHash,
                fetchedAt: new Date(),
              },
            });

            itemsNew++;
            await this.embedQueue.add('embed:tender', { tenderId: tender.id });
          }
        } catch (err: any) {
          errorCount++;
          if (!errorSample) errorSample = `${url}: ${err.message}`;
          this.logger.error(`Error processing ${url}: ${err.message}`);
        }
      }

      await this.dedupeQueue.add('dedupe:batch', { sourceSiteId: site.id });

      await this.prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: {
          status: 'SUCCESS',
          endedAt: new Date(),
          itemsFound,
          itemsNew,
          itemsUpdated,
          errorCount,
          errorSample: errorSample || null,
        },
      });

      this.logger.log(
        `Crawl complete for ${site.name}: found=${itemsFound}, new=${itemsNew}, updated=${itemsUpdated}, errors=${errorCount}`,
      );
    } catch (err: any) {
      this.logger.error(`Crawl failed for ${site.name}: ${err.message}`);
      await this.prisma.crawlRun.update({
        where: { id: crawlRun.id },
        data: {
          status: 'FAILED',
          endedAt: new Date(),
          itemsFound,
          itemsNew,
          itemsUpdated,
          errorCount: errorCount + 1,
          errorSample: err.message?.substring(0, 500),
        },
      });
    }
  }
}