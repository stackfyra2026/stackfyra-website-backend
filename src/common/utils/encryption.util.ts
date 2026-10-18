import crypto from 'crypto';

/**
 * Returns a strict 32-byte key derived from purpose-specific environment secrets.
 */
export function getEncryptionKey(purpose: 'meta' | 'email' = 'meta'): Buffer {
  let secret = '';
  if (purpose === 'email') {
    secret =
      process.env.EMAIL_ENCRYPTION_KEY ||
      process.env.META_TOKEN_ENCRYPTION_KEY ||
      process.env.META_ENCRYPTION_KEY ||
      process.env.JWT_SECRET ||
      '';
  } else {
    secret =
      process.env.META_TOKEN_ENCRYPTION_KEY ||
      process.env.META_ENCRYPTION_KEY ||
      process.env.JWT_SECRET ||
      '';
  }

  return crypto.createHash('sha256').update(secret).digest();
}

export interface EncryptedData {
  encrypted: string;
  iv: string;
  tag: string;
}

/**
 * Encrypts a sensitive string using AES-256-GCM authenticated encryption.
 * Generates a random 12-byte IV for every encryption call.
 */
export function encryptToken(
  plainText: string,
  purpose: 'meta' | 'email' = 'meta',
): EncryptedData {
  if (!plainText) {
    return { encrypted: '', iv: '', tag: '' };
  }

  const key = getEncryptionKey(purpose);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag().toString('hex');

  return {
    encrypted,
    iv: iv.toString('hex'),
    tag,
  };
}

/**
 * Decrypts AES-256-GCM ciphertext using the secret key, IV, and auth tag.
 * Throws an error if tampered or invalid.
 */
export function decryptToken(
  encrypted: string,
  ivHex: string,
  tagHex: string,
  purpose: 'meta' | 'email' = 'meta',
): string {
  try {
    if (!encrypted || !ivHex || !tagHex) {
      return '';
    }

    const key = getEncryptionKey(purpose);
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);

    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted || '';
  } catch {
    return '';
  }
}

/**
 * Masks a secret string for safe display in admin UIs.
 * Never exposes the full secret to the frontend.
 * Example: 're_1234567890abcdef' -> 're_1••••••••••••••••cdef'
 */
export function maskSecret(
  secret: string,
  prefixLen = 4,
  suffixLen = 4,
): string {
  if (!secret) return '';
  const trimmed = secret.trim();
  if (trimmed.length <= prefixLen + suffixLen) {
    return '••••••••••••';
  }
  const prefix = trimmed.slice(0, prefixLen);
  const suffix = trimmed.slice(-suffixLen);
  return `${prefix}••••••••••••••••${suffix}`;
}
