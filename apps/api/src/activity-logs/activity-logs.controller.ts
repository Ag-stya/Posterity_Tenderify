import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { ActivityLogsService } from './activity-logs.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller()
@UseGuards(JwtAuthGuard)
export class ActivityLogsController {
  constructor(private readonly logs: ActivityLogsService) {}

  @Get('workflow/tenders/:tenderId/activity')
  async getTenderActivity(
    @Param('tenderId') tenderId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.logs.getTenderActivity(
      tenderId,
      parseInt(page || '1', 10),
      Math.min(parseInt(pageSize || '50', 10), 100),
    );
  }

  @Get('activity/me')
  async getMyActivity(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.logs.getUserActivity(
      req.user.sub,
      parseInt(page || '1', 10),
      Math.min(parseInt(pageSize || '50', 10), 100),
    );
  }

  @Get('activity/users/:userId')
  @UseGuards(AdminGuard)
  async getUserActivity(
    @Param('userId') userId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.logs.getUserActivity(
      userId,
      parseInt(page || '1', 10),
      Math.min(parseInt(pageSize || '50', 10), 100),
    );
  }

  @Get('activity/all')
  @UseGuards(AdminGuard)
  async getAllActivity(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.logs.getAllActivity(
      parseInt(page || '1', 10),
      Math.min(parseInt(pageSize || '50', 10), 100),
    );
  }
}
