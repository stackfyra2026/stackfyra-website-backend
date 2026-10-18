# External Integrations Architecture

## 1. Meta Facebook & Instagram Lead Ads

### Webhook Verification Handshake
- Method: `GET /api/webhooks/meta`
- Parameters: `hub.mode`, `hub.verify_token`, `hub.challenge`
- Handshake logic:
  - If `hub.mode === "subscribe"` and `hub.verify_token === process.env.META_WEBHOOK_VERIFY_TOKEN`, returns `hub.challenge` as plain text (HTTP 200).
  - Otherwise returns `403 Forbidden`.

### Signed Webhook Event Ingest
- Method: `POST /api/webhooks/meta`
- Header: `x-hub-signature-256`
- Verification: HMAC-SHA256 of raw unparsed request body against `META_APP_SECRET` using `crypto.timingSafeEqual`.
- Idempotency: Incoming `leadgen_id` is recorded in `meta_webhook_events` with key `meta_lead_${leadgen_id}`. Duplicate completed events are skipped.
- Lead Retrieval: Fetches lead details from Graph API `v26.0` (`GET /{leadgen_id}`) with `appsecret_proof`.
- Persistence: Upserts into `Lead` collection.
- Notifications: Triggers FCM admin push notification, squad notification email with lead reply-to, and lead confirmation email.

### Token Encryption at Rest
- Algorithm: `AES-256-GCM` authenticated encryption.
- Key Derivation: SHA-256 hash of `META_TOKEN_ENCRYPTION_KEY`, `META_ENCRYPTION_KEY`, or `JWT_SECRET`.
- Nonce: Fresh random 12-byte IV for every encryption call.
- Authentication Tag: Stored alongside ciphertext and IV to verify ciphertext integrity.

### 60-Minute Background Synchronization Scheduler
- Schedule: Runs recurring reconciliation cycle every 60 minutes via `@nestjs/schedule` `Cron`.
- Cycle operations:
  1. Processes pending and retryable failed webhook events with exponential backoff.
  2. Queries Meta Lead Forms directly (`GET /{form-id}/leads`) to recover leads that arrived during downtime.

---

## 2. Resend Email & Durable Outbox System

### Architecture
- Centralized client with API key caching.
- Direct save to `EmailOutbox` before attempting delivery. Lead creation is never blocked or rolled back if email delivery throws.
- Simulation Mode: If `RESEND_API_KEY` is empty or a placeholder (e.g. contains `"example"`), email details are safely logged to console and marked `SENT` without throwing errors.
- Loop Prevention: Cooldown (1 hour) prevents alert flooding if repeated delivery errors occur.
- Notification Rules: Enforces configurable rules (new website lead, meta lead, token expiry, delivery failure).
- Webhook Feedback: `POST /api/webhooks/resend` verifies Svix signature and updates job status to `DELIVERED`, `BOUNCED`, or `FAILED`.
- Auto-retries: Bounded exponential backoff up to 5 attempts.

---

## 3. Firebase Cloud Messaging (FCM) Push Notifications

### Multi-Device Management
- Users register device tokens via `POST /api/admin/fcm-token`.
- Upserts by `deviceId` so each device receives exactly one notification without token duplication.

### Multicast Dispatch
- Uses `getMessaging(adminApp).sendEachForMulticast(message)` to dispatch pushes across all active administrator devices.
- Auto-cleanup: If Firebase returns `messaging/invalid-registration-token` or `messaging/registration-token-not-registered`, expired tokens are automatically `$pull`ed from the database.
