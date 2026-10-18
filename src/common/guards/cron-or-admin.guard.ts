import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CronOrAdminGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const cronSecret = this.configService.get<string>('CRON_SECRET');
    const authHeader = request.headers['authorization'];
    const isVercelCron = request.headers['x-vercel-cron'] === '1';

    // 1. Check Vercel Cron header
    if (isVercelCron) {
      return true;
    }

    // 2. Check CRON_SECRET Bearer token
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      return true;
    }

    // 3. Check Admin User Session
    const user = request.user;
    if (user && user.role === 'ADMIN') {
      return true;
    }

    throw new UnauthorizedException('Unauthorized access to Meta sync.');
  }
}
