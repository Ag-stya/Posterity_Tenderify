import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class ReportSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReportSchedulerService.name);
  private dailyTimer: NodeJS.Timeout | null = null;
  private checkTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectQueue('reporting') private readonly reportingQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('Report scheduler initialized');

    // Schedule daily report at 2:00 PM IST (08:30 UTC)
    this.scheduleDailyReport();

    // Check every 30 minutes if weekly/monthly reports need to run
    this.checkTimer = setInterval(() => this.checkScheduledReports(), 30 * 60 * 1000);

    // Also check immediately on startup
    setTimeout(() => this.checkScheduledReports(), 10000);
  }

  onModuleDestroy() {
    if (this.dailyTimer) clearTimeout(this.dailyTimer);
    if (this.checkTimer) clearInterval(this.checkTimer);
  }

  /**
   * Schedule daily report at 2:00 PM IST = 08:30 UTC
   */
  private scheduleDailyReport() {
    const now = new Date();

    const next2pmIST = new Date(now);
    next2pmIST.setUTCHours(8, 30, 0, 0); // 2:00 PM IST = 08:30 UTC

    if (next2pmIST <= now) {
      next2pmIST.setDate(next2pmIST.getDate() + 1);
    }

    const delay = next2pmIST.getTime() - now.getTime();

    this.dailyTimer = setTimeout(async () => {
      await this.enqueueReport('DAILY');
      this.scheduleDailyReport(); // Reschedule for next day
    }, delay);

    const hours = Math.floor(delay / 3600000);
    const mins = Math.round((delay % 3600000) / 60000);
    this.logger.log(`Daily report (2:00 PM IST) scheduled in ${hours}h ${mins}m`);
  }

  private async enqueueReport(reportType: 'DAILY' | 'WEEKLY' | 'MONTHLY') {
    try {
      // Check if same type already queued
      const existing = await this.reportingQueue.getJobs(['active', 'waiting']);
      const alreadyQueued = existing.some((j) => j.data?.reportType === reportType);

      if (alreadyQueued) {
        this.logger.log(`${reportType} report already queued, skipping`);
        return;
      }

      await this.reportingQueue.add(`report:${reportType.toLowerCase()}`, { reportType }, {
        removeOnComplete: 50,
        removeOnFail: 20,
      });
      this.logger.log(`${reportType} report job enqueued`);
    } catch (err: any) {
      this.logger.error(`Failed to enqueue ${reportType} report: ${err.message}`);
    }
  }

  /**
   * Check if weekly or monthly reports need to run
   * Weekly: Monday 10:00 AM IST = 04:30 UTC
   * Monthly: 1st of month 10:00 AM IST = 04:30 UTC
   */
  private async checkScheduledReports() {
    const now = new Date();

    // Convert to IST for day/hour checks
    const istOffset = 5.5 * 60 * 60 * 1000; // +05:30
    const ist = new Date(now.getTime() + istOffset);
    const istDay = ist.getUTCDay(); // 0=Sunday, 1=Monday
    const istHour = ist.getUTCHours();
    const istDate = ist.getUTCDate();

    // Weekly report: Monday between 10:00-10:59 AM IST
    if (istDay === 1 && istHour === 10) {
      await this.enqueueReport('WEEKLY');
    }

    // Monthly report: 1st of month between 10:00-10:59 AM IST
    if (istDate === 1 && istHour === 10) {
      await this.enqueueReport('MONTHLY');
    }
  }
}