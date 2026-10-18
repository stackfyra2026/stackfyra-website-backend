# MongoDB Database Schema Mapping

This document provides the exact collection schemas, indexes, and type mappings between the existing Next.js Mongoose models and the new NestJS application.

---

## 1. `formsubmissions` (Model: `FormSubmission`)

Captures lead submissions, quick inquiries, and consultation bookings.

```typescript
@Schema({ timestamps: true, collection: 'formsubmissions' })
export class FormSubmission {
  @Prop({
    type: String,
    enum: ['quick-inquiry', 'book-consultation', 'landing-page-lead'],
    required: true,
    default: 'quick-inquiry',
  })
  type: string;

  @Prop({ type: String, trim: true })
  name?: string;

  @Prop({ type: String, required: true, lowercase: true, trim: true, index: true })
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
  status: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
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
}

// Indexes
// FormSubmissionSchema.index({ createdAt: -1 });
```

---

## 2. `users` (Model: `User`)

Stores team accounts strictly restricted to `@stackfyra.com`.

```typescript
@Schema({ _id: false })
export class Device {
  @Prop({ type: String, required: true })
  deviceId: string;

  @Prop({ type: String, required: true })
  token: string;

  @Prop({ type: String, default: '' })
  userAgent?: string;

  @Prop({ type: Date, default: Date.now })
  updatedAt: Date;
}

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ type: String, required: true, trim: true })
  name: string;

  @Prop({
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({ type: String, required: true })
  passwordHash: string;

  @Prop({ type: String, enum: ['ADMIN'], default: 'ADMIN' })
  role: string;

  @Prop({ type: Boolean, default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null })
  createdBy?: Types.ObjectId;

  @Prop({ type: Date, default: null })
  lastLoginAt?: Date;

  @Prop({ type: [Device], default: [] })
  devices: Device[];
}
```

---

## 3. `passwordresetotps` (Model: `PasswordResetOtp`)

Manages 6-digit verification codes for password recovery.

```typescript
@Schema({ timestamps: true, collection: 'passwordresetotps' })
export class PasswordResetOtp {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: String, required: true, lowercase: true, trim: true, index: true })
  email: string;

  @Prop({ type: String, required: true })
  otpHash: string;

  @Prop({ type: Date, required: true })
  expiresAt: Date;

  @Prop({ type: Number, default: 0 })
  attempts: number;

  @Prop({ type: Date, default: null })
  consumedAt?: Date;

  @Prop({ type: String, default: null, index: true })
  resetTokenHash?: string;
}

// TTL Index
// PasswordResetOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
```

---

## 4. `leads` (Model: `Lead`)

Permanent event store for CRM and Meta Facebook/Instagram Lead Ads leads.

```typescript
@Schema({ _id: false })
export class LeadFieldData {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: [String], default: [] })
  values: string[];
}

@Schema({ timestamps: true, collection: 'leads' })
export class Lead {
  @Prop({ type: String, default: 'stackfyra-org', index: true })
  organizationId: string;

  @Prop({
    type: String,
    enum: ['FACEBOOK', 'INSTAGRAM', 'WEBSITE', 'GOOGLE_ADS', 'LINKEDIN', 'OTHER'],
    default: 'FACEBOOK',
    index: true,
  })
  source: string;

  @Prop({
    type: String,
    enum: ['META', 'MANUAL', 'WEBSITE', 'OTHER'],
    default: 'META',
    index: true,
  })
  sourceProvider: string;

  @Prop({ type: String, sparse: true, unique: true, index: true })
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

  @Prop({ type: String, lowercase: true, trim: true, index: true })
  email?: string;

  @Prop({ type: String, trim: true })
  phone?: string;

  @Prop({ type: String, trim: true })
  company?: string;

  @Prop({ type: [LeadFieldData], default: [] })
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
  status: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', default: null, index: true })
  assignedTo?: Types.ObjectId;

  @Prop({
    type: String,
    enum: ['SUCCESS', 'PENDING', 'FAILED'],
    default: 'SUCCESS',
  })
  syncStatus: string;

  @Prop({ type: String, default: '' })
  notes?: string;

  @Prop({ type: Boolean, default: false })
  isOrganic?: boolean;

  @Prop({ type: String, default: 'fb' })
  platform?: string;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  rawPayload?: any;
}

// Compound Indexes
// LeadSchema.index({ organizationId: 1, createdAt: -1 });
// LeadSchema.index({ organizationId: 1, source: 1, status: 1 });
// LeadSchema.index({ organizationId: 1, pageId: 1, formId: 1 });
```

---

## 5. `meta_integrations` (Model: `MetaIntegration`)

Stores connected Facebook/Instagram Pages with AES-256-GCM encrypted tokens.

```typescript
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
  tokenType?: string;

  @Prop({ type: Date, default: null })
  expiresAt?: Date;

  @Prop({ type: Date, default: null })
  dataAccessExpiresAt?: Date;

  @Prop({ type: Boolean, default: false })
  isNeverExpiring?: boolean;

  @Prop({ type: [String], default: [] })
  scopes: string[];

  @Prop({ type: [String], default: [] })
  missingScopes: string[];

  @Prop({ type: Date, default: null })
  lastValidatedAt?: Date;

  @Prop({ type: Date, default: null })
  lastSyncAt?: Date;
}

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
  status: string;

  @Prop({ type: String, default: '' })
  userAccessTokenEncrypted?: string;

  @Prop({ type: String, default: '' })
  userAccessTokenIv?: string;

  @Prop({ type: String, default: '' })
  userAccessTokenTag?: string;

  @Prop({ type: Date, default: null })
  tokenExpiresAt?: Date;

  @Prop({ type: [ConnectedPage], default: [] })
  pages: ConnectedPage[];

  @Prop({ type: Boolean, default: false })
  needsReauth: boolean;

  @Prop({ type: String, default: '' })
  reauthReason?: string;

  @Prop({ type: Date, default: null })
  lastValidatedAt?: Date;

  @Prop({ type: Date, default: null })
  lastSuccessfulUseAt?: Date;

  @Prop({ type: Date, default: null })
  lastSyncAt?: Date;

  @Prop({ type: String, default: '' })
  lastError?: string;

  @Prop({ type: String, default: '' })
  lastErrorCode?: string;
}
```

---

## 6. `meta_webhook_events` (Model: `MetaWebhookEvent`)

Durable event log for incoming Meta Lead Ads notifications.

```typescript
@Schema({ timestamps: true, collection: 'meta_webhook_events' })
export class MetaWebhookEvent {
  @Prop({ type: String, required: true, unique: true, index: true })
  eventId: string;

  @Prop({ type: String, required: true, index: true })
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
  status: string;

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
}
```

---

## 7. `emailintegrations` (Model: `EmailIntegration`)

Persisted Resend email configuration, DNS status, and alert dispatch preferences.

```typescript
@Schema({ timestamps: true, collection: 'emailintegrations' })
export class EmailIntegration {
  @Prop({ type: String, required: true, unique: true, default: 'stackfyra-org', index: true })
  organizationId: string;

  @Prop({ type: String, enum: ['resend', 'smtp'], default: 'resend' })
  provider: string;

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
  status: string;

  @Prop({ type: String, default: 'not_started' })
  domainStatus: string;

  @Prop({ type: [Object], default: [] })
  domainDnsRecords: any[];

  @Prop({ type: [String], default: ['info@stackfyra.com'] })
  notificationRecipients: string[];

  @Prop({ type: Object, default: () => ({}) })
  notificationRules: any;

  @Prop({ type: Date, default: null })
  lastVerifiedAt?: Date;

  @Prop({ type: Date, default: null })
  lastSuccessfulSendAt?: Date;

  @Prop({ type: String, default: '' })
  lastError?: string;

  @Prop({ type: String, default: '' })
  lastErrorCode?: string;
}
```

---

## 8. `emailoutboxes` (Model: `EmailOutbox`)

Durable outbox jobs with retry scheduling and 24-hour retention TTL.

```typescript
@Schema({ timestamps: true, collection: 'emailoutboxes' })
export class EmailOutbox {
  @Prop({ type: String, required: true, unique: true, index: true })
  jobId: string;

  @Prop({ type: String, required: true, unique: true, index: true })
  idempotencyKey: string;

  @Prop({ type: String, required: true, index: true })
  recipient: string;

  @Prop({ type: String, default: '' })
  replyTo?: string;

  @Prop({ type: String, required: true, index: true })
  type: string;

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
  status: string;

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

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Lead', default: null, index: true })
  leadId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata?: Record<string, any>;
}

// TTL Index
// EmailOutboxSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
```
