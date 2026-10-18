import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyMetaSignature } from './signature.util.js';

describe('SignatureUtil', () => {
  const testSecret = 'my_super_secret_meta_app_secret_123';
  const testPayload = JSON.stringify({
    object: 'page',
    entry: [
      {
        id: '123456789',
        changes: [{ field: 'leadgen', value: { leadgen_id: '987654321' } }],
      },
    ],
  });

  function generateValidHeader(payload: string, secret: string) {
    const hash = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return `sha256=${hash}`;
  }

  it('should verify a valid HMAC-SHA256 signature', () => {
    const validHeader = generateValidHeader(testPayload, testSecret);
    const result = verifyMetaSignature(testPayload, validHeader, testSecret);
    expect(result).toBe(true);
  });

  it('should reject when payload is tampered with', () => {
    const validHeader = generateValidHeader(testPayload, testSecret);
    const tamperedPayload = testPayload + ' ';
    const result = verifyMetaSignature(tamperedPayload, validHeader, testSecret);
    expect(result).toBe(false);
  });

  it('should reject when signature hash is invalid', () => {
    const header = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
    const result = verifyMetaSignature(testPayload, header, testSecret);
    expect(result).toBe(false);
  });

  it('should reject when header is missing or malformed', () => {
    expect(verifyMetaSignature(testPayload, null, testSecret)).toBe(false);
    expect(verifyMetaSignature(testPayload, undefined, testSecret)).toBe(false);
    expect(verifyMetaSignature(testPayload, 'invalid_header', testSecret)).toBe(false);
    expect(verifyMetaSignature(testPayload, 'sha1=123', testSecret)).toBe(false);
  });
});
