import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type MetaWebhookEventDocument = MetaWebhookEvent & Document;

export type WebhookEventStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

@Schema({ timestamps: true, collection: 'meta_webhook_events' })
export class MetaWebhookEvent {
  @Prop({
    type: String,
    required: true,
    unique: true,
    index: true,
  })
  eventId: string;

  @Prop({
    type: String,
    required: true,
    index: true,
  })
  externalLeadId: string;

  @Prop({ type: String, index: true })
  pageId?: string;

  @Prop({ type: String, index: true })
  formId?: string;

  @Prop({ type: String })
  adId?: string;

  @Prop({
    type: String,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
    index: true,
  })
  status: WebhookEventStatus;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: Number, default: 5 })
  maxAttempts: number;

  @Prop({ type: String, default: '' })
  lastError?: string;

  @Prop({ type: String, default: '' })
  lastErrorCode?: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  payload?: any;

  @Prop({ type: Date, default: Date.now })
  receivedAt: Date;

  @Prop({ type: Date, default: null })
  processedAt?: Date;

  @Prop({ type: Date, default: null, index: true })
  nextRetryAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MetaWebhookEventSchema =
  SchemaFactory.createForClass(MetaWebhookEvent);
MetaWebhookEventSchema.index({ status: 1, nextRetryAt: 1 });
MetaWebhookEventSchema.index({ createdAt: -1 });
