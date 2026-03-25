import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getGlobalStats() {
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [totalTenders, openTenders, totalInWorkflow, rejectedInWorkflow, closingThisWeek, activeUsers] = await Promise.all([
      this.prisma.tender.count(),
      this.prisma.tender.count({ where: { status: 'OPEN' } }),
      this.prisma.tenderWorkflow.count(),
      this.prisma.tenderWorkflow.count({ where: { isRejected: true } }),
      this.prisma.tender.count({ where: { deadlineAt: { gte: now, lte: weekFromNow }, status: 'OPEN' } }),
      this.prisma.user.count({ where: { isActive: true } }),
    ]);

    return { totalTenders, openTenders, totalInWorkflow, activeInWorkflow: totalInWorkflow - rejectedInWorkflow, rejectedInWorkflow, closingThisWeek, activeUsers };
  }

  async getGlobalPipeline() {
    const counts = await this.prisma.tenderWorkflow.groupBy({
      by: ['currentStage'],
      where: { isRejected: false },
      _count: { id: true },
    });
    const rejectedCount = await this.prisma.tenderWorkflow.count({ where: { isRejected: true } });
    return { stages: counts.map((c) => ({ stage: c.currentStage, count: c._count.id })), rejectedCount };
  }

  async getGlobalLeaderboard(days: number = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const scores = await this.prisma.userProductivityDaily.groupBy({
      by: ['userId'],
      where: { statDate: { gte: since } },
      _sum: { weightedScore: true, totalActions: true, stagesCompleted: true },
      orderBy: { _sum: { weightedScore: 'desc' } },
      take: 20,
    });

    const userIds = scores.map((s) => s.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: { id: true, email: true, profile: { select: { fullName: true } } },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    const activeUserIds = new Set(users.map((u) => u.id));

    return scores
      .filter((s) => activeUserIds.has(s.userId))
      .map((s, idx) => {
        const user = userMap.get(s.userId);
        return {
          rank: idx + 1,
          userId: s.userId,
          email: user?.email,
          fullName: user?.profile?.fullName,
          weightedScore: s._sum.weightedScore ?? 0,
          totalActions: s._sum.totalActions ?? 0,
          stagesCompleted: s._sum.stagesCompleted ?? 0,
        };
      });
  }

  async getStaleTenders() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const staleTenders = await this.prisma.tenderWorkflow.findMany({
      where: { isRejected: false, lastUpdatedAt: { lt: sevenDaysAgo }, currentStage: { notIn: ['PROJECT_COMPLETED', 'REJECTED'] } },
      include: {
        tender: { select: { id: true, title: true, organization: true, deadlineAt: true } },
        lastUpdatedBy: { select: { email: true, profile: { select: { fullName: true } } } },
      },
      orderBy: { lastUpdatedAt: 'asc' },
      take: 20,
    });

    return staleTenders.map((wf) => ({
      tenderId: wf.tenderId, title: wf.tender.title, organization: wf.tender.organization,
      deadlineAt: wf.tender.deadlineAt, currentStage: wf.currentStage, lastUpdatedAt: wf.lastUpdatedAt,
      lastUpdatedBy: wf.lastUpdatedBy?.profile?.fullName || wf.lastUpdatedBy?.email || 'Unknown',
      daysSinceUpdate: Math.floor((Date.now() - wf.lastUpdatedAt.getTime()) / (1000 * 60 * 60 * 24)),
    }));
  }

  async getFilingAlerts() {
    const now = new Date();
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const alerts = await this.prisma.tenderWorkflow.findMany({
      where: { isRejected: false, currentStage: { not: 'PROJECT_COMPLETED' }, tender: { deadlineAt: { gte: now, lte: twoDaysFromNow } } },
      include: {
        tender: { select: { id: true, title: true, organization: true, deadlineAt: true } },
        lastUpdatedBy: { select: { email: true, profile: { select: { fullName: true } } } },
      },
      orderBy: { tender: { deadlineAt: 'asc' } },
    });

    return alerts.map((wf) => ({
      tenderId: wf.tenderId, title: wf.tender.title, organization: wf.tender.organization,
      deadlineAt: wf.tender.deadlineAt, currentStage: wf.currentStage,
      hoursLeft: Math.max(0, Math.ceil((new Date(wf.tender.deadlineAt!).getTime() - Date.now()) / (1000 * 60 * 60))),
      lastUpdatedBy: wf.lastUpdatedBy?.profile?.fullName || wf.lastUpdatedBy?.email || 'Unknown',
    }));
  }

  async getActivityFeed(scope: 'my' | 'all', userId?: string, limit: number = 20) {
    const where: any = {};
    if (scope === 'my' && userId) where.userId = userId;

    return this.prisma.tenderActivityLog.findMany({
      where,
      include: {
        user: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
        tender: { select: { id: true, title: true, organization: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async getUserDashboard(userId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      globalStats, globalPipeline, globalLeaderboard, staleTenders, filingAlerts,
      activeAssignments, myActivity, dailyScore, weeklyScore, monthlyScore, stagesCompleted,
    ] = await Promise.all([
      this.getGlobalStats(),
      this.getGlobalPipeline(),
      this.getGlobalLeaderboard(7),
      this.getStaleTenders(),
      this.getFilingAlerts(),
      this.prisma.tenderStageAssignment.findMany({
        where: { assignedUserId: userId, assignmentStatus: { in: ['ASSIGNED', 'IN_PROGRESS'] } },
        include: {
          tender: {
            select: { id: true, title: true, deadlineAt: true, organization: true,
              workflow: { select: { currentStage: true, isRejected: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.getActivityFeed('my', userId, 10),
      this.prisma.userProductivityDaily.findFirst({ where: { userId, statDate: todayStart } }),
      this.prisma.userProductivityDaily.aggregate({
        where: { userId, statDate: { gte: weekStart } },
        _sum: { weightedScore: true, totalActions: true, stagesCompleted: true },
      }),
      this.prisma.userProductivityDaily.aggregate({
        where: { userId, statDate: { gte: monthStart } },
        _sum: { weightedScore: true, totalActions: true, stagesCompleted: true },
      }),
      this.prisma.tenderStageAssignment.count({ where: { assignedUserId: userId, assignmentStatus: 'COMPLETED' } }),
    ]);

    return {
      globalStats, globalPipeline, globalLeaderboard, staleTenders, filingAlerts,
      activeAssignments,
      recentActivity: myActivity,
      scores: {
        today: { weightedScore: dailyScore?.weightedScore ?? 0, totalActions: dailyScore?.totalActions ?? 0 },
        week: { weightedScore: weeklyScore._sum.weightedScore ?? 0, totalActions: weeklyScore._sum.totalActions ?? 0, stagesCompleted: weeklyScore._sum.stagesCompleted ?? 0 },
        month: { weightedScore: monthlyScore._sum.weightedScore ?? 0, totalActions: monthlyScore._sum.totalActions ?? 0, stagesCompleted: monthlyScore._sum.stagesCompleted ?? 0 },
      },
      totalStagesCompleted: stagesCompleted,
    };
  }

  async getAdminExtras() {
    const now = new Date();

    const scrapingTrend: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const count = await this.prisma.tender.count({ where: { fetchedAt: { gte: dayStart, lt: dayEnd } } });
      scrapingTrend.push({ date: dayStart.toISOString().slice(0, 10), count });
    }

    const [totalUsers, activeUsers, inactiveUsers] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: false } }),
    ]);

    const enabledSources = await this.prisma.sourceSite.findMany({ where: { enabled: true }, select: { id: true, name: true, key: true } });
    const crawlHealth = await Promise.all(
      enabledSources.map(async (site) => {
        const lastRun = await this.prisma.crawlRun.findFirst({
          where: { sourceSiteId: site.id }, orderBy: { startedAt: 'desc' },
          select: { status: true, itemsFound: true, itemsNew: true, startedAt: true, errorCount: true },
        });
        return { name: site.name, key: site.key, lastStatus: lastRun?.status || 'NEVER', lastItemsFound: lastRun?.itemsFound || 0, lastItemsNew: lastRun?.itemsNew || 0, lastRanAt: lastRun?.startedAt || null, lastErrorCount: lastRun?.errorCount || 0 };
      })
    );

    return { scrapingTrend, userStats: { totalUsers, activeUsers, inactiveUsers }, crawlHealth };
  }

  /**
   * Admin overview — returns ALL data needed by admin dashboard
   */
  async getAdminOverview() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const [globalStats, globalPipeline, globalLeaderboard, adminExtras] = await Promise.all([
      this.getGlobalStats(),
      this.getGlobalPipeline(),
      this.getGlobalLeaderboard(7),
      this.getAdminExtras(),
    ]);

    // Week productivity (org-wide)
    const weekProductivity = await this.prisma.userProductivityDaily.aggregate({
      where: { statDate: { gte: weekStart } },
      _sum: { weightedScore: true, totalActions: true, stagesCompleted: true },
    });

    // Upcoming deadlines for tenders in workflow
    const upcomingDeadlines = await this.prisma.tender.findMany({
      where: {
        workflow: { isNot: null },
        deadlineAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true, title: true, deadlineAt: true, organization: true, workflow: { select: { currentStage: true } } },
      orderBy: { deadlineAt: 'asc' },
      take: 10,
    });

    const recentActivity = await this.getActivityFeed('all', undefined, 20);

    return {
      ...globalStats,
      stageDistribution: globalPipeline.stages,
      rejectedCount: globalPipeline.rejectedCount,
      weekProductivity: {
        weightedScore: weekProductivity._sum.weightedScore ?? 0,
        totalActions: weekProductivity._sum.totalActions ?? 0,
        stagesCompleted: weekProductivity._sum.stagesCompleted ?? 0,
      },
      upcomingDeadlines,
      recentActivity,
      userScores: globalLeaderboard,
      ...adminExtras,
    };
  }

  async getAdminUserDashboard(userId: string) {
    return this.getUserDashboard(userId);
  }
}