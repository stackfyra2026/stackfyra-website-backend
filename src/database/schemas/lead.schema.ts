import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type LeadDocument = Lead & Document;

export type LeadSource =
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'WEBSITE'
  | 'GOOGLE_ADS'
  | 'LINKEDIN'
  | 'OTHER';

export type LeadSourceProvider = 'META' | 'MANUAL' | 'WEBSITE' | 'OTHER';

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'IN_PROGRESS'
  | 'CONVERTED'
  | 'CLOSED';

export type LeadSyncStatus = 'SUCCESS' | 'PENDING' | 'FAILED';

@Schema({ _id: false })
export class LeadFieldData {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: [String], default: [] })
  values: string[];
}

export const LeadFieldDataSchema = SchemaFactory.createForClass(LeadFieldData);

@Schema({ timestamps: true, collection: 'leads' })
export class Lead {
  @Prop({ type: String, default: 'stackfyra-org', index: true })
  organizationId: string;

  @Prop({
    type: String,
    enum: [
      'FACEBOOK',
      'INSTAGRAM',
      'WEBSITE',
      'GOOGLE_ADS',
      'LINKEDIN',
      'OTHER',
    ],
    default: 'FACEBOOK',
    index: true,
  })
  source: LeadSource;

  @Prop({
    type: String,
    enum: ['META', 'MANUAL', 'WEBSITE', 'OTHER'],
    default: 'META',
    index: true,
  })
  sourceProvider: LeadSourceProvider;

  @Prop({
    type: String,
    sparse: true,
    unique: true,
    index: true,
  })
  externalLeadId?: string;

  @Prop({ type: String, index: true })
  pageId?: string;

  @Prop({ type: String, trim: true })
  pageName?: string;

  @Prop({ type: String, index: true })
  formId?: string;

  @Prop({ type: String, trim: true })
  formName?: string;

  @Prop({ type: String, index: true })
  campaignId?: string;

  @Prop({ type: String, trim: true })
  campaignName?: string;

  @Prop({ type: String })
  adSetId?: string;

  @Prop({ type: String, trim: true })
  adSetName?: string;

  @Prop({ type: String })
  adId?: string;

  @Prop({ type: String, trim: true })
  adName?: string;

  @Prop({ type: String, trim: true })
  fullName?: string;

  @Prop({
    type: String,
    lowercase: true,
    trim: true,
    index: true,
  })
  email?: string;

  @Prop({ type: String, trim: true })
  phone?: string;

  @Prop({ type: String, trim: true })
  company?: string;

  @Prop({ type: [LeadFieldDataSchema], default: [] })
  fieldData: LeadFieldData[];

  @Prop({ type: Date, default: null, index: true })
  leadCreatedAt?: Date;

  @Prop({ type: Date, default: Date.now })
  importedAt: Date;

  @Prop({
    type: String,
    enum: ['NEW', 'CONTACTED', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'],
    default: 'NEW',
    index: true,
  })
  status: LeadStatus;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  })
  assignedTo?: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['SUCCESS', 'PENDING', 'FAILED'],
    default: 'SUCCESS',
  })
  syncStatus: LeadSyncStatus;

  @Prop({ type: String, default: '' })
  notes?: string;

  @Prop({ type: Boolean, default: false })
  isOrganic?: boolean;

  @Prop({ type: String, default: 'fb' })
  platform?: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  rawPayload?: any;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);

// Compound indexes matching the Next.js database schema
LeadSchema.index({ organizationId: 1, createdAt: -1 });
LeadSchema.index({ organizationId: 1, source: 1, status: 1 });
LeadSchema.index({ organizationId: 1, pageId: 1, formId: 1 });
