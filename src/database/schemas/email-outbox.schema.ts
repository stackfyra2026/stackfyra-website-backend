import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type EmailOutboxDocument = EmailOutbox & Document;

export type OutboxJobStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'BOUNCED'
  | 'FAILED';

export type OutboxJobType =
  | 'NEW_WEBSITE_LEAD'
  | 'NEW_META_LEAD'
  | 'CONTACT_FORM'
  | 'LEAD_CONFIRMATION'
  | 'TOKEN_EXPIRY_WARNING'
  | 'META_AUTH_FAILURE'
  | 'EMAIL_AUTH_FAILURE'
  | 'DELIVERY_FAILURE'
  | 'PASSWORD_RESET'
  | 'TEST_EMAIL';

@Schema({ timestamps: true, collection: 'emailoutboxes' })
export class EmailOutbox {
  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
  })
  jobId: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
  })
  idempotencyKey: string;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  recipient: string;

  @Prop({ type: String, default: '' })
  replyTo?: string;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  type: OutboxJobType;

  @Prop({ type: String, required: true })
  subject: string;

  @Prop({ type: String, required: true })
  htmlContent: string;

  @Prop({ type: String, required: true })
  textContent: string;

  @Prop({ type: String, default: 'resend' })
  provider: string;

  @Prop({ type: String, default: '', index: true })
  providerMessageId?: string;

  @Prop({
    type: String,
    enum: ['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED'],
    default: 'QUEUED',
    index: true,
  })
  status: OutboxJobStatus;

  @Prop({ type: Number, default: 0 })
  retryCount: number;

  @Prop({ type: Number, default: 5 })
  maxRetries: number;

  @Prop({ type: Date, default: Date.now, index: true })
  nextRetryAt: Date;

  @Prop({ type: String, default: '' })
  lastError?: string;

  @Prop({ type: String, default: '' })
  lastErrorCode?: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Lead',
    default: null,
    index: true,
  })
  leadId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata?: Record<string, any>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailOutboxSchema = SchemaFactory.createForClass(EmailOutbox);
EmailOutboxSchema.index({ status: 1, nextRetryAt: 1 });
EmailOutboxSchema.index({ createdAt: -1 });
// Auto-delete records older than 24 hours (86400 seconds)
EmailOutboxSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
