import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('source-sites')
  async listSites() {
    return this.admin.listSourceSites();
  }

  @Post('source-sites')
  async createSite(@Body() body: any) {
    return this.admin.createSourceSite(body);
  }

  @Patch('source-sites/:id')
  async updateSite(@Param('id') id: string, @Body() body: any) {
    return this.admin.updateSourceSite(id, body);
  }

  @Post('source-sites/:id/enable')
  async enableSite(@Param('id') id: string) {
    return this.admin.enableSite(id);
  }

  @Post('source-sites/:id/disable')
  async disableSite(@Param('id') id: string) {
    return this.admin.disableSite(id);
  }
}
