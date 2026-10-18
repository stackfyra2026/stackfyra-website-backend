import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InquiriesService } from './inquiries.service.js';

describe('InquiriesService', () => {
  let inquiriesService: InquiriesService;
  let mockFormSubmissionModel: any;
  let mockEmailService: any;
  let mockNotificationsService: any;

  beforeEach(() => {
    mockFormSubmissionModel = {
      create: vi.fn().mockImplementation(async (doc: any) => ({
        _id: 'sub_123',
        ...doc,
      })),
    };
    mockEmailService = {
      sendLeadNotificationEmail: vi.fn().mockResolvedValue(true),
      sendLeadConfirmationEmail: vi.fn().mockResolvedValue(true),
    };
    mockNotificationsService = {
      sendPushNotificationToAdmins: vi.fn().mockResolvedValue({ successCount: 1, failureCount: 0 }),
    };

    inquiriesService = new InquiriesService(
      mockFormSubmissionModel,
      mockEmailService,
      mockNotificationsService,
    );
  });

  it('should successfully persist inquiry and dispatch notifications', async () => {
    const dto = {
      type: 'quick-inquiry' as const,
      name: 'Sarah Connor',
      email: 'sarah@skynet-resistance.org',
      phone: '+1 555-0199',
      service: 'Cloud Architecture & DevOps',
      message: 'Need high-availability Kubernetes infrastructure.',
    };

    const result = await inquiriesService.processInquiry(dto, '127.0.0.1');

    expect(result.success).toBe(true);
    expect(result.message).toBe('Your inquiry has been submitted successfully.');
    expect(result.submissionId).toBe('sub_123');

    expect(mockFormSubmissionModel.create).toHaveBeenCalled();
    expect(mockEmailService.sendLeadNotificationEmail).toHaveBeenCalledWith(dto);
  });
});
