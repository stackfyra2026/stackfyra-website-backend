import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Request } from 'express';
import { User, UserDocument } from '../../database/schemas/user.schema.js';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // 1. Authorization header (Bearer token)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // 2. HTTP-only Cookie 'stackfyra_session'
        (req: Request) => {
          let token = null;
          if (req && req.cookies) {
            token = req.cookies['stackfyra_session'];
          }
          return token;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ||
        'stackfyra_super_secret_jwt_key_change_in_production_2026',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload || !payload.userId) {
      throw new UnauthorizedException('Invalid token payload.');
    }

    const user = await this.userModel.findById(payload.userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account not found or deactivated.');
    }

    return user;
  }
}
