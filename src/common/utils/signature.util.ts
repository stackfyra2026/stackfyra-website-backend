import crypto from 'crypto';

/**
 * Validates Meta's x-hub-signature-256 header against the raw request body using HMAC-SHA256.
 * Uses crypto.timingSafeEqual to prevent timing attacks.
 *
 * @param rawBody - Raw unparsed request body string or Buffer
 * @param signatureHeader - The content of the 'x-hub-signature-256' header (e.g. 'sha256=abcdef...')
 * @param appSecret - Meta App Secret
 * @returns boolean
 */
export function verifyMetaSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  appSecret: string | undefined,
): boolean {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    return false;
  }

  const signature = parts[1];
  if (!signature) {
    return false;
  }

  try {
    const hmac = crypto.createHmac('sha256', appSecret);
    hmac.update(
      typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody,
    );
    const expectedSignature = hmac.digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const receivedBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
  } catch (err) {
    console.error('Meta signature verification error:', err);
    return false;
  }
}
