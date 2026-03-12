import { Controller, Post, Get, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ReportingService } from './reporting.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { ReportType } from '@prisma/client';

@Controller('reports')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Post('run')
  async runReport(@Body() body: { reportType: ReportType }) {
    return this.reporting.runReport(body.reportType);
  }

  @Get('runs')
  async getReportRuns(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.reporting.getReportRuns(
      parseInt(page || '1', 10),
      Math.min(parseInt(pageSize || '20', 10), 50),
    );
  }

  @Get('runs/:id')
  async getReportRun(@Param('id') id: string) {
    return this.reporting.getReportRun(id);
  }

  @Get('subscriptions')
  async getSubscriptions() {
    return this.reporting.getSubscriptions();
  }

  @Post('subscriptions')
  async addSubscription(@Body() body: { reportType: ReportType; recipientEmail: string }) {
    return this.reporting.addSubscription(body.reportType, body.recipientEmail);
  }

  @Delete('subscriptions/:id')
  async removeSubscription(@Param('id') id: string) {
    return this.reporting.removeSubscription(id);
  }
}
