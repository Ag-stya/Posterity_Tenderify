import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class ReportSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportSchedulerService.name);
  private dailyTimer: NodeJS.Timeout | null = null;
  private weeklyTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectQueue('reporting') private readonly reportingQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('Report scheduler initialized');

    // Schedule daily report at midnight IST (18:30 UTC previous day)
    this.scheduleDailyReport();

    // Check every hour if weekly/monthly reports need to run
    this.weeklyTimer = setInterval(() => this.checkScheduledReports(), 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.dailyTimer) clearTimeout(this.dailyTimer);
    if (this.weeklyTimer) clearInterval(this.weeklyTimer);
  }

  private scheduleDailyReport() {
    const now = new Date();
    // Next midnight IST = 18:30 UTC
    const nextMidnight = new Date(now);
    nextMidnight.setUTCHours(18, 30, 0, 0);
    if (nextMidnight <= now) {
      nextMidnight.setDate(nextMidnight.getDate() + 1);
    }

    const delay = nextMidnight.getTime() - now.getTime();

    this.dailyTimer = setTimeout(async () => {
      await this.enqueueDailyReport();
      // Reschedule for next day
      this.scheduleDailyReport();
    }, delay);

    this.logger.log(`Daily report scheduled in ${Math.round(delay / 60000)} minutes`);
  }

  private async enqueueDailyReport() {
    try {
      await this.reportingQueue.add('report:daily', { reportType: 'DAILY' }, {
        removeOnComplete: 50,
        removeOnFail: 20,
      });
      this.logger.log('Daily report job enqueued');
    } catch (err: any) {
      this.logger.error(`Failed to enqueue daily report: ${err.message}`);
    }
  }

  private async checkScheduledReports() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sunday
    const dayOfMonth = now.getDate();
    const hour = now.getHours();

    // Weekly report: Monday 1 AM IST
    if (dayOfWeek === 1 && hour >= 1 && hour < 2) {
      const existing = await this.reportingQueue.getJobs(['active', 'waiting']);
      const hasWeekly = existing.some((j) => j.data?.reportType === 'WEEKLY');
      if (!hasWeekly) {
        await this.reportingQueue.add('report:weekly', { reportType: 'WEEKLY' }, {
          removeOnComplete: 20,
          removeOnFail: 10,
        });
        this.logger.log('Weekly report job enqueued');
      }
    }

    // Monthly report: 1st of month, 2 AM IST
    if (dayOfMonth === 1 && hour >= 2 && hour < 3) {
      const existing = await this.reportingQueue.getJobs(['active', 'waiting']);
      const hasMonthly = existing.some((j) => j.data?.reportType === 'MONTHLY');
      if (!hasMonthly) {
        await this.reportingQueue.add('report:monthly', { reportType: 'MONTHLY' }, {
          removeOnComplete: 20,
          removeOnFail: 10,
        });
        this.logger.log('Monthly report job enqueued');
      }
    }
  }
}
