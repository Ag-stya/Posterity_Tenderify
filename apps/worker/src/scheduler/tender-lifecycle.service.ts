import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TenderLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TenderLifecycleService.name);
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.logger.log('Tender lifecycle service initialized');
    setTimeout(() => void this.reconcileExpiredTenders(), 15000);
    this.intervalHandle = setInterval(() => void this.reconcileExpiredTenders(), 30 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
    }
  }

  private async reconcileExpiredTenders() {
    try {
      const now = new Date();

      const result = await this.prisma.tender.updateMany({
        where: {
          deadlineAt: { lt: now },
          status: { not: 'CLOSED' },
        },
        data: {
          status: 'CLOSED',
          fetchedAt: now,
        },
      });

      this.logger.log(`Tender lifecycle: closed ${result.count} expired tenders`);
    } catch (err: any) {
      this.logger.error(`Tender lifecycle failed: ${err.message}`, err.stack);
    }
  }
}