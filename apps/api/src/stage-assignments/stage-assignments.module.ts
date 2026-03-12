import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StageAssignmentsController } from './stage-assignments.controller';
import { StageAssignmentsService } from './stage-assignments.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'workflow-stats' })],
  controllers: [StageAssignmentsController],
  providers: [StageAssignmentsService],
  exports: [StageAssignmentsService],
})
export class StageAssignmentsModule {}