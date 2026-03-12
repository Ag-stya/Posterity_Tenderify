import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ReportType } from '@prisma/client';
import * as nodemailer from 'nodemailer';

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Trigger report generation
   */
  async runReport(reportType: ReportType) {
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
      const reportData = await this.generateReportData(reportType, periodStart, periodEnd);
      const recipients = await this.getRecipients(reportType);

      if (recipients.length > 0) {
        await this.sendReportEmail(reportType, reportData, recipients, periodStart, periodEnd);
      }

      await this.prisma.reportRun.update({
        where: { id: reportRun.id },
        data: {
          status: 'SUCCESS',
          generatedAt: new Date(),
          recipientCount: recipients.length,
        },
      });

      // Log activity
      await this.prisma.tenderActivityLog.create({
        data: {
          // Use first tender or a system tender ID
          tenderId: reportData.topTenders?.[0]?.id || '00000000-0000-0000-0000-000000000000',
          userId: '00000000-0000-0000-0000-000000000000', // System user
          actionType: 'REPORT_GENERATED',
          metadataJson: { reportType, reportRunId: reportRun.id },
        },
      });

      return { reportRunId: reportRun.id, status: 'SUCCESS', recipientCount: recipients.length };
    } catch (err: any) {
      this.logger.error(`Report generation failed: ${err.message}`);
      await this.prisma.reportRun.update({
        where: { id: reportRun.id },
        data: {
          status: 'FAILED',
          errorText: err.message?.substring(0, 500),
        },
      });
      return { reportRunId: reportRun.id, status: 'FAILED', error: err.message };
    }
  }

  async getReportRuns(page: number = 1, pageSize: number = 20) {
    const [total, items] = await Promise.all([
      this.prisma.reportRun.count(),
      this.prisma.reportRun.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { page, pageSize, total, items };
  }

  async getReportRun(id: string) {
    return this.prisma.reportRun.findUnique({ where: { id } });
  }

  /**
   * Manage subscriptions
   */
  async getSubscriptions() {
    return this.prisma.reportSubscription.findMany({
      orderBy: [{ reportType: 'asc' }, { recipientEmail: 'asc' }],
    });
  }

  async addSubscription(reportType: ReportType, recipientEmail: string) {
    return this.prisma.reportSubscription.create({
      data: { reportType, recipientEmail },
    });
  }

  async removeSubscription(id: string) {
    return this.prisma.reportSubscription.delete({ where: { id } });
  }

  // ─── Internal helpers ──────────────────────────────────────

  private getReportPeriod(reportType: ReportType): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let periodStart: Date;
    switch (reportType) {
      case 'DAILY':
        periodStart = new Date(periodEnd);
        periodStart.setDate(periodStart.getDate() - 1);
        break;
      case 'WEEKLY':
        periodStart = new Date(periodEnd);
        periodStart.setDate(periodStart.getDate() - 7);
        break;
      case 'MONTHLY':
        periodStart = new Date(periodEnd);
        periodStart.setMonth(periodStart.getMonth() - 1);
        break;
    }

    return { periodStart, periodEnd };
  }

  private async generateReportData(
    reportType: ReportType,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const [
      totalActive,
      stageCounts,
      rejectedCount,
      newEntries,
      userProductivity,
      completedStages,
      topTenders,
    ] = await Promise.all([
      this.prisma.tenderWorkflow.count({ where: { isRejected: false } }),

      this.prisma.tenderWorkflow.groupBy({
        by: ['currentStage'],
        where: { isRejected: false },
        _count: { id: true },
      }),

      this.prisma.tenderWorkflow.count({
        where: {
          isRejected: true,
          lastUpdatedAt: { gte: periodStart, lt: periodEnd },
        },
      }),

      this.prisma.tenderWorkflow.count({
        where: {
          enteredWorkflowAt: { gte: periodStart, lt: periodEnd },
        },
      }),

      // User productivity for the period
      this.prisma.userProductivityDaily.groupBy({
        by: ['userId'],
        where: { statDate: { gte: periodStart, lt: periodEnd } },
        _sum: {
          weightedScore: true,
          totalActions: true,
          stagesCompleted: true,
          rejectionsHandled: true,
        },
        orderBy: { _sum: { weightedScore: 'desc' } },
      }),

      this.prisma.tenderActivityLog.count({
        where: {
          actionType: 'STAGE_COMPLETED',
          createdAt: { gte: periodStart, lt: periodEnd },
        },
      }),

      // Most active tenders
      this.prisma.tender.findMany({
        where: { workflow: { isNot: null } },
        select: { id: true, title: true, organization: true },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    // Resolve user names
    const userIds = userProductivity.map((u) => u.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        profile: { select: { fullName: true } },
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      reportType,
      periodStart,
      periodEnd,
      totalActive,
      stageCounts: stageCounts.map((s) => ({
        stage: s.currentStage,
        count: s._count.id,
      })),
      rejectedCount,
      newEntries,
      completedStages,
      topTenders,
      userRankings: userProductivity.map((u, idx) => {
        const user = userMap.get(u.userId);
        return {
          rank: idx + 1,
          email: user?.email ?? 'unknown',
          fullName: user?.profile?.fullName,
          weightedScore: u._sum.weightedScore ?? 0,
          totalActions: u._sum.totalActions ?? 0,
          stagesCompleted: u._sum.stagesCompleted ?? 0,
        };
      }),
    };
  }

  private async getRecipients(reportType: ReportType): Promise<string[]> {
    const subs = await this.prisma.reportSubscription.findMany({
      where: { reportType, isActive: true },
    });
    return subs.map((s) => s.recipientEmail);
  }

  private async sendReportEmail(
    reportType: ReportType,
    data: any,
    recipients: string[],
    periodStart: Date,
    periodEnd: Date,
  ) {
    const gmailUser = process.env.GMAIL_USER;
    const gmailAppPassword = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailAppPassword) {
      this.logger.warn('Gmail credentials not configured, skipping email send');
      return;
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: gmailUser,
        pass: gmailAppPassword,
      },
    });

    const subject = `TenderWatch ${reportType} Report — ${periodStart.toLocaleDateString()} to ${periodEnd.toLocaleDateString()}`;

    const stageRows = data.stageCounts
      .map((s: any) => `<tr><td style="padding:6px 12px;border:1px solid #e2e8f0">${s.stage.replace(/_/g, ' ')}</td><td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:center">${s.count}</td></tr>`)
      .join('');

    const userRows = data.userRankings
      .slice(0, 10)
      .map((u: any) => `<tr><td style="padding:6px 12px;border:1px solid #e2e8f0">#${u.rank}</td><td style="padding:6px 12px;border:1px solid #e2e8f0">${u.fullName || u.email}</td><td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:center">${u.weightedScore}</td><td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:center">${u.totalActions}</td></tr>`)
      .join('');

    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:640px;margin:0 auto">
        <div style="background:#1e293b;color:#fff;padding:24px;border-radius:8px 8px 0 0">
          <h1 style="margin:0;font-size:22px">TenderWatch ${reportType} Report</h1>
          <p style="margin:8px 0 0;opacity:0.8">${periodStart.toLocaleDateString()} — ${periodEnd.toLocaleDateString()}</p>
        </div>
        <div style="padding:24px;border:1px solid #e2e8f0;border-top:none">
          <h2 style="color:#1e293b;font-size:16px;margin:0 0 16px">Overview</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
            <tr><td style="padding:8px 0">Active Tenders in Workflow</td><td style="text-align:right;font-weight:600">${data.totalActive}</td></tr>
            <tr><td style="padding:8px 0">New Entries This Period</td><td style="text-align:right;font-weight:600">${data.newEntries}</td></tr>
            <tr><td style="padding:8px 0">Stages Completed</td><td style="text-align:right;font-weight:600">${data.completedStages}</td></tr>
            <tr><td style="padding:8px 0">Rejections</td><td style="text-align:right;font-weight:600;color:#dc2626">${data.rejectedCount}</td></tr>
          </table>

          <h2 style="color:#1e293b;font-size:16px;margin:0 0 16px">Stage Distribution</h2>
          <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
            <thead><tr style="background:#f8fafc"><th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left">Stage</th><th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center">Count</th></tr></thead>
            <tbody>${stageRows}</tbody>
          </table>

          <h2 style="color:#1e293b;font-size:16px;margin:0 0 16px">Team Productivity</h2>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#f8fafc"><th style="padding:8px 12px;border:1px solid #e2e8f0">Rank</th><th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:left">Team Member</th><th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center">Score</th><th style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center">Actions</th></tr></thead>
            <tbody>${userRows}</tbody>
          </table>
        </div>
        <div style="padding:16px;text-align:center;color:#94a3b8;font-size:12px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          Generated by TenderWatch ERP
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"TenderWatch ERP" <${gmailUser}>`,
      to: recipients.join(', '),
      subject,
      html,
    });

    this.logger.log(`Report email sent to ${recipients.length} recipients`);
  }
}
