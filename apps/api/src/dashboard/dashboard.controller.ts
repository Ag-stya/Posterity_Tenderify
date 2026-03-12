import { Controller, Get, Param, UseGuards, Req } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('me')
  async getMyDashboard(@Req() req: any) {
    return this.dashboard.getUserDashboard(req.user.sub);
  }

  @Get('admin/overview')
  @UseGuards(AdminGuard)
  async getAdminOverview() {
    return this.dashboard.getAdminOverview();
  }

  @Get('admin/users/:userId')
  @UseGuards(AdminGuard)
  async getAdminUserDashboard(@Param('userId') userId: string) {
    return this.dashboard.getAdminUserDashboard(userId);
  }
}
