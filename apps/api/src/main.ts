import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Orders & Settlements API')
    .setDescription(
      'Orders with line items, partial payments, and derived status. ' +
        'Auth is a JWT in an httpOnly cookie (set by /auth/login or /auth/signup); ' +
        'a Bearer token in the Authorization header also works for testing this doc.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('token')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
  app.enableCors({
    origin: frontendOrigin,
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${port}`);
}

bootstrap().catch((err) => {
  // Without this catch, a bootstrap failure (e.g. env validation, a bad
  // MONGO_URI) is an unhandled promise rejection — Node crashes the process
  // with no useful message in Vercel's Function Logs, and visitors just see
  // a generic "This Serverless Function has crashed." Logging the real
  // error here at least makes that diagnosable from the logs.
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
