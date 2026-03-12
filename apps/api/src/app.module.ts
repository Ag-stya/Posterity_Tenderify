import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BullModule } from '@nestjs/bullmq';

// Existing modules
import { PrismaModule } from './common/prisma.module';
import { AuthModule } from './auth/auth.module';
import { SearchModule } from './search/search.module';
import { StatusModule } from './status/status.module';
import { AdminModule } from './admin/admin.module';

// New ERP modules
import { WorkflowModule } from './workflow/workflow.module';
import { StageAssignmentsModule } from './stage-assignments/stage-assignments.module';
import { NotesModule } from './notes/notes.module';
import { ActivityLogsModule } from './activity-logs/activity-logs.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ProductivityModule } from './productivity/productivity.module';
import { ReportingModule } from './reporting/reporting.module';

@Module({
  imports: [
    PrismaModule,
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    BullModule.registerQueue({ name: 'workflow-stats' }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'change-me',
      signOptions: { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' },
    }),

    // Existing — preserved
    AuthModule,
    SearchModule,
    StatusModule,
    AdminModule,

    // ERP Extension
    WorkflowModule,
    StageAssignmentsModule,
    NotesModule,
    ActivityLogsModule,
    DashboardModule,
    ProductivityModule,
    ReportingModule,
  ],
})
export class AppModule {}
