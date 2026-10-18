import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Resend } from 'resend';
import crypto from 'crypto';
import {
  EmailIntegration,
  EmailIntegrationDocument,
} from '../../database/schemas/email-integration.schema.js';
import {
  EmailOutbox,
  EmailOutboxDocument,
  OutboxJobType,
} from '../../database/schemas/email-outbox.schema.js';
import { decryptToken } from '../../common/utils/encryption.util.js';

export interface ActiveEmailCredentials {
  apiKey: string;
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  isDbConfigured: boolean;
  status: string;
  notificationRecipients?: string[];
}

export interface EnqueueEmailParams {
  type: OutboxJobType;
  recipient: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  replyTo?: string;
  leadId?: any;
  metadata?: Record<string, any>;
  idempotencyKey?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private clientCache = new Map<string, Resend>();
  private lastAlertTimestamp = new Map<string, number>();
  private readonly ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown for loop alerts

  constructor(
    @InjectModel(EmailIntegration.name)
    private emailIntegrationModel: Model<EmailIntegrationDocument>,
    @InjectModel(EmailOutbox.name)
    private emailOutboxModel: Model<EmailOutboxDocument>,
  ) {}

  /**
   * Loads active email credentials from MongoDB with graceful fallback to environment variables.
   * Never exposes credentials to logs or frontend.
   */
  async getActiveEmailCredentials(): Promise<ActiveEmailCredentials> {
    const integration = await this.emailIntegrationModel.findOne({
      organizationId: 'stackfyra-org',
    });

    let apiKey = '';
    let senderName = 'Stackfyra';
    let senderEmail =
      process.env.EMAIL_FROM ||
      process.env.RESEND_FROM_EMAIL ||
      'noreply@stackfyra.com';
    let replyToEmail = process.env.EMAIL_REPLY_TO || 'info@stackfyra.com';
    let isDbConfigured = false;
    let status = 'CONFIGURED';
    let notificationRecipients: string[] = [
      process.env.RESEND_TO_EMAIL || 'info@stackfyra.com',
    ];

    if (integration) {
      status = integration.status;
      senderName = integration.senderName || senderName;
      if (integration.senderEmail) senderEmail = integration.senderEmail;
      if (integration.replyToEmail) replyToEmail = integration.replyToEmail;
      if (
        integration.notificationRecipients &&
        integration.notificationRecipients.length > 0
      ) {
        notificationRecipients = integration.notificationRecipients;
      }

      // Auto-heal false AUTHENTICATION_ERROR caused by domain listing restriction on sending-only keys
      if (
        status === 'AUTHENTICATION_ERROR' &&
        integration.lastError?.toLowerCase().includes('restricted to only send')
      ) {
        status = 'VERIFIED';
        this.emailIntegrationModel
          .updateOne(
            { organizationId: 'stackfyra-org' },
            { $set: { status: 'VERIFIED', lastError: '', lastErrorCode: '' } },
          )
          .catch(() => {});
      }

      if (
        integration.apiKeyEncrypted &&
        integration.apiKeyIv &&
        integration.apiKeyTag
      ) {
        try {
          apiKey = decryptToken(
            integration.apiKeyEncrypted,
            integration.apiKeyIv,
            integration.apiKeyTag,
            'email',
          );
          isDbConfigured = !!apiKey;
        } catch (err: any) {
          this.logger.error(
            'Failed to decrypt Email Integration API key: ' + err.message,
          );
        }
      }
    }

    // Fallback to environment variables if not configured in MongoDB
    if (!apiKey) {
      apiKey = process.env.RESEND_API_KEY || '';
      senderEmail = process.env.EMAIL_FROM || senderEmail;
      replyToEmail = process.env.EMAIL_REPLY_TO || replyToEmail;
    }

    return {
      apiKey: apiKey.trim(),
      senderName,
      senderEmail: senderEmail.trim(),
      replyToEmail: replyToEmail.trim(),
      isDbConfigured,
      status,
      notificationRecipients,
    };
  }

  /**
   * Returns a singleton or cached Resend client instance for an API key.
   */
  getResendClient(apiKey: string): Resend {
    const hash = crypto.createHash('sha256').update(apiKey).digest('hex');
    let client = this.clientCache.get(hash);
    if (!client) {
      client = new Resend(apiKey);
      this.clientCache.set(hash, client);
    }
    return client;
  }

  /**
   * Validates an API key with Resend's API and fetches domain verification info.
   */
  async verifyResendCredentials(apiKey: string): Promise<{
    valid: boolean;
    error?: string;
    errorCode?: string;
    domains?: Array<{
      id: string;
      name: string;
      status: string;
      records?: Array<{
        record: string;
        name: string;
        type: string;
        value: string;
        status: string;
        priority?: number;
      }>;
    }>;
  }> {
    if (!apiKey || !apiKey.trim()) {
      return { valid: false, error: 'API key is required.' };
    }

    try {
      const resend = this.getResendClient(apiKey.trim());
      const domainsResponse = await resend.domains.list();

      if (domainsResponse.error) {
        const errorMsg =
          domainsResponse.error.message || 'Invalid Resend API Key';
        // Sending-only keys are valid for sending emails even if listing domains is restricted
        if (
          errorMsg.toLowerCase().includes('restricted to only send') ||
          errorMsg.toLowerCase().includes('restricted to send') ||
          domainsResponse.error.name === 'restricted_api_key' ||
          (domainsResponse.error as any)?.statusCode === 403
        ) {
          return {
            valid: true,
            domains: [],
          };
        }

        return {
          valid: false,
          error: errorMsg,
          errorCode: String(
            domainsResponse.error.name || 'AUTHENTICATION_ERROR',
          ),
        };
      }

      const domainList = domainsResponse.data?.data || [];
      const formattedDomains = domainList.map((d: any) => ({
        id: d.id,
        name: d.name,
        status: d.status || 'not_started',
        records: Array.isArray(d.records)
          ? d.records.map((r: any) => ({
              record: r.record || '',
              name: r.name || '',
              type: r.type || '',
              value: r.value || '',
              status: r.status || 'pending',
              priority: r.priority,
            }))
          : [],
      }));

      return {
        valid: true,
        domains: formattedDomains,
      };
    } catch (err: any) {
      return {
        valid: false,
        error: err.message || 'Failed to communicate with Resend API.',
        errorCode: 'CONNECTION_ERROR',
      };
    }
  }

  /**
   * Checks whether an alert type is allowed under loop-prevention rules.
   */
  private shouldAllowAlertDispatch(type: OutboxJobType): boolean {
    if (
      type !== 'EMAIL_AUTH_FAILURE' &&
      type !== 'DELIVERY_FAILURE' &&
      type !== 'TOKEN_EXPIRY_WARNING'
    ) {
      return true;
    }
    const now = Date.now();
    const lastTime = this.lastAlertTimestamp.get(type) || 0;
    if (now - lastTime < this.ALERT_COOLDOWN_MS) {
      return false; // Suppress repeated loop alert
    }
    this.lastAlertTimestamp.set(type, now);
    return true;
  }

  /**
   * Checks whether the admin has enabled notifications for this specific type.
   */
  private async isNotificationRuleEnabled(
    type: OutboxJobType,
  ): Promise<boolean> {
    try {
      const integration = await this.emailIntegrationModel.findOne({
        organizationId: 'stackfyra-org',
      });
      if (!integration || !integration.notificationRules) return true;

      const r = integration.notificationRules as any;
      switch (type) {
        case 'NEW_WEBSITE_LEAD':
          return r.newWebsiteLead !== false;
        case 'NEW_META_LEAD':
          return r.newMetaLead !== false;
        case 'CONTACT_FORM':
          return r.contactForm !== false;
        case 'TOKEN_EXPIRY_WARNING':
          return r.tokenExpiryWarning !== false;
        case 'META_AUTH_FAILURE':
          return r.metaAuthFailure !== false;
        case 'EMAIL_AUTH_FAILURE':
          return r.emailAuthFailure !== false;
        case 'DELIVERY_FAILURE':
          return r.deliveryFailure !== false;
        default:
          return true;
      }
    } catch {
      return true;
    }
  }

  /**
   * Enqueues an email into the MongoDB Outbox and attempts immediate dispatch.
   * Lead creation will NEVER fail if email dispatch throws.
   */
  async enqueueEmail(params: EnqueueEmailParams): Promise<{
    jobId: string;
    status: string;
    immediateSuccess: boolean;
  }> {
    // 1. Loop prevention check
    if (!this.shouldAllowAlertDispatch(params.type)) {
      return {
        jobId: 'suppressed_by_loop_prevention',
        status: 'SKIPPED_LOOP_PREVENTION',
        immediateSuccess: true,
      };
    }

    // 2. Notification rule check
    const isEnabled = await this.isNotificationRuleEnabled(params.type);
    if (!isEnabled) {
      return {
        jobId: 'disabled_by_notification_rules',
        status: 'SKIPPED_RULE_DISABLED',
        immediateSuccess: true,
      };
    }

    // 3. Generate stable idempotency key if not provided
    const idempotencyKey =
      params.idempotencyKey ||
      crypto
        .createHash('sha256')
        .update(
          `${params.type}:${params.recipient}:${params.subject}:${Date.now()}`,
        )
        .digest('hex');

    // Check if job already exists (idempotent deduplication)
    let existingJob = await this.emailOutboxModel.findOne({ idempotencyKey });
    if (existingJob) {
      if (existingJob.status === 'SENT' || existingJob.status === 'DELIVERED') {
        return {
          jobId: existingJob.jobId,
          status: existingJob.status,
          immediateSuccess: true,
        };
      }
    }

    const jobId = existingJob
      ? existingJob.jobId
      : `email_job_${crypto.randomBytes(12).toString('hex')}`;

    if (!existingJob) {
      existingJob = await this.emailOutboxModel.create({
        jobId,
        idempotencyKey,
        recipient: params.recipient.trim(),
        replyTo: params.replyTo || '',
        type: params.type,
        subject: params.subject,
        htmlContent: params.htmlContent,
        textContent: params.textContent,
        provider: 'resend',
        status: 'QUEUED',
        retryCount: 0,
        maxRetries: 5,
        nextRetryAt: new Date(),
        leadId: params.leadId || null,
        metadata: params.metadata || {},
      });
    }

    // 4. Attempt immediate execution
    try {
      const processResult = await this.processOutboxJob(existingJob);
      return {
        jobId,
        status: processResult.status,
        immediateSuccess: processResult.success,
      };
    } catch (err: any) {
      this.logger.warn(
        `Immediate dispatch for job ${jobId} deferred to outbox queue: ${err.message}`,
      );
      return {
        jobId,
        status: 'QUEUED',
        immediateSuccess: false,
      };
    }
  }

  /**
   * Processes a single outbox job via Resend.
   * Tracks statuses: QUEUED, SENDING, SENT, FAILED.
   */
  async processOutboxJob(job: EmailOutboxDocument): Promise<{
    success: boolean;
    status: string;
    messageId?: string;
    error?: string;
  }> {
    const creds = await this.getActiveEmailCredentials();

    // 1. Detect if apiKey is a placeholder or not provided (graceful simulation mode)
    const isPlaceholderKey =
      !creds.apiKey ||
      creds.apiKey.includes('example') ||
      creds.apiKey === 're_123456789_example_key' ||
      creds.apiKey === 're_123456789_placeholder_key';

    if (isPlaceholderKey) {
      this.logger.warn(
        `[EMAIL OUTBOX] Placeholder or missing Resend API key (${creds.apiKey || 'NONE'}). Email dispatched in simulation mode.`,
      );
      this.logger.log(`  Type: ${job.type}`);
      this.logger.log(`  To: ${job.recipient}`);
      this.logger.log(`  Subject: ${job.subject}`);

      job.status = 'SENT';
      job.providerMessageId = `sim_${Date.now()}`;
      job.lastError = '';
      job.lastErrorCode = '';
      await job.save();
      return { success: true, status: 'SENT', messageId: job.providerMessageId };
    }

    job.status = 'SENDING';
    await job.save();

    try {
      const resend = this.getResendClient(creds.apiKey);
      const fromAddress = creds.senderName
        ? `${creds.senderName} <${creds.senderEmail}>`
        : creds.senderEmail;

      const emailPayload: any = {
        from: fromAddress,
        to: [job.recipient],
        subject: job.subject,
        html: job.htmlContent,
        text: job.textContent,
      };

      if (job.replyTo && job.replyTo.trim()) {
        emailPayload.reply_to = job.replyTo.trim();
      } else if (creds.replyToEmail && creds.replyToEmail.trim()) {
        emailPayload.reply_to = creds.replyToEmail.trim();
      }

      const { data, error } = await resend.emails.send(emailPayload);

      if (error) {
        const errorMsg = error.message || 'Provider returned error';
        const isAuthError =
          error.name === 'validation_error' &&
          errorMsg.toLowerCase().includes('api key') &&
          !errorMsg.toLowerCase().includes('restricted to only send');

        if (isAuthError) {
          job.status = 'FAILED';
          job.lastError = errorMsg;
          job.lastErrorCode = 'AUTHENTICATION_ERROR';
          await job.save();

          await this.emailIntegrationModel.updateOne(
            { organizationId: 'stackfyra-org' },
            {
              $set: {
                status: 'AUTHENTICATION_ERROR',
                lastError: errorMsg,
                lastErrorCode: 'AUTHENTICATION_ERROR',
              },
            },
          );

          return { success: false, status: 'FAILED', error: errorMsg };
        }

        const isInvalidRecipient =
          errorMsg.toLowerCase().includes('invalid recipient') ||
          errorMsg.toLowerCase().includes('domain not found') ||
          errorMsg.toLowerCase().includes('mailbox does not exist');

        if (isInvalidRecipient || job.retryCount >= job.maxRetries) {
          job.status = 'FAILED';
          job.lastError = errorMsg;
          job.lastErrorCode = 'RECIPIENT_OR_MAX_RETRIES_ERROR';
          await job.save();
          return { success: false, status: 'FAILED', error: errorMsg };
        }

        job.retryCount += 1;
        const backoffSeconds = Math.min(3600, 30 * Math.pow(2, job.retryCount));
        job.nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
        job.status = 'QUEUED';
        job.lastError = errorMsg;
        job.lastErrorCode = 'TEMPORARY_FAILURE';
        await job.save();

        return { success: false, status: 'QUEUED', error: errorMsg };
      }

      const providerMessageId = data?.id || '';
      job.status = 'SENT';
      job.providerMessageId = providerMessageId;
      job.lastError = '';
      job.lastErrorCode = '';
      await job.save();

      await this.emailIntegrationModel
        .updateOne(
          { organizationId: 'stackfyra-org' },
          {
            $set: {
              status: 'VERIFIED',
              lastSuccessfulSendAt: new Date(),
              lastError: '',
              lastErrorCode: '',
            },
          },
        )
        .catch(() => {});

      return {
        success: true,
        status: 'SENT',
        messageId: providerMessageId,
      };
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to dispatch email.';
      job.retryCount += 1;
      if (job.retryCount >= job.maxRetries) {
        job.status = 'FAILED';
        job.lastError = errorMsg;
        job.lastErrorCode = 'MAX_RETRIES_EXCEEDED';
      } else {
        const backoffSeconds = Math.min(3600, 30 * Math.pow(2, job.retryCount));
        job.nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
        job.status = 'QUEUED';
        job.lastError = errorMsg;
        job.lastErrorCode = 'DISPATCH_EXCEPTION';
      }
      await job.save();

      return { success: false, status: job.status, error: errorMsg };
    }
  }

  /**
   * Retries eligible queued and failed email outbox jobs.
   */
  async retryEligibleOutboxJobs(limit = 20): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    const eligibleJobs = await this.emailOutboxModel
      .find({
        status: { $in: ['QUEUED', 'FAILED'] },
        nextRetryAt: { $lte: new Date() },
      })
      .sort({ nextRetryAt: 1 })
      .limit(limit);

    let succeeded = 0;
    let failed = 0;

    for (const job of eligibleJobs) {
      const res = await this.processOutboxJob(job);
      if (res.success) succeeded++;
      else failed++;
    }

    return {
      processed: eligibleJobs.length,
      succeeded,
      failed,
    };
  }

  // --- HTML Rendering Components & Templates ---

  private escapeHtml(value?: string): string {
    if (!value) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private renderEmailHeader(badgeLabel?: string, badgeColor = '#F78105'): string {
    const siteUrl = process.env.SITE_URL || 'https://www.stackfyra.com';
    const logoUrl = `${siteUrl}/favicon/apple-touch-icon.png`;

    const badgeHtml = badgeLabel
      ? `<span style="display: inline-block; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 4px 10px; border-radius: 9999px; background: rgba(255, 255, 255, 0.08); color: ${badgeColor}; border: 1px solid ${badgeColor}33;">${this.escapeHtml(
          badgeLabel,
        )}</span>`
      : '';

    return `
      <div style="background: linear-gradient(135deg, #0b1120 0%, #17273e 100%); padding: 22px 28px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
        <table cellpadding="0" cellspacing="0" border="0" style="width: 100%;">
          <tr>
            <td style="vertical-align: middle; width: 44px;">
              <a href="${siteUrl}" style="text-decoration: none; display: block;">
                <img src="${logoUrl}" alt="Stackfyra" width="40" height="40" style="display: block; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 4px 12px rgba(247, 129, 5, 0.3);" />
              </a>
            </td>
            <td style="vertical-align: middle; padding-left: 14px;">
              <div style="font-size: 19px; font-weight: 800; color: #ffffff; letter-spacing: 1.2px; line-height: 1.2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                STACK<span style="color: #F78105;">FYRA</span>
              </div>
              <div style="font-size: 11px; color: #94a3b8; font-weight: 500; letter-spacing: 0.6px; text-transform: uppercase; margin-top: 2px;">
                Software Development &bull; Engineering Squad
              </div>
            </td>
            <td style="vertical-align: middle; text-align: right;">
              ${badgeHtml}
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  private renderEmailFooter(note?: string): string {
    const siteUrl = process.env.SITE_URL || 'https://www.stackfyra.com';
    const noteHtml = note
      ? `<div style="margin-bottom: 12px; color: #64748b; font-size: 11px; line-height: 1.5;">${this.escapeHtml(
          note,
        )}</div>`
      : '';

    return `
      <div style="background: #080c14; padding: 22px 28px; border-top: 1px solid rgba(255, 255, 255, 0.08); font-size: 12px; color: #64748b; text-align: center;">
        ${noteHtml}
        <div style="color: #cbd5e1; font-weight: 600; font-size: 12px;">Stackfyra &mdash; Elite Software Development Company</div>
        <div style="margin-top: 8px; font-size: 11px; color: #64748b;">
          <a href="${siteUrl}" style="color: #38bdf8; text-decoration: none; font-weight: 500;">stackfyra.com</a>
          &nbsp;&bull;&nbsp;
          <a href="mailto:info@stackfyra.com" style="color: #38bdf8; text-decoration: none; font-weight: 500;">info@stackfyra.com</a>
          &nbsp;&bull;&nbsp;
          <a href="https://wa.me/918368804441" style="color: #22c55e; text-decoration: none; font-weight: 500;">WhatsApp: +91 836 880 4441</a>
        </div>
        <div style="margin-top: 8px; font-size: 10px; color: #475569;">
          &copy; ${new Date().getFullYear()} Stackfyra. Turning Digital Dreams Into Reality.
        </div>
      </div>
    `;
  }

  /**
   * Sends a new lead notification email to squad administrators.
   */
  async sendLeadNotificationEmail(payload: any): Promise<boolean> {
    try {
      const creds = await this.getActiveEmailCredentials();
      const toEmail =
        creds.notificationRecipients?.[0] ||
        process.env.RESEND_TO_EMAIL ||
        'admin@stackfyra.com';

      const isConsultation = payload.type === 'book-consultation';
      const title = isConsultation
        ? 'New Consultation Booking Request'
        : 'New Website Project Inquiry';

      const rows = [
        ['Name', payload.name],
        ['Email', payload.email],
        ['Phone / WhatsApp', payload.phone],
        ['Company / Organization', payload.company],
        ['Country / Timezone', payload.country || payload.country_name],
        ['Project Type', payload.projectType],
        ['Budget Range', payload.budgetRange],
        ['Timeline', payload.timeline],
        ['Preferred Contact', payload.preferredContact],
        ['What are you looking to build?', payload.project],
        ['Message / Description', payload.message || payload.projectDescription],
        ['UTM Source', payload.utm_source],
        ['UTM Medium', payload.utm_medium],
        ['UTM Campaign', payload.utm_campaign],
      ].filter(([, value]) => typeof value === 'string' && value.trim() !== '');

      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #080c14; padding: 36px 16px; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #0d1322; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 18px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);">
            ${this.renderEmailHeader(isConsultation ? 'Consultation Request' : 'Project Inquiry', '#38bdf8')}
            <div style="padding: 32px 28px;">
              <h2 style="font-size: 20px; font-weight: 800; margin: 0 0 16px 0; color: #ffffff;">${title}</h2>
              <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse;">
                ${rows
                  .map(
                    ([label, val]) => `
                  <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
                    <td style="padding: 10px 0; font-size: 12px; color: #94a3b8; font-weight: 600; width: 35%; text-transform: uppercase;">${this.escapeHtml(
                      label,
                    )}</td>
                    <td style="padding: 10px 0; font-size: 13px; color: #ffffff; font-weight: 500;">${this.escapeHtml(
                      val,
                    )}</td>
                  </tr>
                `,
                  )
                  .join('')}
              </table>
            </div>
            ${this.renderEmailFooter('Stackfyra CRM & Inbound Pipeline Notification.')}
          </div>
        </div>
      `;

      const textContent =
        `${title}\n\n` + rows.map(([k, v]) => `${k}: ${v}`).join('\n');

      const enqueueResult = await this.enqueueEmail({
        type: isConsultation ? 'CONTACT_FORM' : 'NEW_WEBSITE_LEAD',
        recipient: toEmail,
        replyTo: payload.email,
        subject: `🚨 ${title}: ${payload.name || payload.company || payload.email}`,
        htmlContent,
        textContent,
        metadata: payload,
      });

      return (
        enqueueResult.immediateSuccess || enqueueResult.status === 'QUEUED'
      );
    } catch (error) {
      this.logger.error('Failed to enqueue lead notification email:', error);
      return false;
    }
  }

  /**
   * Sends a Meta Lead Ads notification email to admins with direct reply-to.
   */
  async sendMetaLeadNotificationEmail(lead: any): Promise<boolean> {
    try {
      const creds = await this.getActiveEmailCredentials();
      const toEmail =
        creds.notificationRecipients?.[0] ||
        process.env.RESEND_TO_EMAIL ||
        'info@stackfyra.com';

      const clientName = lead.fullName || lead.email || 'New Prospect';
      const isInstagram = lead.source === 'INSTAGRAM';
      const platformLabel = isInstagram
        ? 'Instagram Lead Ad'
        : 'Facebook Lead Ad';
      const title = `🚨 New ${platformLabel}: ${clientName}`;

      const fieldRows = (lead.fieldData || []).map((f: any) => [
        f.name.replace(/_/g, ' '),
        (f.values || []).join(', '),
      ]);

      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #080c14; padding: 36px 16px; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #0d1322; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 18px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);">
            ${this.renderEmailHeader(platformLabel, isInstagram ? '#E4405F' : '#1877F2')}
            <div style="padding: 32px 28px;">
              <h2 style="font-size: 20px; font-weight: 800; margin: 0 0 16px 0; color: #ffffff;">${title}</h2>
              <div style="background-color: #080c14; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px; margin-bottom: 20px;">
                <div style="font-size: 14px; font-weight: 700; color: #ffffff;">${this.escapeHtml(clientName)}</div>
                <div style="font-size: 13px; color: #38bdf8; margin-top: 4px;">${this.escapeHtml(lead.email || 'No email')}</div>
                ${lead.phone ? `<div style="font-size: 12px; color: #22c55e; margin-top: 2px;">${this.escapeHtml(lead.phone)}</div>` : ''}
              </div>
              ${
                fieldRows.length > 0
                  ? `<div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px;">Form Responses:</div>
                     <table cellpadding="0" cellspacing="0" border="0" style="width: 100%; border-collapse: collapse;">
                       ${fieldRows
                         .map(
                           ([q, a]: [string, string]) => `
                         <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
                           <td style="padding: 8px 0; font-size: 12px; color: #94a3b8; width: 40%; font-weight: 600;">${this.escapeHtml(
                             q,
                           )}</td>
                           <td style="padding: 8px 0; font-size: 12px; color: #ffffff;">${this.escapeHtml(
                             a,
                           )}</td>
                         </tr>
                       `,
                         )
                         .join('')}
                     </table>`
                  : ''
              }
            </div>
            ${this.renderEmailFooter("Direct reply-to configured. Hitting 'Reply' sends email straight to this prospect.")}
          </div>
        </div>
      `;

      const textContent = `${title}\n\nClient: ${clientName}\nEmail: ${lead.email}\nPhone: ${lead.phone}\nCampaign: ${lead.campaignName}`;

      const enqueueResult = await this.enqueueEmail({
        type: 'NEW_META_LEAD',
        recipient: toEmail,
        replyTo: lead.email,
        subject: title,
        htmlContent,
        textContent,
        metadata: lead,
      });

      return (
        enqueueResult.immediateSuccess || enqueueResult.status === 'QUEUED'
      );
    } catch (error) {
      this.logger.error('Failed to enqueue Meta lead notification email:', error);
      return false;
    }
  }

  /**
   * Sends a 6-digit OTP verification email for administrator password resets.
   */
  async sendOtpEmail(email: string, otp: string): Promise<boolean> {
    try {
      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #080c14; padding: 36px 16px; margin: 0;">
          <div style="max-width: 520px; margin: 0 auto; background-color: #0d1322; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 18px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);">
            ${this.renderEmailHeader('Security Verification', '#F78105')}
            <div style="padding: 32px 28px; text-align: center;">
              <h2 style="font-size: 22px; font-weight: 800; margin: 0 0 8px 0; color: #ffffff;">Password Reset Request</h2>
              <p style="color: #94a3b8; font-size: 14px; margin: 0 0 24px 0; line-height: 1.5;">
                Use the one-time verification code below to reset your Stackfyra account password. This code expires in <strong style="color: #f8fafc;">5 minutes</strong>.
              </p>
              <div style="margin: 20px auto 28px auto; background: #080c14; border: 2px solid #F78105; color: #ffffff; font-size: 34px; font-weight: 800; letter-spacing: 10px; padding: 18px 28px; border-radius: 14px; display: inline-block; font-family: monospace;">
                ${this.escapeHtml(otp)}
              </div>
              <div style="background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 14px; margin-top: 10px; text-align: left;">
                <div style="color: #f8fafc; font-size: 12px; font-weight: 600; margin-bottom: 4px;">🛡️ Security Notice</div>
                <div style="color: #64748b; font-size: 12px; line-height: 1.5;">
                  If you did not request this code, please ignore this email or notify security@stackfyra.com immediately.
                </div>
              </div>
            </div>
            ${this.renderEmailFooter('Stackfyra Security & Authentication Gatekeeper.')}
          </div>
        </div>
      `;

      const textContent = `Your Stackfyra Password Reset Code is: ${otp}\nThis code will expire in 5 minutes.`;

      const enqueueResult = await this.enqueueEmail({
        type: 'PASSWORD_RESET',
        recipient: email,
        subject: `${otp} is your Stackfyra Password Reset Code`,
        htmlContent,
        textContent,
      });

      return (
        enqueueResult.immediateSuccess || enqueueResult.status === 'QUEUED'
      );
    } catch (error) {
      this.logger.error('Failed to send OTP email:', error);
      return false;
    }
  }

  /**
   * Sends an automated confirmation email to a prospect after lead submission.
   */
  async sendLeadConfirmationEmail(params: {
    email: string;
    name?: string;
    service?: string;
    source?: string;
  }): Promise<boolean> {
    const recipientEmail = (params.email || '').trim().toLowerCase();
    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return false;
    }

    const clientName = params.name ? params.name.trim() : 'there';
    const sourceLabel = params.source || 'Stackfyra';
    const serviceLabel = params.service ? ` (${params.service})` : '';

    try {
      const creds = await this.getActiveEmailCredentials();
      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #080c14; padding: 36px 16px; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #0d1322; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 18px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);">
            ${this.renderEmailHeader('Inquiry Confirmed', '#22c55e')}
            <div style="background: linear-gradient(135deg, rgba(247, 129, 5, 0.18) 0%, rgba(56, 189, 248, 0.15) 100%); padding: 24px 28px; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
              <div style="color: #F78105; font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;">
                ✨ Project Inquiry Received
              </div>
              <div style="color: #ffffff; font-size: 22px; font-weight: 800; margin-top: 4px; line-height: 1.3;">
                We've Received Your Details!
              </div>
            </div>
            <div style="padding: 28px;">
              <p style="font-size: 15px; line-height: 1.6; color: #f8fafc; margin-top: 0;">
                Hi <strong style="color: #F78105;">${this.escapeHtml(clientName)}</strong>,
              </p>
              <p style="font-size: 14px; line-height: 1.6; color: #94a3b8; margin-bottom: 24px;">
                Thank you for getting in touch with Stackfyra! We have received your inquiry submitted via <strong style="color: #cbd5e1;">${this.escapeHtml(sourceLabel)}</strong>${this.escapeHtml(serviceLabel)}. Our engineering leads are already reviewing your specifications.
              </p>
              <p style="font-size: 13px; line-height: 1.6; color: #94a3b8;">
                We'll reach out within <strong>24 business hours</strong> with initial recommendations and schedule a discovery call.
              </p>
            </div>
            ${this.renderEmailFooter('Stackfyra Client Relations & Project Delivery.')}
          </div>
        </div>
      `;

      const textContent = `Hello ${clientName},\n\nThank you for getting in touch with Stackfyra! We've received your inquiry submitted via ${sourceLabel}${serviceLabel}. Our engineering leads will reach out within 24 business hours.\n\nBest regards,\nStackfyra Team`;

      const enqueueResult = await this.enqueueEmail({
        type: 'LEAD_CONFIRMATION',
        recipient: recipientEmail,
        replyTo: creds.replyToEmail || 'info@stackfyra.com',
        subject: `Thank you for contacting Stackfyra! We've received your inquiry`,
        htmlContent,
        textContent,
      });

      return (
        enqueueResult.immediateSuccess || enqueueResult.status === 'QUEUED'
      );
    } catch (err) {
      this.logger.error('Failed to enqueue lead confirmation email:', err);
      return false;
    }
  }

  /**
   * Sends an administrative alert for integration issues.
   */
  async sendIntegrationAlertEmail(params: {
    type:
      | 'TOKEN_EXPIRY_WARNING'
      | 'META_AUTH_FAILURE'
      | 'EMAIL_AUTH_FAILURE'
      | 'DELIVERY_FAILURE';
    subject: string;
    message: string;
    details?: Record<string, any>;
  }): Promise<boolean> {
    try {
      const siteUrl = process.env.SITE_URL || 'https://www.stackfyra.com';
      const toEmail = process.env.RESEND_TO_EMAIL || 'admin@stackfyra.com';

      const htmlContent = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #080c14; padding: 36px 16px; margin: 0;">
          <div style="max-width: 580px; margin: 0 auto; background-color: #0d1322; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 18px; overflow: hidden;">
            ${this.renderEmailHeader('Integration Alert', '#ef4444')}
            <div style="padding: 32px 28px;">
              <h2 style="font-size: 18px; font-weight: 800; color: #ef4444; margin: 0 0 12px 0;">${this.escapeHtml(params.subject)}</h2>
              <p style="color: #cbd5e1; font-size: 13px; line-height: 1.6; margin: 0 0 16px 0;">${this.escapeHtml(params.message)}</p>
              ${
                params.details
                  ? `<pre style="background: #080c14; padding: 12px; border-radius: 8px; color: #94a3b8; font-size: 11px; overflow-x: auto;">${this.escapeHtml(
                      JSON.stringify(params.details, null, 2),
                    )}</pre>`
                  : ''
              }
              <div style="margin-top: 20px;">
                <a href="${siteUrl}/admin" style="display: inline-block; background: #38bdf8; color: #080c14; font-weight: 700; font-size: 12px; padding: 10px 18px; border-radius: 8px; text-decoration: none;">
                  Open Stackfyra Admin Hub
                </a>
              </div>
            </div>
            ${this.renderEmailFooter('Automated health & security alert.')}
          </div>
        </div>
      `;

      const textContent = `${params.subject}\n\n${params.message}\n\nVisit ${siteUrl}/admin`;

      const enqueueResult = await this.enqueueEmail({
        type: params.type,
        recipient: toEmail,
        subject: `🚨 ${params.subject}`,
        htmlContent,
        textContent,
        metadata: params.details,
      });

      return (
        enqueueResult.immediateSuccess || enqueueResult.status === 'QUEUED'
      );
    } catch (err) {
      this.logger.error('Failed to send integration alert email:', err);
      return false;
    }
  }
}
