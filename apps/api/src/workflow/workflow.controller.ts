import {
  Controller,
  Post,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenderWorkflowStage } from '@prisma/client';

@Controller('workflow')
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Post('tenders/external')
  async createExternalTender(
    @Body() body: {
      title: string;
      organization?: string;
      summary?: string;
      location?: string;
      estimatedValue?: string;
      deadlineAt?: string;
      publishedAt?: string;
      sourceUrl?: string;
    },
    @Req() req: any,
  ) {
    return this.workflow.createExternalTender(req.user.sub, body);
  }

  @Post('tenders/:tenderId/enter')
  async enterWorkflow(
    @Param('tenderId') tenderId: string,
    @Req() req: any,
  ) {
    return this.workflow.enterWorkflow(tenderId, req.user.sub);
  }

  @Get('tenders/:tenderId')
  async getWorkflow(@Param('tenderId') tenderId: string) {
    return this.workflow.getWorkflow(tenderId);
  }

  /**
   * Stage timeline — full audit trail of all transitions with who/when
   */
  @Get('tenders/:tenderId/timeline')
  async getStageTimeline(@Param('tenderId') tenderId: string) {
    return this.workflow.getStageTimeline(tenderId);
  }

  @Patch('tenders/:tenderId/stage')
  async updateStage(
    @Param('tenderId') tenderId: string,
    @Body() body: { stage: TenderWorkflowStage },
    @Req() req: any,
  ) {
    return this.workflow.updateStage(tenderId, body.stage, req.user.sub);
  }

  @Post('tenders/:tenderId/reject')
  async rejectTender(
    @Param('tenderId') tenderId: string,
    @Body() body: { rejectionReason: string; failedAtStage: TenderWorkflowStage },
    @Req() req: any,
  ) {
    return this.workflow.rejectTender(
      tenderId,
      req.user.sub,
      body.rejectionReason,
      body.failedAtStage,
    );
  }

  @Get('summary')
  async getStageSummary() {
    return this.workflow.getStageSummary();
  }

  @Get('tenders')
  async listWorkflowTenders(
    @Query('stage') stage?: TenderWorkflowStage,
    @Query('isRejected') isRejected?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.workflow.listWorkflowTenders({
      stage,
      isRejected: isRejected === 'true' ? true : isRejected === 'false' ? false : undefined,
      page: parseInt(page || '1', 10),
      pageSize: Math.min(parseInt(pageSize || '20', 10), 50),
    });
  }
}