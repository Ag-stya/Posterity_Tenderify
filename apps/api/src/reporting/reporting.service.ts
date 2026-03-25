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

const STAGE_ORDER = [
  'TENDER_IDENTIFICATION',
  'DUE_DILIGENCE',
  'PRE_BID_MEETING',
  'TENDER_FILING',
  'TECH_EVALUATION',
  'PRESENTATION_STAGE',
  'FINANCIAL_EVALUATION',
  'CONTRACT_AWARD',
  'PROJECT_INITIATED',
  'PROJECT_COMPLETED',
  'REJECTED',
];

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

type AlertLevel = 'info' | 'warning' | 'danger';

type ActivityLogRecord = {
  id: string;
  actionType: string;
  stage: string | null;
  fromValue: string | null;
  toValue: string | null;
  createdAt: Date;
  user: {
    id: string;
    email: string | null;
    profile: { fullName: string | null } | null;
  } | null;
  tender: {
    id: string;
    title: string | null;
    organization: string | null;
  } | null;
};

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(private readonly prisma: PrismaService) {}

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
      this.logger.error(`Report generation failed: ${err.message}`, err?.stack);
      await this.prisma.reportRun.update({
        where: { id: reportRun.id },
        data: {
          status: 'FAILED',
          errorText: String(err.message || 'Unknown error').substring(0, 500),
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

  private getReportPeriod(reportType: ReportType): { periodStart: Date; periodEnd: Date } {
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let periodStart = new Date(periodEnd);

    switch (reportType) {
      case 'DAILY':
        periodStart.setDate(periodStart.getDate() - 1);
        break;
      case 'WEEKLY':
        periodStart.setDate(periodStart.getDate() - 7);
        break;
      case 'MONTHLY':
        periodStart.setMonth(periodStart.getMonth() - 1);
        break;
      default:
        periodStart.setDate(periodStart.getDate() - 1);
        break;
    }

    return { periodStart, periodEnd };
  }

  private formatStage(stage: string | null | undefined) {
    if (!stage) return '—';
    return STAGE_LABELS[stage] || stage.replace(/_/g, ' ');
  }

  private getStageSortIndex(stage: string) {
    const idx = STAGE_ORDER.indexOf(stage);
    return idx === -1 ? 999 : idx;
  }

  private getAlertColors(level: AlertLevel) {
    if (level === 'danger') {
      return { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' };
    }
    if (level === 'warning') {
      return { bg: '#fffbeb', border: '#fde68a', text: '#92400e' };
    }
    return { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' };
  }
  private getSectionVisibility(reportType: ReportType) {
    return {
      showAlerts: reportType === 'DAILY',
      showOverview: true,
      showPipelineInsights: reportType === 'MONTHLY',
      showStageDistribution: reportType === 'DAILY' || reportType === 'WEEKLY',
      showStageConversionRates: reportType === 'MONTHLY',
      showStageMovement: reportType === 'MONTHLY',
      showTeamProductivity: reportType === 'WEEKLY' || reportType === 'MONTHLY',
      showMostActiveTenders: reportType === 'WEEKLY' || reportType === 'MONTHLY',
      showStalledTenders: false,
      showUserActivityDetails: true,
    };
  }

  private async generateReportData(
    reportType: ReportType,
    periodStart: Date,
    periodEnd: Date,
  ) {
    const stuckThreshold = new Date(periodEnd);
    stuckThreshold.setDate(stuckThreshold.getDate() - 3);

    const [
      totalActive,
      stageCountsRaw,
      rejectedCount,
      newEntries,
      userProductivity,
      completedStages,
      activityLogsRaw,
      stuckTendersRaw,
    ] = await Promise.all([
      this.prisma.tenderWorkflow.count({
        where: { isRejected: false },
      }),

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
        take: 250,
      }),

      this.prisma.tenderWorkflow.findMany({
        where: {
          isRejected: false,
          lastUpdatedAt: { lt: stuckThreshold },
        },
        select: {
          id: true,
          currentStage: true,
          lastUpdatedAt: true,
          tender: {
            select: {
              id: true,
              title: true,
              organization: true,
            },
          },
        },
        orderBy: { lastUpdatedAt: 'asc' },
        take: 10,
      }),
    ]);

    const userIds = [...new Set(userProductivity.map((u) => u.userId))];
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

    const activityLogs = (activityLogsRaw as ActivityLogRecord[]).filter((log) =>
      log.user?.id ? activeUserIds.has(log.user.id) : false,
    );

    const stageCounts = stageCountsRaw
      .map((s) => ({
        stage: s.currentStage,
        count: s._count.id,
      }))
      .sort((a, b) => this.getStageSortIndex(a.stage) - this.getStageSortIndex(b.stage));

    const activityByUser = new Map<string, ActivityLogRecord[]>();
    const activityByTender = new Map<
      string,
      { tenderTitle: string; organization: string; activityCount: number; lastActivityAt: Date }
    >();

    const stageEntryCounts = new Map<string, number>();
    const stageCompletionCounts = new Map<string, number>();
    const stageTransitionCounts = new Map<string, number>();

    for (const log of activityLogs) {
      const userId = log.user?.id;
      if (userId) {
        if (!activityByUser.has(userId)) activityByUser.set(userId, []);
        activityByUser.get(userId)!.push(log);
      }

      if (log.tender?.id) {
        const existing = activityByTender.get(log.tender.id);
        if (!existing) {
          activityByTender.set(log.tender.id, {
            tenderTitle: log.tender.title || 'Unknown Tender',
            organization: log.tender.organization || '',
            activityCount: 1,
            lastActivityAt: log.createdAt,
          });
        } else {
          existing.activityCount += 1;
          if (log.createdAt > existing.lastActivityAt) {
            existing.lastActivityAt = log.createdAt;
          }
        }
      }

      if (log.actionType === 'WORKFLOW_ENTERED') {
        const stage = log.stage || log.toValue || 'TENDER_IDENTIFICATION';
        stageEntryCounts.set(stage, (stageEntryCounts.get(stage) || 0) + 1);
      }

      if (
        (log.actionType === 'STAGE_CHANGED' || log.actionType === 'STAGE_REASSIGNED') &&
        log.toValue
      ) {
        stageEntryCounts.set(log.toValue, (stageEntryCounts.get(log.toValue) || 0) + 1);
      }

      if (log.actionType === 'STAGE_COMPLETED' && log.stage) {
        stageCompletionCounts.set(log.stage, (stageCompletionCounts.get(log.stage) || 0) + 1);
      }

      if (log.fromValue && log.toValue) {
        const key = `${log.fromValue}__${log.toValue}`;
        stageTransitionCounts.set(key, (stageTransitionCounts.get(key) || 0) + 1);
      }
    }

    const topTenders = Array.from(activityByTender.values())
      .sort((a, b) => {
        if (b.activityCount !== a.activityCount) return b.activityCount - a.activityCount;
        return b.lastActivityAt.getTime() - a.lastActivityAt.getTime();
      })
      .slice(0, 5)
      .map((t) => ({
        title: t.tenderTitle,
        organization: t.organization,
        activityCount: t.activityCount,
      }));

    const userRankings = userProductivity
      .filter((u) => activeUserIds.has(u.userId))
      .map((u) => {
        const user = userMap.get(u.userId);
        return {
          userId: u.userId,
          email: user?.email ?? 'unknown',
          fullName: user?.profile?.fullName ?? null,
          weightedScore: u._sum.weightedScore ?? 0,
          totalActions: u._sum.totalActions ?? 0,
          stagesCompleted: u._sum.stagesCompleted ?? 0,
          rejectionsHandled: u._sum.rejectionsHandled ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.weightedScore !== a.weightedScore) return b.weightedScore - a.weightedScore;
        if (b.stagesCompleted !== a.stagesCompleted) return b.stagesCompleted - a.stagesCompleted;
        return b.totalActions - a.totalActions;
      })
      .map((u, idx) => ({
        rank: idx + 1,
        ...u,
      }));

    const userActivityDetails = Array.from(activityByUser.entries())
      .map(([userId, logs]) => {
        const user = userMap.get(userId);
        return {
          userId,
          name: user?.profile?.fullName || user?.email || 'Unknown',
          email: user?.email || 'unknown',
          activityCount: logs.length,
          activities: logs.slice(0, 30).map((log) => ({
            action: log.actionType,
            tenderTitle: log.tender?.title || 'Unknown Tender',
            tenderOrg: log.tender?.organization || '',
            stage: log.stage,
            fromStage: log.fromValue,
            toStage: log.toValue,
            time: log.createdAt,
          })),
        };
      })
      .sort((a, b) => b.activityCount - a.activityCount);

    const stageConversionRates = Array.from(
      new Set([...stageEntryCounts.keys(), ...stageCompletionCounts.keys()]),
    )
      .map((stage) => {
        const entered = stageEntryCounts.get(stage) || 0;
        const completed = stageCompletionCounts.get(stage) || 0;
        return {
          stage,
          entered,
          completed,
          conversionRate: entered > 0 ? (completed / entered) * 100 : null,
        };
      })
      .sort((a, b) => this.getStageSortIndex(a.stage) - this.getStageSortIndex(b.stage));

    const stageTransitions = Array.from(stageTransitionCounts.entries())
      .map(([key, count]) => {
        const [fromStage, toStage] = key.split('__');
        return { fromStage, toStage, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const totalTracked = newEntries + completedStages + rejectedCount;
    const progressionRate = totalTracked > 0 ? (completedStages / totalTracked) * 100 : 0;
    const rejectionRate = totalTracked > 0 ? (rejectedCount / totalTracked) * 100 : 0;
    const enteredVsProgressedRatio = newEntries > 0 ? (completedStages / newEntries) * 100 : 0;
    const enteredVsDroppedRatio = newEntries > 0 ? (rejectedCount / newEntries) * 100 : 0;
    const bottleneckStage = [...stageCounts].sort((a, b) => b.count - a.count)[0]?.stage || null;

    const alerts: Array<{ level: AlertLevel; message: string }> = [];
    if (activityLogs.length === 0) {
      alerts.push({
        level: 'danger',
        message: 'No activity was recorded in this reporting period.',
      });
    }
    if (newEntries === 0) {
      alerts.push({
        level: 'warning',
        message: 'No new tenders entered the workflow in this period.',
      });
    }
    if (completedStages === 0 && activityLogs.length > 0) {
      alerts.push({
        level: 'warning',
        message: 'There was activity, but no stage completions were recorded.',
      });
    }
    if (stuckTendersRaw.length > 0) {
      alerts.push({
        level: 'warning',
        message: `${stuckTendersRaw.length} tenders appear stalled with no update in the last 3+ days.`,
      });
    }
    if (progressionRate < 10 && totalTracked > 0) {
      alerts.push({
        level: 'warning',
        message: `Low progression rate detected (${progressionRate.toFixed(1)}%).`,
      });
    }

    return {
      reportType,
      periodStart,
      periodEnd,
      totalActive,
      stageCounts,
      rejectedCount,
      newEntries,
      completedStages,
      topTenders,
      userRankings,
      userActivityDetails,
      activityCount: activityLogs.length,
      stageConversionRates,
      stageTransitions,
      stuckTenders: stuckTendersRaw.map((t) => ({
        workflowId: t.id,
        stage: t.currentStage,
        lastUpdatedAt: t.lastUpdatedAt,
        tenderId: t.tender?.id || null,
        tenderTitle: t.tender?.title || 'Unknown Tender',
        organization: t.tender?.organization || '',
      })),
      insights: {
        bottleneckStage,
        bottleneckStageLabel: bottleneckStage ? this.formatStage(bottleneckStage) : null,
        progressionRate,
        rejectionRate,
      },
      summary: {
        entered: newEntries,
        progressed: completedStages,
        dropped: rejectedCount,
        enteredVsProgressedRatio,
        enteredVsDroppedRatio,
      },
      alerts,
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

    const cellStyle = 'padding:6px 12px;border:1px solid #e2e8f0;font-size:13px;vertical-align:top';
    const headerCellStyle =
      'padding:8px 12px;border:1px solid #e2e8f0;font-size:13px;background:#f8fafc';
    const sections = this.getSectionVisibility(reportType);

    const alertHtml = `
      <h2 style="color:#1e293b;font-size:16px;margin:0 0 12px">Alerts & Signals</h2>
      ${
        data.alerts?.length > 0
          ? data.alerts
              .map((alert: { level: AlertLevel; message: string }) => {
                const colors = this.getAlertColors(alert.level);
                return `
                  <div style="background:${colors.bg};border:1px solid ${colors.border};color:${colors.text};padding:10px 12px;border-radius:8px;margin-bottom:8px;font-size:13px">
                    ${alert.message}
                  </div>
                `;
              })
              .join('')
          : `<div style="background:#f8fafc;border:1px solid #e2e8f0;color:#64748b;padding:10px 12px;border-radius:8px;font-size:13px">No alerts or signals for this period.</div>`
      }
    `;

    const overviewHtml = `
      <h2 style="color:#1e293b;font-size:16px;margin:0 0 16px">Overview</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:8px 0">Active Tenders in Workflow</td><td style="text-align:right;font-weight:600">${data.totalActive}</td></tr>
        <tr><td style="padding:8px 0">New Entries This Period</td><td style="text-align:right;font-weight:600">${data.newEntries}</td></tr>
        <tr><td style="padding:8px 0">Stages Completed</td><td style="text-align:right;fontdata.completedStages}</td></tr>
        <tr><td style="padding:8px 0">Rejections</td><td style="text-align:right;font-weight:600;color:#dc2626">${data.rejectedCount}</td></tr>
        <tr><td style="padding:8px 0">Activity Events Logged</td><td style="text-align:right;font-weight:600">${data.activityCount}</td></tr>
      </table>
    `;

    const pipelineInsightsHtml = `
      <h2 style="color:#1e293b;font-size:16px;margin:24px 0 16px">Pipeline Insights</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:8px 0">Entered → Progressed Ratio</td><td style="text-align:right;font-weight:600">${data.summary.enteredVsProgressedRatio.toFixed(1)}%</td></tr>
        <tr><td style="padding:8px 0">Entered → Dropped Ratio</td><td style="text-align:right;font-weight:600">${data.summary.enteredVsDroppedRatio.toFixed(1)}%</td></tr>
        <tr><td style="padding:8px 0">Progression Rate</td><td style="text-align:right;font-weight:600">${data.insights.progressionRate.toFixed(1)}%</td></tr>
        <tr><td style="padding:8px 0">Rejection Rate</td><td style="text-align:right;font-weight:600">${data.insights.rejectionRate.toFixed(1)}%</td></tr>
        <tr><td style="padding:8px 0">Bottleneck Stage</td><td style="text-align:right;font-weight:600">${data.insights.bottleneckStageLabel || '—'}</td></tr>
        <tr><td style="padding:8px 0">Stalled Tenders</td><td style="text-align:right;font-weight:600">${data.stuckTenders.length}</td></tr>
      </table>
    `;

    const stageDistributionHtml = `
      <h2 style="color:#1e293b;font-size:16px;margin:24px 0 16px">Stage Distribution</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr>
            <th style="${headerCellStyle};text-align:left">Stage</th>
            <th style="${headerCellStyle};text-align:center">Count</th>
          </tr>
        </thead>
        <tbody>
          ${
            data.stageCounts?.length > 0
              ? data.stageCounts
                  .map(
                    (s: any) => `
                      <tr>
                        <td style="${cellStyle}">${this.formatStage(s.stage)}</td>
                        <td style="${cellStyle};text-align:center">${s.count}</td>
                      </tr>
                    `,
                  )
                  .join('')
              : `<tr><td colspan="2" style="${cellStyle};text-align:center;color:#94a3b8">No stage data available</td></tr>`
          }
        </tbody>
      </table>
    `;

    const teamProductivityHtml = `
      <h2 style="color:#1e293b;font-size:16px;margin:24px 0 16px">Team Productivity</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr>
            <th style="${headerCellStyle}">Rank</th>
            <th style="${headerCellStyle};text-align:left">Team Member</th>
            <th style="${headerCellStyle};text-align:center">Score</th>
            <th style="${headerCellStyle};text-align:center">Actions</th>
            <th style="${headerCellStyle};text-align:center">Stages Done</th>
          </tr>
        </thead>
        <tbody>
          ${
            data.userRankings?.length > 0
              ? data.userRankings
                  .slice(0, 10)
                  .map(
                    (u: any) => `
                      <tr>
                        <td style="${cellStyle}">#${u.rank}</td>
                        <td style="${cellStyle}">${u.fullName || u.email}</td>
                        <td style="${cellStyle};text-align:center">${u.weightedScore}</td>
                        <td style="${cellStyle};text-align:center">${u.totalActions}</td>
                        <td style="${cellStyle};text-align:center">${u.stagesCompleted}</td>
                      </tr>
                    `,
                  )
                  .join('')
              : `<tr><td colspan="5" style="${cellStyle};text-align:center;color:#94a3b8">No productivity data available</td></tr>`
          }
        </tbody>
      </table>
    `;

    const stageConversionHtml = `
      <h2 style="color:#1e293b;font-size:16px;margin:24px 0 16px">Stage Conversion Rates</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr>
            <th style="${headerCellStyle};text-align:left">Stage</th>
            <th style="${headerCellStyle};text-align:center">Entered</th>
            <th style="${headerCellStyle};text-align:center">Completed</th>
            <th style="${headerCellStyle};text-align:center">Conversion</th>
          </tr>
        </thead>
        <tbody>
          ${
            data.stageConversionRates?.length > 0
              ? data.stageConversionRates
                  .map(
                    (row: any) => `
                      <tr>
                        <td style="${cellStyle}">${this.formatStage(row.stage)}</td>
                        <td style="${cellStyle};text-align:center">${row.entered}</td>
                        <td style="${cellStyle};text-align:center">${row.completed}</td>
                        <td style="${cellStyle};text-align:center">${
                          row.conversionRate === null ? '—' : `${row.conversionRate.toFixed(1)}%`
                        }</td>
                      </tr>
                    `,
                  )
                  .join('')
              : `<tr><td colspan="4" style="${cellStyle};text-align:center;color:#94a3b8">No conversion data available</td></tr>`
          }
        </tbody>
      </table>
    `;

    const stageMovementHtml = `
      <h2 style="color:#1e293b;font-size:16px;margin:24px 0 16px">Stage Movement</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr>
            <th style="${headerCellStyle};text-align:left">From</th>
            <th style="${headerCellStyle};text-align:left">To</th>
            <th style="${headerCellStyle};text-align:center">Moves</th>
          </tr>
        </thead>
        <tbody>
          ${
            data.stageTransitions?.length > 0
              ? data.stageTransitions
                  .map(
                    (row: any) => `
                      <tr>
                        <td style="${cellStyle}">${this.formatStage(row.fromStage)}</td>
                        <td style="${cellStyle}">${this.formatStage(row.toStage)}</td>
                        <td style="${cellStyle};text-align:center">${row.count}</td>
                      </tr>
                    `,
                  )
                  .join('')
              : `<tr><td colspan="3" style="${cellStyle};text-align:center;color:#94a3b8">No stage movements recorded</td></tr>`
          }
        </tbody>
      </table>
    `;

    const mostActiveTendersHtml = `
      <h2 style="color:#1e293b;font-size:16px;margin:24px 0 16px">Most Active Tenders</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr>
            <th style="${headerCellStyle};text-align:left">Tender</th>
            <th style="${headerCellStyle};text-align:left">Organization</th>
            <th style="${headerCellStyle};text-align:center">Activity Count</th>
          </tr>
        </thead>
        <tbody>
          ${
            data.topTenders?.length > 0
              ? data.topTenders
                  .map(
                    (t: any) => `
                      <tr>
                        <td style="${cellStyle}">${t.title}</td>
                        <td style="${cellStyle}">${t.organization || '—'}</td>
                        <td style="${cellStyle};text-align:center">${t.activityCount}</td>
                      </tr>
                    `,
                  )
                  .join('')
              : `<tr><td colspan="3" style="${cellStyle};text-align:center;color:#94a3b8">No tender activity found</td></tr>`
          }
        </tbody>
      </table>
    `;

    const stalledTendersHtml = `
      <h2 style="color:#1e293b;font-size:16px;margin:24px 0 16px">Stalled Tenders</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr>
            <th style="${headerCellStyle};text-align:left">Tender</th>
            <th style="${headerCellStyle};text-align:left">Organization</th>
            <th style="${headerCellStyle};text-align:left">Current Stage</th>
            <th style="${headerCellStyle};text-align:left">Last Updated</th>
          </tr>
        </thead>
        <tbody>
          ${
            data.stuckTenders?.length > 0
              ? data.stuckTenders
                  .map(
                    (t: any) => `
                      <tr>
                        <td style="${cellStyle}">${t.tenderTitle}</td>
                        <td style="${cellStyle}">${t.organization || '—'}</td>
                        <td style="${cellStyle}">${this.formatStage(t.stage)}</td>
                        <td style="${cellStyle}">${new Date(t.lastUpdatedAt).toLocaleDateString('en-IN')}</td>
                      </tr>
                    `,
                  )
                  .join('')
              : `<tr><td colspan="4" style="${cellStyle};text-align:center;color:#94a3b8">No stalled tenders detected</td></tr>`
          }
        </tbody>
      </table>
    `;

    const userActivityHtml =
      data.userActivityDetails?.length > 0
        ? `
          <h2 style="color:#1e293b;font-size:16px;margin:24px 0 16px;padding-top:16px;border-top:2px solid #e2e8f0">User Activity Details</h2>
          <p style="color:#64748b;font-size:13px;margin:0 0 16px">Who did what, when, and on which tender during this period.</p>
          ${data.userActivityDetails
            .slice(0, 8)
            .map((u: any) => {
              const activityRows = u.activities
                .slice(0, 20)
                .map((a: any) => {
                  const actionLabel = ACTION_LABELS[a.action] || a.action.replace(/_/g, ' ');
                  const transition =
                    a.fromStage && a.toStage
                      ? `${this.formatStage(a.fromStage)} → ${this.formatStage(a.toStage)}`
                      : this.formatStage(a.stage);
                  const time = new Date(a.time).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return `
                    <tr>
                      <td style="${cellStyle};color:#6b7280">${time}</td>
                      <td style="${cellStyle}">${actionLabel}</td>
                      <td style="${cellStyle};max-width:220px">${a.tenderTitle}</td>
                      <td style="${cellStyle};color:#6b7280">${transition}</td>
                    </tr>
                  `;
                })
                .join('');

              const moreText =
                u.activityCount > 20
                  ? `<p style="color:#94a3b8;font-size:12px;margin:4px 0 0">...and ${u.activityCount - 20} more actions</p>`
                  : '';

              return `
                <div style="margin-bottom:20px">
                  <h4 style="color:#1e293b;font-size:14px;margin:0 0 8px;padding-bottom:6px;border-bottom:2px solid #e2e8f0">
                    ${u.name} <span style="color:#94a3b8;font-weight:normal;font-size:12px">(${u.email})</span>
                    <span style="float:right;color:#06b6d4;font-size:12px">${u.activityCount} actions</span>
                  </h4>
                  <table style="width:100%;border-collapse:collapse">
                    <thead>
                      <tr>
                        <th style="${headerCellStyle};text-align:left">Time</th>
                        <th style="${headerCellStyle};text-align:left">Action</th>
                        <th style="${headerCellStyle};text-align:left">Tender</th>
                        <th style="${headerCellStyle};text-align:left">Stage</th>
                      </tr>
                    </thead>
                    <tbody>${activityRows}</tbody>
                  </table>
                  ${moreText}
                </div>
              `;
            })
            .join('')}
        `
        : `
          <h2 style="color:#1e293b;font-size:16px;margin:24px 0 16px;padding-top:16px;border-top:2px solid #e2e8f0">User Activity Details</h2>
          <p style="color:#94a3b8;font-size:13px">No user activity recorded during this period.</p>
        `;

    const html = `
      <div style="font-family:-apple-system,sans-serif;max-width:840px;margin:0 auto">
        <div style="background:#1e293b;color:#fff;padding:24px;border-radius:8px 8px 0 0">
          <h1 style="margin:0;font-size:22px">TenderWatch ${reportType} Report</h1>
          <p style="margin:8px 0 0;opacity:0.8">${periodStart.toLocaleDateString()} — ${periodEnd.toLocaleDateString()}</p>
          <p style="margin:4px 0 0;opacity:0.6;font-size:12px">Posterity Consulting</p>
        </div>

        <div style="padding:24px;border:1px solid #e2e8f0;border-top:none">
          ${sections.showAlerts ? alertHtml : ''}
          ${sections.showOverview ? overviewHtml : ''}
          ${sections.showPipelineInsights ? pipelineInsightsHtml : ''}
          ${sections.showStageDistribution ? stageDistributionHtml : ''}
          ${sections.showStageConversionRates ? stageConversionHtml : ''}
          ${sections.showStageMovement ? stageMovementHtml : ''}
          ${sections.showTeamProductivity ? teamProductivityHtml : ''}
          ${sections.showMostActiveTenders ? mostActiveTendersHtml : ''}
          ${sections.showStalledTenders ? stalledTendersHtml : ''}
          ${sections.showUserActivityDetails ? userActivityHtml : ''}
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