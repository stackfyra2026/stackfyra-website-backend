import { describe, it, expect } from 'vitest';
import {
  encryptToken,
  decryptToken,
  maskSecret,
} from './encryption.util.js';

describe('EncryptionUtil', () => {
  describe('AES-256-GCM Authenticated Encryption', () => {
    it('should correctly encrypt and decrypt a plaintext token roundtrip', () => {
      const originalSecret = 're_test_key_secret_1234567890abcdefg';
      const enc = encryptToken(originalSecret, 'email');

      expect(enc).toBeDefined();
      expect(enc.encrypted).toBeDefined();
      expect(enc.iv).toBeDefined();
      expect(enc.tag).toBeDefined();
      expect(enc.encrypted).not.toBe(originalSecret);

      const decrypted = decryptToken(enc.encrypted, enc.iv, enc.tag, 'email');
      expect(decrypted).toBe(originalSecret);
    });

    it('should support Meta context encryption and decryption', () => {
      const pageToken = 'EAAGm0PX4ZBqwBAP123456789MetaToken';
      const enc = encryptToken(pageToken, 'meta');

      const decrypted = decryptToken(enc.encrypted, enc.iv, enc.tag, 'meta');
      expect(decrypted).toBe(pageToken);
    });

    it('should return empty string if ciphertext or auth tag is corrupted', () => {
      const enc = encryptToken('secret_token', 'meta');
      const corruptedTag = '0'.repeat(enc.tag.length);
      const decrypted = decryptToken(enc.encrypted, enc.iv, corruptedTag, 'meta');
      expect(decrypted).toBe('');
    });

    it('should return empty string when decryption arguments are missing', () => {
      expect(decryptToken('', '', '', 'meta')).toBe('');
    });
  });

  describe('maskSecret', () => {
    it('should properly mask sensitive credentials while showing prefix and suffix', () => {
      const key = 're_live_secret1234567890abcdef';
      const masked = maskSecret(key);

      expect(masked).toBeDefined();
      expect(masked.startsWith('re_l')).toBe(true);
      expect(masked.endsWith('cdef')).toBe(true);
      expect(masked).toContain('••••');
      expect(masked).not.toBe(key);
    });

    it('should return •••••••••••• for short inputs', () => {
      expect(maskSecret('')).toBe('');
      expect(maskSecret('abc')).toBe('••••••••••••');
    });
  });
});
