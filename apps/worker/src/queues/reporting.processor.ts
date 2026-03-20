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
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      this.logger.warn('SMTP not configured, skipping email');
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: { user, pass },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false,
      },
    });

    const from = process.env.SMTP_FROM || `"TenderWatch ERP" <${user}>`;

    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:640px;margin:0 auto">
        <div style="background:#1e293b;color:#fff;padding:24px;border-radius:8px 8px 0 0">
          <h2 style="margin:0">TenderWatch ${type} Report</h2>
          <p style="margin:6px 0 0;opacity:0.8;font-size:14px">${start.toLocaleDateString()} — ${end.toLocaleDateString()}</p>
          <p style="margin:4px 0 0;opacity:0.6;font-size:12px">Posterity Consulting</p>
        </div>
        <div style="padding:24px;border:1px solid #e2e8f0;border-top:none">
          <p>Active Tenders: <strong>${data.totalActive}</strong> &nbsp;|&nbsp; Rejections: <strong style="color:#dc2626">${data.rejections}</strong></p>
          <h3 style="color:#1e293b;margin:16px 0 8px">Stage Distribution</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
            <thead><tr style="background:#f8fafc"><th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;font-size:13px">Stage</th><th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center;font-size:13px">Count</th></tr></thead>
            <tbody>${data.stageCounts.map((s: any) => `<tr><td style="padding:6px 10px;border:1px solid #e2e8f0;font-size:13px">${s.stage.replace(/_/g, ' ')}</td><td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center;font-size:13px">${s.count}</td></tr>`).join('')}</tbody>
          </table>
          <h3 style="color:#1e293b;margin:16px 0 8px">Team Rankings</h3>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#f8fafc"><th style="padding:6px 10px;border:1px solid #e2e8f0;font-size:13px">#</th><th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:left;font-size:13px">Member</th><th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center;font-size:13px">Score</th><th style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center;font-size:13px">Actions</th></tr></thead>
            <tbody>${data.userRankings.map((u: any) => `<tr><td style="padding:6px 10px;border:1px solid #e2e8f0;font-size:13px">${u.rank}</td><td style="padding:6px 10px;border:1px solid #e2e8f0;font-size:13px">${u.fullName || u.email}</td><td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center;font-size:13px">${u.score}</td><td style="padding:6px 10px;border:1px solid #e2e8f0;text-align:center;font-size:13px">${u.actions}</td></tr>`).join('')}</tbody>
          </table>
        </div>
        <div style="padding:12px;text-align:center;color:#94a3b8;font-size:11px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          Generated by TenderWatch ERP · Posterity Consulting
        </div>
      </div>`;

    await transporter.sendMail({
      from,
      to: recipients.join(', '),
      subject: `TenderWatch ${type} Report — ${start.toLocaleDateString()}`,
      html,
    });

    this.logger.log(`Report email sent to ${recipients.length} recipients via SMTP`);
  }
}