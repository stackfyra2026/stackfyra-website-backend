import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import type { Request } from 'express';
import crypto from 'crypto';
import { MetaService } from './meta.service.js';
import { MetaSyncService } from './meta-sync.service.js';
import { MetaConnectDto } from './dto/meta-connect.dto.js';
import { MetaDisconnectDto } from './dto/meta-disconnect.dto.js';
import { UpdateMetaFormsDto } from './dto/update-meta-forms.dto.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { CronOrAdminGuard } from '../../common/guards/cron-or-admin.guard.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  MetaIntegration,
  MetaIntegrationDocument,
} from '../../database/schemas/meta-integration.schema.js';
import {
  MetaWebhookEvent,
  MetaWebhookEventDocument,
} from '../../database/schemas/meta-webhook-event.schema.js';
import { Lead, LeadDocument } from '../../database/schemas/lead.schema.js';
import { encryptToken, decryptToken } from '../../common/utils/encryption.util.js';

@ApiTags('Meta Lead Ads')
@ApiBearerAuth()
@Controller('meta')
export class MetaController {
  constructor(
    private readonly metaService: MetaService,
    private readonly metaSyncService: MetaSyncService,
    @InjectModel(MetaIntegration.name)
    private metaIntegrationModel: Model<MetaIntegrationDocument>,
    @InjectModel(MetaWebhookEvent.name)
    private webhookEventModel: Model<MetaWebhookEventDocument>,
    @InjectModel(Lead.name)
    private leadModel: Model<LeadDocument>,
  ) {}

  @Get('pages')
  @ApiOperation({ summary: 'Retrieve authorized Facebook and Instagram Pages (secrets stripped)' })
  @ApiResponse({ status: 200, description: 'List of safe pages' })
  async getPages() {
    const integration = await this.metaIntegrationModel
      .findOne({ organizationId: 'stackfyra-org' })
      .lean();

    if (
      !integration ||
      integration.status !== 'CONNECTED' ||
      !integration.pages
    ) {
      return {
        success: true,
        status: integration?.status || 'DISCONNECTED',
        pages: [],
      };
    }

    const safePages = integration.pages.map((p) => ({
      pageId: p.pageId,
      pageName: p.pageName,
      category: p.category || '',
      isSubscribed: !!p.isSubscribed,
      selectedForms: p.selectedForms || [],
      lastSyncAt: p.lastSyncAt || null,
    }));

    return {
      success: true,
      status: integration.status,
      fbUserName: integration.fbUserName || '',
      pages: safePages,
    };
  }

  @Get('forms')
  @ApiOperation({ summary: 'Retrieve lead generation forms for an authorized Page' })
  @ApiResponse({ status: 200, description: 'Forms list' })
  async getForms(@Query('pageId') pageId: string) {
    if (!pageId) {
      throw new BadRequestException('pageId parameter is required.');
    }

    const integration = await this.metaIntegrationModel.findOne({
      organizationId: 'stackfyra-org',
    });
    if (!integration || integration.status !== 'CONNECTED') {
      throw new BadRequestException('Meta is not currently connected.');
    }

    const targetPage = integration.pages.find((p) => p.pageId === pageId);
    if (!targetPage) {
      throw new ForbiddenException('Unauthorized or unmanaged Page ID.');
    }

    const pageToken = decryptToken(
      targetPage.pageAccessTokenEncrypted,
      targetPage.pageAccessTokenIv,
      targetPage.pageAccessTokenTag,
    );

    const forms = await this.metaService.fetchPageLeadForms(pageId, pageToken);

    return {
      success: true,
      pageId,
      pageName: targetPage.pageName,
      forms,
      selectedForms: targetPage.selectedForms || [],
    };
  }

  @Post('forms')
  @ApiOperation({ summary: 'Update selected forms enabled for sync on a Page' })
  @ApiResponse({ status: 200, description: 'Selections updated' })
  async updateForms(@Body() dto: UpdateMetaFormsDto) {
    const integration = await this.metaIntegrationModel.findOne({
      organizationId: 'stackfyra-org',
    });
    if (!integration) {
      throw new NotFoundException('Meta integration not found.');
    }

    const targetPage = integration.pages.find((p) => p.pageId === dto.pageId);
    if (!targetPage) {
      throw new NotFoundException('Target Page not found in integration.');
    }

    targetPage.selectedForms = dto.selectedForms.map(String);
    await integration.save();

    return {
      success: true,
      message: 'Lead form selections updated successfully.',
      pageId: dto.pageId,
      selectedForms: targetPage.selectedForms,
    };
  }

  @Get('connect')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Generate official Meta OAuth authorization URL' })
  @ApiResponse({ status: 200, description: 'Auth URL generated' })
  async getConnectUrl() {
    const state = crypto.randomBytes(16).toString('hex');
    const authUrl = this.metaService.generateMetaOAuthUrl(state);

    return {
      success: true,
      authUrl,
      state,
    };
  }

  @Post('connect')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Connect Meta via OAuth code or direct Page Access Token' })
  @ApiResponse({ status: 200, description: 'Connection established' })
  async connect(@Body() dto: MetaConnectDto) {
    let integration = await this.metaIntegrationModel.findOne({
      organizationId: 'stackfyra-org',
    });
    if (!integration) {
      integration = new this.metaIntegrationModel({
        organizationId: 'stackfyra-org',
        pages: [],
      });
    }

    // PATH 1: OAuth Code Exchange Flow
    if (dto.code) {
      const shortTokenData = await this.metaService.exchangeCodeForUserToken(
        dto.code,
      );
      const longTokenData =
        await this.metaService.exchangeForLongLivedUserToken(
          shortTokenData.accessToken,
        );

      const encryptedUserToken = encryptToken(longTokenData.accessToken);
      integration.userAccessTokenEncrypted = encryptedUserToken.encrypted;
      integration.userAccessTokenIv = encryptedUserToken.iv;
      integration.userAccessTokenTag = encryptedUserToken.tag;
      integration.tokenExpiresAt = new Date(
        Date.now() + longTokenData.expiresIn * 1000,
      );

      const pages = await this.metaService.fetchUserPages(
        longTokenData.accessToken,
      );
      if (!pages || pages.length === 0) {
        throw new BadRequestException(
          'No managed Facebook Pages found. Ensure you are an Admin of at least one Page.',
        );
      }

      const connectedPages = [];
      for (const page of pages) {
        const encryptedPageToken = encryptToken(page.access_token);
        const isSubscribed = await this.metaService.subscribePageToLeadgen(
          page.id,
          page.access_token,
        );

        connectedPages.push({
          pageId: page.id,
          pageName: page.name,
          category: page.category || '',
          pageAccessTokenEncrypted: encryptedPageToken.encrypted,
          pageAccessTokenIv: encryptedPageToken.iv,
          pageAccessTokenTag: encryptedPageToken.tag,
          isSubscribed,
          selectedForms: [],
          lastSyncAt: new Date(),
        });
      }

      integration.pages = connectedPages as any;
      integration.status = 'CONNECTED';
      integration.lastSyncAt = new Date();
      integration.lastError = '';
      integration.lastErrorCode = '';
      await integration.save();

      return {
        success: true,
        message: `Connected ${connectedPages.length} Facebook Page(s) successfully.`,
        pagesCount: connectedPages.length,
        status: 'CONNECTED',
      };
    }

    // PATH 2: Direct Page / System User Access Token Flow
    if (dto.directToken) {
      const trimmedToken = dto.directToken.trim();
      let pageDetails: { id: string; name: string };
      try {
        pageDetails = await this.metaService.verifyPageDetails(
          trimmedToken,
          dto.pageId,
        );
      } catch (tokenErr: any) {
        throw new BadRequestException(
          `Invalid Meta token: ${tokenErr.message || 'Verification failed.'}`,
        );
      }

      const verifiedPageId = dto.pageId?.trim() || pageDetails.id;
      const verifiedPageName = dto.pageName?.trim() || pageDetails.name;

      const isSubscribed = await this.metaService.subscribePageToLeadgen(
        verifiedPageId,
        trimmedToken,
      );
      const enc = encryptToken(trimmedToken);

      const existingPageIndex = integration.pages.findIndex(
        (p) => p.pageId === verifiedPageId,
      );
      const pageEntry = {
        pageId: verifiedPageId,
        pageName: verifiedPageName,
        category: 'Manual Page',
        pageAccessTokenEncrypted: enc.encrypted,
        pageAccessTokenIv: enc.iv,
        pageAccessTokenTag: enc.tag,
        isSubscribed,
        selectedForms: [],
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
      await integration.save();

      return {
        success: true,
        message: `Page "${verifiedPageName}" connected successfully.`,
        status: 'CONNECTED',
        pageId: verifiedPageId,
        isSubscribed,
      };
    }

    throw new BadRequestException(
      'Missing authorization code or direct access token.',
    );
  }

  @Post('disconnect')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Disconnect specific Page or entire Meta integration' })
  @ApiResponse({ status: 200, description: 'Disconnected successfully' })
  async disconnect(@Body() dto: MetaDisconnectDto) {
    const integration = await this.metaIntegrationModel.findOne({
      organizationId: 'stackfyra-org',
    });
    if (!integration) {
      return { success: true, message: 'No active integration found.' };
    }

    if (dto.pageId) {
      const pageIndex = integration.pages.findIndex(
        (p) => p.pageId === dto.pageId,
      );
      if (pageIndex >= 0) {
        const page = integration.pages[pageIndex];
        try {
          const token = decryptToken(
            page.pageAccessTokenEncrypted,
            page.pageAccessTokenIv,
            page.pageAccessTokenTag,
          );
          await this.metaService.unsubscribePageFromLeadgen(page.pageId, token);
        } catch {
          // ignore unsubscribe error
        }

        integration.pages.splice(pageIndex, 1);
        if (integration.pages.length === 0) {
          integration.status = 'DISCONNECTED';
        }
        await integration.save();

        return {
          success: true,
          message: `Page ${page.pageName} disconnected.`,
          remainingPages: integration.pages.length,
        };
      }
      throw new NotFoundException('Page not found in integration.');
    }

    // Full Disconnection
    for (const page of integration.pages) {
      try {
        const token = decryptToken(
          page.pageAccessTokenEncrypted,
          page.pageAccessTokenIv,
          page.pageAccessTokenTag,
        );
        await this.metaService.unsubscribePageFromLeadgen(page.pageId, token);
      } catch {
        // ignore
      }
    }

    integration.status = 'DISCONNECTED';
    integration.pages = [];
    integration.userAccessTokenEncrypted = '';
    integration.userAccessTokenIv = '';
    integration.userAccessTokenTag = '';
    integration.tokenExpiresAt = null;
    integration.lastError = '';
    await integration.save();

    return {
      success: true,
      message: 'Meta integration disconnected successfully.',
      status: 'DISCONNECTED',
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Returns Meta integration health, active pages, and scheduler status' })
  @ApiResponse({ status: 200, description: 'Meta health status' })
  async getStatus(@Req() req: Request) {
    const envTokenExists = !!process.env.META_PAGE_ACCESS_TOKEN?.trim();
    if (envTokenExists) {
      const existing = await this.metaIntegrationModel
        .findOne({ organizationId: 'stackfyra-org' })
        .lean();
      if (
        !existing ||
        existing.status !== 'CONNECTED' ||
        !existing.pages ||
        existing.pages.length === 0
      ) {
        try {
          await this.metaService.syncEnvMetaIntegration();
        } catch {}
      }
    }

    const [integration, pendingEvents, failedEvents, totalMetaLeads] =
      await Promise.all([
        this.metaIntegrationModel
          .findOne({ organizationId: 'stackfyra-org' })
          .lean(),
        this.webhookEventModel.countDocuments({ status: 'PENDING' }),
        this.webhookEventModel.countDocuments({ status: 'FAILED' }),
        this.leadModel.countDocuments({ sourceProvider: 'META' }),
      ]);

    const isEnvConfigured = !!process.env.META_PAGE_ACCESS_TOKEN?.trim();
    const status =
      integration?.status || (isEnvConfigured ? 'CONNECTED' : 'DISCONNECTED');
    const pages = (integration?.pages || []).map((p) => ({
      pageId: p.pageId,
      pageName: p.pageName,
      isSubscribed: !!p.isSubscribed,
      selectedForms: p.selectedForms || [],
      lastSyncAt: p.lastSyncAt,
    }));

    if (pages.length === 0 && isEnvConfigured) {
      pages.push({
        pageId: process.env.META_PAGE_ID || 'env-page',
        pageName:
          process.env.META_PAGE_NAME || 'Connected Meta Page (from .env)',
        isSubscribed: true,
        selectedForms: [],
        lastSyncAt: new Date(),
      });
    }

    const host = req.headers['host'] || 'localhost:4000';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const callbackUrl = `${protocol}://${host}/api/webhooks/meta`;

    const scheduler = this.metaSyncService.getSchedulerStatus();

    return {
      success: true,
      status,
      isEnvConfigured,
      lastSyncAt:
        integration?.lastSyncAt || (isEnvConfigured ? new Date() : null),
      lastError: integration?.lastError || null,
      tokenExpiresAt: integration?.tokenExpiresAt || null,
      pages,
      stats: {
        totalMetaLeads,
        pendingWebhookEvents: pendingEvents,
        failedWebhookEvents: failedEvents,
      },
      scheduler: {
        isActive: scheduler.isRunning,
        intervalMinutes: scheduler.intervalMinutes,
        lastRunAt: scheduler.lastRunAt,
        nextRunAt: scheduler.nextRunAt,
      },
      webhookConfig: {
        callbackUrl,
        verifyTokenConfigured: !!process.env.META_WEBHOOK_VERIFY_TOKEN,
        appSecretConfigured: !!process.env.META_APP_SECRET,
        appIdConfigured: !!process.env.META_APP_ID,
        pageAccessTokenConfigured: isEnvConfigured,
        pageIdConfigured: !!process.env.META_PAGE_ID,
      },
    };
  }

  @Public()
  @UseGuards(CronOrAdminGuard)
  @Get('sync')
  @ApiOperation({ summary: 'Automated Vercel cron or secret bearer sync endpoint' })
  @ApiResponse({ status: 200, description: 'Sync completed' })
  async syncGet() {
    return this.handleSync();
  }

  @Public()
  @UseGuards(CronOrAdminGuard)
  @Post('sync')
  @ApiOperation({ summary: 'Manual or webhook-triggered Meta synchronization' })
  @ApiResponse({ status: 200, description: 'Sync completed' })
  async syncPost() {
    return this.handleSync();
  }

  private async handleSync() {
    const syncResult = await this.metaSyncService.executeMetaSyncCycle();
    const scheduler = this.metaSyncService.getSchedulerStatus();

    return {
      success: syncResult.success,
      message: 'Meta synchronization cycle executed successfully.',
      jobs: syncResult.jobs,
      reconciliation: syncResult.reconciliation,
      durationMs: syncResult.durationMs,
      timestamp: syncResult.timestamp,
      scheduler: {
        isActive: scheduler.isRunning,
        intervalMinutes: scheduler.intervalMinutes,
        lastRunAt: scheduler.lastRunAt,
        nextRunAt: scheduler.nextRunAt,
      },
    };
  }
}
