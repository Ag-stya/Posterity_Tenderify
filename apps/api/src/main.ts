import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function buildAllowedOrigins(raw?: string): Set<string> {
  const configured = (raw || 'http://localhost:3000')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const allowed = new Set<string>();

  for (const origin of configured) {
    allowed.add(origin);

    if (origin.endsWith(':3000')) {
      allowed.add(origin.replace(/:3000$/, ''));
    }

    if (origin.endsWith(':80')) {
      allowed.add(origin.replace(/:80$/, ''));
    }
  }

  return allowed;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = buildAllowedOrigins(process.env.CORS_ORIGIN);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  });

  const port = process.env.API_PORT || 4000;
  await app.listen(port);
  console.log(`🚀 TenderWatch API running on port ${port}`);
}

bootstrap();