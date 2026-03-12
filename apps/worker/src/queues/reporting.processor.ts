import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma.service';
import * as nodemailer from 'nodemailer';

interface ReportJob {
  reportType: 'DAILY' | 'WEEKLY' | 'MONTHLY';
}

@Processor('reporting', { concurrency: 1 })
export class ReportingProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportingProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ReportJob>): Promise<void> {
    const { reportType } = job.data;
    this.logger.log(`Processing ${reportType} report job`);

    const { periodStart, periodEnd } = this.getReportPeriod(reportType);

    const reportRun = await this.prisma.reportRun.create({
      data: {
        reportType,
        periodStart,
        periodEnd,
        status: 'RUNNING',
      },
    });

    try {
      const data = await this.generateReportData(periodStart, periodEnd);
      const recipients = await this.getRecipients(reportType);

      if (recipients.length > 0) {
        await this.sendEmail(reportType, data, recipients, periodStart, periodEnd);
      }

      await this.prisma.reportRun.update({
        where: { id: reportRun.id },
        data: {
          status: 'SUCCESS',
          generatedAt: new Date(),
          recipientCount: recipients.length,
        },
      });

      this.logger.log(`${reportType} report complete, sent to ${recipients.length} recipients`);
    } catch (err: any) {
      this.logger.error(`${reportType} report failed: ${err.message}`);
      await this.prisma.reportRun.update({
        where: { id: reportRun.id },
        data: {
          status: 'FAILED',
          errorText: err.message?.substring(0, 500),
        },
      });
    }
  }

  private getReportPeriod(type: string) {
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let periodStart = new Date(periodEnd);

    if (type === 'DAILY') periodStart.setDate(periodStart.getDate() - 1);
    else if (type === 'WEEKLY') periodStart.setDate(periodStart.getDate() - 7);
    else periodStart.setMonth(periodStart.getMonth() - 1);

    return { periodStart, periodEnd };
  }

  private async generateReportData(periodStart: Date, periodEnd: Date) {
    const [totalActive, stageCounts, rejections, userScores] = await Promise.all([
      this.prisma.tenderWorkflow.count({ where: { isRejected: false } }),
      this.prisma.tenderWorkflow.groupBy({
        by: ['currentStage'],
        where: { isRejected: false },
        _count: { id: true },
      }),
      this.prisma.tenderWorkflow.count({
        where: { isRejected: true, lastUpdatedAt: { gte: periodStart, lt: periodEnd } },
      }),
      this.prisma.userProductivityDaily.groupBy({
        by: ['userId'],
        where: { statDate: { gte: periodStart, lt: periodEnd } },
        _sum: { weightedScore: true, totalActions: true },
        orderBy: { _sum: { weightedScore: 'desc' } },
        take: 15,
      }),
    ]);

    const userIds = userScores.map((u) => u.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, profile: { select: { fullName: true } } },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      totalActive,
      stageCounts: stageCounts.map((s) => ({ stage: s.currentStage, count: s._count.id })),
      rejections,
      userRankings: userScores.map((u, i) => ({
        rank: i + 1,
        email: userMap.get(u.userId)?.email,
        fullName: userMap.get(u.userId)?.profile?.fullName,
        score: u._sum.weightedScore ?? 0,
        actions: u._sum.totalActions ?? 0,
      })),
    };
  }

  private async getRecipients(reportType: string): Promise<string[]> {
    const subs = await this.prisma.reportSubscription.findMany({
      where: { reportType: reportType as any, isActive: true },
    });
    return subs.map((s) => s.recipientEmail);
  }

  private async sendEmail(type: string, data: any, recipients: string[], start: Date, end: Date) {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
      this.logger.warn('Gmail not configured, skipping email');
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });

    const html = `<h2>TenderWatch ${type} Report</h2>
      <p>${start.toLocaleDateString()} — ${end.toLocaleDateString()}</p>
      <p>Active Tenders: <strong>${data.totalActive}</strong> | Rejections: <strong>${data.rejections}</strong></p>
      <h3>User Rankings</h3>
      <table border="1" cellpadding="6" style="border-collapse:collapse">
        <tr><th>#</th><th>User</th><th>Score</th><th>Actions</th></tr>
        ${data.userRankings.map((u: any) => `<tr><td>${u.rank}</td><td>${u.fullName || u.email}</td><td>${u.score}</td><td>${u.actions}</td></tr>`).join('')}
      </table>`;

    await transporter.sendMail({
      from: `"TenderWatch" <${user}>`,
      to: recipients.join(', '),
      subject: `TenderWatch ${type} Report — ${start.toLocaleDateString()}`,
      html,
    });
  }
}
