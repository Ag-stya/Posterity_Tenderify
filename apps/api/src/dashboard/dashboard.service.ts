import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * User dashboard data
   */
  async getUserDashboard(userId: string) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      activeAssignments,
      recentActivity,
      dailyScore,
      weeklyScore,
      monthlyScore,
      stagesCompleted,
      myTendersByStage,
    ] = await Promise.all([
      // Active stage assignments
      this.prisma.tenderStageAssignment.findMany({
        where: {
          assignedUserId: userId,
          assignmentStatus: { in: ['ASSIGNED', 'IN_PROGRESS'] },
        },
        include: {
          tender: {
            select: {
              id: true,
              title: true,
              deadlineAt: true,
              organization: true,
              workflow: { select: { currentStage: true, isRejected: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),

      // Recent activity
      this.prisma.tenderActivityLog.findMany({
        where: { userId },
        include: { tender: { select: { id: true, title: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),

      // Daily productivity score
      this.prisma.userProductivityDaily.findFirst({
        where: { userId, statDate: todayStart },
      }),

      // Weekly aggregate
      this.prisma.userProductivityDaily.aggregate({
        where: { userId, statDate: { gte: weekStart } },
        _sum: { weightedScore: true, totalActions: true, stagesCompleted: true },
      }),

      // Monthly aggregate
      this.prisma.userProductivityDaily.aggregate({
        where: { userId, statDate: { gte: monthStart } },
        _sum: { weightedScore: true, totalActions: true, stagesCompleted: true },
      }),

      // Total stages completed by this user
      this.prisma.tenderStageAssignment.count({
        where: { assignedUserId: userId, assignmentStatus: 'COMPLETED' },
      }),

      // Tenders by stage where user is assigned
      this.prisma.tenderStageAssignment.groupBy({
        by: ['stage'],
        where: {
          assignedUserId: userId,
          assignmentStatus: { in: ['ASSIGNED', 'IN_PROGRESS'] },
        },
        _count: { id: true },
      }),
    ]);

    return {
      activeAssignments,
      recentActivity,
      scores: {
        today: {
          weightedScore: dailyScore?.weightedScore ?? 0,
          totalActions: dailyScore?.totalActions ?? 0,
        },
        week: {
          weightedScore: weeklyScore._sum.weightedScore ?? 0,
          totalActions: weeklyScore._sum.totalActions ?? 0,
          stagesCompleted: weeklyScore._sum.stagesCompleted ?? 0,
        },
        month: {
          weightedScore: monthlyScore._sum.weightedScore ?? 0,
          totalActions: monthlyScore._sum.totalActions ?? 0,
          stagesCompleted: monthlyScore._sum.stagesCompleted ?? 0,
        },
      },
      totalStagesCompleted: stagesCompleted,
      myTendersByStage: myTendersByStage.map((g) => ({
        stage: g.stage,
        count: g._count.id,
      })),
    };
  }

  /**
   * Admin dashboard overview
   */
  async getAdminOverview() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    const [
      totalInWorkflow,
      rejectedCount,
      stageDistribution,
      todayProductivity,
      weekProductivity,
      recentActivity,
      totalTenders,
      usersWithScores,
      upcomingDeadlines,
    ] = await Promise.all([
      this.prisma.tenderWorkflow.count(),
      this.prisma.tenderWorkflow.count({ where: { isRejected: true } }),

      this.prisma.tenderWorkflow.groupBy({
        by: ['currentStage'],
        _count: { id: true },
      }),

      // Today's org-wide productivity
      this.prisma.userProductivityDaily.aggregate({
        where: { statDate: todayStart },
        _sum: { weightedScore: true, totalActions: true, stagesCompleted: true },
      }),

      // This week's org-wide productivity
      this.prisma.userProductivityDaily.aggregate({
        where: { statDate: { gte: weekStart } },
        _sum: { weightedScore: true, totalActions: true, stagesCompleted: true },
      }),

      // Recent org-wide activity
      this.prisma.tenderActivityLog.findMany({
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true } },
            },
          },
          tender: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),

      this.prisma.tender.count(),

      // User-wise scores for this week
      this.prisma.userProductivityDaily.groupBy({
        by: ['userId'],
        where: { statDate: { gte: weekStart } },
        _sum: { weightedScore: true, totalActions: true, stagesCompleted: true },
        orderBy: { _sum: { weightedScore: 'desc' } },
        take: 20,
      }),

      // Tenders with deadlines in next 7 days that are in workflow
      this.prisma.tender.findMany({
        where: {
          workflow: { isNot: null },
          deadlineAt: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        },
        select: {
          id: true,
          title: true,
          deadlineAt: true,
          organization: true,
          workflow: { select: { currentStage: true } },
        },
        orderBy: { deadlineAt: 'asc' },
        take: 10,
      }),
    ]);

    // Get user emails for the scores
    const userIds = usersWithScores.map((u) => u.userId);
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
      totalTenders,
      totalInWorkflow,
      activeInWorkflow: totalInWorkflow - rejectedCount,
      rejectedCount,
      stageDistribution: stageDistribution.map((s) => ({
        stage: s.currentStage,
        count: s._count.id,
      })),
      todayProductivity: {
        weightedScore: todayProductivity._sum.weightedScore ?? 0,
        totalActions: todayProductivity._sum.totalActions ?? 0,
        stagesCompleted: todayProductivity._sum.stagesCompleted ?? 0,
      },
      weekProductivity: {
        weightedScore: weekProductivity._sum.weightedScore ?? 0,
        totalActions: weekProductivity._sum.totalActions ?? 0,
        stagesCompleted: weekProductivity._sum.stagesCompleted ?? 0,
      },
      userScores: usersWithScores.map((u) => {
        const user = userMap.get(u.userId);
        return {
          userId: u.userId,
          email: user?.email,
          fullName: user?.profile?.fullName,
          weightedScore: u._sum.weightedScore ?? 0,
          totalActions: u._sum.totalActions ?? 0,
          stagesCompleted: u._sum.stagesCompleted ?? 0,
        };
      }),
      recentActivity,
      upcomingDeadlines,
    };
  }

  /**
   * Admin view of a specific user's dashboard
   */
  async getAdminUserDashboard(userId: string) {
    return this.getUserDashboard(userId);
  }
}
