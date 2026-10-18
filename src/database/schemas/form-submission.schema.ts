import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type FormSubmissionDocument = FormSubmission & Document;

export type SubmissionStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'IN_PROGRESS'
  | 'CONVERTED'
  | 'CLOSED';

export type SubmissionType =
  | 'quick-inquiry'
  | 'book-consultation'
  | 'landing-page-lead';

@Schema({ timestamps: true, collection: 'formsubmissions' })
export class FormSubmission {
  @Prop({
    type: String,
    enum: ['quick-inquiry', 'book-consultation', 'landing-page-lead'],
    required: true,
    default: 'quick-inquiry',
  })
  type: SubmissionType;

  @Prop({ type: String, trim: true })
  name?: string;

  @Prop({
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({ type: String, trim: true })
  phone?: string;

  @Prop({ type: String, trim: true })
  company?: string;

  @Prop({ type: String, trim: true })
  country?: string;

  @Prop({ type: String, trim: true })
  service?: string;

  @Prop({ type: String, trim: true })
  projectType?: string;

  @Prop({ type: String, trim: true })
  budgetRange?: string;

  @Prop({ type: String, trim: true })
  timeline?: string;

  @Prop({ type: String, trim: true })
  projectDescription?: string;

  @Prop({ type: String, trim: true })
  project?: string;

  @Prop({ type: String, trim: true })
  preferredContact?: string;

  @Prop({ type: String, trim: true })
  message?: string;

  @Prop({ type: String, default: 'Stackfyra Website' })
  source?: string;

  @Prop({
    type: String,
    enum: ['NEW', 'CONTACTED', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'],
    default: 'NEW',
    index: true,
  })
  status: SubmissionStatus;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    default: null,
  })
  assignedTo?: Types.ObjectId;

  @Prop({ type: String, trim: true })
  utm_source?: string;

  @Prop({ type: String, trim: true })
  utm_medium?: string;

  @Prop({ type: String, trim: true })
  utm_campaign?: string;

  @Prop({ type: String, trim: true })
  utm_term?: string;

  @Prop({ type: String, trim: true })
  utm_content?: string;

  @Prop({ type: String, trim: true })
  gclid?: string;

  @Prop({ type: String, trim: true })
  fbclid?: string;

  @Prop({ type: String, trim: true })
  city?: string;

  @Prop({ type: String, trim: true })
  region?: string;

  @Prop({ type: String, trim: true })
  country_name?: string;

  @Prop({ type: String, trim: true })
  postal?: string;

  @Prop({ type: String, trim: true })
  timezone?: string;

  @Prop({ type: Number })
  latitude?: number;

  @Prop({ type: Number })
  longitude?: number;

  @Prop({ type: String, trim: true })
  currency?: string;

  @Prop({ type: String, trim: true })
  ip?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const FormSubmissionSchema =
  SchemaFactory.createForClass(FormSubmission);
FormSubmissionSchema.index({ createdAt: -1 });
