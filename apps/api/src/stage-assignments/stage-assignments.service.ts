import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { TenderWorkflowStage, StageAssignmentStatus } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class StageAssignmentsService {
  private readonly logger = new Logger(StageAssignmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('workflow-stats') private readonly statsQueue: Queue,
  ) {}

  /**
   * Assign (or reassign) a user to a specific stage of a tender
   */
  async assignStage(
    tenderId: string,
    stage: TenderWorkflowStage,
    assignedUserId: string,
    assignedByUserId: string,
  ) {
    const workflow = await this.prisma.tenderWorkflow.findUnique({
      where: { tenderId },
    });
    if (!workflow) throw new NotFoundException('Tender not in workflow');

    const targetUser = await this.prisma.user.findUnique({
      where: { id: assignedUserId },
    });
    if (!targetUser) throw new NotFoundException('Target user not found');

    const assignment = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.tenderStageAssignment.findFirst({
        where: {
          tenderId,
          stage,
          assignmentStatus: { in: ['ASSIGNED', 'IN_PROGRESS'] },
        },
      });

      if (existing) {
        await tx.tenderStageAssignment.update({
          where: { id: existing.id },
          data: { assignmentStatus: StageAssignmentStatus.REASSIGNED },
        });

        await tx.tenderActivityLog.create({
          data: {
            tenderId,
            userId: assignedByUserId,
            actionType: 'STAGE_REASSIGNED',
            stage,
            fromValue: existing.assignedUserId,
            toValue: assignedUserId,
          },
        });
      }

      const newAssignment = await tx.tenderStageAssignment.create({
        data: {
          tenderId,
          stage,
          assignedUserId,
          assignedByUserId,
          assignmentStatus: StageAssignmentStatus.ASSIGNED,
        },
      });

      if (!existing) {
        await tx.tenderActivityLog.create({
          data: {
            tenderId,
            userId: assignedByUserId,
            actionType: 'STAGE_ASSIGNED',
            stage,
            toValue: assignedUserId,
          },
        });
      }

      return newAssignment;
    });

    await this.statsQueue.add('stats', {
      userId: assignedByUserId,
      tenderId,
      actionType: 'STAGE_ASSIGNED',
      stage,
    });

    return assignment;
  }

  /**
   * Update assignment status (IN_PROGRESS, COMPLETED)
   */
  async updateAssignmentStatus(
    tenderId: string,
    stage: TenderWorkflowStage,
    status: 'IN_PROGRESS' | 'COMPLETED',
    userId: string,
    completionNote?: string,
  ) {
    const assignment = await this.prisma.tenderStageAssignment.findFirst({
      where: {
        tenderId,
        stage,
        assignedUserId: userId,
        assignmentStatus: { in: ['ASSIGNED', 'IN_PROGRESS'] },
      },
    });

    if (!assignment) {
      throw new NotFoundException('No active assignment found for this user/stage');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updateData: any = {
        assignmentStatus: status === 'IN_PROGRESS'
          ? StageAssignmentStatus.IN_PROGRESS
          : StageAssignmentStatus.COMPLETED,
      };

      if (status === 'IN_PROGRESS') {
        updateData.startedAt = new Date();
      }
      if (status === 'COMPLETED') {
        updateData.completedAt = new Date();
        updateData.completionNote = completionNote || null;
      }

      const result = await tx.tenderStageAssignment.update({
        where: { id: assignment.id },
        data: updateData,
      });

      const actionType = status === 'IN_PROGRESS' ? 'STAGE_STARTED' : 'STAGE_COMPLETED';

      await tx.tenderActivityLog.create({
        data: {
          tenderId,
          userId,
          actionType,
          stage,
          toValue: status,
          metadataJson: completionNote ? { completionNote } : undefined,
        },
      });

      return result;
    });

    await this.statsQueue.add('stats', {
      userId,
      tenderId,
      actionType: status === 'IN_PROGRESS' ? 'STAGE_STARTED' : 'STAGE_COMPLETED',
      stage,
    });

    return updated;
  }

  /**
   * Get all stage assignments for a tender
   */
  async getStageAssignments(tenderId: string) {
    return this.prisma.tenderStageAssignment.findMany({
      where: { tenderId },
      include: {
        assignedTo: {
          select: { id: true, email: true, profile: { select: { fullName: true } } },
        },
        assignedBy: {
          select: { id: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get assignments for a specific user
   */
  async getUserAssignments(
    userId: string,
    status?: StageAssignmentStatus,
    page: number = 1,
    pageSize: number = 20,
  ) {
    const where: any = { assignedUserId: userId };
    if (status) where.assignmentStatus = status;

    const [total, items] = await Promise.all([
      this.prisma.tenderStageAssignment.count({ where }),
      this.prisma.tenderStageAssignment.findMany({
        where,
        include: {
          tender: {
            select: {
              id: true,
              title: true,
              organization: true,
              deadlineAt: true,
              workflow: { select: { currentStage: true, isRejected: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return { page, pageSize, total, items };
  }
}