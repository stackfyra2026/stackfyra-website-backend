# Stackfyra Enterprise CRM & Backend API (NestJS + MongoDB)

Standalone NestJS REST API application migrated from the Next.js full-stack repository. Exposes contact inquiry processing, admin lead submissions, enterprise RBAC authentication, full CRM pipeline, Meta Graph API v26.0 Lead Ads integration, and Resend transactional email queueing via MongoDB Outbox.

---

## 1. Architectural Highlights

- **Framework:** NestJS 12 (TypeScript, ESM with NodeNext resolution).
- **Database / ODM:** MongoDB via `@nestjs/mongoose` and Mongoose 9.
- **Validation:** `class-validator` and `class-transformer` with global validation pipes.
- **Authentication:** JWT Bearer tokens and `stackfyra_session` HTTP-only cookies; corporate `@stackfyra.com` restriction.
- **API Documentation:** Interactive Swagger / OpenAPI documentation available at `/api/docs`.
- **Integrations:**
  - **Meta Lead Ads:** Graph API v26.0 OAuth, webhook subscription, timing-safe HMAC-SHA256 signature verification, and automated 60-minute reconciliation cron.
  - **Email Service:** Resend integration with AES-256-GCM encrypted API key storage, loop prevention, simulation mode, and a durable MongoDB `EmailOutbox` queue.
  - **Push Notifications:** Firebase Admin SDK with multi-device FCM multicast and stale token pruning.

---

## 2. Project Directory Structure

```text
backend-nestjs/
├── docs/
│   ├── BACKEND_AUDIT.md        # Comprehensive inventory of migrated endpoints & services
│   ├── MIGRATION_PLAN.md       # Phased migration roadmap and technical choices
│   ├── API_MAPPING.md          # 1:1 mapping of Next.js Route Handlers to NestJS controllers
│   ├── DATABASE_SCHEMA.md      # Exact Mongoose schema and index specifications
│   ├── AUTHENTICATION.md       # JWT, session cookies, password reset OTP, and RBAC
│   ├── INTEGRATIONS.md         # Meta Graph API, Resend Outbox, and Firebase FCM
│   └── TEST_REPORT.md          # Complete test execution results & verification
├── src/
│   ├── common/                 # Guards, decorators, filters, interceptors, and utils
│   ├── database/               # Mongoose schemas for all 8 collections & DatabaseModule
│   ├── modules/
│   │   ├── auth/               # 7 authentication routes & JWT passport strategy
│   │   ├── inquiries/          # Public lead inquiry capture & confirmation emails
│   │   ├── admin-submissions/  # 4 administrative submission query & export routes
│   │   ├── admin-users/        # 6 user management, role, and activation routes
│   │   ├── crm/                # 4 CRM pipeline, filter, status, and CSV export routes
│   │   ├── meta/               # 8 Meta Graph API OAuth, Pages, forms, and sync routes
│   │   ├── email/              # Centralized Resend service & outbox retry scheduler
│   │   ├── notifications/      # FCM push notifications & admin device registration
│   │   ├── integrations/       # Administrative Meta & Resend configuration routes
│   │   └── webhooks/           # Meta handshake / leadgen & Resend delivery webhooks
│   ├── app.controller.ts       # Health check & root endpoints
│   ├── app.module.ts           # Root module with MongoDB connection and global providers
│   └── main.ts                 # Bootstrap, Swagger, CORS, validation, rawBody, cookie-parser
├── .env.example                # Sanitized configuration template
└── README.md                   # This file
```

---

## 3. Getting Started

### Prerequisites

- Node.js >= 20.0.0 (Node v24.21.0 recommended)
- MongoDB instance (local or MongoDB Atlas connection URI)
- npm >= 10.0.0

### Installation

```bash
cd backend-nestjs
npm install
```

### Environment Configuration

Create a `.env` file in the root of `backend-nestjs/` based on `.env.example`:

```bash
cp .env.example .env
```

Key environment variables:

| Variable | Description | Default / Example |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP server port | `4000` |
| `API_PREFIX` | Global API prefix | `api` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/stackfyra` |
| `FRONTEND_ORIGIN` | Allowed CORS origin(s) | `http://localhost:3000` |
| `JWT_SECRET` | Secret for signing JWT tokens | `<strong_random_secret>` |
| `TOKEN_ENCRYPTION_KEY` | 32-byte secret for AES-256-GCM | `<32_character_hex_secret>` |
| `META_APP_ID` | Meta App ID | `<meta_app_id>` |
| `META_APP_SECRET` | Meta App Secret for webhook HMAC | `<meta_app_secret>` |
| `META_WEBHOOK_VERIFY_TOKEN` | Verification token for Meta webhook handshake | `<verification_token>` |
| `RESEND_API_KEY` | Resend API key for transactional email | `re_...` |
| `EMAIL_FROM` | Sender address | `info@stackfyra.com` |

---

## 4. Running the Application

### Development Mode

```bash
npm run start:dev
```

### Production Build & Run

```bash
npm run build
npm run start:prod
```

Once running:
- **API Base:** `http://localhost:4000/api`
- **Health Check:** `http://localhost:4000/api/health`
- **Swagger Documentation:** `http://localhost:4000/api/docs`

---

## 5. Running Tests

The test suite runs using Vitest and covers utilities, cryptography, authentication, and core domain services:

```bash
# Run all unit tests
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 6. API Endpoints Overview

All endpoints are prefixed with `/api`. For full interactive schemas and request/response examples, visit `http://localhost:4000/api/docs`.

### Public Endpoints
- `GET  /api/health` — Service health and uptime
- `POST /api/send-inquiry` — Lead capture form submission
- `POST /api/auth/register` — Initial admin registration (`@stackfyra.com` only)
- `POST /api/auth/login` — Authentication via email and password
- `POST /api/auth/forgot-password` — Request password reset OTP
- `POST /api/auth/verify-reset-otp` — Verify 6-digit reset code
- `POST /api/auth/reset-password` — Set new password using verified OTP
- `GET  /api/webhooks/meta` — Meta webhook subscription verification handshake
- `POST /api/webhooks/meta` — Signed Meta leadgen event receiver
- `POST /api/webhooks/resend` — Resend delivery and bounce event receiver

### Authenticated Endpoints
- `GET  /api/auth/me` — Current authenticated user profile
- `POST /api/auth/logout` — Invalidate session and clear cookie
- `GET  /api/meta/pages` — Connected Facebook pages
- `GET  /api/meta/forms` — Lead forms for connected page
- `POST /api/meta/forms` — Update enabled form subscriptions
- `GET  /api/meta/status` — Meta integration status overview
- `GET  /api/meta/sync` — Sync recent Meta leads (Cron or Session authenticated)

### Admin-Only Endpoints
- `POST /api/admin/fcm-token` — Register FCM push notification token
- `GET  /api/admin/submissions` — List, filter, and search form submissions (or export CSV)
- `GET  /api/admin/submissions/:id` — Get single submission details
- `PATCH /api/admin/submissions/:id` — Update submission status or assignee
- `DELETE /api/admin/submissions/:id` — Delete submission
- `GET  /api/admin/users` — List administrative users
- `POST /api/admin/users` — Create new administrative user
- `PATCH /api/admin/users/:id` — Update user details or role
- `PATCH /api/admin/users/:id/toggle-active` — Activate or deactivate user account
- `DELETE /api/admin/users/:id` — Delete user account (with last-admin protection)
- `GET  /api/admin/crm/leads` — Query CRM leads pipeline (or export CSV)
- `GET  /api/admin/crm/leads/:id` — Get single CRM lead details
- `PATCH /api/admin/crm/leads/:id` — Update lead status, notes, or assignee
- `DELETE /api/admin/crm/leads/:id` — Delete CRM lead
- `GET  /api/meta/connect` — Generate Meta OAuth authorization URL
- `POST /api/meta/connect` — Connect Meta via OAuth code or Page Access Token
- `POST /api/meta/disconnect` — Disconnect Page and wipe tokens
- `POST /api/admin/integrations/meta/validate` — Validate Meta token with Graph API
- `POST /api/admin/integrations/meta/token` — Save and encrypt Page Access Token
- `GET  /api/admin/integrations/meta/status` — Sanitized Meta integration status
- `POST /api/admin/integrations/meta/reauthorize` — Flag Meta integration for reauthorization
- `GET  /api/admin/integrations/email/status` — Resend configuration & outbox stats
- `POST /api/admin/integrations/email/configure` — Configure Resend credentials & rules
- `POST /api/admin/integrations/email/test` — Dispatch test verification email
- `POST /api/admin/integrations/email/validate` — Verify Resend API key and DNS records
- `GET  /api/admin/integrations/email/jobs` — View recent outbox jobs
- `DELETE /api/admin/integrations/email/jobs` — Delete single job or clear outbox
- `POST /api/admin/integrations/email/retry` — Manually retry eligible queued jobs

---

## 7. Migration Guarantee

The original Next.js project located in `stackfyra-website/` has been preserved without any modifications (`git status` clean). All backend services run independently in this repository with identical database models, endpoints, and security contracts.
