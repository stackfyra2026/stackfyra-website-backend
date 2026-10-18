import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User, UserDocument } from '../../database/schemas/user.schema.js';
import {
  PasswordResetOtp,
  PasswordResetOtpDocument,
} from '../../database/schemas/password-reset-otp.schema.js';
import {
  isValidStackfyraEmail,
  normalizeEmail,
} from '../../common/utils/email-validator.util.js';
import { EmailService } from '../email/email.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(PasswordResetOtp.name)
    private otpModel: Model<PasswordResetOtpDocument>,
    private jwtService: JwtService,
    private emailService: EmailService,
  ) {}

  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async login(dto: LoginDto): Promise<{
    success: boolean;
    token: string;
    user: {
      id: any;
      name: string;
      email: string;
      role: string;
      lastLoginAt?: Date;
    };
  }> {
    const normalizedEmail = normalizeEmail(dto.email);
    if (!isValidStackfyraEmail(normalizedEmail)) {
      throw new BadRequestException(
        'Access denied. Login is strictly restricted to @stackfyra.com email addresses.',
      );
    }

    if (!dto.password) {
      throw new BadRequestException('Password is required.');
    }

    const user = await this.userModel.findOne({ email: normalizedEmail });
    if (!user) {
      throw new UnauthorizedException('Invalid email address or password.');
    }

    if (!user.isActive) {
      throw new ForbiddenException(
        'Your account has been deactivated. Please contact an admin.',
      );
    }

    const isMatch = await this.comparePassword(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email address or password.');
    }

    user.lastLoginAt = new Date();
    await user.save();

    const token = this.jwtService.sign({
      userId: (user as any)._id.toString(),
      email: user.email,
      role: user.role,
    });

    return {
      success: true,
      token,
      user: {
        id: (user as any)._id,
        name: user.name,
        email: user.email,
        role: user.role,
        lastLoginAt: user.lastLoginAt,
      },
    };
  }

  async register(dto: RegisterDto): Promise<{
    success: boolean;
    message: string;
    user: {
      id: any;
      name: string;
      email: string;
      role: string;
    };
  }> {
    if (!dto.name || dto.name.trim().length < 2) {
      throw new BadRequestException('Name must be at least 2 characters long.');
    }

    const normalizedEmail = normalizeEmail(dto.email);
    if (!isValidStackfyraEmail(normalizedEmail)) {
      throw new BadRequestException(
        'Access denied. Registration is restricted to @stackfyra.com email addresses.',
      );
    }

    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException(
        'Password must be at least 8 characters long.',
      );
    }

    const existingUser = await this.userModel.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new BadRequestException(
        'An account with this email address already exists.',
      );
    }

    const passwordHash = await this.hashPassword(dto.password);
    const user: any = await this.userModel.create({
      name: dto.name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    });

    return {
      success: true,
      message: 'Account created successfully.',
      user: {
        id: (user as any)._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    };
  }

  async getMe(userId: string): Promise<{
    success: boolean;
    user: {
      id: any;
      name: string;
      email: string;
      role: string;
      isActive: boolean;
      lastLoginAt?: Date;
      createdAt?: Date;
    };
  }> {
    const user = await this.userModel.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User unauthorized or deactivated.');
    }

    return {
      success: true,
      user: {
        id: (user as any)._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{
    success: boolean;
    message: string;
  }> {
    const normalizedEmail = normalizeEmail(dto.email);
    if (!isValidStackfyraEmail(normalizedEmail)) {
      throw new BadRequestException(
        'Access denied. Password recovery is strictly restricted to @stackfyra.com email addresses.',
      );
    }

    const successMessage = {
      success: true,
      message:
        'If an active @stackfyra.com account exists for this email address, a 6-digit OTP code has been sent.',
    };

    const user = await this.userModel.findOne({
      email: normalizedEmail,
      isActive: true,
    });
    if (!user) {
      return successMessage;
    }

    // Invalidate existing active OTPs for this user
    await this.otpModel.deleteMany({ userId: (user as any)._id });

    // Generate cryptographically secure 6-digit OTP
    const rawOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await this.hashPassword(rawOtp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes TTL

    await this.otpModel.create({
      userId: (user as any)._id,
      email: user.email,
      otpHash,
      expiresAt,
      attempts: 0,
    });

    try {
      await this.emailService.sendOtpEmail(user.email, rawOtp);
    } catch (emailErr) {
      this.logger.error('Non-fatal error sending OTP email: ' + emailErr);
    }

    return successMessage;
  }

  async verifyResetOtp(dto: VerifyResetOtpDto): Promise<{
    success: boolean;
    message: string;
    resetToken: string;
  }> {
    const normalizedEmail = normalizeEmail(dto.email);
    if (!isValidStackfyraEmail(normalizedEmail)) {
      throw new BadRequestException(
        'Access denied. Verification is strictly restricted to @stackfyra.com email addresses.',
      );
    }

    if (!dto.otp || dto.otp.trim().length !== 6) {
      throw new BadRequestException('A valid 6-digit OTP code is required.');
    }

    const otpRecord = await this.otpModel
      .findOne({
        email: normalizedEmail,
        consumedAt: null,
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: -1 });

    if (!otpRecord) {
      throw new BadRequestException(
        'Invalid or expired OTP code. Please request a new one.',
      );
    }

    if (otpRecord.attempts >= 3) {
      await this.otpModel.deleteOne({ _id: (otpRecord as any)._id });
      throw new HttpException(
        'Maximum verification attempts exceeded. Please request a new OTP code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    otpRecord.attempts += 1;
    const isMatch = await this.comparePassword(dto.otp.trim(), otpRecord.otpHash);
    if (!isMatch) {
      await otpRecord.save();
      throw new BadRequestException(
        `Invalid OTP code. ${3 - otpRecord.attempts} attempt(s) remaining.`,
      );
    }

    // Generate single-use reset authorization token
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = await this.hashPassword(rawResetToken);

    otpRecord.resetTokenHash = resetTokenHash;
    await otpRecord.save();

    return {
      success: true,
      message: 'OTP verified successfully.',
      resetToken: rawResetToken,
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{
    success: boolean;
    message: string;
  }> {
    const normalizedEmail = normalizeEmail(dto.email);
    if (!isValidStackfyraEmail(normalizedEmail)) {
      throw new BadRequestException(
        'Access denied. Password reset is strictly restricted to @stackfyra.com email addresses.',
      );
    }

    if (!dto.resetToken) {
      throw new BadRequestException('Reset token is required.');
    }

    if (!dto.newPassword || dto.newPassword.length < 8) {
      throw new BadRequestException(
        'New password must be at least 8 characters long.',
      );
    }

    const otpRecords = await this.otpModel.find({
      email: normalizedEmail,
      consumedAt: null,
      resetTokenHash: { $ne: null },
      expiresAt: { $gt: new Date() },
    });

    let validRecord = null;
    for (const record of otpRecords) {
      if (
        record.resetTokenHash &&
        (await this.comparePassword(dto.resetToken, record.resetTokenHash))
      ) {
        validRecord = record;
        break;
      }
    }

    if (!validRecord) {
      throw new BadRequestException(
        'Invalid or expired password reset authorization.',
      );
    }

    const user = await this.userModel.findById(validRecord.userId);
    if (!user || !user.isActive) {
      throw new NotFoundException('User account not found or inactive.');
    }

    user.passwordHash = await this.hashPassword(dto.newPassword);
    await user.save();

    await this.otpModel.deleteMany({ userId: (user as any)._id });

    return {
      success: true,
      message:
        'Password reset successfully. You can now log in with your new password.',
    };
  }
}
