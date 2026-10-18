import { Module, Global } from '@nestjs/common';
import { EmailService } from './email.service.js';
import { EmailSchedulerService } from './email-scheduler.service.js';

@Global()
@Module({
  providers: [EmailService, EmailSchedulerService],
  exports: [EmailService],
})
export class EmailModule {}
