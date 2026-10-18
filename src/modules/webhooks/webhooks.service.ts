import {
  Injectable,
  Logger,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import crypto from 'crypto';
import {
  MetaIntegration,
  MetaIntegrationDocument,
} from '../../database/schemas/meta-integration.schema.js';
import {
  MetaWebhookEvent,
  MetaWebhookEventDocument,
} from '../../database/schemas/meta-webhook-event.schema.js';
import {
  EmailOutbox,
  EmailOutboxDocument,
} from '../../database/schemas/email-outbox.schema.js';
import { MetaService } from '../meta/meta.service.js';
import { MetaSyncService } from '../meta/meta-sync.service.js';
import { EmailService } from '../email/email.service.js';
import { verifyMetaSignature } from '../../common/utils/signature.util.js';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectModel(MetaIntegration.name)
    private metaIntegrationModel: Model<MetaIntegrationDocument>,
    @InjectModel(MetaWebhookEvent.name)
    private metaWebhookEventModel: Model<MetaWebhookEventDocument>,
    @InjectModel(EmailOutbox.name)
    private emailOutboxModel: Model<EmailOutboxDocument>,
    private metaService: MetaService,
    private metaSyncService: MetaSyncService,
    private emailService: EmailService,
  ) {}

  // ==========================================
  // META WEBHOOKS
  // ==========================================

  verifyMetaWebhookHandshake(
    mode?: string,
    token?: string,
    challenge?: string,
    ip = 'unknown',
  ): string {
    const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (!expectedToken) {
      this.logger.error(
        'Server Error: META_WEBHOOK_VERIFY_TOKEN is not configured in .env',
      );
      throw new ForbiddenException('Webhook verification token not configured on server.');
    }

    if (mode === 'subscribe' && token === expectedToken) {
      this.logger.log(`Meta Webhook Verification SUCCESS from ${ip}. Returning challenge.`);
      return challenge || '';
    }

    this.logger.warn(
      `Meta Webhook Verification FAILED from ${ip}: Token mismatch or mode '${mode}' != 'subscribe'.`,
    );
    throw new ForbiddenException('Forbidden: Invalid verification token.');
  }

  async handleMetaWebhookEvent(
    rawBody: string | Buffer,
    signatureHeader?: string,
    parsedPayload?: any,
  ) {
    const startTime = Date.now();
    const appSecret = process.env.META_APP_SECRET;

    if (appSecret) {
      const isValid = verifyMetaSignature(rawBody, signatureHeader, appSecret);
      if (!isValid) {
        this.logger.warn('Meta Webhook Signature verification FAILED. Rejecting with 401.');
        throw new UnauthorizedException('Invalid webhook signature.');
      }
    } else {
      this.logger.warn('META_APP_SECRET is not configured. Signature verification was skipped.');
    }

    let payload = parsedPayload;
    if (!payload) {
      try {
        const text = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
        payload = JSON.parse(text);
      } catch {
        throw new BadRequestException('Malformed JSON payload.');
      }
    }

    if (payload.object !== 'page') {
      return { message: 'Ignored non-page object.' };
    }

    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    const processedEvents = [];

    for (const entry of entries) {
      const pageId = entry.id;
      const changes = Array.isArray(entry.changes) ? entry.changes : [];

      for (const change of changes) {
        if (change.field === 'leadgen') {
          const value = change.value || {};
          const leadgenId = value.leadgen_id;
          const formId = value.form_id;
          const adId = value.ad_id;

          if (!leadgenId) continue;

          const eventId = `meta_lead_${leadgenId}`;
          let webhookEvent = await this.metaWebhookEventModel.findOne({ eventId });

          if (webhookEvent && webhookEvent.status === 'COMPLETED') {
            this.logger.log(`Lead ID ${leadgenId} was already COMPLETED (deduplicated).`);
            continue;
          }

          if (!webhookEvent) {
            webhookEvent = await this.metaWebhookEventModel.create({
              eventId,
              externalLeadId: leadgenId,
              pageId: pageId || value.page_id,
              formId,
              adId,
              status: 'PENDING',
              payload: change,
              receivedAt: new Date(),
            });
          }

          const isAuthorizedPage = await this.metaIntegrationModel.exists({
            status: 'CONNECTED',
            'pages.pageId': pageId,
          });

          if (!isAuthorizedPage) {
            this.logger.warn(
              `Warning: Lead for unauthorized Page ID ${pageId}. Recording event for audit.`,
            );
          }

          try {
            webhookEvent.status = 'PROCESSING';
            webhookEvent.attempts += 1;
            await webhookEvent.save();

            const processResult = await this.metaService.processAndSaveLead(
              leadgenId,
              pageId,
              formId,
            );

            if (processResult.success) {
              webhookEvent.status = 'COMPLETED';
              webhookEvent.processedAt = new Date();
              webhookEvent.lastError = '';
              await webhookEvent.save();
              processedEvents.push({ leadgenId, status: 'COMPLETED' });
            } else {
              webhookEvent.status = 'FAILED';
              webhookEvent.lastError = processResult.error || 'Unknown error';
              webhookEvent.nextRetryAt = new Date(Date.now() + 60 * 1000);
              await webhookEvent.save();
              processedEvents.push({
                leadgenId,
                status: 'FAILED',
                error: processResult.error,
              });
            }
          } catch (leadErr: any) {
            webhookEvent.status = 'FAILED';
            webhookEvent.lastError = leadErr.message;
            webhookEvent.nextRetryAt = new Date(Date.now() + 60 * 1000);
            await webhookEvent.save();
            processedEvents.push({
              leadgenId,
              status: 'FAILED',
              error: leadErr.message,
            });
          }
        }
      }
    }

    if (processedEvents.some((e) => e.status === 'COMPLETED')) {
      Promise.all([
        this.metaSyncService.reconcileRecentLeads(),
        this.metaSyncService.processPendingWebhookEvents(10),
      ]).catch((syncErr) => {
        this.logger.warn('Backend auto-sync background task warning:', syncErr);
      });
    }

    const durationMs = Date.now() - startTime;
    return {
      success: true,
      processedCount: processedEvents.length,
      events: processedEvents,
      durationMs,
    };
  }

  // ==========================================
  // RESEND WEBHOOKS
  // ==========================================

  async handleResendWebhookEvent(
    rawBody: string | Buffer,
    svixId?: string,
    svixTimestamp?: string,
    svixSignature?: string,
    parsedPayload?: any,
  ) {
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');

    if (webhookSecret && svixSignature) {
      const signedPayload = `${svixId}.${svixTimestamp}.${bodyStr}`;
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret.replace(/^whsec_/, ''))
        .update(signedPayload)
        .digest('base64');

      const passed = svixSignature.includes(expectedSignature);
      if (!passed) {
        this.logger.warn('Invalid Resend webhook signature detected.');
        throw new UnauthorizedException('Invalid signature');
      }
    }

    let payload = parsedPayload;
    if (!payload) {
      try {
        payload = JSON.parse(bodyStr);
      } catch {
        throw new BadRequestException('Malformed JSON payload');
      }
    }

    const eventType = payload.type;
    const emailId = payload.data?.email_id || payload.data?.id;

    if (!emailId) {
      return { message: 'No email ID in payload, acknowledged.' };
    }

    const job = await this.emailOutboxModel.findOne({ providerMessageId: emailId });
    if (!job) {
      return { message: 'Job not tracked, acknowledged.' };
    }

    if (eventType === 'email.delivered') {
      job.status = 'DELIVERED';
      await job.save();
    } else if (eventType === 'email.bounced') {
      job.status = 'BOUNCED';
      job.lastError = payload.data?.bounce_reason || 'Email bounced';
      await job.save();

      this.emailService
        .sendIntegrationAlertEmail({
          type: 'DELIVERY_FAILURE',
          subject: `Email Bounced for ${job.recipient}`,
          message: `An outgoing email (${job.type}) bounced: ${job.lastError}`,
          details: { jobId: job.jobId, recipient: job.recipient, reason: job.lastError },
        })
        .catch(() => {});
    } else if (eventType === 'email.complained') {
      job.status = 'FAILED';
      job.lastError = 'Recipient marked email as spam / complaint.';
      await job.save();
    }

    return { success: true, event: eventType, emailId };
  }
}
