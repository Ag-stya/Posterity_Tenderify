import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  const port = process.env.API_PORT || 4000;
  await app.listen(port);
  console.log(`🚀 TenderWatch API running on port ${port}`);
}
bootstrap();
