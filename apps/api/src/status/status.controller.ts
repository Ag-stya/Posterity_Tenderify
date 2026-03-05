import { Controller, Get, UseGuards } from '@nestjs/common';
import { StatusService } from './status.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('status')
export class StatusController {
  constructor(private readonly status: StatusService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async getStatus() {
    return this.status.getStatus();
  }
}
