import {
  Controller,
  Put,
  Patch,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { StageAssignmentsService } from './stage-assignments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenderWorkflowStage, StageAssignmentStatus } from '@prisma/client';

@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class StageAssignmentsController {
  constructor(private readonly assignments: StageAssignmentsService) {}

  @Put('tenders/:tenderId/stages/:stage/assign')
  async assignStage(
    @Param('tenderId') tenderId: string,
    @Param('stage') stage: TenderWorkflowStage,
    @Body() body: { assignedUserId: string },
    @Req() req: any,
  ) {
    return this.assignments.assignStage(
      tenderId,
      stage,
      body.assignedUserId,
      req.user.sub,
    );
  }

  @Patch('tenders/:tenderId/stages/:stage/status')
  async updateStatus(
    @Param('tenderId') tenderId: string,
    @Param('stage') stage: TenderWorkflowStage,
    @Body() body: { status: 'IN_PROGRESS' | 'COMPLETED'; completionNote?: string },
    @Req() req: any,
  ) {
    return this.assignments.updateAssignmentStatus(
      tenderId,
      stage,
      body.status,
      req.user.sub,
      body.completionNote,
    );
  }

  @Get('tenders/:tenderId/stages')
  async getStages(@Param('tenderId') tenderId: string) {
    return this.assignments.getStageAssignments(tenderId);
  }

  @Get('my-assignments')
  async getMyAssignments(
    @Req() req: any,
    @Query('status') status?: StageAssignmentStatus,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.assignments.getUserAssignments(
      req.user.sub,
      status,
      parseInt(page || '1', 10),
      Math.min(parseInt(pageSize || '20', 10), 50),
    );
  }
}
