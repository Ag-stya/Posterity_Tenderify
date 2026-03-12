import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma.service';

interface WorkflowStatsJob {
  userId: string;
  tenderId: string;
  actionType: string;
  stage?: string;
  date?: string; // ISO string
}

@Processor('workflow-stats', { concurrency: 3 })
export class WorkflowStatsProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowStatsProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<WorkflowStatsJob>): Promise<void> {
    const { userId, tenderId, actionType, stage, date } = job.data;

    try {
      const statDate = date
        ? new Date(new Date(date).toISOString().split('T')[0])
        : new Date(new Date().toISOString().split('T')[0]);

      // Look up matching score rule
      const scoreRule = await this.prisma.productivityScoreRule.findFirst({
        where: {
          actionType: actionType as any,
          stage: stage ? (stage as any) : null,
          isActive: true,
        },
      });

      // Fallback: check rule without stage if stage-specific not found
      let score = 0;
      if (scoreRule) {
        score = scoreRule.scoreValue;
      } else if (stage) {
        const fallback = await this.prisma.productivityScoreRule.findFirst({
          where: { actionType: actionType as any, stage: null, isActive: true },
        });
        if (fallback) score = fallback.scoreValue;
      }

      const isStageCompleted = actionType === 'STAGE_COMPLETED' ? 1 : 0;
      const isRejection = actionType === 'TENDER_REJECTED' ? 1 : 0;

      // Upsert daily stats
      await this.prisma.userProductivityDaily.upsert({
        where: {
          userId_statDate: { userId, statDate },
        },
        create: {
          userId,
          statDate,
          totalActions: 1,
          weightedScore: score,
          tendersTouched: 1,
          stagesCompleted: isStageCompleted,
          rejectionsHandled: isRejection,
        },
        update: {
          totalActions: { increment: 1 },
          weightedScore: { increment: score },
          stagesCompleted: { increment: isStageCompleted },
          rejectionsHandled: { increment: isRejection },
          // tendersTouched is harder to increment accurately without counting distinct
          // For prototype, we increment by 1 (may overcount)
          tendersTouched: { increment: 1 },
        },
      });

      this.logger.debug(
        `Updated productivity stats for user ${userId}: action=${actionType} score=${score}`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to update workflow stats: ${err.message}`);
    }
  }
}
