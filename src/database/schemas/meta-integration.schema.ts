import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MetaIntegrationDocument = MetaIntegration & Document;

export type MetaIntegrationStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'EXPIRED'
  | 'ERROR'
  | 'REAUTH_REQUIRED';

@Schema({ _id: false })
export class ConnectedPage {
  @Prop({ type: String, required: true })
  pageId: string;

  @Prop({ type: String, required: true })
  pageName: string;

  @Prop({ type: String, default: '' })
  category?: string;

  @Prop({ type: String, required: true })
  pageAccessTokenEncrypted: string;

  @Prop({ type: String, required: true })
  pageAccessTokenIv: string;

  @Prop({ type: String, required: true })
  pageAccessTokenTag: string;

  @Prop({ type: Boolean, default: false })
  isSubscribed: boolean;

  @Prop({ type: [String], default: [] })
  selectedForms: string[];

  @Prop({ type: String, default: 'PAGE' })
  tokenType?: 'PAGE' | 'SYSTEM_USER' | 'USER';

  @Prop({ type: Date, default: null })
  expiresAt?: Date | null;

  @Prop({ type: Date, default: null })
  dataAccessExpiresAt?: Date | null;

  @Prop({ type: Boolean, default: false })
  isNeverExpiring?: boolean;

  @Prop({ type: [String], default: [] })
  scopes?: string[];

  @Prop({ type: [String], default: [] })
  missingScopes?: string[];

  @Prop({ type: Date, default: null })
  lastValidatedAt?: Date | null;

  @Prop({ type: Date, default: null })
  lastSyncAt?: Date | null;
}

export const ConnectedPageSchema = SchemaFactory.createForClass(ConnectedPage);

@Schema({ timestamps: true, collection: 'meta_integrations' })
export class MetaIntegration {
  @Prop({
    type: String,
    required: true,
    unique: true,
    default: 'stackfyra-org',
    index: true,
  })
  organizationId: string;

  @Prop({ type: String, default: '' })
  appId?: string;

  @Prop({ type: String, default: '' })
  fbUserId?: string;

  @Prop({ type: String, default: '' })
  fbUserName?: string;

  @Prop({
    type: String,
    enum: ['CONNECTED', 'DISCONNECTED', 'EXPIRED', 'ERROR', 'REAUTH_REQUIRED'],
    default: 'DISCONNECTED',
    index: true,
  })
  status: MetaIntegrationStatus;

  @Prop({ type: String, default: '' })
  userAccessTokenEncrypted?: string;

  @Prop({ type: String, default: '' })
  userAccessTokenIv?: string;

  @Prop({ type: String, default: '' })
  userAccessTokenTag?: string;

  @Prop({ type: Date, default: null })
  tokenExpiresAt?: Date | null;

  @Prop({ type: [ConnectedPageSchema], default: [] })
  pages: ConnectedPage[];

  @Prop({ type: Boolean, default: false })
  needsReauth: boolean;

  @Prop({ type: String, default: '' })
  reauthReason?: string;

  @Prop({ type: Date, default: null })
  lastValidatedAt?: Date | null;

  @Prop({ type: Date, default: null })
  lastSuccessfulUseAt?: Date | null;

  @Prop({ type: Date, default: null })
  lastSyncAt?: Date | null;

  @Prop({ type: String, default: '' })
  lastError?: string;

  @Prop({ type: String, default: '' })
  lastErrorCode?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MetaIntegrationSchema =
  SchemaFactory.createForClass(MetaIntegration);
MetaIntegrationSchema.index({ 'pages.pageId': 1 });
