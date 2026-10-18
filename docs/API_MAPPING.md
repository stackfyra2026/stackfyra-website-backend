# Complete API Mapping Specification

This document maps all existing Next.js Route Handlers to their exact counterparts in the standalone NestJS backend.

Global API Prefix: `/api`
Swagger OpenAPI Explorer: `http://localhost:4000/api/docs`

---

## 1. Public Inquiry Endpoints

| Existing Next.js Route | HTTP Verb | Target NestJS Controller & Method | Auth Required | Description |
|---|---|---|---|---|
| `src/app/api/send-inquiry/route.ts` | `POST` | `InquiriesController.sendInquiry` (`POST /api/send-inquiry`) | Public | Validates inquiry payload, persists to `FormSubmission`, triggers notification emails & FCM admin push. |

---

## 2. Authentication & Account Recovery Endpoints

| Existing Next.js Route | HTTP Verb | Target NestJS Controller & Method | Auth Required | Description |
|---|---|---|---|---|
| `src/app/api/auth/register/route.ts` | `POST` | `AuthController.register` (`POST /api/auth/register`) | Public | Registers `@stackfyra.com` team user with role `ADMIN`. |
| `src/app/api/auth/login/route.ts` | `POST` | `AuthController.login` (`POST /api/auth/login`) | Public | Authenticates user, issues JWT, sets HTTP-only `stackfyra_session` cookie. |
| `src/app/api/auth/me/route.ts` | `GET` | `AuthController.getMe` (`GET /api/auth/me`) | JWT / Cookie | Returns authenticated user profile. |
| `src/app/api/auth/logout/route.ts` | `POST` | `AuthController.logout` (`POST /api/auth/logout`) | Public | Clears `stackfyra_session` cookie. |
| `src/app/api/auth/forgot-password/route.ts` | `POST` | `AuthController.forgotPassword` (`POST /api/auth/forgot-password`) | Public | Generates 6-digit OTP, saves in `PasswordResetOtp` (5m TTL), sends email. |
| `src/app/api/auth/verify-reset-otp/route.ts` | `POST` | `AuthController.verifyResetOtp` (`POST /api/auth/verify-reset-otp`) | Public | Verifies OTP (max 3 attempts), returns single-use `resetToken`. |
| `src/app/api/auth/reset-password/route.ts` | `POST` | `AuthController.resetPassword` (`POST /api/auth/reset-password`) | Public | Verifies `resetToken`, updates password hash, purges OTP records. |

---

## 3. Admin Submission Management Endpoints

| Existing Next.js Route | HTTP Verb | Target NestJS Controller & Method | Auth Required | Description |
|---|---|---|---|---|
| `src/app/api/admin/submissions/route.ts` | `GET` | `AdminSubmissionsController.findAll` (`GET /api/admin/submissions`) | Authenticated | Pagination, regex search, status filter, date filter, status aggregation, CSV export. |
| `src/app/api/admin/submissions/[id]/route.ts` | `GET` | `AdminSubmissionsController.findOne` (`GET /api/admin/submissions/:id`) | Authenticated | Fetch single form submission details. |
| `src/app/api/admin/submissions/[id]/route.ts` | `PATCH` | `AdminSubmissionsController.update` (`PATCH /api/admin/submissions/:id`) | Authenticated | Update submission status or assigned squad user. |
| `src/app/api/admin/submissions/[id]/route.ts` | `DELETE` | `AdminSubmissionsController.remove` (`DELETE /api/admin/submissions/:id`) | `ADMIN` Role | Permanently delete submission. |

---

## 4. Admin User Management Endpoints

| Existing Next.js Route | HTTP Verb | Target NestJS Controller & Method | Auth Required | Description |
|---|---|---|---|---|
| `src/app/api/admin/users/route.ts` | `GET` | `AdminUsersController.findAll` (`GET /api/admin/users`) | `ADMIN` Role | List team accounts with pagination and search. |
| `src/app/api/admin/users/route.ts` | `POST` | `AdminUsersController.create` (`POST /api/admin/users`) | `ADMIN` Role | Create new user account with `@stackfyra.com` restriction. |
| `src/app/api/admin/users/[id]/route.ts` | `GET` | `AdminUsersController.findOne` (`GET /api/admin/users/:id`) | `ADMIN` Role | Fetch user details without password hash. |
| `src/app/api/admin/users/[id]/route.ts` | `PATCH` | `AdminUsersController.updateProfile` (`PATCH /api/admin/users/:id`) | `ADMIN` Role | Update user name and email. |
| `src/app/api/admin/users/[id]/role/route.ts` | `PATCH` | `AdminUsersController.updateRole` (`PATCH /api/admin/users/:id/role`) | `ADMIN` Role | Update role to `ADMIN`. |
| `src/app/api/admin/users/[id]/status/route.ts` | `PATCH` | `AdminUsersController.updateStatus` (`PATCH /api/admin/users/:id/status`) | `ADMIN` Role | Toggle active status with self & last-admin protection. |

---

## 5. FCM Push Notification Endpoints

| Existing Next.js Route | HTTP Verb | Target NestJS Controller & Method | Auth Required | Description |
|---|---|---|---|---|
| `src/app/api/admin/fcm-token/route.ts` | `POST` | `NotificationsController.registerDeviceToken` (`POST /api/admin/fcm-token`) | `ADMIN` Role | Registers device token by `deviceId` for FCM push delivery. |

---

## 6. CRM Lead Management Endpoints

| Existing Next.js Route | HTTP Verb | Target NestJS Controller & Method | Auth Required | Description |
|---|---|---|---|---|
| `src/app/api/crm/leads/route.ts` | `GET` | `CrmController.findAll` (`GET /api/crm/leads`) | Authenticated | Tenant-isolated lead list, search, status/source filters, CSV export. |
| `src/app/api/crm/leads/[id]/route.ts` | `GET` | `CrmController.findOne` (`GET /api/crm/leads/:id`) | Authenticated | Fetch single lead with attribution and field responses. |
| `src/app/api/crm/leads/[id]/route.ts` | `PATCH` | `CrmController.update` (`PATCH /api/crm/leads/:id`) | Authenticated | Update status, notes, or assigned team member. |
| `src/app/api/crm/leads/[id]/route.ts` | `DELETE` | `CrmController.remove` (`DELETE /api/crm/leads/:id`) | `ADMIN` Role | Permanently delete lead. |

---

## 7. Meta Facebook & Instagram Integration Endpoints

| Existing Next.js Route | HTTP Verb | Target NestJS Controller & Method | Auth Required | Description |
|---|---|---|---|---|
| `src/app/api/meta/pages/route.ts` | `GET` | `MetaController.getPages` (`GET /api/meta/pages`) | Authenticated | Returns authorized Pages with decrypted tokens stripped. |
| `src/app/api/meta/forms/route.ts` | `GET` | `MetaController.getForms` (`GET /api/meta/forms`) | Authenticated | Retrieves lead forms for an authorized Page. |
| `src/app/api/meta/forms/route.ts` | `POST` | `MetaController.updateForms` (`POST /api/meta/forms`) | Authenticated | Updates enabled form subscriptions for a Page. |
| `src/app/api/meta/connect/route.ts` | `GET` | `MetaController.getConnectUrl` (`GET /api/meta/connect`) | `ADMIN` Role | Generates official Meta OAuth URL with random state. |
| `src/app/api/meta/connect/route.ts` | `POST` | `MetaController.connect` (`POST /api/meta/connect`) | `ADMIN` Role | Connects via OAuth code or direct Page Access Token with AES-256-GCM encryption. |
| `src/app/api/meta/disconnect/route.ts` | `POST` | `MetaController.disconnect` (`POST /api/meta/disconnect`) | `ADMIN` Role | Unsubscribes Pages and wipes encrypted tokens. |
| `src/app/api/meta/status/route.ts` | `GET` | `MetaController.getStatus` (`GET /api/meta/status`) | Authenticated | Health overview, auto-sync from environment, scheduler status. |
| `src/app/api/meta/sync/route.ts` | `GET` / `POST` | `MetaController.sync` (`GET` & `POST /api/meta/sync`) | Session or Cron Bearer | Reconciles recent leads and processes pending webhook events. |

---

## 8. Webhook Endpoints

| Existing Next.js Route | HTTP Verb | Target NestJS Controller & Method | Auth Required | Description |
|---|---|---|---|---|
| `src/app/api/webhooks/meta/route.ts` | `GET` | `WebhooksController.verifyMetaWebhook` (`GET /api/webhooks/meta`) | Public (`hub.verify_token`) | Handles Meta challenge verification (`hub.challenge`). |
| `src/app/api/webhooks/meta/route.ts` | `POST` | `WebhooksController.receiveMetaWebhook` (`POST /api/webhooks/meta`) | Public (`x-hub-signature-256`) | Real-time lead ingest, signature verification, idempotency. |
| `src/app/api/webhooks/resend/route.ts` | `POST` | `WebhooksController.receiveResendWebhook` (`POST /api/webhooks/resend`) | Public (`svix-signature`) | Resend delivery, bounce, and complaint tracking. |

---

## 9. Admin Integration Endpoints

| Existing Next.js Route | HTTP Verb | Target NestJS Controller & Method | Auth Required | Description |
|---|---|---|---|---|
| `src/app/api/admin/integrations/meta/validate/route.ts` | `POST` | `IntegrationsController.validateMetaToken` (`POST /api/admin/integrations/meta/validate`) | `ADMIN` Role | Validates token scopes and expiry via Graph API. |
| `src/app/api/admin/integrations/meta/token/route.ts` | `POST` | `IntegrationsController.saveMetaToken` (`POST /api/admin/integrations/meta/token`) | `ADMIN` Role | Saves and encrypts page token with overwrite guard. |
| `src/app/api/admin/integrations/meta/status/route.ts` | `GET` | `IntegrationsController.getMetaStatus` (`GET /api/admin/integrations/meta/status`) | `ADMIN` Role | Sanitized Meta integration status. |
| `src/app/api/admin/integrations/meta/reauthorize/route.ts` | `POST` | `IntegrationsController.reauthorizeMeta` (`POST /api/admin/integrations/meta/reauthorize`) | `ADMIN` Role | Flags Meta integration for reauthorization. |
| `src/app/api/admin/integrations/email/validate/route.ts` | `POST` | `IntegrationsController.validateEmail` (`POST /api/admin/integrations/email/validate`) | `ADMIN` Role | Validates Resend API key and domain status. |
| `src/app/api/admin/integrations/email/test/route.ts` | `POST` | `IntegrationsController.sendTestEmail` (`POST /api/admin/integrations/email/test`) | `ADMIN` Role | Sends verification test email to designated recipient. |
| `src/app/api/admin/integrations/email/status/route.ts` | `GET` | `IntegrationsController.getEmailStatus` (`GET /api/admin/integrations/email/status`) | `ADMIN` Role | Email settings and outbox queue counters. |
| `src/app/api/admin/integrations/email/retry/route.ts` | `POST` | `IntegrationsController.retryEmailJobs` (`POST /api/admin/integrations/email/retry`) | `ADMIN` Role | Manual outbox retry processor. |
| `src/app/api/admin/integrations/email/jobs/route.ts` | `GET` | `IntegrationsController.getEmailJobs` (`GET /api/admin/integrations/email/jobs`) | `ADMIN` Role | List outbox jobs (excluding heavy HTML body). |
| `src/app/api/admin/integrations/email/jobs/route.ts` | `DELETE` | `IntegrationsController.deleteEmailJobs` (`DELETE /api/admin/integrations/email/jobs`) | `ADMIN` Role | Clear specific or all outbox jobs. |
| `src/app/api/admin/integrations/email/configure/route.ts` | `POST` | `IntegrationsController.configureEmail` (`POST /api/admin/integrations/email/configure`) | `ADMIN` Role | Configures Resend credentials, sender info, recipients, and alert rules. |
