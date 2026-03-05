import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listSourceSites() {
    return this.prisma.sourceSite.findMany({
      orderBy: [{ enabled: 'desc' }, { name: 'asc' }],
    });
  }

  async createSourceSite(data: {
    key: string;
    name: string;
    baseUrl: string;
    type?: string;
    enabled?: boolean;
    crawlIntervalMinutes?: number;
    rateLimitPerMinute?: number;
  }) {
    return this.prisma.sourceSite.create({ data: data as any });
  }

  async updateSourceSite(id: string, data: Record<string, any>) {
    const site = await this.prisma.sourceSite.findUnique({ where: { id } });
    if (!site) throw new NotFoundException('Source site not found');
    return this.prisma.sourceSite.update({ where: { id }, data });
  }

  async enableSite(id: string) {
    return this.prisma.sourceSite.update({
      where: { id },
      data: { enabled: true },
    });
  }

  async disableSite(id: string) {
    return this.prisma.sourceSite.update({
      where: { id },
      data: { enabled: false },
    });
  }
}
