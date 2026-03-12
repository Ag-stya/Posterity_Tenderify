import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { TenderWorkflowStage } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('workflow-stats') private readonly statsQueue: Queue,
  ) {}

  /**
   * Enter a tender into the ERP workflow
   */
  async enterWorkflow(tenderId: string, userId: string) {
    const tender = await this.prisma.tender.findUnique({ where: { id: tenderId } });
    if (!tender) throw new NotFoundException('Tender not found');

    const existing = await this.prisma.tenderWorkflow.findUnique({
      where: { tenderId },
    });
    if (existing) throw new ConflictException('Tender is already in workflow');

    const result = await this.prisma.$transaction(async (tx) => {
      const workflow = await tx.tenderWorkflow.create({
        data: {
          tenderId,
          currentStage: TenderWorkflowStage.TENDER_IDENTIFICATION,
          lastUpdatedByUserId: userId,
        },
      });

      await tx.tenderActivityLog.create({
        data: {
          tenderId,
          userId,
          actionType: 'WORKFLOW_ENTERED',
          stage: TenderWorkflowStage.TENDER_IDENTIFICATION,
          toValue: TenderWorkflowStage.TENDER_IDENTIFICATION,
        },
      });

      return workflow;
    });

    await this.statsQueue.add('stats', {
      userId,
      tenderId,
      actionType: 'WORKFLOW_ENTERED',
      stage: 'TENDER_IDENTIFICATION',
    });

    return result;
  }

  /**
   * Get workflow details for a tender
   */
  async getWorkflow(tenderId: string) {
    const workflow = await this.prisma.tenderWorkflow.findUnique({
      where: { tenderId },
      include: {
        tender: {
          include: {
            sourceSite: { select: { id: true, name: true, key: true } },
          },
        },
        lastUpdatedBy: { select: { id: true, email: true } },
      },
    });

    if (!workflow) throw new NotFoundException('Tender not in workflow');
    return workflow;
  }

  /**
   * Update current stage of a tender
   */
  async updateStage(
    tenderId: string,
    newStage: TenderWorkflowStage,
    userId: string,
  ) {
    const workflow = await this.prisma.tenderWorkflow.findUnique({
      where: { tenderId },
    });
    if (!workflow) throw new NotFoundException('Tender not in workflow');
    if (workflow.isRejected) {
      throw new BadRequestException('Cannot change stage of a rejected tender');
    }
    if (newStage === TenderWorkflowStage.REJECTED) {
      throw new BadRequestException('Use the reject endpoint to reject a tender');
    }

    const fromStage = workflow.currentStage;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenderWorkflow.update({
        where: { tenderId },
        data: {
          currentStage: newStage,
          currentStageEnteredAt: new Date(),
          lastUpdatedByUserId: userId,
          lastUpdatedAt: new Date(),
        },
      });

      await tx.tenderActivityLog.create({
        data: {
          tenderId,
          userId,
          actionType: 'STAGE_CHANGED',
          stage: newStage,
          fromValue: fromStage,
          toValue: newStage,
        },
      });

      return updated;
    });

    await this.statsQueue.add('stats', {
      userId,
      tenderId,
      actionType: 'STAGE_CHANGED',
      stage: newStage,
    });

    return result;
  }

  /**
   * Reject a tender
   */
  async rejectTender(
    tenderId: string,
    userId: string,
    rejectionReason: string,
    failedAtStage: TenderWorkflowStage,
  ) {
    if (!rejectionReason || !rejectionReason.trim()) {
      throw new BadRequestException('Rejection reason is required');
    }
    if (!failedAtStage) {
      throw new BadRequestException('Failed-at stage is required');
    }

    const workflow = await this.prisma.tenderWorkflow.findUnique({
      where: { tenderId },
    });
    if (!workflow) throw new NotFoundException('Tender not in workflow');
    if (workflow.isRejected) {
      throw new BadRequestException('Tender is already rejected');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenderWorkflow.update({
        where: { tenderId },
        data: {
          currentStage: TenderWorkflowStage.REJECTED,
          isRejected: true,
          rejectionReason: rejectionReason.trim(),
          failedAtStage,
          lastUpdatedByUserId: userId,
          lastUpdatedAt: new Date(),
        },
      });

      await tx.tenderActivityLog.create({
        data: {
          tenderId,
          userId,
          actionType: 'TENDER_REJECTED',
          stage: failedAtStage,
          fromValue: workflow.currentStage,
          toValue: TenderWorkflowStage.REJECTED,
          metadataJson: { rejectionReason: rejectionReason.trim(), failedAtStage },
        },
      });

      return updated;
    });

    await this.statsQueue.add('stats', {
      userId,
      tenderId,
      actionType: 'TENDER_REJECTED',
      stage: failedAtStage,
    });

    return result;
  }

  /**
   * Get stage summary counts
   */
  async getStageSummary() {
    const counts = await this.prisma.tenderWorkflow.groupBy({
      by: ['currentStage'],
      _count: { id: true },
    });

    const rejectedCount = await this.prisma.tenderWorkflow.count({
      where: { isRejected: true },
    });

    const totalInWorkflow = await this.prisma.tenderWorkflow.count();

    return {
      totalInWorkflow,
      rejectedCount,
      activeCount: totalInWorkflow - rejectedCount,
      stages: counts.map((c) => ({
        stage: c.currentStage,
        count: c._count.id,
      })),
    };
  }

  /**
   * List all tenders in workflow with pagination
   */
  async listWorkflowTenders(params: {
    stage?: TenderWorkflowStage;
    isRejected?: boolean;
    page: number;
    pageSize: number;
  }) {
    const { stage, isRejected, page, pageSize } = params;
    const where: any = {};
    if (stage) where.currentStage = stage;
    if (isRejected !== undefined) where.isRejected = isRejected;

    const [total, items] = await Promise.all([
      this.prisma.tenderWorkflow.count({ where }),
      this.prisma.tenderWorkflow.findMany({
        where,
        include: {
          tender: {
            select: {
              id: true,
              title: true,
              organization: true,
              deadlineAt: true,
              status: true,
              sourceSite: { select: { name: true } },
            },
          },
          lastUpdatedBy: { select: { id: true, email: true } },
        },
        orderBy: { lastUpdatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { page, pageSize, total, items };
  }
}