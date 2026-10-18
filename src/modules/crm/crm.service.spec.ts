import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrmService } from './crm.service.js';

describe('CrmService', () => {
  let crmService: CrmService;
  let mockLeadModel: any;

  beforeEach(() => {
    mockLeadModel = {
      find: vi.fn(),
      countDocuments: vi.fn(),
      findOne: vi.fn(),
      findOneAndUpdate: vi.fn(),
      findOneAndDelete: vi.fn(),
      aggregate: vi.fn(),
    };

    crmService = new CrmService(mockLeadModel);
  });

  describe('findAll', () => {
    it('should query leads with tenant isolation and status counts', async () => {
      mockLeadModel.find.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([
          { _id: 'lead_1', fullName: 'John Doe', status: 'NEW' },
        ]),
      });
      mockLeadModel.countDocuments.mockResolvedValue(1);
      mockLeadModel.aggregate.mockResolvedValue([
        { _id: 'NEW', count: 1 },
      ]);

      const result = await crmService.findAll({ page: '1', limit: '10' });

      expect(result).toBeDefined();
      if ('leads' in result) {
        expect(result.success).toBe(true);
        expect(result.leads).toHaveLength(1);
        expect(result.statusCounts.NEW).toBe(1);
      }
    });

    it('should generate CSV output when export is requested', async () => {
      mockLeadModel.find.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([
          {
            _id: 'lead_1',
            createdAt: new Date('2026-01-01'),
            fullName: 'Jane "CEO" Doe',
            email: 'jane@example.com',
            phone: '555-1234',
            company: 'Tech, Inc.',
            status: 'NEW',
            source: 'WEBSITE',
          },
        ]),
      });

      const result = await crmService.findAll({ export: 'csv' });

      expect(result).toBeDefined();
      if ('csvContent' in result) {
        expect(result.csvContent).toContain('Lead ID,External Lead ID,Created At,Full Name');
        expect(result.csvContent).toContain('"Jane ""CEO"" Doe"');
        expect(result.filename).toContain('stackfyra-meta-leads-');
      }
    });
  });

  describe('findOne', () => {
    it('should return lead by ID', async () => {
      mockLeadModel.findOne.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue({ _id: 'lead_123', fullName: 'Alice' }),
      });

      const result = await crmService.findOne('lead_123');
      expect(result.success).toBe(true);
      expect(result.lead.fullName).toBe('Alice');
    });
  });

  describe('update', () => {
    it('should update lead status and notes', async () => {
      mockLeadModel.findOneAndUpdate.mockReturnValue({
        populate: vi.fn().mockResolvedValue({
          _id: 'lead_123',
          status: 'CONTACTED',
          notes: 'Called client',
        }),
      });

      const result = await crmService.update('lead_123', {
        status: 'CONTACTED',
        notes: 'Called client',
      });

      expect(result.success).toBe(true);
      expect(result.lead.status).toBe('CONTACTED');
    });
  });
});
