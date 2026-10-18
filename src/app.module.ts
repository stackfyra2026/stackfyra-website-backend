import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { InquiriesModule } from './modules/inquiries/inquiries.module.js';
import { AdminSubmissionsModule } from './modules/admin-submissions/admin-submissions.module.js';
import { AdminUsersModule } from './modules/admin-users/admin-users.module.js';
import { CrmModule } from './modules/crm/crm.module.js';
import { MetaModule } from './modules/meta/meta.module.js';
import { EmailModule } from './modules/email/email.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { IntegrationsModule } from './modules/integrations/integrations.module.js';
import { WebhooksModule } from './modules/webhooks/webhooks.module.js';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri:
          configService.get<string>('MONGODB_URI') ||
          'mongodb://127.0.0.1:27017/stackfyra',
        autoIndex: true,
      }),
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    InquiriesModule,
    AdminSubmissionsModule,
    AdminUsersModule,
    CrmModule,
    MetaModule,
    EmailModule,
    NotificationsModule,
    IntegrationsModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
  ],
})
export class AppModule {}
