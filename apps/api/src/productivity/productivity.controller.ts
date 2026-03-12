import { Controller, Get, Patch, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ProductivityService } from './productivity.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('productivity')
@UseGuards(JwtAuthGuard)
export class ProductivityController {
  constructor(private readonly productivity: ProductivityService) {}

  @Get('me')
  async getMyProductivity(
    @Req() req: any,
    @Query('days') days?: string,
  ) {
    return this.productivity.getMyProductivity(
      req.user.sub,
      parseInt(days || '30', 10),
    );
  }

  @Get('users/:userId')
  @UseGuards(AdminGuard)
  async getUserProductivity(
    @Param('userId') userId: string,
    @Query('days') days?: string,
  ) {
    return this.productivity.getUserProductivity(
      userId,
      parseInt(days || '30', 10),
    );
  }

  @Get('leaderboard')
  async getLeaderboard(@Query('days') days?: string) {
    return this.productivity.getLeaderboard(parseInt(days || '7', 10));
  }

  @Get('rules')
  @UseGuards(AdminGuard)
  async getScoreRules() {
    return this.productivity.getScoreRules();
  }

  @Patch('rules/:id')
  @UseGuards(AdminGuard)
  async updateScoreRule(
    @Param('id') id: string,
    @Body() body: { scoreValue: number; isActive: boolean },
  ) {
    return this.productivity.updateScoreRule(id, body.scoreValue, body.isActive);
  }
}
