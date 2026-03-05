import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { SearchModule } from './search/search.module';
import { StatusModule } from './status/status.module';
import { AdminModule } from './admin/admin.module';
import { PrismaModule } from './common/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'change-me',
      signOptions: { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' },
    }),
    AuthModule,
    SearchModule,
    StatusModule,
    AdminModule,
  ],
})
export class AppModule {}
