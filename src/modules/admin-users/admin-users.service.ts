import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, UserDocument } from '../../database/schemas/user.schema.js';
import {
  isValidStackfyraEmail,
  normalizeEmail,
} from '../../common/utils/email-validator.util.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async findAll(pageStr = '1', limitStr = '10', q = ''): Promise<any> {
    const page = Math.max(1, parseInt(pageStr, 10));
    const limit = Math.max(1, Math.min(100, parseInt(limitStr, 10)));
    const filter: any = {};

    if (q && q.trim()) {
      filter.$or = [
        { name: { $regex: q.trim(), $options: 'i' } },
        { email: { $regex: q.trim(), $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.userModel
        .find(filter, '-passwordHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.userModel.countDocuments(filter),
    ]);

    return {
      success: true,
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async create(adminUserId: string, dto: CreateUserDto): Promise<any> {
    if (!dto.name || dto.name.trim().length < 2) {
      throw new BadRequestException('Name must be at least 2 characters.');
    }

    const normalizedEmail = normalizeEmail(dto.email);
    if (!isValidStackfyraEmail(normalizedEmail)) {
      throw new BadRequestException(
        'Access denied. Accounts can only be created for @stackfyra.com email addresses.',
      );
    }

    if (!dto.password || dto.password.length < 8) {
      throw new BadRequestException(
        'Password must be at least 8 characters.',
      );
    }

    const existing = await this.userModel.findOne({ email: normalizedEmail });
    if (existing) {
      throw new BadRequestException('An account with this email already exists.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(dto.password, salt);

    const user = await this.userModel.create({
      name: dto.name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      createdBy: adminUserId as any,
    });

    return {
      success: true,
      message: 'User account created successfully.',
      user: {
        id: (user as any)._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    };
  }

  async findOne(id: string): Promise<any> {
    const user = await this.userModel.findById(id, '-passwordHash').lean();
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return { success: true, user };
  }

  async updateProfile(id: string, dto: UpdateUserDto): Promise<any> {
    const user = await this.userModel.findById(id);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (dto.name && dto.name.trim().length >= 2) {
      user.name = dto.name.trim();
    }

    if (dto.email) {
      const normalizedEmail = normalizeEmail(dto.email);
      if (!isValidStackfyraEmail(normalizedEmail)) {
        throw new BadRequestException(
          'Access denied. Email address must belong to @stackfyra.com.',
        );
      }

      const existing = await this.userModel.findOne({
        email: normalizedEmail,
        _id: { $ne: id },
      });
      if (existing) {
        throw new BadRequestException('Email address is already in use.');
      }

      user.email = normalizedEmail;
    }

    await user.save();

    return {
      success: true,
      message: 'User profile updated.',
      user: {
        id: (user as any)._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
      },
    };
  }

  async updateRole(id: string, dto: UpdateUserRoleDto): Promise<any> {
    const targetUser = await this.userModel.findById(id);
    if (!targetUser) {
      throw new NotFoundException('User not found.');
    }

    targetUser.role = 'ADMIN';
    await targetUser.save();

    return {
      success: true,
      message: `User role updated to ${targetUser.role}.`,
      user: {
        id: (targetUser as any)._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
      },
    };
  }

  async updateStatus(
    currentAdminId: string,
    id: string,
    dto: UpdateUserStatusDto,
  ): Promise<any> {
    const targetUser = await this.userModel.findById(id);
    if (!targetUser) {
      throw new NotFoundException('User not found.');
    }

    // Safety check 1: Prevent deactivating yourself
    if (currentAdminId === (targetUser as any)._id.toString() && !dto.isActive) {
      throw new BadRequestException(
        'You cannot deactivate your own active admin account.',
      );
    }

    // Safety check 2: Prevent deactivating the last active administrator
    if (targetUser.role === 'ADMIN' && !dto.isActive) {
      const activeAdminCount = await this.userModel.countDocuments({
        role: 'ADMIN',
        isActive: true,
      });
      if (activeAdminCount <= 1) {
        throw new BadRequestException(
          'Action blocked: Cannot deactivate the last active administrator account.',
        );
      }
    }

    targetUser.isActive = dto.isActive;
    await targetUser.save();

    return {
      success: true,
      message: `User status changed to ${dto.isActive ? 'ACTIVE' : 'INACTIVE'}.`,
      user: {
        id: (targetUser as any)._id,
        name: targetUser.name,
        email: targetUser.email,
        isActive: targetUser.isActive,
      },
    };
  }
}
