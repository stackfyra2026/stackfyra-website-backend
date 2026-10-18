import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import { UserRole } from '../../database/schemas/user.schema.js';

describe('AuthService', () => {
  let authService: AuthService;
  let mockUserModel: any;
  let mockOtpModel: any;
  let mockJwtService: any;
  let mockEmailService: any;

  beforeEach(() => {
    mockUserModel = {
      findOne: vi.fn(),
      countDocuments: vi.fn(),
      create: vi.fn(),
    };
    mockOtpModel = {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findOne: vi.fn(),
    };
    mockJwtService = {
      sign: vi.fn().mockReturnValue('mock_jwt_token_xyz'),
      verify: vi.fn(),
    };
    mockEmailService = {
      sendPasswordResetOtpEmail: vi.fn().mockResolvedValue({ success: true }),
    };

    authService = new AuthService(
      mockUserModel,
      mockOtpModel,
      mockJwtService,
      mockEmailService,
    );
  });

  describe('register', () => {
    it('should reject email from non-@stackfyra.com domain', async () => {
      await expect(
        authService.register({
          name: 'Jane Doe',
          email: 'jane@external.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should register user as ADMIN and hash password', async () => {
      mockUserModel.findOne.mockResolvedValue(null);
      mockUserModel.create.mockImplementation(async (doc: any) => ({
        _id: 'user_123',
        ...doc,
      }));

      const result = await authService.register({
        name: 'Jane Admin',
        email: 'jane@stackfyra.com',
        password: 'Password123!',
      });

      expect(result.success).toBe(true);
      expect(result.user.email).toBe('jane@stackfyra.com');
      expect(result.user.role).toBe(UserRole.ADMIN);
      expect(mockUserModel.create).toHaveBeenCalled();

      const createdDoc = mockUserModel.create.mock.calls[0][0];
      expect(createdDoc.role).toBe(UserRole.ADMIN);
      expect(createdDoc.passwordHash).not.toBe('Password123!');
      expect(await bcrypt.compare('Password123!', createdDoc.passwordHash)).toBe(true);
    });

    it('should reject if email already registered', async () => {
      mockUserModel.findOne.mockResolvedValue({ _id: 'existing_id' });

      await expect(
        authService.register({
          name: 'Duplicate',
          email: 'dup@stackfyra.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow('An account with this email address already exists.');
    });
  });

  describe('login', () => {
    it('should authenticate user with valid credentials', async () => {
      const hashedPassword = await bcrypt.hash('CorrectPass123', 10);
      mockUserModel.findOne.mockResolvedValue({
        _id: 'user_789',
        email: 'user@stackfyra.com',
        name: 'Valid User',
        role: UserRole.ADMIN,
        isActive: true,
        passwordHash: hashedPassword,
        save: vi.fn().mockResolvedValue(true),
      });

      const result = await authService.login({
        email: 'user@stackfyra.com',
        password: 'CorrectPass123',
      });

      expect(result.token).toBe('mock_jwt_token_xyz');
      expect(result.user.email).toBe('user@stackfyra.com');
    });

    it('should reject invalid password', async () => {
      const hashedPassword = await bcrypt.hash('CorrectPass123', 10);
      mockUserModel.findOne.mockResolvedValue({
        _id: 'user_789',
        email: 'user@stackfyra.com',
        passwordHash: hashedPassword,
        isActive: true,
      });

      await expect(
        authService.login({
          email: 'user@stackfyra.com',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject non-existent user', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'nonexistent@stackfyra.com',
          password: 'AnyPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
