import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';

async function bootstrap() {
  const role = process.env.WORKER_ROLE || 'crawl';
  const app = await NestFactory.createApplicationContext(WorkerModule);
  await app.init();
  console.log(`🔧 TenderWatch Worker started [role=${role}]`);
}

bootstrap().catch((err) => {
  console.error('❌ Worker bootstrap failed', err);
  process.exit(1);
});