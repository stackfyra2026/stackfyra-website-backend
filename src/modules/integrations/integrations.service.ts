import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import {
  MetaIntegration,
  MetaIntegrationDocument,
} from '../../database/schemas/meta-integration.schema.js';
import {
  EmailIntegration,
  EmailIntegrationDocument,
} from '../../database/schemas/email-integration.schema.js';
import {
  EmailOutbox,
  EmailOutboxDocument,
} from '../../database/schemas/email-outbox.schema.js';
import { MetaService } from '../meta/meta.service.js';
import { EmailService } from '../email/email.service.js';
import {
  encryptToken,
  decryptToken,
  maskSecret,
} from '../../common/utils/encryption.util.js';
import { ConfigureEmailDto } from './dto/configure-email.dto.js';
import { SaveMetaTokenDto } from './dto/save-meta-token.dto.js';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    @InjectModel(MetaIntegration.name)
    private metaIntegrationModel: Model<MetaIntegrationDocument>,
    @InjectModel(EmailIntegration.name)
    private emailIntegrationModel: Model<EmailIntegrationDocument>,
    @InjectModel(EmailOutbox.name)
    private emailOutboxModel: Model<EmailOutboxDocument>,
    private metaService: MetaService,
    private emailService: EmailService,
  ) {}

  // ==========================================
  // META INTEGRATION METHODS
  // ==========================================

  async validateMetaToken() {
    const integration = await this.metaIntegrationModel.findOne({
      organizationId: 'stackfyra-org',
    });
    if (!integration || !integration.pages || integration.pages.length === 0) {
      throw new BadRequestException('No Meta Page is currently connected to validate.');
    }

    const page = integration.pages[0];
    const token = decryptToken(
      page.pageAccessTokenEncrypted,
      page.pageAccessTokenIv,
      page.pageAccessTokenTag,
      'meta',
    );

    if (!token) {
      throw new InternalServerErrorException('Stored Meta token could not be decrypted.');
    }

    const validation = await this.metaService.validateMetaTokenDetails(token, page.pageId);

    page.scopes = validation.scopes;
    page.missingScopes = validation.missingScopes;
    page.expiresAt = validation.expiresAt || undefined;
    page.dataAccessExpiresAt = validation.dataAccessExpiresAt || undefined;
    page.isNeverExpiring = validation.isNeverExpiring;
    page.tokenType = validation.tokenType;
    page.lastValidatedAt = new Date();

    integration.lastValidatedAt = new Date();

    if (!validation.isValid || validation.error) {
      integration.status = 'REAUTH_REQUIRED';
      integration.needsReauth = true;
      integration.reauthReason = validation.error || 'Meta token is no longer valid.';
      integration.lastError = integration.reauthReason;

      this.emailService
        .sendIntegrationAlertEmail({
          type: 'META_AUTH_FAILURE',
          subject: 'Meta Token Validation Failed — Reauthorization Required',
          message: `The connected Meta token for Page "${page.pageName}" (${page.pageId}) failed validation: ${integration.reauthReason}`,
          details: { pageId: page.pageId, pageName: page.pageName, error: validation.error },
        })
        .catch(() => {});
    } else if (validation.missingScopes.includes('leads_retrieval')) {
      integration.status = 'REAUTH_REQUIRED';
      integration.needsReauth = true;
      integration.reauthReason = "Token is missing mandatory 'leads_retrieval' permission.";
      integration.lastError = integration.reauthReason;

      this.emailService
        .sendIntegrationAlertEmail({
          type: 'META_AUTH_FAILURE',
          subject: 'Meta Permission Warning: leads_retrieval Missing',
          message: `The Meta token for Page "${page.pageName}" is missing the mandatory leads_retrieval scope required to ingest Lead Ads forms.`,
          details: { pageId: page.pageId, missingScopes: validation.missingScopes },
        })
        .catch(() => {});
    } else {
      integration.status = 'CONNECTED';
      integration.needsReauth = false;
      integration.reauthReason = '';
      integration.lastError = '';
      integration.lastErrorCode = '';
    }

    await integration.save();

    return {
      success: true,
      isValid: validation.isValid,
      status: integration.status,
      needsReauth: integration.needsReauth,
      reauthReason: integration.reauthReason,
      pageId: page.pageId,
      pageName: page.pageName,
      tokenType: validation.tokenType,
      isNeverExpiring: validation.isNeverExpiring,
      expiresAt: validation.expiresAt,
      scopes: validation.scopes,
      missingScopes: validation.missingScopes,
    };
  }

  async saveMetaToken(dto: SaveMetaTokenDto) {
    const trimmedToken = dto.token.trim();

    let integration = await this.metaIntegrationModel.findOne({
      organizationId: 'stackfyra-org',
    });
    if (!integration) {
      integration = new this.metaIntegrationModel({
        organizationId: 'stackfyra-org',
        pages: [],
      });
    }

    const hasActivePage =
      integration.status === 'CONNECTED' &&
      integration.pages &&
      integration.pages.length > 0;
    if (hasActivePage && !dto.confirmOverwrite) {
      throw new ConflictException({
        requireConfirmation: true,
        message:
          'A valid Meta integration is already active. Replacing it will overwrite existing access credentials. Please confirm.',
      });
    }

    const validation = await this.metaService.validateMetaTokenDetails(
      trimmedToken,
      dto.pageId,
    );
    if (!validation.isValid && validation.error) {
      throw new BadRequestException(
        `Meta Graph API Token Validation Error: ${validation.error}`,
      );
    }

    const finalPageId = dto.pageId?.trim() || validation.pageId || 'page';
    const finalPageName = dto.pageName?.trim() || validation.pageName || 'Facebook Page';

    let isSubscribed = false;
    try {
      isSubscribed = await this.metaService.subscribePageToLeadgen(
        finalPageId,
        trimmedToken,
      );
    } catch (subErr: any) {
      this.logger.warn(`Webhook subscription notice: ${subErr.message}`);
    }

    const enc = encryptToken(trimmedToken, 'meta');

    const pageEntry = {
      pageId: finalPageId,
      pageName: finalPageName,
      category: 'Connected Page',
      pageAccessTokenEncrypted: enc.encrypted,
      pageAccessTokenIv: enc.iv,
      pageAccessTokenTag: enc.tag,
      isSubscribed,
      selectedForms: [],
      tokenType: validation.tokenType,
      expiresAt: validation.expiresAt || undefined,
      dataAccessExpiresAt: validation.dataAccessExpiresAt || undefined,
      isNeverExpiring: validation.isNeverExpiring,
      scopes: validation.scopes,
      missingScopes: validation.missingScopes,
      lastValidatedAt: new Date(),
      lastSyncAt: new Date(),
    };

    const existingIndex = integration.pages.findIndex(
      (p) => p.pageId === finalPageId,
    );
    if (existingIndex >= 0) {
      integration.pages[existingIndex] = pageEntry as any;
    } else {
      integration.pages.push(pageEntry as any);
    }

    integration.appId = validation.appId || process.env.META_APP_ID || '';
    integration.status = validation.missingScopes.includes('leads_retrieval')
      ? 'REAUTH_REQUIRED'
      : 'CONNECTED';
    integration.needsReauth = validation.missingScopes.includes('leads_retrieval');
    integration.reauthReason = integration.needsReauth
      ? "Missing mandatory 'leads_retrieval' scope."
      : '';
    integration.lastValidatedAt = new Date();
    integration.lastSuccessfulUseAt = new Date();
    integration.lastError = '';
    integration.lastErrorCode = '';

    await integration.save();

    return {
      success: true,
      message: `Meta Page "${finalPageName}" connected successfully.`,
      status: integration.status,
      pageId: finalPageId,
      pageName: finalPageName,
      tokenType: validation.tokenType,
      isNeverExpiring: validation.isNeverExpiring,
      expiresAt: validation.expiresAt,
      scopes: validation.scopes,
      missingScopes: validation.missingScopes,
      isSubscribed,
    };
  }

  async getMetaStatus() {
    const integration = await this.metaIntegrationModel.findOne({
      organizationId: 'stackfyra-org',
    });

    if (!integration) {
      return {
        status: 'DISCONNECTED',
        appId: process.env.META_APP_ID || '',
        pages: [],
        needsReauth: false,
        reauthReason: '',
        lastValidatedAt: null,
        lastSuccessfulUseAt: null,
        lastSyncAt: null,
        lastError: '',
      };
    }

    const sanitizedPages = (integration.pages || []).map((p) => ({
      pageId: p.pageId,
      pageName: p.pageName,
      category: p.category || '',
      isSubscribed: !!p.isSubscribed,
      selectedForms: p.selectedForms || [],
      tokenType: p.tokenType || 'PAGE',
      expiresAt: p.expiresAt || null,
      dataAccessExpiresAt: p.dataAccessExpiresAt || null,
      isNeverExpiring: !!p.isNeverExpiring,
      scopes: p.scopes || [],
      missingScopes: p.missingScopes || [],
      lastValidatedAt: p.lastValidatedAt || null,
      lastSyncAt: p.lastSyncAt || null,
    }));

    return {
      status: integration.status,
      appId: integration.appId || process.env.META_APP_ID || '',
      needsReauth: !!integration.needsReauth,
      reauthReason: integration.reauthReason || '',
      lastValidatedAt: integration.lastValidatedAt || null,
      lastSuccessfulUseAt: integration.lastSuccessfulUseAt || null,
      lastSyncAt: integration.lastSyncAt || null,
      lastError: integration.lastError || '',
      lastErrorCode: integration.lastErrorCode || '',
      pages: sanitizedPages,
    };
  }

  async reauthorizeMeta(reason?: string, adminEmail?: string) {
    const reasonText = reason || 'Manual reauthorization requested by admin.';

    const integration = await this.metaIntegrationModel.findOne({
      organizationId: 'stackfyra-org',
    });
    if (!integration) {
      throw new NotFoundException('Meta integration not configured.');
    }

    integration.status = 'REAUTH_REQUIRED';
    integration.needsReauth = true;
    integration.reauthReason = reasonText;
    await integration.save();

    this.emailService
      .sendIntegrationAlertEmail({
        type: 'META_AUTH_FAILURE',
        subject: 'Action Required: Reauthorize Meta Lead Ads Connection',
        message: `Administrator ${adminEmail || 'Admin'} flagged the Meta integration for reauthorization: ${reasonText}`,
        details: { requestedBy: adminEmail, reason: reasonText },
      })
      .catch(() => {});

    return {
      success: true,
      message:
        'Meta integration flagged for reauthorization. Please configure a new Page Access Token.',
      status: 'REAUTH_REQUIRED',
    };
  }

  // ==========================================
  // EMAIL INTEGRATION METHODS
  // ==========================================

  async getEmailStatus() {
    const integration = await this.emailIntegrationModel.findOne({
      organizationId: 'stackfyra-org',
    });

    const [queued, sent, delivered, failed, total] = await Promise.all([
      this.emailOutboxModel.countDocuments({ status: 'QUEUED' }),
      this.emailOutboxModel.countDocuments({ status: 'SENT' }),
      this.emailOutboxModel.countDocuments({ status: 'DELIVERED' }),
      this.emailOutboxModel.countDocuments({ status: 'FAILED' }),
      this.emailOutboxModel.countDocuments(),
    ]);

    const envApiKey = process.env.RESEND_API_KEY || '';
    const maskedEnvKey = envApiKey ? maskSecret(envApiKey) : '';

    if (!integration) {
      return {
        provider: 'resend',
        senderName: 'Stackfyra',
        senderEmail: process.env.EMAIL_FROM || 'info@stackfyra.com',
        replyToEmail: process.env.EMAIL_REPLY_TO || 'info@stackfyra.com',
        maskedApiKey: maskedEnvKey,
        isConfigured: !!envApiKey,
        isDbStored: false,
        status: envApiKey ? 'CONFIGURED' : 'CONFIGURATION_ERROR',
        domainStatus: 'not_started',
        domainDnsRecords: [],
        notificationRecipients: ['info@stackfyra.com'],
        notificationRules: {
          newWebsiteLead: true,
          newMetaLead: true,
          contactForm: true,
          tokenExpiryWarning: true,
          metaAuthFailure: true,
          emailAuthFailure: true,
          deliveryFailure: true,
        },
        lastVerifiedAt: null,
        lastSuccessfulSendAt: null,
        lastError: '',
        outboxStats: { queued, sent, delivered, failed, total },
      };
    }

    return {
      provider: integration.provider,
      senderName: integration.senderName,
      senderEmail: integration.senderEmail,
      replyToEmail: integration.replyToEmail,
      maskedApiKey: integration.maskedApiKey || maskedEnvKey,
      isConfigured: !!integration.maskedApiKey || !!envApiKey,
      isDbStored: !!integration.maskedApiKey,
      status: integration.status,
      domainStatus: integration.domainStatus,
      domainDnsRecords: integration.domainDnsRecords || [],
      notificationRecipients: integration.notificationRecipients || [],
      notificationRules: integration.notificationRules || {},
      lastVerifiedAt: integration.lastVerifiedAt || null,
      lastSuccessfulSendAt: integration.lastSuccessfulSendAt || null,
      lastError: integration.lastError || '',
      lastErrorCode: integration.lastErrorCode || '',
      outboxStats: { queued, sent, delivered, failed, total },
    };
  }

  async configureEmail(dto: ConfigureEmailDto) {
    let integration = await this.emailIntegrationModel.findOne({
      organizationId: 'stackfyra-org',
    });
    if (!integration) {
      integration = new this.emailIntegrationModel({
        organizationId: 'stackfyra-org',
      });
    }

    const hasWorkingCredentials =
      integration.status === 'VERIFIED' && !!integration.apiKeyEncrypted;

    if (
      hasWorkingCredentials &&
      dto.apiKey &&
      dto.apiKey.trim() &&
      !dto.confirmOverwrite
    ) {
      throw new ConflictException({
        requireConfirmation: true,
        message:
          'A verified email integration is currently active. Overwriting credentials will replace your working API key. Please confirm.',
      });
    }

    if (dto.apiKey && dto.apiKey.trim()) {
      const cleanKey = dto.apiKey.trim();
      const verification = await this.emailService.verifyResendCredentials(cleanKey);

      if (!verification.valid) {
        throw new BadRequestException(
          `Resend API Key verification failed: ${verification.error || 'Invalid key'}`,
        );
      }

      const enc = encryptToken(cleanKey, 'email');
      integration.apiKeyEncrypted = enc.encrypted;
      integration.apiKeyIv = enc.iv;
      integration.apiKeyTag = enc.tag;
      integration.maskedApiKey = maskSecret(cleanKey);
      integration.status = 'VERIFIED';
      integration.lastVerifiedAt = new Date();
      integration.lastError = '';
      integration.lastErrorCode = '';

      if (verification.domains && verification.domains.length > 0) {
        const primaryDomain = verification.domains[0];
        integration.domainStatus = primaryDomain.status;
        integration.domainDnsRecords = (primaryDomain.records || []) as any;
      }
    }

    if (dto.senderName && dto.senderName.trim()) {
      integration.senderName = dto.senderName.trim();
    }
    if (dto.senderEmail && dto.senderEmail.trim()) {
      integration.senderEmail = dto.senderEmail.trim().toLowerCase();
    }
    if (dto.replyToEmail && dto.replyToEmail.trim()) {
      integration.replyToEmail = dto.replyToEmail.trim().toLowerCase();
    }
    if (Array.isArray(dto.notificationRecipients)) {
      integration.notificationRecipients = dto.notificationRecipients
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);
    }
    if (dto.notificationRules && typeof dto.notificationRules === 'object') {
      integration.notificationRules = {
        ...integration.notificationRules,
        ...dto.notificationRules,
      };
    }

    await integration.save();

    return {
      success: true,
      message: 'Email integration settings saved successfully.',
      status: integration.status,
      maskedApiKey: integration.maskedApiKey,
      senderName: integration.senderName,
      senderEmail: integration.senderEmail,
      replyToEmail: integration.replyToEmail,
      domainStatus: integration.domainStatus,
      domainDnsRecords: integration.domainDnsRecords,
      notificationRecipients: integration.notificationRecipients,
      notificationRules: integration.notificationRules,
    };
  }

  async sendTestEmail(recipient: string, adminEmail?: string) {
    const targetEmail = recipient.trim().toLowerCase();
    const timestamp = new Date().toLocaleString();

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #080c14; padding: 36px 16px; margin: 0;">
        <div style="max-width: 540px; margin: 0 auto; background-color: #0d1322; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 18px; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #0b1120 0%, #17273e 100%); padding: 22px 28px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
            <div style="font-size: 19px; font-weight: 800; color: #ffffff;">STACK<span style="color: #F78105;">FYRA</span></div>
            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">CRM Integration Test Verification</div>
          </div>
          <div style="padding: 32px 28px;">
            <h2 style="font-size: 18px; font-weight: 800; color: #38bdf8; margin: 0 0 12px 0;">🎉 Resend Email Integration Verified!</h2>
            <p style="color: #cbd5e1; font-size: 13px; line-height: 1.6; margin: 0 0 16px 0;">
              This test email confirms that your Stackfyra CRM centralized server-side email service and MongoDB Outbox queue are functioning properly.
            </p>
            <div style="background: #080c14; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 14px; font-size: 12px; color: #94a3b8; font-family: monospace;">
              <div>Initiated by: ${adminEmail || 'Administrator'}</div>
              <div>Recipient: ${targetEmail}</div>
              <div>Dispatched at: ${timestamp}</div>
              <div>Durable Queue: MongoDB EmailOutbox</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const textContent = `Stackfyra CRM Email Integration Test\n\nInitiated by: ${adminEmail || 'Administrator'}\nRecipient: ${targetEmail}\nTime: ${timestamp}\n\nYour Resend email service is working properly.`;

    const enqueueResult = await this.emailService.enqueueEmail({
      type: 'TEST_EMAIL',
      recipient: targetEmail,
      subject: `✅ Stackfyra CRM Email Verification Test (${timestamp})`,
      htmlContent,
      textContent,
      metadata: { initiatedBy: adminEmail },
    });

    return {
      success: enqueueResult.immediateSuccess,
      message: enqueueResult.immediateSuccess
        ? `Test email dispatched successfully to ${targetEmail}.`
        : `Test email queued in MongoDB Outbox for delivery.`,
      jobId: enqueueResult.jobId,
      status: enqueueResult.status,
    };
  }

  async validateEmail() {
    const creds = await this.emailService.getActiveEmailCredentials();
    if (!creds.apiKey) {
      throw new BadRequestException('No Resend API Key is configured in MongoDB or Environment.');
    }

    const verification = await this.emailService.verifyResendCredentials(creds.apiKey);

    let integration = await this.emailIntegrationModel.findOne({
      organizationId: 'stackfyra-org',
    });
    if (!integration) {
      integration = new this.emailIntegrationModel({ organizationId: 'stackfyra-org' });
    }

    if (!verification.valid) {
      integration.status = 'AUTHENTICATION_ERROR';
      integration.lastError = verification.error || 'Resend API validation failed.';
      integration.lastErrorCode = verification.errorCode || 'AUTHENTICATION_ERROR';
      await integration.save();

      throw new BadRequestException({
        success: false,
        status: 'AUTHENTICATION_ERROR',
        error: integration.lastError,
      });
    }

    integration.status = 'VERIFIED';
    integration.lastVerifiedAt = new Date();
    integration.lastError = '';
    integration.lastErrorCode = '';

    if (verification.domains && verification.domains.length > 0) {
      const primary = verification.domains[0];
      integration.domainStatus = primary.status;
      integration.domainDnsRecords = (primary.records || []) as any;
    }

    await integration.save();

    return {
      success: true,
      message: 'Resend API credentials and domain records verified successfully.',
      status: integration.status,
      domainStatus: integration.domainStatus,
      domainDnsRecords: integration.domainDnsRecords,
      lastVerifiedAt: integration.lastVerifiedAt,
    };
  }

  async getEmailJobs(status?: string, limit = 15) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await this.emailOutboxModel.deleteMany({ createdAt: { $lt: twentyFourHoursAgo } });

    const query: any = {};
    if (status && status !== 'ALL') {
      query.status = status;
    }

    const safeLimit = Math.min(50, Math.max(1, limit));
    const jobs = await this.emailOutboxModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .select('-htmlContent -textContent');

    return {
      success: true,
      jobs,
    };
  }

  async deleteEmailJobs(jobId?: string, clearAll = false, status?: string) {
    if (clearAll) {
      const deleteQuery: any = {};
      if (status && status !== 'ALL') {
        deleteQuery.status = status;
      }
      const result = await this.emailOutboxModel.deleteMany(deleteQuery);
      return {
        success: true,
        message: `Deleted ${result.deletedCount} outbox email(s).`,
        deletedCount: result.deletedCount,
      };
    }

    if (!jobId) {
      throw new BadRequestException('Missing jobId or id query parameter.');
    }

    const conditions: any[] = [{ jobId }];
    if (isValidObjectId(jobId)) {
      conditions.push({ _id: jobId });
    }

    const result = await this.emailOutboxModel.deleteOne({ $or: conditions });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Email job not found or already deleted.');
    }

    return {
      success: true,
      message: 'Email outbox job deleted successfully.',
      deletedCount: 1,
    };
  }

  async retryEmailJobs(limit = 20) {
    const safeLimit = Math.min(50, Math.max(1, limit));
    const result = await this.emailService.retryEligibleOutboxJobs(safeLimit);

    return {
      success: true,
      message: `Processed ${result.processed} queued outbox job(s): ${result.succeeded} sent, ${result.failed} failed.`,
      ...result,
    };
  }
}
