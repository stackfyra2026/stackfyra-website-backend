import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  FormSubmission,
  FormSubmissionSchema,
} from './schemas/form-submission.schema.js';
import { User, UserSchema } from './schemas/user.schema.js';
import {
  PasswordResetOtp,
  PasswordResetOtpSchema,
} from './schemas/password-reset-otp.schema.js';
import { Lead, LeadSchema } from './schemas/lead.schema.js';
import {
  MetaIntegration,
  MetaIntegrationSchema,
} from './schemas/meta-integration.schema.js';
import {
  MetaWebhookEvent,
  MetaWebhookEventSchema,
} from './schemas/meta-webhook-event.schema.js';
import {
  EmailIntegration,
  EmailIntegrationSchema,
} from './schemas/email-integration.schema.js';
import {
  EmailOutbox,
  EmailOutboxSchema,
} from './schemas/email-outbox.schema.js';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FormSubmission.name, schema: FormSubmissionSchema },
      { name: User.name, schema: UserSchema },
      { name: PasswordResetOtp.name, schema: PasswordResetOtpSchema },
      { name: Lead.name, schema: LeadSchema },
      { name: MetaIntegration.name, schema: MetaIntegrationSchema },
      { name: MetaWebhookEvent.name, schema: MetaWebhookEventSchema },
      { name: EmailIntegration.name, schema: EmailIntegrationSchema },
      { name: EmailOutbox.name, schema: EmailOutboxSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
