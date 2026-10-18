import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailService } from './email.service.js';

@Injectable()
export class EmailSchedulerService {
  private readonly logger = new Logger(EmailSchedulerService.name);

  constructor(private readonly emailService: EmailService) {}

  /**
   * Periodically check and retry eligible queued/failed outbox email jobs every 5 minutes.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleEmailOutboxRetry() {
    try {
      const result = await this.emailService.retryEligibleOutboxJobs(20);
      if (result.processed > 0) {
        this.logger.log(
          `[EmailScheduler] Processed ${result.processed} queued job(s): ${result.succeeded} succeeded, ${result.failed} failed.`,
        );
      }
    } catch (err: any) {
      this.logger.error(`[EmailScheduler] Outbox retry failed: ${err.message}`);
    }
  }
}
