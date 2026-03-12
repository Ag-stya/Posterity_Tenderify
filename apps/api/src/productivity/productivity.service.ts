import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ProductivityService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProductivity(userId: string, days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [daily, totals, scoreRules] = await Promise.all([
      this.prisma.userProductivityDaily.findMany({
        where: { userId, statDate: { gte: since } },
        orderBy: { statDate: 'asc' },
      }),

      this.prisma.userProductivityDaily.aggregate({
        where: { userId, statDate: { gte: since } },
        _sum: {
          weightedScore: true,
          totalActions: true,
          tendersTouched: true,
          stagesCompleted: true,
          rejectionsHandled: true,
        },
      }),

      this.prisma.productivityScoreRule.findMany({
        where: { isActive: true },
        orderBy: { scoreValue: 'desc' },
      }),
    ]);

    return {
      period: { from: since.toISOString(), days },
      daily,
      totals: {
        weightedScore: totals._sum.weightedScore ?? 0,
        totalActions: totals._sum.totalActions ?? 0,
        tendersTouched: totals._sum.tendersTouched ?? 0,
        stagesCompleted: totals._sum.stagesCompleted ?? 0,
        rejectionsHandled: totals._sum.rejectionsHandled ?? 0,
      },
      scoreRules,
    };
  }

  async getUserProductivity(userId: string, days: number = 30) {
    return this.getMyProductivity(userId, days);
  }

  async getLeaderboard(days: number = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const leaderboard = await this.prisma.userProductivityDaily.groupBy({
      by: ['userId'],
      where: { statDate: { gte: since } },
      _sum: {
        weightedScore: true,
        totalActions: true,
        stagesCompleted: true,
      },
      orderBy: { _sum: { weightedScore: 'desc' } },
      take: 50,
    });

    const userIds = leaderboard.map((l) => l.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        profile: { select: { fullName: true, designation: true } },
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      period: { from: since.toISOString(), days },
      rankings: leaderboard.map((l, idx) => {
        const user = userMap.get(l.userId);
        return {
          rank: idx + 1,
          userId: l.userId,
          email: user?.email,
          fullName: user?.profile?.fullName,
          designation: user?.profile?.designation,
          weightedScore: l._sum.weightedScore ?? 0,
          totalActions: l._sum.totalActions ?? 0,
          stagesCompleted: l._sum.stagesCompleted ?? 0,
        };
      }),
    };
  }

  /**
   * Admin: Get/update scoring rules
   */
  async getScoreRules() {
    return this.prisma.productivityScoreRule.findMany({
      orderBy: [{ stage: 'asc' }, { actionType: 'asc' }],
    });
  }

  async updateScoreRule(id: string, scoreValue: number, isActive: boolean) {
    return this.prisma.productivityScoreRule.update({
      where: { id },
      data: { scoreValue, isActive },
    });
  }
}
