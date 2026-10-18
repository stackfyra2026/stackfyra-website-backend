import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FormSubmission,
  FormSubmissionDocument,
} from '../../database/schemas/form-submission.schema.js';
import { EmailService } from '../email/email.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { SendInquiryDto } from './dto/send-inquiry.dto.js';

@Injectable()
export class InquiriesService {
  private readonly logger = new Logger(InquiriesService.name);

  constructor(
    @InjectModel(FormSubmission.name)
    private formSubmissionModel: Model<FormSubmissionDocument>,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
  ) {}

  async processInquiry(
    dto: SendInquiryDto,
    clientIp?: string,
  ): Promise<{
    success: boolean;
    message: string;
    submissionId: any;
  }> {
    const email = dto.email.trim().toLowerCase();
    const effectiveIp = dto.ip || clientIp;

    // 1. Save permanently to MongoDB FIRST
    const submission: any = await this.formSubmissionModel.create({
      type: dto.type,
      name: dto.name ? dto.name.trim() : undefined,
      email,
      phone: dto.phone ? dto.phone.trim() : undefined,
      company: dto.company ? dto.company.trim() : undefined,
      country: dto.country || dto.country_name || undefined,
      service: dto.service || dto.projectType,
      projectType: dto.projectType,
      budgetRange: dto.budgetRange,
      timeline: dto.timeline,
      projectDescription: dto.projectDescription,
      project: dto.project,
      preferredContact: dto.preferredContact,
      message: dto.message || dto.projectDescription,
      source: dto.source || 'Stackfyra Website',
      status: 'NEW',
      utm_source: dto.utm_source,
      utm_medium: dto.utm_medium,
      utm_campaign: dto.utm_campaign,
      utm_term: dto.utm_term,
      utm_content: dto.utm_content,
      gclid: dto.gclid,
      fbclid: dto.fbclid,
      city: dto.city,
      region: dto.region,
      country_name: dto.country_name || dto.country,
      postal: dto.postal,
      timezone: dto.timezone,
      latitude: dto.latitude,
      longitude: dto.longitude,
      currency: dto.currency,
      ip: effectiveIp,
    });

    // 2. Dispatch email notification to squad admin asynchronously
    this.emailService.sendLeadNotificationEmail(dto).then((sent) => {
      if (!sent) {
        this.logger.warn(
          `Lead ${submission._id} saved in MongoDB, but admin email notification failed to deliver.`,
        );
      }
    });

    // 3. Dispatch automated confirmation email directly to the prospect
    this.emailService
      .sendLeadConfirmationEmail({
        email,
        name: dto.name,
        service: dto.service || dto.projectType,
        source: dto.source || 'Stackfyra Website',
      })
      .catch((confErr) => {
        this.logger.warn('Prospect confirmation email warning: ' + confErr.message);
      });

    // 4. Dispatch Firebase FCM Push Notification to all active Admin users
    const clientName = dto.name || dto.company || 'Anonymous Lead';
    const locationParts = [dto.city, dto.country_name || dto.country].filter(
      Boolean,
    );
    const locationStr =
      locationParts.length > 0 ? locationParts.join(', ') : 'Unknown location';
    const serviceStr = dto.service || dto.projectType || 'General Inquiry';

    this.notificationsService
      .sendPushNotificationToAdmins({
        title: `🚨 New Lead: ${clientName}`,
        body: `${email} (${locationStr}) — ${serviceStr}`,
        clickUrl: '/admin',
        data: {
          submissionId: (submission._id as any).toString(),
          email,
        },
      })
      .then((pushResult) => {
        this.logger.log(
          `FCM Push Dispatch Result for lead ${submission._id}: ` +
            JSON.stringify(pushResult),
        );
      })
      .catch((pushErr) => {
        this.logger.error('Failed to initiate FCM push notification: ' + pushErr.message);
      });

    return {
      success: true,
      message: 'Your inquiry has been submitted successfully.',
      submissionId: (submission as any)._id,
    };
  }
}
