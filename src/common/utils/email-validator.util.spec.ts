import { describe, it, expect } from 'vitest';
import {
  isStackfyraCorporateEmail,
  validateStackfyraCorporateEmail,
} from './email-validator.util.js';

describe('EmailValidatorUtil', () => {
  describe('isStackfyraCorporateEmail', () => {
    it('should return true for valid corporate @stackfyra.com emails', () => {
      expect(isStackfyraCorporateEmail('admin@stackfyra.com')).toBe(true);
      expect(isStackfyraCorporateEmail('john.doe@stackfyra.com')).toBe(true);
      expect(isStackfyraCorporateEmail('SALES@STACKFYRA.COM')).toBe(true);
      expect(isStackfyraCorporateEmail('  founder@stackfyra.com  ')).toBe(true);
    });

    it('should return false for external or personal email domains', () => {
      expect(isStackfyraCorporateEmail('user@gmail.com')).toBe(false);
      expect(isStackfyraCorporateEmail('admin@yahoo.com')).toBe(false);
      expect(isStackfyraCorporateEmail('attacker@evil-stackfyra.com')).toBe(false);
      expect(isStackfyraCorporateEmail('test@stackfyra.org')).toBe(false);
      expect(isStackfyraCorporateEmail('stackfyra.com')).toBe(false);
      expect(isStackfyraCorporateEmail('')).toBe(false);
      expect(isStackfyraCorporateEmail(null as any)).toBe(false);
      expect(isStackfyraCorporateEmail(undefined as any)).toBe(false);
    });
  });

  describe('validateStackfyraCorporateEmail', () => {
    it('should normalize and return trimmed lowercase email for valid corporate addresses', () => {
      expect(validateStackfyraCorporateEmail('  USER@STACKFYRA.COM ')).toBe('user@stackfyra.com');
    });

    it('should throw BadRequestException when email is not @stackfyra.com', () => {
      expect(() => validateStackfyraCorporateEmail('user@gmail.com')).toThrowError(
        'Registration is restricted to official @stackfyra.com corporate email addresses.',
      );
    });
  });
});
