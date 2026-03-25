import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /**
   * Unified dashboard — returns personal + global data
   */
  @Get('me')
  async getMyDashboard(@Req() req: any) {
    return this.dashboard.getUserDashboard(req.user.sub);
  }

  /**
   * Activity feed — supports scope=my or scope=all
   */
  @Get('activity')
  async getActivityFeed(
    @Req() req: any,
    @Query('scope') scope?: string,
    @Query('limit') limit?: string,
  ) {
    const feedScope = scope === 'all' ? 'all' : 'my';
    return this.dashboard.getActivityFeed(
      feedScope as 'my' | 'all',
      req.user.sub,
      Math.min(parseInt(limit || '20', 10), 50),
    );
  }

  /**
   * Admin extras — scraping trends, user stats, crawl health
   */
  @Get('admin/extras')
  @UseGuards(AdminGuard)
  async getAdminExtras() {
    return this.dashboard.getAdminExtras();
  }

  /**
   * Legacy admin overview — backward compatible
   */
  @Get('admin/overview')
  @UseGuards(AdminGuard)
  async getAdminOverview() {
    return this.dashboard.getAdminOverview();
  }

  /**
   * Admin view of a specific user's dashboard
   */
  @Get('admin/users/:userId')
  @UseGuards(AdminGuard)
  async getAdminUserDashboard(@Param('userId') userId: string) {
    return this.dashboard.getAdminUserDashboard(userId);
  }
}