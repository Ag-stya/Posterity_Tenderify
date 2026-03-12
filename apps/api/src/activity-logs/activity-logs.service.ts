import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class ActivityLogsService {
  constructor(private readonly prisma: PrismaService) {}

  async getTenderActivity(tenderId: string, page: number = 1, pageSize: number = 50) {
    const where = { tenderId };
    const [total, items] = await Promise.all([
      this.prisma.tenderActivityLog.count({ where }),
      this.prisma.tenderActivityLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { page, pageSize, total, items };
  }

  async getUserActivity(userId: string, page: number = 1, pageSize: number = 50) {
    const where = { userId };
    const [total, items] = await Promise.all([
      this.prisma.tenderActivityLog.count({ where }),
      this.prisma.tenderActivityLog.findMany({
        where,
        include: {
          tender: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { page, pageSize, total, items };
  }

  async getAllActivity(page: number = 1, pageSize: number = 50) {
    const [total, items] = await Promise.all([
      this.prisma.tenderActivityLog.count(),
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
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return { page, pageSize, total, items };
  }
}
