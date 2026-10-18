import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetaSyncService } from './meta-sync.service.js';
import { encryptToken } from '../../common/utils/encryption.util.js';

describe('MetaSyncService', () => {
  let syncService: MetaSyncService;
  let mockWebhookEventModel: any;
  let mockMetaIntegrationModel: any;
  let mockLeadModel: any;
  let mockMetaService: any;
  let mockEmailService: any;

  beforeEach(() => {
    mockWebhookEventModel = {
      find: vi.fn(),
    };
    mockMetaIntegrationModel = {
      findOne: vi.fn(),
      updateOne: vi.fn(),
    };
    mockLeadModel = {
      findOne: vi.fn(),
      create: vi.fn(),
    };
    mockMetaService = {
      fetchPageLeadForms: vi.fn(),
      fetchFormLeads: vi.fn(),
      normalizeMetaLead: vi.fn(),
      processAndSaveLead: vi.fn(),
    };
    mockEmailService = {
      sendLeadConfirmationEmail: vi.fn().mockResolvedValue(true),
      sendMetaLeadNotificationEmail: vi.fn().mockResolvedValue(true),
    };

    syncService = new MetaSyncService(
      mockWebhookEventModel,
      mockMetaIntegrationModel,
      mockLeadModel,
      mockMetaService,
      mockEmailService,
    );
  });

  describe('reconcileRecentLeads (lines 148-179 resolution check)', () => {
    it('should decrypt stored page tokens and reconcile lead forms', async () => {
      const rawToken = 'EAAG_test_page_token_12345';
      const enc = encryptToken(rawToken, 'meta');

      mockMetaIntegrationModel.findOne.mockResolvedValue({
        status: 'CONNECTED',
        pages: [
          {
            pageId: 'page_1001',
            pageName: 'Stackfyra Official',
            pageAccessTokenEncrypted: enc.encrypted,
            pageAccessTokenIv: enc.iv,
            pageAccessTokenTag: enc.tag,
            lastSyncAt: null,
          },
        ],
        save: vi.fn().mockResolvedValue(true),
      });

      mockMetaService.fetchPageLeadForms.mockResolvedValue([
        { id: 'form_901', name: 'Software Consultation Form' },
      ]);
      mockMetaService.fetchFormLeads.mockResolvedValue([
        {
          id: 'lead_meta_1',
          created_time: '2026-03-01T12:00:00Z',
          field_data: [{ name: 'email', values: ['lead@customer.com'] }],
        },
      ]);
      mockLeadModel.findOne.mockResolvedValue(null); // new lead
      mockMetaService.normalizeMetaLead.mockReturnValue({
        externalLeadId: 'lead_meta_1',
        fullName: 'Jane Customer',
        email: 'lead@customer.com',
        source: 'FACEBOOK',
        pageId: 'page_1001',
      });
      mockLeadModel.create.mockResolvedValue({
        _id: 'new_lead_id_1',
        email: 'lead@customer.com',
        fullName: 'Jane Customer',
        source: 'FACEBOOK',
      });

      const result = await syncService.reconcileRecentLeads();

      expect(result.pagesChecked).toBe(1);
      expect(result.totalSynced).toBe(1);
      expect(result.errors).toHaveLength(0);

      expect(mockMetaService.fetchPageLeadForms).toHaveBeenCalledWith(
        'page_1001',
        rawToken,
      );
      expect(mockMetaService.fetchFormLeads).toHaveBeenCalledWith(
        'form_901',
        rawToken,
        25,
      );
      expect(mockLeadModel.create).toHaveBeenCalled();
      expect(mockEmailService.sendLeadConfirmationEmail).toHaveBeenCalled();
      expect(mockEmailService.sendMetaLeadNotificationEmail).toHaveBeenCalled();
    });

    it('should fallback to environment variables when direct page token is configured', async () => {
      process.env.META_PAGE_ACCESS_TOKEN = 'EAAG_env_token_999';
      process.env.META_PAGE_ID = 'page_env_888';
      process.env.META_PAGE_NAME = 'Env Fallback Page';

      mockMetaIntegrationModel.findOne.mockResolvedValue(null);
      mockMetaService.fetchPageLeadForms.mockResolvedValue([]);

      const result = await syncService.reconcileRecentLeads();

      expect(result.pagesChecked).toBe(1);
      expect(mockMetaService.fetchPageLeadForms).toHaveBeenCalledWith(
        'page_env_888',
        'EAAG_env_token_999',
      );

      delete process.env.META_PAGE_ACCESS_TOKEN;
      delete process.env.META_PAGE_ID;
      delete process.env.META_PAGE_NAME;
    });

    it('should handle decryption errors gracefully without aborting sync', async () => {
      mockMetaIntegrationModel.findOne.mockResolvedValue({
        status: 'CONNECTED',
        pages: [
          {
            pageId: 'corrupted_page',
            pageName: 'Corrupted Page',
            pageAccessTokenEncrypted: 'corrupted_data',
            pageAccessTokenIv: '00'.repeat(12),
            pageAccessTokenTag: '00'.repeat(16),
          },
        ],
        save: vi.fn().mockResolvedValue(true),
      });

      const result = await syncService.reconcileRecentLeads();
      expect(result.pagesChecked).toBe(0);
      expect(result.errors).toContain('No active Meta integration or tokens connected.');
    });
  });
});
