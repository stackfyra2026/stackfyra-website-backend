import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import crypto from 'crypto';
import {
  MetaIntegration,
  MetaIntegrationDocument,
} from '../../database/schemas/meta-integration.schema.js';
import {
  Lead,
  LeadDocument,
  LeadSource,
} from '../../database/schemas/lead.schema.js';
import { encryptToken, decryptToken } from '../../common/utils/encryption.util.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { EmailService } from '../email/email.service.js';

export const META_API_VERSION = process.env.META_GRAPH_API_VERSION || 'v26.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export interface MetaLeadGraphResponse {
  id: string;
  created_time: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  form_id?: string;
  field_data?: Array<{ name: string; values: string[] }>;
  platform?: string;
  is_organic?: boolean;
}

export interface MetaPageItem {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  tasks?: string[];
}

export interface MetaFormItem {
  id: string;
  name: string;
  status: string;
  created_time: string;
  questions?: Array<{ key: string; label: string; type: string }>;
  leads_count?: number;
}

@Injectable()
export class MetaService {
  private readonly logger = new Logger(MetaService.name);

  constructor(
    @InjectModel(MetaIntegration.name)
    private metaIntegrationModel: Model<MetaIntegrationDocument>,
    @InjectModel(Lead.name)
    private leadModel: Model<LeadDocument>,
    private notificationsService: NotificationsService,
    private emailService: EmailService,
  ) {}

  getMetaConfig() {
    return {
      appId: process.env.META_APP_ID || '',
      appSecret: process.env.META_APP_SECRET || '',
      verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || '',
      redirectUri: process.env.META_REDIRECT_URI || '',
      apiVersion: META_API_VERSION,
    };
  }

  generateAppSecretProof(accessToken: string): string | undefined {
    const appSecret = process.env.META_APP_SECRET;
    if (!appSecret || !accessToken) return undefined;
    return crypto
      .createHmac('sha256', appSecret)
      .update(accessToken)
      .digest('hex');
  }

  generateMetaOAuthUrl(state: string): string {
    const { appId, redirectUri } = this.getMetaConfig();
    if (!appId || !redirectUri) {
      throw new Error('META_APP_ID and META_REDIRECT_URI must be configured.');
    }

    const permissions = [
      'pages_show_list',
      'pages_read_engagement',
      'pages_manage_metadata',
      'leads_retrieval',
    ].join(',');

    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      response_type: 'code',
      scope: permissions,
    });

    return `https://www.facebook.com/${META_API_VERSION}/dialog/oauth?${params.toString()}`;
  }

  async exchangeCodeForUserToken(
    code: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const { appId, appSecret, redirectUri } = this.getMetaConfig();
    if (!appId || !appSecret || !redirectUri) {
      throw new Error('Missing Meta credentials for OAuth token exchange.');
    }

    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const res = await fetch(
      `${GRAPH_BASE_URL}/oauth/access_token?${params.toString()}`,
    );
    const data = await res.json();

    if (!res.ok || data.error) {
      const errorMsg =
        data.error?.message || 'Failed to exchange authorization code.';
      throw new Error(`Meta OAuth Exchange Error: ${errorMsg}`);
    }

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 5184000,
    };
  }

  async exchangeForLongLivedUserToken(
    shortLivedToken: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    const { appId, appSecret } = this.getMetaConfig();
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    });

    const res = await fetch(
      `${GRAPH_BASE_URL}/oauth/access_token?${params.toString()}`,
    );
    const data = await res.json();

    if (!res.ok || data.error) {
      const errorMsg =
        data.error?.message || 'Failed to exchange for long-lived token.';
      throw new Error(`Meta Token Extension Error: ${errorMsg}`);
    }

    return {
      accessToken: data.access_token,
      expiresIn: data.expires_in || 5184000,
    };
  }

  async fetchUserPages(userAccessToken: string): Promise<MetaPageItem[]> {
    const appSecretProof = this.generateAppSecretProof(userAccessToken);
    const params = new URLSearchParams({
      fields: 'id,name,access_token,category,tasks',
      limit: '100',
      access_token: userAccessToken,
    });
    if (appSecretProof) params.set('appsecret_proof', appSecretProof);

    const res = await fetch(
      `${GRAPH_BASE_URL}/me/accounts?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${userAccessToken}` },
      },
    );

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(
        `Meta Fetch Pages Error: ${data.error?.message || 'Unable to fetch pages.'}`,
      );
    }

    return data.data || [];
  }

  async verifyPageDetails(
    token: string,
    pageId?: string,
  ): Promise<{ id: string; name: string }> {
    const appSecretProof = this.generateAppSecretProof(token);

    if (pageId && pageId.trim()) {
      const pId = pageId.trim();
      const pParams = new URLSearchParams({
        fields: 'id,name',
        access_token: token,
      });
      if (appSecretProof) pParams.set('appsecret_proof', appSecretProof);

      const pageRes = await fetch(
        `${GRAPH_BASE_URL}/${encodeURIComponent(pId)}?${pParams.toString()}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const pageData = await pageRes.json();
      if (pageRes.ok && pageData.id && !pageData.error) {
        return { id: pageData.id, name: pageData.name || 'Facebook Page' };
      }
    }

    const meParams = new URLSearchParams({
      fields: 'id,name',
      access_token: token,
    });
    if (appSecretProof) meParams.set('appsecret_proof', appSecretProof);

    const meRes = await fetch(`${GRAPH_BASE_URL}/me?${meParams.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meData = await meRes.json();
    if (!meRes.ok || meData.error) {
      const code = meData.error?.code;
      const msg = meData.error?.message || 'Verification failed.';
      throw new Error(`Meta Graph API Error (Code ${code}): ${msg}`);
    }

    return { id: meData.id, name: meData.name || 'Facebook Page' };
  }

  async debugToken(inputToken: string): Promise<{
    isValid: boolean;
    appId?: string;
    type?: string;
    scopes?: string[];
    expiresAt?: number;
    dataAccessExpiresAt?: number;
    error?: string;
  }> {
    try {
      const { appId, appSecret } = this.getMetaConfig();
      const appToken = appId && appSecret ? `${appId}|${appSecret}` : inputToken;
      const params = new URLSearchParams({
        input_token: inputToken,
        access_token: appToken,
      });

      const res = await fetch(
        `${GRAPH_BASE_URL}/debug_token?${params.toString()}`,
      );
      const result = await res.json();

      if (!res.ok || result.error) {
        return {
          isValid: false,
          error: result.error?.message || 'Token inspection failed.',
        };
      }

      const d = result.data || {};
      return {
        isValid: !!d.is_valid,
        appId: d.app_id,
        type: d.type,
        scopes: d.scopes || [],
        expiresAt: d.expires_at,
        dataAccessExpiresAt: d.data_access_expires_at,
      };
    } catch (err: any) {
      return { isValid: false, error: err.message };
    }
  }

  async validateMetaTokenDetails(
    inputToken: string,
    targetPageId?: string,
  ): Promise<{
    isValid: boolean;
    tokenType: 'PAGE' | 'SYSTEM_USER' | 'USER';
    appId?: string;
    pageId?: string;
    pageName?: string;
    expiresAt?: Date | null;
    dataAccessExpiresAt?: Date | null;
    isNeverExpiring: boolean;
    scopes: string[];
    missingScopes: string[];
    error?: string;
  }> {
    const debug = await this.debugToken(inputToken);

    let pageId = targetPageId;
    let pageName = 'Facebook Page';
    try {
      const pageDetails = await this.verifyPageDetails(inputToken, targetPageId);
      pageId = pageDetails.id;
      pageName = pageDetails.name;
    } catch (err: any) {
      if (!debug.isValid) {
        return {
          isValid: false,
          tokenType: 'PAGE',
          scopes: [],
          missingScopes: ['leads_retrieval', 'pages_manage_metadata'],
          isNeverExpiring: false,
          error: err.message || 'Failed to verify Meta Page token.',
        };
      }
    }

    const scopes = debug.scopes || [];
    const requiredScopes = ['leads_retrieval', 'pages_manage_metadata'];
    const missingScopes = requiredScopes.filter((s) => !scopes.includes(s));

    const isNeverExpiring = !debug.expiresAt || debug.expiresAt === 0;
    const expiresAt = isNeverExpiring ? null : new Date(debug.expiresAt! * 1000);
    const dataAccessExpiresAt = debug.dataAccessExpiresAt
      ? new Date(debug.dataAccessExpiresAt * 1000)
      : null;

    let tokenType: 'PAGE' | 'SYSTEM_USER' | 'USER' = 'PAGE';
    if (debug.type === 'USER') {
      tokenType = 'USER';
    } else if (isNeverExpiring && scopes.length > 0) {
      tokenType = 'SYSTEM_USER';
    }

    return {
      isValid: debug.isValid,
      tokenType,
      appId: debug.appId,
      pageId,
      pageName,
      expiresAt,
      dataAccessExpiresAt,
      isNeverExpiring,
      scopes,
      missingScopes,
      error: debug.error,
    };
  }

  async subscribePageToLeadgen(
    pageId: string,
    pageAccessToken: string,
  ): Promise<boolean> {
    const appSecretProof = this.generateAppSecretProof(pageAccessToken);
    const params = new URLSearchParams({
      subscribed_fields: 'leadgen',
      access_token: pageAccessToken,
    });
    if (appSecretProof) params.set('appsecret_proof', appSecretProof);

    const res = await fetch(
      `${GRAPH_BASE_URL}/${encodeURIComponent(pageId)}/subscribed_apps`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${pageAccessToken}`,
        },
        body: params.toString(),
      },
    );

    const data = await res.json();
    if (!res.ok || data.error) {
      this.logger.error(
        `Failed to subscribe page ${pageId} to leadgen:`,
        data.error,
      );
      return false;
    }

    return data.success === true;
  }

  async unsubscribePageFromLeadgen(
    pageId: string,
    pageAccessToken: string,
  ): Promise<boolean> {
    try {
      const appSecretProof = this.generateAppSecretProof(pageAccessToken);
      const params = new URLSearchParams({ access_token: pageAccessToken });
      if (appSecretProof) params.set('appsecret_proof', appSecretProof);

      const res = await fetch(
        `${GRAPH_BASE_URL}/${encodeURIComponent(pageId)}/subscribed_apps?${params.toString()}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${pageAccessToken}` },
        },
      );

      const data = await res.json();
      return data.success === true;
    } catch {
      return false;
    }
  }

  async fetchPageLeadForms(
    pageId: string,
    pageAccessToken: string,
  ): Promise<MetaFormItem[]> {
    const appSecretProof = this.generateAppSecretProof(pageAccessToken);
    const params = new URLSearchParams({
      fields: 'id,name,status,created_time,questions,leads_count',
      limit: '100',
      access_token: pageAccessToken,
    });
    if (appSecretProof) params.set('appsecret_proof', appSecretProof);

    const res = await fetch(
      `${GRAPH_BASE_URL}/${encodeURIComponent(pageId)}/leadgen_forms?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${pageAccessToken}` },
      },
    );

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(
        `Meta Fetch Forms Error: ${data.error?.message || 'Unable to fetch lead forms.'}`,
      );
    }

    return data.data || [];
  }

  async fetchLeadDetails(
    leadId: string,
    pageAccessToken: string,
  ): Promise<MetaLeadGraphResponse> {
    const fields = [
      'id',
      'created_time',
      'ad_id',
      'ad_name',
      'adset_id',
      'adset_name',
      'campaign_id',
      'campaign_name',
      'form_id',
      'field_data',
      'platform',
      'is_organic',
    ].join(',');

    const appSecretProof = this.generateAppSecretProof(pageAccessToken);
    const params = new URLSearchParams({
      fields,
      access_token: pageAccessToken,
    });
    if (appSecretProof) params.set('appsecret_proof', appSecretProof);

    const res = await fetch(
      `${GRAPH_BASE_URL}/${encodeURIComponent(leadId)}?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${pageAccessToken}` },
      },
    );

    const data = await res.json();
    if (!res.ok || data.error) {
      const code = data.error?.code;
      const message =
        data.error?.message || 'Failed to retrieve lead data from Graph API.';
      throw new Error(`Meta Graph Lead Error (Code ${code}): ${message}`);
    }

    return data;
  }

  async fetchFormLeads(
    formId: string,
    pageAccessToken: string,
    limit = 50,
  ): Promise<MetaLeadGraphResponse[]> {
    const fields = [
      'id',
      'created_time',
      'ad_id',
      'ad_name',
      'adset_id',
      'adset_name',
      'campaign_id',
      'campaign_name',
      'form_id',
      'field_data',
      'platform',
      'is_organic',
    ].join(',');

    const appSecretProof = this.generateAppSecretProof(pageAccessToken);
    const params = new URLSearchParams({
      fields,
      limit: String(limit),
      access_token: pageAccessToken,
    });
    if (appSecretProof) params.set('appsecret_proof', appSecretProof);

    const res = await fetch(
      `${GRAPH_BASE_URL}/${encodeURIComponent(formId)}/leads?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${pageAccessToken}` },
      },
    );

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(
        `Meta Form Leads Error: ${data.error?.message || 'Failed to fetch form leads.'}`,
      );
    }

    return data.data || [];
  }

  normalizeMetaLead(
    metaLead: MetaLeadGraphResponse,
    context?: { pageId?: string; pageName?: string; formName?: string },
  ): Partial<Lead> {
    const fieldData = metaLead.field_data || [];
    let email = '';
    let fullName = '';
    let phone = '';
    let company = '';
    let firstName = '';
    let lastName = '';

    fieldData.forEach((field) => {
      const nameLower = (field.name || '').toLowerCase().trim();
      const val =
        field.values && field.values.length > 0 ? field.values[0].trim() : '';
      if (!val) return;

      if (nameLower === 'email' || nameLower.includes('email')) {
        email = val.toLowerCase();
      } else if (
        nameLower === 'full_name' ||
        nameLower === 'name' ||
        nameLower === 'your_name'
      ) {
        fullName = val;
      } else if (nameLower === 'first_name') {
        firstName = val;
      } else if (nameLower === 'last_name') {
        lastName = val;
      } else if (
        nameLower === 'phone_number' ||
        nameLower === 'phone' ||
        nameLower.includes('phone') ||
        nameLower.includes('mobile')
      ) {
        phone = val;
      } else if (
        nameLower === 'company_name' ||
        nameLower === 'company' ||
        nameLower.includes('company') ||
        nameLower.includes('business_name')
      ) {
        company = val;
      }
    });

    if (!fullName && (firstName || lastName)) {
      fullName = `${firstName} ${lastName}`.trim();
    }

    let source: LeadSource = 'FACEBOOK';
    if (metaLead.platform && metaLead.platform.toLowerCase().includes('ig')) {
      source = 'INSTAGRAM';
    }

    const leadDate = metaLead.created_time
      ? new Date(metaLead.created_time)
      : new Date();

    return {
      organizationId: 'stackfyra-org',
      source,
      sourceProvider: 'META',
      externalLeadId: metaLead.id,
      pageId: context?.pageId,
      pageName: context?.pageName,
      formId: metaLead.form_id,
      formName: context?.formName,
      campaignId: metaLead.campaign_id,
      campaignName: metaLead.campaign_name,
      adSetId: metaLead.adset_id,
      adSetName: metaLead.adset_name,
      adId: metaLead.ad_id,
      adName: metaLead.ad_name,
      fullName,
      email,
      phone,
      company,
      fieldData,
      leadCreatedAt: isNaN(leadDate.getTime()) ? new Date() : leadDate,
      importedAt: new Date(),
      status: 'NEW',
      syncStatus: 'SUCCESS',
      isOrganic: !!metaLead.is_organic,
      platform: metaLead.platform || 'fb',
      rawPayload: metaLead,
    };
  }

  async getDecryptedPageToken(pageId?: string): Promise<{
    pageId: string;
    pageName: string;
    token: string;
  } | null> {
    const integration = await this.metaIntegrationModel.findOne({
      status: 'CONNECTED',
    });
    if (integration && integration.pages && integration.pages.length > 0) {
      let matchedPage = pageId
        ? integration.pages.find((p) => p.pageId === pageId)
        : integration.pages[0];

      if (!matchedPage) {
        matchedPage = integration.pages[0];
      }

      if (matchedPage && matchedPage.pageAccessTokenEncrypted) {
        const token = decryptToken(
          matchedPage.pageAccessTokenEncrypted,
          matchedPage.pageAccessTokenIv,
          matchedPage.pageAccessTokenTag,
        );

        return {
          pageId: matchedPage.pageId,
          pageName: matchedPage.pageName,
          token,
        };
      }
    }

    if (process.env.META_PAGE_ACCESS_TOKEN) {
      return {
        pageId: process.env.META_PAGE_ID || pageId || 'default_page',
        pageName: process.env.META_PAGE_NAME || 'Default Connected Page',
        token: process.env.META_PAGE_ACCESS_TOKEN,
      };
    }

    return null;
  }

  async processAndSaveLead(
    leadgenId: string,
    pageId?: string,
    formId?: string,
  ): Promise<{
    success: boolean;
    leadId?: string;
    isNew?: boolean;
    error?: string;
  }> {
    try {
      const existingLead = await this.leadModel.findOne({
        externalLeadId: leadgenId,
      });
      if (existingLead) {
        return {
          success: true,
          leadId: (existingLead._id as any).toString(),
          isNew: false,
        };
      }

      const pageTokenData = await this.getDecryptedPageToken(pageId);
      if (!pageTokenData) {
        throw new Error(
          `No active Page Access Token found for Page ID: ${pageId || 'default'}`,
        );
      }

      const metaLead = await this.fetchLeadDetails(
        leadgenId,
        pageTokenData.token,
      );
      const normalized = this.normalizeMetaLead(metaLead, {
        pageId: pageTokenData.pageId,
        pageName: pageTokenData.pageName,
      });

      const savedLead = await this.leadModel.findOneAndUpdate(
        { externalLeadId: leadgenId },
        { $set: normalized },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      await this.metaIntegrationModel
        .updateOne(
          { status: 'CONNECTED' },
          { $set: { lastSyncAt: new Date() } },
        )
        .catch(() => {});

      // FCM Push Notification to Admins
      this.notificationsService
        .sendPushNotificationToAdmins({
          title: `🚨 New Meta Lead: ${savedLead.fullName || 'New Lead'}`,
          body: `${savedLead.email || savedLead.phone || 'No contact'} (${savedLead.source} — ${savedLead.campaignName || 'Lead Ad'})`,
          clickUrl: '/admin',
          data: {
            leadId: (savedLead._id as any).toString(),
            externalLeadId: leadgenId,
            source: savedLead.source,
          },
        })
        .catch((e) => this.logger.warn('Push notification error: ' + e.message));

      // Admin Email Alert
      this.emailService
        .sendMetaLeadNotificationEmail({
          leadId: (savedLead._id as any).toString(),
          source: savedLead.source,
          fullName: savedLead.fullName,
          email: savedLead.email,
          phone: savedLead.phone,
          company: savedLead.company,
          pageName: savedLead.pageName,
          formName: savedLead.formName,
          campaignName: savedLead.campaignName,
          adName: savedLead.adName,
          fieldData: savedLead.fieldData,
        })
        .catch((e) => this.logger.warn('Meta lead email error: ' + e.message));

      // Confirmation Email to Prospect
      if (savedLead.email) {
        this.emailService
          .sendLeadConfirmationEmail({
            email: savedLead.email,
            name: savedLead.fullName,
            service: savedLead.campaignName || 'Meta Lead Ad',
            source:
              savedLead.source === 'INSTAGRAM'
                ? 'Instagram Lead Ad'
                : 'Facebook Lead Ad',
          })
          .catch((e) =>
            this.logger.warn('Lead confirmation error: ' + e.message),
          );
      }

      return {
        success: true,
        leadId: (savedLead._id as any).toString(),
        isNew: true,
      };
    } catch (err: any) {
      this.logger.error(`Error processing lead ${leadgenId}: ` + err.message);
      return {
        success: false,
        error: err.message || 'Failed to process lead from Meta Graph API',
      };
    }
  }

  async syncEnvMetaIntegration(): Promise<{
    connected: boolean;
    pageId?: string;
    pageName?: string;
    error?: string;
  }> {
    const envToken = process.env.META_PAGE_ACCESS_TOKEN?.trim();
    if (!envToken) {
      return {
        connected: false,
        error: 'META_PAGE_ACCESS_TOKEN is not defined in environment.',
      };
    }

    let integration = await this.metaIntegrationModel.findOne({
      organizationId: 'stackfyra-org',
    });
    if (!integration) {
      integration = new this.metaIntegrationModel({
        organizationId: 'stackfyra-org',
        pages: [],
      });
    }

    let targetPageId = process.env.META_PAGE_ID?.trim();
    let targetPageName = process.env.META_PAGE_NAME?.trim();

    if (!targetPageId || !targetPageName) {
      try {
        const pageDetails = await this.verifyPageDetails(envToken, targetPageId);
        targetPageId = pageDetails.id;
        targetPageName = targetPageName || pageDetails.name;
      } catch {
        targetPageId = targetPageId || 'env-page-id';
        targetPageName = targetPageName || 'Connected Meta Page';
      }
    }

    let isSubscribed = true;
    try {
      isSubscribed = await this.subscribePageToLeadgen(targetPageId, envToken);
    } catch (subErr: any) {
      this.logger.warn('Webhook subscription attempt error: ' + subErr.message);
    }

    const enc = encryptToken(envToken);
    const existingPageIndex = integration.pages.findIndex(
      (p) => p.pageId === targetPageId,
    );

    const pageEntry = {
      pageId: targetPageId,
      pageName: targetPageName,
      category: 'Environment Page',
      pageAccessTokenEncrypted: enc.encrypted,
      pageAccessTokenIv: enc.iv,
      pageAccessTokenTag: enc.tag,
      isSubscribed,
      selectedForms:
        existingPageIndex >= 0
          ? integration.pages[existingPageIndex].selectedForms
          : [],
      lastSyncAt: new Date(),
    };

    if (existingPageIndex >= 0) {
      integration.pages[existingPageIndex] = pageEntry as any;
    } else {
      integration.pages.push(pageEntry as any);
    }

    integration.status = 'CONNECTED';
    integration.lastSyncAt = new Date();
    integration.lastError = '';
    integration.lastErrorCode = '';
    await integration.save();

    return {
      connected: true,
      pageId: targetPageId,
      pageName: targetPageName,
    };
  }
}
