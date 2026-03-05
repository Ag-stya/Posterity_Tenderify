import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class StatusService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus() {
    const sites = await this.prisma.sourceSite.findMany({
      include: {
        crawlRuns: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Check if any crawl is RUNNING
    const runningCount = await this.prisma.crawlRun.count({
      where: { status: 'RUNNING' },
    });

    // Get last successful crawl time
    const lastSuccess = await this.prisma.crawlRun.findFirst({
      where: { status: 'SUCCESS' },
      orderBy: { endedAt: 'desc' },
    });

    return {
      lastUpdatedAt: lastSuccess?.endedAt?.toISOString() || null,
      isRefreshing: runningCount > 0,
      sites: sites.map(site => {
        const lastRun = site.crawlRuns[0];
        let currentStatus = 'IDLE';
        let lastSuccessAt: string | null = null;

        if (lastRun) {
          currentStatus = lastRun.status;
          if (lastRun.status === 'SUCCESS' && lastRun.endedAt) {
            lastSuccessAt = lastRun.endedAt.toISOString();
          }
        }

        return {
          id: site.id,
          name: site.name,
          key: site.key,
          enabled: site.enabled,
          lastSuccessAt,
          currentStatus,
        };
      }),
    };
  }
}
