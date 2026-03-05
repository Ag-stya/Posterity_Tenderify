import { Controller, Post, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
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
}
