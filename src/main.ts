import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const configService = app.get(ConfigService);

  // Enable graceful shutdown
  app.enableShutdownHooks();

  // Cookie parser for session cookies ('stackfyra_session')
  app.use(cookieParser());

  // Global API route prefix
  const apiPrefix = configService.get<string>('API_PREFIX') || 'api';
  app.setGlobalPrefix(apiPrefix);

  // Global DTO Validation and Transformation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Cross-Origin Resource Sharing (CORS) with frontend credentials
  const frontendOrigin =
    configService.get<string>('FRONTEND_ORIGIN') || 'http://localhost:3000';
  const allowedOrigins = frontendOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes('*')
      ) {
        callback(null, true);
      } else {
        logger.warn(`Blocked CORS request from origin: ${origin}`);
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'svix-id',
      'svix-timestamp',
      'svix-signature',
      'resend-signature-id',
      'x-resend-signature',
      'x-hub-signature-256',
      'x-cron-key',
    ],
  });

  // Swagger OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Stackfyra CRM & Backend API')
    .setDescription(
      'Standalone NestJS REST API migrated from Next.js. Exposes CRM lead management, contact inquiries, admin submissions, enterprise authentication, Meta Graph API v26.0 Lead Ads integration, and Resend transactional email outbox queue.',
    )
    .setVersion('1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      name: 'Authorization',
      description: 'Enter JWT Bearer token',
      in: 'header',
    })
    .addCookieAuth('stackfyra_session', {
      type: 'apiKey',
      in: 'cookie',
      name: 'stackfyra_session',
      description: 'HTTP-only session cookie',
    })
    .addTag('Health', 'System health checks')
    .addTag('Authentication', 'Login, register, logout, OTP password reset')
    .addTag('Inquiries', 'Public contact and lead inquiries')
    .addTag('Admin Submissions', 'Lead submissions query and export')
    .addTag('Admin Users', 'User management, RBAC, activations')
    .addTag('CRM', 'CRM pipeline, lead stages, CSV exports')
    .addTag('Meta Integration', 'Meta Graph API v26.0 OAuth, Pages, and Lead forms')
    .addTag('Admin Integrations', 'Meta and Email integration administration')
    .addTag('Notifications', 'Push notification tokens and FCM dispatch')
    .addTag('Webhooks', 'Meta and Resend real-time webhooks')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
    customSiteTitle: 'Stackfyra API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
    },
  });

  const port = configService.get<number>('PORT') || 4000;
  await app.listen(port);

  logger.log(`🚀 Stackfyra Backend running at: http://localhost:${port}/${apiPrefix}`);
  logger.log(`📚 Swagger Documentation: http://localhost:${port}/${apiPrefix}/docs`);
}

bootstrap();
