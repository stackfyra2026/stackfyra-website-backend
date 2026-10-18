# Authentication & Authorization Architecture

## 1. Domain Restriction Rule

All authentication and recovery operations strictly enforce the `@stackfyra.com` corporate email restriction.
- Any attempt to register, authenticate, request OTP, or update email with an address outside `stackfyra.com` is rejected with `400 Bad Request`.
- Normalization: Input emails are lowercased and whitespace trimmed. Subdomains (e.g. `user@sub.stackfyra.com`) and spoofing patterns (`hacker@stackfyra.com.attacker.com`) are rejected.

---

## 2. Password Hashing

- Algorithm: `bcryptjs`
- Salt rounds: `10`
- Password complexity: Minimum 8 characters.

---

## 3. JWT and Session Management

- Token secret: `JWT_SECRET` (configured via environment variable).
- Token expiry: `JWT_EXPIRES_IN` (defaults to `7d`).
- Payload structure:
  ```json
  {
    "userId": "651a2b3c4d5e6f7a8b9c0d1e",
    "email": "admin@stackfyra.com",
    "role": "ADMIN"
  }
  ```
- Cookie extraction:
  - Cookie name: `stackfyra_session`
  - Flags: `httpOnly: true`, `secure: (NODE_ENV === 'production')`, `sameSite: 'lax'`, `path: '/'`, `maxAge: 7 * 24 * 60 * 60 * 1000`.
- Dual token support:
  - Checks `Authorization: Bearer <token>` header first.
  - Falls back to `stackfyra_session` cookie if no header is present.

---

## 4. OTP Password Recovery Flow

1. **Request OTP (`POST /api/auth/forgot-password`)**:
   - Validates `@stackfyra.com` domain.
   - Deletes active pending OTPs for the user.
   - Generates 6-digit random code (`100000`–`999999`).
   - Hashes OTP with bcrypt and stores in `PasswordResetOtp` with 5-minute TTL.
   - Dispatches branded OTP email via Resend.
   - Returns uniform success response to prevent email enumeration.

2. **Verify OTP (`POST /api/auth/verify-reset-otp`)**:
   - Compares input code with bcrypt hash.
   - Increments attempts; enforces maximum 3 attempts before record deletion.
   - Generates single-use 32-byte hexadecimal `resetToken` and stores its bcrypt hash on the OTP document.

3. **Reset Password (`POST /api/auth/reset-password`)**:
   - Compares `resetToken` with stored hash.
   - Updates user's `passwordHash`.
   - Purges all OTP documents for that user.

---

## 5. Role-Based Access Control (RBAC)

- Roles: `ADMIN`
- Guards in NestJS:
  - `JwtAuthGuard`: Enforces valid session token and verifies user is active in MongoDB.
  - `RolesGuard`: Enforces role requirements decorated with `@Roles('ADMIN')`.
  - Safety checks on user updates:
    - Admin cannot deactivate their own active session account.
    - Cannot deactivate the last remaining active administrator in the database.
