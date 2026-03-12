import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'workflow-stats' })],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}