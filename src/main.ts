import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT ?? 3000;

  app.enableShutdownHooks();

  await app.listen(port);
  Logger.log(`🚀 Bot berjalan di port ${port}`, 'Bootstrap');
}

void bootstrap();
