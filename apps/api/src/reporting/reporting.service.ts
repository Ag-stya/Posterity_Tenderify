import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { ReportType } from '@prisma/client';
import * as nodemailer from 'nodemailer';

const STAGE_LABELS: Record<string, string> = {
  TENDER_IDENTIFICATION: 'Identification',
  DUE_DILIGENCE: 'Due Diligence',
  PRE_BID_MEETING: 'Pre-Bid Meeting',
  TENDER_FILING: 'Tender Filing',
  TECH_EVALUATION: 'Tech Evaluation',
  PRESENTATION_STAGE: 'Presentation',
  FINANCIAL_EVALUATION: 'Financial Eval',
  CONTRACT_AWARD: 'Contract Award',
  PROJECT_INITIATED: 'Project Init',
  PROJECT_COMPLETED: 'Completed',
  REJECTED: 'Rejected',
};

const ACTION_LABELS: Record<string, string> = {
  WORKFLOW_ENTERED: 'Entered Workflow',
  STAGE_CHANGED: 'Moved Stage',
  STAGE_ASSIGNED: 'Assigned to Stage',
  STAGE_REASSIGNED: 'Reassigned',
  STAGE_STARTED: 'Started Work',
  STAGE_COMPLETED: 'Completed Stage',
  TENDER_REJECTED: 'Rejected Tender',
  NOTE_ADDED: 'Added Note',
};

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
      activityLogs,
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

      this.prisma.tender.findMany({
        where: { workflow: { isNot: null } },
        select: { id: true, title: true, organization: true },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      }),

      // Fetch detailed activity logs for the period
      this.prisma.tenderActivityLog.findMany({
        where: {
          createdAt: { gte: periodStart, lt: periodEnd },
        },
        select: {
          id: true,
          actionType: true,
          stage: true,
          fromValue: true,
          toValue: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true } },
            },
          },
          tender: {
            select: {
              id: true,
              title: true,
              organization: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200, // Limit to prevent huge emails
      }),
    ]);

    // Resolve user names for productivity — only include ACTIVE users
    const userIds = userProductivity.map((u) => u.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        isActive: true,
        profile: { select: { fullName: true } },
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const activeUserIds = new Set(users.filter((u) => u.isActive).map((u) => u.id));

    // Group activity logs by user — exclude inactive users
    const userActivityMap = new Map<string, any[]>();
    for (const log of activityLogs) {
      const userId = log.user?.id || 'unknown';
      if (!activeUserIds.has(userId)) continue; // Skip inactive users
      if (!userActivityMap.has(userId)) {
        userActivityMap.set(userId, []);
      }
      userActivityMap.get(userId)!.push(log);
    }

    // Build per-user activity detail (only active users)
    const userActivityDetails: any[] = [];
    for (const [userId, logs] of userActivityMap.entries()) {
      const userInfo = logs[0]?.user;
      userActivityDetails.push({
        userId,
        name: userInfo?.profile?.fullName || userInfo?.email || 'Unknown',
        email: userInfo?.email || 'unknown',
        activities: logs.map((l: any) => ({
          action: l.actionType,
          tenderTitle: l.tender?.title || 'Unknown Tender',
          tenderOrg: l.tender?.organization || '',
          stage: l.stage,
          fromStage: l.fromValue,
          toStage: l.toValue,
          time: l.createdAt,
        })),
      });
    }

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
      userRankings: userProductivity
        .filter((u) => activeUserIds.has(u.userId)) // Exclude inactive users
        .map((u, idx) => {
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
      userActivityDetails,
    };
  }

  private async getRecipients(reportType: ReportType): Promise<string[]> {
    const subs = await this.prisma.reportSubscription.findMany({
      where: { reportType, isActive: true },
    });
    return subs.map((s) => s.recipientEmail);
  }

  private createTransporter() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      this.logger.warn('SMTP credentials not configured, skipping email send');
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: { user, pass },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false,
      },
    });
  }

  private async sendReportEmail(
    reportType: ReportType,
    data: any,
    recipients: string[],
    periodStart: Date,
    periodEnd: Date,
  ) {
    const transporter = this.createTransporter();
    if (!transporter) return;

    const from = process.env.SMTP_FROM || `"TenderWatch ERP" <${process.env.SMTP_USER}>`;
    const subject = `TenderWatch ${reportType} Report — ${periodStart.toLocaleDateString()} to ${periodEnd.toLocaleDateString()}`;

    const cellStyle = 'padding:6px 12px;border:1px solid #e2e8f0;font-size:13px';
    const headerCellStyle = 'padding:8px 12px;border:1px solid #e2e8f0;font-size:13px';

    const stageRows = data.stageCounts
      .map((s: any) => `<tr><td style="${cellStyle}">${(STAGE_LABELS[s.stage] || s.stage.replace(/_/g, ' '))}</td><td style="${cellStyle};text-align:center">${s.count}</td></tr>`)
      .join('');

    const userRows = data.userRankings
      .slice(0, 10)
      .map((u: any) => `<tr><td style="${cellStyle}">#${u.rank}</td><td style="${cellStyle}">${u.fullName || u.email}</td><td style="${cellStyle};text-align:center">${u.weightedScore}</td><td style="${cellStyle};text-align:center">${u.totalActions}</td><td style="${cellStyle};text-align:center">${u.stagesCompleted}</td></tr>`)
      .join('');

    // Build per-user activity detail HTML
    let userActivityHtml = '';
    if (data.userActivityDetails && data.userActivityDetails.length > 0) {
      const userSections = data.userActivityDetails.map((u: any) => {
        const activityRows = u.activities.slice(0, 25).map((a: any) => {
          const actionLabel = ACTION_LABELS[a.action] || a.action.replace(/_/g, ' ');
          const stageLabel = a.stage ? (STAGE_LABELS[a.stage] || a.stage.replace(/_/g, ' ')) : '';
          const transition = (a.fromStage && a.toStage)
            ? `${STAGE_LABELS[a.fromStage] || String(a.fromStage).replace(/_/g, ' ')} → ${STAGE_LABELS[a.toStage] || String(a.toStage).replace(/_/g, ' ')}`
            : stageLabel;
          const time = new Date(a.time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
          const tenderShort = a.tenderTitle.length > 50 ? a.tenderTitle.substring(0, 50) + '...' : a.tenderTitle;

          return `<tr>
            <td style="${cellStyle};color:#6b7280">${time}</td>
            <td style="${cellStyle}">${actionLabel}</td>
            <td style="${cellStyle};max-width:200px">${tenderShort}</td>
            <td style="${cellStyle};color:#6b7280">${transition}</td>
          </tr>`;
        }).join('');

        const moreText = u.activities.length > 25 ? `<p style="color:#94a3b8;font-size:12px;margin:4px 0 0">...and ${u.activities.length - 25} more actions</p>` : '';

        return `
          <div style="margin-bottom:20px">
            <h4 style="color:#1e293b;font-size:14px;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid #e2e8f0">
              ${u.name} <span style="color:#94a3b8;font-weight:normal;font-size:12px">(${u.email})</span>
              <span style="float:right;color:#06b6d4;font-size:12px">${u.activities.length} actions</span>
            </h4>
            <table style="width:100%;border-collapse:collapse">
              <thead><tr style="background:#f8fafc">
                <th style="${headerCellStyle};text-align:left">Time</th>
                <th style="${headerCellStyle};text-align:left">Action</th>
                <th style="${headerCellStyle};text-align:left">Tender</th>
                <th style="${headerCellStyle};text-align:left">Stage</th>
              </tr></thead>
              <tbody>${activityRows}</tbody>
            </table>
            ${moreText}
          </div>
        `;
      }).join('');

      userActivityHtml = `
        <h2 style="color:#1e293b;font-size:16px;margin:24px 0 16px;padding-top:16px;border-top:2px solid #e2e8f0">User Activity Details</h2>
        <p style="color:#64748b;font-size:13px;margin:0 0 16px">Detailed breakdown of who did what on which tender during this period.</p>
        ${userSections}
      `;
    } else {
      userActivityHtml = `
        <h2 style="color:#1e293b;font-size:16px;margin:24px 0 16px;padding-top:16px;border-top:2px solid #e2e8f0">User Activity Details</h2>
        <p style="color:#94a3b8;font-size:13px">No user activity recorded during this period.</p>
      `;
    }

    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:720px;margin:0 auto">
        <div style="background:#1e293b;color:#fff;padding:24px;border-radius:8px 8px 0 0">
          <h1 style="margin:0;font-size:22px">TenderWatch ${reportType} Report</h1>
          <p style="margin:8px 0 0;opacity:0.8">${periodStart.toLocaleDateString()} — ${periodEnd.toLocaleDateString()}</p>
          <p style="margin:4px 0 0;opacity:0.6;font-size:12px">Posterity Consulting</p>
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
            <thead><tr style="background:#f8fafc"><th style="${headerCellStyle};text-align:left">Stage</th><th style="${headerCellStyle};text-align:center">Count</th></tr></thead>
            <tbody>${stageRows}</tbody>
          </table>

          <h2 style="color:#1e293b;font-size:16px;margin:0 0 16px">Team Productivity</h2>
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="background:#f8fafc">
              <th style="${headerCellStyle}">Rank</th>
              <th style="${headerCellStyle};text-align:left">Team Member</th>
              <th style="${headerCellStyle};text-align:center">Score</th>
              <th style="${headerCellStyle};text-align:center">Actions</th>
              <th style="${headerCellStyle};text-align:center">Stages Done</th>
            </tr></thead>
            <tbody>${userRows}</tbody>
          </table>

          ${userActivityHtml}
        </div>
        <div style="padding:16px;text-align:center;color:#94a3b8;font-size:12px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px">
          Generated by TenderWatch ERP · Posterity Consulting
        </div>
      </div>
    `;

    await transporter.sendMail({
      from,
      to: recipients.join(', '),
      subject,
      html,
    });

    this.logger.log(`Report email sent to ${recipients.length} recipients`);
  }
}