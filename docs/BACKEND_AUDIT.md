# Stackfyra Backend Audit Report

## 1. Executive Summary

This document presents a comprehensive audit of the backend architecture in the `stackfyra-website` repository. The application is a Next.js (version 16.3.3) project containing both client-facing frontend features and server-side backend functionality (API route handlers, database ODM layer, background scheduler, encryption utilities, authentication system, email outbox dispatching, Firebase push notifications, and Meta Facebook/Instagram Lead Ads integrations).

The Next.js project is strictly **READ-ONLY** and will remain unchanged. All backend functionality identified in this audit is migrated into a standalone NestJS application under `backend-nestjs/`.

---

## 2. Classification of System Components

### Category A: Backend Functionality to Migrate to NestJS
All server-side logic residing under `src/app/api/**`, `src/lib/models/**`, `src/lib/meta/**`, and server utilities in `src/lib/`:
1. **Public Lead Capture & Form Inquiries**:
   - `src/app/api/send-inquiry/route.ts`: Validates inquiries, writes to MongoDB `FormSubmission`, triggers admin email notification, triggers prospect confirmation email, and dispatches Firebase Cloud Messaging (FCM) admin push notification.
2. **Authentication & Session Management**:
   - `src/lib/auth.ts`: Domain restriction (`@stackfyra.com`), bcrypt password hashing, JWT creation/verification, cookie and bearer token extraction, admin authorization guard.
   - `src/app/api/auth/register/route.ts`: Restricted account registration.
   - `src/app/api/auth/login/route.ts`: Login with domain validation, bcrypt verification, HTTP-only cookie + JWT response.
   - `src/app/api/auth/me/route.ts`: User profile retrieval.
   - `src/app/api/auth/logout/route.ts`: Session cookie invalidation.
   - `src/app/api/auth/forgot-password/route.ts`: Generates 6-digit OTP, stores in MongoDB with 5-minute TTL, dispatches Resend OTP email.
   - `src/app/api/auth/verify-reset-otp/route.ts`: Verifies OTP (max 3 attempts), issues single-use reset authorization token.
   - `src/app/api/auth/reset-password/route.ts`: Validates single-use token and updates password hash.
3. **Admin Submission Management**:
   - `src/app/api/admin/submissions/route.ts`: Pagination, regex search, status filtering, date range filtering, status aggregation, and CSV export.
   - `src/app/api/admin/submissions/[id]/route.ts`: Details, status/assignment updates, and permanent deletion (Admin restricted).
4. **Admin User Management**:
   - `src/app/api/admin/users/route.ts`: List users with pagination, create team users with `@stackfyra.com` restriction.
   - `src/app/api/admin/users/[id]/route.ts`: View and update user profile.
   - `src/app/api/admin/users/[id]/role/route.ts`: Update role.
   - `src/app/api/admin/users/[id]/status/route.ts`: Toggle active status with safeguards against self-deactivation and deactivating the last active administrator.
5. **FCM Push Notification Registration**:
   - `src/app/api/admin/fcm-token/route.ts`: Multi-device registration, token upsert by `deviceId`.
   - `src/lib/notifications.ts` & `src/lib/firebaseAdmin.ts`: Firebase Admin SDK initialization, multicast delivery to active admin device tokens, automatic invalid token cleanup.
6. **CRM Lead Management**:
   - `src/app/api/crm/leads/route.ts`: Tenant-isolated (`stackfyra-org`) query, search, filtering (platform, status, date, assignedTo), CSV export.
   - `src/app/api/crm/leads/[id]/route.ts`: View lead details (custom question answers, attribution), update status/notes/assignment, delete lead.
7. **Meta Facebook & Instagram Integration**:
   - `src/lib/meta/encryption.ts`: AES-256-GCM encryption/decryption with random 12-byte IV and auth tag, secret masking.
   - `src/lib/meta/signature.ts`: HMAC-SHA256 signature verification (`x-hub-signature-256`) using `crypto.timingSafeEqual`.
   - `src/lib/meta/meta-lead-ads.ts`: OAuth code exchange, 60-day long-lived token exchange, Graph API leadgen retrieval, lead normalization, webhook subscription (`subscribed_apps`), form leads fetching, reconciliation.
   - `src/lib/meta/sync-scheduler.ts`: 60-minute periodic background synchronization, pending event processor, form leads reconciliation.
   - `src/app/api/meta/pages/route.ts`: List connected pages (stripped of secrets).
   - `src/app/api/meta/forms/route.ts`: Retrieve page lead forms and update form selections.
   - `src/app/api/meta/connect/route.ts`: Generate OAuth URL or accept direct Page/System User token.
   - `src/app/api/meta/disconnect/route.ts`: Unsubscribe page/integration and purge stored tokens.
   - `src/app/api/meta/status/route.ts`: Health diagnostics, stats, and scheduler status.
   - `src/app/api/meta/sync/route.ts`: Manual / cron-triggered reconciliation endpoint.
   - `src/app/api/admin/integrations/meta/validate/route.ts`: Validates token scopes and permissions.
   - `src/app/api/admin/integrations/meta/token/route.ts`: Stores page access token with confirmation check.
   - `src/app/api/admin/integrations/meta/status/route.ts`: Status endpoint.
   - `src/app/api/admin/integrations/meta/reauthorize/route.ts`: Triggers reauthorization state.
8. **Email Integration & Outbox Queue**:
   - `src/lib/email-service.ts`: Centralized Resend client with connection pooling, credentials loading with fallback, outbox queue (`EmailOutbox`), immediate dispatch with graceful simulation mode, retry with bounded exponential backoff, loop prevention, and alert dispatching.
   - `src/lib/email.ts`: Responsive email HTML templates (Header, Footer, Lead Notification, Meta Lead Alert, Security OTP, Lead Confirmation, Integration Alert).
   - `src/app/api/admin/integrations/email/validate/route.ts`: Verifies Resend credentials and domain status.
   - `src/app/api/admin/integrations/email/test/route.ts`: Dispatches test email.
   - `src/app/api/admin/integrations/email/status/route.ts`: Outbox queue statistics and status.
   - `src/app/api/admin/integrations/email/retry/route.ts`: Manual queue retry processor.
   - `src/app/api/admin/integrations/email/jobs/route.ts`: List and clear outbox jobs.
   - `src/app/api/admin/integrations/email/configure/route.ts`: Configures Resend credentials, sender info, notification recipients, and notification rules.
9. **Webhooks**:
   - `src/app/api/webhooks/meta/route.ts`: GET for Meta webhook handshake verification (`hub.challenge`), POST for signed leadgen event ingest with idempotency (`meta_lead_${id}`).
   - `src/app/api/webhooks/resend/route.ts`: Svix/Resend signature verification, outbox delivery status updates (`email.delivered`, `email.bounced`, `email.complained`).

### Category B: Frontend Functionality to Remain in Next.js
- `src/app/page.tsx`, `src/app/HomeContent.tsx`
- `src/app/about/**`, `src/app/contact/**`, `src/app/pricing/**`, `src/app/privacy/**`, `src/app/services/**`, `src/app/work/**`
- `src/app/admin/page.tsx`, `src/app/admin/login/**`, `src/app/admin/forgot-password/**`
- `src/components/**` (UI components, modals, managers)
- Client helpers: `src/lib/geo.ts` (client-side browser IP geolocation capture), `src/lib/utm.ts` (client-side browser UTM parameter storage), `src/lib/firebaseClient.ts` (client-side service worker registration).

### Category C: Shared / Contractual Requirements
- **Server Actions**: An audit across `src/` confirmed **zero** Server Actions (`'use server'`). The architecture exclusively uses Next.js Route Handlers.
- **REST API Contract**: Complete parity with existing URL paths, HTTP verbs, payload parameters, and responses ensures future frontend integration requires only pointing `API_BASE_URL` to NestJS.

### Category D: External Integrations & Infrastructure
- **MongoDB**: Connection string `MONGODB_URI`, 8 collections.
- **Resend**: API key for transactional emails, domain verification.
- **Firebase Admin SDK**: Service account credentials (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) for FCM push notifications.
- **Meta Graph API**: `v26.0`, App ID, App Secret, Webhook Verify Token, Page Access Tokens.

---

## 3. Database Models Summary
1. `FormSubmission` (inquiries collection)
2. `User` (team users with devices subdocument array)
3. `PasswordResetOtp` (TTL indexed OTP documents)
4. `Lead` (Meta & CRM leads, compound indexed)
5. `MetaIntegration` (connected pages with AES-256-GCM tokens)
6. `MetaWebhookEvent` (idempotent webhook event queue)
7. `EmailIntegration` (Resend configuration, DNS records, notification rules)
8. `EmailOutbox` (durable email jobs queue with TTL index)
