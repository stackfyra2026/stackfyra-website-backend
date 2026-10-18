import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminSubmissionsService } from './admin-submissions.service.js';

describe('AdminSubmissionsService', () => {
  let service: AdminSubmissionsService;
  let mockSubmissionModel: any;

  beforeEach(() => {
    mockSubmissionModel = {
      find: vi.fn(),
      countDocuments: vi.fn(),
      findById: vi.fn(),
      findByIdAndDelete: vi.fn(),
      aggregate: vi.fn(),
    };

    service = new AdminSubmissionsService(mockSubmissionModel);
  });

  describe('findAll', () => {
    it('should query submissions with status counts', async () => {
      mockSubmissionModel.find.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        skip: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([
          { _id: 'sub_1', name: 'John Doe', status: 'NEW' },
        ]),
      });
      mockSubmissionModel.countDocuments.mockResolvedValue(1);
      mockSubmissionModel.aggregate.mockResolvedValue([
        { _id: 'NEW', count: 1 },
      ]);

      const result = await service.findAll({ page: '1', limit: '10' });

      expect(result).toBeDefined();
      if ('submissions' in result) {
        expect(result.success).toBe(true);
        expect(result.submissions).toHaveLength(1);
        expect(result.statusCounts.NEW).toBe(1);
      }
    });

    it('should generate CSV content when export=csv', async () => {
      mockSubmissionModel.find.mockReturnValue({
        populate: vi.fn().mockReturnThis(),
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([
          {
            _id: 'sub_1',
            createdAt: new Date('2026-01-01'),
            name: 'John "Admin" Doe',
            email: 'john@example.com',
            service: 'Cloud',
            status: 'NEW',
          },
        ]),
      });

      const result = await service.findAll({ export: 'csv' });

      expect(result).toBeDefined();
      if ('csvContent' in result) {
        expect(result.csvContent).toContain('Submission ID,Created Date,Submission Type');
        expect(result.csvContent).toContain('"John ""Admin"" Doe"');
      }
    });
  });

  describe('update', () => {
    it('should update submission status and save', async () => {
      const mockDoc = {
        _id: 'sub_999',
        status: 'NEW',
        save: vi.fn().mockResolvedValue(true),
      };
      mockSubmissionModel.findById.mockResolvedValue(mockDoc);

      const result = await service.update('sub_999', { status: 'CONTACTED' as any });

      expect(result.success).toBe(true);
      expect(mockDoc.status).toBe('CONTACTED');
      expect(mockDoc.save).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete submission by id', async () => {
      mockSubmissionModel.findByIdAndDelete.mockResolvedValue({ _id: 'sub_999' });

      const result = await service.remove('sub_999');
      expect(result.success).toBe(true);
      expect(mockSubmissionModel.findByIdAndDelete).toHaveBeenCalledWith('sub_999');
    });
  });
});
