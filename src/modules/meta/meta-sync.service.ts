import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  MetaWebhookEvent,
  MetaWebhookEventDocument,
} from '../../database/schemas/meta-webhook-event.schema.js';
import {
  MetaIntegration,
  MetaIntegrationDocument,
} from '../../database/schemas/meta-integration.schema.js';
import {
  Lead,
  LeadDocument,
} from '../../database/schemas/lead.schema.js';
import { MetaService } from './meta.service.js';
import { decryptToken } from '../../common/utils/encryption.util.js';
import { EmailService } from '../email/email.service.js';

export interface MetaSyncStatus {
  isRunning: boolean;
  isSyncing: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResult: any | null;
  lastError: string | null;
}

@Injectable()
export class MetaSyncService {
  private readonly logger = new Logger(MetaSyncService.name);
  private isSyncing = false;
  private lastRunAt: Date | null = null;
  private nextRunAt: Date | null = null;
  private lastResult: any | null = null;
  private lastError: string | null = null;
  private intervalMinutes = 60;

  constructor(
    @InjectModel(MetaWebhookEvent.name)
    private webhookEventModel: Model<MetaWebhookEventDocument>,
    @InjectModel(MetaIntegration.name)
    private metaIntegrationModel: Model<MetaIntegrationDocument>,
    @InjectModel(Lead.name)
    private leadModel: Model<LeadDocument>,
    private metaService: MetaService,
    private emailService: EmailService,
  ) {
    const envMinutes = parseInt(
      process.env.META_SYNC_INTERVAL_MINUTES || '60',
      10,
    );
    this.intervalMinutes =
      !isNaN(envMinutes) && envMinutes > 0 ? envMinutes : 60;
    this.nextRunAt = new Date(Date.now() + this.intervalMinutes * 60 * 1000);
  }

  /**
   * 60-Minute periodic cron job matching Next.js instrumentation scheduler.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handlePeriodicSync() {
    this.logger.log('Executing periodic 60-minute Meta Lead Ads sync...');
    await this.executeMetaSyncCycle();
  }

  /**
   * Processes pending or eligible retry events from meta_webhook_events.
   */
  async processPendingWebhookEvents(batchLimit = 20): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    const now = new Date();
    const events = await this.webhookEventModel
      .find({
        $or: [
          { status: 'PENDING' },
          {
            status: 'FAILED',
            nextRetryAt: { $lte: now },
            attempts: { $lt: 5 },
          },
        ],
      })
      .sort({ createdAt: 1 })
      .limit(batchLimit);

    let succeeded = 0;
    let failed = 0;

    for (const event of events) {
      event.status = 'PROCESSING';
      event.attempts += 1;
      await event.save();

      const result = await this.metaService.processAndSaveLead(
        event.externalLeadId,
        event.pageId,
        event.formId,
      );

      if (result.success) {
        event.status = 'COMPLETED';
        event.processedAt = new Date();
        event.lastError = '';
        await event.save();
        succeeded += 1;
      } else {
        event.status = 'FAILED';
        event.lastError = result.error || 'Processing failed';
        const backoffSec =
          Math.min(3600, Math.pow(2, event.attempts) * 60) +
          Math.floor(Math.random() * 15);
        event.nextRetryAt = new Date(Date.now() + backoffSec * 1000);
        await event.save();
        failed += 1;
      }
    }

    return {
      processed: events.length,
      succeeded,
      failed,
    };
  }

  /**
   * Reconciles recent leads by querying Meta Lead Forms directly via Graph API.
   */
  async reconcileRecentLeads(): Promise<{
    totalSynced: number;
    pagesChecked: number;
    errors: string[];
  }> {
    const integration = await this.metaIntegrationModel.findOne({
      status: 'CONNECTED',
    });

    const pagesToSync: Array<{ pageId: string; pageName: string; token: string }> =
      [];

    if (integration && integration.pages && integration.pages.length > 0) {
      for (const page of integration.pages) {
        try {
          const pageToken = decryptToken(
            page.pageAccessTokenEncrypted,
            page.pageAccessTokenIv,
            page.pageAccessTokenTag,
          );
          if (pageToken) {
            pagesToSync.push({
              pageId: page.pageId,
              pageName: page.pageName,
              token: pageToken,
            });
          }
        } catch (err: any) {
          this.logger.warn(
            `Token decrypt error for page ${page.pageId}: ${err.message}`,
          );
        }
      }
    }

    if (process.env.META_PAGE_ACCESS_TOKEN && process.env.META_PAGE_ID) {
      const envPageId = process.env.META_PAGE_ID.trim();
      const envToken = process.env.META_PAGE_ACCESS_TOKEN.trim();
      const envPageName =
        process.env.META_PAGE_NAME?.trim() || 'Default Connected Page';

      if (!pagesToSync.some((p) => p.pageId === envPageId)) {
        pagesToSync.push({
          pageId: envPageId,
          pageName: envPageName,
          token: envToken,
        });
      }
    }

    if (pagesToSync.length === 0) {
      return {
        totalSynced: 0,
        pagesChecked: 0,
        errors: ['No active Meta integration or tokens connected.'],
      };
    }

    let totalSynced = 0;
    const errors: string[] = [];

    for (const page of pagesToSync) {
      try {
        const pageToken = page.token;
        const forms = await this.metaService.fetchPageLeadForms(
          page.pageId,
          pageToken,
        );

        for (const form of forms) {
          try {
            const formLeads = await this.metaService.fetchFormLeads(
              form.id,
              pageToken,
              25,
            );
            for (const mLead of formLeads) {
              const exists = await this.leadModel.findOne({
                externalLeadId: mLead.id,
              });
              if (!exists) {
                const normalized = this.metaService.normalizeMetaLead(mLead, {
                  pageId: page.pageId,
                  pageName: page.pageName,
                  formName: form.name,
                });

                const newLead = await this.leadModel.create(normalized);
                totalSynced += 1;

                if (newLead.email) {
                  this.emailService
                    .sendLeadConfirmationEmail({
                      email: newLead.email,
                      name: newLead.fullName,
                      service: newLead.campaignName || 'Meta Lead Ad',
                      source:
                        newLead.source === 'INSTAGRAM'
                          ? 'Instagram Lead Ad'
                          : 'Facebook Lead Ad',
                    })
                    .catch((e) =>
                      this.logger.warn('Reconcile email error: ' + e.message),
                    );
                }

                this.emailService
                  .sendMetaLeadNotificationEmail({
                    leadId: (newLead._id as any).toString(),
                    source: newLead.source,
                    fullName: newLead.fullName,
                    email: newLead.email,
                    phone: newLead.phone,
                    company: newLead.company,
                    pageName: newLead.pageName,
                    formName: newLead.formName,
                    campaignName: newLead.campaignName,
                    adName: newLead.adName,
                    fieldData: newLead.fieldData,
                  })
                  .catch((e) =>
                    this.logger.warn('Reconcile admin email error: ' + e.message),
                  );
              }
            }
          } catch (formErr: any) {
            errors.push(`Form ${form.id} sync error: ${formErr.message}`);
          }
        }

        if (integration) {
          const dbPage = integration.pages.find((p) => p.pageId === page.pageId);
          if (dbPage) dbPage.lastSyncAt = new Date();
        }
      } catch (pageErr: any) {
        errors.push(`Page ${page.pageId} error: ${pageErr.message}`);
      }
    }

    if (integration) {
      integration.lastSyncAt = new Date();
      await integration.save();
    }

    return {
      totalSynced,
      pagesChecked: pagesToSync.length,
      errors,
    };
  }

  /**
   * Executes a single synchronized cycle of Meta Lead Ads sync.
   */
  async executeMetaSyncCycle(): Promise<{
    success: boolean;
    jobs: any;
    reconciliation: any;
    durationMs: number;
    timestamp: string;
  }> {
    if (this.isSyncing) {
      this.logger.log('Sync already in progress, skipping duplicate cycle.');
      return {
        success: true,
        jobs: { skipped: true, reason: 'Already running' },
        reconciliation: { skipped: true },
        durationMs: 0,
        timestamp: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    this.isSyncing = true;
    this.lastRunAt = new Date();

    try {
      // 1. Process pending and retryable webhook events
      const jobs = await this.processPendingWebhookEvents(50);

      // 2. Direct Graph API reconciliation for connected pages and forms
      const reconciliation = await this.reconcileRecentLeads();

      const durationMs = Date.now() - startTime;
      this.lastResult = { jobs, reconciliation, durationMs };
      this.lastError = null;
      this.nextRunAt = new Date(
        Date.now() + this.intervalMinutes * 60 * 1000,
      );

      this.logger.log(
        `✅ Meta sync cycle completed in ${durationMs}ms: ` +
          `${reconciliation.totalSynced || 0} leads synced across ${reconciliation.pagesChecked || 0} page(s).`,
      );

      return {
        success: true,
        jobs,
        reconciliation,
        durationMs,
        timestamp: this.lastRunAt.toISOString(),
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      this.lastError = error.message || 'Unknown sync error';
      this.logger.error('Error during Meta sync cycle: ' + error.message);

      return {
        success: false,
        jobs: null,
        reconciliation: null,
        durationMs,
        timestamp: this.lastRunAt.toISOString(),
      };
    } finally {
      this.isSyncing = false;
    }
  }

  getSchedulerStatus(): MetaSyncStatus {
    return {
      isRunning: true,
      isSyncing: this.isSyncing,
      intervalMinutes: this.intervalMinutes,
      lastRunAt: this.lastRunAt ? this.lastRunAt.toISOString() : null,
      nextRunAt: this.nextRunAt ? this.nextRunAt.toISOString() : null,
      lastResult: this.lastResult,
      lastError: this.lastError,
    };
  }
}
