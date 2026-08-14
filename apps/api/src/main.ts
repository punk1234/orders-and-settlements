import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express, { Request, Response } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

// The underlying Express instance is created up front (not inside bootstrap)
// so it can be exported as a request handler for serverless platforms —
// Nest is then wired onto it via ExpressAdapter instead of creating its own.
const expressApp = express();

// Vercel's zero-config Nest.js detection is documented to work with a plain
// `app.listen()` bootstrap, but in practice (see git history / conversation
// this comment came out of) it failed to recognize this project's async
// multi-step bootstrap as "starts a server" and tried to load main.js as a
// plain handler module instead, crashing every invocation with "No exports
// found in module". Exporting an explicit handler sidesteps that detection
// entirely instead of depending on it working correctly.
let bootstrapped: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

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

  // init(), not listen(): this wires up every module, middleware, and route
  // onto expressApp without binding a network port — the right call both for
  // the exported serverless handler below (which forwards raw req/res to
  // expressApp itself) and so the same bootstrap can also just start
  // listening afterwards when run as a normal long-lived process.
  await app.init();
}

// Bootstrap runs once per warm process/instance and is cached, not once per
// request — both here and under Vercel's Fluid compute, which reuses warm
// instances across requests specifically to keep this cost off the hot path.
function ensureBootstrapped(): Promise<void> {
  if (!bootstrapped) {
    bootstrapped = bootstrap().catch((err) => {
      // Reset so the next invocation retries bootstrap instead of
      // permanently caching a rejected promise from a transient failure
      // (e.g. Mongo briefly unreachable).
      bootstrapped = null;
      throw err;
    });
  }
  return bootstrapped;
}

// Serverless entry point (Vercel and similar): an exported request handler,
// not a listening server. Vercel looks for exactly this shape.
export default async function handler(req: Request, res: Response) {
  await ensureBootstrapped();
  expressApp(req, res);
}

// Long-lived process entry point (local dev, Docker, AWS App Runner):
// `node dist/main.js` run directly binds a real port, same as before.
if (require.main === module) {
  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  ensureBootstrapped()
    .then(() => {
      expressApp.listen(port, '0.0.0.0', () => {
        // eslint-disable-next-line no-console
        console.log(`API listening on port ${port}`);
      });
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Fatal error during bootstrap:', err);
      process.exit(1);
    });
}
