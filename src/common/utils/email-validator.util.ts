/**
 * Normalizes an email address by trimming whitespace and converting to lowercase.
 */
export function normalizeEmail(email?: string): string {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Validates that an email address strictly belongs to the @stackfyra.com domain.
 * Examples:
 * - admin@stackfyra.com -> true
 * - sales@stackfyra.com -> true
 * - user@gmail.com -> false
 * - user@stackfyra.com.example.org -> false
 */
export function isValidStackfyraEmail(email?: string): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  // Validate format and ensure domain part is strictly 'stackfyra.com'
  const emailRegex = /^[a-zA-Z0-9._%+-]+@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/;
  const match = normalized.match(emailRegex);
  if (!match) return false;

  const domain = match[1];
  return domain === 'stackfyra.com';
}

export const isStackfyraCorporateEmail = isValidStackfyraEmail;

export function validateStackfyraCorporateEmail(email?: string): string {
  const normalized = normalizeEmail(email);
  if (!isStackfyraCorporateEmail(normalized)) {
    throw new Error('Registration is restricted to official @stackfyra.com corporate email addresses.');
  }
  return normalized;
}
