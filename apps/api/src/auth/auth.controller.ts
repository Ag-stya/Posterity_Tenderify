import { Controller, Post, Get, Patch, Param, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logout(@Req() req: any) {
    await this.auth.logout(req.user.sub);
    return { message: 'Logged out' };
  }

  @Post('admin/create-user')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createUser(@Body() body: { email: string; password: string; role?: 'ADMIN' | 'BD' }) {
    return this.auth.createUser(body.email, body.password, body.role || 'BD');
  }

  /**
   * List all users (admin only)
   */
  @Get('admin/users')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async listUsers() {
    return this.auth.listUsers();
  }

  /**
   * Toggle user active/inactive (admin only)
   */
  @Post('admin/users/:userId/toggle-active')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async toggleUserActive(@Param('userId') userId: string) {
    return this.auth.toggleUserActive(userId);
  }

  /**
   * Get my own profile
   */
  @Get('profile/me')
  @UseGuards(JwtAuthGuard)
  async getMyProfile(@Req() req: any) {
    return this.auth.getUserProfile(req.user.sub);
  }

  /**
   * Update my own profile
   */
  @Patch('profile/me')
  @UseGuards(JwtAuthGuard)
  async updateMyProfile(
    @Req() req: any,
    @Body() body: { fullName?: string; designation?: string; teamName?: string; managerUserId?: string },
  ) {
    return this.auth.updateUserProfile(req.user.sub, body);
  }

  /**
   * Get any user's profile (admin only)
   */
  @Get('admin/users/:userId/profile')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getUserProfile(@Param('userId') userId: string) {
    return this.auth.getUserProfile(userId);
  }

  /**
   * Update any user's profile (admin only)
   */
  @Patch('admin/users/:userId/profile')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateUserProfile(
    @Param('userId') userId: string,
    @Body() body: { fullName?: string; designation?: string; teamName?: string; managerUserId?: string },
  ) {
    return this.auth.updateUserProfile(userId, body);
  }
}