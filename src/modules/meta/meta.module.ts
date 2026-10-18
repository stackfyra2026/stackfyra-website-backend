import { Module } from '@nestjs/common';
import { MetaController } from './meta.controller.js';
import { MetaService } from './meta.service.js';
import { MetaSyncService } from './meta-sync.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { EmailModule } from '../email/email.module.js';

@Module({
  imports: [NotificationsModule, EmailModule],
  controllers: [MetaController],
  providers: [MetaService, MetaSyncService],
  exports: [MetaService, MetaSyncService],
})
export class MetaModule {}
