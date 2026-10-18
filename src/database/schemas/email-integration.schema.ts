import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EmailIntegrationDocument = EmailIntegration & Document;

export type EmailIntegrationStatus =
  | 'CONFIGURED'
  | 'VERIFIED'
  | 'CONFIGURATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'SENDER_NOT_VERIFIED'
  | 'RATE_LIMITED'
  | 'TEMPORARY_FAILURE'
  | 'DELIVERY_FAILED'
  | 'REAUTH_REQUIRED';

@Schema({ _id: false })
export class DnsRecord {
  @Prop({ type: String, default: '' })
  record: string;

  @Prop({ type: String, default: '' })
  name: string;

  @Prop({ type: String, default: '' })
  type: string;

  @Prop({ type: String, default: '' })
  value: string;

  @Prop({ type: String, default: 'pending' })
  status: string;

  @Prop({ type: Number })
  priority?: number;
}

export const DnsRecordSchema = SchemaFactory.createForClass(DnsRecord);

@Schema({ _id: false })
export class NotificationRules {
  @Prop({ type: Boolean, default: true })
  newWebsiteLead: boolean;

  @Prop({ type: Boolean, default: true })
  newMetaLead: boolean;

  @Prop({ type: Boolean, default: true })
  contactForm: boolean;

  @Prop({ type: Boolean, default: true })
  tokenExpiryWarning: boolean;

  @Prop({ type: Boolean, default: true })
  metaAuthFailure: boolean;

  @Prop({ type: Boolean, default: true })
  emailAuthFailure: boolean;

  @Prop({ type: Boolean, default: true })
  deliveryFailure: boolean;
}

export const NotificationRulesSchema =
  SchemaFactory.createForClass(NotificationRules);

@Schema({ timestamps: true, collection: 'emailintegrations' })
export class EmailIntegration {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: 'stackfyra-org',
    index: true,
  })
  organizationId: string;

  @Prop({
    type: String,
    enum: ['resend', 'smtp'],
    default: 'resend',
  })
  provider: 'resend' | 'smtp';

  @Prop({ type: String, default: 'Stackfyra' })
  senderName: string;

  @Prop({ type: String, default: 'noreply@stackfyra.com' })
  senderEmail: string;

  @Prop({ type: String, default: 'info@stackfyra.com' })
  replyToEmail: string;

  @Prop({ type: String, default: '' })
  apiKeyEncrypted: string;

  @Prop({ type: String, default: '' })
  apiKeyIv: string;

  @Prop({ type: String, default: '' })
  apiKeyTag: string;

  @Prop({ type: String, default: '' })
  maskedApiKey: string;

  @Prop({
    type: String,
    enum: [
      'CONFIGURED',
      'VERIFIED',
      'CONFIGURATION_ERROR',
      'AUTHENTICATION_ERROR',
      'SENDER_NOT_VERIFIED',
      'RATE_LIMITED',
      'TEMPORARY_FAILURE',
      'DELIVERY_FAILED',
      'REAUTH_REQUIRED',
    ],
    default: 'CONFIGURED',
    index: true,
  })
  status: EmailIntegrationStatus;

  @Prop({ type: String, default: 'not_started' })
  domainStatus: string;

  @Prop({ type: [DnsRecordSchema], default: [] })
  domainDnsRecords: DnsRecord[];

  @Prop({ type: [String], default: ['info@stackfyra.com'] })
  notificationRecipients: string[];

  @Prop({ type: NotificationRulesSchema, default: () => ({}) })
  notificationRules: NotificationRules;

  @Prop({ type: Date, default: null })
  lastVerifiedAt?: Date | null;

  @Prop({ type: Date, default: null })
  lastSuccessfulSendAt?: Date | null;

  @Prop({ type: String, default: '' })
  lastError?: string;

  @Prop({ type: String, default: '' })
  lastErrorCode?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailIntegrationSchema =
  SchemaFactory.createForClass(EmailIntegration);
